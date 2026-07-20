import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMcpE2eSandboxPlan, initializeMcpE2eSandbox } from "./_helpers/mcp-e2e-sandbox.mjs";
import { runMcpHarness } from "./_helpers/mcp-harness.mjs";
import { resolveMcpE2eCommand } from "./_helpers/resolve-mcp-e2e-command.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const fixtureAccess = join(scriptDir, "NoConformidades.accdb");
const fixtureBackend = join(scriptDir, "NoConformidades_Datos.accdb");
const fixtureSource = join(scriptDir, "src");
const fixtureClass = join(fixtureSource, "classes", "WithEventsFixture.cls");
const projectId = "noconformidades-i1007-withevents-e2e";
const moduleName = "WithEventsFixture";
const timeoutMs = Number(process.env.DYSFLOW_E2E_TIMEOUT_MS ?? 180000);
const closeWatchdogMs = Number(process.env.DYSFLOW_E2E_CLOSE_WATCHDOG_MS ?? 5000);
const password = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD ?? process.env.DYSFLOW_BACKEND_PASSWORD;
const requireAccessE2e = /^(1|true|yes)$/i.test(process.env.DYSFLOW_REQUIRE_ACCESS_E2E ?? "");

function skipOrFail(message) {
  const output = `[i1007-withevents-import] ${requireAccessE2e ? "required fixture missing" : "skipped"}: ${message}`;
  if (requireAccessE2e) {
    console.error(output);
    process.exit(1);
  }
  console.log(output);
  process.exit(0);
}

function parseEmbeddedDysflowResult(text) {
  const marker = "DYSFLOW_RESULT ";
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = markerIndex + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function toolPayload(result) {
  const content = result?.response?.result?.content ?? result?.result?.content;
  const text = Array.isArray(content)
    ? content.map((item) => item?.text ?? "").join("\n")
    : String(result?.text ?? "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return parseEmbeddedDysflowResult(text);
  }
}

function firstModule(payload) {
  const result = payload?.result ?? payload;
  if (result?.module && result?.status) return result;
  const modules = Array.isArray(result) ? result : (result?.modules ?? []);
  return modules[0];
}

if (process.platform !== "win32") skipOrFail("Windows + Access required.");
if (!existsSync(fixtureAccess) || !existsSync(fixtureBackend)) {
  skipOrFail("missing NoConformidades.accdb / NoConformidades_Datos.accdb fixture in E2E_testing/.");
}
if (!existsSync(fixtureClass)) skipOrFail(`missing fixture ${fixtureClass}`);
if (!password) skipOrFail("set ACCESS_VBA_PASSWORD for the fixture before running.");

const resolvedCommand = resolveMcpE2eCommand({ env: process.env, repoRoot });
if (!resolvedCommand.ok) skipOrFail(`${resolvedCommand.code}: ${resolvedCommand.message}`);
const cliCommand = resolvedCommand.command;
process.env.DYSFLOW_HOME = join(repoRoot, "test-runtime");

const sandboxPlan = buildMcpE2eSandboxPlan({ scriptDir });
const tempRoot = sandboxPlan.sandbox.root;
const accessPath = sandboxPlan.sandbox.accessPath;
const backendPath = sandboxPlan.sandbox.backendPath;
const destinationRoot = sandboxPlan.sandbox.destinationRoot;
const sandboxClass = join(destinationRoot, "classes", `${moduleName}.cls`);
const exportRoot = join(tempRoot, "exports", "issue-1007");
const exportedClass = join(exportRoot, "classes", `${moduleName}.cls`);
const failures = [];

function expect(label, condition, detail) {
  if (condition) {
    console.log(`  [ok]   ${label}`);
    return;
  }
  const rendered = detail === undefined ? "" : ` - ${JSON.stringify(detail).slice(0, 500)}`;
  console.error(`  [FAIL] ${label}${rendered}`);
  failures.push({ label, detail });
}

function spawnMcp() {
  return spawn(cliCommand, ["mcp"], {
    cwd: tempRoot,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ACCESS_VBA_PASSWORD: password,
      DYSFLOW_ACCESS_PASSWORD: password,
      DYSFLOW_BACKEND_PASSWORD: password,
    },
  });
}

async function callTool(name, args) {
  return await runMcpHarness({
    child: spawnMcp(),
    requestId: 2,
    method: "tools/call",
    params: { name, arguments: args },
    timeoutMs,
    closeWatchdogMs,
  });
}

try {
  await rm(tempRoot, { recursive: true, force: true });
  await initializeMcpE2eSandbox(sandboxPlan, { projectId });
  await cp(fixtureAccess, accessPath);
  await cp(fixtureBackend, backendPath);
  await cp(fixtureSource, destinationRoot, { recursive: true });
  await mkdir(exportRoot, { recursive: true });

  const fixtureText = await readFile(sandboxClass, "utf8");
  const declarations = fixtureText.match(/^Private WithEvents\s+\w+\s+As\s+[^\r\n]+$/gim) ?? [];
  const memberAttributes = fixtureText.match(/^Attribute\s+\w+\.VB_VarHelpID\s*=\s*-1$/gim) ?? [];
  expect("fixture has at least three Private WithEvents declarations", declarations.length >= 3, declarations);
  expect("fixture has a member-level VB_VarHelpID attribute per WithEvents declaration", memberAttributes.length === declarations.length, memberAttributes);

  const capabilityResult = await callTool("get_capabilities", { projectId });
  const capabilityPayload = toolPayload(capabilityResult);
  const snapshot = capabilityPayload?.snapshot ?? capabilityPayload;
  const config = snapshot?.projectConfig;
  const sandboxReady =
    !capabilityResult.isError &&
    typeof snapshot?.adapterVersion === "string" &&
    typeof snapshot?.toolsVisible === "number" &&
    snapshot?.writesProcess?.enabled === true &&
    snapshot?.writesProject?.allowWrites === true &&
    snapshot?.tools?.import_modules?.commitFlag !== undefined &&
    snapshot?.tools?.export_modules?.commitFlag !== undefined &&
    config?.status === "valid" &&
    config?.writeReady === true &&
    config?.projectId === projectId &&
    typeof config?.projectRoot === "string" &&
    resolve(config.projectRoot).toLowerCase() === resolve(tempRoot).toLowerCase();
  expect("sandbox capability preflight is write-ready and isolated", sandboxReady, snapshot);
  if (!sandboxReady) throw new Error(`Sandbox capability preflight failed. snapshot=${JSON.stringify(snapshot)}`);

  const seedImport = await callTool("import_modules", {
    projectId,
    moduleNames: [moduleName],
    dryRun: false,
    verbose: true,
  });
  const seedEntry = firstModule(toolPayload(seedImport));
  expect("seed class import succeeds", !seedImport.isError && seedEntry?.status === "ok", {
    entry: seedEntry,
    text: seedImport.text,
    stderr: seedImport.stderr?.slice(-2000),
  });
  if (seedImport.isError || seedEntry?.status !== "ok") throw new Error(`Seed import failed. text=${seedImport.text}`);

  await writeFile(sandboxClass, fixtureText, "utf8");
  const importResult = await callTool("import_modules", {
    projectId,
    moduleNames: [moduleName],
    dryRun: false,
    verbose: true,
  });
  const importPayload = toolPayload(importResult);
  const importEntry = firstModule(importPayload);
  if (!importEntry) console.log(`[i1007-withevents-import] raw import payload: ${JSON.stringify(importPayload)}`);
  console.log(`[i1007-withevents-import] import envelope: ${JSON.stringify({
    status: importEntry?.status,
    fallbackUsed: importEntry?.fallbackUsed,
    fallbackReason: importEntry?.fallbackReason,
    errorCode: importEntry?.error?.code ?? null,
  })}`);
  expect("WithEvents import MCP call succeeds", !importResult.isError && !importResult.timedOut, {
    text: importResult.text,
    stderr: importResult.stderr?.slice(-2000),
  });
  expect("WithEvents per-module status is ok", importEntry?.status === "ok", importEntry);
  expect("F16 AddFromString fallback is skipped", importEntry?.fallbackUsed === false, importEntry);
  expect("skipped fallback has no fallback reason", importEntry?.fallbackReason == null, importEntry);
  expect("WithEvents import does not report IMPORT_TRUNCATED", importEntry?.error?.code !== "IMPORT_TRUNCATED", importEntry);

  const exportResult = await callTool("export_modules", {
    projectId,
    moduleNames: [moduleName],
    exportPath: exportRoot,
    apply: true,
  });
  expect("WithEvents re-export MCP call succeeds", !exportResult.isError && !exportResult.timedOut, {
    text: exportResult.text,
    stderr: exportResult.stderr?.slice(-2000),
  });

  let exportedText = "";
  try {
    exportedText = await readFile(exportedClass, "utf8");
  } catch (error) {
    expect("WithEvents re-export creates the class source", false, String(error));
  }
  for (const attribute of [
    "Attribute m_Application.VB_VarHelpID = -1",
    "Attribute m_Form.VB_VarHelpID = -1",
    "Attribute m_Report.VB_VarHelpID = -1",
  ]) {
    expect(`re-export preserves ${attribute}`, exportedText.includes(attribute), exportedText);
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} assertion(s) failed: ${failures.map(({ label }) => label).join(", ")}`);
  }

  console.log("[i1007-withevents-import] all assertions passed.");
} finally {
  if (process.env.DYSFLOW_E2E_PRESERVE_SANDBOX) {
    console.log(`[i1007-withevents-import] sandbox preserved: ${tempRoot}`);
  } else {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
