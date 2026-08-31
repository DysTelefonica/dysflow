// @ts-nocheck — the imported helpers have no .d.mts yet; the runtime
// contract is exercised by vitest and pinned by these tests.
//
// Issue #1692 — #1690 fixed the probe's correctness and, in doing so, put a
// 0.55s PowerShell/CIM call on the E2E hot path. `isPidOrDescendantAlive`
// reaches the walker on the HEALTHY branch (the child exited, so
// `process.kill` throws), and `waitForNoOwnPids` polls that check every 100ms,
// twice per tool, across the whole advertised surface. The battery went from
// 13m18s to past the 30-minute job cap.
//
// The call volume was always there; the broken `wmic` probe just answered in
// milliseconds because "command not found" is cheap. These tests pin the
// snapshot cache that makes the corrected probe affordable, and pin the
// guarantee that caching candidates never fabricates a live process.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPidOrDescendantAlive,
  resetDescendantWalkDiagnostics,
  walkDescendantsPids,
} from "../../E2E_testing/_helpers/mcp-e2e-record.mjs";

const TABLE = ['"ProcessId","ParentProcessId"', '"200","100"', '"300","200"'].join("\r\n");

describe("descendant walk snapshot cache (#1692)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDescendantWalkDiagnostics();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("probes the process table once for a burst of walks", () => {
    let probes = 0;
    const probe = () => {
      probes += 1;
      return TABLE;
    };

    walkDescendantsPids(100, probe);
    walkDescendantsPids(100, probe);
    walkDescendantsPids(200, probe);

    expect(
      probes,
      "a poll burst must share one snapshot instead of paying for the probe per check",
    ).toBe(1);
  });

  it("still answers correctly from the shared snapshot", () => {
    const probe = () => TABLE;

    expect(walkDescendantsPids(100, probe).sort()).toEqual([200, 300]);
    expect(walkDescendantsPids(200, probe)).toEqual([300]);
    expect(walkDescendantsPids(300, probe)).toEqual([]);
  });

  it("re-probes once the snapshot goes stale", () => {
    let probes = 0;
    const probe = () => {
      probes += 1;
      return TABLE;
    };

    walkDescendantsPids(100, probe);
    vi.advanceTimersByTime(60_000);
    walkDescendantsPids(100, probe);

    expect(probes, "a long-lived suite must not answer from an ancient snapshot").toBe(2);
  });

  it("drops the snapshot when the diagnostics are reset", () => {
    let probes = 0;
    const probe = () => {
      probes += 1;
      return TABLE;
    };

    walkDescendantsPids(100, probe);
    resetDescendantWalkDiagnostics();
    walkDescendantsPids(100, probe);

    expect(probes).toBe(2);
  });

  it("never reports a cached-but-dead descendant as alive", () => {
    // The snapshot supplies CANDIDATES; liveness stays a live `process.kill`
    // check. A row for a process that has since exited must not manufacture a
    // zombie, or the suite would start failing on ghosts.
    const deadDescendant = 999_999_998;
    const staleWalker = () => [deadDescendant];

    expect(isPidOrDescendantAlive(999_999_999, staleWalker)).toBe(false);
  });
});
