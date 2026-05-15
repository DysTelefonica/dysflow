import { describe, expect, it } from "vitest";
import {
  AccessPowerShellRunner,
  sanitizePowerShellOutput,
  type PowerShellExecutor,
} from "../../../src/core/runner/access-runner.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";

const config: DysflowConfig = {
  accessDbPath: "C:/data/finance.accdb",
  accessPassword: "super-secret",
  timeoutMs: 1_500,
};

describe("AccessPowerShellRunner", () => {
  it("passes PowerShell command input as separated safe arguments", async () => {
    const calls: Array<{ command: string; args: readonly string[]; timeoutMs: number }> = [];
    const executor: PowerShellExecutor = async (command, args, options) => {
      calls.push({ command, args, timeoutMs: options.timeoutMs });
      return { exitCode: 0, stdout: '{"returnValue":42}', stderr: "", durationMs: 12, timedOut: false };
    };

    const runner = new AccessPowerShellRunner({ executor, scriptPath: "C:/tools/run access.ps1" });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "Main Module", procedureName: "Run-It", arguments: ["a;b", "$(nope)"] } },
      config,
    );

    expect(result).toEqual({ ok: true, data: { returnValue: 42 }, diagnostics: [], durationMs: 12 });
    expect(calls).toEqual([
      {
        command: "powershell.exe",
        timeoutMs: 1_500,
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "C:/tools/run access.ps1",
          "-AccessDbPath",
          "C:/data/finance.accdb",
          "-Operation",
          "vba",
          "-PayloadJson",
          '{"moduleName":"Main Module","procedureName":"Run-It","arguments":["a;b","$(nope)"]}',
          "-AccessPassword",
          "super-secret",
        ],
      },
    ]);
  });

  it("maps timed-out execution to a retryable timeout error with sanitized diagnostics", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: null,
      stdout: "starting with super-secret",
      stderr: "connection password=super-secret stalled",
      durationMs: 1_501,
      timedOut: true,
    });
    const runner = new AccessPowerShellRunner({ executor, scriptPath: "C:/tools/run.ps1" });

    const result = await runner.run({ kind: "diagnostics", request: { includeEnvironment: true } }, config);

    expect(result).toEqual({
      ok: false,
      error: { code: "RUNNER_TIMEOUT", message: "Access operation timed out after 1500ms.", retryable: true },
      diagnostics: [
        { level: "warning", source: "powershell.stdout", message: "starting with [REDACTED]" },
        { level: "error", source: "powershell.stderr", message: "connection password=[REDACTED] stalled" },
      ],
      durationMs: 1_501,
    });
  });

  it("maps non-zero PowerShell exit output to a sanitized runner failure", async () => {
    const executor: PowerShellExecutor = async () => ({
      exitCode: 7,
      stdout: "",
      stderr: "failed opening C:/data/finance.accdb with super-secret",
      durationMs: 33,
      timedOut: false,
    });
    const runner = new AccessPowerShellRunner({ executor, scriptPath: "C:/tools/run.ps1" });

    const result = await runner.run({ kind: "query", request: { sql: "SELECT * FROM Customers", mode: "read" } }, config);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "RUNNER_FAILED",
        message: "PowerShell runner failed with exit code 7: failed opening C:/data/finance.accdb with [REDACTED]",
        retryable: false,
      },
      diagnostics: [{ level: "error", source: "powershell.stderr", message: "failed opening C:/data/finance.accdb with [REDACTED]" }],
      durationMs: 33,
    });
  });
});

describe("sanitizePowerShellOutput", () => {
  it("redacts configured secrets and password assignments", () => {
    expect(sanitizePowerShellOutput("token abc password=hunter2; pwd: hunter2", ["abc", "hunter2"])).toBe(
      "token [REDACTED] password=[REDACTED]; pwd: [REDACTED]",
    );
  });
});
