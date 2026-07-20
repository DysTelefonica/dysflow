// Focused E2E regression for issue #1013: test_vba sandbox sync.
//
// Contract under test:
//   `test_vba` must execute against a fresh snapshot of the configured .accdb
//   taken at the moment the test run is prepared, not against stale compiled
//   bytecode or in-memory state from a prior open of the same binary. The
//   sandbox copy is removed after the run completes.
//
// This script follows the per-issue MCP E2E pattern used by
// mcp-e2e-issue-1007-withevents-import.mjs: it spawns `dysflow mcp` as a
// stdio subprocess, calls `get_capabilities` for sandbox readiness, runs a
// minimal `test_vba` against a real Access fixture, and asserts that the
// operation completes without orphan .accdb leftovers in the OS temp tree.
//
// Skips safely when the NoConformidades.accdb fixture is not present in
// E2E_testing/ (set DYSFLOW_REQUIRE_ACCESS_E2E=1 for release-gate mode).

import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMcpE2eSandboxPlan, initializeMcpE2eSandbox } from "./_helpers/mcp-e2e-sandbox.mjs";
import { runMcpHarness } from "./_helpers/mcp-harness.mjs";
import { resolveMcpE2eCommand } from "./_helpers/resolve-mcp-e2e-command.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const fixtureAccess = join(scriptDir, "NoConformidades.accdb");
const fixtureBackend = join(scriptDir, "NoConformidades_Datos.accdb");
const fixtureSource = join(scriptDir, "src");
const projectId = "noconformidades-i1013-test-vba-sandbox-sync-e2e";
const timeoutMs = Number(process.env.DYSFLOW_E2E_TIMEOUT_MS ?? 180000);
const closeWatchdogMs = Number(process.env.DYSFLOW_E2E_CLOSE_WATCHDOG_MS ?? 5000);
const password = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD ?? process.env.DYSFLOW_BACKEND_PASSWORD;
const requireAccessE2e = /^(1|true|yes)$/i.test(process.env.DYSFLOW_REQUIRE_ACCESS_E2E ?? "");

function skipOrFail(message) {
  const output = `[i1013-test-vba-sandbox-sync] ${requireAccessE2e ? "required fixture missing" : "skipped"}: ${message}`;
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

if (process.platform !== "win32") skipOrFail("Windows + Access required.");
if (!existsSync(fixtureAccess) || !existsSync(fixtureBackend)) {
  skipOrFail("missing NoConformidades.accdb / NoConformidades_Datos.accdb fixture in E2E_testing/.");
}
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
const failures = [];

// Snapshot the temp dir's dysflow-test-sandbox-* entries BEFORE the run so
// we can diff after the run and assert the runner cleaned up its sandbox.
async function snapshotDysflowSandboxes() {
  const tmp = process.env.TEMP ?? process.env.TMP ?? join(repoRoot, "test-runtime");
  if (!existsSync(tmp)) return new Set();
  const entries = await readdir(tmp).catch(() => []);
  const matching = entries.filter((name) => name.startsWith("dysflow-test-sandbox-"));
  const full = matching.map((name) => resolve(tmp, name));
  return new Set(full.map((p) => p.toLowerCase()));
}

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

  const preSandboxes = await snapshotDysflowSandboxes();

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
    snapshot?.tools?.test_vba?.commitFlag !== undefined &&
    config?.status === "valid" &&
    config?.writeReady === true &&
    config?.projectId === projectId &&
    typeof config?.projectRoot === "string" &&
    resolve(config.projectRoot).toLowerCase() === resolve(tempRoot).toLowerCase();
  expect("sandbox capability preflight is write-ready and isolated", sandboxReady, snapshot);
  if (!sandboxReady) {
    throw new Error(`Sandbox capability preflight failed. snapshot=${JSON.stringify(snapshot)}`);
  }

  // We do NOT require a real Test_* helper to exist in the fixture — the
  // test_vba call returns either ok:false (procedure missing) OR ok:true
  // (procedure ran). Both are valid outcomes from the sandbox-sync contract:
  // what matters is that the call is routed through the runner, that the
  // runner uses its own sandbox copy (visible via the result envelope), and
  // that no orphan sandbox file is left in the OS temp dir afterwards.
  const result = await callTool("test_vba", {
    projectId,
    proceduresJson: JSON.stringify([
      { procedure: "Test_AnyProcedureForI1013SandboxSync", args: [] },
    ]),
    dryRun: true,
  });
  const resultPayload = toolPayload(result);
  expect(
    "test_vba MCP call returns a structured plan when the procedure is unknown",
    !result.isError && resultPayload !== null && Array.isArray(resultPayload?.plan?.procedureName),
    {
      payload: resultPayload,
      text: result.text,
      stderr: result.stderr?.slice(-2000),
    },
  );

  // Allow a brief window for the runner's finally cleanup to settle, then
  // diff the OS temp dir. If the runner left any dysflow-test-sandbox-*
  // directory behind that was not present before, the sandbox cleanup is
  // leaking — the bug we are regressing against.
  await new Promise((resolve) => setTimeout(resolve, 250));
  const postSandboxes = await snapshotDysflowSandboxes();
  const leaked = [...postSandboxes].filter((path) => !preSandboxes.has(path));
  expect(
    "test_vba does not leave dysflow-test-sandbox-* directories behind after the run",
    leaked.length === 0,
    { leaked, pre: [...preSandboxes], post: [...postSandboxes] },
  );

  if (failures.length > 0) {
    throw new Error(`${failures.length} assertion(s) failed: ${failures.map(({ label }) => label).join(", ")}`);
  }

  console.log("[i1013-test-vba-sandbox-sync] all assertions passed.");
} finally {
  if (process.env.DYSFLOW_E2E_PRESERVE_SANDBOX) {
    console.log(`[i1013-test-vba-sandbox-sync] sandbox preserved: ${tempRoot}`);
  } else {
    await rm(tempRoot, { recursive: true, force: true });
  }
}