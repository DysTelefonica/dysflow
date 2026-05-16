import { randomUUID } from "node:crypto";

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

const DEFAULT_MAX_RECORDS = 1000;

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
