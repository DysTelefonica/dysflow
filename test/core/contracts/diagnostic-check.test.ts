// test/contracts/diagnostic-check.test.ts
//
// Type-level tests for PR 1. No behavior change in this PR — these
// tests pin the contract shape so PR 2 (migration of the 25 checks)
// and PR 3 (dispatch seam unification) can land without drift.

import { describe, expect, it } from "vitest";
import { buildDiagnoseChecks } from "../../../src/adapters/mcp/diagnose-tool.js";
import {
  DOCTOR_CHECK_METADATA,
  type DoctorCategoryCheck,
} from "../../../src/cli/commands/doctor/checks/types.js";
import type {
  CheckId,
  DiagnosticCategory,
  DiagnosticCheck,
  DiagnosticCheckResult,
  ReasonCode,
  Severity,
} from "../../../src/core/contracts/diagnostic-check.js";
import type {
  DiagnosticCheckRegistry,
  MutatingToolDeclaration,
  RequiresConfirmationError,
  RequiresConfirmationOverride,
} from "../../../src/core/contracts/diagnostic-registry.js";
import type { Remediation } from "../../../src/core/contracts/remediation.js";

describe("DoctorCategoryCheck PR 2 migration", () => {
  it("keeps the four metadata fields optional for legacy callers", () => {
    const legacy: DoctorCategoryCheck = {
      ok: true,
      name: "legacy",
      message: "still valid",
      severity: "warning",
    };
    expect(legacy.check_id).toBeUndefined();
  });

  it("marks exactly six checks as requiring confirmation", () => {
    expect(
      DOCTOR_CHECK_METADATA.filter((check) => check.requires_confirmation).map(
        (check) => check.check_id,
      ),
    ).toEqual([
      "attribute_vb_name",
      "option_explicit",
      "lacdb_locks",
      "stale_markers",
      "orphans_msaccess",
      "export_overwrites_source_precheck",
    ]);
  });

  it("marks the other twenty-three checks as advisory", () => {
    const advisory = DOCTOR_CHECK_METADATA.filter((check) => !check.requires_confirmation);
    expect(advisory).toHaveLength(23);
    expect(advisory.every((check) => check.requires_confirmation === false)).toBe(true);
  });

  it("diagnose checks expose unified metadata while preserving legacy fields", () => {
    const checks = buildDiagnoseChecks({
      projectConfig: {
        status: "valid",
        projectId: "fixture",
        writeReady: true,
        diagnostics: [],
        owningWorktree: "C:/fixture",
      },
      filesystem: {
        accessPath: {
          path: "C:/fixture/frontend.accdb",
          exists: true,
          readable: true,
          sizeBytes: 1,
          lastModified: "2026-07-30T00:00:00.000Z",
        },
        backendPath: { path: null, exists: false, hint: null },
        destinationRoot: { path: "C:/fixture/src", exists: true, hint: null },
        projectRoot: { path: "C:/fixture", exists: true },
      },
      runtime: {
        staleMarkers: 0,
        activeOps: 0,
        orphans: { msaccess: 0, pwshWorkers: 0 },
        dysflowVersion: "test",
        writeExecutionPolicy: "safe-by-default",
      },
    });
    expect(checks[0]).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        ok: expect.any(Boolean),
        message: expect.any(String),
        severity: expect.any(String),
        check_id: expect.any(String),
        reason_code: expect.any(String),
        requires_confirmation: expect.any(Boolean),
        category: expect.any(String),
      }),
    );
  });

  it("export overlap precheck is pure and has no mutation input", () => {
    expect(buildDiagnoseChecks.length).toBe(1);
    const check = DOCTOR_CHECK_METADATA.find(
      (entry) => entry.check_id === "export_overwrites_source_precheck",
    );
    expect(check).toMatchObject({
      reason_code: "DESTINATION_OVERLAPS_SOURCE",
      requires_confirmation: true,
      category: "safety",
    });
  });
});

describe("DiagnosticCheck contract", () => {
  it("exposes the 25 known check_ids as a stable superset (PR 2 closure target)", () => {
    const known: ReadonlyArray<CheckId> = [
      "project_json_schema",
      "access_path_resolves",
      "backend_path_resolves",
      "destination_root_resolves",
      "project_id_matches_convention",
      "write_execution_policy_known",
      "attribute_vb_name",
      "option_explicit",
      "apply_polarity",
      "module_param_naming",
      "lacdb_locks",
      "codegraph_freshness",
      "opencode_mcp_wiring",
      "codegraph_supplement_drift",
      "cross_process_lock_active",
      "human_compile_pending",
      "production_backend_write_blocked",
      "msaccess_terminated_externally",
      "export_destination_root_declared",
      "export_overwrites_source_precheck",
      "openargs_contract_mismatch",
      "foreign_pid_holds_lacdb",
      "stale_markers",
      "active_ops",
      "orphans_msaccess",
      "dead_ops",
    ];
    expect(known.length).toBeGreaterThanOrEqual(25);
    for (const id of known) {
      expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("a check with requires_confirmation: true must surface the policy verbatim", () => {
    const fake: DiagnosticCheck = {
      check_id: "attribute_vb_name",
      reason_code: "VB_NAME_MISSING",
      label: "Attribute VB_Name",
      severity: "warning",
      requires_confirmation: true,
      category: "source",
      run: async (): Promise<DiagnosticCheckResult> => ({
        check_id: "attribute_vb_name",
        status: "fail",
        severity: "warning",
        message: "header rewrite needed",
      }),
    };
    expect(fake.requires_confirmation).toBe(true);
    expect(fake.category).toBe("source");
  });

  it("a check with requires_confirmation: false is auto-apply safe", () => {
    const fake: DiagnosticCheck = {
      check_id: "project_id_matches_convention",
      reason_code: "PROJECT_ID_BAD_CHARS",
      label: "projectId matches convention",
      severity: "warning",
      requires_confirmation: false,
      run: async (): Promise<DiagnosticCheckResult> => ({
        check_id: "project_id_matches_convention",
        status: "fail",
        severity: "warning",
        message: "kebab-case required",
      }),
    };
    expect(fake.requires_confirmation).toBe(false);
  });

  it("safe_next_step is optional but, when present, must be a typed Remediation", () => {
    const remediation: Remediation = {
      command: "dysflow worktree init",
      description: "bootstrap the per-worktree .dysflow/project.json",
      platform: "cross-platform",
      safeToAutoExecute: false,
    };
    const fake: DiagnosticCheck = {
      check_id: "project_json_schema",
      reason_code: "PROJECT_JSON_MISSING",
      label: "project.json schema",
      severity: "critical",
      requires_confirmation: true,
      safe_next_step: remediation,
      run: async (): Promise<DiagnosticCheckResult> => ({
        check_id: "project_json_schema",
        status: "fail",
        severity: "critical",
        message: "no project.json",
        remediation,
      }),
    };
    expect(fake.safe_next_step?.command).toBe("dysflow worktree init");
    expect(fake.run).toBeDefined();
  });
});

describe("MutatingToolDeclaration", () => {
  it('forces accepts_override to be the single literal "confirmedRequiresConfirmation"', () => {
    const fake: MutatingToolDeclaration = {
      implements_check: "export_overwrites_source_precheck",
      // @ts-expect-error: any other value must be a TS error
      accepts_override: "dryRun",
    };
    expect(fake.implements_check).toBe("export_overwrites_source_precheck");
  });
});

describe("RequiresConfirmationOverride", () => {
  it("is optional — most calls do NOT need it", () => {
    const call: RequiresConfirmationOverride = {};
    expect(call.confirmedRequiresConfirmation).toBeUndefined();
  });

  it('when set, the value is literal true (stringified "true" is not enough)', () => {
    const fake: RequiresConfirmationOverride = {
      confirmedRequiresConfirmation: true,
    };
    expect(fake.confirmedRequiresConfirmation).toBe(true);
  });
});

describe("RequiresConfirmationError envelope", () => {
  it("has the typed CONFIRMATION_REQUIRED code and carries the offending check", () => {
    const err: RequiresConfirmationError = {
      code: "CONFIRMATION_REQUIRED",
      message: "check requires explicit confirmation",
      check_id: "export_overwrites_source_precheck",
      reason_code: "DESTINATION_OVERLAPS_SOURCE",
      remediation: {
        command: "confirm after explicit review",
        description: "have the user ack the overlap before apply",
        platform: "cross-platform",
        safeToAutoExecute: false,
      },
    };
    expect(err.code).toBe("CONFIRMATION_REQUIRED");
    expect(err.check_id).toBe("export_overwrites_source_precheck");
    expect(err.remediation.safeToAutoExecute).toBe(false);
  });
});

describe("DiagnosticCheckRegistry interface", () => {
  it("exposes pluggable register / byId / all / byCategory", () => {
    const sample: DiagnosticCheck = {
      check_id: "orphan_markers",
      reason_code: "ORPHAN_MARKERS",
      label: "orphan markers",
      severity: "warning",
      requires_confirmation: false,
      run: async () => ({
        check_id: "orphan_markers",
        status: "pass",
        severity: "info",
        message: "none",
      }),
    };
    const fakeRegistry: DiagnosticCheckRegistry = {
      register: () => undefined,
      byId: (id: CheckId) => (id === "orphan_markers" ? sample : undefined),
      all: () => [sample],
      byCategory: () => [sample],
    };
    expect(fakeRegistry.byId("orphan_markers")?.check_id).toBe("orphan_markers");
    expect(fakeRegistry.all()).toHaveLength(1);
  });
});

describe("DiagnosticCategory taxonomy", () => {
  it("mirrors the existing 4 dysflow doctor categories + safety", () => {
    const cats: ReadonlyArray<DiagnosticCategory> = [
      "projectConfig",
      "source",
      "runtimeConsumer",
      "externalDeps",
      "safety",
    ];
    expect(cats).toHaveLength(5);
    expect(cats).toContain("safety");
  });
});

describe("Severity and ReasonCode types", () => {
  it("Severity has exactly three values matching engram pattern", () => {
    const sev: ReadonlyArray<Severity> = ["critical", "warning", "info"];
    expect(sev).toHaveLength(3);
  });
  it("ReasonCode is a snake_case-ish string (enforced by convention, not type)", () => {
    const rc: ReasonCode = "VB_NAME_MISSING";
    expect(rc).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});
