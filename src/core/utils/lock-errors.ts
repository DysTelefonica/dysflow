/**
 * Win32 error codes that mean "the lock is momentarily contended — back off and retry",
 * rather than a permanent failure that should abort acquisition.
 *
 * - `EEXIST` is the normal contended case: the lock directory already exists.
 * - `EACCES` / `EPERM` show up on Windows when a *concurrent release* left the lock directory
 *   in `DELETE_PENDING` state: directory deletion is not synchronous while a handle (or the
 *   indexer / antivirus) still touches the folder, so a subsequent `mkdir` on the same path
 *   returns `ERROR_ACCESS_DENIED` (mapped to `EACCES`, or `EPERM` for some ops/libuv versions)
 *   instead of `EEXIST`. Treating these as transient lets the acquirer wait its turn instead
 *   of failing intermittently with "Access is denied" under high concurrency.
 *
 * A genuinely permanent permission error (e.g. the lock root is not writable) is still bounded:
 * the acquire loops have a deadline and surface a lock-timeout once it elapses.
 */
const TRANSIENT_LOCK_CONTENTION_CODES: ReadonlySet<string> = new Set(["EEXIST", "EACCES", "EPERM"]);

/** Extracts the string `code` from an errno-style error, or `undefined`. */
export function lockErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** True when a lock-acquisition `mkdir` failure should be retried rather than thrown. */
export function isTransientLockContentionError(error: unknown): boolean {
  const code = lockErrorCode(error);
  return code !== undefined && TRANSIENT_LOCK_CONTENTION_CODES.has(code);
}

/** True when the error is specifically `EEXIST` (the lock dir already exists). */
export function isLockAlreadyExistsError(error: unknown): boolean {
  return lockErrorCode(error) === "EEXIST";
}
