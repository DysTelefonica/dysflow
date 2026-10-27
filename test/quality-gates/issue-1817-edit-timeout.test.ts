import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDIT_ATTEMPTS,
  DEFAULT_EDIT_TIMEOUT_MS,
  removePartialFixtureDatabase,
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

  it("never retries the create action without a way to remove the partial database", () => {
    const { spawn, calls } = fakeSpawn([timedOut, saved]);
    const result = runAccessEdit({ spawn, args: [], env: {}, action: "create" });
    expect(result.error?.code).toBe("ETIMEDOUT");
    expect(calls).toHaveLength(1);
    expect(result.diagnosis).toMatch(/create/);
  });

  // #1974: one hung Access start during `create` aborted the whole release battery.
  it("removes the partial fixture database and retries create once after a timeout", () => {
    const { spawn, calls } = fakeSpawn([timedOut, saved]);
    const resets: number[] = [];
    const result = runAccessEdit({
      spawn,
      args: [],
      env: {},
      action: "create",
      resetCreate: () => {
        resets.push(calls.length);
      },
    });
    expect(result.stdout).toContain("ISSUE_1817_EDIT_SAVED");
    expect(calls).toHaveLength(2);
    expect(resets).toEqual([1]);
  });

  it("names the hung create start and its elapsed time when the retry also times out", () => {
    const { spawn, calls } = fakeSpawn([timedOut, timedOut, saved]);
    let clock = 0;
    const result = runAccessEdit({
      spawn: (command, args, options) => {
        clock += 60000;
        return spawn(command, args, options);
      },
      args: [],
      env: {},
      action: "create",
      resetCreate: () => {},
      now: () => clock,
    });
    expect(calls).toHaveLength(2);
    expect(result.error?.code).toBe("ETIMEDOUT");
    expect(result.diagnosis).toContain("action=create");
    expect(result.diagnosis).toContain("attempt 2/2");
    expect(result.diagnosis).toContain("elapsedMs=120000");
    expect(result.diagnosis).toMatch(/Access start hung/);
  });

  it("does not retry create when removing the partial database fails, and reports why", () => {
    const { spawn, calls } = fakeSpawn([timedOut, saved]);
    const result = runAccessEdit({
      spawn,
      args: [],
      env: {},
      action: "create",
      resetCreate: () => {
        throw new Error("EBUSY: Fixture.accdb is locked");
      },
    });
    expect(calls).toHaveLength(1);
    expect(result.diagnosis).toContain("EBUSY");
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

describe("issue #1974: partial fixture removal stays inside the disposable fixture", () => {
  const tmp = "C:\\Users\\x\\AppData\\Local\\Temp";
  const root = `${tmp}\\dysflow-issue-1817-abc\\export_modules`;

  function fakeFs(existing: string[]) {
    const removed: string[] = [];
    return {
      removed,
      fs: {
        exists: (path: string) => existing.includes(path),
        remove: (path: string) => {
          removed.push(path);
        },
      },
    };
  }

  it("removes only the fixture database and its lock file from a marked root under TEMP", () => {
    const { fs, removed } = fakeFs([
      `${root}\\.issue-1817-fixture`,
      `${root}\\Fixture.accdb`,
      `${root}\\Fixture.laccdb`,
    ]);
    removePartialFixtureDatabase({ root, tmpDir: tmp, ...fs });
    expect(removed).toEqual([`${root}\\Fixture.accdb`, `${root}\\Fixture.laccdb`]);
  });

  it("refuses a root outside TEMP", () => {
    const { fs, removed } = fakeFs(["C:\\work\\.issue-1817-fixture", "C:\\work\\Fixture.accdb"]);
    expect(() => removePartialFixtureDatabase({ root: "C:\\work", tmpDir: tmp, ...fs })).toThrow(
      /marked disposable fixture/,
    );
    expect(removed).toEqual([]);
  });

  it("refuses a root under TEMP without the fixture marker", () => {
    const { fs, removed } = fakeFs([`${root}\\Fixture.accdb`]);
    expect(() => removePartialFixtureDatabase({ root, tmpDir: tmp, ...fs })).toThrow(
      /marked disposable fixture/,
    );
    expect(removed).toEqual([]);
  });

  it("refuses a sibling directory that only shares the TEMP prefix", () => {
    const outside = `${tmp}2\\dysflow-issue-1817-abc`;
    const { fs, removed } = fakeFs([
      `${outside}\\.issue-1817-fixture`,
      `${outside}\\Fixture.accdb`,
    ]);
    expect(() => removePartialFixtureDatabase({ root: outside, tmpDir: tmp, ...fs })).toThrow(
      /marked disposable fixture/,
    );
    expect(removed).toEqual([]);
  });
});
