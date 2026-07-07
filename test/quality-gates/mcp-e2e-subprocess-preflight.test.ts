// Regression test for the preflight REFUSE-START contract at H4.
// The previous coverage was an in-memory simulation; this test spawns a
// REAL Node child process that stays alive and verifies the real
// `record()` driver (extracted to `_helpers/mcp-e2e-record.mjs` in
// WU-C) detects the leaked child via `waitForNoOwnPids` and aborts
// before the tool runs.
//
// The test pins:
//   - REFUSE-START aborts the battery before any tool runs
//   - The leaked PID is reported in the preflight row summary
//   - The thrown error message names the offending tool
//   - The process.exitCode is set to 1

// @ts-nocheck — the imported helpers have no .d.mts yet; the runtime
// contract is exercised by vitest and pinned by these tests.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { record } from "../../E2E_testing/_helpers/mcp-e2e-record.mjs";

// Inline copies of `isOwnPidAlive` / `waitForNoOwnPids` so the test
// exercises the real `record()` driver against real process-checking
// logic, mirroring what `mcp-e2e.mjs` provides via ctx. Duplicated by
// design — these primitives stay in the suite to keep the test honest
// about the contract being pinned.
function isOwnPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForNoOwnPids(suiteOwnPids, timeoutMs = 500, pollMs = 100) {
  const start = Date.now();
  const watched = Array.from(suiteOwnPids);
  while (true) {
    const survivors = watched.filter((p) => isOwnPidAlive(p));
    if (survivors.length === 0) return { found: false, elapsed: Date.now() - start };
    if (Date.now() - start >= timeoutMs) {
      return { found: true, pids: survivors, elapsed: Date.now() - start };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

describe("mcp-e2e record() — real leaked subprocess detected at preflight", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mcp-e2e-preflight-real-"));
  const spawnedPids: number[] = [];

  function spawnLongLivedChild(): number {
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000); setTimeout(() => {}, 60000);"],
      {
        stdio: "ignore",
        detached: false,
        cwd: tempRoot,
        env: { ...process.env },
      },
    );
    if (!child.pid || child.pid <= 0) throw new Error("failed to spawn long-lived child");
    spawnedPids.push(child.pid);
    return child.pid;
  }

  afterAll(() => {
    for (const pid of spawnedPids) {
      try {
        process.kill(pid);
      } catch {
        /* already gone */
      }
    }
    try {
      rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it("H4 — preflight throws REFUSE-START when a real suite-owned child is still alive", async () => {
    const leakedPid = spawnLongLivedChild();
    // Sanity: confirm the child really is alive before we drive the
    // preflight — protects against false GREEN if spawn silently failed.
    expect(isOwnPidAlive(leakedPid)).toBe(true);

    const suiteOwnPids = new Set<number>([leakedPid]);
    const rows: Array<{
      area: string;
      tool: string;
      pass: boolean;
      expected: string;
      ms: number;
      summary: string;
    }> = [];
    const processObj = { exitCode: null as number | null };
    const errors: string[] = [];

    const ctx = {
      // The callMcp MUST NOT be invoked — that's the whole point of REFUSE-START.
      callMcp: async () => {
        throw new Error("REFUSE-START failed: callMcp was invoked after preflight leak");
      },
      suiteOwnPids,
      rows,
      waitForNoOwnPids: (timeoutMs?: number, pollMs?: number) =>
        waitForNoOwnPids(suiteOwnPids, timeoutMs, pollMs),
      isOwnPidAlive: (pid: number) => isOwnPidAlive(pid),
      processObj,
      consoleLog: () => {},
      consoleError: (msg: string) => {
        errors.push(String(msg));
      },
      DateNow: () => 0,
    };

    await expect(
      record(ctx, {
        area: "diagnostics",
        tool: "doctor",
        args: {},
        options: { expected: "success" },
      }),
    ).rejects.toThrow(/mcp-e2e: REFUSE-START before doctor/);

    // Preflight row was pushed; the tool never ran (callMcp would have thrown).
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tool).toBe("doctor:preflight");
    expect(rows[0]?.pass).toBe(false);
    expect(rows[0]?.summary).toContain(`pids=${leakedPid}`);
    expect(processObj.exitCode).toBe(1);
    expect(errors.some((e) => /REFUSE-START/.test(e))).toBe(true);
  });

  it("H4-supplementary — preflight returns clean when no suite-owned child is alive", async () => {
    // The previous test leaked a PID, but it was killed in afterAll. This
    // test exercises the negative path: an empty suiteOwnPids lets the
    // preflight pass and the callMcp runs.
    let callMcpInvoked = false;
    const suiteOwnPids = new Set<number>();
    const rows: Array<{ area: string; tool: string; pass: boolean }> = [];
    const processObj = { exitCode: null as number | null };

    const ctx = {
      callMcp: async () => {
        callMcpInvoked = true;
        return {
          childPid: 0,
          timedOut: false,
          isError: false,
          text: "ok",
          stderr: "",
          exit: 0,
        };
      },
      suiteOwnPids,
      rows,
      waitForNoOwnPids: (timeoutMs?: number, pollMs?: number) =>
        waitForNoOwnPids(suiteOwnPids, timeoutMs, pollMs),
      isOwnPidAlive: (pid: number) => isOwnPidAlive(pid),
      processObj,
      consoleLog: () => {},
      consoleError: () => {},
      DateNow: () => 0,
    };

    const result = await record(ctx, {
      area: "diagnostics",
      tool: "tools/list",
      args: {},
      options: { expected: "success" },
    });

    expect(callMcpInvoked).toBe(true);
    expect(result.text).toBe("ok");
    expect(rows[0]?.tool).toBe("tools/list");
    expect(rows[0]?.pass).toBe(true);
    expect(processObj.exitCode).toBeNull();
  });
});
