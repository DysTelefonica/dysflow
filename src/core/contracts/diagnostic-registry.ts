// src/core/contracts/diagnostic-registry.ts
//
// Pluggable registry for diagnostic checks. Lets tests + third-party
// modules register their own checks without forking dysflow.
//
// The registry is the runtime side of the unified envelope. Each
// check ports its policy via `requires_confirmation`; the registry
// exposes those declarations so the dispatch seam can read them.

import type {
  CheckId,
  DiagnosticCheck,
  DiagnosticCategory,
} from './diagnostic-check.js';
import type { Remediation } from './remediation.js';

/**
 * The pluggable registry. Implementation lives elsewhere
 * (see PR 2 — `src/adapters/mcp/diagnostic-registry.ts`).
 */
export interface DiagnosticCheckRegistry {
  register(check: DiagnosticCheck): void;
  byId(id: CheckId): DiagnosticCheck | undefined;
  all(): ReadonlyArray<DiagnosticCheck>;
  byCategory(category: DiagnosticCategory): ReadonlyArray<DiagnosticCheck>;
}

/**
 * Mutating tools MUST declare which check they implement.
 * The dispatch seam uses this to read `requires_confirmation` from
 * the mapped check and demand the unified override before apply.
 */
export interface MutatingToolDeclaration {
  /** The check whose `requires_confirmation` policy applies. */
  readonly implements_check: CheckId;

  /** The unified override flag the tool accepts. Literal type to
   *  prevent the regression of four parallel escape hatches. */
  readonly accepts_override: 'confirmedRequiresConfirmation';
}

/**
 * Unified override flag for ALL mutating calls.
 *
 * One flag, one semantic, one seam. Replaces the four ad-hoc escape
 * hatches listed in `diagnostic-check.ts`.
 */
export interface RequiresConfirmationOverride {
  /**
   * Set to true ONLY after explicit human confirmation.
   * AI agents must NEVER set this without a prior `ask_user` step.
   * (Anti-pattern: "TDD-green" sin confirmación = AP-11.)
   */
  readonly confirmedRequiresConfirmation?: boolean;
}

/**
 * Typed error emitted by the dispatch seam when a mutating call
 * references a `requires_confirmation: true` check without the
 * override. Replaces ad-hoc rejection text from the four escape hatches.
 */
export interface RequiresConfirmationError {
  readonly code: 'CONFIRMATION_REQUIRED';
  readonly message: string;
  readonly check_id: CheckId;
  readonly reason_code: string;
  readonly remediation: Remediation;
}
