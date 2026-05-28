import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type AccessOperationStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cleanup_pending"
  | "cleaned"
  | "pid_unknown"
  | "running_untracked";

export type AccessOperationAction = "vba" | "query" | "diagnostics" | "import" | "test" | "run";

export type AccessOperationRecord = {
  operationId: string;
  action: AccessOperationAction;
  accessPath: string;
  destinationRootAbs?: string;
  projectRootAbs?: string;
  accessPid: number | null;
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

export type AccessOperationRegistry = {
  create(record: CreateAccessOperationRecord): Promise<AccessOperationRecord>;
  update(
    operationId: string,
    patch: UpdateAccessOperationRecord,
  ): Promise<AccessOperationRecord | undefined>;
  get(operationId: string): Promise<AccessOperationRecord | undefined>;
  listRecent(options?: { limit?: number }): Promise<AccessOperationRecord[]>;
};

export type InMemoryAccessOperationRegistryOptions = {
  maxRecords?: number;
};

export type FileAccessOperationRegistryOptions = InMemoryAccessOperationRegistryOptions & {
  filePath: string;
  lockTimeoutMs?: number;
  staleLockMs?: number;
};

const DEFAULT_MAX_RECORDS = 1000;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
export const DEFAULT_STALE_LOCK_MS = 300_000;
const LOCK_RETRY_INTERVAL_MS = 10;
const PURGED_PERSISTENT_STATUSES = new Set<AccessOperationStatus>(["completed", "cleaned"]);

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

  constructor(options: FileAccessOperationRegistryOptions) {
    this.filePath = resolve(options.filePath);
    this.lockPath = `${this.filePath}.lock`;
    this.lockOwnerPath = join(this.lockPath, "owner");
    this.maxRecords = Math.max(1, Math.floor(options.maxRecords ?? DEFAULT_MAX_RECORDS));
    this.lockTimeoutMs = Math.max(1, Math.floor(options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS));
    this.staleLockMs = Math.max(1, Math.floor(options.staleLockMs ?? DEFAULT_STALE_LOCK_MS));
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
    const limit = options.limit ?? 50;
    return [...(await this.readRecords()).values()]
      .sort((a, b) => (b.updatedAt < a.updatedAt ? -1 : b.updatedAt > a.updatedAt ? 1 : 0))
      .slice(0, limit)
      .map((record) => ({ ...record, metadata: { ...record.metadata } }));
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
    await mkdir(dirname(this.lockPath), { recursive: true });
    while (true) {
      const ownerToken = this.createLockOwnerToken();
      try {
        await mkdir(this.lockPath);
      } catch (error) {
        if (!isFileExistsError(error)) throw error;
        await this.removeLockIfStale();
        if (Date.now() >= deadline) {
          throw new Error(`Timed out acquiring operation registry lock: ${this.lockPath}`);
        }
        await sleep(Math.min(LOCK_RETRY_INTERVAL_MS, Math.max(1, deadline - Date.now())));
        continue;
      }

      try {
        await writeFile(this.lockOwnerPath, ownerToken, { flag: "wx" });
        return { ownerToken };
      } catch (error) {
        await this.removeOwnerlessLockDirectory().catch(() => undefined);
        if (!isPathMissingError(error) && !isErrorWithCode(error, "EEXIST")) throw error;
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
      await rmdir(this.lockPath);
    } catch (error) {
      if (isPathMissingError(error) || isDirectoryNotEmptyError(error)) return;
      throw error;
    }
  }

  private async releaseRegistryMutationLock(lock: RegistryMutationLock): Promise<void> {
    if ((await this.readLockOwnerToken()) !== lock.ownerToken) return;
    if ((await this.readLockOwnerToken()) !== lock.ownerToken) return;
    await rm(this.lockOwnerPath, { force: true });
    try {
      await rmdir(this.lockPath);
    } catch (error) {
      if (isPathMissingError(error)) return;
      throw error;
    }
  }

  private async readLockOwnerToken(): Promise<string | undefined> {
    try {
      return await readFile(this.lockOwnerPath, "utf8");
    } catch (error) {
      if (isPathMissingError(error)) return undefined;
      throw error;
    }
  }

  private async isLockStale(): Promise<boolean> {
    const lockStat = await stat(this.lockPath).catch((error: unknown) => {
      if (isPathMissingError(error)) return undefined;
      throw error;
    });
    return lockStat !== undefined && Date.now() - lockStat.mtimeMs >= this.staleLockMs;
  }

  private createLockOwnerToken(): string {
    return `${process.pid}:${randomUUID()}`;
  }

  private async readRecords(): Promise<Map<string, AccessOperationRecord>> {
    const raw = await readFile(this.filePath, "utf8").catch(() => undefined);
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
    } catch {
      return new Map();
    }
  }

  private async writeRecords(records: Map<string, AccessOperationRecord>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload = {
      records: [...records.values()].sort((a, b) =>
        b.updatedAt < a.updatedAt ? -1 : b.updatedAt > a.updatedAt ? 1 : 0,
      ),
    };
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      await rename(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true });
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
    const limit = options.limit ?? 50;
    return [...this.records.values()]
      .sort((a, b) => (b.updatedAt < a.updatedAt ? -1 : b.updatedAt > a.updatedAt ? 1 : 0))
      .slice(0, limit)
      .map((record) => ({ ...record, metadata: { ...record.metadata } }));
  }

  private evictOldestRecords(): void {
    evictOldestRecordsFromMap(this.records, this.maxRecords);
  }
}

function isFileExistsError(error: unknown): boolean {
  return isErrorWithCode(error, "EEXIST");
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
