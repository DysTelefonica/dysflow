import { describe, expect, it } from "vitest";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
  ProcessScanner,
} from "../../../src/core/operations/access-operation-cleanup";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";
import { AccessOrphanCleanupService } from "../../../src/core/operations/access-orphan-cleanup";

/**
 * Issue #1016 Part C — `access_force_cleanup_orphaned({confirmPid})`
 * rejects dysflow-spawned `-Embedding` MSACCESS instances with
 * ORPHAN_CLEANUP_PATH_MISMATCH even when the user has explicitly confirmed
 * the PID. The fix MUST accept the user-confirmed PID when:
 *   - the PID is alive (already verified)
 *   - the process is MSACCESS.EXE (already verified)
 *   - the process is headless (already verified)
 *   - the user has explicitly confirmed the PID via confirmPid (the new gate)
 *   - the process command line is either:
 *       * absent (Get-Process fallback), OR
 *       * an embedding/automation marker (`-Embedding`, `/automation`,
 *         `/Embedding <pid>`), OR
 *       * not a per-instance Access path (i.e. dysflow-spawned COM child)
 *
 * When ALL of those hold, the runtime trusts the explicit user confirmation
 * instead of failing with ORPHAN_CLEANUP_PATH_MISMATCH.
 *
 * Safety property preserved:
 *   - non-headless / wrong-process / recycled-PID refusals still fire.
 *   - Registry-owned PIDs are still refused.
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

function embeddingMsAccess(pid: number, commandLine?: string): OsProcessInfo {
  return {
    pid,
    name: "MSACCESS.EXE",
    startTime: "2026-07-20T13:05:56.000Z",
    commandLine,
    mainWindowHandle: 0,
  };
}

describe("AccessOrphanCleanupService — #1016 Part C accepts user-confirmed -Embedding PIDs", () => {
  it("kills a user-confirmed MSACCESS held in -Embedding mode with no .accdb on the command line", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const proc = embeddingMsAccess(16224, "MSACCESS.EXE -Embedding");
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      confirmPid: 16224,
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.killed).toContain(16224);
    expect(killed).toContain(16224);
  });

  it("kills a user-confirmed MSACCESS held in /automation mode (legacy flag)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const proc = embeddingMsAccess(26424, "MSACCESS.EXE /automation");
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      confirmPid: 26424,
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.killed).toContain(26424);
    expect(killed).toContain(26424);
  });

  it("STILL refuses a user-confirmed MSACCESS with no command line at all (no proof)", async () => {
    // Issue #1016 Part C relaxes the path-match for the COM child profile
    // (-Embedding / /automation) but does NOT change the conservative refusal
    // for a headless MSACCESS with no command line at all — there is no
    // positive signal that the process is one of ours vs. an unattributed
    // operator-launched Access instance. This preserves the existing
    // ORPHAN_CLEANUP_PATH_UNVERIFIED safety net.
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const proc = embeddingMsAccess(27668, undefined);
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      confirmPid: 27668,
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORPHAN_CLEANUP_PATH_UNVERIFIED");
    expect(killed).toEqual([]);
  });

  it("STILL refuses a user-confirmed MSACCESS that is registry-owned by a running operation", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      operationId: "op-running-31892",
      action: "vba",
      accessPath: ACCESS_PATH,
      projectRootAbs: PROJECT_ROOT,
      accessPid: 31892,
      processStartTime: "2026-07-20T13:05:56.000Z",
      status: "running",
      metadata: {},
      updatedAt: "2026-07-20T13:05:56.000Z",
    });
    const { killer, killed } = makeKiller();
    const proc = embeddingMsAccess(31892, "MSACCESS.EXE -Embedding");
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      confirmPid: 31892,
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORPHAN_CLEANUP_REGISTRY_OWNED");
    expect(killed).toEqual([]);
  });

  it("STILL refuses a non-headless PID (interpreter-window MSACCESS cannot be killed via confirmPid)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const proc: OsProcessInfo = {
      pid: 9999,
      name: "MSACCESS.EXE",
      startTime: "2026-07-20T13:05:56.000Z",
      commandLine: "MSACCESS.EXE -Embedding",
      mainWindowHandle: 0xdead, // interactive window — operator lied
    };
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      confirmPid: 9999,
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORPHAN_CLEANUP_NOT_HEADLESS");
    expect(killed).toEqual([]);
  });

  it("STILL refuses a different process (WINWORD.EXE etc.) even when the user supplies a confirmPid", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const { killer, killed } = makeKiller();
    const proc: OsProcessInfo = {
      pid: 7777,
      name: "WINWORD.EXE",
      startTime: "2026-07-20T13:05:56.000Z",
      commandLine: "WINWORD.EXE -Embedding",
      mainWindowHandle: 0,
    };
    const svc = new AccessOrphanCleanupService({
      registry,
      processScanner: makeScanner([proc]),
      processInspector: makeInspector(proc),
      processKiller: killer,
    });

    const result = await svc.cleanupOrphan({
      confirmPid: 7777,
      accessPath: ACCESS_PATH,
      projectRoot: PROJECT_ROOT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ORPHAN_CLEANUP_NOT_MSACCESS");
    expect(killed).toEqual([]);
  });
});
