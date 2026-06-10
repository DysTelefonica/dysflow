import { describe, expect, it, vi } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import {
  AccessPowerShellRunner,
  type PowerShellExecutionResult,
  type PowerShellExecutor,
} from "../../../src/core/runner/access-runner.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: false,
  accessDbPath: "C:/data/test.accdb",
  timeoutMs: 1_500,
};

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

/**
 * Builds an executor that simulates a mixed stderr buffer via the executor's
 * onProgress and onAccessProcessCaptured callbacks (exercising the threading path).
 * - one DYSFLOW_ACCESS_PROCESS PID line → onAccessProcessCaptured called once
 * - two valid DYSFLOW_PROGRESS lines → onProgress called twice
 * - one malformed DYSFLOW_PROGRESS line → swallowed, no call
 * - one plain text line → preserved in stderr, no progress call
 */
function buildMixedStderrExecutor(capturedPids: number[]): PowerShellExecutor {
  return async (_command, _args, options): Promise<PowerShellExecutionResult> => {
    // Simulate PID capture (DYSFLOW_ACCESS_PROCESS line parsed)
    await options.onAccessProcessCaptured({
      pid: 4242,
      processStartTime: "2026-01-01T00:00:00.000Z",
    });
    capturedPids.push(4242);

    // Simulate two valid DYSFLOW_PROGRESS lines parsed by the executor
    options.onProgress?.(10, undefined, undefined);
    options.onProgress?.(50, 100, "halfway");

    // Malformed DYSFLOW_PROGRESS line — executor swallows it, no call

    // Plain text line — preserved in stderr diagnostics, no progress call

    return {
      exitCode: 0,
      stdout: 'DYSFLOW_RESULT {"returnValue":null}',
      stderr: "plain text line",
      durationMs: 5,
      timedOut: false,
    };
  };
}

describe("AccessPowerShellRunner — progress callback", () => {
  it("calls onProgress exactly twice with correct args for valid progress lines", async () => {
    const onProgress = vi.fn();
    const capturedPids: number[] = [];

    const executor = buildMixedStderrExecutor(capturedPids);
    const runner = new AccessPowerShellRunner({
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
    });

    const result = await runner.run(
      {
        kind: "vba",
        request: { moduleName: "TestModule", procedureName: "DoWork", arguments: [] },
      },
      config,
      { onProgress },
    );

    expect(result.ok).toBe(true);

    // PID captured exactly once
    expect(capturedPids).toHaveLength(1);
    expect(capturedPids[0]).toBe(4242);

    // onProgress called exactly twice with correct arguments
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 10, undefined, undefined);
    expect(onProgress).toHaveBeenNthCalledWith(2, 50, 100, "halfway");
  });

  it("does not throw when onProgress is absent and progress lines appear in stderr", async () => {
    const executor: PowerShellExecutor = async (
      _command,
      _args,
      options,
    ): Promise<PowerShellExecutionResult> => {
      await options.onAccessProcessCaptured({
        pid: 1111,
        processStartTime: "2026-01-01T00:00:00.000Z",
      });
      // onProgress is absent — executor must not throw
      options.onProgress?.(25, undefined, undefined);
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"returnValue":null}',
        stderr: "",
        durationMs: 3,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
    });

    // No onProgress in run options — should complete normally without throwing
    await expect(
      runner.run(
        {
          kind: "vba",
          request: { moduleName: "TestModule", procedureName: "DoWork", arguments: [] },
        },
        config,
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("plain text stderr lines are preserved in diagnostics and do not trigger onProgress", async () => {
    const onProgress = vi.fn();
    const executor: PowerShellExecutor = async (
      _command,
      _args,
      options,
    ): Promise<PowerShellExecutionResult> => {
      await options.onAccessProcessCaptured({
        pid: 2222,
        processStartTime: "2026-01-01T00:00:00.000Z",
      });
      // No progress calls — only a plain stderr line returned
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"returnValue":null}',
        stderr: "plain text diagnostic info",
        durationMs: 2,
        timedOut: false,
      };
    };

    const runner = new AccessPowerShellRunner({
      executor,
      preflightCleanup: noOpPreflight,
      scriptPath: "C:/tools/runner.ps1",
    });

    const result = await runner.run(
      {
        kind: "vba",
        request: { moduleName: "TestModule", procedureName: "DoWork", arguments: [] },
      },
      config,
      { onProgress },
    );

    // onProgress was never called for the plain text line
    expect(onProgress).not.toHaveBeenCalled();
    // The result is still ok
    expect(result.ok).toBe(true);
  });
});
