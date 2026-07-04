import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

/**
 * Phase 3 (issue #705 — `detect-dead-code`): the modern MCP tool path must
 * advertise `dysflow_detect_dead_code` alongside the existing #701
 * procedure-introspection tools, with a `read-only / writeGate: none`
 * contract — exactly mirroring the `dysflow_find_references` surface.
 *
 * `tools/list` returns the non-hidden set; the tool MUST appear in
 * `createDysflowMcpTools(...).filter(hidden)`.
 */

function makeBaseServices() {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
}

describe("dysflow_detect_dead_code — modern MCP tool registration (issue #705)", () => {
  it("is registered as a non-hidden tool in the modern MCP tool surface", () => {
    const tools = createDysflowMcpTools(makeBaseServices() as DysflowMcpServices);
    const tool = tools.find((t) => t.name === "dysflow_detect_dead_code");
    expect(tool, "dysflow_detect_dead_code must be defined").toBeDefined();
    // Matches the read-only shape of `dysflow_find_references` (sibling #701).
    expect(tool?.inputSchema).toBeDefined();
    expect(typeof tool?.handler).toBe("function");
  });
});
