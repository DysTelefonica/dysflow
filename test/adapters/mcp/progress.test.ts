import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { JsonLineMcpStdioRuntime } from "../../../src/adapters/mcp/stdio.js";
import type { McpToolContext } from "../../../src/adapters/mcp/types.js";

function writeMessage(input: PassThrough, message: unknown): void {
  input.write(`${JSON.stringify(message)}\n`);
}

async function collectOutput(output: PassThrough): Promise<unknown[]> {
  await new Promise<void>((resolve) => output.once("finish", resolve));
  const raw = output.read()?.toString("utf8") ?? "";
  return raw
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line: string) => JSON.parse(line));
}

describe("JsonLineMcpStdioRuntime — progress notifications", () => {
  it("emits a notifications/progress frame before the result when progressToken is set", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    let capturedContext: McpToolContext | undefined;

    runtime.registerTool({
      name: "dysflow.progress.test",
      description: "Tool that emits progress",
      handler: async (_args, context) => {
        capturedContext = context;
        context?.sendProgress(40, 100, "Executing");
        return { content: [{ type: "text", text: "done" }], isError: false };
      },
    });

    const started = runtime.start();

    writeMessage(input, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "dysflow.progress.test",
        arguments: {},
        _meta: { progressToken: "tok-abc" },
      },
    });

    input.end();
    await started;
    output.end();

    const frames = await collectOutput(output);
    expect(frames).toHaveLength(2);

    // First frame is the notification — no id field
    const notification = frames[0] as Record<string, unknown>;
    expect(notification).not.toHaveProperty("id");
    expect(notification["jsonrpc"]).toBe("2.0");
    expect(notification["method"]).toBe("notifications/progress");
    const params = notification["params"] as Record<string, unknown>;
    expect(params["progressToken"]).toBe("tok-abc");
    expect(params["progress"]).toBe(40);
    expect(params["total"]).toBe(100);
    expect(params["message"]).toBe("Executing");

    // Second frame is the result — has id
    const result = frames[1] as Record<string, unknown>;
    expect(result["id"]).toBe(7);
    expect(result["result"]).toBeDefined();

    // context had sendProgress as a callable function
    expect(typeof capturedContext?.sendProgress).toBe("function");
  });

  it("emits no notifications/progress frame when progressToken is absent", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    runtime.registerTool({
      name: "dysflow.progress.noop",
      description: "Tool that emits progress but has no token",
      handler: async (_args, context) => {
        // sendProgress is undefined when no token — calling it must not throw
        context?.sendProgress?.(50, undefined, undefined);
        return { content: [{ type: "text", text: "done" }], isError: false };
      },
    });

    const started = runtime.start();

    writeMessage(input, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "dysflow.progress.noop",
        arguments: {},
        // No _meta.progressToken
      },
    });

    input.end();
    await started;
    output.end();

    const frames = await collectOutput(output);

    // Only the result frame — no notification
    expect(frames).toHaveLength(1);
    const result = frames[0] as Record<string, unknown>;
    expect(result["id"]).toBe(8);
    expect(result["result"]).toBeDefined();
  });

  it("omits total and message fields when not provided to sendProgress", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const runtime = new JsonLineMcpStdioRuntime({ input, output });

    runtime.registerTool({
      name: "dysflow.progress.minimal",
      description: "Tool that emits progress with only percent",
      handler: async (_args, context) => {
        context?.sendProgress(50);
        return { content: [{ type: "text", text: "done" }], isError: false };
      },
    });

    const started = runtime.start();

    writeMessage(input, {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "dysflow.progress.minimal",
        arguments: {},
        _meta: { progressToken: "tok-xyz" },
      },
    });

    input.end();
    await started;
    output.end();

    const frames = await collectOutput(output);
    expect(frames).toHaveLength(2);

    const notification = frames[0] as Record<string, unknown>;
    const params = notification["params"] as Record<string, unknown>;
    expect(params["progress"]).toBe(50);
    expect(params).not.toHaveProperty("total");
    expect(params).not.toHaveProperty("message");
  });
});
