/**
 * Issue #785 (v2.1.1) — confirmation helper matrix for capa 4.
 *
 * Pins the contract of `requiresExportSourceConfirmation` over the
 * destructive-write combination: vary caller flags (`dryRun`, `apply`,
 * `confirmOverwriteSource`) and confirm whether the guard returns a
 * structured refusal.
 *
 * The dispatch seam and the helper share the same predicate — these
 * tests pin the helper directly so future refactors of the dispatch
 * boundary can swap the wiring without changing the helper truth table.
 */

import { describe, expect, it } from "vitest";
import { EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION } from "../../../src/adapters/mcp/dispatch-common";
import { requiresExportSourceConfirmation } from "../../../src/adapters/mcp/write-execution-dispatch";

const SRC = "C:/Projets/dysflow";
const OUT = "C:/elsewhere/staging";

describe("requiresExportSourceConfirmation — execute-mode flag matrix (#785, capa 4)", () => {
  it("apply:true + dangerous destination → refusal (legacy commit signal still triggers)", () => {
    expect(
      requiresExportSourceConfirmation(
        "export_modules",
        "developer",
        { apply: true, exportPath: SRC },
        { destination: SRC, sourceRoot: SRC },
      )?.code,
    ).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
  });

  it("dryRun:false + dangerous destination → refusal (developer-mode default delivered by dispatcher)", () => {
    expect(
      requiresExportSourceConfirmation(
        "export_modules",
        "developer",
        { dryRun: false, exportPath: SRC },
        { destination: SRC, sourceRoot: SRC },
      )?.code,
    ).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
  });

  it("dryRun:true + dangerous destination → refusal (the guard fires regardless of plan/execute path)", () => {
    // Capa 4 contract: the export-source guard fires at the dispatch
    // boundary whenever the destination overlaps the active source root,
    // regardless of dryRun/apply. The dispatch seam surfaces the refusal
    // before any plan or commit begins. The caller can pass
    // `confirmOverwriteSource: true` to bypass.
    expect(
      requiresExportSourceConfirmation(
        "export_modules",
        "developer",
        { dryRun: true, exportPath: SRC },
        { destination: SRC, sourceRoot: SRC },
      )?.code,
    ).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
  });

  it("dryRun:true + apply:true + dangerous destination → refusal (guard fires regardless of dryRun/apply)", () => {
    expect(
      requiresExportSourceConfirmation(
        "export_modules",
        "developer",
        { dryRun: true, apply: true, exportPath: SRC },
        { destination: SRC, sourceRoot: SRC },
      )?.code,
    ).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
  });

  it("confirmOverwriteSource:true + dangerous destination + dryRun:false → no refusal (explicit confirmation)", () => {
    expect(
      requiresExportSourceConfirmation(
        "export_modules",
        "developer",
        {
          confirmOverwriteSource: true,
          dryRun: false,
          exportPath: SRC,
        },
        { destination: SRC, sourceRoot: SRC },
      ),
    ).toBeUndefined();
  });

  it("safe-by-default + dangerous destination + apply:true → no refusal (policy never fires)", () => {
    expect(
      requiresExportSourceConfirmation(
        "export_modules",
        "safe-by-default",
        { apply: true, exportPath: SRC },
        { destination: SRC, sourceRoot: SRC },
      ),
    ).toBeUndefined();
  });

  it("external destination + developer + apply:true → no refusal (no overlap)", () => {
    expect(
      requiresExportSourceConfirmation(
        "export_modules",
        "developer",
        { apply: true, exportPath: OUT },
        { destination: OUT, sourceRoot: SRC },
      ),
    ).toBeUndefined();
  });
});
