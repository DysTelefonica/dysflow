import { describe, expect, it } from "vitest";
import { MCP_TOOL_QUERY_ACTIONS, MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/tools.js";

/**
 * Guards the typed tool-name -> AccessQueryRequest["action"] map that replaced
 * the unvalidated `name as action` cast. The compiler enforces the union value
 * type; this test enforces COVERAGE: every query-routed tool has an action, and
 * non-query routes (vba-sync) do not leak into the action map.
 */
describe("MCP_TOOL_QUERY_ACTIONS", () => {
  const queryRoutedNames = Object.entries(MCP_TOOL_ROUTES)
    .filter(([, route]) => route.kind !== "vba-sync")
    .map(([name]) => name);

  it("provides an action for every query-routed tool", () => {
    for (const name of queryRoutedNames) {
      expect(MCP_TOOL_QUERY_ACTIONS).toHaveProperty(name);
    }
  });

  it("does not include any vba-sync tool", () => {
    const vbaNames = Object.entries(MCP_TOOL_ROUTES)
      .filter(([, route]) => route.kind === "vba-sync")
      .map(([name]) => name);
    for (const name of vbaNames) {
      expect(MCP_TOOL_QUERY_ACTIONS).not.toHaveProperty(name);
    }
  });

  it("maps each tool name to its own name as the action (1:1 identity binding)", () => {
    for (const [name, action] of Object.entries(MCP_TOOL_QUERY_ACTIONS)) {
      expect(action).toBe(name);
    }
  });
});
