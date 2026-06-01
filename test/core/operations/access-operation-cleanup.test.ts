import { describe, expect, it } from "vitest";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
} from "../../../src/core/operations/access-operation-cleanup.js";
import {
  AccessOperationCleanupService,
  sameProcessStartTime,
} from "../../../src/core/operations/access-operation-cleanup.js";
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

describe("sameProcessStartTime — whole-second tolerance", () => {
  it("returns true when times are identical strings", () => {
    expect(sameProcessStartTime("2026-05-18T12:34:56.000Z", "2026-05-18T12:34:56.000Z")).toBe(true);
  });

  it("returns true when only milliseconds differ (3 vs 7 fractional digits, same second)", () => {
    // PS writes 7 fractional digits; TS inspector writes 3
    expect(sameProcessStartTime("2026-05-18T12:34:56.0000000Z", "2026-05-18T12:34:56.000Z")).toBe(
      true,
    );
  });

  it("returns true when fractional digits differ but both within the same second", () => {
    expect(sameProcessStartTime("2026-05-18T12:34:56.400Z", "2026-05-18T12:34:56.900Z")).toBe(true);
  });

  it("returns false when times differ by more than a second", () => {
    expect(sameProcessStartTime("2026-05-18T12:34:56.900Z", "2026-05-18T12:34:57.100Z")).toBe(
      false,
    );
  });

  it("returns false when times differ by a full second (boundary)", () => {
    expect(sameProcessStartTime("2026-05-18T12:34:56.000Z", "2026-05-18T12:34:57.000Z")).toBe(
      false,
    );
  });

  it("returns true when timezone-offset forms denote the same instant (same second)", () => {
    // +00:00 and Z are equivalent
    expect(sameProcessStartTime("2026-05-18T12:34:56.000+00:00", "2026-05-18T12:34:56.000Z")).toBe(
      true,
    );
  });

  it("returns false when one argument is null", () => {
    expect(sameProcessStartTime(null, "2026-05-18T12:34:56.000Z")).toBe(false);
  });

  it("returns false when both arguments are null", () => {
    expect(sameProcessStartTime(null, null)).toBe(false);
  });

  it("returns false when one argument is an empty string", () => {
    expect(sameProcessStartTime("", "2026-05-18T12:34:56.000Z")).toBe(false);
  });

  it("returns false for unparseable strings", () => {
    expect(sameProcessStartTime("not-a-date", "2026-05-18T12:34:56.000Z")).toBe(false);
  });
});

describe("AccessOperationCleanupService — tolerant start-time comparison", () => {
  it("kills owned process when inspected startTime differs only in fractional digits (no false mismatch)", async () => {
    // Record has 3-digit precision; inspector returns 7-digit precision (PS format)
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
        // 7-digit PS format, same second as stored 3-digit value
        startTime: "2026-05-28T10:00:00.0000000Z",
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

  it("still refuses when inspected startTime differs by a full second (genuine PID reuse)", async () => {
    const record: AccessOperationRecord = {
      ...BASE_RECORD,
      status: "timed_out",
      accessPid: 999,
      processStartTime: "2026-05-28T10:00:00.000Z",
    };
    const { killer } = fakeKiller();
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(record);
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: fakeInspector({
        name: "MSACCESS.EXE",
        startTime: "2026-05-28T10:00:01.000Z",
      }),
      processKiller: killer,
    });

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("CLEANUP_PROCESS_START_TIME_MISMATCH");
  });
});

describe("AccessOperationCleanupService — running_untracked refusal", () => {
  it("returns CLEANUP_PID_UNKNOWN and kills nothing when status is running_untracked (force:false)", async () => {
    const record: AccessOperationRecord = {
      ...BASE_RECORD,
      status: "running_untracked",
      accessPid: null,
      processStartTime: null,
    };
    const { killer, killed } = fakeKiller();
    const svc = await makeService(record, fakeInspector(), killer);

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
      force: false,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("CLEANUP_PID_UNKNOWN");
    expect(killed).toEqual([]);
  });

  it("returns CLEANUP_PID_UNKNOWN and kills nothing when status is running_untracked (force:true)", async () => {
    // running_untracked is a hard refusal regardless of force — the operation has no owned PID.
    const record: AccessOperationRecord = {
      ...BASE_RECORD,
      status: "running_untracked",
      accessPid: null,
      processStartTime: null,
    };
    const { killer, killed } = fakeKiller();
    const svc = await makeService(record, fakeInspector(), killer);

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
      force: true,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("CLEANUP_PID_UNKNOWN");
    expect(killed).toEqual([]);
  });
});

describe("AccessOperationCleanupService — force-retire null-PID records (Goal D)", () => {
  const nullPidRecord: AccessOperationRecord = {
    ...BASE_RECORD,
    accessPid: null,
    processStartTime: null,
    status: "timed_out",
  };

  function makeNullPidRegistry() {
    const registry = new InMemoryAccessOperationRegistry();
    return registry.create(nullPidRecord).then(() => registry);
  }

  it("retires the registry record when force:true, accessPid:null, and scanner throws", async () => {
    const registry = await makeNullPidRegistry();
    const { killer, killed } = fakeKiller();
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: {
        getProcess: async () => {
          throw new Error("should not inspect");
        },
      },
      processKiller: killer,
      processScanner: {
        listProcesses: async () => {
          throw new Error("CIM unavailable");
        },
      },
    });

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
      force: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("cleaned");
      expect(result.data.accessPid).toBeNull();
    }
    // Nothing must have been killed
    expect(killed).toEqual([]);
    // Registry record must be gone (cleaned/purged)
    await expect(registry.get("op-1")).resolves.toBeUndefined();
  });

  it("result carries a warning diagnostic when scanner fails on force-retire", async () => {
    const registry = await makeNullPidRegistry();
    const { killer } = fakeKiller();
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: killer,
      processScanner: {
        listProcesses: async () => {
          throw new Error("WMI timeout");
        },
      },
    });

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
      force: true,
    });

    expect(result.ok).toBe(true);
    // A warning diagnostic should be present indicating ownership could not be verified
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(
      result.diagnostics.some((d) => d.message.toLowerCase().includes("ownership unknown")),
    ).toBe(true);
  });

  it("still refuses when force:false and accessPid is null", async () => {
    const registry = await makeNullPidRegistry();
    const { killer } = fakeKiller();
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: killer,
    });

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
      force: false,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("CLEANUP_PID_UNKNOWN");
  });

  it("does not kill any process even if scanner succeeds and finds no match", async () => {
    const registry = await makeNullPidRegistry();
    const { killer, killed } = fakeKiller();
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: { getProcess: async () => undefined },
      processKiller: killer,
      processScanner: {
        listProcesses: async () => [],
      },
    });

    const result = await svc.cleanup({
      operationId: "op-1",
      accessPath: "C:\\data\\app.accdb",
      force: true,
    });

    expect(result.ok).toBe(true);
    expect(killed).toEqual([]);
  });
});
