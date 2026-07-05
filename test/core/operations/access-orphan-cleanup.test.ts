import { describe, expect, it, vi } from "vitest";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
  ProcessScanner,
} from "../../../src/core/operations/access-operation-cleanup.js";
import {
  type AccessOperationRecord,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";
import { AccessOrphanCleanupService } from "../../../src/core/operations/access-orphan-cleanup.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = "C:\\repo\\myapp";
const ACCESS_PATH = "C:\\data\\app.accdb";

function headlessMsAccess(overrides: Partial<OsProcessInfo> = {}): OsProcessInfo {
  return {
    pid: 9999,
    name: "MSACCESS.EXE",
    startTime: "2026-05-28T10:00:00.000Z",
    commandLine: `MSACCESS.EXE "${ACCESS_PATH}"`,
    mainWindowHandle: 0,
    ...overrides,
  };
}

function makeScanner(processes: OsProcessInfo[]): ProcessScanner {
  return { listProcesses: async () => processes };
}

function makeInspector(proc: OsProcessInfo | undefined): ProcessInspector {
  return { getProcess: async () => proc };
}

function makeKiller(): { killer: ProcessKiller; killed: number[] } {
  const killed: number[] = [];
  return {
    killer: {
      kill: async (pid: number) => {
        killed.push(pid);
      },
    },
    killed,
  };
}

function runningRecord(pid: number, projectRoot: string): AccessOperationRecord {
  return {
    operationId: `op-running-${pid}`,
    action: "run",
    accessPath: ACCESS_PATH,
    projectRootAbs: projectRoot,
    accessPid: pid,
    processStartTime: "2026-05-28T10:00:00.000Z",
    status: "running",
    metadata: {},
    updatedAt: "2026-05-28T10:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// listOrphans
// ---------------------------------------------------------------------------

describe("AccessOrphanCleanupService — listOrphans", () => {
  it("returns only headless MSACCESS holding the project's accessPath", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer } = makeKiller();
    const proc = headlessMsAccess({ pid: 12345 });
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.pid).toBe(12345);
      expect(result.data[0]?.mainWindowHandle).toBe(0);
    }
  });

  it("excludes an MSACCESS that has a non-zero mainWindowHandle (interactive session)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer } = makeKiller();
    const interactiveProc: OsProcessInfo = {
      pid: 67890,
      name: "MSACCESS.EXE",
      startTime: "2026-05-28T10:00:00.000Z",
      commandLine: `MSACCESS.EXE "${ACCESS_PATH}"`,
      mainWindowHandle: 0xabcdef, // has a visible window
    };
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([interactiveProc]),
      processInspector: makeInspector(interactiveProc),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(0);
    }
  });

  it("excludes an MSACCESS that holds a DIFFERENT accessPath", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer } = makeKiller();
    const otherPathProc = headlessMsAccess({
      pid: 12345,
      commandLine: `MSACCESS.EXE "C:\\data\\other.accdb"`,
    });
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([otherPathProc]),
      processInspector: makeInspector(otherPathProc),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(0);
    }
  });

  it("excludes a headless MSACCESS whose commandLine is unavailable", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer } = makeKiller();
    const proc = headlessMsAccess({ pid: 12345, commandLine: undefined });
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(0);
    }
  });

  it("excludes a PID that the registry marks as running (owned process)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(runningRecord(12345, PROJECT_ROOT));
    const { killer } = makeKiller();
    const proc = headlessMsAccess({ pid: 12345 });
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(0);
    }
  });

  it("returns PROCESS_SCAN_FAILED when processScanner.listProcesses() throws", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer } = makeKiller();
    const failingScanner: ProcessScanner = {
      listProcesses: async () => {
        throw new Error("CIM unavailable");
      },
    };
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: failingScanner,
      processInspector: makeInspector(undefined),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROCESS_SCAN_FAILED");
    }
  });
});

// ---------------------------------------------------------------------------
// cleanupOrphan — happy path
// ---------------------------------------------------------------------------

describe("AccessOrphanCleanupService — cleanupOrphan happy path", () => {
  it("writes synthetic record → kills → marks cleaned → returns killed:[pid]", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const proc = headlessMsAccess({ pid: 12345 });
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.killed).toContain(12345);
      expect(result.data.refused).toEqual([]);
      expect(result.data.syntheticOperationId).toMatch(/^orphan-12345-/);
      expect(result.data.errors).toEqual([]);
      // Registry record updated to `cleaned`
      const syntheticId = result.data.syntheticOperationId;
      if (syntheticId) {
        const rec = await registry.get(syntheticId);
        // InMemoryRegistry purges `cleaned` records, so it may be undefined
        expect(rec === undefined || rec.status === "cleaned").toBe(true);
      }
    }
    expect(killed).toContain(12345);
  });
});

// ---------------------------------------------------------------------------
// cleanupOrphan — refusal cases
// ---------------------------------------------------------------------------

describe("AccessOrphanCleanupService — cleanupOrphan refusal cases", () => {
  /**
   * SAFETY PROPERTY: undefined mainWindowHandle (Get-Process fallback path) must be
   * refused. The operator may have used Get-Process to enumerate PIDs and guessed
   * the PID from process ID alone — without CIM's MainWindowHandle we cannot prove
   * the process is headless, so we refuse.
   */
  it("refuses a PID whose mainWindowHandle is undefined (Get-Process fallback) — SAFETY PROPERTY", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    // Get-Process fallback sets mainWindowHandle to undefined
    const proc: OsProcessInfo = {
      pid: 12345,
      name: "MSACCESS.EXE",
      startTime: "2026-05-28T10:00:00.000Z",
      commandLine: `MSACCESS.EXE "${ACCESS_PATH}"`,
      mainWindowHandle: undefined,
    };
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_NOT_HEADLESS");
      expect(result.error.message).toMatch(/undefined.*Get-Process.*cannot prove headless/i);
    }
    expect(killed).toEqual([]);
  });

  it("refuses a PID whose live mainWindowHandle is non-zero (operator lied about headless)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const interactiveProc: OsProcessInfo = {
      pid: 12345,
      name: "MSACCESS.EXE",
      startTime: "2026-05-28T10:00:00.000Z",
      commandLine: `MSACCESS.EXE "${ACCESS_PATH}"`,
      mainWindowHandle: 0xbeef,
    };
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([interactiveProc]),
      processInspector: makeInspector(interactiveProc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_NOT_HEADLESS");
      expect(result.error.message).toMatch(/12345.*window handle.*0xBEEF/i);
    }
    expect(killed).toEqual([]);
  });

  it("refuses a PID whose commandLine does not match accessPath", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const wrongPathProc: OsProcessInfo = {
      pid: 12345,
      name: "MSACCESS.EXE",
      startTime: "2026-05-28T10:00:00.000Z",
      commandLine: `MSACCESS.EXE "C:\\data\\other.accdb"`,
      mainWindowHandle: 0,
    };
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([wrongPathProc]),
      processInspector: makeInspector(wrongPathProc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_PATH_MISMATCH");
    }
    expect(killed).toEqual([]);
  });

  it("refuses a headless PID whose commandLine is unavailable because accessPath cannot be proven", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const proc = headlessMsAccess({ pid: 12345, commandLine: undefined });
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_PATH_UNVERIFIED");
      expect(result.error.message).toMatch(/command line.*unavailable.*cannot be proven/i);
    }
    expect(killed).toEqual([]);
    expect(await registry.listRecent()).toEqual([]);
  });

  it("refuses a confirmed PID that is registry-owned by a running operation", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(runningRecord(12345, PROJECT_ROOT));
    const { killer, killed } = makeKiller();
    const proc = headlessMsAccess({ pid: 12345 });
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_REGISTRY_OWNED");
      expect(result.error.message).toMatch(/running Dysflow Access operation/i);
    }
    expect(killed).toEqual([]);
  });

  it("returns ORPHAN_CLEANUP_PID_GONE when inspector returns undefined", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([]),
      processInspector: makeInspector(undefined),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_PID_GONE");
      expect(result.error.message).toMatch(/12345.*no longer running/i);
    }
    expect(killed).toEqual([]);
  });

  it("returns ORPHAN_CLEANUP_NOT_MSACCESS when the PID is a different process", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const wordProc: OsProcessInfo = {
      pid: 12345,
      name: "WINWORD.EXE",
      startTime: "2026-05-28T10:00:00.000Z",
      commandLine: `WINWORD.EXE "C:\\data\\doc.docx"`,
      mainWindowHandle: 0,
    };
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([wordProc]),
      processInspector: makeInspector(wordProc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_NOT_MSACCESS");
      expect(result.error.message).toMatch(/12345.*WINWORD/i);
    }
    expect(killed).toEqual([]);
  });

  it.each([0, -1, -100, 0.5, NaN])("returns ORPHAN_CLEANUP_INVALID_PID for %s", async (badPid) => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([]),
      processInspector: makeInspector(undefined),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: badPid as number,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_INVALID_PID");
      expect(result.error.message).toMatch(/positive safe integer/i);
    }
    expect(killed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// cleanupOrphan — kill failure / registry rollback
// ---------------------------------------------------------------------------

describe("AccessOrphanCleanupService — kill failure and registry handling", () => {
  it("leaves registry record at initial status when processKiller.kill throws", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const proc = headlessMsAccess({ pid: 12345 });
    const failingKiller: ProcessKiller = {
      kill: async (_pid: number) => {
        throw new Error("Access is locked by another process");
      },
    };
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: failingKiller,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_KILL_FAILED");
    }

    // The record should remain at `cleanup_pending` (not be updated to `cleaned`).
    // InMemoryRegistry purges `cleaned` records, so check for `cleanup_pending`.
    const records = await registry.listRecent();
    const synthetic = records.find((r) => r.operationId.includes("orphan-12345"));
    expect(synthetic?.status).toBe("cleanup_pending");
  });

  it("returns ORPHAN_CLEANUP_REGISTRY_WRITE_FAILED when registry.create throws", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const proc = headlessMsAccess({ pid: 12345 });
    const { killer, killed } = makeKiller();
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    // Freeze the registry to simulate write failure
    vi.spyOn(registry, "create").mockImplementation(async () => {
      throw new Error("Disk full");
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_REGISTRY_WRITE_FAILED");
    }
    expect(killed).toEqual([]);

    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// cleanupOrphan — inspection failure
// ---------------------------------------------------------------------------

describe("AccessOrphanCleanupService — inspection failure", () => {
  it("returns ORPHAN_CLEANUP_INSPECTION_FAILED when inspector.getProcess throws", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([]),
      processInspector: {
        getProcess: async (_pid: number) => {
          throw new Error("WMI timeout");
        },
      },
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 12345,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_INSPECTION_FAILED");
      expect(result.error.message).toMatch(/WMI timeout/i);
    }
    expect(killed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// #735 — PowerShell worker PID tracking and orphan cleanup
// ---------------------------------------------------------------------------

function workerRecord(
  pid: number,
  projectRoot: string,
  workerPid: number | null,
): AccessOperationRecord {
  return {
    operationId: `op-worker-${pid}`,
    action: "run",
    accessPath: ACCESS_PATH,
    projectRootAbs: projectRoot,
    accessPid: pid,
    powershellWorkerPid: workerPid,
    processStartTime: "2026-05-28T10:00:00.000Z",
    status: "running",
    metadata: {},
    updatedAt: "2026-05-28T10:00:00.000Z",
  };
}

function headlessPwshWorker(overrides: Partial<OsProcessInfo> = {}): OsProcessInfo {
  return {
    pid: 8888,
    name: "pwsh.exe",
    startTime: "2026-05-28T10:00:00.000Z",
    commandLine: `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File dysflow-access-runner.ps1`,
    mainWindowHandle: 0,
    ...overrides,
  };
}

describe("AccessOrphanCleanupService — pwsh worker listOrphans", () => {
  it("returns pwsh workers from registry records that are still alive", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    // Register a running operation with a worker PID
    await registry.create(workerRecord(100, PROJECT_ROOT, 8888));

    const worker = headlessPwshWorker({ pid: 8888 });
    const { killer } = makeKiller();

    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([worker]),
      processInspector: makeInspector(worker),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should include the pwsh worker as an orphan candidate
      const workerCandidates = result.data.filter((c) => c.kind === "powershell-worker");
      expect(workerCandidates).toHaveLength(1);
      expect(workerCandidates[0]?.pid).toBe(8888);
      expect(workerCandidates[0]?.accessPath).toBe(ACCESS_PATH);
    }
  });

  it("excludes pwsh workers whose PID is owned by a running operation's accessPid", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    // Worker PID 8888 is also the accessPid of a running record — should not be double-counted
    await registry.create(runningRecord(8888, PROJECT_ROOT));
    await registry.create(workerRecord(100, PROJECT_ROOT, 8888));

    const worker = headlessPwshWorker({ pid: 8888 });
    const { killer } = makeKiller();

    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([worker]),
      processInspector: makeInspector(worker),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // PID 8888 should NOT appear because it's owned by a running operation
      const workerCandidates = result.data.filter((c) => c.kind === "powershell-worker");
      expect(workerCandidates).toHaveLength(0);
    }
  });

  it("excludes pwsh workers that are no longer running", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(workerRecord(100, PROJECT_ROOT, 8888));

    // Worker PID not in the process list — it's gone
    const { killer } = makeKiller();

    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([]),
      processInspector: makeInspector(undefined),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const workerCandidates = result.data.filter((c) => c.kind === "powershell-worker");
      expect(workerCandidates).toHaveLength(0);
    }
  });

  it("excludes pwsh workers from a different project", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(workerRecord(100, "C:\\other\\project", 8888));

    const worker = headlessPwshWorker({ pid: 8888 });
    const { killer } = makeKiller();

    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([worker]),
      processInspector: makeInspector(worker),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const workerCandidates = result.data.filter((c) => c.kind === "powershell-worker");
      expect(workerCandidates).toHaveLength(0);
    }
  });

  it("excludes pwsh workers from non-running registry records", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    // Create a record with status "cleaned" — should not produce orphan candidates
    const rec = await registry.create(workerRecord(100, PROJECT_ROOT, 8888));
    await registry.update(rec.operationId, {
      status: "cleaned",
      updatedAt: new Date().toISOString(),
    });

    const worker = headlessPwshWorker({ pid: 8888 });
    const { killer } = makeKiller();

    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([worker]),
      processInspector: makeInspector(worker),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const workerCandidates = result.data.filter((c) => c.kind === "powershell-worker");
      expect(workerCandidates).toHaveLength(0);
    }
  });

  it("includes both MSACCESS orphans and pwsh worker orphans in one result", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    // Running op with worker — worker should appear as orphan
    await registry.create(workerRecord(100, PROJECT_ROOT, 8888));

    const accessProc = headlessMsAccess({ pid: 9999 });
    const workerProc = headlessPwshWorker({ pid: 8888 });
    const { killer } = makeKiller();

    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([accessProc, workerProc]),
      processInspector: makeInspector(accessProc),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const accessCandidates = result.data.filter((c) => c.kind === "access");
      const workerCandidates = result.data.filter((c) => c.kind === "powershell-worker");
      expect(accessCandidates).toHaveLength(1);
      expect(accessCandidates[0]?.pid).toBe(9999);
      expect(workerCandidates).toHaveLength(1);
      expect(workerCandidates[0]?.pid).toBe(8888);
    }
  });
});

describe("AccessOrphanCleanupService — pwsh worker cleanupOrphan", () => {
  it("kills a confirmed pwsh worker PID and writes synthetic record", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const worker = headlessPwshWorker({ pid: 8888 });
    const { killer, killed } = makeKiller();

    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([worker]),
      processInspector: makeInspector(worker),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 8888,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.killed).toContain(8888);
      expect(result.data.refused).toEqual([]);
      expect(result.data.errors).toEqual([]);
    }
    expect(killed).toContain(8888);
  });

  it("rejects a pwsh worker PID that is owned by a running operation", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    // PID 8888 is the accessPid of a running record — should be refused
    await registry.create(runningRecord(8888, PROJECT_ROOT));
    const worker = headlessPwshWorker({ pid: 8888 });
    const { killer, killed } = makeKiller();

    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([worker]),
      processInspector: makeInspector(worker),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 8888,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_REGISTRY_OWNED");
    }
    expect(killed).toEqual([]);
  });

  it("rejects a pwsh worker PID that is the powershellWorkerPid of a running operation", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(workerRecord(100, PROJECT_ROOT, 8888));
    const worker = headlessPwshWorker({ pid: 8888 });
    const { killer, killed } = makeKiller();

    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([worker]),
      processInspector: makeInspector(worker),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 8888,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_REGISTRY_OWNED");
    }
    expect(killed).toEqual([]);
  });

  it("accepts a pwsh worker PID whose process is gone", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();

    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([]),
      processInspector: makeInspector(undefined),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
      confirmPid: 8888,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ORPHAN_CLEANUP_PID_GONE");
    }
    expect(killed).toEqual([]);
  });
});

// NOTE: spawnPowerShellProcess and createDefaultPowerShellExecutor tests for
// powershellWorkerPid live in test/adapters/powershell/default-executor.test.ts
// because they need the vi.mock("node:child_process") setup in that file.
