/**
 * Issue #979 — contract test for `resolve_project` (#963).
 *
 * Documents the read-only contract for project resolution.
 */
import { describe, expect, it } from "vitest";

import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";

describe("contract: resolve_project (issue #979)", () => {
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

  it("is registered with optional projectId parameter", () => {
    const tools = build();
    const tool = tools.find((t) => t.name === "resolve_project");
    expect(tool, "resolve_project must be registered").toBeDefined();
    const required = (tool?.inputSchema?.required ?? []) as readonly string[];
    expect(required.length).toBe(0);
    const props = tool?.inputSchema?.properties ?? {};
    expect("projectId" in props).toBe(true);
  });

  it("returns McpToolResult envelope shape on empty input (cwd-derived)", async () => {
    const tools = build();
    const tool = tools.find((t) => t.name === "resolve_project");
    const result = await tool?.handler({});
    expect(result).toBeDefined();
    expect(Array.isArray(result?.content)).toBe(true);
    expect(typeof result?.isError).toBe("boolean");
    expect(typeof result?.ok).toBe("boolean");
  });
});
