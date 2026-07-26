import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { isLockAlreadyExistsError, isTransientLockContentionError } from "../utils/lock-errors.js";
import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";

export const CROSS_PROCESS_LOCK_STALE_MS = 30_000;

/**
 * Age past which an eviction claim is reclaimed even when its recorded owner pid
 * still resolves to a live process (#1134).
 *
 * Liveness alone cannot decide the question, because pids are recycled: an unrelated
 * process can inherit the pid of the evictor that died holding the claim, making a
 * leaked claim look permanently legitimate. A real eviction is a handful of filesystem
 * calls, so any claim that outlives twice the stale window is leaked by definition.
 * This ceiling is what guarantees eviction can never be disabled permanently.
 */
export const EVICTION_CLAIM_RECOVERY_CEILING_MS = CROSS_PROCESS_LOCK_STALE_MS * 2;

/** Identity of the process that created a lock or an eviction claim. */
type LockOwner = { pid: number; startedAt: string };

const OWNER_RECORD_FILE = "owner.json";

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
  /** Reads an owner record; resolves `null` when the file is absent or unreadable. */
  readFile(path: string): Promise<string | null>;
  /**
   * Reports whether `pid` currently resolves to a live process. Production uses
   * `process.kill(pid, 0)`, which signals nothing and only probes existence.
   */
  isProcessAlive(pid: number): boolean;
  tmpdir(): string;
}

/**
 * Produce one host-independent identity for an Access database path.
 *
 * Windows drive and UNC paths always use win32 semantics, even on Linux CI.
 * POSIX paths are normalized lexically. Relative inputs are deliberately kept
 * in their own namespace instead of being resolved against an implicit CWD;
 * callers that need filesystem equivalence must supply an absolute path.
 */
export function canonicalizeAccessLockIdentity(accessPath: string): string {
  const isUncPath = /^[\\/]{2}[^\\/]/.test(accessPath);
  if (isUncPath) {
    return `unc:${win32.normalize(accessPath).replace(/\\/g, "/").toLowerCase()}`;
  }

  const isWindowsDrivePath = /^[A-Za-z]:[\\/]/.test(accessPath);
  if (isWindowsDrivePath) {
    return `windows:${win32.normalize(accessPath).replace(/\\/g, "/").toLowerCase()}`;
  }

  const normalizedSeparators = accessPath.replace(/\\/g, "/");
  const namespace = normalizedSeparators.startsWith("/") ? "posix" : "relative";
  return `${namespace}:${posix.normalize(normalizedSeparators).toLowerCase()}`;
}

export function getCrossProcessLockPath(accessPath: string): string {
  const hash = createHash("sha256")
    .update(canonicalizeAccessLockIdentity(accessPath))
    .digest("hex")
    .slice(0, 16);
  return join(tmpdir(), "dysflow-locks", `${hash}.lock`);
}

/** Serialize this process's identity for a lock or eviction-claim owner record. */
function currentOwnerRecord(): string {
  return JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
}

/**
 * Read the owner record of a lock or claim directory.
 *
 * Resolves `null` when the record is absent, unreadable, or malformed. Callers must
 * treat `null` as "identity unknown", never as "no owner" — the record write is
 * best-effort, so a legitimate lock can exist without one.
 */
async function readOwnerRecord(
  directoryPath: string,
  fileSystem: LockFileSystemPort,
): Promise<LockOwner | null> {
  const raw = await fileSystem.readFile(join(directoryPath, OWNER_RECORD_FILE)).catch(() => null);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { pid, startedAt } = parsed as { pid?: unknown; startedAt?: unknown };
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return null;
    return { pid, startedAt: typeof startedAt === "string" ? startedAt : "" };
  } catch {
    return null;
  }
}

/**
 * Decide whether an existing eviction claim is a leaked one this caller may reclaim.
 *
 * Ordered cheapest-first so the common case (a genuine concurrent eviction) costs a
 * single `stat`:
 *
 * 1. Claim vanished — the owner released it; retrying the claim is safe.
 * 2. Claim younger than the stale window — a real eviction in flight. Back off.
 * 3. Owner unknown or provably dead — leaked. Reclaim.
 * 4. Owner appears alive but the claim outlived {@link EVICTION_CLAIM_RECOVERY_CEILING_MS} —
 *    the pid was recycled. Reclaim anyway, so eviction cannot wedge forever.
 */
async function isEvictionClaimRecoverable(
  claimPath: string,
  staleMs: number,
  fileSystem: LockFileSystemPort,
): Promise<boolean> {
  const claimInfo = await fileSystem.stat(claimPath);
  if (claimInfo === null) return true;

  const claimAgeMs = Date.now() - claimInfo.mtimeMs;
  if (claimAgeMs <= staleMs) return false;

  const owner = await readOwnerRecord(claimPath, fileSystem);
  if (owner === null) return true;
  if (!fileSystem.isProcessAlive(owner.pid)) return true;
  return claimAgeMs > EVICTION_CLAIM_RECOVERY_CEILING_MS;
}

/**
 * Take the sibling eviction claim, reclaiming it first when a previous evictor leaked it.
 *
 * `mkdir` is the only directory operation that is reliably atomic-exclusive on Windows
 * (`rename` is not: two concurrent renames of the same source can BOTH succeed, verified
 * empirically), so it stays the exclusion primitive. The addition for #1134 is that
 * `EEXIST` is no longer an unconditional "someone else owns this": a claim whose owner
 * died is removed and re-taken. Losing the re-take race is correct — the winner is
 * another live evictor, so backing off preserves single-evictor semantics.
 */
async function takeEvictionClaim(
  claimPath: string,
  staleMs: number,
  fileSystem: LockFileSystemPort,
): Promise<boolean> {
  try {
    await fileSystem.mkdir(claimPath, { recursive: false });
    await fileSystem
      .writeFile(join(claimPath, OWNER_RECORD_FILE), currentOwnerRecord(), "utf8")
      .catch(() => {});
    return true;
  } catch (err) {
    if (!isLockAlreadyExistsError(err)) return false;
  }

  if (!(await isEvictionClaimRecoverable(claimPath, staleMs, fileSystem))) return false;

  try {
    await fileSystem.rm(claimPath, { recursive: true, force: true });
  } catch (err) {
    // The leaked claim is still undeletable (typically Windows DELETE_PENDING). Report it
    // instead of swallowing: a claim that never becomes reclaimable is the failure this
    // recovery path exists to make visible.
    logSwallowedIoError("cross-process-lock:claim-recovery-failed", err);
    return false;
  }

  try {
    await fileSystem.mkdir(claimPath, { recursive: false });
    await fileSystem
      .writeFile(join(claimPath, OWNER_RECORD_FILE), currentOwnerRecord(), "utf8")
      .catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomically claim and remove a stale lock directory.
 *
 * A naive `stat`-then-`rm` is a TOCTOU race: two acquirers can both see the lock as
 * stale and both `rm` it, with the second deletion wiping out a *fresh* lock the first
 * acquirer just created — breaking mutual exclusion. Eviction therefore takes a sibling
 * claim directory (see {@link takeEvictionClaim}) so exactly one caller proceeds.
 *
 * The claim alone is not trusted with correctness. Before removing the lock this
 * re-reads the lock's owner record and refuses when it no longer matches the instance
 * observed as stale: a lock replaced under the claim belongs to a new acquirer and must
 * survive. Both reads returning `null` (legacy locks, or a best-effort owner write that
 * failed) is treated as "unchanged" so pre-existing locks stay evictable.
 *
 * @returns `true` when this call evicted the stale lock, `false` otherwise (lock missing,
 *          not stale, replaced under the claim, or being evicted by another acquirer).
 */
export async function evictStaleLock(
  lockPath: string,
  staleMs: number,
  fileSystem: LockFileSystemPort,
): Promise<boolean> {
  const info = await fileSystem.stat(lockPath);
  if (info === null || Date.now() - info.mtimeMs <= staleMs) return false;
  const observedOwner = await readOwnerRecord(lockPath, fileSystem);

  const claimPath = `${lockPath}.evicting`;
  if (!(await takeEvictionClaim(claimPath, staleMs, fileSystem))) return false;

  try {
    // Re-check under the claim: the lock may have been refreshed since the first stat.
    const current = await fileSystem.stat(lockPath);
    if (current === null || Date.now() - current.mtimeMs <= staleMs) return false;

    const currentOwner = await readOwnerRecord(lockPath, fileSystem);
    if (!isSameLockInstance(observedOwner, currentOwner)) return false;

    try {
      await fileSystem.rm(lockPath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  } finally {
    await fileSystem.rm(claimPath, { recursive: true, force: true }).catch((err: unknown) => {
      // The claim survives this failure. It is no longer permanent — the next acquirer
      // reclaims it once it ages past the stale window — but it does cost that acquirer
      // one wasted eviction round, so it is worth a diagnostic.
      logSwallowedIoError("cross-process-lock:claim-release-failed", err);
    });
  }
}

/** Compare two owner records; two unknown identities count as unchanged. */
function isSameLockInstance(observed: LockOwner | null, current: LockOwner | null): boolean {
  if (observed === null && current === null) return true;
  if (observed === null || current === null) return false;
  return observed.pid === current.pid && observed.startedAt === current.startedAt;
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
      // Write owner identity so a future acquirer can log who held the lock, and so
      // `evictStaleLock` can tell this lock instance apart from a replacement (#1134).
      await fileSystem
        .writeFile(join(lockPath, OWNER_RECORD_FILE), currentOwnerRecord(), "utf8")
        .catch(() => {});
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
 * @param key           - The access path to lock on (canonicalized independently of host OS).
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
/**
 * #750 — read-only variant of `runWithAccessExecutionLock`.
 *
 * Serializes work in-process via the same `lockState` map, but DOES NOT acquire
 * the cross-process file lock and DOES NOT start a heartbeat. Used by the
 * `AccessPowerShellRunner` for `kind: "diagnostics"` and for any
 * `kind: "vba"` request that opts into `readOnly: true` (export_modules,
 * export_all). Those paths are read-only and acquiring the cross-process
 * lock would tell Access "another process is editing", causing Access to
 * rewrite metadata on the .accdb even though the runner doesn't write.
 */
export async function runWithAccessExecutionReadLock<T>(
  key: string,
  work: () => T | Promise<T>,
  lockState: Map<string, Promise<void>> = defaultAccessExecutionLocks,
): Promise<T> {
  const normalizedKey = canonicalizeAccessLockIdentity(key);
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

  // No cross-process file lock, no heartbeat. The in-process release still
  // runs even if `work` throws — same invariant as the write variant.
  try {
    return await work();
  } finally {
    releaseCurrent();
    if (lockState.get(normalizedKey) === current) lockState.delete(normalizedKey);
  }
}

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
  const normalizedKey = canonicalizeAccessLockIdentity(key);
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
