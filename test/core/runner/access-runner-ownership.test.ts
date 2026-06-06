import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";
import {
  AccessPowerShellRunner,
  type PowerShellExecutor,
} from "../../../src/core/runner/access-runner.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: false,
  accessDbPath: "C:/data/app.accdb",
  timeoutMs: 100,
  processTimeoutMs: 100,
};

const noOpPreflight: AccessOperationPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

describe("AccessPowerShellRunner operation ownership", () => {
  it("records operationId/accessPid/processStartTime on successful calls and returns operation metadata", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const executor: PowerShellExecutor = async (_command, _args, options) => {
      await options.onAccessProcessCaptured({
        pid: 4567,
        processStartTime: "2026-05-15T10:00:00.000Z",
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      });
      await expect(registry.get("op-success")).resolves.toMatchObject({
        status: "running",
        accessPid: 4567,
      });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT {"returnValue":"ok"}',
        stderr: "",
        durationMs: 10,
        timedOut: false,
        accessProcess: {
          pid: 4567,
          processStartTime: "2026-05-15T10:00:00.000Z",
          commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
        },
      };
    };
    const runner = new AccessPowerShellRunner({
      executor,
      operationRegistry: registry,
      operationIdFactory: () => "op-success",
      preflightCleanup: noOpPreflight,
    });

    const result = await runner.run(
      { kind: "vba", request: { moduleName: "M", procedureName: "P" } },
      config,
    );

    expect(result).toMatchObject({
      ok: true,
      operation: {
        operationId: "op-success",
        accessPath: "C:/data/app.accdb",
        accessPid: 4567,
        processStartTime: "2026-05-15T10:00:00.000Z",
        status: "completed",
      },
    });
    // completed records are purged from InMemory registry (parity with FileRegistry)
    await expect(registry.get("op-success")).resolves.toBeUndefined();
  });

  it("keeps accessPid/processStartTime in the registry when the call times out", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const executor: PowerShellExecutor = async () => ({
      exitCode: null,
      stdout: "",
      stderr: "hung",
      durationMs: 101,
      timedOut: true,
      accessProcess: { pid: 4568, processStartTime: "2026-05-15T10:01:00.000Z" },
    });
    const runner = new AccessPowerShellRunner({
      executor,
      operationRegistry: registry,
      operationIdFactory: () => "op-timeout",
      preflightCleanup: noOpPreflight,
    });

    const result = await runner.run(
      { kind: "query", request: { sql: "SELECT * FROM T", mode: "read" } },
      config,
    );

    expect(result).toMatchObject({
      ok: false,
      operation: {
        operationId: "op-timeout",
        accessPid: 4568,
        processStartTime: "2026-05-15T10:01:00.000Z",
        status: "timed_out",
      },
    });
    await expect(registry.get("op-timeout")).resolves.toMatchObject({
      accessPid: 4568,
      processStartTime: "2026-05-15T10:01:00.000Z",
      status: "timed_out",
    });
  });
});
