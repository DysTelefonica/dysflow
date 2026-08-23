import type {
  AccessOperationPreflightCleanup,
  AccessOperationPreflightCleanupResult,
} from "../../src/core/operations/access-operation-preflight.js";

/**
 * A preflight cleanup that inspects nothing and kills nothing.
 *
 * Unit tests inject a fake VbaManagerExecutor so they never spawn the VBA
 * runner. The process scanner is a second PowerShell spawn on the same
 * boundary, and it was never stubbed — so the suite spawned real processes
 * while believing it did not. Inject this wherever a test builds an adapter
 * but is not asserting on preflight behaviour itself.
 */
export function noopPreflightCleanup(): AccessOperationPreflightCleanup {
  return {
    async cleanup(): Promise<AccessOperationPreflightCleanupResult> {
      return { cleaned: [], killed: [], orphanedKilled: [], errors: [], transitioned: [] };
    },
  };
}

/** Adapter for tests that inject the preflight operation as a function port. */
export function runNoopPreflightCleanup(
  _target?: unknown,
): Promise<AccessOperationPreflightCleanupResult> {
  return noopPreflightCleanup().cleanup({ accessPath: "", projectRoot: "" });
}
