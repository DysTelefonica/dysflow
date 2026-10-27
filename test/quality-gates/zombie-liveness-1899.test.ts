import { describe, expect, it } from "vitest";
import {
  classifyChildLiveness,
  formatTerminationLine,
  isSameProcess,
  SPAWN_IDENTITY_SLACK_MS,
  summarizeLiveness,
} from "../../E2E_testing/_helpers/zombie-liveness.mjs";

describe("issue #1899: a live PID is the call's child only if it was created before the spawn returned", () => {
  const spawnedAtMs = 1_700_000_000_000;

  it("reports reused for a process created after the spawn (PID reuse, run 40286564767)", () => {
    const row = { creationMs: spawnedAtMs + SPAWN_IDENTITY_SLACK_MS + 1 };
    expect(isSameProcess({ spawnedAtMs, row })).toBe("reused");
  });

  it("reports same for a process created before the spawn returned", () => {
    expect(isSameProcess({ spawnedAtMs, row: { creationMs: spawnedAtMs - 5 } })).toBe("same");
  });

  it("reports same inside the clock slack (no false reuse from clock granularity)", () => {
    const row = { creationMs: spawnedAtMs + SPAWN_IDENTITY_SLACK_MS };
    expect(isSameProcess({ spawnedAtMs, row })).toBe("same");
  });

  it("reports unknown when the creation time or the spawn time is missing", () => {
    expect(isSameProcess({ spawnedAtMs, row: null })).toBe("unknown");
    expect(isSameProcess({ spawnedAtMs, row: { creationMs: null } })).toBe("unknown");
    expect(isSameProcess({ spawnedAtMs: undefined, row: { creationMs: spawnedAtMs } })).toBe(
      "unknown",
    );
  });
});

describe("issue #1899: a live PID counts as the call's child only if its image is the call's wrapper", () => {
  it("reports dead when the probe fails, whatever the image", () => {
    expect(classifyChildLiveness({ alive: false, imageName: "conhost.exe" })).toBe("dead");
  });

  it("reports alive for the shell wrapper and the MCP node process the harness spawns", () => {
    expect(classifyChildLiveness({ alive: true, imageName: "cmd.exe" })).toBe("alive");
    expect(classifyChildLiveness({ alive: true, imageName: "node.exe" })).toBe("alive");
  });

  it("reports reused for a live PID whose image is not the wrapper (PID reuse, run 40286564767)", () => {
    expect(classifyChildLiveness({ alive: true, imageName: "conhost.exe" })).toBe("reused");
  });

  it("stays alive when the image cannot be read (fail closed)", () => {
    expect(classifyChildLiveness({ alive: true, imageName: null })).toBe("alive");
  });
});

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
