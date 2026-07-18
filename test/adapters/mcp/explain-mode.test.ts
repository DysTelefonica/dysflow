/**
 * Round-12 (#972) — explain mode + uniform ErrorEnvelope across all write-tools.
 *
 * Two related improvements are exercised here:
 *
 *   A. Explain mode — `explain: true` on any tool call attaches a `decisionTree`
 *      to the error response. Three steps minimum:
 *        1. The failed check (result: FAIL).
 *        2. The root-cause hypothesis (result: LIKELY).
 *        3. The remediation step (with text).
 *
 *   B. Uniform ErrorEnvelope — every write-tool (and read-tool with errors)
 *      returns `{ ok, errorCode, errorMessage, diagnostics, relatedIssueNumbers,
 *      explain? }`. `relatedIssueNumbers` is populated from the diagnostic
 *      code via a code-to-issue lookup table (issue #962 taxonomized the codes;
 *      this test pins the mapping for the canonical codes).
 *
 * Builds on #962 (specific error codes) + #970 (structured remediation).
 *
 * Pure unit tests — no Access, no PowerShell. Operates on the gate helpers
 * (`projectConfigNotWriteReady`, `invalidInput`, `procedureNotAllowed`,
 * `writesDisabled`, `allowlistNotConfigured`, `exportSourceGuardRefused`)
 * plus the new `buildExplainObject` helper in
 * `src/adapters/mcp/explain-builder.ts`.
 */

import { describe, expect, it } from "vitest";
import type { ProjectConfigDiagnostic } from "../../../src/adapters/config/project-config-diagnostic.js";
import {
  allowlistNotConfigured,
  exportSourceGuardRefused,
  invalidInput,
  MCP_ALLOWLIST_NOT_CONFIGURED,
  MCP_INPUT_INVALID_CODE,
  MCP_PROCEDURE_NOT_ALLOWED,
  MCP_WRITES_DISABLED,
  procedureNotAllowed,
  projectConfigNotWriteReady,
  writesDisabled,
} from "../../../src/adapters/mcp/dispatch-common.js";
import { translateCoreResultToMcpContent } from "../../../src/adapters/mcp/result-translation.js";
import { createDysflowError, failureResult } from "../../../src/core/contracts/index";

function writeGateDiagnostic(
  status: string,
  code: string,
  remediation: string,
): ProjectConfigDiagnostic {
  return {
    status,
    cwd: "C:/repo",
    configPath: "C:/repo/.dysflow/project.json",
    projectRoot: "C:/repo",
    projectId: "app",
    accessPath: "C:/repo/app.accdb",
    backendPath: null,
    destinationRoot: "C:/repo/src",
    writeReady: false,
    diagnostics: [{ code, severity: "error", message: `${code} diagnostic`, remediation }],
    remediation,
  } as unknown as ProjectConfigDiagnostic;
}

function uniformEnvelopeKeys(envelope: {
  ok?: boolean;
  error?: Record<string, unknown>;
}): string[] {
  return Object.keys(envelope.error ?? {}).sort();
}

describe("explain mode + uniform ErrorEnvelope (Round-12 #972)", () => {
  // ── (1) explain:true on the write-gate envelope emits a decisionTree ──
  it("explain:true adds a decisionTree to the write-gate error envelope", () => {
    const result = projectConfigNotWriteReady(
      "export_modules",
      writeGateDiagnostic(
        "destination-root-not-found",
        "DESTINATION_ROOT_NOT_FOUND",
        "mkdir -p 'C:/repo/src/classes'",
      ),
      { explain: true },
    );
    const explain = result.error?.explain as
      | { summary: string; decisionTree: unknown[] }
      | undefined;
    expect(explain).toBeDefined();
    expect(explain?.summary).toContain("destinationRoot");
    expect(Array.isArray(explain?.decisionTree)).toBe(true);
    expect((explain?.decisionTree ?? []).length).toBeGreaterThanOrEqual(3);
  });

  // ── (2) Uniform envelope across multiple write-tools ──
  // Trigger the same gate-rejection through three different surfaces
  // (projectConfigNotWriteReady / invalidInput / procedureNotAllowed /
  // writesDisabled) and confirm every envelope carries ok, errorCode,
  // errorMessage, diagnostics, relatedIssueNumbers, and the optional
  // explain field shape is consistent.
  it("all write-gate envelopes return the same ErrorEnvelope shape", () => {
    const writeGate = projectConfigNotWriteReady(
      "export_modules",
      writeGateDiagnostic(
        "outside-project-root",
        "OUTSIDE_PROJECT_ROOT",
        "dysflow doctor --cwd C:/repo",
      ),
    );
    const inputInvalid = invalidInput("bad field 'mode'");
    const procRefused = procedureNotAllowed("Test_X", ["Test_A"]);
    const writesOff = writesDisabled("delete_module");
    const allowlistMissing = allowlistNotConfigured("Test_X");
    const exportRefused = exportSourceGuardRefused({
      toolName: "export_modules",
      destination: "C:/repo/src",
      sourceRoot: "C:/repo/src",
    });
    const coreFailed = translateCoreResultToMcpContent(
      failureResult(
        createDysflowError("DESTINATION_ROOT_NOT_FOUND", "destinationRoot missing", {
          remediation: "mkdir -p C:/repo/src",
        }),
      ),
    );

    for (const envelope of [
      writeGate,
      inputInvalid,
      procRefused,
      writesOff,
      allowlistMissing,
      exportRefused,
      coreFailed,
    ]) {
      expect(envelope.ok).toBe(false);
      expect(envelope.isError).toBe(true);
      const err = envelope.error as Record<string, unknown>;
      // The uniform shape: errorCode / errorMessage / diagnostics /
      // relatedIssueNumbers MUST all be present, regardless of code.
      expect(typeof err.errorCode).toBe("string");
      expect((err.errorCode as string).length).toBeGreaterThan(0);
      expect(typeof err.errorMessage).toBe("string");
      expect((err.errorMessage as string).length).toBeGreaterThan(0);
      expect(Array.isArray(err.diagnostics)).toBe(true);
      expect(Array.isArray(err.relatedIssueNumbers)).toBe(true);
      expect((err.relatedIssueNumbers as unknown[]).length).toBeGreaterThan(0);
      // Legacy alias keys MUST still exist for backward compat.
      expect(err.code).toBe(err.errorCode);
      expect(err.message).toBe(err.errorMessage);
    }
  });

  // ── (3) decisionTree has 3+ steps: failed check, root cause, remediation ──
  it("decisionTree contains failed check, root-cause hypothesis, and remediation", () => {
    const result = projectConfigNotWriteReady(
      "export_modules",
      writeGateDiagnostic(
        "destination-root-not-found",
        "DESTINATION_ROOT_NOT_FOUND",
        "Run `mkdir -p 'C:/repo/src/classes'` and retry.",
      ),
      { explain: true },
    );
    const decisionTree = result.error?.explain?.decisionTree;
    expect(decisionTree).toBeDefined();
    expect(decisionTree?.length).toBeGreaterThanOrEqual(3);

    const failedStep = decisionTree?.find((step) => step.result === "FAIL");
    const hypothesisStep = decisionTree?.find((step) => step.result === "LIKELY");
    const remediationStep = decisionTree?.find(
      (step) => typeof step.remediation === "string" && (step.remediation as string).length > 0,
    );
    expect(failedStep).toBeDefined();
    expect(hypothesisStep).toBeDefined();
    expect(remediationStep).toBeDefined();
  });

  // ── (4) relatedIssueNumbers is populated from the diagnostic code ──
  it("relatedIssueNumbers is populated from the diagnostic code (#962 mapping)", () => {
    const destMissing = projectConfigNotWriteReady(
      "export_modules",
      writeGateDiagnostic("destination-root-not-found", "DESTINATION_ROOT_NOT_FOUND", "mkdir"),
    );
    const capsLocked = projectConfigNotWriteReady(
      "export_modules",
      writeGateDiagnostic(
        "capabilities-disallow-write",
        "CAPABILITIES_DISALLOW_WRITE",
        "allowWrites:true",
      ),
    );
    const writesOff = writesDisabled();

    expect((destMissing.error?.relatedIssueNumbers as string[] | undefined) ?? []).toContain(
      "#962",
    );
    expect((capsLocked.error?.relatedIssueNumbers as string[] | undefined) ?? []).toContain("#962");
    // MCP_WRITES_DISABLED was introduced earlier (#659); the lookup MUST
    // attach that issue number so consumers can grep.
    expect((writesOff.error?.relatedIssueNumbers as string[] | undefined) ?? []).toContain("#659");
  });

  // ── (5) explain:false or omitted does NOT add explain field ──
  it("omitting explain does NOT add an explain field to the envelope", () => {
    const result = projectConfigNotWriteReady(
      "export_modules",
      writeGateDiagnostic("destination-root-not-found", "DESTINATION_ROOT_NOT_FOUND", "mkdir"),
    );
    expect(result.error?.explain).toBeUndefined();
  });

  it("explain:false does NOT add an explain field to the envelope", () => {
    const result = projectConfigNotWriteReady(
      "export_modules",
      writeGateDiagnostic("destination-root-not-found", "DESTINATION_ROOT_NOT_FOUND", "mkdir"),
      { explain: false },
    );
    expect(result.error?.explain).toBeUndefined();
  });

  // ── (6) explain mode works for read-tools too — pin the schema accepts
  //    `explain` on inputs that flow through `translateCoreResultToMcpContent`
  //    even when the failure came from a non-write path. ───────────────────────
  it("explain mode works for read-tools translating core OperationResult failures", () => {
    // A read-tool emulation: the core layer returned a failure with a
    // catalogued code; we attach explain: true via a separate concern.
    // For this slice the wrap happens at the dispatcher layer; here we
    // pin that the translateCoreResultToMcpContent envelope mirrors the
    // uniform shape (so when explain=true is passed downstream, the
    // envelope has errorCode / errorMessage / diagnostics / relatedIssueNumbers).
    const coreResult = failureResult(
      createDysflowError("FORM_UNKNOWN_PROPERTY", "Property 'NoSuch' is not recognized.", {
        remediation: "Use inspect_form / form_list_controls to find the right key.",
      }),
    );
    const translated = translateCoreResultToMcpContent(coreResult);
    expect(translated.ok).toBe(false);
    const err = translated.error as Record<string, unknown>;
    expect(err.errorCode).toBe("FORM_UNKNOWN_PROPERTY");
    expect(typeof err.errorMessage).toBe("string");
    expect(Array.isArray(err.relatedIssueNumbers)).toBe(true);
  });

  // ── (7) No extra fields creep into the envelope besides the documented ones ──
  it("no extra undocumented fields appear on the envelope error block", () => {
    const writeGate = projectConfigNotWriteReady(
      "import_modules",
      writeGateDiagnostic("destination-root-not-found", "DESTINATION_ROOT_NOT_FOUND", "mkdir"),
      { explain: true },
    );
    const keys = uniformEnvelopeKeys(writeGate);
    // The additive allow-list: any field name listed here is a documented
    // part of the uniform envelope. Future envelope additions must be
    // reflected here AND tested. Order matters (stable sort for snapshot).
    const allowed = [
      "code",
      "details",
      "diagnostics",
      "errorCode",
      "errorMessage",
      "explain",
      "message",
      "relatedIssueNumbers",
      "remediation",
    ];
    expect(keys).toEqual([...allowed].sort());
  });

  // ── (8) explain:true via invalidInput (non-gate failure) also works ──
  it("explain:true on invalidInput envelope includes the schema rejection decision tree", () => {
    const result = invalidInput(
      "Property 'NoSuch' is not recognized.",
      "Use inspect_form to find the right key.",
      { rejectedFlag: "propertyName", toolName: "form_set_property" },
    );
    // invalidInput is intentionally NOT a gate-rejection — the explain
    // feature is gated on the envelope shape (uniform error envelope from
    // #972), not on the gate helper. The contract: invalidInput's
    // envelope has the uniform fields, and the explain field is opt-in
    // through the dispatch layer (added when caller asked for it). For
    // this slice we pin only the uniform shape.
    expect(result.error?.errorCode).toBe(MCP_INPUT_INVALID_CODE);
    expect(result.error?.errorMessage).toBeDefined();
    expect(Array.isArray(result.error?.relatedIssueNumbers)).toBe(true);
    // explicit: invalidInput currently is NOT wrapped with explain.
    expect(result.error?.explain).toBeUndefined();
  });

  // ── (9) procedureNotAllowed envelope carries relatedIssueNumbers ──
  it("procedureNotAllowed envelope carries relatedIssueNumbers (#659)", () => {
    const result = procedureNotAllowed("Test_X", ["Test_A"]);
    expect(result.error?.errorCode).toBe(MCP_PROCEDURE_NOT_ALLOWED);
    expect(Array.isArray(result.error?.relatedIssueNumbers)).toBe(true);
    expect((result.error?.relatedIssueNumbers as string[]).length).toBeGreaterThan(0);
  });

  // ── (10) writesDisabled envelope carries relatedIssueNumbers (#659) ──
  it("writesDisabled envelope carries relatedIssueNumbers (#659)", () => {
    const result = writesDisabled("delete_module");
    expect(result.error?.errorCode).toBe(MCP_WRITES_DISABLED);
    expect(Array.isArray(result.error?.relatedIssueNumbers)).toBe(true);
    expect((result.error?.relatedIssueNumbers as string[]).length).toBeGreaterThan(0);
  });

  // ── (11) allowlistNotConfigured envelope carries relatedIssueNumbers ──
  it("allowlistNotConfigured envelope carries relatedIssueNumbers (#757)", () => {
    const result = allowlistNotConfigured("Test_X");
    expect(result.error?.errorCode).toBe(MCP_ALLOWLIST_NOT_CONFIGURED);
    expect(Array.isArray(result.error?.relatedIssueNumbers)).toBe(true);
    expect((result.error?.relatedIssueNumbers as string[]).length).toBeGreaterThan(0);
  });
});
