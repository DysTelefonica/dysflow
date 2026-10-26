import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDIT_ATTEMPTS,
  DEFAULT_EDIT_TIMEOUT_MS,
  resolveEditTimeoutMs,
  runAccessEdit,
} from "../../E2E_testing/_helpers/issue-1817-edit-runner.mjs";

type Outcome = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
};

function fakeSpawn(outcomes: Outcome[]) {
  const calls: Array<{ command: string; timeout: number }> = [];
  const spawn = (command: string, _args: string[], options: { timeout: number }) => {
    calls.push({ command, timeout: options.timeout });
    const next = outcomes.shift();
    if (!next) throw new Error("spawn called more times than scripted");
    return next;
  };
  return { spawn, calls };
}

const saved: Outcome = { status: 0, stdout: "ISSUE_1817_EDIT_SAVED", stderr: "" };
const timedOut: Outcome = {
  status: null,
  stdout: "",
  stderr: "",
  error: Object.assign(new Error("spawnSync powershell.exe ETIMEDOUT"), { code: "ETIMEDOUT" }),
};

describe("issue #1898: Access edit timeout and bounded retry", () => {
  it("keeps the current 60 s default when no override is set", () => {
    expect(DEFAULT_EDIT_TIMEOUT_MS).toBe(60000);
    expect(resolveEditTimeoutMs({})).toBe(60000);
  });

  it("reads the timeout from DYSFLOW_E2E_ACCESS_EDIT_TIMEOUT_MS", () => {
    expect(resolveEditTimeoutMs({ DYSFLOW_E2E_ACCESS_EDIT_TIMEOUT_MS: "150000" })).toBe(150000);
  });

  it("rejects a non-positive or non-numeric timeout instead of silently using it", () => {
    expect(() => resolveEditTimeoutMs({ DYSFLOW_E2E_ACCESS_EDIT_TIMEOUT_MS: "0" })).toThrow(
      /positive integer/,
    );
    expect(() => resolveEditTimeoutMs({ DYSFLOW_E2E_ACCESS_EDIT_TIMEOUT_MS: "abc" })).toThrow(
      /positive integer/,
    );
  });

  it("retries once after a spawn timeout and succeeds on the second attempt", () => {
    const { spawn, calls } = fakeSpawn([timedOut, saved]);
    const result = runAccessEdit({ spawn, args: ["-Root", "x"], env: {} });
    expect(result.stdout).toContain("ISSUE_1817_EDIT_SAVED");
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.timeout === DEFAULT_EDIT_TIMEOUT_MS)).toBe(true);
  });

  it("never retries the create action after a timeout, because the database may already exist", () => {
    const { spawn, calls } = fakeSpawn([timedOut, saved]);
    const result = runAccessEdit({ spawn, args: [], env: {}, action: "create" });
    expect(result.error?.code).toBe("ETIMEDOUT");
    expect(calls).toHaveLength(1);
  });

  it("does not retry a non-timeout failure", () => {
    const failed: Outcome = { status: 1, stdout: "", stderr: "boom" };
    const { spawn, calls } = fakeSpawn([failed]);
    const result = runAccessEdit({ spawn, args: [], env: {} });
    expect(result.status).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("stops after the bounded number of attempts and returns the last timeout", () => {
    const { spawn, calls } = fakeSpawn([timedOut, timedOut, timedOut]);
    const result = runAccessEdit({ spawn, args: [], env: {} });
    expect(result.error?.code).toBe("ETIMEDOUT");
    expect(calls).toHaveLength(DEFAULT_EDIT_ATTEMPTS);
  });

  it("applies the configured timeout to every attempt", () => {
    const { spawn, calls } = fakeSpawn([timedOut, saved]);
    runAccessEdit({ spawn, args: [], env: { DYSFLOW_E2E_ACCESS_EDIT_TIMEOUT_MS: "150000" } });
    expect(calls.map((c) => c.timeout)).toEqual([150000, 150000]);
  });
});
