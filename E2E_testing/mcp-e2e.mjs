import { spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
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
await mkdir(join(tempRoot, "ERD"), { recursive: true });

const sqlScript = join(tempRoot, "script.sql");
const formSpec = join(tempRoot, "form-spec.json");
const queriesExportPath = join(tempRoot, "exports", "queries.json");
const probeTable = `ZZZ_DysflowMcpE2E_${Date.now()}`;
await writeFile(sqlScript, `INSERT INTO [${probeTable}] ([ID], [Name]) VALUES (2, 'script')\n`, "utf8");
await writeFile(formSpec, JSON.stringify({ name: "Form_DysflowMcpE2E", kind: "Form", controls: [] }), "utf8");

const ctx = { projectId, accessPath, backendPath, destinationRoot, projectRoot: scriptDir };
const backendTarget = { accessPath, backendPath, databasePath: backendPath };
const rows = [];
const existingModuleName = "Funciones Generales";

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
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch {}
      try { child.kill(); } catch {}
      resolveCall(result);
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
        finish({ response, exit: { code: 0, signal: null }, stdout, stderr, timedOut: false, isError, text: toolText(response) });
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => finish({ response, exit: { code: null, signal: "SPAWN_ERROR" }, stdout, stderr, timedOut: false, isError: true, text: error.message }));
    child.on("close", (code, signal) => {
      if (!settled) finish({ response, exit: { code, signal }, stdout, stderr, timedOut: false, isError: true, text: response ? toolText(response) : "MCP process closed before response" });
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
  return result;
}

const list = await record("protocol", "tools/list");
let advertised = [];
try { advertised = list.response.result.tools.map((tool) => tool.name).sort(); } catch {}
rows.push({ area: "protocol", tool: "advertised-tool-count", pass: advertised.length === 48, expected: "48 tools", ms: 0, summary: `advertised=${advertised.length}` });

await record("diagnostics", "dysflow_doctor", { projectId, includeEnvironment: true });
await record("query", "dysflow_query_execute", { projectId, sql: "SELECT COUNT(*) AS RowCount FROM TbNoConformidades", mode: "read", backendPath });
await record("vba", "dysflow_vba_execute", { projectId, procedureName: "DysflowMcpE2EMissingProcedure" }, { expected: "error" });
await record("operations", "dysflow_access_operations_list", {});
await record("operations", "dysflow_access_cleanup", { operationId: "missing-operation", accessPath, force: false }, { expected: "error" });

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
await record("vba-sync", "import_modules", { ...ctx, moduleNames: ["DysflowMcpE2EMissing"], importMode: "code", dryRun: true, compile: false });
await record("vba-sync", "import_all", { ...ctx, importMode: "code", dryRun: true, compile: false });
await record("vba-sync", "compile_vba", { ...ctx, timeoutMs: 60000 }, { timeoutMs: 60000 });
await record("vba-sync", "test_vba", { ...ctx, proceduresJson: "[]" }, { expected: "error" });
await record("vba-sync", "verify_code", { ...ctx, moduleNames: [existingModuleName], diff: false });
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

const passed = rows.filter((row) => row.pass).length;
const failed = rows.filter((row) => !row.pass);
const report = `# Dysflow MCP E2E Report\n\nProject: ${projectId}\nFrontend: ${accessPath}\nBackend: ${backendPath}\nTools advertised: ${advertised.length}\nPassed: ${passed}\nFailed: ${failed.length}\n\n| Result | Area | Tool | Expected | ms | Summary |\n|---|---|---|---|---:|---|\n${rows.map((row) => `| ${row.pass ? "PASS" : "FAIL"} | ${row.area} | ${row.tool} | ${row.expected} | ${row.ms} | ${String(row.summary).replace(/\|/g, "\\|")} |`).join("\n")}\n\n## Advertised tools\n${advertised.map((name) => `- ${name}`).join("\n")}\n`;
await writeFile(reportPath, report, "utf8");
console.log(`\nReport: ${reportPath}`);
process.exitCode = failed.length > 0 ? 1 : 0;
