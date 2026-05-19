import { describe, expect, it } from "vitest";
import { LEGACY_DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/legacy-tool-inventory";
import { LEGACY_PARITY_REGISTRY } from "../../../src/adapters/mcp/legacy-parity-registry";
import { HIDDEN_STUB_TOOL_NAMES } from "../../../src/adapters/mcp/tools";

/**
 * Contract test: every tool that has a real handler route in tools.ts
 * must have status "implemented" in the parity registry.
 *
 * "Real handler route" means the tool is NOT a hidden stub
 * (i.e., NOT in HIDDEN_STUB_TOOL_NAMES — those always return LEGACY_TOOL_NOT_IMPLEMENTED).
 */
describe("legacy-parity-registry implementedToolNames contract", () => {
  it("marks every non-stub tool as implemented in the registry", () => {
    const registryByName = new Map(LEGACY_PARITY_REGISTRY.map((entry) => [entry.name, entry]));

    const mismatches: string[] = [];
    for (const name of LEGACY_DYSFLOW_MCP_TOOL_NAMES) {
      if (HIDDEN_STUB_TOOL_NAMES.has(name)) continue; // stubs legitimately return NOT_IMPLEMENTED
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

  it("keeps hidden stub tools as pending in the registry", () => {
    const registryByName = new Map(LEGACY_PARITY_REGISTRY.map((entry) => [entry.name, entry]));

    for (const name of HIDDEN_STUB_TOOL_NAMES) {
      const entry = registryByName.get(name);
      expect(entry?.status, `${name} is a hidden stub and should remain "pending"`).toBe("pending");
    }
  });
});
