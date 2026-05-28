import { spawn } from "node:child_process";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliCommand =
  process.env.DYSFLOW_E2E_COMMAND ??
  join(process.env.LOCALAPPDATA ?? "", "dysflow", "bin", "dysflow.cmd");

async function callMcp(toolName, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const child = spawn(cliCommand, ["mcp"], {
      cwd: scriptDir,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ACCESS_VBA_PASSWORD: "placeholder" },
    });

    let buffer = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.stdin.end(); } catch {}
      try { child.kill(); } catch {}
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ isError: true, text: "TIMEOUT", timedOut: true }),
      timeoutMs,
    );

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        const nl = buffer.indexOf("\n");
        if (nl < 0) break;
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== 2) continue;
        const isError = Boolean(msg?.error || msg?.result?.isError);
        const text =
          msg?.result?.content?.map((c) => c.text ?? "").join("") ??
          msg?.error?.message ??
          "";
        finish({ isError, text, timedOut: false });
      }
    });
    child.on("error", (err) => finish({ isError: true, text: err.message, timedOut: false }));
    child.on("close", () => {
      if (!settled) finish({ isError: true, text: "closed before response", timedOut: false });
    });

    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "guard-test", version: "1" } },
      }) + "\n",
    );
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n",
    );
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "tools/call",
        params: { name: toolName, arguments: args },
      }) + "\n",
    );
  });
}

const cases = [
  { tool: "query_sql",            args: { sql: "DROP TABLE TbConfiguracion" },                        expectError: true,  label: "query_sql rejects DROP" },
  { tool: "query_sql",            args: { sql: "DELETE FROM TbNoConformidades" },                     expectError: true,  label: "query_sql rejects DELETE" },
  { tool: "query_sql",            args: { sql: "INSERT INTO T VALUES (1)" },                          expectError: true,  label: "query_sql rejects INSERT" },
  { tool: "query_sql",            args: { sql: "CREATE TABLE ZZZ (ID INT)" },                         expectError: true,  label: "query_sql rejects CREATE" },
  { tool: "query_sql",            args: { sql: "  update T set x=1" },                                expectError: true,  label: "query_sql rejects UPDATE (leading space)" },
  { tool: "dysflow_query_execute", args: { sql: "DROP TABLE TbConfiguracion", mode: "read" },         expectError: true,  label: "dysflow_query_execute rejects DROP in read mode" },
  { tool: "dysflow_query_execute", args: { sql: "DELETE FROM TbNoConformidades", mode: "read" },      expectError: true,  label: "dysflow_query_execute rejects DELETE in read mode" },
  { tool: "dysflow_query_execute", args: { sql: "ALTER TABLE T ADD col INT", mode: "read" },          expectError: true,  label: "dysflow_query_execute rejects ALTER in read mode" },
];

let passed = 0;
let failed = 0;

for (const { tool, args, expectError, label } of cases) {
  const result = await callMcp(tool, args);
  const ok = result.timedOut ? false : result.isError === expectError;
  const status = ok ? "PASS" : "FAIL";
  console.log(`${status}\t${label}\t${result.timedOut ? "TIMEOUT" : result.text.slice(0, 120)}`);
  if (ok) passed++; else failed++;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
