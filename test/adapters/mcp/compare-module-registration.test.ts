/**
 * Parity test for the compare_module MCP tool registration.
 *
 * Guards all 5 required registration surfaces so a silently missed file causes
 * a failing test rather than a silent runtime 404. Per the design (§10.3):
 *   1. VBA_SYNC_TOOL_NAMES  — mcp-tool-registry.ts
 *   2. implementedToolNames — tool-parity-registry.ts (via getToolDefinition)
 *   3. MCP_TOOL_ROUTES      — dispatch-routes.ts
 *   4. VBA_SYNC_TOOL_SCHEMAS — vba-sync-schemas.ts
 *   5. VbaModulesAdapter.handles() — vba-modules-adapter.ts
 */
import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/dispatch-routes.js";
import { VBA_SYNC_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { getToolDefinition } from "../../../src/adapters/mcp/tool-parity-registry.js";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter.js";

describe("compare_module registration — all 5 surfaces", () => {
  const TOOL = "compare_module" as const;

  it("surface 1: VBA_SYNC_TOOL_NAMES includes compare_module", () => {
    expect((VBA_SYNC_TOOL_NAMES as readonly string[]).includes(TOOL)).toBe(true);
  });

  it("surface 2: tool-parity-registry marks compare_module as implemented (vba-sync slice)", () => {
    const def = getToolDefinition(TOOL);
    expect(def.status).toBe("implemented");
    expect(def.slice).toBe("vba-sync");
  });

  it("surface 3: dispatch-routes registers compare_module with kind vba-sync (not alias)", () => {
    const route = (MCP_TOOL_ROUTES as Record<string, { kind: string }>)[TOOL];
    expect(route).toBeDefined();
    expect(route?.kind).toBe("vba-sync");
  });

  it("surface 4: VBA_SYNC_TOOL_SCHEMAS defines compare_module schema with required moduleName and optional strict", () => {
    const schema = (VBA_SYNC_TOOL_SCHEMAS as Record<string, unknown>)[TOOL] as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(schema).toBeDefined();
    expect(schema?.required).toContain("moduleName");
    expect(schema?.properties).toHaveProperty("strict");
    expect(schema?.properties).toHaveProperty("diff");
  });

  it("surface 5: VbaModulesAdapter.handles('compare_module') returns true", () => {
    expect(VbaModulesAdapter.handles(TOOL)).toBe(true);
  });
});

describe("compare_module result shape contract (port-level)", () => {
  it("handles returns false for unrelated tools", () => {
    expect(VbaModulesAdapter.handles("query_sql")).toBe(false);
    expect(VbaModulesAdapter.handles("run_vba")).toBe(false);
    expect(VbaModulesAdapter.handles("export_modules")).toBe(true);
    expect(VbaModulesAdapter.handles("compare_module")).toBe(true);
  });
});
