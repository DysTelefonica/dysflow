/**
 * Slice 3 — `enforceRequiresConfirmation` helper tests.
 *
 * The dispatch seam calls this helper after `validateInput` and BEFORE
 * `buildRequest`. It reads `params.implements_check` (a CheckId),
 * looks the check up via `doctorCheckMetadata(checkId)`, and enforces
 * the unified `requires_confirmation` policy:
 *
 *   - check requires confirmation AND no override → CONFIRMATION_REQUIRED
 *   - check requires confirmation AND override present → accepted (returns undefined)
 *   - check does NOT require confirmation AND override present → CONFIRMATION_NOT_NEEDED
 *   - no implements_check AND override present → CONFIRMATION_NOT_NEEDED
 *   - no implements_check AND no override → accepted (default)
 *
 * The helper is pure: it never reads the filesystem, never opens Access,
 * never mutates state. Inputs are the validated params object and the
 * tool name. Output is `McpToolResult | undefined` — undefined means
 * "proceed".
 */

import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_NOT_NEEDED_CODE,
  CONFIRMATION_REQUIRED_CODE,
  confirmationNotNeeded,
  confirmationRequired,
  enforceRequiresConfirmation,
} from "../../../src/adapters/mcp/dispatch-common";
import { doctorCheckMetadata } from "../../../src/cli/commands/doctor/checks/types";

describe("enforceRequiresConfirmation — Slice 3 RED tests", () => {
  // === Acceptance per the unified policy ===

  it("rejects mutating call WITHOUT override when check requires confirmation (CONFIRMATION_REQUIRED)", () => {
    // export_modules with destinationRoot that overlaps source:
    // check `export_overwrites_source_precheck` has requires_confirmation: true.
    const result = enforceRequiresConfirmation(
      {
        implements_check: "export_overwrites_source_precheck",
        destinationRoot: "/path/that/overlaps/source",
        apply: true,
        // confirmedRequiresConfirmation: undefined (missing)
      },
      "export_modules",
    );

    expect(result).toBeDefined();
    expect(result?.isError).toBe(true);
    expect(result?.error?.code).toBe(CONFIRMATION_REQUIRED_CODE);
    expect(result?.error?.check_id).toBe("export_overwrites_source_precheck");
    expect(result?.error?.reason_code).toBe("DESTINATION_OVERLAPS_SOURCE");
    expect(result?.error?.remediation).toBeDefined();
  });

  it("accepts mutating call WITH override when check requires confirmation (returns undefined)", () => {
    const result = enforceRequiresConfirmation(
      {
        implements_check: "export_overwrites_source_precheck",
        destinationRoot: "/path/that/overlaps/source",
        apply: true,
        confirmedRequiresConfirmation: true,
      },
      "export_modules",
    );
    expect(result).toBeUndefined(); // proceed
  });

  it("rejects override when check does NOT require confirmation (CONFIRMATION_NOT_NEEDED)", () => {
    // test_vba's check has requires_confirmation: false (it's advisory);
    // providing confirmedRequiresConfirmation: true is a contract violation.
    const result = enforceRequiresConfirmation(
      {
        implements_check: "diagnose_runtime_dysflow_version",
        testsPath: "tests/tests.vba.json",
        apply: true,
        confirmedRequiresConfirmation: true,
      },
      "test_vba",
    );

    expect(result).toBeDefined();
    expect(result?.isError).toBe(true);
    expect(result?.error?.code).toBe(CONFIRMATION_NOT_NEEDED_CODE);
    expect(result?.error?.check_id).toBe("diagnose_runtime_dysflow_version");
  });

  it("rejects override when no implements_check is declared (CONFIRMATION_NOT_NEEDED)", () => {
    const result = enforceRequiresConfirmation(
      {
        destinationRoot: "/tmp/out",
        apply: true,
        confirmedRequiresConfirmation: true,
      },
      "create_table",
    );

    expect(result).toBeDefined();
    expect(result?.isError).toBe(true);
    expect(result?.error?.code).toBe(CONFIRMATION_NOT_NEEDED_CODE);
  });

  it("accepts mutating call WITHOUT override when check does NOT require confirmation (returns undefined)", () => {
    const result = enforceRequiresConfirmation(
      {
        implements_check: "diagnose_runtime_dysflow_version",
        testsPath: "tests/tests.vba.json",
        apply: true,
        // confirmedRequiresConfirmation: undefined (missing) — advisory check, OK
      },
      "test_vba",
    );
    expect(result).toBeUndefined(); // proceed
  });

  it("accepts mutating call WITHOUT override when no implements_check is declared (returns undefined)", () => {
    // Default behavior: most mutating tools are advisory; no check declared;
    // no override needed; proceed.
    const result = enforceRequiresConfirmation(
      {
        destinationRoot: "/tmp/out",
        apply: true,
      },
      "create_table",
    );
    expect(result).toBeUndefined(); // proceed
  });

  // === Edge cases ===

  it("treats a non-record input as no-check-declared (returns undefined without override)", () => {
    const result = enforceRequiresConfirmation("not-an-object" as unknown, "export_modules");
    expect(result).toBeUndefined();
  });

  it("treats empty string implements_check as no-check-declared", () => {
    const result = enforceRequiresConfirmation(
      {
        implements_check: "",
        destinationRoot: "/tmp/out",
        confirmedRequiresConfirmation: true,
        apply: true,
      },
      "export_modules",
    );
    expect(result?.error?.code).toBe(CONFIRMATION_NOT_NEEDED_CODE);
  });

  it("throws on unknown check_id via doctorCheckMetadata (sane error path)", () => {
    // doctorCheckMetadata throws if the check_id isn't in DOCTOR_CHECK_METADATA.
    // The helper surfaces that as an explicit envelope, not a crash.
    expect(() =>
      enforceRequiresConfirmation(
        {
          implements_check: "definitely_not_registered",
          apply: true,
        },
        "export_modules",
      ),
    ).toThrow(/Unknown doctor check_id/);
  });
});

describe("confirmationRequired + confirmationNotNeeded — envelope shape", () => {
  const check = doctorCheckMetadata("export_overwrites_source_precheck");

  it("confirmationRequired carries check_id, reason_code, and remediation", () => {
    const result = confirmationRequired(check);
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe(CONFIRMATION_REQUIRED_CODE);
    expect(result.error?.check_id).toBe("export_overwrites_source_precheck");
    expect(result.error?.reason_code).toBe("DESTINATION_OVERLAPS_SOURCE");
    expect(result.error?.message).toContain("export_overwrites_source_precheck");
    expect(result.error?.remediation).toBeDefined();
    expect(result.content[0]?.text).toContain("CONFIRMATION_REQUIRED");
  });

  it("confirmationNotNeeded carries check_id (or sentinel) and a clear reason_code", () => {
    const result = confirmationNotNeeded(
      "diagnose_runtime_dysflow_version",
      "ADAPTER_VERSION_SNAPSHOT",
    );
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe(CONFIRMATION_NOT_NEEDED_CODE);
    expect(result.error?.check_id).toBe("diagnose_runtime_dysflow_version");
    expect(result.error?.reason_code).toBe("ADAPTER_VERSION_SNAPSHOT");
    expect(result.content[0]?.text).toContain("CONFIRMATION_NOT_NEEDED");
  });
});
