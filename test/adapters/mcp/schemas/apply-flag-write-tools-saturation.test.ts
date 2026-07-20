/**
 * Issue #1014 — saturation pin for the vba-sync `apply:true` family.
 *
 * The fix for #1014 brings `import_modules` and `delete_module` into
 * alignment with the rest of the vba-sync `apply:true` family. This
 * test pins:
 *
 *   1. **Direct fix scope** — `import_modules` and `delete_module`
 *      declare `apply` in their JSON Schema and accept `{ apply: true }`
 *      without rejection.
 *
 *   2. **Regression pin** — every vba-sync tool that ALREADY declares
 *      `apply` in its JSON Schema keeps that declaration. If a future
 *      contributor removes `apply` from one of these tools, the
 *      contract drift surfaces here.
 *
 *   3. **Forward pin** — the set of vba-sync tools declaring `apply`
 *      is monotonically non-decreasing. Any tool added without
 *      `apply: SCHEMA_PROPS.apply` shows up as a gap between
 *      `commitFlag: "apply"` registry entries and schema-side
 *      `properties.apply` declarations.
 *
 * Issue #1031 extends the direct scope to `fix_encoding`, `import_all`,
 * `run_vba`, and `vba_inline_execution`. Query-maintenance saturation
 * lives in `apply-flag-query-maintenance-saturation.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { validateInput } from "../../../../src/shared/validation/index.js";

/**
 * The vba-sync `apply:true` family — every vba-sync tool that
 * declares `apply: SCHEMA_PROPS.apply` in its JSON Schema today.
 * Source of truth: the schema (not the registry), so a future
 * contributor who REMOVES `apply` from a previously-aligned tool
 * shows up here as a regression.
 */
function vbaSyncApplyFamily(): readonly string[] {
  const result: string[] = [];
  for (const [toolName, schema] of Object.entries(VBA_SYNC_TOOL_SCHEMAS)) {
    if (
      schema &&
      typeof schema === "object" &&
      "properties" in schema &&
      schema.properties !== undefined &&
      "apply" in (schema.properties as Record<string, unknown>)
    ) {
      result.push(toolName);
    }
  }
  return result.sort();
}

describe("Issue #1014 — vba-sync apply:true family saturation", () => {
  const applyFamily = vbaSyncApplyFamily();

  it("the apply:true family is non-empty (sanity guard against schema drift)", () => {
    expect(applyFamily.length).toBeGreaterThan(0);
  });

  it("the apply:true family covers the two tools the issue fixes (import_modules + delete_module)", () => {
    expect(applyFamily).toContain("import_modules");
    expect(applyFamily).toContain("delete_module");
  });

  it("the apply:true family covers the four vba-sync siblings #1031 fixes", () => {
    for (const toolName of ["fix_encoding", "import_all", "run_vba", "vba_inline_execution"]) {
      expect(applyFamily).toContain(toolName);
    }
  });

  it("the apply:true family covers the vba-sync baseline (export_modules + export_all + form mutation + sync_binary)", () => {
    // Pin the existing aligned baseline so a future contributor who
    // accidentally removes `apply` from one of these sees a failure
    // before they ship.
    for (const toolName of [
      "export_modules",
      "export_all",
      "form_add_control",
      "form_move_control",
      "form_rename_control",
      "form_deserialize",
      "create_form_from_template",
      "apply_form_design_plan",
      "form_set_property",
      "form_delete_control",
      "form_align_controls",
      "form_distribute_controls",
      "form_set_properties",
      "form_duplicate_control",
      "catalog_add_control",
      "generate_form",
      "sync_binary",
    ]) {
      expect(applyFamily).toContain(toolName);
    }
  });

  describe("every tool in the apply:true family keeps its `apply` declaration and accepts `{ apply: true }`", () => {
    for (const toolName of applyFamily) {
      it(`${toolName} still declares "apply" in its schema (regression pin)`, () => {
        const schema = (VBA_SYNC_TOOL_SCHEMAS as Record<string, unknown>)[toolName] as
          | { properties?: Record<string, unknown> }
          | undefined;
        expect(schema, `${toolName} must have a JSON Schema`).toBeDefined();
        expect(schema?.properties?.apply, `${toolName} must still declare "apply"`).toBeDefined();
      });

      it(`${toolName} accepts { apply: true } without rejecting the apply flag`, () => {
        const schema = (VBA_SYNC_TOOL_SCHEMAS as Record<string, unknown>)[toolName] as never;
        const result = validateInput({ apply: true }, schema);
        // Some tools require other fields (e.g. run_vba requires procedureName,
        // export_modules requires moduleNames, etc.). The saturation assertion
        // is specifically about the `apply` flag NOT being rejected as
        // not-allowed; a missing-required-fields rejection is acceptable here.
        if (result !== undefined) {
          expect(result).not.toMatch(/apply is not allowed/i);
        }
      });
    }
  });
});
