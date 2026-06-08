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

    const orphans = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.pid).toBe(12345);
    expect(orphans[0]?.mainWindowHandle).toBe(0);
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

    const orphans = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(orphans).toHaveLength(0);
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

    const orphans = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(orphans).toHaveLength(0);
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

    const orphans = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(orphans).toHaveLength(0);
  });

  it("returns empty when processScanner.listProcesses() throws — must not throw, must not crash", async () => {
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

    await expect(
      svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT }),
    ).resolves.toEqual([]);
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
