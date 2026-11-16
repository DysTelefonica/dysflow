/**
 * #1993 T3c — `callToolInProcess` rejects, instead of waiting forever, when
 * the in-process MCP server cannot start (R3-inprocess-start-failure). The
 * detached runner turns that rejection into a terminal `failed` state.
 */
import { describe, expect, it } from "vitest";
import { callToolInProcess } from "../../../src/adapters/mcp/in-process-tool-call";
import type { StdioServerOptions } from "../../../src/adapters/mcp/stdio";
import type { DysflowMcpTool } from "../../../src/adapters/mcp/tools";

const echo: DysflowMcpTool = {
  name: "echo",
  description: "echo",
  inputSchema: { type: "object", properties: {}, additionalProperties: true },
  handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
} as unknown as DysflowMcpTool;

function withinSeconds<T>(seconds: number, work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`did not settle within ${seconds} s`)), seconds * 1_000),
    ),
  ]);
}

describe("callToolInProcess (#1993)", () => {
  it("rejects with the start error when the server cannot start", async () => {
    const broken = {} as StdioServerOptions;
    Object.defineProperty(broken, "toolSurface", {
      get() {
        throw new Error("server options unavailable");
      },
    });

    await expect(withinSeconds(5, callToolInProcess([echo], broken, "echo", {}))).rejects.toThrow(
      "server options unavailable",
    );
  });

  it("returns the tool result when the server starts", async () => {
    await expect(callToolInProcess([echo], {}, "echo", {})).resolves.toMatchObject({
      content: [{ type: "text", text: "ok" }],
    });
  });
});
