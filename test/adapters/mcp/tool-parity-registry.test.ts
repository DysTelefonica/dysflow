import { describe, expect, it } from "vitest";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry";
import {
  isHiddenStubTool,
  pendingToolNames,
  TOOL_PARITY_REGISTRY,
} from "../../../src/adapters/mcp/tool-parity-registry";
import { MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/tools";

/**
 * Contract test: every tool that has a real handler route in tools.ts
 * must have status "implemented" in the parity registry.
 *
 * "Real handler route" means the tool is NOT a hidden stub
 * (i.e., isHiddenStubTool(name) is false — those always return TOOL_NOT_IMPLEMENTED).
 */
describe("tool-parity-registry implementedToolNames contract", () => {
  it("marks every non-stub tool as implemented in the registry", () => {
    const registryByName = new Map(TOOL_PARITY_REGISTRY.map((entry) => [entry.name, entry]));

    const mismatches: string[] = [];
    for (const name of DYSFLOW_MCP_TOOL_NAMES) {
      if (isHiddenStubTool(name)) continue; // stubs legitimately return NOT_IMPLEMENTED
      const entry = registryByName.get(name);
      if (entry?.status !== "implemented") {
        mismatches.push(name);
      }
    }

    expect(
      mismatches,
      `These tools have real handler routes in tools.ts but are marked "pending" in the registry: ${mismatches.join(", ")}`,
    ).toEqual([]);
  });

  it("MCP_TOOL_ROUTES covers every tool with an explicit non-stub route", () => {
    for (const name of DYSFLOW_MCP_TOOL_NAMES) {
      const route = MCP_TOOL_ROUTES[name];
      expect(route, `${name} must have an explicit route`).toBeDefined();
      if (!isHiddenStubTool(name)) {
        expect(
          (route as { kind: string }).kind,
          `${name} must not be stub in MCP_TOOL_ROUTES`,
        ).not.toBe("stub");
      }
    }
    expect(Object.keys(MCP_TOOL_ROUTES).length).toBe(DYSFLOW_MCP_TOOL_NAMES.length);
  });

  it("keeps hidden stub tools as pending in the registry", () => {
    const registryByName = new Map(TOOL_PARITY_REGISTRY.map((entry) => [entry.name, entry]));

    for (const name of pendingToolNames()) {
      const entry = registryByName.get(name);
      expect(entry?.status, `${name} is a hidden stub and should remain "pending"`).toBe("pending");
    }
  });
});
