/**
 * Cross-process and in-process lock primitives for the Access runner.
 *
 * These symbols were extracted from `access-runner.ts` (issue #477).
 * The module is pure domain — no adapter imports.
 */

import { createHash } from "node:crypto";
import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

export function getCrossProcessLockPath(accessPath: string): string {
  const hash = createHash("sha256").update(accessPath.toLowerCase()).digest("hex").slice(0, 16);
  return join(tmpdir(), "dysflow-locks", `${hash}.lock`);
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
  sleepMs = 50,
): Promise<() => Promise<void>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await mkdir(lockPath, { recursive: false });
      // Write owner identity so a future acquirer can log who held the lock.
      const owner = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
      await writeFile(join(lockPath, "owner.json"), owner, "utf8").catch(() => {});
      return async () => {
        await releaseCrossProcessAccessLock(lockPath);
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const info = await stat(lockPath).catch(() => null);
      if (info !== null && Date.now() - info.mtimeMs > CROSS_PROCESS_LOCK_STALE_MS) {
        await rm(lockPath, { recursive: true, force: true }).catch(() => {});
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }
  throw new RunnerLockTimeoutError(lockPath, timeoutMs);
}

export async function releaseCrossProcessAccessLock(lockPath: string): Promise<void> {
  await rm(lockPath, { recursive: true, force: true }).catch(() => {});
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
export function startLockHeartbeat(lockPath: string, stopSignal?: AbortSignal): NodeJS.Timeout {
  const intervalMs = CROSS_PROCESS_LOCK_STALE_MS / 2;
  const handle = setInterval(() => {
    const now = new Date();
    utimes(lockPath, now, now).catch(() => {
      // Swallow — if the dir is gone the lock has already been released.
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
 * @param lockState     - Optional in-process lock map. Defaults to the module-level
 *                        `defaultAccessExecutionLocks` singleton so production code
 *                        gets the original serialized behaviour without passing anything.
 */
export async function runWithAccessExecutionLock<T>(
  key: string,
  work: () => T | Promise<T>,
  timeoutMs: number,
  lockState: Map<string, Promise<void>> = defaultAccessExecutionLocks,
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

  const lockPath = getCrossProcessLockPath(key);
  await mkdir(join(lockPath, ".."), { recursive: true }).catch(() => {});
  const releaseCrossProcessLock = await acquireCrossProcessAccessLock(lockPath, timeoutMs);
  const stopHeartbeat = startLockHeartbeat(lockPath);
  try {
    return await work();
  } finally {
    clearInterval(stopHeartbeat);
    await releaseCrossProcessLock();
    releaseCurrent();
    if (lockState.get(normalizedKey) === current) lockState.delete(normalizedKey);
  }
}
