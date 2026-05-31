import { describe, expect, it } from "vitest";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
} from "../../../src/core/operations/access-operation-cleanup.js";
import { AccessOperationCleanupService } from "../../../src/core/operations/access-operation-cleanup.js";
import {
  type AccessOperationRecord,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";

const BASE_RECORD: AccessOperationRecord = {
  operationId: "op-1",
  action: "run",
  accessPath: "C:\\data\\app.accdb",
  projectRootAbs: "C:/repo/app",
  destinationRootAbs: "C:/repo/app/src",
  accessPid: 999,
  processStartTime: "2026-05-28T10:00:00.000Z",
  commandLine: 'MSACCESS.EXE "C:\\data\\app.accdb"',
  status: "timed_out",
  metadata: {},
  updatedAt: "2026-05-28T10:01:00.000Z",
};

function fakeInspector(info: Partial<OsProcessInfo> = {}): ProcessInspector {
  return {
    getProcess: async () => ({
      pid: 999,
      name: "MSACCESS.EXE",
      startTime: "2026-05-28T10:00:00.000Z",
      commandLine: 'MSACCESS.EXE "C:\\data\\app.accdb"',
      ...info,
    }),
  };
}

function fakeKiller(): { killer: ProcessKiller; killed: number[] } {
  const killed: number[] = [];
  return {
    killer: {
      kill: async (pid) => {
        killed.push(pid);
      },
    },
    killed,
  };
}

async function makeService(
  record: AccessOperationRecord,
  inspector: ProcessInspector,
  killer: ProcessKiller,
) {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create(record);
  return new AccessOperationCleanupService({
    registry,
    processInspector: inspector,
    processKiller: killer,
  });
}

describe("AccessOperationCleanupService — path normalization", () => {
  it("matches when request uses forward slashes but record has backslashes", async () => {
    const { killer, killed } = fakeKiller();
    const svc = await makeService(BASE_RECORD, fakeInspector(), killer);

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:/data/app.accdb",
    });

    expect(result.ok).toBe(true);
    expect(killed).toContain(999);
  });

  it("matches when request uses backslashes but record has forward slashes", async () => {
    const { killer, killed } = fakeKiller();
    const record = { ...BASE_RECORD, accessPath: "C:/data/app.accdb" };
    const svc = await makeService(record, fakeInspector(), killer);

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
    });

    expect(result.ok).toBe(true);
    expect(killed).toContain(999);
  });

  it("matches case-insensitively across mixed separators", async () => {
    const { killer, killed } = fakeKiller();
    const svc = await makeService(BASE_RECORD, fakeInspector(), killer);

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "c:/DATA/App.accdb",
    });

    expect(result.ok).toBe(true);
    expect(killed).toContain(999);
  });

  it("rejects when path is genuinely different", async () => {
    const { killer } = fakeKiller();
    const svc = await makeService(BASE_RECORD, fakeInspector(), killer);

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:/data/other.accdb",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("CLEANUP_ACCESS_PATH_MISMATCH");
  });

  it("accepts when commandLine has forward slashes but record.accessPath has backslashes", async () => {
    const { killer, killed } = fakeKiller();
    const inspector = fakeInspector({
      commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
    });
    const svc = await makeService(BASE_RECORD, inspector, killer);

    const result = await svc.cleanup({ operationId: "op-1", accessPath: "C:\\data\\app.accdb" });

    expect(result.ok).toBe(true);
    expect(killed).toContain(999);
  });
});

describe("AccessOperationCleanupService — dead-PID cleanup", () => {
  it("returns success cleaned when status is running, force:true, and process is gone (no kill)", async () => {
    const record: AccessOperationRecord = {
      ...BASE_RECORD,
      status: "running",
      accessPid: 999,
      processStartTime: "2026-05-28T10:00:00.000Z",
    };
    const { killer, killed } = fakeKiller();
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(record);
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: killer,
    });

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
      force: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("cleaned");
      expect(result.data.operationId).toBe("op-1");
    }
    expect(killed).toEqual([]);
    const updated = await registry.get("op-1");
    // InMemoryRegistry purges cleaned records, so it resolves to undefined
    expect(updated).toBeUndefined();
  });

  it("returns success cleaned when status is timed_out and process PID is gone (no kill)", async () => {
    const record: AccessOperationRecord = {
      ...BASE_RECORD,
      status: "timed_out",
      accessPid: 999,
      processStartTime: "2026-05-28T10:00:00.000Z",
    };
    const { killer, killed } = fakeKiller();
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(record);
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: killer,
    });

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("cleaned");
    }
    expect(killed).toEqual([]);
  });

  it("still calls processKiller.kill when process is alive, name matches, and startTime matches", async () => {
    const record: AccessOperationRecord = {
      ...BASE_RECORD,
      status: "timed_out",
      accessPid: 999,
      processStartTime: "2026-05-28T10:00:00.000Z",
    };
    const { killer, killed } = fakeKiller();
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(record);
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: fakeInspector({
        name: "MSACCESS.EXE",
        startTime: "2026-05-28T10:00:00.000Z",
      }),
      processKiller: killer,
    });

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
    });

    expect(result.ok).toBe(true);
    expect(killed).toContain(999);
  });
});
