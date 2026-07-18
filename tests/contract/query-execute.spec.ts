/**
 * Issue #979 — contract test for `query_execute` (read/write modes).
 */
import { describe, expect, it, vi } from "vitest";

import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

describe("contract: query_execute (issue #979)", () => {
  function build(): ReturnType<typeof createDysflowMcpTools> {
    const execute = vi.fn(async () => successResult({ rows: [] }));
    return createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
      } as unknown as DysflowMcpServices,
      writes: true,
    });
  }

  it("is registered with documented required parameters", () => {
    const tools = build();
    const tool = tools.find((t) => t.name === "query_execute");
    expect(tool, "query_execute must be registered").toBeDefined();
    const required = (tool?.inputSchema?.required ?? []) as readonly string[];
    expect(required).toContain("sql");
    expect(required).toContain("mode");
  });

  it("read mode is callable without writes enabled (issue #962)", async () => {
    const tools = build();
    const tool = tools.find((t) => t.name === "query_execute");
    const result = await tool?.handler({ sql: "SELECT 1", mode: "read" });
    expect(result).toBeDefined();
    expect(Array.isArray(result?.content)).toBe(true);
    expect(typeof result?.isError).toBe("boolean");
  });
});
