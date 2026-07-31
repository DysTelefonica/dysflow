import { describe, expect, it } from "vitest";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas";

const affectedTools = [
  "inspect_form",
  "compare_form",
  "lint_form_code",
  "analyze_form_ui",
  "map_form_behavior",
  "render_form_preview",
  "analyze_form_layout",
  "verify_form_bindings",
  "form_get_geometry",
  "form_list_controls",
] as const;

describe("form read tools expose the Access target override", () => {
  it.each(affectedTools)("%s exposes accessPath in its public schema", (tool) => {
    expect(VBA_SYNC_TOOL_SCHEMAS[tool].properties).toHaveProperty("accessPath");
  });
});
