import { describe, expect, it } from "vitest";
import {
  formatTerminationLine,
  summarizeLiveness,
} from "../../E2E_testing/_helpers/zombie-liveness.mjs";

describe("issue #1899: liveness samples and termination record for a failing zombie-check", () => {
  it("reports the first instant the child stops answering", () => {
    const summary = summarizeLiveness([
      { atMs: 0, alive: true },
      { atMs: 50, alive: true },
      { atMs: 100, alive: false },
      { atMs: 150, alive: false },
    ]);
    expect(summary).toEqual({ firstDeadAtMs: 100, aliveAtEnd: false, sampleCount: 4 });
  });

  it("reports no death instant when the child still answers at the end of the window", () => {
    const summary = summarizeLiveness([
      { atMs: 0, alive: true },
      { atMs: 50, alive: true },
    ]);
    expect(summary).toEqual({ firstDeadAtMs: null, aliveAtEnd: true, sampleCount: 2 });
  });

  it("does not treat a later revival as a death instant (first death wins)", () => {
    const summary = summarizeLiveness([
      { atMs: 0, alive: false },
      { atMs: 50, alive: true },
    ]);
    expect(summary.firstDeadAtMs).toBe(0);
  });

  it("formats the taskkill exit, the guard expiry and the liveness in one line", () => {
    const line = formatTerminationLine({
      tool: "list_access_files:error-envelope-remediation",
      childPid: 31796,
      taskkillExit: 128,
      guardExpired: false,
      terminationMs: 412,
      liveness: { firstDeadAtMs: 250, aliveAtEnd: false, sampleCount: 6 },
    });
    expect(line).toBe(
      "ZOMBIE-TIMING tool=list_access_files:error-envelope-remediation childPid=31796 taskkillExit=128 guardExpired=false terminationMs=412 firstDeadAtMs=250 aliveAtEnd=false samples=6",
    );
  });

  it("states an unknown taskkill exit and a guard expiry explicitly", () => {
    const line = formatTerminationLine({
      tool: "t",
      childPid: 7,
      taskkillExit: null,
      guardExpired: true,
      terminationMs: 3000,
      liveness: { firstDeadAtMs: null, aliveAtEnd: true, sampleCount: 20 },
    });
    expect(line).toContain("taskkillExit=none");
    expect(line).toContain("guardExpired=true");
    expect(line).toContain("firstDeadAtMs=none");
    expect(line).toContain("aliveAtEnd=true");
  });
});
