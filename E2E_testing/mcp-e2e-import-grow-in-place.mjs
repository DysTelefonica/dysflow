import { spawn } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMcpE2eCommand } from "./_helpers/resolve-mcp-e2e-command.mjs";
import { runMcpHarness } from "./_helpers/mcp-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const fixturePath = join(scriptDir, "NoConformidades.accdb");
const tempRoot = join(process.env.TEMP ?? process.env.TMP ?? ".", `dysflow-f16-import-grow-${Date.now()}`);
const accessPath = join(tempRoot, "NoConformidades.accdb");
const modulesRoot = join(tempRoot, "modules");
const moduleName = "Test_F16GrowImport";
const timeoutMs = Number(process.env.DYSFLOW_E2E_TIMEOUT_MS ?? 30000);
const closeWatchdogMs = Number(process.env.DYSFLOW_E2E_CLOSE_WATCHDOG_MS ?? 5000);
const password = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD;

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
  const modules = Array.isArray(payload) ? payload : (payload?.modules ?? []);
  return modules[0];
}

if (process.platform !== "win32") {
  console.log("[f16-import-grow] skipped: Windows + Access required.");
  process.exit(0);
}

if (!existsSync(fixturePath)) {
  console.log(`[f16-import-grow] skipped: missing fixture ${fixturePath}`);
  process.exit(0);
}

if (!password) {
  console.log("[f16-import-grow] skipped: set ACCESS_VBA_PASSWORD for the fixture before running.");
  process.exit(0);
}

const resolvedCommand = resolveMcpE2eCommand({ env: process.env, repoRoot });
if (!resolvedCommand.ok) {
  console.error(`[f16-import-grow] ${resolvedCommand.code}: ${resolvedCommand.message}`);
  process.exit(1);
}
const cliCommand = resolvedCommand.command;
process.env.DYSFLOW_HOME = join(repoRoot, "test-runtime");

async function callImport(verbose = false) {
  const child = spawn(cliCommand, ["mcp"], {
    cwd: scriptDir,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ACCESS_VBA_PASSWORD: password,
      DYSFLOW_ACCESS_PASSWORD: password,
    },
  });
  return await runMcpHarness({
    child,
    requestId: 2,
    method: "tools/call",
    params: {
      name: "dysflow_import_modules",
      arguments: {
        accessPath,
        destinationRoot: modulesRoot,
        moduleNames: [moduleName],
        dryRun: false,
        verbose,
      },
    },
    timeoutMs,
    closeWatchdogMs,
  });
}

try {
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(modulesRoot, { recursive: true });
  await cp(fixturePath, accessPath);

  const modulePath = join(modulesRoot, `${moduleName}.bas`);
  await writeFile(modulePath, makeModule(moduleName, 2), "utf8");
  const initial = await callImport(false);
  if (initial.isError || firstModule(toolPayload(initial.response))?.status !== "ok") {
    throw new Error(`Initial import failed. text=${initial.text}`);
  }

  await writeFile(modulePath, makeModule(moduleName, 40), "utf8");
  const grown = await callImport(true);
  const entry = firstModule(toolPayload(grown.response));
  if (grown.isError || entry?.status !== "ok" || entry?.error?.code === "IMPORT_TRUNCATED" || entry?.verbose?.truncated) {
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
