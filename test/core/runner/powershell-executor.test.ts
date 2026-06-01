import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import {
  POWERSHELL_SYSTEM_ENV_KEYS,
  spawnPowerShellProcess,
} from "../../../src/core/runner/powershell-executor.js";

const originalSystemRoot = process.env.SystemRoot;

beforeEach(() => {
  process.env.SECRET_TOKEN = "should-not-leak";
  process.env.SystemRoot = "C:\\Windows";

  mockSpawn.mockImplementation(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: (event: string, cb: (code: number) => void) => {
      if (event === "close") cb(0);
    },
    kill: vi.fn(),
  }));
});

afterEach(() => {
  delete process.env.SECRET_TOKEN;
  if (originalSystemRoot === undefined) {
    delete process.env.SystemRoot;
  } else {
    process.env.SystemRoot = originalSystemRoot;
  }
  mockSpawn.mockReset();
});

const spawnOptions = (): { env?: Record<string, unknown> } =>
  (mockSpawn.mock.calls.at(0)?.[2] as { env?: Record<string, unknown> }) ?? {};

describe("spawnPowerShellProcess — child env construction", () => {
  it("does NOT forward non-allowlisted host secrets to the child process", async () => {
    await spawnPowerShellProcess({
      args: ["-Command", "exit 0"],
      timeoutMs: 5_000,
    });

    expect(spawnOptions().env).toBeDefined();
    expect(spawnOptions().env?.SECRET_TOKEN).toBeUndefined();
  });

  it("forwards allowlisted system vars that are present in process.env", async () => {
    await spawnPowerShellProcess({
      args: ["-Command", "exit 0"],
      timeoutMs: 5_000,
    });

    expect(spawnOptions().env).toBeDefined();
    expect(spawnOptions().env?.SystemRoot).toBe("C:\\Windows");
  });

  it("forwards caller-supplied options.env overrides to the child process", async () => {
    await spawnPowerShellProcess({
      args: ["-Command", "exit 0"],
      timeoutMs: 5_000,
      env: { DYSFLOW_ACCESS_PASSWORD: "secret-pass" },
    });

    expect(spawnOptions().env).toBeDefined();
    expect(spawnOptions().env?.DYSFLOW_ACCESS_PASSWORD).toBe("secret-pass");
  });

  it("does not inject undefined string values for allowlisted keys absent from process.env", async () => {
    const saved = process.env.COMPUTERNAME;
    delete process.env.COMPUTERNAME;

    try {
      await spawnPowerShellProcess({
        args: ["-Command", "exit 0"],
        timeoutMs: 5_000,
      });

      const capturedOptions = spawnOptions() as { env?: Record<string, string> };
      expect(capturedOptions.env).toBeDefined();
      // Either the key is absent, or if present its value must not be the string "undefined"
      const val = capturedOptions.env?.COMPUTERNAME;
      expect(val).not.toBe("undefined");
      if (val !== undefined) {
        expect(typeof val).toBe("string");
      }
    } finally {
      if (saved !== undefined) {
        process.env.COMPUTERNAME = saved;
      }
    }
  });
});

describe("spawnPowerShellProcess — bounded timeout settlement", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves a timeout result when kill does not produce a close event", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T10:00:00.000Z"));
    const kill = vi.fn();
    mockSpawn.mockImplementation(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill,
    }));

    const resultPromise = spawnPowerShellProcess({
      args: ["-Command", "Start-Sleep 60"],
      timeoutMs: 250,
    });
    let settled = false;
    resultPromise.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(kill).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
    await expect(resultPromise).resolves.toMatchObject({
      exitCode: null,
      timedOut: true,
      durationMs: 250,
    });
  });

  it("resolves an aborted execution when kill does not produce a close event", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T10:00:00.000Z"));
    const kill = vi.fn();
    mockSpawn.mockImplementation(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill,
    }));
    const controller = new AbortController();

    const resultPromise = spawnPowerShellProcess({
      args: ["-Command", "Start-Sleep 60"],
      timeoutMs: 1_000,
      signal: controller.signal,
    });
    let settled = false;
    resultPromise.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(125);
    controller.abort();
    await Promise.resolve();

    expect(kill).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
    await expect(resultPromise).resolves.toMatchObject({
      exitCode: null,
      timedOut: true,
      durationMs: 125,
    });
  });
});

describe("spawnPowerShellProcess — tree-kill on Windows", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("spawns taskkill /T /F /PID when child has a pid on timeout", async () => {
    vi.useFakeTimers();
    const kill = vi.fn();
    let taskkillCloseCallback: ((code: number) => void) | undefined;
    mockSpawn.mockImplementation((cmd: string) => {
      if (cmd === "taskkill") {
        return {
          pid: undefined,
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: (event: string, cb: (code: number) => void) => {
            if (event === "close") taskkillCloseCallback = cb;
          },
        };
      }
      return { pid: 9999, stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn(), kill };
    });

    const resultPromise = spawnPowerShellProcess({
      args: ["-Command", "Start-Sleep 60"],
      timeoutMs: 250,
    });

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    const taskkillCall = mockSpawn.mock.calls.find((c) => c[0] === "taskkill");
    expect(taskkillCall).toBeDefined();
    expect(taskkillCall?.[1]).toEqual(["/T", "/F", "/PID", "9999"]);
    expect(kill).not.toHaveBeenCalled();

    // Fire taskkill close so the awaited kill resolves
    taskkillCloseCallback?.(0);
    await Promise.resolve();
    await Promise.resolve();

    await expect(resultPromise).resolves.toMatchObject({ timedOut: true, exitCode: null });
  });

  it("spawns taskkill /T /F /PID when child has a pid on abort", async () => {
    vi.useFakeTimers();
    const kill = vi.fn();
    let taskkillCloseCallback: ((code: number) => void) | undefined;
    mockSpawn.mockImplementation((cmd: string) => {
      if (cmd === "taskkill") {
        return {
          pid: undefined,
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: (event: string, cb: (code: number) => void) => {
            if (event === "close") taskkillCloseCallback = cb;
          },
        };
      }
      return { pid: 8888, stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn(), kill };
    });
    const controller = new AbortController();

    const resultPromise = spawnPowerShellProcess({
      args: ["-Command", "Start-Sleep 60"],
      timeoutMs: 5_000,
      signal: controller.signal,
    });

    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await Promise.resolve();

    const taskkillCall = mockSpawn.mock.calls.find((c) => c[0] === "taskkill");
    expect(taskkillCall).toBeDefined();
    expect(taskkillCall?.[1]).toEqual(["/T", "/F", "/PID", "8888"]);
    expect(kill).not.toHaveBeenCalled();

    // Fire taskkill close so the awaited kill resolves
    taskkillCloseCallback?.(0);
    await Promise.resolve();
    await Promise.resolve();

    await expect(resultPromise).resolves.toMatchObject({ timedOut: true, exitCode: null });
  });

  it("falls back to child.kill() when child has no pid", async () => {
    vi.useFakeTimers();
    const kill = vi.fn();
    mockSpawn.mockImplementation(() => ({
      pid: undefined,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill,
    }));

    const resultPromise = spawnPowerShellProcess({
      args: ["-Command", "Start-Sleep 60"],
      timeoutMs: 250,
    });

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(kill).toHaveBeenCalledTimes(1);
    const taskkillCall = mockSpawn.mock.calls.find((c) => c[0] === "taskkill");
    expect(taskkillCall).toBeUndefined();
    await expect(resultPromise).resolves.toMatchObject({ timedOut: true });
  });
});

describe("spawnPowerShellProcess — awaited kill settlement (Goal C)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("result settles only after taskkill close event fires on timeout (not fire-and-forget)", async () => {
    vi.useFakeTimers();
    let taskkillCloseCallback: ((code: number) => void) | undefined;
    mockSpawn.mockImplementation((cmd: string) => {
      if (cmd === "taskkill") {
        return {
          pid: 77777,
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: (event: string, cb: (code: number) => void) => {
            if (event === "close") {
              // Hold the close callback — fire it manually to simulate taskkill completing
              taskkillCloseCallback = cb;
            }
          },
        };
      }
      return {
        pid: 9999,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
    });

    const resultPromise = spawnPowerShellProcess({
      args: ["-Command", "Start-Sleep 60"],
      timeoutMs: 250,
    });
    let settled = false;
    resultPromise.then(() => {
      settled = true;
    });

    // Trigger the timeout
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    // taskkill was spawned but its close event has NOT fired yet
    expect(taskkillCloseCallback).toBeDefined();
    // Result must not have settled yet (taskkill still running)
    expect(settled).toBe(false);

    // Now fire the taskkill close event — result must settle after this
    taskkillCloseCallback?.(0);
    // Flush microtask chain: inner Promise resolve → killProcessTree resolves →
    // .then(finish) → outer Promise resolves → resultPromise.then(settled = true)
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(settled).toBe(true);
    await expect(resultPromise).resolves.toMatchObject({ timedOut: true, exitCode: null });
  });

  it("result settles only after taskkill close event fires on abort", async () => {
    vi.useFakeTimers();
    let taskkillCloseCallback: ((code: number) => void) | undefined;
    mockSpawn.mockImplementation((cmd: string) => {
      if (cmd === "taskkill") {
        return {
          pid: 88888,
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: (event: string, cb: (code: number) => void) => {
            if (event === "close") {
              taskkillCloseCallback = cb;
            }
          },
        };
      }
      return {
        pid: 8888,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
    });
    const controller = new AbortController();

    const resultPromise = spawnPowerShellProcess({
      args: ["-Command", "Start-Sleep 60"],
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    let settled = false;
    resultPromise.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(125);
    controller.abort();
    await Promise.resolve();

    // taskkill was spawned but its close event has NOT fired yet
    expect(taskkillCloseCallback).toBeDefined();
    expect(settled).toBe(false);

    // Fire taskkill close — flush microtask chain
    taskkillCloseCallback?.(0);
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(settled).toBe(true);
    await expect(resultPromise).resolves.toMatchObject({ timedOut: true, exitCode: null });
  });

  it("settles within kill-bound even if taskkill never closes (stuck taskkill guard)", async () => {
    vi.useFakeTimers();
    mockSpawn.mockImplementation((cmd: string) => {
      if (cmd === "taskkill") {
        return {
          pid: 55555,
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          // Never fires close — simulates a stuck taskkill
          on: vi.fn(),
        };
      }
      return {
        pid: 9999,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };
    });

    const resultPromise = spawnPowerShellProcess({
      args: ["-Command", "Start-Sleep 60"],
      timeoutMs: 250,
    });
    let settled = false;
    resultPromise.then(() => {
      settled = true;
    });

    // Timeout fires
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    // Kill bound: should settle within a bounded extra time even if taskkill never closes
    // The bound is expected to be at most a few seconds; advance fake timers by 5s
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(true);
    await expect(resultPromise).resolves.toMatchObject({ timedOut: true, exitCode: null });
  });

  it("falls back to child.kill() (no pid path) and settles immediately without awaiting taskkill", async () => {
    vi.useFakeTimers();
    const kill = vi.fn();
    mockSpawn.mockImplementation(() => ({
      pid: undefined,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill,
    }));

    const resultPromise = spawnPowerShellProcess({
      args: ["-Command", "Start-Sleep 60"],
      timeoutMs: 250,
    });
    let settled = false;
    resultPromise.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(kill).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
    await expect(resultPromise).resolves.toMatchObject({ timedOut: true });
  });
});

describe("POWERSHELL_SYSTEM_ENV_KEYS", () => {
  it("is a non-empty readonly string array containing required Windows system keys", () => {
    expect(Array.isArray(POWERSHELL_SYSTEM_ENV_KEYS)).toBe(true);
    expect(POWERSHELL_SYSTEM_ENV_KEYS.length).toBeGreaterThan(0);

    const required = ["SystemRoot", "PATH", "TEMP", "USERNAME"];
    for (const key of required) {
      expect(POWERSHELL_SYSTEM_ENV_KEYS).toContain(key);
    }
  });

  it("includes the full minimum set specified in the spec", () => {
    const minimumSet = [
      "SystemRoot",
      "windir",
      "PATH",
      "PATHEXT",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "USERNAME",
      "COMPUTERNAME",
      "LOCALAPPDATA",
      "APPDATA",
      "HOMEDRIVE",
      "HOMEPATH",
    ] as const;

    for (const key of minimumSet) {
      expect(POWERSHELL_SYSTEM_ENV_KEYS).toContain(key);
    }
  });
});
