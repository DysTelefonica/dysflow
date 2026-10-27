import { describe, expect, it } from "vitest";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
} from "../../../src/core/operations/access-operation-cleanup";
import { reapRunOwnedAccess } from "../../../src/core/operations/run-owned-access-reap";

// Issue #1911: a run that ends without closing Access (timeout, crash) must kill the
// Access PID it recorded, and only that one: same PID, still MSACCESS.EXE, same start.

const START = "2026-10-27T10:00:00.000Z";

function fakePorts(processes: Record<number, OsProcessInfo>, killFails = false) {
  const killed: number[] = [];
  const processInspector: ProcessInspector = {
    getProcess: async (pid) => processes[pid],
  };
  const processKiller: ProcessKiller = {
    kill: async (pid) => {
      if (killFails) throw new Error("Access is denied.");
      killed.push(pid);
      delete processes[pid];
    },
  };
  return { killed, ports: { processInspector, processKiller } };
}

describe("reapRunOwnedAccess (#1911)", () => {
  it("kills the recorded Access when it is still alive", async () => {
    const { killed, ports } = fakePorts({
      4321: { pid: 4321, name: "MSACCESS.EXE", startTime: START, mainWindowHandle: 0 },
      35284: { pid: 35284, name: "MSACCESS.EXE", startTime: START, mainWindowHandle: 0 },
    });

    const result = await reapRunOwnedAccess({ accessPid: 4321, processStartTime: START }, ports);

    expect(result).toEqual({ outcome: "killed", pid: 4321 });
    expect(killed).toEqual([4321]);
  });

  it("kills nothing when the run recorded no Access PID", async () => {
    const { killed, ports } = fakePorts({
      35284: { pid: 35284, name: "MSACCESS.EXE", startTime: START, mainWindowHandle: 0 },
    });

    const result = await reapRunOwnedAccess({}, ports);

    expect(result).toEqual({ outcome: "not_recorded" });
    expect(killed).toEqual([]);
  });

  it("kills nothing when the recorded Access already exited", async () => {
    const { killed, ports } = fakePorts({});

    const result = await reapRunOwnedAccess({ accessPid: 4321, processStartTime: START }, ports);

    expect(result).toEqual({ outcome: "exited", pid: 4321 });
    expect(killed).toEqual([]);
  });

  it("never kills a PID reused by another program", async () => {
    const { killed, ports } = fakePorts({
      4321: { pid: 4321, name: "notepad.exe", startTime: START },
    });

    const result = await reapRunOwnedAccess({ accessPid: 4321, processStartTime: START }, ports);

    expect(result).toEqual({ outcome: "exited", pid: 4321 });
    expect(killed).toEqual([]);
  });

  it("never kills a PID reused by a later Access", async () => {
    const { killed, ports } = fakePorts({
      4321: {
        pid: 4321,
        name: "MSACCESS.EXE",
        startTime: "2026-10-27T11:30:00.000Z",
        mainWindowHandle: 0,
      },
    });

    const result = await reapRunOwnedAccess({ accessPid: 4321, processStartTime: START }, ports);

    expect(result).toEqual({ outcome: "exited", pid: 4321 });
    expect(killed).toEqual([]);
  });

  it("refuses to kill when the run did not record the start time", async () => {
    const { killed, ports } = fakePorts({
      4321: { pid: 4321, name: "MSACCESS.EXE", startTime: START, mainWindowHandle: 0 },
    });

    const result = await reapRunOwnedAccess({ accessPid: 4321 }, ports);

    expect(result.outcome).toBe("refused");
    expect(killed).toEqual([]);
  });

  it("reports a kill that failed without throwing", async () => {
    const { ports } = fakePorts(
      { 4321: { pid: 4321, name: "MSACCESS.EXE", startTime: START, mainWindowHandle: 0 } },
      true,
    );

    const result = await reapRunOwnedAccess({ accessPid: 4321, processStartTime: START }, ports);

    expect(result).toMatchObject({ outcome: "kill_failed", pid: 4321 });
    expect(result.outcome === "kill_failed" && result.reason).toContain("Access is denied.");
  });

  it("reports an inspection failure without killing", async () => {
    const killed: number[] = [];
    const result = await reapRunOwnedAccess(
      { accessPid: 4321, processStartTime: START },
      {
        processInspector: {
          getProcess: async () => {
            throw new Error("CIM query failed");
          },
        },
        processKiller: { kill: async (pid) => void killed.push(pid) },
      },
    );

    expect(result).toMatchObject({ outcome: "inspect_failed", pid: 4321 });
    expect(killed).toEqual([]);
  });
});
