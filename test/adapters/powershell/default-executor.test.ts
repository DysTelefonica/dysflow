import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import {
  createDefaultPowerShellExecutor,
  POWERSHELL_SYSTEM_ENV_KEYS,
  spawnPowerShellProcess,
} from "../../../src/adapters/powershell/default-executor.js";

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

describe("spawnPowerShellProcess — spawn security options", () => {
  it("spawns with shell:false so args are never shell-interpolated", async () => {
    await spawnPowerShellProcess({
      args: ["-Command", "exit 0"],
      timeoutMs: 5_000,
    });

    // The third argument to spawn() is the options object.
    const capturedOptions = mockSpawn.mock.calls.at(0)?.[2] as { shell?: unknown };
    expect(capturedOptions).toBeDefined();
    expect(capturedOptions.shell).toBe(false);
  });
});

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

    if (process.platform === "win32") {
      const taskkillCall = mockSpawn.mock.calls.find((c) => c[0] === "taskkill");
      expect(taskkillCall).toBeDefined();
      expect(taskkillCall?.[1]).toEqual(["/T", "/F", "/PID", "9999"]);
      expect(kill).not.toHaveBeenCalled();

      // Fire taskkill close so the awaited kill resolves
      taskkillCloseCallback?.(0);
      await Promise.resolve();
      await Promise.resolve();
    } else {
      // On non-Windows, taskkill is never spawned; child.kill() is used instead
      const taskkillCall = mockSpawn.mock.calls.find((c) => c[0] === "taskkill");
      expect(taskkillCall).toBeUndefined();
      expect(kill).toHaveBeenCalledTimes(1);
    }

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

    if (process.platform === "win32") {
      const taskkillCall = mockSpawn.mock.calls.find((c) => c[0] === "taskkill");
      expect(taskkillCall).toBeDefined();
      expect(taskkillCall?.[1]).toEqual(["/T", "/F", "/PID", "8888"]);
      expect(kill).not.toHaveBeenCalled();

      // Fire taskkill close so the awaited kill resolves
      taskkillCloseCallback?.(0);
      await Promise.resolve();
      await Promise.resolve();
    } else {
      // On non-Windows, taskkill is never spawned; child.kill() is used instead
      const taskkillCall = mockSpawn.mock.calls.find((c) => c[0] === "taskkill");
      expect(taskkillCall).toBeUndefined();
      expect(kill).toHaveBeenCalledTimes(1);
    }

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

    if (process.platform === "win32") {
      // taskkill was spawned but its close event has NOT fired yet
      expect(taskkillCloseCallback).toBeDefined();
      // Result must not have settled yet (taskkill still running)
      expect(settled).toBe(false);

      // Now fire the taskkill close event — result must settle after this
      taskkillCloseCallback?.(0);
      // Flush microtask chain: inner Promise resolve → killProcessTree resolves →
      // .then(finish) → outer Promise resolves → resultPromise.then(settled = true)
      for (let i = 0; i < 8; i++) await Promise.resolve();
    } else {
      // On non-Windows, child.kill() is called synchronously in the timeout handler,
      // so settlement is immediate — taskkillCloseCallback is never populated
      expect(taskkillCloseCallback).toBeUndefined();
    }

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

    if (process.platform === "win32") {
      // taskkill was spawned but its close event has NOT fired yet
      expect(taskkillCloseCallback).toBeDefined();
      expect(settled).toBe(false);

      // Fire taskkill close — flush microtask chain
      taskkillCloseCallback?.(0);
      for (let i = 0; i < 8; i++) await Promise.resolve();
    } else {
      // On non-Windows, child.kill() is called synchronously in the abort handler,
      // so settlement is immediate — taskkillCloseCallback is never populated
      expect(taskkillCloseCallback).toBeUndefined();
    }

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

describe("createDefaultPowerShellExecutor — stderr marker chunk-boundary handling", () => {
  type StderrDataCb = (chunk: Buffer) => void;
  type CloseCb = (code: number) => void;

  /**
   * Mock a child whose stderr emits caller-controlled chunks and whose close event
   * is fired manually, so a test can split a marker line across chunk boundaries.
   */
  const installControllableChild = (): {
    emitStderr: (text: string) => void;
    close: (code?: number) => void;
  } => {
    let stderrCb: StderrDataCb | undefined;
    let closeCb: CloseCb | undefined;
    mockSpawn.mockImplementation(() => ({
      pid: 4321,
      stdout: { on: vi.fn() },
      stderr: {
        on: (event: string, cb: StderrDataCb) => {
          if (event === "data") stderrCb = cb;
        },
      },
      on: (event: string, cb: CloseCb) => {
        if (event === "close") closeCb = cb;
      },
      kill: vi.fn(),
    }));
    return {
      emitStderr: (text: string) => stderrCb?.(Buffer.from(text, "utf8")),
      close: (code = 0) => closeCb?.(code),
    };
  };

  it("captures an access-process marker even when the line is split across two chunks", async () => {
    const child = installControllableChild();
    const captured: unknown[] = [];
    const executor = createDefaultPowerShellExecutor();

    const resultPromise = executor("powershell.exe", ["-Command", "x"], {
      timeoutMs: 5_000,
      operationId: "op-chunk",
      accessPath: "C:/demo.accdb",
      onAccessProcessCaptured: async (proc) => {
        captured.push(proc);
      },
    });

    // The marker JSON is split right in the middle — the first chunk alone is invalid JSON.
    child.emitStderr('DYSFLOW_ACCESS_PROCESS {"pid":9876,"proce');
    child.emitStderr('ssStartTime":"2026-06-12T00:00:00.000Z","commandLine":"MSACCESS.EXE x"}\n');
    child.close(0);

    await resultPromise;

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ pid: 9876, commandLine: "MSACCESS.EXE x" });
  });

  it("captures a marker that arrives without a trailing newline before the stream ends", async () => {
    const child = installControllableChild();
    const captured: unknown[] = [];
    const executor = createDefaultPowerShellExecutor();

    const resultPromise = executor("powershell.exe", ["-Command", "x"], {
      timeoutMs: 5_000,
      operationId: "op-flush",
      accessPath: "C:/demo.accdb",
      onAccessProcessCaptured: async (proc) => {
        captured.push(proc);
      },
    });

    child.emitStderr('DYSFLOW_ACCESS_PROCESS {"pid":5555,');
    child.emitStderr('"processStartTime":null}');
    child.close(0);

    await resultPromise;

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ pid: 5555, processStartTime: null });
  });

  it("keeps genuine (non-marker) stderr content in the result", async () => {
    const child = installControllableChild();
    const executor = createDefaultPowerShellExecutor();

    const resultPromise = executor("powershell.exe", ["-Command", "x"], {
      timeoutMs: 5_000,
      operationId: "op-stderr",
      accessPath: "C:/demo.accdb",
      onAccessProcessCaptured: async () => undefined,
    });

    child.emitStderr("boom: something failed\n");
    child.close(1);

    const result = await resultPromise;
    expect(result.stderr).toContain("boom: something failed");
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

// ---------------------------------------------------------------------------
// #735 — powershellWorkerPid exposure
// ---------------------------------------------------------------------------

describe("spawnPowerShellProcess — returns powershellWorkerPid", () => {
  it("exposes child.pid as powershellWorkerPid in the result", async () => {
    mockSpawn.mockImplementation(() => ({
      pid: 42,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: (event: string, cb: (code: number) => void) => {
        if (event === "close") cb(0);
      },
      kill: vi.fn(),
    }));

    const result = await spawnPowerShellProcess({
      args: ["-Command", "exit 0"],
      timeoutMs: 5_000,
    });

    expect(result.powershellWorkerPid).toBe(42);
  });

  it("returns undefined powershellWorkerPid when child.pid is undefined", async () => {
    mockSpawn.mockImplementation(() => ({
      // pid is not set — simulates spawn() returning before pid is assigned
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: (event: string, cb: (code: number) => void) => {
        if (event === "close") cb(0);
      },
      kill: vi.fn(),
    }));

    const result = await spawnPowerShellProcess({
      args: ["-Command", "exit 0"],
      timeoutMs: 5_000,
    });

    expect(result.powershellWorkerPid).toBeUndefined();
  });
});

describe("createDefaultPowerShellExecutor — includes powershellWorkerPid", () => {
  it("returns powershellWorkerPid from the spawned child", async () => {
    mockSpawn.mockImplementation(() => ({
      pid: 42,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: (event: string, cb: (code: number) => void) => {
        if (event === "close") cb(0);
      },
      kill: vi.fn(),
    }));

    const executor = createDefaultPowerShellExecutor();
    const result = await executor("powershell.exe", ["-Command", "exit 0"], {
      timeoutMs: 5_000,
      operationId: "test-op",
      accessPath: "C:\\test.accdb",
      onAccessProcessCaptured: async () => {},
    });

    expect(result.powershellWorkerPid).toBe(42);
  });
});
