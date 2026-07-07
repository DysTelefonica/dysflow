/**
 * Schema regression pin for `feat-759-no-compile` (#759, v1.19.0, hard break).
 *
 * The `compile_vba` tool, the `compile` parameter on `import_modules` /
 * `import_all`, and the `rollbackOnCompileFail` parameter on `import_modules`
 * are gone in v1.19.0. The schemas are `additionalProperties: false`, so
 * passing any of these rejected properties now throws `MCP_INPUT_INVALID`
 * BEFORE any PowerShell invocation.
 *
 * Locks the contract across three regression surfaces so a stray re-add is
 * caught:
 *   1. `import_modules({ compile: true })` → MCP_INPUT_INVALID
 *   2. `import_modules({ rollbackOnCompileFail: true })` → MCP_INPUT_INVALID
 *   3. `import_all({ compile: true })` → MCP_INPUT_INVALID
 *   4. `test_vba` schema does NOT expose a `compile` property
 *
 * Mirrors the pattern from `compare-module-registration.test.ts` and
 * `compact-repair-schema.test.ts`. Any future re-introduction would need a
 * deliberate PR widening the schemas.
 */
import { describe, expect, it } from "vitest";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { validateInput } from "../../../../src/shared/validation/index.js";

describe("feat-759-no-compile — schema rejection of the removed compile surface", () => {
  describe("import_modules", () => {
    it("rejects { compile: true } with MCP_INPUT_INVALID (additionalProperties:false)", () => {
      const result = validateInput(
        { moduleNames: ["Foo"], compile: true },
        VBA_SYNC_TOOL_SCHEMAS.import_modules,
      );
      expect(result).toBeDefined();
      expect(result).toMatch(/compile is not allowed/i);
    });

    it("rejects { rollbackOnCompileFail: true } with MCP_INPUT_INVALID", () => {
      const result = validateInput(
        { moduleNames: ["Foo"], rollbackOnCompileFail: true },
        VBA_SYNC_TOOL_SCHEMAS.import_modules,
      );
      expect(result).toBeDefined();
      expect(result).toMatch(/rollbackOnCompileFail is not allowed/i);
    });

    it("import_modules schema no longer declares a 'compile' property", () => {
      expect(VBA_SYNC_TOOL_SCHEMAS.import_modules.properties).not.toHaveProperty("compile");
    });

    it("import_modules schema no longer declares a 'rollbackOnCompileFail' property", () => {
      expect(VBA_SYNC_TOOL_SCHEMAS.import_modules.properties).not.toHaveProperty(
        "rollbackOnCompileFail",
      );
    });
  });

  describe("import_all", () => {
    it("rejects { compile: true } with MCP_INPUT_INVALID (additionalProperties:false)", () => {
      const result = validateInput({ compile: true }, VBA_SYNC_TOOL_SCHEMAS.import_all);
      expect(result).toBeDefined();
      expect(result).toMatch(/compile is not allowed/i);
    });

    it("import_all schema no longer declares a 'compile' property", () => {
      expect(VBA_SYNC_TOOL_SCHEMAS.import_all.properties).not.toHaveProperty("compile");
    });
  });

  describe("test_vba", () => {
    it("test_vba schema does NOT expose a 'compile' property", () => {
      expect(VBA_SYNC_TOOL_SCHEMAS.test_vba.properties).not.toHaveProperty("compile");
    });

    it("test_vba still accepts its canonical proceduresJson shape (positive control)", () => {
      // Sanity guard: removing the compile property must not regress test_vba's
      // real surface. The proceduresJson-only payload must still validate.
      const result = validateInput(
        { proceduresJson: '["Test_A"]' },
        VBA_SYNC_TOOL_SCHEMAS.test_vba,
      );
      expect(result).toBeUndefined();
    });
  });
});
