import { describe, expect, it } from "vitest";
import {
  ALLOW_FOREIGN_ACCESS_ENV,
  parseAccessProcessTable,
  runAccessPreflight,
} from "../../E2E_testing/_helpers/access-preflight.mjs";

// #1974: release run 40519155504 started with a headless `MSACCESS.EXE -Embedding` orphan
// that was hours old. The preflight must surface it before the first scenario.
const OWN_PID = 4242;
const orphan = {
  ProcessId: 28444,
  ParentProcessId: 1100,
  CreationMs: Date.UTC(2026, 9, 27, 9, 0, 0),
  CommandLine: '"C:\\Program Files\\Microsoft Office\\root\\Office16\\MSACCESS.EXE" -Embedding',
};
const interactive = {
  ProcessId: 5150,
  ParentProcessId: 7000,
  CreationMs: Date.UTC(2026, 9, 27, 13, 0, 0),
  CommandLine:
    '"C:\\Program Files\\Microsoft Office\\root\\Office16\\MSACCESS.EXE" "C:\\work\\app.accdb"',
};

function probeReturning(rows: unknown) {
  const calls: number[] = [];
  const probe = () => {
    calls.push(1);
    return JSON.stringify(rows);
  };
  return { probe, calls };
}

describe("issue #1974: battery preflight for foreign Access processes", () => {
  it("passes clean when no MSACCESS.EXE is alive", () => {
    const result = runAccessPreflight({ probe: () => "", ownPid: OWN_PID, env: {} });
    expect(result.kind).toBe("access-preflight");
    expect(result.status).toBe("clean");
    expect(result.pass).toBe(true);
    expect(result.foreignHeadless).toEqual([]);
  });

  it("refuses to start when a foreign headless Access process is alive, naming PID, start time and command line", () => {
    const { probe } = probeReturning([orphan]);
    const result = runAccessPreflight({ probe, ownPid: OWN_PID, env: {} });
    expect(result.status).toBe("refused");
    expect(result.pass).toBe(false);
    expect(result.foreignHeadless.map((p: { pid: number }) => p.pid)).toEqual([28444]);
    expect(result.summary).toContain("pid=28444");
    expect(result.summary).toContain("2026-10-27T09:00:00.000Z");
    expect(result.summary).toContain("-Embedding");
    expect(result.summary).toContain("access_force_cleanup_orphaned");
    expect(result.summary).toContain("confirmPid");
    expect(result.summary).toContain(ALLOW_FOREIGN_ACCESS_ENV);
    expect(result.summary).toMatch(/never kill MSACCESS\.EXE by name/i);
  });

  it("downgrades the refusal to a recorded warning under the explicit opt-out", () => {
    const { probe } = probeReturning([orphan]);
    const result = runAccessPreflight({
      probe,
      ownPid: OWN_PID,
      env: { [ALLOW_FOREIGN_ACCESS_ENV]: "1" },
    });
    expect(result.status).toBe("allowed");
    expect(result.pass).toBe(true);
    expect(result.summary).toContain("pid=28444");
    expect(result.summary).toMatch(/WARNING/);
  });

  it("only accepts the literal opt-out value 1", () => {
    const { probe } = probeReturning([orphan]);
    const result = runAccessPreflight({
      probe,
      ownPid: OWN_PID,
      env: { [ALLOW_FOREIGN_ACCESS_ENV]: "true" },
    });
    expect(result.status).toBe("refused");
  });

  it("does not count an Access process this run spawned as foreign", () => {
    const { probe } = probeReturning([{ ...orphan, ParentProcessId: OWN_PID }]);
    const result = runAccessPreflight({ probe, ownPid: OWN_PID, env: {} });
    expect(result.status).toBe("clean");
    expect(result.foreignHeadless).toEqual([]);
  });

  it("records an interactive Access session without refusing", () => {
    const { probe } = probeReturning(interactive);
    const result = runAccessPreflight({ probe, ownPid: OWN_PID, env: {} });
    expect(result.status).toBe("clean");
    expect(result.pass).toBe(true);
    expect(result.foreignInteractive.map((p: { pid: number }) => p.pid)).toEqual([5150]);
    expect(result.summary).toContain("pid=5150");
  });

  it("treats an unreadable command line as headless, because it cannot be proven interactive", () => {
    const { probe } = probeReturning([{ ...interactive, CommandLine: null }]);
    const result = runAccessPreflight({ probe, ownPid: OWN_PID, env: {} });
    expect(result.status).toBe("refused");
  });

  it("records an unavailable probe as a warning instead of a clean pass", () => {
    const result = runAccessPreflight({
      probe: () => {
        throw new Error("Get-CimInstance failed");
      },
      ownPid: OWN_PID,
      env: {},
    });
    expect(result.status).toBe("probe-unavailable");
    expect(result.summary).toContain("Get-CimInstance failed");
  });

  it("parses the single-object JSON PowerShell emits for one process", () => {
    expect(parseAccessProcessTable(JSON.stringify(orphan))).toEqual([
      {
        pid: 28444,
        parentPid: 1100,
        creationMs: orphan.CreationMs,
        commandLine: orphan.CommandLine,
      },
    ]);
    expect(parseAccessProcessTable("")).toEqual([]);
  });
});
