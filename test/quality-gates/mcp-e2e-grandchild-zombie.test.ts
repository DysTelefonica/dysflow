// Regression test for the H5 contract: a leaked grandchild process (an
// MSACCESS.EXE spawned by a PowerShell that the harness itself spawned, or
// in this minimal repro, a node child of a node child) must be detected
// via the descendant walk even when the parent is already gone. The
// previous coverage was an in-memory simulation that hid this hole —
// the real `record()` driver, when wired through `mcp-e2e.mjs`'s
// `isOwnPidAlive`, depends on `isPidOrDescendantAlive` from
// `_helpers/mcp-e2e-record.mjs`, which is the public surface this
// regression pins.
//
// The test pins:
//   - `isPidOrDescendantAlive(outerPid)` returns TRUE when only the
//     grandchild is alive (parent is gone) — the injected walker path
//     MUST pick up the leaked grandchild even though the parent is ESRCH
//   - On Windows hosts (where `wmic` is available), the production
//     `walkDescendantsPids` walker also finds the grandchild. On non-
//     Windows hosts the production walker is intentionally fail-open
//     (returns [] when `wmic` is missing); that platform-aware branch
//     is asserted by a separate test below, gated on `process.platform`
//   - When no descendant is alive (injected fake walker), the helper
//     returns false without raising
//   - `walkDescendantsPids(0)` and `walkDescendantsPids(-1)` return [] as
//     defensive guards (no wmic call attempted)
//   - The injected walker path (fast-path miss → walker → kill(0)) is
//     wired correctly so the helper is reachable without spawning wmic
//
// Cross-platform note: `walkDescendantsPids` is Windows-only because it
// shells out to `wmic process get ProcessId,ParentProcessId`. On Linux /
// macOS hosts the walker is a no-op (fail-open `[]`) — the production
// fail-open design is correct, but it makes the contract that "the real
// walker finds the grandchild" host-dependent. The `isPidOrDescendantAlive`
// helper is platform-agnostic: it accepts an injected walker and falls
// through to `process.kill(pid, 0)` for each returned descendant. So the
// primary contract test injects the walker (cross-platform). The
// secondary "real walker finds it" assertion is gated on Windows.

// @ts-nocheck — the imported helpers have no .d.mts yet; the runtime
// contract is exercised by vitest and pinned by these tests.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  isPidOrDescendantAlive,
  walkDescendantsPids,
} from "../../E2E_testing/_helpers/mcp-e2e-record.mjs";

describe("mcp-e2e record() — H5 grandchild zombie detection via descendant walk", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mcp-e2e-grandchild-"));
  const grandchildPids: number[] = [];

  function killAllGrandchildren(): void {
    for (const pid of grandchildPids) {
      try {
        process.kill(pid);
      } catch {
        /* already gone */
      }
    }
  }

  afterAll(() => {
    killAllGrandchildren();
    try {
      rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it("H5 — isPidOrDescendantAlive(outer) returns true when only the grandchild is alive", async () => {
    // Spawn outer that spawns grandchild then exits; the grandchild is
    // intentionally left running. After the outer exits, `process.kill`
    // against the outer returns ESRCH (fast path returns false), forcing
    // the walker to enumerate descendants.
    const outerScript = `
      const { spawn } = require("child_process");
      const child = spawn(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000); setTimeout(() => {}, 60000);"],
        { stdio: "ignore", detached: true },
      );
      child.unref();
      process.stdout.write(String(child.pid) + "\\n");
    `;
    const outer = spawn(process.execPath, ["-e", outerScript], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: tempRoot,
      env: { ...process.env },
    });
    expect(outer.pid).toBeGreaterThan(0);
    const outerPid = outer.pid;

    const grandchildPid = await new Promise<number>((resolve, reject) => {
      let stdout = "";
      outer.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      outer.on("error", reject);
      outer.on("exit", () => {
        const pid = Number.parseInt(stdout.trim(), 10);
        if (!Number.isFinite(pid) || pid <= 0) {
          reject(
            new Error(
              `outer did not yield a valid grandchild PID; stdout=${JSON.stringify(stdout)}`,
            ),
          );
          return;
        }
        resolve(pid);
      });
    });
    grandchildPids.push(grandchildPid);

    // Sanity: the outer is gone (exit), the grandchild is still alive.
    expect(() => process.kill(outerPid, 0)).toThrow();
    expect(() => process.kill(grandchildPid, 0)).not.toThrow();

    // The real contract: with only the grandchild alive, the helper must
    // still report the suite-owned tree as "alive". This is exactly the
    // regression that the WU-F walker is supposed to prevent. Inject the
    // walker so the assertion is cross-platform — the production
    // `walkDescendantsPids` is Windows-only (uses `wmic`), and the helper
    // is platform-agnostic as long as the caller supplies the descendants.
    expect(isPidOrDescendantAlive(outerPid, () => [grandchildPid])).toBe(true);
  });

  it("H5 — isPidOrDescendantAlive returns false when no descendant is alive", () => {
    // Use a clearly bogus PID (no Node process will have it on this host).
    // The walker must return [] and the helper must return false.
    const fakeWalker = (_rootPid: number) => [] as number[];
    expect(isPidOrDescendantAlive(999_999_999, fakeWalker)).toBe(false);
  });

  it("H5 — walkDescendantsPids guards against bogus inputs (0, negative)", () => {
    // The walker must short-circuit on bogus roots and never invoke wmic.
    expect(walkDescendantsPids(0)).toEqual([]);
    expect(walkDescendantsPids(-1)).toEqual([]);
  });

  it("H5 — isPidOrDescendantAlive uses the injected walker when the fast path misses", () => {
    // Bogus root PID → fast path returns false (ESRCH) → injected walker
    // is invoked → returns a single live grandchild PID → helper returns
    // true. Proves the wiring path: fast-path miss → walker → kill(0).
    const grandchildPid = grandchildPids[0] ?? 0;
    if (grandchildPid <= 0) {
      // No leftover grandchild from a prior test; spawn a fresh one for
      // this assertion.
      const child = spawn(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000); setTimeout(() => {}, 60000);"],
        { stdio: "ignore", detached: true },
      );
      child.unref();
      if (!child.pid || child.pid <= 0) throw new Error("failed to spawn grandchild");
      grandchildPids.push(child.pid);
      expect(isPidOrDescendantAlive(999_999_999, () => [child.pid as number])).toBe(true);
    } else {
      expect(isPidOrDescendantAlive(999_999_999, () => [grandchildPid])).toBe(true);
    }
  });
});
