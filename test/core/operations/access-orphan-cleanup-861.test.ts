import { describe, expect, it } from "vitest";
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

/**
 * issue #861 — dysflow spawns MSACCESS via COM automation (New-Object
 * Access.Application + OpenCurrentDatabase), so the process command line carries
 * NO .accdb path (it looks like `MSACCESS.EXE` / `/automation`). When such an
 * operation fails, its registry record moves to a terminal state (e.g. "failed")
 * but the process can stay alive holding the lock. The command-line-match
 * enumeration missed these entirely, so `access_force_cleanup_orphaned` returned
 * `[]` and the consumer had to know the exact PID. dysflow's OWN record proves
 * ownership + accessPath, so those zombies must be enumerable and killable
 * without a caller-supplied path match.
 */

const PROJECT_ROOT = "C:\\repo\\myapp";
const ACCESS_PATH = "C:\\data\\app.accdb";

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

// A COM-automation MSACCESS: headless, holding the DB via OpenCurrentDatabase,
// so its command line has NO .accdb path.
function comAutomationMsAccess(overrides: Partial<OsProcessInfo> = {}): OsProcessInfo {
  return {
    pid: 27288,
    name: "MSACCESS.EXE",
    startTime: "2026-07-13T18:00:00.000Z",
    commandLine: "MSACCESS.EXE /automation",
    mainWindowHandle: 0,
    ...overrides,
  };
}

function terminalRecord(
  pid: number,
  status: AccessOperationRecord["status"] = "failed",
): AccessOperationRecord {
  return {
    operationId: `op-${status}-${pid}`,
    action: "vba",
    accessPath: ACCESS_PATH,
    projectRootAbs: PROJECT_ROOT,
    accessPid: pid,
    processStartTime: "2026-07-13T18:00:00.000Z",
    status,
    metadata: {},
    updatedAt: "2026-07-13T18:00:05.000Z",
  };
}

async function seed(records: AccessOperationRecord[]): Promise<InMemoryAccessOperationRegistry> {
  const registry = new InMemoryAccessOperationRegistry();
  for (const r of records) await registry.create(r);
  return registry;
}

describe("orphan_cleanup_enumerates_dysflow_spawned_zombies (#861)", () => {
  it("listOrphans surfaces a dysflow-spawned MSACCESS proven by a terminal (failed) record, even with no path on its command line", async () => {
    const registry = await seed([terminalRecord(27288, "failed")]);
    const { killer } = makeKiller();
    const proc = comAutomationMsAccess({ pid: 27288 });
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((c) => c.pid)).toContain(27288);
  });

  it("listOrphans does NOT surface a still-running dysflow operation's MSACCESS", async () => {
    const registry = await seed([terminalRecord(27288, "running")]);
    const { killer } = makeKiller();
    const proc = comAutomationMsAccess({ pid: 27288 });
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.listOrphans({ accessPath: ACCESS_PATH, projectRoot: PROJECT_ROOT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((c) => c.pid)).not.toContain(27288);
  });

  it("cleanupOrphan(confirmPid) kills a COM-spawned zombie proven by the registry, without a command-line path match", async () => {
    const registry = await seed([terminalRecord(27288, "failed")]);
    const { killer, killed } = makeKiller();
    const proc = comAutomationMsAccess({ pid: 27288 });
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      confirmPid: 27288,
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.killed).toContain(27288);
    expect(killed).toContain(27288);
  });

  it("cleanupOrphan still refuses an MSACCESS holding a DIFFERENT path with no registry proof", async () => {
    const registry = await seed([]);
    const { killer } = makeKiller();
    const proc: OsProcessInfo = {
      pid: 40404,
      name: "MSACCESS.EXE",
      startTime: "2026-07-13T18:00:00.000Z",
      commandLine: `MSACCESS.EXE "C:\\data\\other.accdb"`,
      mainWindowHandle: 0,
    };
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      confirmPid: 40404,
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORPHAN_CLEANUP_PATH_MISMATCH");
  });
});
