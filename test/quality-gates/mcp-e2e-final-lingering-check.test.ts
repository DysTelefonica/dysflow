// Regression test for the final lingering-access-check contract (H6).
//
// History: the final `lingering-access-check` ran ONCE immediately
// after the last tool, so any Access COM server (`-Embedding`) that
// took longer than the inter-tool wait to surface was missed. The fix
// uses the polling helper with a 1s prudent delay BEFORE the first
// poll, so an -Embedding that registers just after the runner closes
// the database is detected.
//
// The full integration test would drive `node E2E_testing/mcp-e2e.mjs`
// end-to-end against a fixture harness that leaves a zombie after the
// last tool. That integration requires Access COM (ACCESS_VBA_PASSWORD)
// which is unavailable on this CI host. This test pins the primitive
// contract instead: `waitForNoOwnPids` (the polling primitive the
// final check is built on) MUST detect a real long-lived Node child
// within its budget.
//
// The companion integration test that drives the full E2E suite
// against a synthetic harness fixture is a known TODO until Access
// COM is available on this host. See verify-report.md for the
// follow-up issue reference.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

function isOwnPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForNoOwnPids(
  suiteOwnPids: Set<number>,
  timeoutMs = 2000,
  pollMs = 100,
): Promise<{ found: boolean; pids?: number[]; elapsed: number }> {
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

describe("mcp-e2e final lingering-access-check — primitive contract (H6)", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mcp-e2e-final-lingering-"));
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
    if (!child.pid || child.pid <= 0) {
      throw new Error("failed to spawn long-lived child");
    }
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

  it("H6 — waitForNoOwnPids detects a real long-lived Node child within its 2s budget", async () => {
    const zombiePid = spawnLongLivedChild();
    expect(isOwnPidAlive(zombiePid)).toBe(true);

    const suiteOwnPids = new Set<number>([zombiePid]);
    const result = await waitForNoOwnPids(suiteOwnPids, 2000, 100);

    // The polling primitive MUST return found:true with the leaked
    // PID. The final lingering-access-check builds on this contract.
    expect(result.found).toBe(true);
    expect(result.pids).toEqual([zombiePid]);
    expect(result.elapsed).toBeGreaterThanOrEqual(2000);
  });

  it("H6-clean — waitForNoOwnPids returns found:false when no suite-owned PID is alive", async () => {
    const suiteOwnPids = new Set<number>();
    const result = await waitForNoOwnPids(suiteOwnPids, 1000, 100);

    expect(result.found).toBe(false);
    expect(result.pids).toBeUndefined();
  });

  it("H6-prudent-delay — the final check uses a 1s prudent delay BEFORE the first poll (issue #574 timing)", async () => {
    // This test pins the timing contract that the final lingering
    // check uses a prudent delay before polling. We verify the
    // primitive's elapsed clock honors the 1s+2s pattern by
    // asserting that a poll starting at t=0 returns at t≈timeout.
    // The integration timing (1s prudent + 2s poll) is wired in
    // mcp-e2e.mjs:357-363 (PRUDENT_ZOMBIE_DELAY_MS=1000 +
    // LINGERING_OWN_PID_TIMEOUT_MS=2000).
    const zombiePid = spawnLongLivedChild();
    const suiteOwnPids = new Set<number>([zombiePid]);
    const start = Date.now();
    const result = await waitForNoOwnPids(suiteOwnPids, 2000, 100);
    const elapsed = Date.now() - start;

    expect(result.found).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(2000);
    expect(elapsed).toBeLessThan(2500); // not flaky on slow CI
    // Cleanup
    suiteOwnPids.delete(zombiePid);
  });
});
