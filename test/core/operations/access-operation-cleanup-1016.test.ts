import { describe, expect, it } from "vitest";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
} from "../../../src/core/operations/access-operation-cleanup";
import { AccessOperationCleanupService } from "../../../src/core/operations/access-operation-cleanup";
import {
  type AccessOperationRecord,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry";

/**
 * Issue #1016 Part B — `cleanup_access_operation({force:true})` reports
 * `status:"cleaned"` while the underlying MSACCESS process is still alive
 * (false success). The fix MUST verify the kill actually succeeded by
 * re-inspecting the process state after the kill call. If the kill did
 * not take, surface a typed CLEANUP_KILL_UNVERIFIED error instead of
 * silently reporting "cleaned".
 *
 * The fix is the same accessPid tracking contract that the issue's
 * Recommended Implementation Direction calls for: the operation record's
 * `accessPid` MUST be the authoritative source for the kill target, and
 * after the kill the runtime MUST re-inspect the OS to confirm the PID
 * is gone before marking the registry record as "cleaned".
 */

const PROJECT_ROOT = "C:\\repo\\myapp";
const ACCESS_PATH = "C:\\data\\app.accdb";

function makeInspector(process: OsProcessInfo | undefined): ProcessInspector {
  return { getProcess: async () => process };
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

function failedRecord(
  pid: number,
  status: AccessOperationRecord["status"] = "failed",
): AccessOperationRecord {
  return {
    operationId: `op-${status}-${pid}`,
    action: "vba",
    accessPath: ACCESS_PATH,
    projectRootAbs: PROJECT_ROOT,
    accessPid: pid,
    processStartTime: "2026-07-20T11:07:38.000Z",
    status,
    metadata: { toolName: "import_modules" },
    updatedAt: "2026-07-20T11:07:38.000Z",
  };
}

function msaccessProcess(pid: number, override: Partial<OsProcessInfo> = {}): OsProcessInfo {
  return {
    pid,
    name: "MSACCESS.EXE",
    startTime: "2026-07-20T11:07:38.000Z",
    commandLine: `MSACCESS.EXE "${ACCESS_PATH}"`,
    mainWindowHandle: 0,
    ...override,
  };
}

describe("AccessOperationCleanupService — #1016 Part B verifies the kill took", () => {
  it("refuses to mark 'cleaned' when processKiller.kill ran but the process is still alive (force:true path)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(failedRecord(16224, "failed"));
    const stillAlive = msaccessProcess(16224);
    // Killer is called and returns success, but the live OS process is
    // still alive — mirrors the v2.19.0 repro where the kill "succeeded"
    // but MSACCESS survived because Stop-Process alone did not kill an
    // -Embedding MSACCESS holding a lock.
    const { killer } = makeKiller();
    const inspector = makeInspector(stillAlive);
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: inspector,
      processKiller: killer,
    });

    const result = await svc.cleanup({
      operationId: "op-failed-16224",
      accessPath: ACCESS_PATH,
      force: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CLEANUP_KILL_UNVERIFIED");
    expect(result.error.message).toMatch(/PID 16224.*still alive/i);

    // Registry MUST stay at a non-cleaned terminal status so a retry can
    // attempt the kill again. The record's previous status was "failed";
    // it must not be flipped to "cleaned" by a no-op.
    const rec = await registry.get("op-failed-16224");
    expect(rec?.status).toBe("failed");
  });

  it("returns success with status:'cleaned' only after the kill is verified", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(failedRecord(16225, "failed"));
    const inspectorSequence: Array<OsProcessInfo | undefined> = [
      msaccessProcess(16225), // before kill: alive
      undefined, // after kill: gone
    ];
    let inspectorCalls = 0;
    const inspector: ProcessInspector = {
      getProcess: async () => inspectorSequence[inspectorCalls++] ?? undefined,
    };
    const { killer, killed } = makeKiller();
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: inspector,
      processKiller: killer,
    });

    const result = await svc.cleanup({
      operationId: "op-failed-16225",
      accessPath: ACCESS_PATH,
      force: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("cleaned");
    expect(result.data.accessPid).toBe(16225);
    expect(killed).toContain(16225);
    // Two inspector calls: 1) read current state to drive the kill decision
    // (line 186), 2) re-verify after kill to confirm the OS state changed.
    expect(inspectorCalls).toBeGreaterThanOrEqual(2);
  });

  it("does not regress the existing happy-path 'PID is already gone' branch (no force needed)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create(failedRecord(16226, "failed"));
    const inspector = makeInspector(undefined); // PID already gone
    const { killer, killed } = makeKiller();
    const svc = new AccessOperationCleanupService({
      registry,
      processInspector: inspector,
      processKiller: killer,
    });

    const result = await svc.cleanup({
      operationId: "op-failed-16226",
      accessPath: ACCESS_PATH,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("cleaned");
    // PID already gone — no kill call.
    expect(killed).toEqual([]);
  });
});
