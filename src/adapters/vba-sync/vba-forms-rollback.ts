import type { RollbackOutcome } from "./vba-forms-types.js";

/**
 * Attempt the supplied best-effort restore write and report the outcome so
 * error.details.rollback carries a consumer-visible contract. Used by form
 * mutation, deserializeForm, and cloneFormFromTemplate when the import gate
 * fails and a restore is required.
 *
 * #692 — when `targetExisted` is false the original state was "no file".
 * The caller's restore write may create a placeholder artifact instead of a
 * true restore (for example, empty string for a new target). The returned
 * `restoredState:"empty-placeholder"` and `requiresManualCleanup:true`
 * signal this ambiguity to the consumer.
 */
export async function captureRollbackOutcome(
  write: () => Promise<void>,
  targetExisted: boolean,
): Promise<RollbackOutcome> {
  try {
    await write();
    if (targetExisted) {
      return { attempted: true, applied: true, targetExisted: true };
    }
    // New target — original state was "no file"; rollback wrote empty string.
    return {
      attempted: true,
      applied: true,
      targetExisted: false,
      restoredState: "empty-placeholder",
      requiresManualCleanup: true,
    };
  } catch (err) {
    if (targetExisted) {
      return {
        attempted: true,
        applied: false,
        targetExisted: true,
        error: { message: err instanceof Error ? err.message : String(err) },
      };
    }
    return {
      attempted: true,
      applied: false,
      targetExisted: false,
      restoredState: "empty-placeholder",
      requiresManualCleanup: true,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}
