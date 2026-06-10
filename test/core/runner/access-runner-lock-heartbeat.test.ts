/**
 * Tests for the cross-process lock heartbeat fix (issue #414).
 *
 * The bug: the lock owner never refreshes the lock dir mtime, so a long-running
 * Access operation can be declared stale by a second process after CROSS_PROCESS_LOCK_STALE_MS
 * even though the first process is still legitimately holding it.
 *
 * The fix: while holding the lock the owner starts a heartbeat that touches the lock dir
 * mtime every CROSS_PROCESS_LOCK_STALE_MS / 2. This test drives the PUBLIC lock functions
 * through their observable behaviour — no assertions on internal call order or private fields.
 *
 * Technique: vi.useFakeTimers() advances the wall clock without real waits.
 * The filesystem mtime is real (tmpdir), so we can verify that the lock dir's
 * mtime was refreshed by the heartbeat using stat().
 */
import { stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import {
  AccessPowerShellRunner,
  CROSS_PROCESS_LOCK_STALE_MS,
  getCrossProcessLockPath,
  type PowerShellExecutor,
} from "../../../src/core/runner/access-runner.js";

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

/**
 * Build a unique-per-test DB path so tests don't share cross-process lock dirs.
 */
function uniqueDbPath(label: string): string {
  return join(tmpdir(), `dysflow-lock-hb-test-${label}-${Date.now()}.accdb`);
}

describe("Cross-process lock heartbeat (issue #414)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * RED test (fails before the fix):
   *
   * A lock that was last touched more than CROSS_PROCESS_LOCK_STALE_MS ago is treated as
   * stale and gets evicted by the acquire loop. But if the OWNER has a heartbeat running,
   * the lock dir mtime is periodically refreshed — so a concurrently running second
   * acquirer MUST NOT be able to steal it.
   *
   * We model this by:
   *   1. Acquiring the lock (real tmpdir) while the executor is "running" (held by a promise).
   *   2. Back-dating the lock dir mtime to look old (simulating time passing without heartbeat).
   *   3. Then immediately reading the mtime again — with a heartbeat in place, it should
   *      have been refreshed to a recent time; without the heartbeat, it remains stale.
   *
   * The test uses real filesystem ops (tmpdir) and fake timers to tick heartbeat intervals
   * without waiting real time. The observable contract is: after one heartbeat interval
   * the lock dir mtime must be recent (within 2 * CROSS_PROCESS_LOCK_STALE_MS of now).
   */
  it("heartbeat refreshes lock dir mtime so a second acquirer cannot steal a live lock", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    const dbPath = uniqueDbPath("live-lock");
    const lockPath = getCrossProcessLockPath(dbPath);

    // --- Prepare a "holding" executor that we can release manually ---
    let releaseExecutor!: () => void;
    const executorRunning = new Promise<void>((resolve) => {
      releaseExecutor = resolve;
    });

    const executor: PowerShellExecutor = async () => {
      await executorRunning;
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT {}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
      lockAcquireTimeoutMs: 5_000,
    });

    // Start the first operation — it will hold the lock while executor is awaiting
    const firstRunPromise = runner.run(
      { kind: "diagnostics", request: {} },
      {
        configSource: "explicit-request",
        allowWrites: false,
        accessDbPath: dbPath,
        timeoutMs: 10_000,
      },
    );

    // Wait for the lock dir to actually exist (first run acquired the lock)
    await vi.waitFor(async () => {
      const info = await stat(lockPath).catch(() => null);
      expect(info).not.toBeNull();
    });

    // Back-date the lock dir mtime to simulate it having been untouched for longer than STALE_MS.
    // Without a heartbeat this would make a concurrent acquirer think the lock is stale.
    const staleTime = new Date(Date.now() - CROSS_PROCESS_LOCK_STALE_MS - 5_000);
    await utimes(lockPath, staleTime, staleTime);

    // Verify the mtime is truly old before advancing timers
    const beforeHeartbeat = await stat(lockPath);
    expect(Date.now() - beforeHeartbeat.mtimeMs).toBeGreaterThan(CROSS_PROCESS_LOCK_STALE_MS);

    // Advance fake time by exactly one heartbeat interval (STALE_MS / 2).
    // The heartbeat callback fires synchronously but its utimes() call is fire-and-forget
    // (the callback does not return the promise), so advanceTimersByTimeAsync cannot await it.
    // We therefore poll the real filesystem until the mtime changes from the backdated value —
    // this is deterministic: we know the exact stale time we set and wait until it no longer
    // matches, which only happens after the utimes() write settles.
    await vi.advanceTimersByTimeAsync(CROSS_PROCESS_LOCK_STALE_MS / 2);

    // Poll (using real time via vi.waitFor) until the heartbeat write has landed on disk.
    // The staleness threshold was set at staleTime.getTime(); anything newer means the
    // heartbeat refreshed the mtime.
    await vi.waitFor(
      async () => {
        const info = await stat(lockPath);
        expect(info.mtimeMs).toBeGreaterThan(staleTime.getTime());
      },
      { timeout: 5_000, interval: 20 },
    );

    // After the heartbeat tick, the real mtime on disk must have been refreshed.
    // A second acquirer checking Date.now() - mtime > STALE_MS should now get FALSE.
    const afterHeartbeat = await stat(lockPath);
    expect(Date.now() - afterHeartbeat.mtimeMs).toBeLessThan(CROSS_PROCESS_LOCK_STALE_MS);

    // Clean up: release the executor so the first run can complete
    releaseExecutor();
    await firstRunPromise;
  });

  /**
   * After the operation completes (and the lock is released), the heartbeat timer
   * must be cleared. The lock dir is deleted on release, so a second acquirer can
   * now grab it without hitting a stale-lock eviction race.
   */
  it("heartbeat timer is cleared after the operation completes (no lingering interval)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    const dbPath = uniqueDbPath("timer-cleared");
    const lockPath = getCrossProcessLockPath(dbPath);

    let executorCallCount = 0;
    const executor: PowerShellExecutor = async () => {
      executorCallCount++;
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT {}",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/run.ps1",
      lockAcquireTimeoutMs: 5_000,
    });

    // Complete the first operation
    await runner.run(
      { kind: "diagnostics", request: {} },
      {
        configSource: "explicit-request",
        allowWrites: false,
        accessDbPath: dbPath,
        timeoutMs: 5_000,
      },
    );

    // Lock dir should be gone after release
    const infoAfterRelease = await stat(lockPath).catch(() => null);
    expect(infoAfterRelease).toBeNull();

    // Advance past many heartbeat intervals — no errors, no resurrection of the lock
    await vi.advanceTimersByTimeAsync(CROSS_PROCESS_LOCK_STALE_MS * 3);

    // Lock dir must still be absent — the cleared timer must not have re-touched it
    const infoAfterAdvance = await stat(lockPath).catch(() => null);
    expect(infoAfterAdvance).toBeNull();

    // A second run can now acquire the lock cleanly (no RUNNER_LOCK_TIMEOUT)
    const secondResult = await runner.run(
      { kind: "diagnostics", request: {} },
      {
        configSource: "explicit-request",
        allowWrites: false,
        accessDbPath: dbPath,
        timeoutMs: 5_000,
      },
    );
    expect(secondResult.ok).toBe(true);
    expect(executorCallCount).toBe(2);
  });
});
