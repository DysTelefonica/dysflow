/**
 * Issue #979 — contract test for `get_capabilities` (#656).
 *
 * Documents the read-only contract for the live snapshot tool.
 */
import { describe, expect, it } from "vitest";

import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";

describe("contract: get_capabilities (issue #979)", () => {
  function build(): ReturnType<typeof createDysflowMcpTools> {
    const noop = async () => ({ ok: true, data: {} }) as never;
    return createDysflowMcpTools({
      services: {
        vbaService: { execute: noop },
        queryService: { execute: noop },
        diagnosticsService: { run: noop },
      } as unknown as DysflowMcpServices,
    });
  }

  it("is registered with no required parameters (issue #656)", () => {
    const tools = build();
    const tool = tools.find((t) => t.name === "get_capabilities");
    expect(tool, "get_capabilities must be registered").toBeDefined();
    const required = (tool?.inputSchema?.required ?? []) as readonly string[];
    expect(required.length).toBe(0);
  });

  it("returns McpToolResult envelope shape", async () => {
    const tools = build();
    const tool = tools.find((t) => t.name === "get_capabilities");
    const result = await tool?.handler({});
    expect(result).toBeDefined();
    expect(Array.isArray(result?.content)).toBe(true);
    expect(typeof result?.isError).toBe("boolean");
    expect(typeof result?.ok).toBe("boolean");
  });
});
