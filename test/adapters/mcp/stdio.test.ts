import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { JsonLineMcpStdioRuntime } from "../../../src/adapters/mcp/stdio.js";

const packageVersion = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
const stdioSource = readFileSync("src/adapters/mcp/stdio.ts", "utf8");

function writeMessage(input: PassThrough, message: unknown): void {
  input.write(`${JSON.stringify(message)}\n`);
}

async function collectOutput(output: PassThrough): Promise<unknown[]> {
  await new Promise<void>((resolve) => output.once("finish", resolve));
  return output
    .read()
    ?.toString("utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line: string) => JSON.parse(line)) ?? [];
}

describe("JsonLineMcpStdioRuntime", () => {
  it("preserves runtime-first startMcpStdioAdapter overload", () => {
    expect(stdioSource).toContain("function startMcpStdioAdapter(runtime?: McpStdioRuntime)");
    expect(stdioSource).toContain("isMcpStdioRuntime(configOrRuntime)");
  });

  it("does not hardcode the initialize server version", () => {
    expect(stdioSource).not.toContain('version: "0.1.0"');
  });

  it("answers initialize, tools/list, and tools/call over JSON-RPC lines", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });
    runtime.registerTool({
      name: "dysflow.echo",
      description: "Echo test tool",
      handler: async (args) => ({ content: [{ type: "text", text: JSON.stringify(args) }], isError: false }),
    });

    const started = runtime.start();
    writeMessage(input, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    writeMessage(input, { jsonrpc: "2.0", method: "notifications/initialized" });
    writeMessage(input, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    writeMessage(input, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "dysflow.echo", arguments: { ok: true } } });
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({ id: 1, result: expect.objectContaining({ protocolVersion: expect.any(String), serverInfo: { name: "dysflow", version: packageVersion } }) }),
      expect.objectContaining({ id: 2, result: { tools: [expect.objectContaining({ name: "dysflow.echo", description: "Echo test tool" })] } }),
      expect.objectContaining({ id: 3, result: { content: [{ type: "text", text: '{"ok":true}' }], isError: false } }),
    ]);
  });

  it("returns JSON-RPC errors for unsupported methods", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    const started = runtime.start();
    writeMessage(input, { jsonrpc: "2.0", id: 99, method: "unknown/method" });
    input.end();
    await started;
    output.end();

    await expect(collectOutput(output)).resolves.toEqual([
      expect.objectContaining({ id: 99, error: expect.objectContaining({ code: -32601 }) }),
    ]);
  });
});
