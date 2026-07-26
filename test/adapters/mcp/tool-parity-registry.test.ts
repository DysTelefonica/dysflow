import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GeneratedDispatchToolName } from "../../../src/adapters/mcp/dispatch-routes";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry";
import { TOOL_PARITY_REGISTRY } from "../../../src/adapters/mcp/tool-parity-registry";
import { ALIAS_TOOL_NAMES, MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/tools";

const HAND_AUTHORED_TOOL_NAME_LIST_PATTERNS = [
  /new Set<DysflowMcpToolName>\(\s*\[/,
  /:\s*(?:readonly\s+)?DysflowMcpToolName\[\]\s*=\s*\[/,
];

function containsHandAuthoredToolNameList(source: string): boolean {
  return HAND_AUTHORED_TOOL_NAME_LIST_PATTERNS.some((pattern) => pattern.test(source));
}

describe("tool-parity-registry implementation-state contract", () => {
  it("derives implementation status without a second hand-authored tool-name set", () => {
    const sourcePath = fileURLToPath(
      new URL("../../../src/adapters/mcp/tool-parity-registry.ts", import.meta.url),
    );
    const source = readFileSync(sourcePath, "utf8");

    // Runtime behavior cannot distinguish a registry derived from the canonical
    // names from a duplicated list with identical values, so this architectural
    // constraint requires source inspection (or an equivalent lint rule).
    expect(containsHandAuthoredToolNameList(source)).toBe(false);
    expect(
      containsHandAuthoredToolNameList('const names: DysflowMcpToolName[] = ["query_execute"];'),
    ).toBe(true);
  });

  it("TOOL_PARITY_REGISTRY covers every canonical tool name exactly once", () => {
    expect(TOOL_PARITY_REGISTRY.map((entry) => entry.name)).toEqual(DYSFLOW_MCP_TOOL_NAMES);
  });

  it("MCP_TOOL_ROUTES covers every generated-dispatch tool with an explicit non-stub route", () => {
    const generatedDispatchNames = DYSFLOW_MCP_TOOL_NAMES.filter(
      (name): name is GeneratedDispatchToolName => !ALIAS_TOOL_NAMES.has(name),
    );

    for (const name of generatedDispatchNames) {
      const route = MCP_TOOL_ROUTES[name];
      expect(route, `${name} must have an explicit route`).toBeDefined();
      expect(
        (route as { kind: string }).kind,
        `${name} must not be stub in MCP_TOOL_ROUTES`,
      ).not.toBe("stub");
    }
    expect(Object.keys(MCP_TOOL_ROUTES).length).toBe(generatedDispatchNames.length);
  });

  it("does not assign generated-dispatch routes to alias-owned tools", () => {
    for (const name of ALIAS_TOOL_NAMES) {
      expect(MCP_TOOL_ROUTES).not.toHaveProperty(name);
    }
  });
});
