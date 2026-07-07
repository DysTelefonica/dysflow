/**
 * v1.20.0 (issue #762) — in-memory single source of truth for "did the human
 * compile since the last dysflow persistence?".
 *
 * Why this exists:
 *   v1.19.0 (#759) removed ALL compile from the runtime surface:
 *     - `compile_vba` tool was removed.
 *     - `compile` / `rollbackOnCompileFail` params were removed.
 *     - the legacy compile-error code (one of the v1.18.x taxonomy entries)
 *       was removed from the error surface.
 *     - `RunCommand(126)` (compile-and-save-ALL) was replaced with
 *       `RunCommand(280)` (`acCmdSaveAllModules`, save WITHOUT compile).
 *   The maintainer's contract (#759 comment `4896478041`): the **human**
 *   compiles in Access (Debug ▸ Compile) before any test run. Without this
 *   module, dysflow has no way to remind the consumer that the human has not
 *   yet compiled since the last persistence.
 *
 * What this module does:
 *   - Tracks, per `accessPath`, the last successful save-only persistence
 *     (`lastPersistenceAt`) and the last verify_code round-trip
 *     (`lastVerifyCodeAt`, `lastVerifyCodeOk`).
 *   - Computes `isHumanCompilePending(accessPath)`: true when a persistence
 *     has occurred that the user has NOT yet confirmed via a successful
 *     verify_code (or when the verify failed — failure does NOT clear the
 *     flag, per the conservative contract).
 *   - Exposes the structured reminder text the rest of the runtime emits
 *     in tool results when the flag is set.
 *
 * What this module does NOT do:
 *   - No file-based persistence. The state is process-local and scoped per
 *     `accessPath`. A future change could add disk persistence, but that is
 *     a separate concern (would change the "human compiled" semantics
 *     across process restarts).
 *   - No compile coupling. This module NEVER compiles; it only records
 *     persistence/verify events that the adapters reported to it.
 *
 * Design choices:
 *   - Module-level Map keyed by `accessPath`. Simpler than a class; the
 *     consumer only needs the helpers.
 *   - `clearHumanCompileState` is exported as a test seam (Fixture Gate rule:
 *     tests must be able to reset shared state between atoms).
 *   - The reminder text uses `<ISO timestamp>` as a placeholder so the
 *     structured reminder emitter can substitute the real timestamp at call
 *     time without re-allocating the constant.
 */

/**
 * Per-project observation of the human-compile lifecycle. All fields are
 * `undefined` until the corresponding event has been recorded.
 */
export type HumanCompileState = {
  /** Last successful save-only persistence via RunCommand(280). */
  lastPersistenceAt: Date | undefined;
  /** Last verify_code round-trip completion. */
  lastVerifyCodeAt: Date | undefined;
  /**
   * Outcome of the last verify_code round-trip. `true` if the comparison
   * succeeded with no actionable drift, `false` if it failed or surfaced
   * actionable differences, `undefined` if no verify has run yet.
   */
  lastVerifyCodeOk: boolean | undefined;
};

/**
 * The standard reminder text surfaced in tool results when the human has
 * not yet compiled since the last persistence. The `<ISO timestamp>`
 * placeholder is substituted at call time by the reminder emitter.
 */
export const HUMAN_COMPILE_REMINDER_TEXT =
  "Dysflow did not compile this project. The human must compile it in Access (Debug ▸ Compile) before any test run. Last save-only persistence: <ISO timestamp> via RunCommand(280).";

// Module-level state map. Keyed by absolute `accessPath` (the front-end .accdb
// path resolved through .dysflow/project.json). The map is process-local — there
// is no disk persistence (issue #762 scope: in-memory only).
const stateByAccessPath: Map<string, HumanCompileState> = new Map();

function emptyState(): HumanCompileState {
  return {
    lastPersistenceAt: undefined,
    lastVerifyCodeAt: undefined,
    lastVerifyCodeOk: undefined,
  };
}

/**
 * Return the observed state for the given `accessPath`. The returned object
 * is a copy — mutations by callers do not affect the cached state. Callers
 * that want to update state must use the dedicated recording functions.
 */
export function getHumanCompileState(accessPath: string): HumanCompileState {
  const cached = stateByAccessPath.get(accessPath);
  if (cached === undefined) return emptyState();
  return {
    lastPersistenceAt: cached.lastPersistenceAt,
    lastVerifyCodeAt: cached.lastVerifyCodeAt,
    lastVerifyCodeOk: cached.lastVerifyCodeOk,
  };
}

function getOrInitEntry(accessPath: string): HumanCompileState {
  let entry = stateByAccessPath.get(accessPath);
  if (entry === undefined) {
    entry = emptyState();
    stateByAccessPath.set(accessPath, entry);
  }
  return entry;
}

/**
 * Record a successful save-only persistence (e.g. import_modules, import_all,
 * delete_module) for the given `accessPath`. Sets `lastPersistenceAt = now`,
 * leaving verify state untouched. The flag `isHumanCompilePending` becomes
 * `true` until a subsequent `recordVerifyOk` confirms the binary state.
 */
export function recordPersistence(accessPath: string): void {
  const entry = getOrInitEntry(accessPath);
  entry.lastPersistenceAt = new Date();
}

/**
 * Record a successful verify_code round-trip. Sets
 * `lastVerifyCodeAt = now; lastVerifyCodeOk = true`. This is the signal that
 * clears the pending flag — the user (or agent on the user's behalf) has
 * confirmed the binary state matches the source.
 */
export function recordVerifyOk(accessPath: string): void {
  const entry = getOrInitEntry(accessPath);
  entry.lastVerifyCodeAt = new Date();
  entry.lastVerifyCodeOk = true;
}

/**
 * Record a FAILED verify_code round-trip. Sets
 * `lastVerifyCodeAt = now; lastVerifyCodeOk = false`. Per the conservative
 * contract in issue #762, a failed verify does NOT clear the pending flag —
 * the user has NOT confirmed the binary state. The reminder stays visible.
 */
export function recordVerifyFail(accessPath: string): void {
  const entry = getOrInitEntry(accessPath);
  entry.lastVerifyCodeAt = new Date();
  entry.lastVerifyCodeOk = false;
}

/**
 * Returns `true` when the human is likely to need to compile before running
 * tests for the given project. The flag is `true` when:
 *   - A persistence has happened (`lastPersistenceAt !== undefined`), AND
 *   - Either no verify has run yet, or the last verify failed.
 *
 * Mathematically: `lastPersistenceAt > threshold` where
 *   `threshold = (lastVerifyCodeOk === true) ? lastVerifyCodeAt : 0`.
 *
 * When no persistence has happened yet, this returns `false` (nothing to
 * compile for — the user hasn't saved anything via dysflow).
 */
export function isHumanCompilePending(accessPath: string): boolean {
  const cached = stateByAccessPath.get(accessPath);
  if (cached === undefined) return false;
  if (cached.lastPersistenceAt === undefined) return false;
  if (cached.lastVerifyCodeOk !== true) {
    // No successful verify yet — any persistence is pending.
    return true;
  }
  // We have a successful verify. Compare its timestamp to the persistence.
  // If a persistence happened AFTER the verify, the flag is set.
  const verifyAt = cached.lastVerifyCodeAt;
  if (verifyAt === undefined) return true;
  return cached.lastPersistenceAt.getTime() > verifyAt.getTime();
}

/**
 * Reset the state entry for the given `accessPath`. Exposed as a test seam
 * (Fixture Gate rule — every test must be able to clear shared state). Not
 * intended for production use; production code uses the dedicated recorders.
 */
export function clearHumanCompileState(accessPath: string): void {
  stateByAccessPath.delete(accessPath);
}
