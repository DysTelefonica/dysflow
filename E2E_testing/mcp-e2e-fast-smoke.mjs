import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const cwd = scriptDir;
const cli = join(root, "dist", "cli", "index.js");
const runtimeRoot = join(cwd, ".dysflow", "e2e-runtime");
const tempRoot = join(cwd, ".dysflow", "e2e-fast-temp");
const projectId = "lanzadera";
const requiredPasswordEnv = ["DYSFLOW_ACCESS_PASSWORD", "DYSFLOW_BACKEND_PASSWORD", "ACCESS_VBA_PASSWORD"];
const missingPasswordEnv = requiredPasswordEnv.filter((name) => !process.env[name]);

if (missingPasswordEnv.length > 0) {
  console.error(`Missing required E2E password environment variable(s): ${missingPasswordEnv.join(", ")}`);
  console.error("Set them in the shell before running this smoke script; do not hardcode fixture passwords in source.");
  process.exit(1);
}

await mkdir(join(runtimeRoot, "app", "scripts"), { recursive: true });
await mkdir(tempRoot, { recursive: true });
await copyFile(join(root, "scripts", "dysflow-access-runner.ps1"), join(runtimeRoot, "app", "scripts", "dysflow-access-runner.ps1"));
await copyFile(join(root, "scripts", "dysflow-vba-manager.ps1"), join(runtimeRoot, "app", "scripts", "dysflow-vba-manager.ps1"));

const env = {
  ...process.env,
  DYSFLOW_HOME: runtimeRoot,
};

let id = 1;
const rows = [];

function textOf(result) {
  return result?.content?.map((item) => item.text ?? "").join("\n") ?? JSON.stringify(result);
}

async function callTool(name, args = {}, timeoutMs = 90000) {
  const requestId = id++;
  const child = spawn(process.execPath, [cli, "mcp"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  child.stdin.end([
    { jsonrpc: "2.0", id: requestId * 1000 + 1, method: "initialize", params: {} },
    name === "tools/list"
      ? { jsonrpc: "2.0", id: requestId, method: "tools/list" }
      : { jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name, arguments: args } },
  ].map((frame) => JSON.stringify(frame)).join("\n") + "\n");
  const exit = await new Promise((resolveExit) => child.on("close", (code, signal) => resolveExit({ code, signal })));
  clearTimeout(timer);
  const messages = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const response = messages.find((message) => message.id === requestId);
  return { response, exit, stderr, text: textOf(response?.result), ok: response?.result?.isError === false };
}

async function record(area, tool, args, expected = "success", timeoutMs, actualTool = tool) {
  const start = Date.now();
  const result = await callTool(actualTool, args, timeoutMs);
  const ms = Date.now() - start;
  const isError = result.response?.result?.isError === true || Boolean(result.response?.error) || result.exit.signal;
  const pass = expected === "error" ? isError : !isError;
  rows.push({ area, tool, pass, expected, ms, summary: (result.text || result.response?.error?.message || result.stderr || JSON.stringify(result.exit)).slice(0, 220) });
  return result;
}

const list = await callTool("tools/list", {});
const advertised = list.response?.result?.tools?.map((tool) => tool.name).sort() ?? [];
rows.push({ area: "protocol", tool: "tools/list", pass: advertised.length === 49, expected: "49 visible tools", ms: 0, summary: `advertised=${advertised.length}` });

await record("diagnostics", "dysflow_doctor", { includeEnvironment: false });
await record("operations", "dysflow_access_operations_list", {});
await record("schema", "list_tables", {});
await record("schema", "list_access_files", { directory: cwd });
await record("schema", "export_queries", { exportPath: join(tempRoot, "queries.json") });
await record("write-dryrun", "exec_sql", { sql: "CREATE TABLE [ZZZ_DYSFLOW_FAST] (ID LONG)", dryRun: true }, "success", 45000);
await record("write-dryrun", "create_table", { tableName: "ZZZ_DYSFLOW_FAST", definition: "ID LONG", dryRun: true });
await record("write-dryrun", "seed_fixture", { tableName: "ZZZ_DYSFLOW_FAST", rows: [{ ID: 1 }], allowTable: "ZZZ_DYSFLOW_FAST", dryRun: true });
await record("write-dryrun", "teardown_fixture", { tableName: "ZZZ_DYSFLOW_FAST", allowTable: "ZZZ_DYSFLOW_FAST", dryRun: true });
await record("maintenance", "compact_repair", { databasePath: join(cwd, "Expedientes_datos.accdb"), dryRun: true });
await record("verify", "verify_code", { moduleNames: ["Test_JsonConverter"], diff: true }, "success", 120000);
await record("vba", "compile_vba", {}, "success", 120000);
await record("vba", "test_vba single tiny", {
  proceduresJson: JSON.stringify([{ name: "Test_JsonConverter_TextoParsedoParaJSON_plain_text", procedure: "Test_JsonConverter_TextoParsedoParaJSON_plain_text", tags: ["fast"] }]),
}, "success", 120000, "test_vba");
await record("forms", "validate_form_spec", { spec: { name: "E2E_Fast_Form", controls: [] } });
await record("forms", "generate_form", { name: "E2E_Fast_Form", spec: { name: "E2E_Fast_Form", controls: [] }, dryRun: true });

const report = `# Dysflow fast MCP E2E report\n\nProject: ${projectId}\nCWD: ${cwd}\nPassed: ${rows.filter((r) => r.pass).length}\nFailed: ${rows.filter((r) => !r.pass).length}\n\n| Result | Area | Tool | Expected | ms | Summary |\n|---|---|---|---|---:|---|\n${rows.map((r) => `| ${r.pass ? "PASS" : "FAIL"} | ${r.area} | ${r.tool} | ${r.expected} | ${r.ms} | ${String(r.summary).replace(/\r?\n/g, " ").replace(/\|/g, "\\|")} |`).join("\n")}\n\n## Advertised tools\n${advertised.map((name) => `- ${name}`).join("\n")}\n`;
await writeFile(join(tempRoot, "mcp-e2e-fast-report.md"), report, "utf8");
console.log(report);
process.exitCode = rows.some((r) => !r.pass) ? 1 : 0;
