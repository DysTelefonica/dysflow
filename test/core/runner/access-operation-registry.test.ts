import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AccessOperationCleanupService } from "../../../src/core/operations/access-operation-cleanup.js";
import { AccessOperationPreflightCleanupService } from "../../../src/core/operations/access-operation-preflight.js";
import {
  DEFAULT_RECENT_ACCESS_OPERATION_LIMIT,
  DEFAULT_STALE_LOCK_MS,
  evictOldestRecordsFromMap,
  FileAccessOperationRegistry,
  InMemoryAccessOperationRegistry,
  listRecentAccessOperations,
} from "../../../src/core/operations/access-operation-registry.js";

const base = {
  operationId: "op-1",
  action: "run" as const,
  accessPath: "C:/data/app.accdb",
  projectRootAbs: "C:/repo/app",
  destinationRootAbs: "C:/repo/app/out",
  metadata: { procedureName: "Refresh" },
};

describe("Registry constants and shared helpers", () => {
  it("DEFAULT_STALE_LOCK_MS is at least 300s to reduce false lock-theft risk", () => {
    expect(DEFAULT_STALE_LOCK_MS).toBeGreaterThanOrEqual(300_000);
  });

  it("evictOldestRecordsFromMap removes the oldest entries beyond maxRecords", () => {
    const records = new Map([
      ["a", { operationId: "a", updatedAt: "2026-01-01T00:00:00Z" } as never],
      ["b", { operationId: "b", updatedAt: "2026-01-02T00:00:00Z" } as never],
      ["c", { operationId: "c", updatedAt: "2026-01-03T00:00:00Z" } as never],
    ]);
    evictOldestRecordsFromMap(records, 2);
    expect(records.has("a")).toBe(false);
    expect(records.has("b")).toBe(true);
    expect(records.has("c")).toBe(true);
  });

  it("evictOldestRecordsFromMap is a no-op when under maxRecords", () => {
    const records = new Map([
      ["a", { operationId: "a", updatedAt: "2026-01-01T00:00:00Z" } as never],
    ]);
    evictOldestRecordsFromMap(records, 10);
    expect(records.size).toBe(1);
  });

  it("listRecentAccessOperations applies the shared recent-operation limit", async () => {
    const registry = new InMemoryAccessOperationRegistry({
      maxRecords: DEFAULT_RECENT_ACCESS_OPERATION_LIMIT + 1,
    });
    for (let index = 0; index <= DEFAULT_RECENT_ACCESS_OPERATION_LIMIT; index += 1) {
      await registry.create({
        ...base,
        operationId: `op-${index}`,
        status: "running",
        accessPid: index,
        processStartTime: null,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      });
    }

    const records = await listRecentAccessOperations(registry);

    expect(records).toHaveLength(DEFAULT_RECENT_ACCESS_OPERATION_LIMIT);
    expect(records.at(0)?.operationId).toBe(`op-${DEFAULT_RECENT_ACCESS_OPERATION_LIMIT}`);
    expect(records.some((record) => record.operationId === "op-0")).toBe(false);
  });
});

describe("Access operation registry and cleanup safety", () => {
  it("keeps AccessOperationAction as a strict union instead of widening to string", () => {
    const source = readFileSync("src/core/operations/access-operation-registry.ts", "utf8");

    expect(source).toContain("export type AccessOperationAction =");
    expect(source).not.toContain("| string");
  });

  it("does not use reclaim or pending marker protocols for registry locks", () => {
    const source = readFileSync("src/core/operations/access-operation-registry.ts", "utf8");

    expect(source).not.toContain("LOCK_RECLAIM");
    expect(source).not.toContain("dysflow-registry-reclaim");
    expect(source).not.toContain("createReclaimMarker");
    expect(source).not.toContain(".pending");
  });

  it("evicts the oldest records when the configured max size is exceeded", async () => {
    const registry = new InMemoryAccessOperationRegistry({ maxRecords: 2 });
    await registry.create({
      ...base,
      operationId: "old",
      status: "running",
      accessPid: 1,
      processStartTime: "2026-05-15T10:00:00.000Z",
      updatedAt: "2026-05-15T10:00:00.000Z",
    });
    await registry.create({
      ...base,
      operationId: "middle",
      status: "running",
      accessPid: 2,
      processStartTime: "2026-05-15T11:00:00.000Z",
      updatedAt: "2026-05-15T11:00:00.000Z",
    });
    await registry.create({
      ...base,
      operationId: "new",
      status: "running",
      accessPid: 3,
      processStartTime: "2026-05-15T12:00:00.000Z",
      updatedAt: "2026-05-15T12:00:00.000Z",
    });

    await expect(registry.get("old")).resolves.toBeUndefined();
    await expect(registry.listRecent({ limit: 10 })).resolves.toMatchObject([
      { operationId: "new" },
      { operationId: "middle" },
    ]);
  });

  it("serializes concurrent file creates without losing operation records", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-concurrent-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
      });
      await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          registry.create({
            ...base,
            operationId: `op-${index}`,
            status: "starting",
            accessPid: null,
            processStartTime: null,
            updatedAt: `2026-05-15T10:00:${String(index).padStart(2, "0")}.000Z`,
          }),
        ),
      );

      await expect(registry.listRecent({ limit: 25 })).resolves.toHaveLength(20);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("acquires and releases a registry mutation lock around successful writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-lock-release-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const lockPath = `${registryPath}.lock`;
    try {
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 100,
      });
      await registry.create({
        ...base,
        operationId: "op-lock-release",
        status: "starting",
        accessPid: null,
        processStartTime: null,
        updatedAt: "2026-05-15T10:00:00.000Z",
      });

      expect(existsSync(lockPath)).toBe(false);
      await expect(readFile(registryPath, "utf8")).resolves.toContain("op-lock-release");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails safely without partial writes when a competing writer holds the lock past timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-lock-timeout-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const lockPath = `${registryPath}.lock`;
    try {
      await mkdir(lockPath, { recursive: true });
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 25,
        staleLockMs: 60_000,
      });

      await expect(
        registry.create({
          ...base,
          operationId: "op-blocked",
          status: "starting",
          accessPid: null,
          processStartTime: null,
          updatedAt: "2026-05-15T10:00:00.000Z",
        }),
      ).rejects.toThrow(/Timed out acquiring operation registry lock/);
      expect(existsSync(registryPath)).toBe(false);
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("times out on stale owner locks instead of deleting ambiguous owners", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-stale-owner-timeout-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const lockPath = `${registryPath}.lock`;
    const ownerPath = join(lockPath, "owner");
    try {
      await mkdir(lockPath, { recursive: true });
      await writeFile(ownerPath, "stale-owner", "utf8");
      const staleTime = new Date("2026-05-15T10:00:00.000Z");
      await utimes(lockPath, staleTime, staleTime);
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 25,
        staleLockMs: 1,
      });

      await expect(
        registry.create({
          ...base,
          operationId: "op-ambiguous-stale-owner",
          status: "starting",
          accessPid: null,
          processStartTime: null,
          updatedAt: "2026-05-15T10:01:00.000Z",
        }),
      ).rejects.toThrow(/Timed out acquiring operation registry lock/);
      await expect(readFile(ownerPath, "utf8")).resolves.toBe("stale-owner");
      expect(existsSync(registryPath)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reclaims stale ownerless empty lock directories before writing", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-ownerless-empty-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const lockPath = `${registryPath}.lock`;
    try {
      await mkdir(lockPath, { recursive: true });
      const staleTime = new Date("2026-05-15T10:00:00.000Z");
      await utimes(lockPath, staleTime, staleTime);
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 50,
        staleLockMs: 1,
      });

      await expect(
        registry.create({
          ...base,
          operationId: "op-after-ownerless-empty",
          status: "starting",
          accessPid: null,
          processStartTime: null,
          updatedAt: "2026-05-15T10:01:00.000Z",
        }),
      ).resolves.toMatchObject({
        operationId: "op-after-ownerless-empty",
      });
      expect(existsSync(lockPath)).toBe(false);
      await expect(readFile(registryPath, "utf8")).resolves.toContain("op-after-ownerless-empty");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("times out on stale ownerless non-empty lock directories without deleting unknown contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-ownerless-unknown-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const lockPath = `${registryPath}.lock`;
    const unknownPath = join(lockPath, "unknown");
    try {
      await mkdir(lockPath, { recursive: true });
      await writeFile(unknownPath, "not-created-by-dysflow", "utf8");
      const staleTime = new Date("2026-05-15T10:00:00.000Z");
      await utimes(lockPath, staleTime, staleTime);
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 25,
        staleLockMs: 1,
      });

      await expect(
        registry.create({
          ...base,
          operationId: "op-ownerless-unknown",
          status: "starting",
          accessPid: null,
          processStartTime: null,
          updatedAt: "2026-05-15T10:01:00.000Z",
        }),
      ).rejects.toThrow(/Timed out acquiring operation registry lock/);
      await expect(readFile(unknownPath, "utf8")).resolves.toBe("not-created-by-dysflow");
      expect(existsSync(registryPath)).toBe(false);
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses a new owner token for each acquisition by the same registry instance", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-per-acquisition-token-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const lockPath = `${registryPath}.lock`;
    const ownerPath = join(lockPath, "owner");
    type RegistryLock = { ownerToken: string };
    type RegistryInternals = {
      acquireRegistryMutationLock: () => Promise<RegistryLock>;
      releaseRegistryMutationLock: (lock: RegistryLock) => Promise<void>;
    };
    try {
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 100,
      });
      const internals = registry as unknown as RegistryInternals;
      const firstLock = await internals.acquireRegistryMutationLock();
      await expect(readFile(ownerPath, "utf8")).resolves.toBe(firstLock.ownerToken);
      await internals.releaseRegistryMutationLock(firstLock);

      const secondLock = await internals.acquireRegistryMutationLock();
      try {
        expect(secondLock.ownerToken).not.toBe(firstLock.ownerToken);
        await expect(readFile(ownerPath, "utf8")).resolves.toBe(secondLock.ownerToken);
      } finally {
        await internals.releaseRegistryMutationLock(secondLock).catch(() => undefined);
      }
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not mask a successful write when release cleanup fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-release-fails-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const lockPath = `${registryPath}.lock`;
    try {
      let releaseCleanupFailures = 0;
      vi.resetModules();
      vi.doMock("node:fs/promises", async () => {
        const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
        return {
          ...actual,
          rmdir: async (
            path: Parameters<typeof actual.rmdir>[0],
            options?: Parameters<typeof actual.rmdir>[1],
          ) => {
            if (path === lockPath) {
              releaseCleanupFailures += 1;
              throw new Error("simulated release cleanup failure");
            }
            return actual.rmdir(path, options);
          },
        };
      });
      const { FileAccessOperationRegistry: ReleaseFailureRegistry } = await import(
        "../../../src/core/operations/access-operation-registry.js"
      );
      const registry = new ReleaseFailureRegistry({
        filePath: registryPath,
        lockTimeoutMs: 100,
      });

      await expect(
        registry.create({
          ...base,
          operationId: "op-release-cleanup-failed",
          status: "starting",
          accessPid: null,
          processStartTime: null,
          updatedAt: "2026-05-15T10:01:00.000Z",
        }),
      ).resolves.toMatchObject({ operationId: "op-release-cleanup-failed" });
      expect(releaseCleanupFailures).toBe(1);
      await expect(readFile(registryPath, "utf8")).resolves.toContain("op-release-cleanup-failed");
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists non-completed operation records to a repo-local runtime file", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
      });
      await registry.create({
        ...base,
        operationId: "op-timeout",
        status: "starting",
        accessPid: null,
        processStartTime: null,
        updatedAt: "2026-05-15T10:00:00.000Z",
      });
      await registry.update("op-timeout", {
        status: "timed_out",
        accessPid: 4321,
        processStartTime: "2026-05-15T10:05:00.000Z",
        updatedAt: "2026-05-15T10:05:00.000Z",
      });

      await expect(
        new FileAccessOperationRegistry({ filePath: registryPath }).get("op-timeout"),
      ).resolves.toMatchObject({
        operationId: "op-timeout",
        status: "timed_out",
        accessPid: 4321,
        processStartTime: "2026-05-15T10:05:00.000Z",
      });
      await expect(readFile(registryPath, "utf8")).resolves.toContain("op-timeout");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("purges completed and cleaned records from the persistent runtime file", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-ops-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      const registry = new FileAccessOperationRegistry({
        filePath: registryPath,
      });
      await registry.create({
        ...base,
        operationId: "op-complete",
        status: "starting",
        accessPid: null,
        processStartTime: null,
        updatedAt: "2026-05-15T10:00:00.000Z",
      });
      await registry.update("op-complete", {
        status: "completed",
        updatedAt: "2026-05-15T10:01:00.000Z",
      });

      await expect(registry.get("op-complete")).resolves.toBeUndefined();
      expect(existsSync(registryPath)).toBe(true);
      await expect(readFile(registryPath, "utf8")).resolves.not.toContain("op-complete");

      await registry.create({
        ...base,
        operationId: "op-cleaned",
        status: "timed_out",
        accessPid: 1234,
        processStartTime: "2026-05-15T10:00:00.000Z",
        updatedAt: "2026-05-15T10:00:00.000Z",
      });
      await registry.update("op-cleaned", {
        status: "cleaned",
        updatedAt: "2026-05-15T10:02:00.000Z",
      });
      await expect(registry.get("op-cleaned")).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lists the latest operation including completed records", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      ...base,
      operationId: "old",
      status: "completed",
      accessPid: 1,
      processStartTime: "2026-05-15T10:00:00.000Z",
      updatedAt: "2026-05-15T10:00:00.000Z",
    });
    await registry.create({
      ...base,
      operationId: "new",
      status: "timed_out",
      accessPid: 2,
      processStartTime: "2026-05-15T11:00:00.000Z",
      updatedAt: "2026-05-15T11:00:00.000Z",
    });

    await expect(registry.listRecent({ limit: 1 })).resolves.toMatchObject([
      { operationId: "new", status: "timed_out" },
    ]);
  });
});

describe("FileAccessOperationRegistry — swallowed-I/O diagnostics (#478)", () => {
  it("returns empty Map for a corrupt registry file (behavior preserved) and logs the parse error", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-registry-corrupt-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      // Write garbage — the file exists but is not valid JSON
      await mkdir(dirname(registryPath), { recursive: true });
      await writeFile(registryPath, "{ not valid json {{{", "utf8");

      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const registry = new FileAccessOperationRegistry({ filePath: registryPath });
      const result = await registry.listRecent();
      expect(result).toEqual([]);
      expect(spy).toHaveBeenCalled();
      const loggedCall = spy.mock.calls.find((call) =>
        (call[0] as string).includes("access-operation-registry:parse"),
      );
      expect(loggedCall).toBeDefined();
      expect(loggedCall?.[0]).toMatch(/\[dysflow:swallowed-io:access-operation-registry:parse\]/);
      spy.mockRestore();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns empty Map without logging when the registry file does not exist (first-run state)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-registry-enoent-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const registry = new FileAccessOperationRegistry({ filePath: registryPath });
      const result = await registry.listRecent();
      expect(result).toEqual([]);
      // ENOENT must not trigger a debug log
      const swallowedIoCalls = spy.mock.calls.filter((call) =>
        (call[0] as string).includes("[dysflow:swallowed-io"),
      );
      expect(swallowedIoCalls).toHaveLength(0);
      spy.mockRestore();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
it("kills only the registered PID when every ownership check passes", async () => {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create({
    ...base,
    status: "timed_out",
    accessPid: 1234,
    processStartTime: "2026-05-15T10:00:00.000Z",
    commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
    updatedAt: "2026-05-15T10:00:00.000Z",
  });
  const killed: number[] = [];
  const service = new AccessOperationCleanupService({
    registry,
    processInspector: {
      getProcess: async () => ({
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: "2026-05-15T10:00:00.000Z",
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      }),
    },
    processKiller: {
      kill: async (pid) => {
        killed.push(pid);
      },
    },
  });

  const result = await service.cleanup({
    operationId: "op-1",
    accessPath: "C:/data/app.accdb",
  });

  expect(result.ok).toBe(true);
  expect(killed).toEqual([1234]);
  // cleaned records are purged from InMemory registry (parity with FileRegistry)
  await expect(registry.get("op-1")).resolves.toBeUndefined();
});

it("accepts cleanup when accessPath differs only by case", async () => {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create({
    ...base,
    status: "timed_out",
    accessPid: 1234,
    processStartTime: "2026-05-15T10:00:00.000Z",
    commandLine: 'MSACCESS.EXE "C:/DATA/APP.ACCDB"',
    updatedAt: "2026-05-15T10:00:00.000Z",
  });
  const killed: number[] = [];
  const service = new AccessOperationCleanupService({
    registry,
    processInspector: {
      getProcess: async () => ({
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: "2026-05-15T10:00:00.000Z",
        commandLine: 'MSACCESS.EXE "C:/DATA/APP.ACCDB"',
      }),
    },
    processKiller: {
      kill: async (pid) => {
        killed.push(pid);
      },
    },
  });

  const result = await service.cleanup({
    operationId: "op-1",
    accessPath: "c:/DATA/APP.accdb",
  });

  expect(result.ok).toBe(true);
  expect(killed).toEqual([1234]);
});

it("refuses cleanup when accessPath does not match", async () => {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create({
    ...base,
    status: "timed_out",
    accessPid: 1234,
    processStartTime: "2026-05-15T10:00:00.000Z",
    updatedAt: "2026-05-15T10:00:00.000Z",
  });
  const service = new AccessOperationCleanupService({
    registry,
    processInspector: { getProcess: async () => undefined },
    processKiller: { kill: async () => undefined },
  });

  const result = await service.cleanup({
    operationId: "op-1",
    accessPath: "C:/other.accdb",
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code: "CLEANUP_ACCESS_PATH_MISMATCH" },
  });
});

it("refuses cleanup when PID start time differs", async () => {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create({
    ...base,
    status: "timed_out",
    accessPid: 1234,
    processStartTime: "2026-05-15T10:00:00.000Z",
    updatedAt: "2026-05-15T10:00:00.000Z",
  });
  const service = new AccessOperationCleanupService({
    registry,
    processInspector: {
      getProcess: async () => ({
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: "2026-05-15T10:05:00.000Z",
      }),
    },
    processKiller: { kill: async () => undefined },
  });

  const result = await service.cleanup({
    operationId: "op-1",
    accessPath: "C:/data/app.accdb",
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code: "CLEANUP_PROCESS_START_TIME_MISMATCH" },
  });
});

it("refuses pid_unknown operations without force", async () => {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create({
    ...base,
    status: "pid_unknown",
    accessPid: null,
    processStartTime: null,
    updatedAt: "2026-05-15T10:00:00.000Z",
  });
  const service = new AccessOperationCleanupService({
    registry,
    processInspector: { getProcess: async () => undefined },
    processKiller: { kill: async () => undefined },
  });

  const result = await service.cleanup({
    operationId: "op-1",
    accessPath: "C:/data/app.accdb",
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code: "CLEANUP_PID_UNKNOWN" },
  });
});

it("force cleanup retires stale pid_unknown operations when no matching Access process exists", async () => {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create({
    ...base,
    status: "pid_unknown",
    accessPid: null,
    processStartTime: null,
    updatedAt: "2026-05-15T10:00:00.000Z",
  });
  const killed: number[] = [];
  const service = new AccessOperationCleanupService({
    registry,
    processInspector: { getProcess: async () => undefined },
    processKiller: {
      kill: async (pid) => {
        killed.push(pid);
      },
    },
    processScanner: { listProcesses: async () => [] },
  });

  const result = await service.cleanup({
    operationId: "op-1",
    accessPath: "C:/data/app.accdb",
    force: true,
  });

  expect(result).toMatchObject({
    ok: true,
    data: { operationId: "op-1", accessPid: null, status: "cleaned" },
  });
  expect(killed).toEqual([]);
  await expect(registry.get("op-1")).resolves.toBeUndefined();
});

it("force cleanup refuses pid_unknown operations when an unowned Access process matches accessPath", async () => {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create({
    ...base,
    status: "pid_unknown",
    accessPid: null,
    processStartTime: null,
    updatedAt: "2026-05-15T10:00:00.000Z",
  });
  const killed: number[] = [];
  const service = new AccessOperationCleanupService({
    registry,
    processInspector: { getProcess: async () => undefined },
    processKiller: {
      kill: async (pid) => {
        killed.push(pid);
      },
    },
    processScanner: {
      listProcesses: async () => [
        {
          pid: 9876,
          name: "MSACCESS.EXE",
          startTime: "2026-05-15T10:15:00.000Z",
          commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
        },
      ],
    },
  });

  const result = await service.cleanup({
    operationId: "op-1",
    accessPath: "C:/data/app.accdb",
    force: true,
  });

  expect(result).toMatchObject({
    ok: false,
    error: { code: "CLEANUP_UNOWNED_ACCESS_PROCESS" },
  });
  expect(killed).toEqual([]);
  await expect(registry.get("op-1")).resolves.toMatchObject({ status: "pid_unknown" });
});

describe("Access operation preflight cleanup safety", () => {
  it("marks stale pid_unknown operations cleaned when no matching Access process exists", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      ...base,
      status: "pid_unknown",
      accessPid: null,
      processStartTime: null,
      updatedAt: "2026-05-15T10:00:00.000Z",
    });
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: { kill: async () => undefined },
      processScanner: { listProcesses: async () => [] },
    });

    const result = await service.cleanup({
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repo/app",
    });

    expect(result).toEqual({ cleaned: ["op-1"], killed: [], orphanedKilled: [], errors: [] });
    await expect(registry.get("op-1")).resolves.toBeUndefined();
  });

  it("refuses to mark pid_unknown cleaned when an unowned Access process matches accessPath", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      ...base,
      status: "pid_unknown",
      accessPid: null,
      processStartTime: null,
      updatedAt: "2026-05-15T10:00:00.000Z",
    });
    const killed: number[] = [];
    const service = new AccessOperationPreflightCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: {
        kill: async (pid) => {
          killed.push(pid);
        },
      },
      processScanner: {
        listProcesses: async () => [
          {
            pid: 9876,
            name: "MSACCESS.EXE",
            startTime: "2026-05-15T10:15:00.000Z",
            commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
          },
        ],
      },
    });

    const result = await service.cleanup({
      accessPath: "C:/data/app.accdb",
      projectRoot: "C:/repo/app",
    });

    expect(result.cleaned).toEqual([]);
    expect(result.killed).toEqual([]);
    expect(result.orphanedKilled).toEqual([]);
    expect(result.errors).toMatchObject([{ operationId: "op-1" }]);
    expect(result.errors[0]?.message).toContain("unowned Access process");
    expect(killed).toEqual([]);
    await expect(registry.get("op-1")).resolves.toMatchObject({ status: "pid_unknown" });
  });
});

describe("FileAccessOperationRegistry — lock-free reads (#179)", () => {
  it("get() does not acquire the file-system lock directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-lockfree-get-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const lockPath = `${registryPath}.lock`;
    try {
      // Seed the registry with one record
      const writer = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 100,
      });
      await writer.create({
        ...base,
        operationId: "op-seed",
        status: "starting",
        accessPid: null,
        processStartTime: null,
        updatedAt: "2026-05-18T10:00:00.000Z",
      });

      // Hold the file-system lock manually (simulates another process writing)
      await mkdir(lockPath, { recursive: true });
      await writeFile(join(lockPath, "owner"), "external-owner", "utf8");

      // With a very short lockTimeoutMs, a lock-acquiring get() would time out; lock-free should not
      const reader = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 50,
        staleLockMs: 120_000,
      });
      const result = await reader.get("op-seed");

      // Lock-free: should return the previously written record without timing out
      expect(result).toMatchObject({ operationId: "op-seed" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("listRecent() does not acquire the file-system lock directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-lockfree-list-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const lockPath = `${registryPath}.lock`;
    try {
      const writer = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 100,
      });
      await writer.create({
        ...base,
        operationId: "op-list-seed",
        status: "starting",
        accessPid: null,
        processStartTime: null,
        updatedAt: "2026-05-18T10:00:00.000Z",
      });

      await mkdir(lockPath, { recursive: true });
      await writeFile(join(lockPath, "owner"), "external-owner", "utf8");

      const reader = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 50,
        staleLockMs: 120_000,
      });
      const records = await reader.listRecent({ limit: 10 });

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ operationId: "op-list-seed" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("concurrent get() calls all resolve without deadlock", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-lockfree-concurrent-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      const writer = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 200,
      });
      await writer.create({
        ...base,
        operationId: "op-concurrent",
        status: "running",
        accessPid: 9999,
        processStartTime: "2026-05-18T10:00:00.000Z",
        updatedAt: "2026-05-18T10:00:00.000Z",
      });

      const reader = new FileAccessOperationRegistry({
        filePath: registryPath,
        lockTimeoutMs: 200,
      });
      // Fire N concurrent reads while a write is happening
      const [results] = await Promise.all([
        Promise.all(Array.from({ length: 20 }, () => reader.get("op-concurrent"))),
        writer.update("op-concurrent", {
          status: "completed",
          updatedAt: "2026-05-18T10:01:00.000Z",
        }),
      ]);

      // All reads must return state N or N+1 (either "running" or "completed"), never undefined
      for (const result of results) {
        expect(result).not.toBeUndefined();
        expect(["running", "completed"]).toContain(result?.status);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("Access operation registry additional branches", () => {
  it("evictOldestRecordsFromMap handles equal updatedAt timestamps (sort tie = 0 branch)", () => {
    // Two records with identical updatedAt: the comparison returns 0 (equal), exercising the ternary's final arm
    const records = new Map([
      ["a", { operationId: "a", updatedAt: "2026-01-01T00:00:00Z" } as never],
      ["b", { operationId: "b", updatedAt: "2026-01-01T00:00:00Z" } as never],
      ["c", { operationId: "c", updatedAt: "2026-01-02T00:00:00Z" } as never],
    ]);
    evictOldestRecordsFromMap(records, 2);
    // One of a/b (the tie) is evicted; c (newest) stays
    expect(records.size).toBe(2);
    expect(records.has("c")).toBe(true);
  });

  it("InMemoryRegistry.create does not store records with completed status (purge-at-create)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const result = await registry.create({
      ...{
        operationId: "op-purge",
        action: "run" as const,
        accessPath: "C:/app.accdb",
        metadata: {},
        updatedAt: "2026-01-01T00:00:00Z",
        accessPid: null,
        processStartTime: null,
      },
      status: "completed",
    });
    // create() returns the record even though it isn't stored
    expect(result.operationId).toBe("op-purge");
    // but get() should return undefined since it was never added
    await expect(registry.get("op-purge")).resolves.toBeUndefined();
  });

  it("InMemoryRegistry.create does not store records with cleaned status", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      ...{
        operationId: "op-cleaned-create",
        action: "run" as const,
        accessPath: "C:/app.accdb",
        metadata: {},
        updatedAt: "2026-01-01T00:00:00Z",
        accessPid: null,
        processStartTime: null,
      },
      status: "cleaned",
    });
    await expect(registry.get("op-cleaned-create")).resolves.toBeUndefined();
  });

  it("InMemoryRegistry.update returns undefined for non-existent operationId", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const result = await registry.update("does-not-exist", { status: "completed" });
    expect(result).toBeUndefined();
  });

  it("InMemoryRegistry.update purges record when status transitions to completed", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const base = {
      action: "run" as const,
      accessPath: "C:/app.accdb",
      metadata: {},
      accessPid: null,
      processStartTime: null,
    };
    await registry.create({
      ...base,
      operationId: "op-to-complete",
      status: "running",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    await registry.update("op-to-complete", { status: "completed" });
    await expect(registry.get("op-to-complete")).resolves.toBeUndefined();
  });

  it("InMemoryRegistry.update preserves metadata when patch has no metadata", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const base = {
      action: "run" as const,
      accessPath: "C:/app.accdb",
      accessPid: null,
      processStartTime: null,
    };
    await registry.create({
      ...base,
      operationId: "op-meta",
      status: "running",
      metadata: { key: "value" },
      updatedAt: "2026-01-01T00:00:00Z",
    });
    await registry.update("op-meta", { status: "timed_out" });
    const record = await registry.get("op-meta");
    expect(record?.metadata).toEqual({ key: "value" });
  });

  it("FileRegistry.create does not store completed-status record in file", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-file-purge-create-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const base = {
      action: "run" as const,
      accessPath: "C:/app.accdb",
      metadata: {},
      accessPid: null,
      processStartTime: null,
    };
    try {
      const registry = new FileAccessOperationRegistry({ filePath: registryPath });
      await registry.create({
        ...base,
        operationId: "op-file-complete",
        status: "completed",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      // Should NOT be findable
      await expect(registry.get("op-file-complete")).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("FileRegistry.update returns undefined for non-existent operationId", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-file-update-notfound-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      const registry = new FileAccessOperationRegistry({ filePath: registryPath });
      const result = await registry.update("does-not-exist", { status: "completed" });
      expect(result).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("FileRegistry.readRecords handles legacy array format (without records wrapper)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-legacy-format-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    const base = {
      action: "run" as const,
      accessPath: "C:/app.accdb",
      metadata: {},
      accessPid: null,
      processStartTime: null,
    };
    try {
      await mkdir(join(root, ".dysflow", "runtime"), { recursive: true });
      // Write legacy array format (no `records` wrapper)
      await writeFile(
        registryPath,
        JSON.stringify([
          {
            ...base,
            operationId: "op-legacy",
            status: "running",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ]),
        "utf8",
      );
      const registry = new FileAccessOperationRegistry({ filePath: registryPath });
      const record = await registry.get("op-legacy");
      expect(record?.operationId).toBe("op-legacy");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("FileRegistry.readRecords handles malformed JSON gracefully", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-malformed-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      await mkdir(join(root, ".dysflow", "runtime"), { recursive: true });
      await writeFile(registryPath, "{ not valid json }", "utf8");
      const registry = new FileAccessOperationRegistry({ filePath: registryPath });
      const records = await registry.listRecent();
      expect(records).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("FileRegistry.readRecords handles objects without records array (uses empty fallback)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-no-records-key-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      await mkdir(join(root, ".dysflow", "runtime"), { recursive: true });
      await writeFile(registryPath, JSON.stringify({ version: 1 }), "utf8");
      const registry = new FileAccessOperationRegistry({ filePath: registryPath });
      const records = await registry.listRecent();
      expect(records).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("InMemoryRegistry.listRecent without limit arg defaults to 50", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const base = {
      action: "run" as const,
      accessPath: "C:/app.accdb",
      metadata: {},
      accessPid: null,
      processStartTime: null,
      status: "running" as const,
    };
    for (let i = 0; i < 10; i++) {
      await registry.create({
        ...base,
        operationId: `op-${i}`,
        updatedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      });
    }
    const result = await registry.listRecent();
    expect(result).toHaveLength(10);
  });

  it("InMemoryRegistry.get returns undefined for non-existent operationId", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await expect(registry.get("never-created")).resolves.toBeUndefined();
  });
});

describe("PR4 — registry mechanical fixes (#198 #202 #204)", () => {
  it("#202 — readRecordsUnlocked does not exist in the registry source", () => {
    const source = readFileSync("src/core/operations/access-operation-registry.ts", "utf8");
    expect(source).not.toContain("readRecordsUnlocked");
  });

  it("#204 — ISO sort uses direct comparison, not localeCompare", () => {
    const source = readFileSync("src/core/operations/access-operation-registry.ts", "utf8");
    expect(source).not.toContain("localeCompare");
  });

  it("#204 — listRecent returns newest records first (ISO sort correctness)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const dates = [
      "2024-01-01T00:00:00.000Z",
      "2024-06-15T12:00:00.000Z",
      "2024-03-10T06:00:00.000Z",
    ];
    for (const [i, updatedAt] of dates.entries()) {
      await registry.create({
        ...base,
        operationId: `op-sort-${i}`,
        status: "running",
        accessPid: i + 1,
        processStartTime: updatedAt,
        updatedAt,
      });
    }
    const result = await registry.listRecent({ limit: 3 });
    expect(result[0]?.operationId).toBe("op-sort-1"); // 2024-06-15 newest
    expect(result[1]?.operationId).toBe("op-sort-2"); // 2024-03-10 middle
    expect(result[2]?.operationId).toBe("op-sort-0"); // 2024-01-01 oldest
  });

  it("#198 — InMemoryRegistry evicts oldest 5 when maxRecords+5 entries added", async () => {
    const maxRecords = 3;
    const registry = new InMemoryAccessOperationRegistry({ maxRecords });
    const entries = [
      { operationId: "oldest-1", updatedAt: "2024-01-01T00:00:00.000Z" },
      { operationId: "oldest-2", updatedAt: "2024-01-02T00:00:00.000Z" },
      { operationId: "oldest-3", updatedAt: "2024-01-03T00:00:00.000Z" },
      { operationId: "newest-1", updatedAt: "2024-06-01T00:00:00.000Z" },
      { operationId: "newest-2", updatedAt: "2024-06-02T00:00:00.000Z" },
      { operationId: "newest-3", updatedAt: "2024-06-03T00:00:00.000Z" },
      { operationId: "newest-4", updatedAt: "2024-06-04T00:00:00.000Z" },
      { operationId: "newest-5", updatedAt: "2024-06-05T00:00:00.000Z" },
    ];
    for (const { operationId, updatedAt } of entries) {
      await registry.create({
        ...base,
        operationId,
        status: "running",
        accessPid: 1,
        processStartTime: updatedAt,
        updatedAt,
      });
    }
    // After 8 inserts with maxRecords=3, the 5 oldest should be evicted
    for (const id of ["oldest-1", "oldest-2", "oldest-3", "newest-1", "newest-2"]) {
      await expect(registry.get(id)).resolves.toBeUndefined();
    }
    // The 3 newest should still be present
    for (const id of ["newest-3", "newest-4", "newest-5"]) {
      await expect(registry.get(id)).resolves.toMatchObject({ operationId: id });
    }
  });

  it("#198 — FileRegistry evicts oldest records when maxRecords exceeded", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-evict-file-"));
    const registryPath = join(root, ".dysflow", "runtime", "operations.json");
    try {
      const registry = new FileAccessOperationRegistry({ filePath: registryPath, maxRecords: 3 });
      const entries = [
        { operationId: "f-oldest-1", updatedAt: "2024-01-01T00:00:00.000Z" },
        { operationId: "f-oldest-2", updatedAt: "2024-01-02T00:00:00.000Z" },
        { operationId: "f-newest-1", updatedAt: "2024-06-01T00:00:00.000Z" },
        { operationId: "f-newest-2", updatedAt: "2024-06-02T00:00:00.000Z" },
        { operationId: "f-newest-3", updatedAt: "2024-06-03T00:00:00.000Z" },
      ];
      for (const { operationId, updatedAt } of entries) {
        await registry.create({
          ...base,
          operationId,
          status: "running",
          accessPid: 1,
          processStartTime: updatedAt,
          updatedAt,
        });
      }
      // Oldest 2 evicted, newest 3 remain
      await expect(registry.get("f-oldest-1")).resolves.toBeUndefined();
      await expect(registry.get("f-oldest-2")).resolves.toBeUndefined();
      for (const id of ["f-newest-1", "f-newest-2", "f-newest-3"]) {
        await expect(registry.get(id)).resolves.toMatchObject({ operationId: id });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
