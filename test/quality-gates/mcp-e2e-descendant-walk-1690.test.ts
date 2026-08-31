// @ts-nocheck — the imported helpers have no .d.mts yet; the runtime
// contract is exercised by vitest and pinned by these tests.
//
// Issue #1690 — the descendant walk used `wmic`, which Microsoft removed from
// Windows 11 24H2 onward. On the self-hosted runner (build 26200) every call
// threw, the fail-open `catch` returned `[]`, and the suite silently degraded
// to parent-only zombie detection while still printing `clean`. The v4.2.5
// release log carried hundreds of `"wmic" no se reconoce...` lines because
// `execSync` forwards the probe's stderr to the parent by default.
//
// `mcp-e2e-grandchild-zombie.test.ts` proves the *wiring* by injecting a fake
// walker, which is why the rot went unnoticed for so long: nothing exercised
// the real probe. These tests do, and they name the degradation instead of
// letting it pass as a clean verdict.
import { spawn } from "node:child_process";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  getDescendantWalkDiagnostics,
  resetDescendantWalkDiagnostics,
  walkDescendantsPids,
} from "../../E2E_testing/_helpers/mcp-e2e-record.mjs";

const onWindows = process.platform === "win32";
const spawned: number[] = [];

/** Spawns a detached, idle child of THIS process and returns its pid. */
function spawnIdleChild(): number {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000);"], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  if (!child.pid) throw new Error("failed to spawn the probe child");
  spawned.push(child.pid);
  return child.pid;
}

afterAll(() => {
  for (const pid of spawned) {
    try {
      process.kill(pid);
    } catch {
      /* already gone */
    }
  }
});

describe("descendant walk probe (#1690)", () => {
  beforeEach(() => {
    resetDescendantWalkDiagnostics();
  });

  it.runIf(onWindows)("finds a real live child of the current process", () => {
    const childPid = spawnIdleChild();

    const descendants = walkDescendantsPids(process.pid);

    expect(
      descendants,
      "the real probe must enumerate the live process table, not fail open to []",
    ).toContain(childPid);
  });

  it.runIf(onWindows)("reports the walk as available after a successful probe", () => {
    walkDescendantsPids(process.pid);

    expect(getDescendantWalkDiagnostics()).toEqual({ available: true, reason: null });
  });

  it("records a reason when the probe is unavailable instead of swallowing it", () => {
    const failingProbe = () => {
      throw new Error("'someprobe' is not recognized as an internal or external command");
    };

    expect(walkDescendantsPids(4242, failingProbe)).toEqual([]);

    const diagnostics = getDescendantWalkDiagnostics();
    expect(diagnostics.available).toBe(false);
    expect(diagnostics.reason).toMatch(/not recognized/i);
  });

  it("keeps the unavailability reason stable across repeated failures", () => {
    let calls = 0;
    const failingProbe = () => {
      calls += 1;
      throw new Error(`probe failure ${calls}`);
    };

    walkDescendantsPids(4242, failingProbe);
    walkDescendantsPids(4243, failingProbe);

    // The suite reports the degradation once per run; the reason must name the
    // first failure rather than churn on every check.
    expect(getDescendantWalkDiagnostics().reason).toContain("probe failure 1");
  });

  it("still short-circuits bogus roots without probing at all", () => {
    let probed = false;
    const probe = () => {
      probed = true;
      return "";
    };

    expect(walkDescendantsPids(0, probe)).toEqual([]);
    expect(walkDescendantsPids(-1, probe)).toEqual([]);
    expect(probed).toBe(false);
    expect(getDescendantWalkDiagnostics()).toEqual({ available: true, reason: null });
  });

  it("parses the probe table by header name, not by column position", () => {
    // ConvertTo-Csv emits a quoted header. Column order must not be assumed:
    // the previous wmic parser hard-coded parts[1]/parts[2] and would silently
    // invert parent and child if the projection ever changed.
    const table = ['"ParentProcessId","ProcessId"', '"100","200"', '"200","300"'].join("\r\n");

    expect(walkDescendantsPids(100, () => table).sort()).toEqual([200, 300]);
  });

  it("ignores rows whose ids are not finite numbers", () => {
    const table = ['"ProcessId","ParentProcessId"', '"200","100"', '"","100"', '"junk","100"'].join(
      "\r\n",
    );

    expect(walkDescendantsPids(100, () => table)).toEqual([200]);
  });
});
