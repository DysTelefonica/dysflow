import { describe, expect, it } from "vitest";
import {
  computeAccessLeak,
  runAccessPreflight,
  snapshotAccessProcesses,
} from "../../E2E_testing/_helpers/access-preflight.mjs";

// #1978: the global leak check took its "start" count after the battery, so leakDelta compared
// two after-run counts. The start snapshot now comes from the #1974 preflight, before the first
// scenario, and the leak is the set of PIDs alive at the end that were not alive at start.
const OWN_PID = 4242;
const EXE = '"C:\\Program Files\\Microsoft Office\\root\\Office16\\MSACCESS.EXE"';
const foreignOrphan = {
  ProcessId: 28444,
  ParentProcessId: 1100,
  CreationMs: Date.UTC(2026, 9, 27, 9, 0, 0),
  CommandLine: `${EXE} -Embedding`,
};
const leaked = {
  ProcessId: 31337,
  ParentProcessId: 9001,
  CreationMs: Date.UTC(2026, 9, 27, 14, 30, 0),
  CommandLine: `${EXE} -Embedding`,
};
const exitedDuringRun = {
  ProcessId: 12000,
  ParentProcessId: OWN_PID,
  CreationMs: Date.UTC(2026, 9, 27, 14, 0, 0),
  CommandLine: `${EXE} -Embedding`,
};

const probeOf = (rows: unknown[]) => () => JSON.stringify(rows);

function runLeakCheck(startRows: unknown[], endRows: unknown[]) {
  const preflight = runAccessPreflight({
    probe: probeOf(startRows),
    ownPid: OWN_PID,
    env: { DYSFLOW_E2E_ALLOW_FOREIGN_ACCESS: "1" },
  });
  const end = snapshotAccessProcesses({ probe: probeOf(endRows) });
  return computeAccessLeak({ start: preflight.snapshot, end });
}

describe("issue #1978: the global Access leak check measures start before the battery", () => {
  it("reports a leak of 1 naming the new PID when 1 process at start becomes 2 at end", () => {
    const result = runLeakCheck([foreignOrphan], [foreignOrphan, leaked]);
    expect(result.verified).toBe(true);
    expect(result.startCount).toBe(1);
    expect(result.endCount).toBe(2);
    expect(result.leakDelta).toBe(1);
    expect(result.leaked.map((p: { pid: number }) => p.pid)).toEqual([31337]);
    expect(result.summary).toContain("pid=31337");
    expect(result.summary).toContain("2026-10-27T14:30:00.000Z");
    expect(result.summary).toContain("-Embedding");
    expect(result.summary).toContain("access_force_cleanup_orphaned");
    expect(result.summary).toMatch(/never kill MSACCESS\.EXE by name/i);
  });

  it("does not count a foreign process alive at start and still alive at end", () => {
    const result = runLeakCheck([foreignOrphan], [foreignOrphan]);
    expect(result.leakDelta).toBe(0);
    expect(result.leaked).toEqual([]);
  });

  it("counts a new PID even when a start PID exited, so the counts alone would hide it", () => {
    const result = runLeakCheck([exitedDuringRun], [leaked]);
    expect(result.startCount).toBe(1);
    expect(result.endCount).toBe(1);
    expect(result.leakDelta).toBe(1);
    expect(result.leaked.map((p: { pid: number }) => p.pid)).toEqual([31337]);
  });

  it("treats a reused PID with a different start time as a new process", () => {
    const reused = { ...leaked, ProcessId: foreignOrphan.ProcessId };
    const result = runLeakCheck([foreignOrphan], [reused]);
    expect(result.leakDelta).toBe(1);
  });

  it("leaves an interactive Access session opened during the run out of the leak", () => {
    const interactive = {
      ProcessId: 5150,
      ParentProcessId: 7000,
      CreationMs: Date.UTC(2026, 9, 27, 14, 10, 0),
      CommandLine: `${EXE} "C:\\work\\app.accdb"`,
    };
    const result = runLeakCheck([], [interactive]);
    expect(result.leakDelta).toBe(0);
    expect(result.newInteractive.map((p: { pid: number }) => p.pid)).toEqual([5150]);
  });

  it("reports the check as unverified, not clean, when either snapshot could not be read", () => {
    const preflight = runAccessPreflight({
      probe: () => {
        throw new Error("powershell missing");
      },
      ownPid: OWN_PID,
      env: {},
    });
    const end = snapshotAccessProcesses({ probe: probeOf([leaked]) });
    const result = computeAccessLeak({ start: preflight.snapshot, end });
    expect(result.verified).toBe(false);
    expect(result.leakDelta).toBe(0);
    expect(result.summary).toMatch(/unverified/i);
  });
});
