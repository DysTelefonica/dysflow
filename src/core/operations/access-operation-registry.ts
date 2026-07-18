import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { isLockAlreadyExistsError, isTransientLockContentionError } from "../utils/lock-errors.js";
import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";
import type { RegistryFileSystemPort } from "./registry-file-system-port.js";

export type AccessOperationStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cleanup_pending"
  | "cleaned"
  | "pid_unknown"
  | "running_untracked"
  | "abandoned";

export type AccessOperationAction = "vba" | "query" | "diagnostics" | "import" | "test" | "run";

export type AccessOperationRecord = {
  operationId: string;
  action: AccessOperationAction;
  accessPath: string;
  destinationRootAbs?: string;
  projectRootAbs?: string;
  accessPid: number | null;
  powershellWorkerPid?: number | null;
  processStartTime: string | null;
  commandLine?: string;
  status: AccessOperationStatus;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export type AccessOperationMetadata = Pick<
  AccessOperationRecord,
  "operationId" | "accessPath" | "accessPid" | "processStartTime" | "status"
>;

export type CreateAccessOperationRecord = AccessOperationRecord;
export type UpdateAccessOperationRecord = Partial<Omit<AccessOperationRecord, "operationId">>;

/**
 * Health snapshot for an `AccessOperationRegistry`. The `degraded` variant is
 * set by `FileAccessOperationRegistry` when the on-disk JSON cannot be parsed
 * (see DELTA-001 / #575): the corrupt file is quarantined to a `.quarantine-<ISO>.json`
 * sidecar so the original bytes are preserved for forensics, and the registry
 * reports its degraded state so list/cleanup callers can distinguish between
 * "no operations" and "registry was corrupt and is now empty by design".
 *
 * `InMemoryAccessOperationRegistry` always reports `ok` (the in-memory map
 * cannot be corrupted by definition).
 */
export type AccessOperationRegistryHealth =
  | { status: "ok" }
  | {
      status: "degraded";
      reason: "corrupt-json";
      quarantinePath: string;
      quarantinedAt: string;
    };

export type AccessOperationRegistry = {
  create(record: CreateAccessOperationRecord): Promise<AccessOperationRecord>;
  update(
    operationId: string,
    patch: UpdateAccessOperationRecord,
  ): Promise<AccessOperationRecord | undefined>;
  get(operationId: string): Promise<AccessOperationRecord | undefined>;
  listRecent(options?: { limit?: number }): Promise<AccessOperationRecord[]>;
  /**
   * Snapshot of the registry's health. `degraded` means the on-disk file was
   * corrupt at last read and has been moved aside; subsequent reads return an
   * empty list. New `create`/`update` calls after a quarantine are still allowed
   * and will eventually overwrite the (now empty) registry file.
   */
  getHealth(): AccessOperationRegistryHealth;
};

/**
 * A listed operation enriched with a computed `isStale` marker. The flag is
 * derived at read time (never persisted) so a consumer can tell lingering,
 * unattributed records apart from genuinely active ones. See
 * {@link isStaleAccessOperation}.
 */
export type AccessOperationListEntry = AccessOperationRecord & { isStale: boolean };

export type InMemoryAccessOperationRegistryOptions = {
  maxRecords?: number;
};

export type FileAccessOperationRegistryOptions = InMemoryAccessOperationRegistryOptions & {
  filePath: string;
  lockTimeoutMs?: number;
  staleLockMs?: number;
  /**
   * Filesystem port. Production wires `nodeRegistryFileSystem`
   * (`src/adapters/operations/node-registry-file-system.ts`); tests inject a
   * fake to drive happy / sad / adversarial branches without touching host
   * FS. Hexagonal split (#A, #624): the registry no longer imports
   * `node:fs/promises` directly.
   */
  fileSystem: RegistryFileSystemPort;
};

const DEFAULT_MAX_RECORDS = 1000;
export const DEFAULT_RECENT_ACCESS_OPERATION_LIMIT = 50;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
export const DEFAULT_STALE_LOCK_MS = 300_000;
const LOCK_RETRY_INTERVAL_MS = 10;
const PURGED_PERSISTENT_STATUSES = new Set<AccessOperationStatus>(["completed", "cleaned"]);

export function createInMemoryAccessOperationRegistry(): AccessOperationRegistry {
  return new InMemoryAccessOperationRegistry();
}

export function createProjectAccessOperationRegistry(config: {
  projectRoot?: string;
  fileSystem: RegistryFileSystemPort;
}): AccessOperationRegistry {
  return new FileAccessOperationRegistry({
    filePath: resolveProjectOperationRegistryPath(config),
    fileSystem: config.fileSystem,
  });
}

export function resolveAccessOperationRegistry(
  registry: AccessOperationRegistry | undefined,
  createFallback: () => AccessOperationRegistry = createInMemoryAccessOperationRegistry,
): AccessOperationRegistry {
  return registry ?? createFallback();
}

export async function listRecentAccessOperations(
  registry: AccessOperationRegistry,
  options: { nowMs?: number } = {},
): Promise<AccessOperationListEntry[]> {
  const records = await registry.listRecent({ limit: DEFAULT_RECENT_ACCESS_OPERATION_LIMIT });
  const nowMs = options.nowMs ?? Date.now();
  return records.map((record) => ({ ...record, isStale: isStaleAccessOperation(record, nowMs) }));
}

export function evictOldestRecordsFromMap(
  records: Map<string, AccessOperationRecord>,
  maxRecords: number,
): void {
  const overCount = records.size - maxRecords;
  if (overCount <= 0) return;
  const toEvict = [...records.values()]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0))
    .slice(0, overCount);
  for (const r of toEvict) records.delete(r.operationId);
}

type RegistryMutationLock = {
  ownerToken: string;
};

export class FileAccessOperationRegistry implements AccessOperationRegistry {
  private static readonly fileLocks = new Map<string, Promise<unknown>>();

  private readonly filePath: string;
  private readonly lockPath: string;
  private readonly lockOwnerPath: string;
  private readonly maxRecords: number;
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;
  /**
   * Hexagonal split (#A, #624): every filesystem call the registry makes
   * routes through this port. Production composition roots inject
   * `nodeRegistryFileSystem`; tests inject fakes to drive happy / sad /
   * adversarial branches without touching the host filesystem.
   */
  private readonly fileSystem: RegistryFileSystemPort;
  private lastHealth: AccessOperationRegistryHealth = { status: "ok" };

  constructor(options: FileAccessOperationRegistryOptions) {
    this.filePath = resolve(options.filePath);
    this.lockPath = `${this.filePath}.lock`;
    this.lockOwnerPath = join(this.lockPath, "owner");
    this.maxRecords = Math.max(1, Math.floor(options.maxRecords ?? DEFAULT_MAX_RECORDS));
    this.lockTimeoutMs = Math.max(1, Math.floor(options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS));
    this.staleLockMs = Math.max(1, Math.floor(options.staleLockMs ?? DEFAULT_STALE_LOCK_MS));
    this.fileSystem = options.fileSystem;
  }

  async create(record: CreateAccessOperationRecord): Promise<AccessOperationRecord> {
    return this.withFileLock(async () => {
      const records = await this.readRecords();
      const stored = { ...record, metadata: { ...record.metadata } };
      if (!PURGED_PERSISTENT_STATUSES.has(stored.status)) {
        records.set(stored.operationId, stored);
        this.evictOldestRecords(records);
        await this.writeRecords(records);
      }
      return { ...stored, metadata: { ...stored.metadata } };
    });
  }

  async update(
    operationId: string,
    patch: UpdateAccessOperationRecord,
  ): Promise<AccessOperationRecord | undefined> {
    return this.withFileLock(async () => {
      const records = await this.readRecords();
      const current = records.get(operationId);
      if (current === undefined) return undefined;
      const next = { ...current, ...patch, metadata: patch.metadata ?? current.metadata };
      if (PURGED_PERSISTENT_STATUSES.has(next.status)) {
        records.delete(operationId);
      } else {
        records.set(operationId, next);
        this.evictOldestRecords(records);
      }
      await this.writeRecords(records);
      return { ...next, metadata: { ...next.metadata } };
    });
  }

  async get(operationId: string): Promise<AccessOperationRecord | undefined> {
    const record = (await this.readRecords()).get(operationId);
    return record ? { ...record, metadata: { ...record.metadata } } : undefined;
  }

  async listRecent(options: { limit?: number } = {}): Promise<AccessOperationRecord[]> {
    const limit = options.limit ?? DEFAULT_RECENT_ACCESS_OPERATION_LIMIT;
    return [...(await this.readRecords()).values()]
      .sort((a, b) => (b.updatedAt < a.updatedAt ? -1 : b.updatedAt > a.updatedAt ? 1 : 0))
      .slice(0, limit)
      .map((record) => ({ ...record, metadata: { ...record.metadata } }));
  }

  getHealth(): AccessOperationRegistryHealth {
    return this.lastHealth;
  }

  private async withFileLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = FileAccessOperationRegistry.fileLocks.get(this.filePath) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => this.withRegistryMutationLock(operation));
    const settled = current.catch(() => undefined);
    FileAccessOperationRegistry.fileLocks.set(this.filePath, settled);
    try {
      return await current;
    } finally {
      if (FileAccessOperationRegistry.fileLocks.get(this.filePath) === settled) {
        FileAccessOperationRegistry.fileLocks.delete(this.filePath);
      }
    }
  }

  private async withRegistryMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const lock = await this.acquireRegistryMutationLock();
    try {
      return await operation();
    } finally {
      await this.releaseRegistryMutationLock(lock).catch(() => undefined);
    }
  }

  private async acquireRegistryMutationLock(): Promise<RegistryMutationLock> {
    const deadline = Date.now() + this.lockTimeoutMs;
    await this.fileSystem.mkdir(dirname(this.lockPath), { recursive: true });
    while (true) {
      const ownerToken = this.createLockOwnerToken();
      try {
        await this.fileSystem.mkdir(this.lockPath);
      } catch (error) {
        if (!isTransientLockContentionError(error)) throw error;
        // EEXIST: the lock dir exists and may be stale. EACCES/EPERM: a concurrent release left
        // it in Windows DELETE_PENDING state — eviction is pointless mid-delete, so just retry.
        if (isLockAlreadyExistsError(error)) {
          await this.removeLockIfStale();
        } else {
          logSwallowedIoError("access-operation-registry:acquire-transient", error);
        }
        if (Date.now() >= deadline) {
          throw new Error(`Timed out acquiring operation registry lock: ${this.lockPath}`);
        }
        await sleep(Math.min(LOCK_RETRY_INTERVAL_MS, Math.max(1, deadline - Date.now())));
        continue;
      }

      try {
        await this.fileSystem.writeFile(this.lockOwnerPath, ownerToken, "utf8", { flag: "wx" });
        return { ownerToken };
      } catch (error) {
        await this.removeOwnerlessLockDirectory().catch(() => undefined);
        if (!isPathMissingError(error) && !isTransientLockContentionError(error)) throw error;
        await this.removeLockIfStale();
        if (Date.now() >= deadline) {
          throw new Error(`Timed out acquiring operation registry lock: ${this.lockPath}`);
        }
        await sleep(Math.min(LOCK_RETRY_INTERVAL_MS, Math.max(1, deadline - Date.now())));
      }
    }
  }

  private async removeLockIfStale(): Promise<void> {
    if ((await this.readLockOwnerToken()) !== undefined) return;
    if (!(await this.isLockStale())) return;
    if ((await this.readLockOwnerToken()) !== undefined) return;

    await this.removeOwnerlessLockDirectory();
  }

  private async removeOwnerlessLockDirectory(): Promise<void> {
    if ((await this.readLockOwnerToken()) !== undefined) return;
    try {
      await this.fileSystem.rmdir(this.lockPath);
    } catch (error) {
      if (isPathMissingError(error) || isDirectoryNotEmptyError(error)) return;
      throw error;
    }
  }

  private async releaseRegistryMutationLock(lock: RegistryMutationLock): Promise<void> {
    if ((await this.readLockOwnerToken()) !== lock.ownerToken) return;
    if ((await this.readLockOwnerToken()) !== lock.ownerToken) return;
    await this.fileSystem.rm(this.lockOwnerPath, { force: true });
    try {
      await this.fileSystem.rmdir(this.lockPath);
    } catch (error) {
      if (isPathMissingError(error)) return;
      throw error;
    }
  }

  private async readLockOwnerToken(): Promise<string | undefined> {
    try {
      return await this.fileSystem.readFile(this.lockOwnerPath, "utf8");
    } catch (error) {
      if (isPathMissingError(error)) return undefined;
      throw error;
    }
  }

  private async isLockStale(): Promise<boolean> {
    // RegistryFileSystemPort.stat returns undefined for ENOENT and rethrows every
    // other error unchanged, so no extra .catch wrapper is needed here.
    const lockStat = await this.fileSystem.stat(this.lockPath);
    return lockStat !== undefined && Date.now() - lockStat.mtimeMs >= this.staleLockMs;
  }

  private createLockOwnerToken(): string {
    return `${process.pid}:${randomUUID()}`;
  }

  private async readRecords(): Promise<Map<string, AccessOperationRecord>> {
    const raw = await this.fileSystem.readFile(this.filePath, "utf8").catch((err: unknown) => {
      if (isPathMissingError(err)) return undefined;
      logSwallowedIoError("access-operation-registry:read", err);
      return undefined;
    });
    if (raw === undefined || raw.trim().length === 0) return new Map();
    try {
      const parsed = JSON.parse(raw) as
        | { records?: AccessOperationRecord[] }
        | AccessOperationRecord[];
      const records = Array.isArray(parsed) ? parsed : (parsed.records ?? []);
      return new Map(
        records.map((record) => [
          record.operationId,
          { ...record, metadata: { ...record.metadata } },
        ]),
      );
    } catch (err) {
      logSwallowedIoError("access-operation-registry:parse", err);
      // DELTA-001 (#575): a corrupt registry must be quarantined, not silently
      // treated as empty. The original bytes are preserved at a `.quarantine-<ISO>.json`
      // sidecar so the operator can inspect/recover them, and `getHealth()` reports
      // the degraded state so list/cleanup callers can distinguish "no operations"
      // from "registry was corrupt and is now empty by design".
      const quarantine = await this.quarantineCorruptFile(raw).catch(() => undefined);
      if (quarantine !== undefined) {
        this.lastHealth = quarantine;
      }
      return new Map();
    }
  }

  /**
   * Renames the current `this.filePath` to `<filePath>.quarantine-<ISO>.json`
   * alongside the original location. If the rename fails (e.g. cross-device or
   * permission denied) the file is left in place and the caller falls back to
   * returning an empty map without surfacing a quarantine. Returns the health
   * snapshot to stamp on the registry instance.
   */
  private async quarantineCorruptFile(
    raw: string,
  ): Promise<Extract<AccessOperationRegistryHealth, { status: "degraded" }> | undefined> {
    const isoStamp = new Date().toISOString().replace(/[:.]/g, "-");
    const quarantinePath = `${this.filePath}.quarantine-${isoStamp}.json`;
    try {
      await this.fileSystem.mkdir(dirname(this.filePath), { recursive: true });
      await this.fileSystem.rename(this.filePath, quarantinePath);
      return {
        status: "degraded",
        reason: "corrupt-json",
        quarantinePath,
        quarantinedAt: new Date().toISOString(),
      };
    } catch (renameErr) {
      logSwallowedIoError("access-operation-registry:quarantine", renameErr);
      // Last-resort: try to copy the bytes to the quarantine sidecar so the
      // operator at least has the corrupt content available, even if the
      // original could not be moved.
      try {
        const tempPath = `${this.filePath}.quarantine-${isoStamp}.json.partial`;
        await this.fileSystem.writeFile(tempPath, raw, "utf8");
        await this.fileSystem.rename(tempPath, quarantinePath);
        return {
          status: "degraded",
          reason: "corrupt-json",
          quarantinePath,
          quarantinedAt: new Date().toISOString(),
        };
      } catch {
        return undefined;
      }
    }
  }

  private async writeRecords(records: Map<string, AccessOperationRecord>): Promise<void> {
    await this.fileSystem.mkdir(dirname(this.filePath), { recursive: true });
    const payload = {
      records: [...records.values()].sort((a, b) =>
        b.updatedAt < a.updatedAt ? -1 : b.updatedAt > a.updatedAt ? 1 : 0,
      ),
    };
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await this.fileSystem.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      await this.fileSystem.rename(tempPath, this.filePath);
    } catch (error) {
      await this.fileSystem.rm(tempPath, { force: true });
      throw error;
    }
  }

  private evictOldestRecords(records: Map<string, AccessOperationRecord>): void {
    evictOldestRecordsFromMap(records, this.maxRecords);
  }
}

export class InMemoryAccessOperationRegistry implements AccessOperationRegistry {
  private readonly records = new Map<string, AccessOperationRecord>();
  private readonly maxRecords: number;

  constructor(options: InMemoryAccessOperationRegistryOptions = {}) {
    this.maxRecords = Math.max(1, Math.floor(options.maxRecords ?? DEFAULT_MAX_RECORDS));
  }

  async create(record: CreateAccessOperationRecord): Promise<AccessOperationRecord> {
    const stored = { ...record, metadata: { ...record.metadata } };
    if (!PURGED_PERSISTENT_STATUSES.has(stored.status)) {
      this.records.set(stored.operationId, stored);
      this.evictOldestRecords();
    }
    return { ...stored, metadata: { ...stored.metadata } };
  }

  async update(
    operationId: string,
    patch: UpdateAccessOperationRecord,
  ): Promise<AccessOperationRecord | undefined> {
    const current = this.records.get(operationId);
    if (current === undefined) return undefined;
    const next = { ...current, ...patch, metadata: patch.metadata ?? current.metadata };
    if (PURGED_PERSISTENT_STATUSES.has(next.status)) {
      this.records.delete(operationId);
    } else {
      this.records.set(operationId, next);
    }
    return { ...next, metadata: { ...next.metadata } };
  }

  async get(operationId: string): Promise<AccessOperationRecord | undefined> {
    const record = this.records.get(operationId);
    return record ? { ...record, metadata: { ...record.metadata } } : undefined;
  }

  async listRecent(options: { limit?: number } = {}): Promise<AccessOperationRecord[]> {
    const limit = options.limit ?? DEFAULT_RECENT_ACCESS_OPERATION_LIMIT;
    return [...this.records.values()]
      .sort((a, b) => (b.updatedAt < a.updatedAt ? -1 : b.updatedAt > a.updatedAt ? 1 : 0))
      .slice(0, limit)
      .map((record) => ({ ...record, metadata: { ...record.metadata } }));
  }

  getHealth(): AccessOperationRegistryHealth {
    // The in-memory registry cannot be corrupted by definition — every record
    // passed through `create`/`update` is held only in JS, with no JSON
    // serialization that could fail to parse later. Always ok.
    return { status: "ok" };
  }

  private evictOldestRecords(): void {
    evictOldestRecordsFromMap(this.records, this.maxRecords);
  }
}

function isPathMissingError(error: unknown): boolean {
  return isErrorWithCode(error, "ENOENT");
}

function isDirectoryNotEmptyError(error: unknown): boolean {
  return isErrorWithCode(error, "ENOTEMPTY") || isErrorWithCode(error, "EEXIST");
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

export function createAccessOperationId(): string {
  return `dysflow-${randomUUID()}`;
}

/**
 * A "starting" operation that never recorded process ownership is considered
 * interrupted once it has been idle longer than this. Until the threshold
 * elapses it may be a legitimately in-flight operation that simply has not yet
 * emitted its DYSFLOW_ACCESS_PROCESS marker (e.g. Access is still launching).
 */
export const DEFAULT_STARTING_STALE_MS = 120_000;

/**
 * Structured reason stamped on an operation that was interrupted before it
 * acquired (and recorded ownership of) an Access process. Because no PID was
 * ever owned, there is no process to kill — retiring such a record is purely
 * registry bookkeeping.
 */
export const INTERRUPTED_BEFORE_PID_REASON =
  "Operation was interrupted before acquiring an Access PID; no Access process ownership was recorded, so there is no process to kill.";

/**
 * True when a record is a "starting" operation that never recorded process
 * ownership (no PID and no start time) and has been idle past the staleness
 * threshold. Such a record is safe to retire as registry-only bookkeeping:
 * because no PID was ever owned it cannot, and must not, drive any process kill.
 *
 * The staleness window is the safety gate against retiring an operation that is
 * still legitimately starting and has merely not emitted its PID marker yet.
 */
export function isInterruptedStartingRecord(
  record: Pick<AccessOperationRecord, "status" | "accessPid" | "processStartTime" | "updatedAt">,
  nowMs: number,
  thresholdMs: number = DEFAULT_STARTING_STALE_MS,
): boolean {
  if (record.status !== "starting") return false;
  if (record.accessPid !== null || record.processStartTime !== null) return false;
  const updatedMs = Date.parse(record.updatedAt);
  if (Number.isNaN(updatedMs)) return false;
  return nowMs - updatedMs >= Math.max(0, thresholdMs);
}

/**
 * Default idle window after which a lingering, unattributed operation is
 * reported as stale by {@link isStaleAccessOperation}. One hour: long enough to
 * never flag a genuinely in-flight operation, short enough that day-old failures
 * read as stale.
 */
export const DEFAULT_STALE_OPERATION_MS = 3_600_000;

/**
 * True when a listed operation is lingering, unattributed state that a consumer
 * can safely treat as no longer active. This is a READ-TIME marker only — it
 * never deletes or mutates the record.
 *
 * An operation is stale when EITHER:
 * - it is an interrupted "starting" record (see {@link isInterruptedStartingRecord}), OR
 * - it is in a terminal/unresolved status (`failed`, `timed_out`, `pid_unknown`,
 *   `cleanup_pending`) with NO owned PID (`accessPid === null`) and has been idle
 *   longer than `thresholdMs`.
 *
 * Active states (`running`, `running_untracked`), any record that still owns a
 * PID, and records with an unparseable `updatedAt` are never stale.
 */
export function isStaleAccessOperation(
  record: Pick<AccessOperationRecord, "status" | "accessPid" | "processStartTime" | "updatedAt">,
  nowMs: number,
  thresholdMs: number = DEFAULT_STALE_OPERATION_MS,
): boolean {
  if (isInterruptedStartingRecord(record, nowMs, thresholdMs)) return true;
  if (record.accessPid !== null) return false;
  if (!LINGERING_STALE_STATUSES.has(record.status)) return false;
  const updatedMs = Date.parse(record.updatedAt);
  if (Number.isNaN(updatedMs)) return false;
  return nowMs - updatedMs >= Math.max(0, thresholdMs);
}

const LINGERING_STALE_STATUSES = new Set<AccessOperationStatus>([
  "failed",
  "timed_out",
  "pid_unknown",
  "cleanup_pending",
]);

export function toOperationMetadata(record: AccessOperationRecord): AccessOperationMetadata {
  return {
    operationId: record.operationId,
    accessPath: record.accessPath,
    accessPid: record.accessPid,
    processStartTime: record.processStartTime,
    status: record.status,
  };
}

/**
 * Resolves the file path for the per-project Access operation registry JSON.
 * Moved from src/adapters/mcp/stdio.ts to break the HTTP→MCP adapter coupling (#196).
 */
export function resolveProjectOperationRegistryPath(config: { projectRoot?: string }): string {
  return join(config.projectRoot ?? process.cwd(), ".dysflow", "runtime", "operations.json");
}
