/**
 * Regression guard: export_modules and export_all accept `exportPath`.
 *
 * The adapter honors `exportPath` to redirect the export away from the project's
 * default `src/` (issue #185), but the MCP schema used `additionalProperties:
 * false` WITHOUT listing `exportPath`, so an MCP caller passing it got
 * `MCP_INPUT_INVALID: exportPath is not allowed` — the feature was unreachable
 * through the MCP boundary. Lock the property into both schemas.
 */
import { describe, expect, it } from "vitest";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas.js";

describe("export tools expose exportPath in their MCP schema", () => {
  for (const tool of ["export_modules", "export_all"] as const) {
    it(`${tool} schema lists exportPath`, () => {
      const schema = (
        VBA_SYNC_TOOL_SCHEMAS as Record<string, { properties?: Record<string, unknown> }>
      )[tool];
      expect(schema?.properties).toHaveProperty("exportPath");
    });
  }
});
