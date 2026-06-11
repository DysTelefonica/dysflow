import { describe, expect, it } from "vitest";
import type { GeneratedDispatchToolName } from "../../../src/adapters/mcp/dispatch-routes";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry";
import {
  isHiddenStubTool,
  pendingToolNames,
  TOOL_PARITY_REGISTRY,
} from "../../../src/adapters/mcp/tool-parity-registry";
import { ALIAS_TOOL_NAMES, MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/tools";

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

  it("MCP_TOOL_ROUTES covers every generated-dispatch tool with an explicit non-stub route", () => {
    const generatedDispatchNames = DYSFLOW_MCP_TOOL_NAMES.filter(
      (name): name is GeneratedDispatchToolName => !ALIAS_TOOL_NAMES.has(name),
    );

    for (const name of generatedDispatchNames) {
      const route = MCP_TOOL_ROUTES[name];
      expect(route, `${name} must have an explicit route`).toBeDefined();
      if (!isHiddenStubTool(name)) {
        expect(
          (route as { kind: string }).kind,
          `${name} must not be stub in MCP_TOOL_ROUTES`,
        ).not.toBe("stub");
      }
    }
    expect(Object.keys(MCP_TOOL_ROUTES).length).toBe(generatedDispatchNames.length);
  });

  it("does not assign generated-dispatch routes to alias-owned tools", () => {
    for (const name of ALIAS_TOOL_NAMES) {
      expect(MCP_TOOL_ROUTES).not.toHaveProperty(name);
    }
  });

  it("has no pending tools — zero-hidden-tools policy (#510)", () => {
    expect([...pendingToolNames()]).toEqual([]);
    for (const entry of TOOL_PARITY_REGISTRY) {
      expect(entry.status, `${entry.name} must be implemented`).toBe("implemented");
    }
  });
});
