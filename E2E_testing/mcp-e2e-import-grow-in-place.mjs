import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMcpE2eSandboxPlan, initializeMcpE2eSandbox } from "./_helpers/mcp-e2e-sandbox.mjs";
import { resolveMcpE2eCommand } from "./_helpers/resolve-mcp-e2e-command.mjs";
import { runMcpHarness } from "./_helpers/mcp-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const fixturePath = join(scriptDir, "NoConformidades.accdb");
const projectId = "noconformidades-f16-import-grow-e2e";
const moduleName = "Test_F16GrowImport";
const timeoutMs = Number(process.env.DYSFLOW_E2E_TIMEOUT_MS ?? 30000);
const closeWatchdogMs = Number(process.env.DYSFLOW_E2E_CLOSE_WATCHDOG_MS ?? 5000);
const password = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD;
const requireAccessE2e = /^(1|true|yes)$/i.test(process.env.DYSFLOW_REQUIRE_ACCESS_E2E ?? "");

function skipOrFail(message) {
  const prefix = requireAccessE2e ? "required fixture missing" : "skipped";
  const output = `[f16-import-grow] ${prefix}: ${message}`;
  if (requireAccessE2e) {
    console.error(output);
    process.exit(1);
  }
  console.log(output);
  process.exit(0);
}

function makeModule(name, lineCount) {
  const filler = Array.from(
    { length: lineCount },
    (_, index) => `    Debug.Print "line ${index + 1}"`,
  );
  return [
    `Attribute VB_Name = "${name}"`,
    "Option Explicit",
    "Public Sub Sanity()",
    ...filler,
    "End Sub",
  ].join("\r\n");
}

function toolPayload(message) {
  const text = message?.result?.content?.map((item) => item.text ?? "").join("\n") ?? "";
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function firstModule(payload) {
  const result = payload?.result ?? payload;
  if (result?.module && result?.status) return result;
  const modules = Array.isArray(result) ? result : (result?.modules ?? []);
  return modules[0];
}

if (process.platform !== "win32") {
  skipOrFail("Windows + Access required.");
}

if (!existsSync(fixturePath)) {
  skipOrFail(`missing fixture ${fixturePath}`);
}

if (!password) {
  skipOrFail("set ACCESS_VBA_PASSWORD for the fixture before running.");
}

const resolvedCommand = resolveMcpE2eCommand({ env: process.env, repoRoot });
if (!resolvedCommand.ok) {
  console.error(`[f16-import-grow] ${resolvedCommand.code}: ${resolvedCommand.message}`);
  process.exit(1);
}
const cliCommand = resolvedCommand.command;
process.env.DYSFLOW_HOME = join(repoRoot, "test-runtime");

const sandboxPlan = buildMcpE2eSandboxPlan({ scriptDir });
const tempRoot = sandboxPlan.sandbox.root;
const accessPath = sandboxPlan.sandbox.accessPath;
const destinationRoot = sandboxPlan.sandbox.destinationRoot;
const modulesRoot = join(destinationRoot, "modules");
const modulePath = join(modulesRoot, `${moduleName}.bas`);

function spawnMcp() {
  return spawn(cliCommand, ["mcp"], {
    cwd: tempRoot,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ACCESS_VBA_PASSWORD: password,
      DYSFLOW_ACCESS_PASSWORD: password,
    },
  });
}

async function callTool(name, args) {
  const child = spawnMcp();
  return await runMcpHarness({
    child,
    requestId: 2,
    method: "tools/call",
    params: { name, arguments: args },
    timeoutMs,
    closeWatchdogMs,
  });
}

async function callImport(verbose = false) {
  return await callTool("import_modules", {
    accessPath,
    destinationRoot,
    moduleNames: [moduleName],
    dryRun: false,
    verbose,
  });
}

try {
  await rm(tempRoot, { recursive: true, force: true });
  await initializeMcpE2eSandbox(sandboxPlan, { projectId });
  // The sandbox helper always writes a `backendPath` into project.json. This
  // script does not exercise the backend, so strip the field — otherwise the
  // write-ready gate trips with "Configured backendPath does not exist" and
  // aborts before import_modules runs (#1001).
  {
    const projectJsonPath = join(tempRoot, ".dysflow", "project.json");
    const projectConfig = JSON.parse(await readFile(projectJsonPath, "utf8"));
    delete projectConfig.backendPath;
    await writeFile(projectJsonPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf8");
  }
  await cp(fixturePath, accessPath);
  await mkdir(modulesRoot, { recursive: true });

  const capabilityResult = await callTool("get_capabilities", { projectId });
  const capabilityPayload = toolPayload(capabilityResult.response);
  const snapshot = capabilityPayload?.snapshot ?? capabilityPayload;
  const config = snapshot?.projectConfig;
  const sandboxReady =
    !capabilityResult.isError &&
    typeof snapshot?.adapterVersion === "string" &&
    typeof snapshot?.toolsVisible === "number" &&
    snapshot?.writesProcess?.enabled === true &&
    snapshot?.writesProject?.allowWrites === true &&
    config?.status === "valid" &&
    config?.writeReady === true &&
    config?.projectId === projectId &&
    typeof config?.projectRoot === "string" &&
    resolve(config.projectRoot).toLowerCase() === resolve(tempRoot).toLowerCase();
  if (!sandboxReady) {
    throw new Error(`Sandbox capability preflight failed. snapshot=${JSON.stringify(snapshot)}`);
  }

  await writeFile(modulePath, makeModule(moduleName, 2), "utf8");
  const initial = await callImport(false);
  if (initial.isError || firstModule(toolPayload(initial.response))?.status !== "ok") {
    throw new Error(`Initial import failed. text=${initial.text}`);
  }

  await writeFile(modulePath, makeModule(moduleName, 40), "utf8");
  const grown = await callImport(true);
  const entry = firstModule(toolPayload(grown.response));
  if (
    grown.isError ||
    entry?.status !== "ok" ||
    entry?.error?.code === "IMPORT_TRUNCATED" ||
    entry?.verbose?.truncated ||
    entry?.verbose?.mismatchReason != null
  ) {
    throw new Error(`Grow import failed/truncated. entry=${JSON.stringify(entry)} text=${grown.text}`);
  }

  console.log("[f16-import-grow] passed: larger source imported through MCP without IMPORT_TRUNCATED.");
} finally {
  if (!process.env.DYSFLOW_E2E_PRESERVE_SANDBOX) {
    await rm(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`[f16-import-grow] sandbox preserved: ${tempRoot}`);
  }
}
