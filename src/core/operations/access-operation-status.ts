import type { AccessOperationStatus } from "./access-operation-registry.js";

/**
 * Canonical set of statuses for which a cleanup operation is eligible.
 *
 * Single source of truth for both `AccessOperationPreflightCleanupService` and
 * `AccessOperationCleanupService` (hexagonal-tech-debt #B.2, #624). Membership
 * is the union of historic preflight (4) and cleanup (3) statuses —
 * preflight's 4-status set is the superset. Exported as `ReadonlySet` so
 * consumers cannot mutate membership at runtime.
 *
 * Note: cleanup's runtime behavior for `pid_unknown` is governed by an
 * independent guard at `access-operation-cleanup.ts:124` that returns
 * `CLEANUP_PID_UNKNOWN` BEFORE `ELIGIBLE_STATUSES.has(...)` is consulted.
 * Including `pid_unknown` here does NOT change that behavior — it only
 * closes the membership divergence that allowed the two consumers to drift.
 */
export const ELIGIBLE_STATUSES: ReadonlySet<AccessOperationStatus> = new Set<AccessOperationStatus>(
  ["timed_out", "failed", "cleanup_pending", "pid_unknown"],
);
