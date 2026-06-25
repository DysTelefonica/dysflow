import { spawn, execSync } from "node:child_process";
import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const projectId = "noconformidades-e2e";
const accessPath = join(scriptDir, "NoConformidades.accdb");
const backendPath = join(scriptDir, "NoConformidades_Datos.accdb");
const destinationRoot = join(scriptDir, "src");
const tempRoot = join(scriptDir, ".dysflow", "mcp-e2e-temp");
const reportPath = join(tempRoot, "mcp-e2e-report.md");
const cliCommand = process.env.DYSFLOW_E2E_COMMAND ?? join(process.env.LOCALAPPDATA ?? "", "dysflow", "bin", "dysflow.cmd");
const timeoutMs = Number(process.env.DYSFLOW_E2E_TIMEOUT_MS ?? 30000);
const password = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD ?? process.env.DYSFLOW_BACKEND_PASSWORD;

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

for (const [label, fixturePath] of [["accessPath", accessPath], ["backendPath", backendPath]]) {
  try { await access(fixturePath); } catch {
    console.error(`Missing E2E fixture: ${label}=${fixturePath}`);
    console.error("Copy the NoConformidades.accdb and NoConformidades_Datos.accdb files into E2E_testing/ before running the suite.");
    process.exit(1);
  }
}

await rm(tempRoot, { recursive: true, force: true });
await mkdir(tempRoot, { recursive: true });
await mkdir(join(tempRoot, "exports"), { recursive: true });
await mkdir(join(tempRoot, "exports", "prune"), { recursive: true });
await mkdir(join(tempRoot, "ERD"), { recursive: true });

const sqlScript = join(tempRoot, "script.sql");
const formSpec = join(tempRoot, "form-spec.json");
const queriesExportPath = join(tempRoot, "exports", "queries.json");
const pruneExportPath = join(tempRoot, "exports", "prune");
const probeTable = `ZZZ_DysflowMcpE2E_${Date.now()}`;
await writeFile(sqlScript, `INSERT INTO [${probeTable}] ([ID], [Name]) VALUES (2, 'script')\n`, "utf8");
await writeFile(formSpec, JSON.stringify({ name: "Form_DysflowMcpE2E", kind: "Form", controls: [] }), "utf8");

const ctx = { projectId, accessPath, backendPath, destinationRoot, projectRoot: scriptDir };
const backendTarget = { accessPath, backendPath, databasePath: backendPath };
const rows = [];
const existingModuleName = "Funciones Generales";

// Baseline PIDs: Access processes already running before the suite starts.
// Per-call zombie checks exclude these so pre-existing instances don't cause false failures.
const suiteBaselinePids = new Set();
try {
  const baselineOut = execSync('tasklist /FI "IMAGENAME eq MSACCESS.EXE" /FO CSV /NH', { encoding: "utf8" });
  for (const line of baselineOut.trim().split(/\r?\n/).filter(Boolean)) {
    const pid = parseInt(line.split(",")[1]?.replace(/"/g, "") ?? "", 10);
    if (!isNaN(pid)) suiteBaselinePids.add(pid);
  }
} catch {}

function toolText(message) {
  return message?.result?.content?.map((item) => item.text ?? "").join("\n") ?? message?.error?.message ?? "";
}

function normalize(text) {
  return String(text ?? "").replace(/\s+/g, " ").slice(0, 260);
}

async function callMcp(method, params = {}, options = {}) {
  return await new Promise((resolveCall) => {
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
    let stdout = "";
    let stderr = "";
    let buffer = "";
    let response;
    let settled = false;

    const requestId = 2;
    let resultPending = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch {}
      try { child.kill(); } catch {}
      resolveCall({ ...result, childPid: child.pid });
    };
    const timer = setTimeout(() => {
      finish({ response, exit: { code: null, signal: "TIMEOUT" }, stdout, stderr, timedOut: true, isError: true, text: "Timed out waiting for MCP response" });
    }, options.timeoutMs ?? timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      buffer += text;
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id !== requestId) continue;
        response = message;
        const isError = Boolean(response?.error || response?.result?.isError);
        resultPending = { response, exit: { code: null, signal: null }, stdout, stderr, timedOut: false, isError, text: toolText(response) };
        clearTimeout(timer);
        try { child.stdin.end(); } catch {}
        try { child.kill(); } catch {}
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => finish({ response, exit: { code: null, signal: "SPAWN_ERROR" }, stdout, stderr, timedOut: false, isError: true, text: error.message }));
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (resultPending) {
        resultPending.exit = { code, signal };
        resolveCall({ ...resultPending, childPid: child.pid });
      } else {
        resolveCall({ response, exit: { code, signal }, stdout, stderr, timedOut: false, isError: true, text: response ? toolText(response) : "MCP process closed before response", childPid: child.pid });
      }
    });

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "dysflow-mcp-e2e", version: "1" } } }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
    child.stdin.write(JSON.stringify(method === "tools/list"
      ? { jsonrpc: "2.0", id: requestId, method: "tools/list", params: {} }
      : { jsonrpc: "2.0", id: requestId, method: "tools/call", params }) + "\n");
  });
}

async function record(area, tool, args = {}, options = {}) {
  const started = Date.now();
  const method = tool === "tools/list" ? "tools/list" : "tools/call";
  const params = tool === "tools/list" ? {} : { name: tool, arguments: args };
  const result = await callMcp(method, params, options);
  const ms = Date.now() - started;
  const expectedError = options.expected === "error";
  const pass = result.timedOut ? false : expectedError ? result.isError : !result.isError;
  rows.push({ area, tool, pass, expected: options.expected ?? "success", ms, summary: normalize(result.text || result.stderr || JSON.stringify(result.exit)) });
  console.log(`${pass ? "PASS" : "FAIL"}\t${tool}\t${ms}ms\t${rows.at(-1).summary}`);

  const zombie = await waitForNoZombies(result.childPid, 5000, 200);
  const zombiePass = !zombie.found;
  const zombieTool = `${tool}:zombie-check`;
  rows.push({
    area,
    tool: zombieTool,
    pass: zombiePass,
    expected: "no MSACCESS.EXE",
    ms: zombie.elapsed,
    summary: zombie.found ? `Zombie MSACCESS.EXE lingered after ${tool}` : "clean",
  });
  console.log(`${zombiePass ? "PASS" : "FAIL"}\t${zombieTool}\t${zombie.elapsed}ms\t${rows.at(-1).summary}`);

  return result;
}

const list = await record("protocol", "tools/list");
let advertised = [];
try { advertised = list.response.result.tools.map((tool) => tool.name).sort(); } catch {}
// Advertised (non-hidden) tool count. Pinned at unit speed by
// test/adapters/mcp/advertised-tool-count.test.ts — update both together.
rows.push({ area: "protocol", tool: "advertised-tool-count", pass: advertised.length === 51, expected: "51 tools", ms: 0, summary: `advertised=${advertised.length}` });

await record("diagnostics", "dysflow_doctor", { projectId, includeEnvironment: true });
await record("query", "dysflow_query_execute", { projectId, sql: "SELECT COUNT(*) AS RowCount FROM TbNoConformidades", mode: "read", backendPath });
await record("vba", "dysflow_vba_execute", { projectId, procedureName: "DysflowMcpE2EMissingProcedure" }, { expected: "error" });
await record("operations", "dysflow_access_operations_list", {});
await record("operations", "dysflow_access_cleanup", { operationId: "missing-operation", accessPath, force: false }, { expected: "error" });
await record("operations", "dysflow_access_force_cleanup_orphaned", { projectId, accessPath, confirmPid: 999999 }, { expected: "error" });

await record("query", "query_sql", { projectId, ...backendTarget, sql: "SELECT COUNT(*) AS RowCount FROM TbNoConformidades" });
await record("security", "query_sql", { projectId, sql: "DROP TABLE TbConfiguracion" }, { expected: "error" });
await record("security", "dysflow_query_execute", { projectId, sql: "DELETE FROM TbNoConformidades", mode: "read" }, { expected: "error" });
await record("query", "list_tables", { projectId, ...backendTarget });
await record("query", "get_schema", { projectId, ...backendTarget, tableName: "TbNoConformidades" });
await record("query", "count_rows", { projectId, accessPath, backendPath, tableName: "TbNoConformidades" });
await record("query", "distinct_values", { projectId, accessPath, backendPath, tableName: "TbNoConformidades", columnName: "ESTADO" });
await record("query", "list_linked_tables", { projectId, accessPath, backendPath });
await record("query", "list_links", { projectId, accessPath });
await record("query", "get_relationships", { projectId, ...backendTarget });
await record("query", "compare_backends", { projectId, accessPath, backendPath, comparePath: backendPath });
await record("query", "list_access_files", { projectId, rootPath: scriptDir });
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
await record("links", "unlink_table", { projectId, accessPath, tableName: "DysflowMcpE2EMissing", dryRun: false });
await record("links", "relink_directory", { projectId, rootPath: scriptDir, apply: true, recursive: false, strictLocal: false });

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
await record("vba-sync", "import_modules", { ...ctx, moduleNames: ["DysflowMcpE2EMissing"], importMode: "code", dryRun: true, compile: false });
await record("vba-sync", "import_all", { ...ctx, importMode: "code", dryRun: true, compile: false });
await record("vba-sync", "compile_vba", { ...ctx, timeoutMs: 60000 }, { timeoutMs: 60000 });
await record("vba-sync", "test_vba", { ...ctx, proceduresJson: "[]" }, { expected: "error" });
const verifyResult = await record("vba-sync", "verify_code", { ...ctx, moduleNames: [existingModuleName], diff: false });
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
const singleModuleResult = await record("vba-sync", "verify_code", { ...ctx, moduleNames: [existingModuleName], diff: true });
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
await record("vba-sync", "delete_module", { ...ctx, moduleName: "DysflowMcpE2EMissing" }, { expected: "error" });
await record("vba-sync", "fix_encoding", { ...ctx, location: "Src" });
await record("vba-sync", "generate_erd", { ...ctx, backendPath, erdPath: join(tempRoot, "ERD"), timeoutMs: 120000 });

await record("forms", "validate_form_spec", { ...ctx, specPath: formSpec });
await record("forms", "generate_form", { ...ctx, specPath: formSpec, kind: "Form", name: "Form_DysflowMcpE2E", dryRun: true, replace: true });
await record("forms", "catalog_add_control", { ...ctx, specPath: formSpec, catalogPath: join(tempRoot, "catalog.json"), controlName: "txtProbe", controlType: "TextBox" });
await record("forms", "harvest_form_catalog", { ...ctx, catalogPath: join(tempRoot, "catalog.json"), filter: "DysflowMcpE2E" });

await record("legacy", "run_vba", { procedureName: "DysflowMcpE2EMissingProcedure", argsJson: "[]" }, { expected: "error" });
await record("legacy", "cleanup_access_operation", { operationId: "missing-operation", accessPath, force: false }, { expected: "error" });
await record("legacy", "list_access_operations", {});

function checkAccessProcesses(childPid) {
  try {
    const stdout = execSync('wmic process get ProcessId,ParentProcessId,Name /format:csv', { encoding: "utf8" });
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
    const parentMap = new Map();
    const nameMap = new Map();
    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length < 4) continue;
      const name = parts[1];
      const parent = parseInt(parts[2], 10);
      const pid = parseInt(parts[3], 10);
      if (!isNaN(pid) && !isNaN(parent)) {
        parentMap.set(pid, parent);
        nameMap.set(pid, name);
      }
    }

    for (const [pid, name] of nameMap.entries()) {
      if (name.toUpperCase() === "MSACCESS.EXE") {
        if (childPid) {
          let current = pid;
          let visited = new Set();
          while (current && current !== 0 && !visited.has(current)) {
            visited.add(current);
            const parent = parentMap.get(current);
            if (parent === childPid) {
              return true;
            }
            current = parent;
          }
        } else {
          if (!suiteBaselinePids.has(pid)) {
            return true;
          }
        }
      }
    }
  } catch (err) {
    try {
      const stdout = execSync('tasklist /FI "IMAGENAME eq MSACCESS.EXE" /FO CSV /NH', { encoding: "utf8" });
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      return lines.some((line) => {
        const pid = parseInt(line.split(",")[1]?.replace(/"/g, "") ?? "", 10);
        return !isNaN(pid) && !suiteBaselinePids.has(pid);
      });
    } catch (fallbackErr) {
      console.error("Failed to check processes:", fallbackErr);
    }
  }
  return false;
}

async function waitForNoZombies(childPid, timeoutMs = 30000, pollMs = 200) {
  const start = Date.now();
  while (true) {
    const found = checkAccessProcesses(childPid);
    if (!found) return { found: false, elapsed: Date.now() - start };
    if (Date.now() - start >= timeoutMs) return { found: true, elapsed: Date.now() - start };
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

const hasLingeringAccess = checkAccessProcesses();
rows.push({
  area: "zombies",
  tool: "lingering-access-check",
  pass: !hasLingeringAccess,
  expected: "no MSACCESS.EXE processes running",
  ms: 0,
  summary: hasLingeringAccess ? "Lingering MSACCESS.EXE processes detected!" : "No lingering MSACCESS.EXE processes found.",
});

if (hasLingeringAccess) {
  console.error("Assertion failed: Lingering MSACCESS.EXE processes detected at the end of the E2E execution!");
}

const passed = rows.filter((row) => row.pass).length;
const failed = rows.filter((row) => !row.pass);
const report = `# Dysflow MCP E2E Report\n\nProject: ${projectId}\nFrontend: ${accessPath}\nBackend: ${backendPath}\nTools advertised: ${advertised.length}\nPassed: ${passed}\nFailed: ${failed.length}\n\n| Result | Area | Tool | Expected | ms | Summary |\n|---|---|---|---|---:|---|\n${rows.map((row) => `| ${row.pass ? "PASS" : "FAIL"} | ${row.area} | ${row.tool} | ${row.expected} | ${row.ms} | ${String(row.summary).replace(/\|/g, "\\|")} |`).join("\n")}\n\n## Advertised tools\n${advertised.map((name) => `- ${name}`).join("\n")}\n`;
await writeFile(reportPath, report, "utf8");
console.log(`\nReport: ${reportPath}`);
process.exitCode = failed.length > 0 ? 1 : 0;
