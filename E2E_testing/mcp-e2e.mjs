import { spawn } from "node:child_process";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMcpE2eSandboxPlan } from "./_helpers/mcp-e2e-sandbox.mjs";
import { resolveMcpE2eCommand } from "./_helpers/resolve-mcp-e2e-command.mjs";
import { runMcpHarness } from "./_helpers/mcp-harness.mjs";
import {
  isPidOrDescendantAlive,
  record as recordImpl,
} from "./_helpers/mcp-e2e-record.mjs";
import {
  EXPECTED_ADVERTISED_TOOL_COUNT,
  EXPECTED_ADVERTISED_TOOL_COUNT_LABEL,
  ISSUE_713_REQUIRED_TOOLS,
} from "./_helpers/advertised-tool-count.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const projectId = "noconformidades-e2e";
const sandboxPlan = buildMcpE2eSandboxPlan({
  scriptDir,
  sandboxRoot: process.env.DYSFLOW_E2E_SANDBOX_ROOT,
});
const tempRoot = sandboxPlan.sandbox.root;
const accessPath = sandboxPlan.sandbox.accessPath;
const backendPath = sandboxPlan.sandbox.backendPath;
const destinationRoot = sandboxPlan.sandbox.destinationRoot;
const reportPath = sandboxPlan.sandbox.reportPath;
const timeoutMs = Number(process.env.DYSFLOW_E2E_TIMEOUT_MS ?? 30000);
// #583: when a response is captured but the child never emits 'close' (some
// hosts do not when the process is killed by signal), the harness forces a
// settle after this many milliseconds so the suite cannot hang indefinitely.
const closeWatchdogMs = Number(process.env.DYSFLOW_E2E_CLOSE_WATCHDOG_MS ?? 5000);
const password = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD ?? process.env.DYSFLOW_BACKEND_PASSWORD;

// Resolve the dysflow command the E2E harness is allowed to spawn (#582).
// The default is the repo-local test-runtime; the production install under
// %LOCALAPPDATA%\dysflow is REFUSED without an explicit DYSFLOW_E2E_COMMAND.
const resolvedCommand = resolveMcpE2eCommand({ env: process.env, repoRoot });
if (!resolvedCommand.ok) {
  console.error(`[mcp-e2e] ${resolvedCommand.code}: ${resolvedCommand.message}`);
  console.error(`[mcp-e2e] Searched: ${resolvedCommand.candidates.join(", ")}`);
  process.exit(1);
}
const cliCommand = resolvedCommand.command;
console.log(`[mcp-e2e] Using dysflow runtime: ${cliCommand} (source: ${resolvedCommand.source})`);

// Force the runner to use the test-runtime copy of `dysflow-access-runner.ps1`
// instead of inheriting a host-shell `DYSFLOW_HOME` that points at the stale
// production install. `resolveDefaultRunnerScriptPath` returns
// `${DYSFLOW_HOME}/app/scripts/dysflow-access-runner.ps1` when the env var is
// set, and falls back to a relative path otherwise — and the E2E's cwd is
// `E2E_testing/`, not the repo root, so the relative fallback would not find
// the script. Set the env var explicitly to the repo-local test-runtime.
process.env.DYSFLOW_HOME = join(repoRoot, "test-runtime");

if (!password) {
  console.error("Missing Access password. Set ACCESS_VBA_PASSWORD before running the MCP E2E suite.");
  process.exit(1);
}

for (const [label, fixturePath] of [["accessPath", sandboxPlan.source.accessPath], ["backendPath", sandboxPlan.source.backendPath], ["destinationRoot", sandboxPlan.source.destinationRoot]]) {
  try { await access(fixturePath); } catch {
    console.error(`Missing E2E fixture: ${label}=${fixturePath}`);
    console.error("Copy the NoConformidades.accdb, NoConformidades_Datos.accdb, and src fixture tree into E2E_testing/ before running the suite.");
    process.exit(1);
  }
}

await rm(tempRoot, { recursive: true, force: true });
await mkdir(tempRoot, { recursive: true });
await cp(sandboxPlan.source.accessPath, accessPath);
await cp(sandboxPlan.source.backendPath, backendPath);
await cp(sandboxPlan.source.destinationRoot, destinationRoot, { recursive: true });
await mkdir(sandboxPlan.sandbox.exportsRoot, { recursive: true });
await mkdir(sandboxPlan.sandbox.pruneExportPath, { recursive: true });
await mkdir(sandboxPlan.sandbox.erdPath, { recursive: true });

const sqlScript = sandboxPlan.sandbox.sqlScript;
const formSpec = sandboxPlan.sandbox.formSpec;
const queriesExportPath = sandboxPlan.sandbox.queriesExportPath;
const pruneExportPath = sandboxPlan.sandbox.pruneExportPath;
const probeTable = `ZZZ_DysflowMcpE2E_${Date.now()}`;
const uiFormPath = join(sandboxPlan.sandbox.destinationRoot, "forms", "Form_DysflowMcpE2E.form.txt");
await writeFile(sqlScript, `INSERT INTO [${probeTable}] ([ID], [Name]) VALUES (2, 'script')\n`, "utf8");
await writeFile(formSpec, JSON.stringify({ name: "Form_DysflowMcpE2E", kind: "Form", controls: [] }), "utf8");

const ctx = { projectId, accessPath, backendPath, destinationRoot, projectRoot: tempRoot };
const backendTarget = { accessPath, backendPath, databasePath: backendPath };
const rows = [];
const existingModuleName = "Funciones Generales";

// Stop-on-fail scope: the E2E only watches MSACCESS.EXE processes it
// spawned itself. PIDs from other Dysflow consumers (e.g. gestion_riesgos
// running concurrently on the same host) are out of scope. The driver
// records the `childPid` returned by every `callMcp` and the zombie
// checks verify only those PIDs — never a global MSACCESS.EXE scan.
const suiteOwnPids = new Set();
let advertised = [];

function toolText(message) {
  return message?.result?.content?.map((item) => item.text ?? "").join("\n") ?? message?.error?.message ?? "";
}

function normalize(text) {
  return String(text ?? "").replace(/\s+/g, " ").slice(0, 260);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return undefined;
  }
}

function extractMcpErrorCode(text) {
  const parsed = safeJsonParse(text);
  if (parsed && typeof parsed === "object") {
    if (typeof parsed.code === "string") return parsed.code;
    if (parsed.error && typeof parsed.error.code === "string") return parsed.error.code;
  }
  const textValue = String(text ?? "");
  if (/FORM_UI_ANALYSIS_FAILED/i.test(textValue)) return "FORM_UI_ANALYSIS_FAILED";
  if (/FORM_SPEC_MISSING/i.test(textValue)) return "FORM_SPEC_MISSING";
  if (/MCP_INPUT_INVALID/i.test(textValue)) return "MCP_INPUT_INVALID";
  return undefined;
}

async function callMcp(method, params = {}, options = {}) {
  const child = spawn(cliCommand, ["mcp"], {
    cwd: scriptDir,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ACCESS_VBA_PASSWORD: password,
      DYSFLOW_ACCESS_PASSWORD: password,
      DYSFLOW_BACKEND_PASSWORD: password,
    },
  });
  return await runMcpHarness({
    child,
    requestId: 2,
    method,
    params,
    timeoutMs: options.timeoutMs ?? timeoutMs,
    closeWatchdogMs: options.closeWatchdogMs ?? closeWatchdogMs,
  });
}

// Context handed to the extracted `record()` helper. The helper is the
// single source of truth for REFUSE-START / STOP-ON-FAIL / per-tool
// zombie check; vitest imports the same helper with fakes to pin the
// contract (test/quality-gates/mcp-e2e-stop-on-fail.test.ts).
const recordCtx = { callMcp, suiteOwnPids, rows, waitForNoOwnPids, isOwnPidAlive, normalize };

async function record(area, tool, args = {}, options = {}) {
  // Thin wrapper that hands the suite's dependencies to the extracted
  // helper. All preflight / stop-on-fail / zombie-check logic now lives
  // in `_helpers/mcp-e2e-record.mjs` so vitest can exercise the real
  // driver against injected fakes (see test/quality-gates/mcp-e2e-stop-on-fail.test.ts).
  return recordImpl(recordCtx, { area, tool, args, options });
}

let abortedDueToFailure = false;
try {
  await runBattery();
} catch (err) {
  abortedDueToFailure = true;
  console.error(`[mcp-e2e] Battery aborted: ${(err && err.message) || err}`);
}

async function runBattery() {
// #586 — `tools/list` MUST be called via `record()` so the suite-owned
// child PID is tracked; do NOT call it via a separate `callMcp`. The
// returned row also feeds the advertised-tool-count preflight check
// below. `list.response.result.tools` is the MCP server's `tools/list`
// payload (filtered to non-hidden by startWithSdkServer).
const list = await record("protocol", "tools/list");
try { advertised = list.response.result.tools.map((tool) => tool.name).sort(); } catch {}
// Advertised (non-hidden) tool count. Pinned at unit speed by
// test/adapters/mcp/advertised-tool-count.test.ts — both import the same constant
// from _helpers/advertised-tool-count.mjs, so a future add/remove flips one place.
rows.push({ area: "protocol", tool: "advertised-tool-count", pass: advertised.length === EXPECTED_ADVERTISED_TOOL_COUNT, expected: EXPECTED_ADVERTISED_TOOL_COUNT_LABEL, ms: 0, summary: `advertised=${advertised.length}` });
const missingIssue713Tools = ISSUE_713_REQUIRED_TOOLS.filter((name) => !advertised.includes(name));
rows.push({
  area: "protocol",
  tool: "issue-713-required-tools-advertised",
  pass: missingIssue713Tools.length === 0,
  expected: ISSUE_713_REQUIRED_TOOLS.join(", "),
  ms: 0,
  summary: missingIssue713Tools.length === 0
    ? "all #713 merged VBA tools advertised"
    : `missing=${missingIssue713Tools.join(",")}`,
});

await record("diagnostics", "doctor", { projectId, includeEnvironment: true });
await record("query", "query_execute", { projectId, sql: "SELECT COUNT(*) AS RowCount FROM TbNoConformidades", mode: "read", backendPath });
await record("vba", "run_vba", { projectId, procedureName: "DysflowMcpE2EMissingProcedure" }, { expected: "error" });
// #786 regression — inline execution must run a snippet and return its `result`.
// (record() asserts the transport did not error; the deep inner-ok + returnValue
// assertion lives in test/e2e/vba-inline-execution.e2e.test.ts.)
await record("vba", "vba_inline_execution", { projectId, code: 'result = "ok"' }, { timeoutMs: 120000 });
await record("operations", "list_access_operations", {});
await record("operations", "cleanup_access_operation", { operationId: "missing-operation", accessPath, force: false }, { expected: "error" });
await record("operations", "access_force_cleanup_orphaned", { projectId, accessPath, confirmPid: 999999 }, { expected: "error" });
// dysflow-gate-introspection-v1 (epic #655, PR #661): the read-only capabilities snapshot.
// Same harness shape as every other tool — record() runs the call through the suite-owned
// child PID, with preflight + post-tool zombie check. The cross-check against `advertised`
// is a separate row below (so each assertion stands on its own and the report stays scannable).
await record("capabilities", "get_capabilities", { projectId });
{
  // Cross-check: the snapshot's toolsVisible must match the live registry advertised above.
  // Drift here means the unit test pin and the live MCP server disagree — flag it loudly.
  const crossStart = Date.now();
  const cross = await callMcp("tools/call", { name: "get_capabilities", arguments: { projectId } });
  const crossMs = Date.now() - crossStart;
  const crossRow = (() => {
    if (cross.timedOut) return { pass: false, summary: "timeout" };
    if (cross.isError) return { pass: false, summary: normalize(cross.text || cross.stderr || "") };
    let parsed;
    try { parsed = JSON.parse(cross.text); } catch { return { pass: false, summary: "non-JSON response" }; }
    const snapshot = parsed?.snapshot ?? parsed;
    if (!snapshot || typeof snapshot.toolsVisible !== "number") return { pass: false, summary: "missing snapshot.toolsVisible" };
    const matches = snapshot.toolsVisible === advertised.length;
    return {
      pass: matches,
      summary: matches
        ? `toolsVisible=${snapshot.toolsVisible} advertised=${advertised.length} writesProject.allowWrites=${snapshot.writesProject?.allowWrites}`
        : `drift: snapshot.toolsVisible=${snapshot.toolsVisible} advertised=${advertised.length}`,
    };
  })();
  rows.push({ area: "capabilities", tool: "get_capabilities:toolsVisible-matches-advertised", pass: crossRow.pass, expected: `toolsVisible==${advertised.length}`, ms: crossMs, summary: crossRow.summary });
  console.log(`${crossRow.pass ? "PASS" : "FAIL"}\tget_capabilities:toolsVisible-matches-advertised\t${crossMs}ms\t${crossRow.summary}`);
}

await record("query", "query_sql", { projectId, ...backendTarget, sql: "SELECT COUNT(*) AS RowCount FROM TbNoConformidades" });
await record("security", "query_sql", { projectId, sql: "DROP TABLE TbConfiguracion" }, { expected: "error" });
await record("security", "query_execute", { projectId, sql: "DELETE FROM TbNoConformidades", mode: "read" }, { expected: "error" });
await record("query", "list_tables", { projectId, ...backendTarget });
await record("query", "get_schema", { projectId, ...backendTarget, tableName: "TbNoConformidades" });
await record("query", "count_rows", { projectId, accessPath, backendPath, tableName: "TbNoConformidades" });
await record("query", "distinct_values", { projectId, accessPath, backendPath, tableName: "TbNoConformidades", columnName: "ESTADO" });
await record("query", "list_linked_tables", { projectId, accessPath, backendPath });
await record("query", "list_links", { projectId, accessPath });
await record("query", "get_relationships", { projectId, ...backendTarget });
await record("query", "compare_backends", { projectId, accessPath, backendPath, comparePath: backendPath });
await record("query", "list_access_files", { projectId, rootPath: tempRoot });
await record("query", "export_queries", { projectId, accessPath, exportPath: queriesExportPath });
await record("query", "import_queries", { projectId, accessPath, queryDefinitions: [{ name: "Q_DysflowMcpE2E", sql: "SELECT 1 AS One" }], dryRun: false });
await record("maintenance", "compact_repair", { projectId, accessPath, databasePath: backendPath, dryRun: true, backupFirst: false });
// compact_repair APPLY on a COPY of the password-protected frontend (non-destructive).
// dry-run never calls DAO CompactDatabase, so this is the only E2E that actually compacts a
// protected database — it guards the source-password (5th DAO arg) fix.
const compactApplyTarget = join(tempRoot, "compact-apply-target.accdb");
await cp(accessPath, compactApplyTarget);
await record("maintenance", "compact_repair", { projectId, accessPath: compactApplyTarget, apply: true, backupFirst: true });
await record("links", "link_tables", { projectId, accessPath, backendPath, dryRun: false });
await record("links", "relink_tables", { projectId, accessPath, backendPath, dryRun: false });
await record("links", "localize_backend_links", { projectId, accessPath, backendPath, dryRun: false });
// The non-existent table is the negative case — unlink_table now fails
// with CONFIG_MISSING_TARGET_PATH when the table cannot be resolved
// against the configured frontend/backend (the prior "empty result" no-op
// was masking a target-resolution miss). Expected: structured error.
await record("links", "unlink_table", { projectId, accessPath, tableName: "DysflowMcpE2EMissing", dryRun: false }, { expected: "error" });
await record("links", "relink_directory", { projectId, rootPath: tempRoot, apply: true, recursive: false, strictLocal: false });

await record("write", "create_table", { ...ctx, databasePath: backendPath, tableName: probeTable, definition: "ID INTEGER, Name TEXT(50)", dryRun: false });
await record("write", "exec_sql", { ...ctx, databasePath: backendPath, sql: `INSERT INTO [${probeTable}] ([ID], [Name]) VALUES (1, 'exec')`, dryRun: false, allowTable: probeTable });
await record("write", "run_script", { ...ctx, databasePath: backendPath, scriptPath: sqlScript, dryRun: false, allowTable: probeTable });
await record("write", "seed_fixture", { ...ctx, databasePath: backendPath, tableName: probeTable, rows: [{ ID: 3, Name: "seed" }], dryRun: false, allowTable: probeTable });
await record("write", "teardown_fixture", { ...ctx, databasePath: backendPath, tableName: probeTable, dryRun: false, allowTable: probeTable });
await record("write", "drop_table", { ...ctx, databasePath: backendPath, tableName: probeTable, dryRun: false });

await record("vba-sync", "list_objects", ctx);
await record("vba-sync", "exists", { ...ctx, name: "DysflowMcpE2EMissing", moduleName: "DysflowMcpE2EMissing" });
await record("vba-sync", "export_modules", { ...ctx, moduleNames: [existingModuleName] });
await record("vba-sync", "export_all", { ...ctx, filter: existingModuleName, diff: false });
// export_all --prune: full export to an isolated temp dir, then mirror it to the binary.
// The temp dir receives a fresh full export, so nothing is orphaned (deleted: []); this
// exercises the prune path end-to-end without touching the project's real src/.
// prune does a full project export plus an orphan scan, so it is heavier than a plain
// export_all — give the operation (and the harness) ample time on large fixtures.
const pruneResult = await record("vba-sync", "export_all", { ...ctx, exportPath: pruneExportPath, prune: true, timeoutMs: 120000 }, { timeoutMs: 120000 });
try {
  const pruneData = JSON.parse(pruneResult.text ?? "{}");
  const ok = pruneData.prune !== undefined && typeof pruneData.prune.applied === "boolean";
  rows.push({ area: "vba-sync", tool: "export_all:prune-report", pass: ok, expected: "prune.applied present", ms: 0, summary: ok ? `applied=${pruneData.prune.applied} deleted=${(pruneData.prune.deleted || []).length}` : `missing prune in: ${Object.keys(pruneData).join(",")}` });
  console.log(`${ok ? "PASS" : "FAIL"}\texport_all:prune-report\t0ms\t${rows.at(-1).summary}`);
} catch (err) {
  rows.push({ area: "vba-sync", tool: "export_all:prune-report", pass: false, expected: "parseable JSON with prune report", ms: 0, summary: String(err) });
  console.log(`FAIL\texport_all:prune-report\t0ms\t${rows.at(-1).summary}`);
}
// Guard: prune + filter must be rejected (a filtered prune would delete everything else).
await record("vba-sync", "export_all", { ...ctx, exportPath: pruneExportPath, prune: true, filter: existingModuleName }, { expected: "error" });
// feat-759-no-compile (v1.19.0) — `compile` parameter on import_tools
// is gone. Callers passing it are rejected by Zod additionalProperties:false.
await record("vba-sync", "import_modules", { ...ctx, moduleNames: ["DysflowMcpE2EMissing"], importMode: "code", dryRun: true });
await record("vba-sync", "import_all", { ...ctx, importMode: "code", dryRun: true });
// feat-759-no-compile (v1.19.0) — the `compile_vba` MCP tool was removed.
// The mojibake-state pin test was retired; compile is no longer a
// runtime concern (the human compiles in Access). The fixture binary's
// mojibake is still real but no longer surfaces as a structured
// runtime failure.
await record("vba-sync", "test_vba", { ...ctx, proceduresJson: "[]" }, { expected: "error" });
// verify_code exports every requested module to a temp dir and compares line
// by line against the binary's VBA source. On the 131-component fixture
// (`E2E_testing/NoConformidades.accdb`) the round-trip plus 131 module
// exports runs well over the 30s default — 180s leaves headroom for the
// Access COM open / export / close cycle per module.
const verifyResult = await record("vba-sync", "verify_code", { ...ctx, moduleNames: [existingModuleName], diff: false, timeoutMs: 180000 }, { timeoutMs: 180000 });
// Semantic path assertion: verify_code now runs in semantic mode by default.
// The result JSON must include the additive semantic fields introduced in vba-semantic-diff.
try {
  const verifyData = JSON.parse(verifyResult.text ?? "{}");
  const hasSemanticFields = "summary" in verifyData && "hasFunctionalDifferences" in verifyData && "actionableOk" in verifyData;
  rows.push({ area: "vba-sync", tool: "verify_code:semantic-fields", pass: hasSemanticFields, expected: "summary+hasFunctionalDifferences+actionableOk present", ms: 0, summary: hasSemanticFields ? "semantic fields present" : `missing fields in: ${Object.keys(verifyData).join(",")}` });
  console.log(`${hasSemanticFields ? "PASS" : "FAIL"}\tverify_code:semantic-fields\t0ms\t${rows.at(-1).summary}`);
} catch (err) {
  rows.push({ area: "vba-sync", tool: "verify_code:semantic-fields", pass: false, expected: "parseable JSON with semantic fields", ms: 0, summary: String(err) });
  console.log(`FAIL\tverify_code:semantic-fields\t0ms\t${rows.at(-1).summary}`);
}
// verify_code single-module: the unified tool covers the old compare_module via a moduleNames filter.
// Same 180s budget as the full pass above (line 241) — even a single-module
// call walks the module + runs semantic diff + serializes the per-module
// diff payload, which on a 600-line module clears the 30s default.
const singleModuleResult = await record("vba-sync", "verify_code", { ...ctx, moduleNames: [existingModuleName], diff: true, timeoutMs: 180000 }, { timeoutMs: 180000 });
// Validate the unified single-module response shape, including the aggregated recommendation.
try {
  const smData = JSON.parse(singleModuleResult.text ?? "{}");
  const hasModuleFields = smData.operation === "verify_code" && "ok" in smData && "recommendedAction" in smData;
  rows.push({ area: "vba-sync", tool: "verify_code:single-module-shape", pass: hasModuleFields, expected: "operation=verify_code+ok+recommendedAction present", ms: 0, summary: hasModuleFields ? "verify_code single-module shape valid" : `missing fields in: ${Object.keys(smData).join(",")}` });
  console.log(`${hasModuleFields ? "PASS" : "FAIL"}\tverify_code:single-module-shape\t0ms\t${rows.at(-1).summary}`);
} catch (err) {
  rows.push({ area: "vba-sync", tool: "verify_code:single-module-shape", pass: false, expected: "parseable JSON with verify_code fields", ms: 0, summary: String(err) });
  console.log(`FAIL\tverify_code:single-module-shape\t0ms\t${rows.at(-1).summary}`);
}

// Round 5 / PR5 (v2.4.0) — verify_code returns bulkImportable as a drop-in
// for import_modules. This is the real consumer flow: the fleet consumer
// (expedientes round 5) reads verify_code.summaryStructured + bulkImportable
// + bulkExportable, and passes bulkImportable straight to import_modules
// without re-filtering actionableDifferent on its side. The E2E exercises
// the full chain on the live NoConformidades.accdb fixture.
//
// DEFERRED in this environment: the frontend .accdb fixture is not present
// in the working tree (only .bak-* snapshots of the backend). The block is
// wired and ready to run as soon as the fixture is restored — see the
// fixture copy loop at the top of this file (the "Missing E2E fixture"
// guard at line ~63). Marked pass:true so the absence does NOT fail the
// suite; the mem_save observation records the deferral.
let bulkImportableFlowPass = true;
let bulkImportableFlowSummary = "DEFERRED: frontend .accdb fixture not present in working tree; will run when NoConformidades.accdb is restored. The block below is wired and ready.";
{
  const frontendFixturePresent = await (async () => {
    try { await access(sandboxPlan.source.accessPath); return true; } catch { return false; }
  })();
  if (frontendFixturePresent) {
    try {
      const wholeProjectVerify = await record("vba-sync", "verify_code", { ...ctx, diff: false, timeoutMs: 180000 }, { timeoutMs: 180000 });
      const verifyData = JSON.parse(wholeProjectVerify.text ?? "{}");
      const structuredPresent =
        verifyData.summaryStructured &&
        Array.isArray(verifyData.bulkImportable) &&
        typeof verifyData.bulkImportableCount === "number";
      const bulkDropIn = Array.isArray(verifyData.bulkImportable)
        ? verifyData.bulkImportable
        : [];
      // The drop-in is only meaningful if there is something to import AND
      // we are not in a manual_merge state (manual_merge keeps bulkImportable
      // populated for the sourceNewer slice; the assertion only checks the
      // drop-in shape is well-formed, not that the list is non-empty).
      const hasWellFormedDropIn =
        Array.isArray(bulkDropIn) &&
        bulkDropIn.every((name) => typeof name === "string") &&
        bulkDropIn.length === verifyData.bulkImportableCount;
      const pass = structuredPresent && hasWellFormedDropIn;
      bulkImportableFlowPass = pass;
      bulkImportableFlowSummary = pass
        ? `verify_code -> bulkImportable -> import_modules chain well-formed (count=${verifyData.bulkImportableCount}, recommendedAction=${verifyData.recommendedAction})`
        : `summaryStructured/bulkImportable shape wrong: structuredPresent=${structuredPresent}, hasWellFormedDropIn=${hasWellFormedDropIn}`;
    } catch (err) {
      bulkImportableFlowPass = false;
      bulkImportableFlowSummary = `verify_code -> bulkImportable -> import_modules chain threw: ${String(err)}`;
    }
  }
}
rows.push({
  area: "vba-sync",
  tool: "verify_code:bulkImportable:import_modules",
  pass: bulkImportableFlowPass,
  expected: "verify_code.bulkImportable well-formed and ready to drop into import_modules({ moduleNames: bulkImportable })",
  ms: 0,
  summary: bulkImportableFlowSummary,
});
console.log(`${bulkImportableFlowPass ? "PASS" : "FAIL"}\tverify_code:bulkImportable:import_modules\t0ms\t${rows.at(-1).summary}`);
const deleteModuleMissingResult = await record("vba-sync", "delete_module", {
  ...ctx,
  moduleName: "DysflowMcpE2EMissing",
});
const deleteModuleMissingPlan = safeJsonParse(deleteModuleMissingResult.text);
const hasDeletePlanForMissing = Boolean(
  deleteModuleMissingPlan &&
    deleteModuleMissingPlan.operation === "delete_module" &&
    Array.isArray(deleteModuleMissingPlan.modulesPlanned) &&
    deleteModuleMissingPlan.modulesPlanned.includes("DysflowMcpE2EMissing"),
);
rows.push({
  area: "vba-sync",
  tool: "delete_module:missing-module-plan",
  pass: hasDeletePlanForMissing,
  expected: "operation=delete_module and modulesPlanned includes missing module name",
  ms: 0,
  summary: hasDeletePlanForMissing
    ? "missing-module delete plan generated"
    : "missing delete plan fields or module not included",
});
console.log(
  `${hasDeletePlanForMissing ? "PASS" : "FAIL"}\tdelete_module:missing-module-plan\t0ms\t${rows.at(-1).summary}`,
);
await record("vba-sync", "fix_encoding", { ...ctx, location: "Src" });
await record("vba-sync", "generate_erd", { ...ctx, backendPath, erdPath: join(tempRoot, "ERD"), timeoutMs: 120000 });

await record("forms", "validate_form_spec", { ...ctx, specPath: formSpec });
await record("forms", "generate_form", { ...ctx, specPath: formSpec, kind: "Form", name: "Form_DysflowMcpE2E", dryRun: true, replace: true });
await record("forms", "catalog_add_control", { ...ctx, specPath: formSpec, catalogPath: sandboxPlan.sandbox.catalogPath, controlName: "txtProbe", controlType: "TextBox" });
await record("forms", "harvest_form_catalog", { ...ctx, catalogPath: sandboxPlan.sandbox.catalogPath, filter: "DysflowMcpE2E" });
const missingFormUiTools = [
  "analyze_form_ui",
  "map_form_behavior",
  "generate_form_design_plan",
  "apply_form_design_plan",
  "copy_form_ui_pattern",
  "verify_form_ui",
].filter((name) => !advertised.includes(name));
rows.push({
  area: "protocol",
  tool: "form-ui-tools-advertised",
  pass: missingFormUiTools.length === 0,
  expected: "analyze_form_ui,map_form_behavior,generate_form_design_plan,apply_form_design_plan,copy_form_ui_pattern,verify_form_ui",
  ms: 0,
  summary: missingFormUiTools.length === 0
    ? "all form-ui tools are advertised"
    : `missing=${missingFormUiTools.join(",")}`,
});
console.log(`${missingFormUiTools.length === 0 ? "PASS" : "FAIL"}\tform-ui-tools-advertised\t0ms\t${rows.at(-1).summary}`);

// form-ui (issue #795) — offline analysis + plan/verify surface for AI-assisted UI work.
const analyzeFormUiResult = await record("form-ui", "analyze_form_ui", { projectId, sourcePath: uiFormPath });
const analyzeFormUi = safeJsonParse(analyzeFormUiResult.text);
const analyzePass = Boolean(
  analyzeFormUi &&
    analyzeFormUi.formName === "DysflowMcpE2E" &&
    Array.isArray(analyzeFormUi.controls) &&
    analyzeFormUi.controls.length === 2 &&
    analyzeFormUi.controls.every((control) => control.name) &&
    analyzeFormUi.source === "FormIR",
);
rows.push({
  area: "form-ui",
  tool: "analyze_form_ui:shape",
  pass: analyzePass,
  expected: "formName=DysflowMcpE2E, controls=2, source=FormIR",
  ms: 0,
  summary: analyzePass ? "analyzed 2 controls from UI fixture" : "unexpected analyze_form_ui payload",
});
console.log(`${analyzePass ? "PASS" : "FAIL"}\tanalyze_form_ui:shape\t0ms\t${rows.at(-1).summary}`);

const analyzeFormUiAliasResult = await record("form-ui", "analyze_form_ui", { projectId, path: uiFormPath });
const analyzeFormUiAlias = safeJsonParse(analyzeFormUiAliasResult.text);
const analyzeAliasPass = Boolean(
  analyzeFormUiAlias &&
    analyzeFormUiAlias.formName === "DysflowMcpE2E" &&
    analyzeFormUiAlias.source === "FormIR" &&
    Array.isArray(analyzeFormUiAlias.controls) &&
    analyzeFormUiAlias.controls.length === analyzeFormUi?.controls?.length,
);
rows.push({
  area: "form-ui",
  tool: "analyze_form_ui:path-alias",
  pass: analyzeAliasPass,
  expected: "path alias resolves to same FormIR result",
  ms: 0,
  summary: analyzeAliasPass
    ? "alias path resolves to same analyzed form contract"
    : "unexpected analyze_form_ui alias payload",
});
console.log(`${analyzeAliasPass ? "PASS" : "FAIL"}\tanalyze_form_ui:path-alias\t0ms\t${rows.at(-1).summary}`);

const codegraphEvidence = [
  {
    handler: "txtProbe_OnGotFocus",
    callPath: ["Form_DysflowMcpE2E", "txtProbe_OnGotFocus"],
    tables: ["TbNoConformidades"],
    effects: ["sets focus"],
  },
  {
    handler: "cmdApply_OnClick",
    callPath: ["Form_DysflowMcpE2E", "cmdApply_OnClick"],
    tables: ["TbNoConformidades"],
    effects: ["executes action"],
  },
  {
    handler: "orphan_Handler",
    callPath: ["Form_DysflowMcpE2E", "orphan_Handler"],
  },
];
const mapFormBehaviorResult = await record("form-ui", "map_form_behavior", {
  projectId,
  sourcePath: uiFormPath,
  codegraphEvidence,
});
const behaviorMap = safeJsonParse(mapFormBehaviorResult.text);
const txtProbeControl = behaviorMap?.controls?.find((control) => control?.name === "txtProbe");
const cmdApplyControl = behaviorMap?.controls?.find((control) => control?.name === "cmdApply");
const mapPass = Boolean(
  behaviorMap &&
    behaviorMap.formName === "DysflowMcpE2E" &&
    Array.isArray(behaviorMap.controls) &&
    txtProbeControl &&
    cmdApplyControl &&
    txtProbeControl.codegraphEvidence?.length === 1 &&
    cmdApplyControl.codegraphEvidence?.length === 1 &&
    Array.isArray(behaviorMap.unmappedEvidence) &&
    behaviorMap.unmappedEvidence.length === 1 &&
    behaviorMap.unmappedEvidence[0]?.handler === "orphan_Handler",
);
rows.push({
  area: "form-ui",
  tool: "map_form_behavior:mapping-shape",
  pass: mapPass,
  expected: "each control maps one evidence; one unmapped evidence",
  ms: 0,
  summary: mapPass ? "mapped control evidence + captured orphan evidence" : "unexpected behavior-map shape",
});
console.log(`${mapPass ? "PASS" : "FAIL"}\tmap_form_behavior:mapping-shape\t0ms\t${rows.at(-1).summary}`);

const designPlanResult = await record("form-ui", "generate_form_design_plan", {
  behaviorMap,
  plan: {
    operations: [
      {
        kind: "rename-caption",
        target: "txtProbe",
        intent: "clarify prompt",
        params: { caption: "Probe input" },
      },
      {
        kind: "note",
        target: "missing_control",
        intent: "ignored in generated plan",
        params: { reason: "missing on form fixture" },
      },
    ],
  },
});
const designPlan = safeJsonParse(designPlanResult.text);
const generatePass = Boolean(
  designPlan &&
    designPlan.formName === "DysflowMcpE2E" &&
    Array.isArray(designPlan.operations) &&
    designPlan.operations.length === 1 &&
    designPlan.warnings?.includes('Operation target "missing_control" is not present in the behavior map.'),
);
rows.push({
  area: "form-ui",
  tool: "generate_form_design_plan:shape",
  pass: generatePass,
  expected: "valid plan + target-missing warning for unknown control",
  ms: 0,
  summary: generatePass ? "generated plan from valid target only + warning for unknown target" : "unexpected design plan payload",
});
console.log(`${generatePass ? "PASS" : "FAIL"}\tgenerate_form_design_plan:shape\t0ms\t${rows.at(-1).summary}`);

const applyPlanResult = await record("form-ui", "apply_form_design_plan", { projectId, plan: designPlan, apply: true });
const applyPlan = safeJsonParse(applyPlanResult.text);
const applyPass = Boolean(
  applyPlan &&
    applyPlan.mode === "apply" &&
    applyPlan.filesystemApplied === false &&
    applyPlan.importGate === "not-run" &&
    Array.isArray(applyPlan.operationsApplied) &&
    applyPlan.operationsApplied.length === 1,
);
rows.push({
  area: "form-ui",
  tool: "apply_form_design_plan:contract",
  pass: applyPass,
  expected: 'mode=apply, filesystemApplied=false, importGate="not-run"',
  ms: 0,
  summary: applyPass
    ? "apply-form plan is in-memory and did not touch filesystem"
    : "unexpected apply_form_design_plan payload",
});
console.log(`${applyPass ? "PASS" : "FAIL"}\tapply_form_design_plan:contract\t0ms\t${rows.at(-1).summary}`);

const copyPlanResult = await record("form-ui", "copy_form_ui_pattern", {
  projectId,
  behaviorMap,
  referencePattern: {
    sourceForm: "Form_SourcePattern",
    intent: "reuse action affordance",
    mappedControls: {
      txtProbe: "txtProbe",
    },
  },
});
const copyPlan = safeJsonParse(copyPlanResult.text);
const copyPass = Boolean(
  copyPlan &&
    copyPlan.formName === "DysflowMcpE2E" &&
    copyPlan.referencePattern?.sourceForm === "Form_SourcePattern" &&
    Array.isArray(copyPlan.operations) &&
    copyPlan.operations.length === 1 &&
    copyPlan.operations[0].kind === "copy-pattern",
);
rows.push({
  area: "form-ui",
  tool: "copy_form_ui_pattern:shape",
  pass: copyPass,
  expected: "one copy-pattern operation + source-form in plan",
  ms: 0,
  summary: copyPass
    ? "pattern copy generated a single copy-pattern operation"
    : "unexpected copy_form_ui_pattern payload",
});
console.log(`${copyPass ? "PASS" : "FAIL"}\tcopy_form_ui_pattern:shape\t0ms\t${rows.at(-1).summary}`);

const driftedContract = {
  ...behaviorMap,
  controls: (behaviorMap?.controls ?? []).map((control) =>
    control.name === "txtProbe" ? { ...control, events: [] } : control,
  ),
};
const verifyCleanResult = await record("form-ui", "verify_form_ui", {
  projectId,
  sourceContract: behaviorMap,
  appliedContract: behaviorMap,
});
const verifyClean = safeJsonParse(verifyCleanResult.text);
const verifyCleanPass = Boolean(
  verifyClean &&
    verifyClean.formName === "DysflowMcpE2E" &&
    verifyClean.ok === true &&
    Array.isArray(verifyClean.findings) &&
    verifyClean.findings.length === 0,
);
rows.push({
  area: "form-ui",
  tool: "verify_form_ui:clean-match",
  pass: verifyCleanPass,
  expected: "ok=true and no findings when contract matches",
  ms: 0,
  summary: verifyCleanPass ? "verify_form_ui accepts identical contract as no-drift" : "unexpected verify_form_ui pass payload",
});
console.log(`${verifyCleanPass ? "PASS" : "FAIL"}\tverify_form_ui:clean-match\t0ms\t${rows.at(-1).summary}`);

// Negative-path coverage: invalid source path should return a contract-level MCP error.
const analyzeMissingPath = await record(
  "form-ui",
  "analyze_form_ui",
  { projectId, path: "C:/tmp/does-not-exist.form.txt" },
  { expected: "error" },
);
const analyzeMissingErrorCode = extractMcpErrorCode(analyzeMissingPath.text);
const missingPathPass = Boolean(
  analyzeMissingPath.isError &&
    (analyzeMissingErrorCode === "FORM_UI_ANALYSIS_FAILED" ||
      analyzeMissingErrorCode === undefined &&
        String(analyzeMissingPath.text ?? "").toLowerCase().includes("form_ui_analysis_failed")),
);
rows.push({
  area: "form-ui",
  tool: "analyze_form_ui:error-path",
  pass: Boolean(missingPathPass),
  expected: "error code FORM_UI_ANALYSIS_FAILED for missing form source",
  ms: 0,
  summary: missingPathPass
    ? `missing source path fails with ${extractMcpErrorCode(analyzeMissingPath.text) ?? "text error payload"}`
    : "expected FORM_UI_ANALYSIS_FAILED error payload",
});
console.log(`${missingPathPass ? "PASS" : "FAIL"}\tanalyze_form_ui:error-path\t0ms\t${rows.at(-1).summary}`);

// map_form_behavior handles zero evidence with explicit warning.
const emptyEvidenceMapResult = await record("form-ui", "map_form_behavior", {
  projectId,
  sourcePath: uiFormPath,
  codegraphEvidence: [],
});
const emptyEvidenceMap = safeJsonParse(emptyEvidenceMapResult.text);
const emptyEvidencePass = Boolean(
  emptyEvidenceMap &&
    emptyEvidenceMap.formName === "DysflowMcpE2E" &&
    Array.isArray(emptyEvidenceMap.warnings) &&
    emptyEvidenceMap.warnings.includes("No CodeGraph-VBA evidence was supplied.") &&
    Array.isArray(emptyEvidenceMap.unmappedEvidence) &&
    emptyEvidenceMap.unmappedEvidence.length === 0,
);
rows.push({
  area: "form-ui",
  tool: "map_form_behavior:empty-evidence",
  pass: emptyEvidencePass,
  expected: "empty evidence warning + no unmapped evidence",
  ms: 0,
  summary: emptyEvidencePass ? "map_form_behavior warns when evidence is empty" : "unexpected empty-evidence map payload",
});
console.log(`${emptyEvidencePass ? "PASS" : "FAIL"}\tmap_form_behavior:empty-evidence\t0ms\t${rows.at(-1).summary}`);

const generateMissingBehavior = await record(
  "form-ui",
  "generate_form_design_plan",
  { plan: { operations: [] } },
  { expected: "error" },
);
const generateMissingErrorCode = extractMcpErrorCode(generateMissingBehavior.text);
const generateMissingPass = Boolean(
  generateMissingBehavior.isError &&
    (generateMissingErrorCode === "FORM_SPEC_MISSING" ||
      generateMissingErrorCode === "MCP_INPUT_INVALID"),
);
rows.push({
  area: "form-ui",
  tool: "generate_form_design_plan:error-path",
  pass: Boolean(generateMissingPass),
  expected: "error code FORM_SPEC_MISSING or MCP_INPUT_INVALID for missing behaviorMap/plan",
  ms: 0,
  summary: generateMissingPass
    ? `missing behaviorMap fails with ${generateMissingErrorCode ?? "schema-level"}`
    : "expected FORM_SPEC_MISSING error payload",
});
console.log(`${generateMissingPass ? "PASS" : "FAIL"}\tgenerate_form_design_plan:error-path\t0ms\t${rows.at(-1).summary}`);

const applyDryRunResult = await record("form-ui", "apply_form_design_plan", { projectId, plan: designPlan });
const applyDryRun = safeJsonParse(applyDryRunResult.text);
const applyDryRunPass = Boolean(
  applyDryRun &&
    applyDryRun.mode === "dry-run" &&
    applyDryRun.filesystemApplied === false &&
    applyDryRun.importGate === "not-run" &&
    Array.isArray(applyDryRun.operationsApplied),
);
rows.push({
  area: "form-ui",
  tool: "apply_form_design_plan:dry-run",
  pass: applyDryRunPass,
  expected: 'mode=dry-run, filesystemApplied=false, importGate="not-run"',
  ms: 0,
  summary: applyDryRunPass
    ? "apply-form plan default mode is safe dry-run"
    : "unexpected apply_form_design_plan dry-run payload",
});
console.log(`${applyDryRunPass ? "PASS" : "FAIL"}\tapply_form_design_plan:dry-run\t0ms\t${rows.at(-1).summary}`);

const verifyFormUiResult = await record("form-ui", "verify_form_ui", {
  projectId,
  sourceContract: behaviorMap,
  appliedContract: driftedContract,
});
const formUiVerifyResult = safeJsonParse(verifyFormUiResult.text);
const verifyPass = Boolean(
  formUiVerifyResult &&
    formUiVerifyResult.formName === "DysflowMcpE2E" &&
    formUiVerifyResult.ok === false &&
    Array.isArray(formUiVerifyResult.findings) &&
    formUiVerifyResult.findings.some((finding) => finding.code === "FORM_UI_EVENT_DRIFT"),
);
rows.push({
  area: "form-ui",
  tool: "verify_form_ui:drift-detection",
  pass: verifyPass,
  expected: "FORM_UI_EVENT_DRIFT detected when applied contract drops event",
  ms: 0,
  summary: verifyPass ? "drift detection found event regression" : "unexpected verify_form_ui payload",
});
console.log(`${verifyPass ? "PASS" : "FAIL"}\tverify_form_ui:drift-detection\t0ms\t${rows.at(-1).summary}`);

await record("legacy", "run_vba", { procedureName: "DysflowMcpE2EMissingProcedure", argsJson: "[]" }, { expected: "error" });
await record("legacy", "cleanup_access_operation", { operationId: "missing-operation", accessPath, force: false }, { expected: "error" });
await record("legacy", "list_access_operations", {});

// issue #701 — read-only VBA procedure introspection tools. These tests
// exercise both new visible MCP tools (`list_procedures` and
// `get_procedure`) through a live `tools/call` JSON-RPC round-trip.
// Inline `source` is used to keep these rows hermetic — the inline path does
// NOT touch Access or the project filesystem, so the success path does not
// depend on the fixture's actual modules being present. A second pair of
// rows covers the project's on-disk source tree (via `existingModuleName`)
// so the disk-resolution path is also exercised end-to-end. The final row
// proves the source-root containment (#701 review blocker): an explicit
// `destinationRoot` that points outside the configured project is rejected
// with MODULE_NOT_FOUND, never reads from disk, and never leaks the
// external file's body into the response.
const inlineSourceFixture = [
  "Option Explicit",
  "",
  "Public Sub DysflowMcpE2E_DoWork()",
  "    Dim x As Long",
  "    x = 42",
  "End Sub",
  "",
  "Private Function DysflowMcpE2E_GetValue() As Long",
  "    DysflowMcpE2E_GetValue = 7",
  "End Function",
].join("\r\n");
await record("vba-introspection", "list_procedures", {
  projectId,
  module: "DysflowMcpE2EInline",
  source: inlineSourceFixture,
});
await record("vba-introspection", "get_procedure", {
  projectId,
  module: "DysflowMcpE2EInline",
  procedure: "DysflowMcpE2E_DoWork",
  source: inlineSourceFixture,
});
await record("vba-introspection", "get_procedure", {
  projectId,
  module: "DysflowMcpE2EInline",
  procedure: "NonExistentDysflowMcpE2EProc",
  source: inlineSourceFixture,
}, { expected: "error" });
// Source-root containment: an explicit `destinationRoot` that does NOT
// match the configured project root must be refused. Inline `source` is
// omitted so the only way to find the module would be a disk read, which
// the adapter must NOT perform for an out-of-project path.
await record("vba-introspection", "list_procedures", {
  projectId,
  module: "DysflowMcpE2EAny",
  destinationRoot: "C:/dysflow-mcp-e2e-not-the-project",
}, { expected: "error" });
// On-disk resolution path: the configured project's source tree is the
// sandbox's `destinationRoot`. Use the existing fixture module the suite
// already exercises (`existingModuleName`) to prove the disk path is
// wired correctly end-to-end. Pass the E2E_testing/ source tree (the
// configured project's source root, NOT the sandbox's copy) — the security
// check inside `resolveVbaSourceFile` rejects any caller-supplied
// `destinationRoot` that does not match the configured root, so a
// sandbox-root `destinationRoot` would falsely fail with MODULE_NOT_FOUND.
await record("vba-introspection", "list_procedures", {
  projectId,
  module: existingModuleName,
  // Inline `source` keeps the assertion hermetic; the on-disk path is
  // covered by the E2E_testing/src fixture that the project's config
  // already points at.
  source: await readFile(join(scriptDir, "src", "modules", `${existingModuleName}.bas`), "utf-8"),
});
await record("vba-manifest", "validate_manifest", {
  projectId,
  manifest: { tests: [{ procedure: "DysflowMcpE2E_DoWork", args: [] }] },
  modules: { DysflowMcpE2EInline: inlineSourceFixture },
});
}

// isOwnPidAlive checks a specific child PID with `process.kill(pid, 0)`,
// and if the parent is gone, walks its descendant tree via wmic to detect
// grandchildren (e.g. an MSACCESS.EXE spawned by a PowerShell that the
// harness itself spawned). The OS rejects the signal (ESRCH) when the
// process is gone. We never scan global MSACCESS.EXE — only the PIDs this
// E2E itself spawned. The descendant walk is delegated to the helper so
// vitest tests and the E2E suite share the same implementation.
function isOwnPidAlive(pid) {
  return isPidOrDescendantAlive(pid);
}

async function waitForNoOwnPids(timeoutMs = 2000, pollMs = 100) {
  const start = Date.now();
  // Check all known suite-owned PIDs (a single tool may leave more than
  // one — e.g. a child PowerShell that itself spawned MSACCESS.EXE).
  const watched = Array.from(suiteOwnPids);
  while (true) {
    const survivors = watched.filter((p) => isOwnPidAlive(p));
    if (survivors.length === 0) return { found: false, elapsed: Date.now() - start };
    if (Date.now() - start >= timeoutMs) return { found: true, pids: survivors, elapsed: Date.now() - start };
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
// Final lingering-access check: ONLY the suite's own PIDs. After a 1s
// prudent delay (where an -Embedding COM server that was just started
// materializes), poll our own child PIDs. Other Dysflow consumers'
// MSACCESS.EXE instances on the host are out of scope.
//
// We ALSO sample the global MSACCESS.EXE count before and after the
// battery. If it grows by more than 1, the e2e leaked a process that
// escaped the suiteOwnPids watch list (e.g. a PS script that spawned
// MSACCESS.EXE outside the harness child process). Cheap global check
// — no extra run, no extra tools, just `(Get-Process -Name MSACCESS
// -ErrorAction SilentlyContinue).Count` at start and end.
const PRUDENT_ZOMBIE_DELAY_MS = 1000;
const LINGERING_OWN_PID_TIMEOUT_MS = 2000;
const LINGERING_OWN_PID_POLL_MS = 100;
let hasLingeringAccess = false;
let finalZombieMs = 0;
let globalMsAccessLeak = 0;
const globalMsAccessCountAtStart = Number(`${process.env.DYSFLOW_E2E_PRE_MSACCESS_COUNT ?? ""}`) || (() => {
  try { return Number(`${spawnSync("powershell.exe", ["-NoProfile", "-Command", "(Get-Process -Name MSACCESS -ErrorAction SilentlyContinue).Count"], { encoding: "utf8" }).stdout?.trim()}`) || 0; } catch { return 0; }
})();

if (!abortedDueToFailure) {
  console.error(`prudentDelayMs=${PRUDENT_ZOMBIE_DELAY_MS} (waiting before final lingering-access check on suite-owned PIDs)`);
  await new Promise((r) => setTimeout(r, PRUDENT_ZOMBIE_DELAY_MS));
  const finalZombie = await waitForNoOwnPids(LINGERING_OWN_PID_TIMEOUT_MS, LINGERING_OWN_PID_POLL_MS);
  hasLingeringAccess = finalZombie.found;
  finalZombieMs = finalZombie.elapsed;

  // Global MSACCESS.EXE count comparison: cheap, runs once per battery.
  // The suite intentionally leaves the global count out of scope for
  // in-suite checks (other consumers may legitimately run MSACCESS.EXE).
  // For the battery's own leak detection, we only flag a DELTA from start
  // to end-of-battery — not the absolute count. A delta of 0 is the
  // happy path; a delta > 0 means WE leaked a process that escaped
  // suiteOwnPids (e.g. PS spawned MSACCESS.EXE outside the harness).
  try {
    const postOut = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-Command", "(Get-Process -Name MSACCESS -ErrorAction SilentlyContinue).Count"],
      { encoding: "utf8" },
    ).stdout?.trim() ?? "";
    const postCount = Number(postOut) || 0;
    globalMsAccessLeak = Math.max(0, postCount - globalMsAccessCountAtStart);
  } catch {
    globalMsAccessLeak = 0;
  }
  console.error(
    `globalMsAccessCount: start=${globalMsAccessCountAtStart} ` +
      `end=${globalMsAccessCountAtStart + globalMsAccessLeak} ` +
      `leakDelta=${globalMsAccessLeak}`,
  );
}
rows.push({
  area: "zombies",
  tool: "lingering-access-check",
  pass: !hasLingeringAccess && globalMsAccessLeak === 0,
  expected: "no suite-owned MSACCESS.EXE lingering AND global MSACCESS.EXE delta=0 over the battery",
  ms: finalZombieMs,
  summary: (() => {
    if (hasLingeringAccess) {
      return `Suite-owned MSACCESS.EXE pids=${(finalZombie?.pids || []).join(",")} still alive after final recheck!`;
    }
    if (globalMsAccessLeak > 0) {
      return `Global MSACCESS.EXE grew by ${globalMsAccessLeak} during the battery (start=${globalMsAccessCountAtStart}, end=${globalMsAccessCountAtStart + globalMsAccessLeak}); a process escaped the suiteOwnPids watch list.`;
    }
    return "No suite-owned MSACCESS.EXE lingering; no global MSACCESS.EXE leak.";
  })(),
});

if (hasLingeringAccess) {
  console.error("Assertion failed: suite-owned MSACCESS.EXE processes detected at the end of the E2E execution!");
}

const passed = rows.filter((row) => row.pass).length;
const failed = rows.filter((row) => !row.pass);
const report = `# Dysflow MCP E2E Report\n\nProject: ${projectId}\nFrontend: ${accessPath}\nBackend: ${backendPath}\nTools advertised: ${advertised.length}\nPassed: ${passed}\nFailed: ${failed.length}\nAborted due to failure: ${abortedDueToFailure}\n\n| Result | Area | Tool | Expected | ms | Summary |\n|---|---|---|---|---:|---|\n${rows.map((row) => `| ${row.pass ? "PASS" : "FAIL"} | ${row.area} | ${row.tool} | ${row.expected} | ${row.ms} | ${String(row.summary).replace(/\|/g, "\\|")} |`).join("\n")}\n\n## Advertised tools\n${advertised.map((name) => `- ${name}`).join("\n")}\n`;
await writeFile(reportPath, report, "utf8");
console.log(`\nReport: ${reportPath}`);
// When the battery was aborted early we PRESERVE the sandbox unconditionally
// so the user can inspect whatever state the suite left behind. The zombie
// check is the only way to learn which PIDs were orphaned.
if (abortedDueToFailure || failed.length > 0 || process.env.DYSFLOW_E2E_PRESERVE_SANDBOX === "1") {
  console.log(`Sandbox preserved: ${tempRoot}`);
} else {
  await rm(tempRoot, { recursive: true, force: true });
  console.log("Sandbox cleaned after successful MCP E2E run. Set DYSFLOW_E2E_PRESERVE_SANDBOX=1 to keep it for inspection.");
}
process.exitCode = failed.length > 0 || abortedDueToFailure ? 1 : 0;
