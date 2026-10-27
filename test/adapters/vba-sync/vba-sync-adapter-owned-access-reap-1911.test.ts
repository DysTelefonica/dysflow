import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
} from "../../../src/core/operations/access-operation-cleanup";
import { AccessOperationPreflightCleanupService } from "../../../src/core/operations/access-operation-preflight";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";

const START = "2026-10-27T10:00:00.000Z";
const OWN_PID = 4321;
// Another session's real Access on the same machine: never ours to touch.
const FOREIGN_PID = 35284;

function processTable() {
  const processes = new Map<number, OsProcessInfo>([
    [
      OWN_PID,
      {
        pid: OWN_PID,
        name: "MSACCESS.EXE",
        startTime: START,
        commandLine: '"MSACCESS.EXE" /Automation -Embedding',
        mainWindowHandle: 0,
      },
    ],
    [
      FOREIGN_PID,
      {
        pid: FOREIGN_PID,
        name: "MSACCESS.EXE",
        startTime: "2026-10-27T09:00:00.000Z",
        commandLine: '"MSACCESS.EXE" /Automation -Embedding',
        mainWindowHandle: 0,
      },
    ],
  ]);
  const killed: number[] = [];
  const processInspector: ProcessInspector = { getProcess: async (pid) => processes.get(pid) };
  const processKiller: ProcessKiller = {
    kill: async (pid) => {
      killed.push(pid);
      processes.delete(pid);
    },
  };
  return { processes, killed, processInspector, processKiller };
}

function executorRecording(
  result: { timedOut: boolean; exitCode: number | null; stdout?: string },
  marker: { accessPid?: number; processStartTime?: string } = {
    accessPid: OWN_PID,
    processStartTime: START,
  },
): VbaManagerExecutor & { operationIds: string[] } {
  const operationIds: string[] = [];
  const executor = (async (request) => {
    const operationFile = (request as { operationFile?: string }).operationFile;
    const operationId = (request as { operationId?: string }).operationId ?? "";
    operationIds.push(operationId);
    if (operationFile === undefined) throw new Error("operationFile was not provided");
    await mkdir(dirname(operationFile), { recursive: true });
    await writeFile(
      operationFile,
      JSON.stringify({ operationId, status: "running", ...marker }),
      "utf8",
    );
    return {
      exitCode: result.exitCode,
      stdout: result.stdout ?? "",
      stderr: "",
      durationMs: request.timeoutMs,
      timedOut: result.timedOut,
    };
  }) as VbaManagerExecutor & { operationIds: string[] };
  executor.operationIds = operationIds;
  return executor;
}

// A preflight that attributes nothing: the run's own reap must not depend on the
// preflight's registry scope or on matching the database path in a command line
// (a COM-activated Access carries only `/Automation -Embedding`).
const blindPreflight = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

function createService(options: {
  registry: InMemoryAccessOperationRegistry;
  table: ReturnType<typeof processTable>;
  executor: VbaManagerExecutor;
  preflight?: "blind" | "real";
}) {
  return new VbaSyncAdapter({
    operationRegistry: options.registry,
    preflightCleanup:
      options.preflight === "real"
        ? new AccessOperationPreflightCleanupService({
            registry: options.registry,
            processInspector: options.table.processInspector,
            processKiller: options.table.processKiller,
          })
        : blindPreflight,
    runOwnedAccessProcesses: {
      processInspector: options.table.processInspector,
      processKiller: options.table.processKiller,
    },
    executor: options.executor,
    timeoutMs: 12_000,
    accessPath: "C:/db/front.accdb",
    destinationRoot: "C:/repo/src",
    env: {},
  });
}

const TEST_PLAN = { proceduresJson: JSON.stringify([{ procedure: "Test_Foo" }]) };

const PASSING_RUN = `DYSFLOW_RESULT ${JSON.stringify({
  tests: [{ ok: true, procedure: "Test_Foo", returnValue: true }],
})}`;

describe("test_vba reaps the Access its own run recorded (#1911)", () => {
  it("timeout: kills the recorded Access and reports it, leaving every other Access alone", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const table = processTable();
    const executor = executorRecording({ timedOut: true, exitCode: null });
    const service = createService({ registry, table, executor });

    const result = await service.execute("test_vba", TEST_PLAN);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected timeout");
    expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
    expect(table.killed).toEqual([OWN_PID]);
    expect(table.processes.has(FOREIGN_PID)).toBe(true);
    expect((result.error.details as { reapedProcessPids: number[] }).reapedProcessPids).toContain(
      OWN_PID,
    );
  });

  it("timeout with the real preflight: the recorded Access is killed exactly once", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const table = processTable();
    const executor = executorRecording({ timedOut: true, exitCode: null });
    const service = createService({ registry, table, executor, preflight: "real" });

    const result = await service.execute("test_vba", TEST_PLAN);

    expect(result.ok).toBe(false);
    expect(table.killed).toEqual([OWN_PID]);
    expect(table.processes.has(FOREIGN_PID)).toBe(true);
    const operations = await registry.listRecent();
    expect(operations.filter((op) => op.accessPid === OWN_PID)).toEqual([]);
  });

  it("a run that exits without having closed its Access: the recorded Access is killed", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const table = processTable();
    const executor = executorRecording({ timedOut: false, exitCode: 0, stdout: PASSING_RUN });
    const service = createService({ registry, table, executor });

    const result = await service.execute("test_vba", TEST_PLAN);

    expect(result.ok).toBe(true);
    expect(table.killed).toEqual([OWN_PID]);
    expect(table.processes.has(FOREIGN_PID)).toBe(true);
  });

  it("a run that already closed its Access kills nothing and keeps its result", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const table = processTable();
    table.processes.delete(OWN_PID);
    const executor = executorRecording({ timedOut: false, exitCode: 0, stdout: PASSING_RUN });
    const service = createService({ registry, table, executor });

    const result = await service.execute("test_vba", TEST_PLAN);

    expect(result.ok).toBe(true);
    expect(table.killed).toEqual([]);
    await expect(registry.listRecent()).resolves.toEqual([]);
  });

  it("a recorded PID now held by a later Access is never killed", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const table = processTable();
    table.processes.set(OWN_PID, {
      pid: OWN_PID,
      name: "MSACCESS.EXE",
      startTime: "2026-10-27T11:30:00.000Z",
      mainWindowHandle: 0,
    });
    const executor = executorRecording({ timedOut: true, exitCode: null });
    const service = createService({ registry, table, executor });

    await service.execute("test_vba", TEST_PLAN);

    expect(table.killed).toEqual([]);
  });

  it("a recorded Access that could not be killed stays listed as cleanup_pending", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const table = processTable();
    table.processKiller.kill = async () => {
      throw new Error("Access is denied.");
    };
    const executor = executorRecording({ timedOut: false, exitCode: 0, stdout: PASSING_RUN });
    const service = createService({ registry, table, executor });

    await service.execute("test_vba", TEST_PLAN);

    const listed = await service.execute("list_access_operations", {});
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error("expected list");
    const operations = (listed.data as { operations: Array<Record<string, unknown>> }).operations;
    expect(operations).toEqual([
      expect.objectContaining({
        operationId: executor.operationIds[0],
        accessPid: OWN_PID,
        status: "cleanup_pending",
      }),
    ]);
  });
});
