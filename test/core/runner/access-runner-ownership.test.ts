import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeLockFileSystem } from "../../../src/adapters/runner/node-lock-file-system.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight.js";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";
import {
  AccessPowerShellRunner,
  type PowerShellExecutor,
} from "../../../src/core/runner/access-runner.js";

// v1.2.32: the runner refuses to invoke the PowerShell executor for
// query actions when the configured accessPath does not exist on disk.
// Point the shared config at a real temp file so the new existsSync
// check passes and the existing ownership tests keep exercising the
// ownership / registry / timeout behavior they were written for.
let testTmpDir = "";
let testAccessDbPath = "";
let config: DysflowConfig;

beforeAll(() => {
  testTmpDir = mkdtempSync(join(tmpdir(), "dysflow-ownership-suite-"));
  testAccessDbPath = join(testTmpDir, "app.accdb");
  writeFileSync(testAccessDbPath, "");
  config = {
    configSource: "explicit-request",
    allowWrites: false,
    accessDbPath: testAccessDbPath,
    timeoutMs: 100,
  };
});

afterAll(() => {
  if (testTmpDir) rmSync(testTmpDir, { recursive: true, force: true });
});

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
        commandLine: `MSACCESS.EXE "${testAccessDbPath}"`,
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
          commandLine: `MSACCESS.EXE "${testAccessDbPath}"`,
        },
      };
    };
    const runner = new AccessPowerShellRunner({
      lockFileSystem: nodeLockFileSystem,
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
        accessPath: testAccessDbPath,
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
      lockFileSystem: nodeLockFileSystem,
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
