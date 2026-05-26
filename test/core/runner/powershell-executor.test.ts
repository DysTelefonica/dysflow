import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import {
  POWERSHELL_SYSTEM_ENV_KEYS,
  spawnPowerShellProcess,
} from "../../../src/core/runner/powershell-executor.js";

const originalSystemRoot = process.env["SystemRoot"];

beforeEach(() => {
  process.env["SECRET_TOKEN"] = "should-not-leak";
  process.env["SystemRoot"] = "C:\\Windows";

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
  delete process.env["SECRET_TOKEN"];
  if (originalSystemRoot === undefined) {
    delete process.env["SystemRoot"];
  } else {
    process.env["SystemRoot"] = originalSystemRoot;
  }
  mockSpawn.mockReset();
});

describe("spawnPowerShellProcess — child env construction", () => {
  it("does NOT forward non-allowlisted host secrets to the child process", async () => {
    await spawnPowerShellProcess({
      args: ["-Command", "exit 0"],
      timeoutMs: 5_000,
    });

    const capturedOptions = mockSpawn.mock.calls[0]?.[2] as { env?: Record<string, unknown> };
    expect(capturedOptions.env).toBeDefined();
    expect(capturedOptions.env!["SECRET_TOKEN"]).toBeUndefined();
  });

  it("forwards allowlisted system vars that are present in process.env", async () => {
    await spawnPowerShellProcess({
      args: ["-Command", "exit 0"],
      timeoutMs: 5_000,
    });

    const capturedOptions = mockSpawn.mock.calls[0]?.[2] as { env?: Record<string, unknown> };
    expect(capturedOptions.env).toBeDefined();
    expect(capturedOptions.env!["SystemRoot"]).toBe("C:\\Windows");
  });

  it("forwards caller-supplied options.env overrides to the child process", async () => {
    await spawnPowerShellProcess({
      args: ["-Command", "exit 0"],
      timeoutMs: 5_000,
      env: { DYSFLOW_ACCESS_PASSWORD: "secret-pass" },
    });

    const capturedOptions = mockSpawn.mock.calls[0]?.[2] as { env?: Record<string, unknown> };
    expect(capturedOptions.env).toBeDefined();
    expect(capturedOptions.env!["DYSFLOW_ACCESS_PASSWORD"]).toBe("secret-pass");
  });

  it("does not inject undefined string values for allowlisted keys absent from process.env", async () => {
    const saved = process.env["COMPUTERNAME"];
    delete process.env["COMPUTERNAME"];

    try {
      await spawnPowerShellProcess({
        args: ["-Command", "exit 0"],
        timeoutMs: 5_000,
      });

      const capturedOptions = mockSpawn.mock.calls[0]?.[2] as { env?: Record<string, string> };
      expect(capturedOptions.env).toBeDefined();
      // Either the key is absent, or if present its value must not be the string "undefined"
      const val = capturedOptions.env!["COMPUTERNAME"];
      expect(val).not.toBe("undefined");
      if (val !== undefined) {
        expect(typeof val).toBe("string");
      }
    } finally {
      if (saved !== undefined) {
        process.env["COMPUTERNAME"] = saved;
      }
    }
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
