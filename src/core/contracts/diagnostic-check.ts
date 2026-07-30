// src/core/contracts/diagnostic-check.ts
//
// Unified envelope for every diagnostic check in dysflow v2.30+.
//
// Replaces the four ad-hoc escape hatches:
//   - dryRun                       (was: planning signal)
//   - confirm                      (was: human-confirms status flip)
//   - confirmOverwriteSource       (was: overlap confirmation)
//   - confirmPid                   (was: PID-specific cleanup confirmation)
//
// behind a single declarative field on every check: `requires_confirmation`.
//
// Protocol-level field naming uses snake_case to match engram's
// internal/diagnostic/registry.go and to enable trivial JSON <-> TS
// round-trips without a transform layer.

import type { Remediation } from "./remediation.js";

export type Severity = "critical" | "warning" | "info";

/**
 * Stable snake_case identifier. Branch-stable. Version-stable.
 * NEVER rename without a migration. Agents branch on this string.
 */
export type CheckId = string;

/**
 * Stable machine-readable reason emitted on failure.
 * Distinct from `check_id`: which check is firing vs which symptom
 * within that check.
 */
export type ReasonCode = string;

/**
 * Diagnostic category mirrors the existing dysflow doctor category
 * file layout (project-config, vba-structure, runtime-consumer,
 * external-deps). One new addition: `safety` for cross-cutting
 * checks that span HR-2 (kill-ban), HR-3 (prod-backend), HR-4
 * (foreign-PID lock).
 */
export type DiagnosticCategory =
  | "projectConfig" // existing category A — project-config.ts
  | "source" // existing category B — vba-structure.ts
  | "runtimeConsumer" // existing category C — runtime-consumer.ts
  | "externalDeps" // existing category D — external-deps.ts
  | "safety"; // NEW — cross-cutting runtime/policy checks

/**
 * Single source of truth for diagnostic check shape.
 *
 * Each check self-registers via `DiagnosticCheckRegistry`.
 * Each check ports its own enforcement policy via `requires_confirmation`.
 */
export interface DiagnosticCheck<TInput = unknown, TEvidence = unknown> {
  /** Stable snake_case identifier. See `CheckId`. */
  readonly check_id: CheckId;

  /** Stable machine-readable reason emitted on failure. See `ReasonCode`. */
  readonly reason_code: ReasonCode;

  /** Human-friendly label for the surface (translate before showing). */
  readonly label: string;

  /**
   * Severity drives display + exit code.
   * Severity is NOT a fix-decision driver — use `requires_confirmation`.
   */
  readonly severity: Severity;

  /**
   * THE KEY POLICY FIELD.
   *
   * false -> the agent can auto-apply the remediation after planning.
   * true  -> the agent MUST `ask_user` and capture the
   *          `confirmedRequiresConfirmation` override flag before
   *          applying the fix.
   *
   * Defaults when extending `DoctorCategoryCheck`:
   *   - false for advisory checks (read-only verification).
   *   - true for any check whose remediation touches a
   *     .bas / .cls / .form.txt or kills a process.
   */
  readonly requires_confirmation: boolean;

  /**
   * Optional category. Lets consumers filter (e.g. `doctor --category source`).
   * Required in PR 2; optional today so existing checks do not break.
   */
  readonly category?: DiagnosticCategory;

  /**
   * Optional structured remediation surfaced when the check fires.
   * The agent can dispatch the remediation directly or present it
   * to the operator.
   */
  readonly safe_next_step?: Remediation;

  /**
   * Run the check. PURE: must not mutate the user's project.
   * For self-healing checks, expose a separate repair entry-point
   * on the registry and require `requires_confirmation: true`.
   */
  run(input: TInput): Promise<DiagnosticCheckResult<TEvidence>>;
}

export interface DiagnosticCheckResult<TEvidence = unknown> {
  readonly check_id: CheckId;
  readonly status: "pass" | "fail" | "skip";
  readonly severity: Severity;
  readonly message: string;
  readonly evidence?: TEvidence;
  readonly remediation?: Remediation;
}
