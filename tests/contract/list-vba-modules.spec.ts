/**
 * Issue #979 — contract test for `list_vba_modules` (read-only inventory tool).
 */
import { describe, expect, it } from "vitest";

import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";

describe("contract: list_vba_modules (issue #979)", () => {
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

  it("is registered", () => {
    const tools = build();
    const tool = tools.find((t) => t.name === "list_vba_modules");
    expect(tool, "list_vba_modules must be registered").toBeDefined();
  });

  it("inputSchema is a JSON-Schema object", () => {
    const tools = build();
    const tool = tools.find((t) => t.name === "list_vba_modules");
    expect(tool?.inputSchema?.type).toBe("object");
  });

  it("returns McpToolResult envelope shape on empty input", async () => {
    const tools = build();
    const tool = tools.find((t) => t.name === "list_vba_modules");
    const result = await tool?.handler({});
    expect(result).toBeDefined();
    expect(Array.isArray(result?.content)).toBe(true);
    expect(typeof result?.isError).toBe("boolean");
  });
});
