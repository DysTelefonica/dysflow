import { describe, expect, it } from "vitest";
import { importOutputReportsModuleFailure } from "../../../src/adapters/vba-sync/import-output-inspection";

/**
 * issue #951 — `importOutputReportsModuleFailure` detects a structured
 * `DYSFLOW_RESULT` import payload that carries per-module failures, even when
 * the PowerShell process exited 0. It is intentionally the inverse concern of
 * `importOutputIsFullySuccessful` (#861): that helper needs positive proof of
 * success to OVERRIDE a non-zero exit; this one needs positive proof of
 * failure to VETO a zero exit. An empty array (the `import_all` explicit
 * empty no-op plan) proves neither and must NOT report failure.
 */
describe("importOutputReportsModuleFailure (#951)", () => {
  it("reports failure for the ok:false failure envelope", () => {
    expect(
      importOutputReportsModuleFailure({
        ok: false,
        error: { code: "VBA_IMPORT_FAILED", message: "Import no pudo completar algunos modulos" },
        modules: [{ module: "Form_X", status: "error" }],
      }),
    ).toBe(true);
  });

  it("reports failure for an array containing an error entry", () => {
    expect(
      importOutputReportsModuleFailure([
        { module: "ModOk", status: "ok" },
        { module: "ModBroken", status: "error" },
      ]),
    ).toBe(true);
  });

  it("reports failure for a single unwrapped per-module error record", () => {
    // PowerShell unwraps a single-element array on ConvertTo-Json.
    expect(
      importOutputReportsModuleFailure({
        module: "Form_X",
        status: "error",
        phase: "remove-existing",
      }),
    ).toBe(true);
  });

  it("does NOT report failure for an empty array (import_all explicit no-op plan)", () => {
    expect(importOutputReportsModuleFailure([])).toBe(false);
  });

  it("does NOT report failure for an all-ok module array", () => {
    expect(
      importOutputReportsModuleFailure([
        { module: "ModA", status: "ok" },
        { module: "ModB", status: "ok" },
      ]),
    ).toBe(false);
  });

  it("does NOT report failure for a single ok record", () => {
    expect(importOutputReportsModuleFailure({ module: "ModA", status: "ok" })).toBe(false);
  });

  it("does NOT report failure for payloads without ok/status markers", () => {
    expect(importOutputReportsModuleFailure(undefined)).toBe(false);
    expect(importOutputReportsModuleFailure(null)).toBe(false);
    expect(importOutputReportsModuleFailure("text")).toBe(false);
    expect(importOutputReportsModuleFailure(42)).toBe(false);
    expect(importOutputReportsModuleFailure({ imported: 3 })).toBe(false);
    expect(importOutputReportsModuleFailure([{ imported: 3 }])).toBe(false);
  });
});
