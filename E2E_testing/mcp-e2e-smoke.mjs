import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const cli = join(root, "dist", "cli", "index.js");
const cwd = scriptDir;
const projectId = "lanzadera";
const tempRoot = join(cwd, ".dysflow", "e2e-temp");
const runtimeRoot = join(cwd, ".dysflow", "e2e-runtime");
const requiredPasswordEnv = ["DYSFLOW_ACCESS_PASSWORD", "DYSFLOW_BACKEND_PASSWORD", "ACCESS_VBA_PASSWORD"];
const missingPasswordEnv = requiredPasswordEnv.filter((name) => !process.env[name]);

if (missingPasswordEnv.length > 0) {
  console.error(`Missing required E2E password environment variable(s): ${missingPasswordEnv.join(", ")}`);
  console.error("Set them in the shell before running this smoke script; do not hardcode fixture passwords in source.");
  process.exit(1);
}

await mkdir(tempRoot, { recursive: true });
await mkdir(join(runtimeRoot, "app", "scripts"), { recursive: true });
await copyFile(join(root, "scripts", "dysflow-access-runner.ps1"), join(runtimeRoot, "app", "scripts", "dysflow-access-runner.ps1"));
await copyFile(join(root, "scripts", "dysflow-vba-manager.ps1"), join(runtimeRoot, "app", "scripts", "dysflow-vba-manager.ps1"));

const env = {
  ...process.env,
  DYSFLOW_HOME: runtimeRoot,
};

const results = [];
let id = 1;

function textOf(result) {
  return result?.content?.map((item) => item.text ?? "").join("\n") ?? JSON.stringify(result);
}

function parseTextJson(result) {
  const text = result?.text ?? textOf(result);
  try { return JSON.parse(text); } catch { return undefined; }
}

async function callMcp(name, args = {}, options = {}) {
  const requestId = id++;
  const timeoutMs = options.timeoutMs ?? 90000;
  const child = spawn(process.execPath, [cli, "mcp"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  const timer = setTimeout(() => child.kill(), timeoutMs);
  const frames = [
    { jsonrpc: "2.0", id: requestId * 1000 + 1, method: "initialize", params: {} },
    name === "tools/list"
      ? { jsonrpc: "2.0", id: requestId, method: "tools/list" }
      : { jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name, arguments: args } },
  ];
  child.stdin.end(frames.map((frame) => JSON.stringify(frame)).join("\n") + "\n");

  const exit = await new Promise((resolveExit) => child.on("close", (code, signal) => resolveExit({ code, signal })));
  clearTimeout(timer);

  const messages = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return { parseError: line }; }
  });
  const response = messages.find((message) => message.id === requestId);
  if (!response) {
    return { ok: false, timeout: exit.signal !== null, exit, stderr, stdout, result: undefined, error: "No response frame" };
  }
  if (response.error) return { ok: false, exit, stderr, stdout, rpcError: response.error };
  const isError = response.result?.isError === true;
  return { ok: !isError, isError, exit, stderr, stdout, result: response.result, text: textOf(response.result) };
}

async function testCase(area, tool, args, expect = "success", options = {}) {
  const started = Date.now();
  const actualTool = options.actualTool ?? tool;
  const response = await callMcp(actualTool, args, options);
  const durationMs = Date.now() - started;
  const expectedError = expect === "error";
  const pass = expectedError ? response.isError === true || response.ok === false : response.ok === true;
  results.push({
    area,
    tool,
    pass,
    expected: expect,
    durationMs,
    summary: response.text?.slice(0, 300) ?? response.rpcError?.message ?? response.error ?? response.stderr?.slice(0, 300) ?? "",
  });
  return response;
}

const list = await callMcp("tools/list", {});
results.push({ area: "protocol", tool: "tools/list", pass: list.ok, expected: "success", durationMs: 0, summary: list.ok ? `advertised=${list.result.tools.length}` : (list.error ?? list.stderr) });
const advertised = list.result?.tools?.map((tool) => tool.name).sort() ?? [];

await testCase("diagnostics", "dysflow_doctor", { includeEnvironment: false });
await testCase("operations", "dysflow_access_operations_list", {});
await testCase("operations", "list_access_operations", {});

const tablesResponse = await testCase("schema/read", "list_tables", {});
const tablesData = parseTextJson(tablesResponse);
const table = tablesData?.tables?.find((name) => !String(name).startsWith("MSys")) ?? tablesData?.tables?.[0];

if (table) {
  await testCase("schema/read", "get_schema", { tableName: table });
  await testCase("schema/read", "count_rows", { tableName: table });
  await testCase("schema/read", "query_sql", { sql: `SELECT TOP 1 * FROM [${table}]` });
  await testCase("schema/read", "dysflow_query_execute", { sql: `SELECT TOP 1 * FROM [${table}]`, mode: "read" });
} else {
  results.push({ area: "schema/read", tool: "table-dependent-read", pass: false, expected: "success", durationMs: 0, summary: "No table found from list_tables" });
}

await testCase("schema/read", "list_linked_tables", {});
await testCase("schema/read", "list_access_files", { directory: cwd });
await testCase("schema/read", "get_relationships", {});
await testCase("schema/read", "compare_backends", { comparePath: join(cwd, "Expedientes_datos.accdb") });
await testCase("schema/read", "list_links", {});
await testCase("schema/read", "export_queries", { exportPath: join(tempRoot, "queries.json") });

const writeTable = `ZZZ_DYSFLOW_E2E_${Date.now()}`;
const scriptPath = join(tempRoot, "create-table.sql");
await writeFile(scriptPath, `CREATE TABLE [${writeTable}_SCRIPT] (ID LONG);`, "utf8");
await testCase("write guard", "exec_sql dryRun", { sql: `CREATE TABLE [${writeTable}] (ID LONG)`, dryRun: true }, "success", { actualTool: "exec_sql" });
await testCase("write guard", "create_table dryRun", { tableName: writeTable, definition: "ID LONG", dryRun: true }, "success", { actualTool: "create_table" });
await testCase("write guard", "drop_table dryRun", { tableName: writeTable, dryRun: true }, "success", { actualTool: "drop_table" });
await testCase("write guard", "seed_fixture dryRun", { tableName: writeTable, rows: [{ ID: 1 }], dryRun: true, allowTable: writeTable }, "success", { actualTool: "seed_fixture" });
await testCase("write guard", "teardown_fixture dryRun", { tableName: writeTable, dryRun: true, allowTable: writeTable }, "success", { actualTool: "teardown_fixture" });
await testCase("write guard", "run_script dryRun", { scriptPath, dryRun: true }, "success", { actualTool: "run_script" });
await testCase("write guard", "dysflow_query_execute write", { sql: `CREATE TABLE [${writeTable}] (ID LONG)`, mode: "write" }, "success", { actualTool: "dysflow_query_execute" });
await testCase("write guard", "drop_table cleanup", { tableName: writeTable, dryRun: false, apply: true }, "success", { actualTool: "drop_table" });

await testCase("links", "link_tables dryRun", { backendPath: join(cwd, "Expedientes_datos.accdb"), dryRun: true }, "success", { actualTool: "link_tables" });
await testCase("links", "relink_tables dryRun", { backendPath: join(cwd, "Expedientes_datos.accdb"), dryRun: true }, "success", { actualTool: "relink_tables" });
await testCase("links", "localize_backend_links dryRun", { dryRun: true }, "success", { actualTool: "localize_backend_links" });
await testCase("links", "unlink_table dryRun", { tableName: "ZZZ_NO_SUCH_LINK", dryRun: true }, "success", { actualTool: "unlink_table" });
await testCase("queries", "import_queries dryRun", { queryDefinitions: [{ name: "qZZZ_DYSFLOW_E2E", sql: "SELECT 1 AS One" }], dryRun: true }, "success", { actualTool: "import_queries" });
await testCase("maintenance", "compact_repair dryRun", { databasePath: join(cwd, "Expedientes_datos.accdb"), dryRun: true }, "success", { actualTool: "compact_repair" });

await testCase("vba-sync", "list_objects", {});
await testCase("vba-sync", "compile_vba", {}, "success", { timeoutMs: 60000 });
await testCase("vba-sync", "test_vba fast-invalid", { proceduresJson: JSON.stringify([{ name: "E2E_NoSuchFastTest", procedure: "E2E_NoSuchFastTest", tags: ["e2e"] }]) }, "error", { actualTool: "test_vba" });
await testCase("vba-sync", "run_vba invalid", { procedureName: "E2E_NoSuchProcedure" }, "error", { actualTool: "run_vba" });
await testCase("vba-sync", "exists", { moduleName: "E2E_NoSuchObject" });
await testCase("vba-sync", "export_all", { destinationRoot: join(tempRoot, "export-all") }, "success");
await testCase("vba-sync", "export_modules", { destinationRoot: join(tempRoot, "export-modules"), moduleNames: ["E2E_NoSuchModule"] }, "error", { timeoutMs: 60000 });
await testCase("vba-sync", "import_all dryRun", { dryRun: true }, "success", { actualTool: "import_all" });
await testCase("vba-sync", "import_modules dryRun", { moduleNames: ["E2E_NoSuchModule"], dryRun: true }, "success", { actualTool: "import_modules" });
await testCase("vba-sync", "delete_module unsupported dryRun", { moduleName: "E2E_NoSuchModule", dryRun: true }, "error", { actualTool: "delete_module" });
await testCase("vba-sync", "fix_encoding", { location: "Src" }, "success");
await testCase("vba-sync", "generate_erd", { backendPath: join(cwd, "Expedientes_datos.accdb"), erdPath: join(tempRoot, "erd.md") }, "success", { timeoutMs: 60000 });

await testCase("forms", "validate_form_spec missing", {}, "error", { actualTool: "validate_form_spec" });
await testCase("forms", "validate_form_spec inline", { spec: { name: "E2E_Form", controls: [] } }, "success", { actualTool: "validate_form_spec" });
await testCase("forms", "generate_form dryRun", { name: "E2E_Form", spec: { name: "E2E_Form", controls: [] }, dryRun: true }, "success", { actualTool: "generate_form" });
await testCase("forms", "catalog_add_control", { catalogPath: join(tempRoot, "catalog.json"), controlName: "txtE2E", controlType: "TextBox" });
await testCase("forms", "harvest_form_catalog", { catalogPath: join(tempRoot, "catalog.json"), filter: "E2E" });

for (const implemented of ["verify_code", "verify_binary", "reconcile_binary"]) {
  await testCase("verify", implemented, { moduleNames: ["Test_JsonConverter"], diff: true }, "success");
}

await testCase("operations", "cleanup invalid", { operationId: "E2E_NO_SUCH_OPERATION", accessPath: join(cwd, "Expedientes.accdb") }, "error", { actualTool: "dysflow_access_cleanup" });

const cleanupList = await callMcp("dysflow_access_operations_list", {});
const cleanupData = parseTextJson(cleanupList);
const ops = Array.isArray(cleanupData) ? cleanupData : [];
for (const op of ops.filter((item) => item?.status !== "cleaned" && item?.operationId && item?.accessPath).slice(0, 10)) {
  await testCase("operations", `cleanup ${op.operationId}`, { operationId: op.operationId, accessPath: op.accessPath }, "error", { actualTool: "dysflow_access_cleanup" });
}

const rows = results.map((r) => `| ${r.pass ? "PASS" : "FAIL"} | ${r.area} | ${r.tool} | ${r.expected} | ${r.durationMs} | ${String(r.summary).replace(/\r?\n/g, " ").replace(/\|/g, "\\|")} |`).join("\n");
const report = `# Dysflow MCP E2E smoke report\n\nProject: ${projectId}\nCWD: ${cwd}\nAdvertised tools: ${advertised.length}\nPassed: ${results.filter((r) => r.pass).length}\nFailed: ${results.filter((r) => !r.pass).length}\n\n| Result | Area | Tool/Test | Expected | ms | Summary |\n|---|---|---|---|---:|---|\n${rows}\n\n## Advertised tools\n\n${advertised.map((name) => `- ${name}`).join("\n")}\n`;
await writeFile(join(tempRoot, "mcp-e2e-report.md"), report, "utf8");
console.log(report);

process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
