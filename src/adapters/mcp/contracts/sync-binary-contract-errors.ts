/**
 * Round-14 regression fix — issue #1228 bug 2.
 *
 * `sync_binary` with `dryRun:true` previously surfaced a string-coded
 * `RESULT_CONTRACT_VIOLATION` failure. The contract validator returned
 * the generic RESULT_CONTRACT_VIOLATION on ANY plan mismatch, with no
 * typed code a consumer could branch on. The fix introduces a typed
 * `SYNC_BINARY_PLAN_INVALID` code that the per-tool validator can
 * surface when the sync_binary plan is malformed.
 *
 * This module is the typed-error surface for the sync_binary plan
 * validator. It is intentionally narrow: only the classify helper
 * and the typed code. The full result-contract validator
 * (`result-validation.ts`) handles the actual JSON-schema validation;
 * this module classifies the specific sync_binary shape violations
 * (null plan, missing toImport/toExport arrays) into a stable typed
 * code with a remediation string the consumer can act on.
 *
 * The contract is additive: existing RESULT_CONTRACT_VIOLATION codes
 * continue to flow for non-sync_binary tools and for unrecognised
 * schema-shape violations. SYNC_BINARY_PLAN_INVALID is the specific
 * code for the four bugs in #1228.
 */

export const SYNC_BINARY_PLAN_INVALID = "SYNC_BINARY_PLAN_INVALID" as const;
export type SyncBinaryPlanInvalidCode = typeof SYNC_BINARY_PLAN_INVALID;

export type SyncBinaryPlanViolationClassification = {
  code: SyncBinaryPlanInvalidCode;
  path: string;
  reason: string;
  remediation: string;
};

export function classifySyncBinaryPlanViolation(input: {
  plan: unknown;
  reason: string;
}): SyncBinaryPlanViolationClassification | null {
  if (input.plan === null || typeof input.plan !== "object") {
    return {
      code: SYNC_BINARY_PLAN_INVALID,
      path: "$.plan",
      reason: input.reason,
      remediation:
        "Re-run sync_binary with a valid pre-verify result. The plan must be a non-null object carrying toImport (string[]), toExport (string[]), skipped (SyncBinarySkippedEntry[]), and totalActionable (number).",
    };
  }
  const plan = input.plan as Record<string, unknown>;
  if (!Array.isArray(plan.toImport)) {
    return {
      code: SYNC_BINARY_PLAN_INVALID,
      path: "$.plan.toImport",
      reason: "toImport must be a string[]",
      remediation:
        "Re-run sync_binary with `direction:'src-to-binary' | 'both'` so the plan carries a toImport array. The compose orchestrator derives the array from the pre-verify summary's missingInBinary and sourceNewer entries.",
    };
  }
  if (!Array.isArray(plan.toExport)) {
    return {
      code: SYNC_BINARY_PLAN_INVALID,
      path: "$.plan.toExport",
      reason: "toExport must be a string[]",
      remediation:
        "Re-run sync_binary with `direction:'binary-to-src' | 'both'` so the plan carries a toExport array. The compose orchestrator derives the array from the pre-verify summary's missingInSource and binaryNewer entries.",
    };
  }
  if (typeof plan.totalActionable !== "number") {
    return {
      code: SYNC_BINARY_PLAN_INVALID,
      path: "$.plan.totalActionable",
      reason: "totalActionable must be a number",
      remediation:
        "Re-run sync_binary so the plan carries a numeric totalActionable. The compose orchestrator computes it as toImport.length + toExport.length.",
    };
  }
  return null;
}
