/**
 * Regression guard for the compare-tool consolidation.
 *
 * verify_code / verify_binary / reconcile_binary / compare_module were four names
 * over one engine (compareSourceAgainstBinary). They are collapsed into a single
 * tool, verify_code, that does whole-project AND single-module comparison and
 * carries an aggregated recommendation. This test locks the removal across all 5
 * registration surfaces so a stray re-introduction is caught, and confirms
 * verify_code remains fully registered.
 *
 * Surfaces:
 *   1. VBA_SYNC_TOOL_NAMES   — mcp-tool-registry.ts
 *   2. tool-parity-registry  — tool-parity-registry.ts (via TOOL_MAP)
 *   3. MCP_TOOL_ROUTES       — dispatch-routes.ts
 *   4. VBA_SYNC_TOOL_SCHEMAS — vba-sync-schemas.ts
 *   5. VbaModulesAdapter.handles() — vba-modules-adapter.ts
 */
import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/dispatch-routes.js";
import { VBA_SYNC_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { TOOL_PARITY_REGISTRY } from "../../../src/adapters/mcp/tool-parity-registry.js";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter.js";

const REMOVED_TOOLS = ["verify_binary", "reconcile_binary", "compare_module"] as const;
const parityNames = new Set(TOOL_PARITY_REGISTRY.map((tool) => tool.name));

describe("compare-tool consolidation — removed names are absent from every surface", () => {
  for (const tool of REMOVED_TOOLS) {
    it(`${tool} is gone from all 5 registration surfaces`, () => {
      expect((VBA_SYNC_TOOL_NAMES as readonly string[]).includes(tool)).toBe(false);
      expect(parityNames.has(tool as never)).toBe(false);
      expect((MCP_TOOL_ROUTES as Record<string, unknown>)[tool]).toBeUndefined();
      expect((VBA_SYNC_TOOL_SCHEMAS as Record<string, unknown>)[tool]).toBeUndefined();
      expect(VbaModulesAdapter.handles(tool)).toBe(false);
    });
  }
});

describe("compare-tool consolidation — verify_code remains the single compare tool", () => {
  it("verify_code is registered across all 5 surfaces", () => {
    const TOOL = "verify_code";
    expect((VBA_SYNC_TOOL_NAMES as readonly string[]).includes(TOOL)).toBe(true);
    expect(parityNames.has(TOOL)).toBe(true);
    const route = (MCP_TOOL_ROUTES as Record<string, { kind: string }>)[TOOL];
    expect(route?.kind).toBe("vba-sync");
    expect((VBA_SYNC_TOOL_SCHEMAS as Record<string, unknown>)[TOOL]).toBeDefined();
    expect(VbaModulesAdapter.handles(TOOL)).toBe(true);
  });

  it("verify_code schema exposes the unified knobs (moduleNames, strict, diff)", () => {
    const schema = (VBA_SYNC_TOOL_SCHEMAS as Record<string, unknown>).verify_code as {
      properties?: Record<string, unknown>;
    };
    expect(schema?.properties).toHaveProperty("moduleNames");
    expect(schema?.properties).toHaveProperty("strict");
    expect(schema?.properties).toHaveProperty("diff");
  });
});
