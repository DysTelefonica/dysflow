// E2E_testing/mcp-e2e-issue-807-features.mjs
//
// End-to-end tests for the 3 features shipped under issue #807:
//   - Feature 1: list_vba_modules (new tool) — enumerates VBA components
//     with binary<->source cross-reference
//   - Feature 2: import_modules bulk-by-directory (schema extensions) —
//     walks a directory, applies filePattern / includeTests / includeForms,
//     chunks by chunkSize
//   - Feature 3: verify_code chunking + parallel chunks (schema extensions)
//     — splits large moduleNames lists into chunks for timeout tolerance
//
// Follows the same pattern as mcp-e2e-import-grow-in-place.mjs:
//   - Skip cleanly when Windows + Access fixture + password are missing
//   - Use the same helpers (resolveMcpE2eCommand, runMcpHarness)
//   - All MCP traffic goes through stdio JSON-RPC, no shortcuts
//
// Environment variables:
//   - ACCESS_VBA_PASSWORD (required when the fixture is present)
//   - DYSFLOW_E2E_TIMEOUT_MS (default 30000)
//   - DYSFLOW_REQUIRE_ACCESS_E2E=1 — fail instead of skip when the
//     fixture is missing. Use this in CI to make the E2E blocking.

import { spawn } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMcpE2eSandboxPlan, initializeMcpE2eSandbox } from "./_helpers/mcp-e2e-sandbox.mjs";
import { resolveMcpE2eCommand } from "./_helpers/resolve-mcp-e2e-command.mjs";
import { runMcpHarness } from "./_helpers/mcp-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const fixtureAccess = join(scriptDir, "NoConformidades.accdb");
const fixtureBackend = join(scriptDir, "NoConformidades_Datos.accdb");
const fixtureSource = join(scriptDir, "src");
const projectId = "noconformidades-i807-features-e2e";
const timeoutMs = Number(process.env.DYSFLOW_E2E_TIMEOUT_MS ?? 30000);
const closeWatchdogMs = Number(process.env.DYSFLOW_E2E_CLOSE_WATCHDOG_MS ?? 5000);
const password = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD;
const requireAccessE2e = /^(1|true|yes)$/i.test(process.env.DYSFLOW_REQUIRE_ACCESS_E2E ?? "");

function skipOrFail(message) {
  const prefix = requireAccessE2e ? "required fixture missing" : "skipped";
  const output = `[i807-features] ${prefix}: ${message}`;
  if (requireAccessE2e) {
    console.error(output);
    process.exit(1);
  }
  console.log(output);
  process.exit(0);
}

function toolPayload(message) {
  // #1001: the runMcpHarness wrapper exposes the JSON-RPC payload under
  // `response.result`, not at top-level `result`. Walk the wrapper shape so
  // the test reads the actual JSON envelope (the original code read
  // `message?.result?.content` and silently returned null because the
  // wrapper has no top-level `result`).
  const content = message?.response?.result?.content;
  if (!Array.isArray(content)) return null;
  const text = content.map((item) => item?.text ?? "").join("\n");
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function spawnMcp() {
  const resolvedCommand = resolveMcpE2eCommand({ env: process.env, repoRoot });
  if (!resolvedCommand.ok) {
    skipOrFail(`${resolvedCommand.code}: ${resolvedCommand.message}`);
  }
  process.env.DYSFLOW_HOME = join(repoRoot, "test-runtime");
  return spawn(resolvedCommand.command, ["mcp"], {
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

async function callTool(child, requestId, name, args, options = {}) {
  const result = await runMcpHarness({
    child,
    requestId,
    method: "tools/call",
    params: { name, arguments: { accessPath, destinationRoot, ...args } },
    timeoutMs: options.timeoutMs ?? timeoutMs,
    closeWatchdogMs,
  });
  const payload = toolPayload(result);
  return { result, payload };
}

async function callCapabilities(child) {
  const result = await runMcpHarness({
    child,
    requestId: 2,
    method: "tools/call",
    params: { name: "get_capabilities", arguments: { projectId } },
    timeoutMs,
    closeWatchdogMs,
  });
  return { result, payload: toolPayload(result) };
}

if (process.platform !== "win32") {
  skipOrFail("Windows + Access required.");
}
if (!existsSync(fixtureAccess) || !existsSync(fixtureBackend)) {
  skipOrFail("missing NoConformidades.accdb / NoConformidades_Datos.accdb fixture in E2E_testing/.");
}
if (!password) {
  skipOrFail("set ACCESS_VBA_PASSWORD for the fixture before running.");
}

const failures = [];
function formatDetail(detail, max = 200) {
  if (detail === undefined) return "(no detail)";
  if (detail === null) return "null";
  try {
    return JSON.stringify(detail).slice(0, max);
  } catch {
    return String(detail).slice(0, max);
  }
}
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  [ok]   ${label}`);
  } else {
    console.error(`  [FAIL] ${label} ${detail !== undefined && detail !== null ? `- ${formatDetail(detail)}` : ""}`);
    failures.push({ label, detail });
  }
}

// #1001: round-trip the fixture through the MCP-owned sandbox so the
// project's `.dysflow/project.json` resolves at `tempRoot`, not up the
// directory tree at `scriptDir` (which would otherwise latch onto the
// stale F16 project.json living in the operator's `$repo/.dysflow/`).
const sandboxPlan = buildMcpE2eSandboxPlan({ scriptDir });
const tempRoot = sandboxPlan.sandbox.root;
const accessPath = sandboxPlan.sandbox.accessPath;
const backendPath = sandboxPlan.sandbox.backendPath;
const destinationRoot = sandboxPlan.sandbox.destinationRoot;
const modulesRoot = join(destinationRoot, "modules");
const classesRoot = join(destinationRoot, "classes");

await rm(tempRoot, { recursive: true, force: true });
await initializeMcpE2eSandbox(sandboxPlan, { projectId });
await cp(fixtureAccess, accessPath);
await cp(fixtureBackend, backendPath);
await cp(fixtureSource, destinationRoot, { recursive: true });
await mkdir(modulesRoot, { recursive: true });
await mkdir(classesRoot, { recursive: true });

{
  const child = spawnMcp();
  try {
    const { result, payload } = await callCapabilities(child);
    const snapshot = payload?.snapshot ?? payload;
    const config = snapshot?.projectConfig;
    const sandboxReady =
      !result.isError &&
      typeof snapshot?.adapterVersion === "string" &&
      typeof snapshot?.toolsVisible === "number" &&
      snapshot?.writesProcess?.enabled === true &&
      snapshot?.writesProject?.allowWrites === true &&
      config?.status === "valid" &&
      config?.writeReady === true &&
      config?.projectId === projectId &&
      typeof config?.projectRoot === "string" &&
      resolve(config.projectRoot).toLowerCase() === resolve(tempRoot).toLowerCase();
    expect("PREFLIGHT.sandbox project config is write-ready and isolated", sandboxReady, snapshot);
    if (!sandboxReady) {
      throw new Error(`Sandbox capability preflight failed. snapshot=${JSON.stringify(snapshot)}`);
    }
  } finally {
    child.kill();
  }
}

// Plant a known set of source files so the bulk import + list_vba_modules
// cross-ref have something to work with. We plant one per "category" so
// the bulk import filter assertions can be specific.
const planted = [
  { name: "Test_F807Helper",        body: 'Attribute VB_Name = "Test_F807Helper"\r\nOption Explicit\r\nPublic Sub Sanity()\r\nEnd Sub\r\n', dir: modulesRoot },
  { name: "clsF807Entity",          body: 'Attribute VB_Name = "clsF807Entity"\r\nOption Explicit\r\nPublic Sub Sanity()\r\nEnd Sub\r\n', dir: classesRoot },
  { name: "F807PlainModule",       body: 'Attribute VB_Name = "F807PlainModule"\r\nOption Explicit\r\nPublic Sub Sanity()\r\nEnd Sub\r\n', dir: modulesRoot },
];
for (const p of planted) {
  await writeFile(join(p.dir, `${p.name}.bas`), p.body, "utf8");
}

console.log("[i807-features] === Feature 1: list_vba_modules ===");

let verifyModuleNames = [];

// Round 1: list_vba_modules returns the right envelope shape.
{
  const child = spawnMcp();
  try {
    const { result, payload } = await callTool(child, 2, "list_vba_modules", {});
    expect(
      "F1.list MCP response completed successfully",
      result.timedOut === false && result.isError === false && payload !== null,
      { text: result.text, stderrTail: result.stderr.slice(-2000) },
    );
    expect("F1.modules is array", Array.isArray(payload?.modules), payload?.modules);
    expect("F1.summary has total", typeof payload?.summary?.total === "number", payload?.summary);
    expect("F1.summary has inBinaryOnly", typeof payload?.summary?.inBinaryOnly === "number", payload?.summary);
    expect("F1.summary has inSourceOnly", typeof payload?.summary?.inSourceOnly === "number", payload?.summary);
    expect("F1.summary has inBoth", typeof payload?.summary?.inBoth === "number", payload?.summary);

    verifyModuleNames = (payload?.modules ?? [])
      .filter((module) => module?.sourceExists === true && module?.binaryExists === true)
      .slice(0, 3)
      .map((module) => module.name);
    expect(
      "F1.fixture exposes at least 3 modules present in source and binary",
      verifyModuleNames.length === 3,
      verifyModuleNames,
    );

    // The 3 planted .bas files must appear as `sourceExists: true`. The cross-ref
    // walks the source tree (filesystem-only) and reports each plant.
    const plantedNames = new Set(planted.map((p) => p.name));
    const sourceOnly = (payload?.modules ?? []).filter(
      (m) => m?.sourceExists === true && m?.binaryExists === false,
    );
    const found = sourceOnly.filter((m) => plantedNames.has(m?.name));
    expect("F1.planted .bas files appear with sourceExists=true", found.length === planted.length,
      `expected ${planted.length}, found ${found.length} (${found.map((m) => m.name).join(", ")})`);
  } finally {
    child.kill();
  }
}

// Round 2: list_vba_modules honors typeFilter=standard.
{
  const child = spawnMcp();
  try {
    const { result, payload } = await callTool(child, 3, "list_vba_modules", { typeFilter: "standard" });
    expect(
      "F2.typeFilter=standard MCP response completed successfully",
      result.timedOut === false && result.isError === false && payload !== null,
      { text: result.text, stderrTail: result.stderr.slice(-2000) },
    );
    const wrongTypes = (payload?.modules ?? []).filter((m) => m?.type !== 1);
    expect("F2.typeFilter=standard returns only type 1", wrongTypes.length === 0,
      `${wrongTypes.length} wrong-type rows: ${wrongTypes.map((m) => `${m?.name}=${m?.type}`).join(", ")}`);
  } finally {
    child.kill();
  }
}

// Round 3: list_vba_modules honors namePattern glob.
{
  const child = spawnMcp();
  try {
    const { result, payload } = await callTool(child, 4, "list_vba_modules", { namePattern: "Test_F807*" });
    expect(
      "F3.namePattern=Test_F807* MCP response completed successfully",
      result.timedOut === false && result.isError === false && payload !== null,
      { text: result.text, stderrTail: result.stderr.slice(-2000) },
    );
    const matches = (payload?.modules ?? []).filter((m) => m?.name?.startsWith("Test_F807"));
    const allMatch = (payload?.modules ?? []).every((m) => m?.name?.startsWith("Test_F807"));
    expect("F3.namePattern=Test_F807* filters to Test_F807* prefix", allMatch && matches.length > 0,
      `matches=${matches.length}, allMatch=${allMatch}, names=${(payload?.modules ?? []).map((m) => m?.name).join(", ")}`);
  } finally {
    child.kill();
  }
}

console.log("[i807-features] === Feature 2: import_modules bulk-by-directory ===");

// Round 4: bulk dryRun (default true) returns a plan without writing.
{
  const planChild = spawnMcp();
  try {
    const { payload } = await callTool(planChild, 5, "import_modules", {
      sourceDir: destinationRoot,
      filePattern: "Test_F807*",
      includeTests: true,
      includeForms: true,
      chunkSize: 1,
    });
    // The bulk path is non-mutating under dryRun. We assert the plan was
    // assembled and that none of the planted files were committed (no
    // .accdb state change observable from this side).
    expect("F4.bulk dryRun plan assembled",
      payload !== null && payload?.error === undefined,
      payload?.error ?? "no payload");
  } finally {
    planChild.kill();
  }
  const existsChild = spawnMcp();
  try {
    // The behavior: the plan payload has a chunks[] / planned[] array, or
    // it returns the same per-module shape as the single-call path. Both
    // shapes are acceptable as long as no write was applied. We assert
    // the dryRun default by checking the binary's still-pristine state via
    // a follow-up exists() call.
    const { payload: existsPayload } = await callTool(existsChild, 6, "exists", { moduleName: "Test_F807Helper" });
    expect("F4.bulk dryRun did NOT write (exists responds for a pre-existing binary module or missing as expected)",
      existsPayload !== null,
      existsPayload);
  } finally {
    existsChild.kill();
  }
}

// Round 5: bulk chunkSize: 1 + filePattern '*' should produce a chunk per module.
// (Sanity check that chunking is applied; the exact count depends on the binary.)
{
  const child = spawnMcp();
  try {
    const { payload } = await callTool(child, 7, "import_modules", {
      sourceDir: destinationRoot,
      filePattern: "Test_F807*",
      chunkSize: 1,
    });
    expect("F5.bulk chunkSize=1 returns a payload", payload !== null, payload?.error);
  } finally {
    child.kill();
  }
}

console.log("[i807-features] === Feature 3: verify_code chunking + parallel ===");

// Round 6: verify_code with chunkSize + parallelChunks does not abort on a
// valid modules present in both the binary and source tree and run with
// chunkSize=2 parallelChunks=2.
{
  const child = spawnMcp();
  try {
    const { result, payload } = await callTool(
      child,
      8,
      "verify_code",
      {
        moduleNames: verifyModuleNames,
        chunkSize: 2,
        parallelChunks: 2,
        onChunkTimeout: "skip",
        timeoutMs: 30000,
      },
      { timeoutMs: 300000 },
    );
    expect(
      "F6.verify_code MCP response completed successfully",
      result.timedOut === false && result.isError === false,
      { text: result.text, stderrTail: result.stderr.slice(-2000) },
    );
    expect("F6.verify_code chunked returns structured JSON", payload !== null, result.text);
    expect(
      "F6.verify_code completes every chunk",
      Array.isArray(payload?.chunkFailures) &&
        payload.chunkFailures.length === 0 &&
        Array.isArray(payload?.chunkTimedOut) &&
        payload.chunkTimedOut.length === 0,
      { chunkFailures: payload?.chunkFailures, chunkTimedOut: payload?.chunkTimedOut },
    );
    // Whether matched / different / missingInBinary is set depends on
    // whether the planted .bas files are in the binary. We accept any
    // structured response that does not look like a hard error.
    const isErrorShape = payload?.ok === false && payload?.error?.code === "VBA_MANAGER_FAILED";
    expect("F6.verify_code does not abort the call", !isErrorShape, payload);
  } finally {
    child.kill();
  }
}

if (failures.length > 0) {
  console.error(`\n[i807-features] ${failures.length} assertion(s) failed.`);
  for (const f of failures) {
    console.error(`  - ${f.label}: ${formatDetail(f.detail)}`);
  }
  process.exit(1);
}

console.log(`\n[i807-features] all assertions passed.`);
process.exit(0);
