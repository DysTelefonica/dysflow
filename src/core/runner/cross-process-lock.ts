import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLockAlreadyExistsError, isTransientLockContentionError } from "../utils/lock-errors.js";
import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";

export const CROSS_PROCESS_LOCK_STALE_MS = 30_000;

export class RunnerLockTimeoutError extends Error {
  constructor(
    public readonly lockPath: string,
    public readonly timeoutMs: number,
  ) {
    super(`Could not acquire cross-process lock for ${lockPath} within ${timeoutMs}ms`);
    this.name = "RunnerLockTimeoutError";
  }
}

export interface LockFileSystemPort {
  mkdir(path: string, options?: { recursive: boolean }): Promise<string | undefined>;
  rm(path: string, options?: { recursive: boolean; force: boolean }): Promise<void>;
  stat(path: string): Promise<{ mtimeMs: number } | null>;
  utimes(path: string, atime: Date, mtime: Date): Promise<void>;
  writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
  tmpdir(): string;
}

export function getCrossProcessLockPath(accessPath: string): string {
  const hash = createHash("sha256").update(accessPath.toLowerCase()).digest("hex").slice(0, 16);
  return join(tmpdir(), "dysflow-locks", `${hash}.lock`);
}

/**
 * Atomically claim and remove a stale lock directory.
 *
 * A naive `stat`-then-`rm` is a TOCTOU race: two acquirers can both see the lock as
 * stale and both `rm` it, with the second deletion wiping out a *fresh* lock the first
 * acquirer just created — breaking mutual exclusion. `rename` is not a usable exclusion
 * primitive here either: on Windows two concurrent directory renames of the same source
 * can BOTH succeed (verified empirically). The only directory operation that is reliably
 * atomic-exclusive on Windows is `mkdir` — which is exactly what lock acquisition uses.
 *
 * So eviction takes a sibling claim directory via `mkdir`: exactly one concurrent caller
 * wins (the rest get `EEXIST`), and only the winner removes the stale lock and then its
 * own claim. This guarantees a single evictor, so no one can delete a fresh lock created
 * by a different acquirer.
 *
 * @returns `true` when this call evicted the stale lock, `false` otherwise (lock missing,
 *          not stale, or already being evicted by another acquirer).
 */
export async function evictStaleLock(
  lockPath: string,
  staleMs: number,
  fileSystem: LockFileSystemPort,
): Promise<boolean> {
  const info = await fileSystem.stat(lockPath);
  if (info === null || Date.now() - info.mtimeMs <= staleMs) return false;

  const claimPath = `${lockPath}.evicting`;
  try {
    await fileSystem.mkdir(claimPath, { recursive: false });
  } catch {
    // EEXIST (or any failure): another acquirer already owns the eviction. Back off.
    return false;
  }
  try {
    // Re-check under the claim: the lock may have been refreshed since the first stat.
    const current = await fileSystem.stat(lockPath);
    if (current !== null && Date.now() - current.mtimeMs > staleMs) {
      await fileSystem.rm(lockPath, { recursive: true, force: true }).catch(() => {});
    }
  } finally {
    await fileSystem.rm(claimPath, { recursive: true, force: true }).catch(() => {});
  }
  return true;
}

/**
 * Poll a lock directory until acquired, or throw `RunnerLockTimeoutError`.
 * If the existing lock is older than CROSS_PROCESS_LOCK_STALE_MS it is considered
 * stale and evicted so a new acquirer can take over.
 *
 * Returns a release function (best-effort directory removal).
 */
export async function acquireCrossProcessAccessLock(
  lockPath: string,
  timeoutMs: number,
  sleepMs: number,
  fileSystem: LockFileSystemPort,
): Promise<() => Promise<void>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fileSystem.mkdir(lockPath, { recursive: false });
      // Write owner identity so a future acquirer can log who held the lock.
      const owner = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
      await fileSystem.writeFile(join(lockPath, "owner.json"), owner, "utf8").catch(() => {});
      return async () => {
        await releaseCrossProcessAccessLock(lockPath, fileSystem);
      };
    } catch (err) {
      if (!isTransientLockContentionError(err)) throw err;
      // EEXIST: the lock dir exists and may be stale and evictable. EACCES/EPERM: a concurrent
      // release left the dir in Windows DELETE_PENDING state — eviction is pointless mid-delete,
      // so just back off and retry. A genuinely permanent permission error is bounded by the
      // acquire deadline (surfaces as RunnerLockTimeoutError).
      if (isLockAlreadyExistsError(err)) {
        if (await evictStaleLock(lockPath, CROSS_PROCESS_LOCK_STALE_MS, fileSystem)) continue;
      } else {
        logSwallowedIoError("cross-process-lock:acquire-transient", err);
      }
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }
  throw new RunnerLockTimeoutError(lockPath, timeoutMs);
}

export async function releaseCrossProcessAccessLock(
  lockPath: string,
  fileSystem: LockFileSystemPort,
): Promise<void> {
  await fileSystem.rm(lockPath, { recursive: true, force: true }).catch(() => {});
}

/**
 * While a process holds the cross-process lock it must periodically refresh the lock dir
 * mtime so that a concurrent acquirer never sees it as stale.  The interval is half the
 * stale threshold so at least one heartbeat always falls inside a legitimate hold window.
 *
 * When `stopSignal` is supplied the interval is stopped automatically when it fires;
 * otherwise callers must invoke the returned cleanup function to stop the interval.
 * The returned handle allows callers to call `unref()` when needed.
 */
export function startLockHeartbeat(
  lockPath: string,
  fileSystem: LockFileSystemPort,
  stopSignal?: AbortSignal,
  // F3b (#620): the default is a silent no-op so callers that do not care about
  // heartbeat failures (e.g. tests, ad-hoc scripts) do not get noisy debug logs.
  // Production wiring (`AccessPowerShellRunner.run`) supplies an explicit sink
  // that collects errors and surfaces them as warning diagnostics on the
  // returned `OperationResult`. The default change does not affect callers who
  // already pass `onHeartbeatError` explicitly.
  onHeartbeatError: (error: unknown) => void = () => {
    /* F3b: silent no-op when no caller-supplied sink */
  },
): NodeJS.Timeout {
  const intervalMs = CROSS_PROCESS_LOCK_STALE_MS / 2;
  const handle = setInterval(() => {
    const now = new Date();
    fileSystem.utimes(lockPath, now, now).catch((error: unknown) => {
      // ENOENT means the lock dir is gone — the lock has already been released, which is the
      // normal teardown race, not a failure. Any other error means the heartbeat could not
      // refresh the mtime; left unobserved, a persistent failure lets a concurrent acquirer
      // declare this live lock stale and steal it, breaking mutual exclusion. Surface it.
      if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return;
      onHeartbeatError(error);
    });
  }, intervalMs);
  // Allow the Node.js event loop to exit even if the interval is somehow not cleared.
  if (typeof handle === "object" && handle !== null && "unref" in handle) {
    (handle as NodeJS.Timeout).unref();
  }
  if (stopSignal) {
    const cleanup = () => clearInterval(handle);
    stopSignal.addEventListener("abort", cleanup, { once: true });
  }
  return handle;
}

// ---------------------------------------------------------------------------
// In-process serialized execution map
// ---------------------------------------------------------------------------

/**
 * Default in-process execution lock map — a module-level singleton that ensures
 * concurrent calls for the same key are serialized. Exported so callers of
 * `runWithAccessExecutionLock` can pass it explicitly for test isolation.
//
 */
export const defaultAccessExecutionLocks = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// runWithAccessExecutionLock
// ---------------------------------------------------------------------------

/**
 * Wraps `work` with both an in-process serialized queue (via `lockState`) and a
 * cross-process file-system lock.
 *
 * @param key           - The access path to lock on (normalized to lowercase).
 * @param work          - The async unit of work to execute while holding the lock.
 * @param timeoutMs     - Max time to wait for the cross-process lock.
 * @param fileSystem    - Injected filesystem port. Production injects `nodeLockFileSystem`
 *                        (src/adapters/runner/node-lock-file-system.ts); tests inject a fake.
 * @param lockState     - Optional in-process lock map. Defaults to the module-level
 *                        `defaultAccessExecutionLocks` singleton so production code
 *                        gets the original serialized behaviour without passing anything.
 * @param onHeartbeatError - Optional callback for non-ENOENT heartbeat failures
 *                           (F3b, #620). When omitted, the heartbeat fails silently
 *                           per the new default in `startLockHeartbeat`. Production
 *                           wiring in `AccessPowerShellRunner.run` supplies an explicit
 *                           sink that drains into the returned `OperationResult.diagnostics`.
 */
export async function runWithAccessExecutionLock<T>(
  key: string,
  work: () => T | Promise<T>,
  timeoutMs: number,
  fileSystem: LockFileSystemPort,
  lockState: Map<string, Promise<void>> = defaultAccessExecutionLocks,
  onHeartbeatError: (error: unknown) => void = () => {
    /* F3b: silent no-op — see startLockHeartbeat default */
  },
): Promise<T> {
  const normalizedKey = key.toLowerCase();
  const previous = lockState.get(normalizedKey) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = previous.then(
    () =>
      new Promise<void>((resolve) => {
        releaseCurrent = resolve;
      }),
  );
  lockState.set(normalizedKey, current);

  await previous;

  // The in-process release (releaseCurrent + map cleanup) MUST run even if acquiring the
  // cross-process lock throws (e.g. RunnerLockTimeoutError). If it doesn't, `current` stays
  // pending forever and every later same-key call deadlocks on `await previous`. So the
  // cross-process acquisition lives INSIDE this try/finally, not before it.
  try {
    const lockPath = getCrossProcessLockPath(key);
    await fileSystem.mkdir(join(lockPath, ".."), { recursive: true }).catch(() => {});
    const releaseCrossProcessLock = await acquireCrossProcessAccessLock(
      lockPath,
      timeoutMs,
      50,
      fileSystem,
    );
    // F3b (#620): thread the optional heartbeat error sink through to the heartbeat.
    const stopHeartbeat = startLockHeartbeat(lockPath, fileSystem, undefined, onHeartbeatError);
    try {
      return await work();
    } finally {
      clearInterval(stopHeartbeat);
      await releaseCrossProcessLock();
    }
  } finally {
    releaseCurrent();
    if (lockState.get(normalizedKey) === current) lockState.delete(normalizedKey);
  }
}
