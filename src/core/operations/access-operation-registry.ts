import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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
  update(operationId: string, patch: UpdateAccessOperationRecord): Promise<AccessOperationRecord | undefined>;
  get(operationId: string): Promise<AccessOperationRecord | undefined>;
  listRecent(options?: { limit?: number }): Promise<AccessOperationRecord[]>;
};

export type InMemoryAccessOperationRegistryOptions = {
  maxRecords?: number;
};

export type FileAccessOperationRegistryOptions = InMemoryAccessOperationRegistryOptions & {
  filePath: string;
};

const DEFAULT_MAX_RECORDS = 1000;
const PURGED_PERSISTENT_STATUSES = new Set<AccessOperationStatus>(["completed", "cleaned"]);

export class FileAccessOperationRegistry implements AccessOperationRegistry {
  private static readonly fileLocks = new Map<string, Promise<unknown>>();

  private readonly filePath: string;
  private readonly maxRecords: number;

  constructor(options: FileAccessOperationRegistryOptions) {
    this.filePath = resolve(options.filePath);
    this.maxRecords = Math.max(1, Math.floor(options.maxRecords ?? DEFAULT_MAX_RECORDS));
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

  async update(operationId: string, patch: UpdateAccessOperationRecord): Promise<AccessOperationRecord | undefined> {
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
    return this.withFileLock(async () => {
      const record = (await this.readRecords()).get(operationId);
      return record ? { ...record, metadata: { ...record.metadata } } : undefined;
    });
  }

  async listRecent(options: { limit?: number } = {}): Promise<AccessOperationRecord[]> {
    return this.withFileLock(async () => {
      const limit = options.limit ?? 50;
      return [...(await this.readRecords()).values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map((record) => ({ ...record, metadata: { ...record.metadata } }));
    });
  }

  private async withFileLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = FileAccessOperationRegistry.fileLocks.get(this.filePath) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
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

  private async readRecords(): Promise<Map<string, AccessOperationRecord>> {
    const raw = await readFile(this.filePath, "utf8").catch(() => undefined);
    if (raw === undefined || raw.trim().length === 0) return new Map();
    try {
      const parsed = JSON.parse(raw) as { records?: AccessOperationRecord[] } | AccessOperationRecord[];
      const records = Array.isArray(parsed) ? parsed : parsed.records ?? [];
      return new Map(records.map((record) => [record.operationId, { ...record, metadata: { ...record.metadata } }]));
    } catch {
      return new Map();
    }
  }

  private async writeRecords(records: Map<string, AccessOperationRecord>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload = {
      records: [...records.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  private evictOldestRecords(records: Map<string, AccessOperationRecord>): void {
    while (records.size > this.maxRecords) {
      const oldest = [...records.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
      if (oldest === undefined) return;
      records.delete(oldest.operationId);
    }
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
    this.records.set(stored.operationId, stored);
    this.evictOldestRecords();
    return { ...stored, metadata: { ...stored.metadata } };
  }

  async update(operationId: string, patch: UpdateAccessOperationRecord): Promise<AccessOperationRecord | undefined> {
    const current = this.records.get(operationId);
    if (current === undefined) return undefined;
    const next = { ...current, ...patch, metadata: patch.metadata ?? current.metadata };
    this.records.set(operationId, next);
    return { ...next, metadata: { ...next.metadata } };
  }

  async get(operationId: string): Promise<AccessOperationRecord | undefined> {
    const record = this.records.get(operationId);
    return record ? { ...record, metadata: { ...record.metadata } } : undefined;
  }

  async listRecent(options: { limit?: number } = {}): Promise<AccessOperationRecord[]> {
    const limit = options.limit ?? 50;
    return [...this.records.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((record) => ({ ...record, metadata: { ...record.metadata } }));
  }

  private evictOldestRecords(): void {
    while (this.records.size > this.maxRecords) {
      const oldest = [...this.records.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
      if (oldest === undefined) return;
      this.records.delete(oldest.operationId);
    }
  }
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
