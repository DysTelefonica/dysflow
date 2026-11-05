/**
 * Issue #1990 — a long `test_vba` run is observable while it runs.
 *
 * The PowerShell runner (one Access session for the whole plan) rewrites its
 * operation marker after each test. These tests drive the real adapter with a
 * fake runner that writes that marker the way Windows PowerShell 5.1 does
 * (UTF-8 with a byte-order mark) and assert what a caller can observe:
 * the registry record, MCP progress notifications, and the results a run cut
 * short leaves behind. Only the PowerShell spawn and the process ports are
 * faked; the marker lives in a temp directory.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import {
  type VbaManagerExecutionRequest,
  type VbaManagerExecutionResult,
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";
import {
  type AccessOperationRecord,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";

const ACCESS_PID = 4321;
const START = "2026-11-05T10:00:00.000Z";
const PLAN = ["Test_One", "Test_Two", "Test_Three"] as const;
const PROCEDURES_JSON = JSON.stringify(PLAN.map((procedure) => ({ procedure })));

type RunnerTest = { procedure: string; ok: boolean; durationMs: number; error?: string };

const RUN: readonly RunnerTest[] = [
  { procedure: "Test_One", ok: true, durationMs: 30 },
  { procedure: "Test_Two", ok: false, durationMs: 40, error: "assertion failed" },
  { procedure: "Test_Three", ok: true, durationMs: 50 },
];

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dysflow-1990-progress-"));
  mkdirSync(join(root, "src"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write the marker exactly as Run-Tests does after `completed` tests. */
async function writeMarker(request: VbaManagerExecutionRequest, completed: number): Promise<void> {
  const operationFile = request.operationFile;
  if (operationFile === undefined) throw new Error("operationFile was not provided");
  await mkdir(dirname(operationFile), { recursive: true });
  const results = RUN.slice(0, completed);
  const passed = results.filter((test) => test.ok).length;
  const marker = {
    operationId: request.operationId,
    action: "Run-Tests",
    accessPid: ACCESS_PID,
    processStartTime: START,
    status: "running",
    updatedAt: new Date().toISOString(),
    progress: {
      total: RUN.length,
      completed,
      passed,
      failed: completed - passed,
      currentTest: completed < RUN.length ? RUN[completed]?.procedure : null,
      results,
    },
  };
  // Windows PowerShell 5.1 `Set-Content -Encoding UTF8` prefixes a BOM.
  await writeFile(operationFile, `\uFEFF${JSON.stringify(marker, null, 2)}`, "utf8");
}

function passingStdout(): string {
  return `DYSFLOW_RESULT ${JSON.stringify({
    tests: RUN.map((test) => ({ ...test, ok: true, returnValue: true })),
  })}`;
}

function exited(stdout: string, extra: Partial<VbaManagerExecutionResult> = {}) {
  return { exitCode: 0, stdout, stderr: "", durationMs: 10, timedOut: false, ...extra };
}

function createAdapter(registry: InMemoryAccessOperationRegistry, executor: VbaManagerExecutor) {
  return new VbaSyncAdapter({
    operationRegistry: registry,
    preflightCleanup: {
      cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
    },
    runOwnedAccessProcesses: {
      processInspector: { getProcess: async () => undefined },
      processKiller: { kill: async () => undefined },
    },
    executor,
    markerPollIntervalMs: 5,
    timeoutMs: 60_000,
    cwd: root,
    accessPath: join(root, "front.accdb"),
    destinationRoot: join(root, "src"),
    env: {},
  });
}

async function onlyRecord(registry: InMemoryAccessOperationRegistry) {
  const [record] = await registry.listRecent();
  if (record === undefined) throw new Error("no operation was recorded");
  return record;
}

async function waitFor<T>(read: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 2_000;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline)
      throw new Error("registry record did not reach the expected progress within 2s");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

type TestProgress = {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  currentTest: string | null;
  results: Array<{ procedure: string; ok: boolean; durationMs?: number; error?: string }>;
};

function progressOf(record: AccessOperationRecord): TestProgress | undefined {
  return record.metadata.testProgress as TestProgress | undefined;
}

describe("test_vba progress in the operation registry (#1990)", () => {
  it("updates the running record after each test with increasing completed and pass/fail counts", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const seen: Array<{ status: string; accessPid: number | null; progress: TestProgress }> = [];
    const executor: VbaManagerExecutor = async (request) => {
      for (let completed = 0; completed <= RUN.length; completed += 1) {
        await writeMarker(request, completed);
        const record = await waitFor(async () => {
          const current = await registry.get(request.operationId ?? "");
          return current !== undefined && progressOf(current)?.completed === completed
            ? current
            : undefined;
        });
        const progress = progressOf(record);
        if (progress === undefined) throw new Error("record carries no testProgress");
        seen.push({ status: record.status, accessPid: record.accessPid, progress });
      }
      return exited(passingStdout());
    };

    const result = await createAdapter(registry, executor).execute("test_vba", {
      proceduresJson: PROCEDURES_JSON,
    });

    expect(result.ok).toBe(true);
    expect(seen.map((entry) => entry.progress.completed)).toEqual([0, 1, 2, 3]);
    expect(seen.map((entry) => entry.progress.passed)).toEqual([0, 1, 1, 2]);
    expect(seen.map((entry) => entry.progress.failed)).toEqual([0, 0, 1, 1]);
    expect(seen.map((entry) => entry.progress.total)).toEqual([3, 3, 3, 3]);
    expect(seen.map((entry) => entry.progress.currentTest)).toEqual([
      "Test_One",
      "Test_Two",
      "Test_Three",
      null,
    ]);
    // The record left `starting` and carries the runner's Access PID while running.
    for (const entry of seen) {
      expect(entry.status).toBe("running");
      expect(entry.accessPid).toBe(ACCESS_PID);
    }
    expect(seen[3]?.progress.results).toEqual([
      { procedure: "Test_One", ok: true, durationMs: 30 },
      { procedure: "Test_Two", ok: false, durationMs: 40, error: "assertion failed" },
      { procedure: "Test_Three", ok: true, durationMs: 50 },
    ]);
  });

  it("refreshes updatedAt on each progress write", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const stamps: string[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      for (let completed = 0; completed <= 1; completed += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        await writeMarker(request, completed);
        const record = await waitFor(async () => {
          const current = await registry.get(request.operationId ?? "");
          return current !== undefined && progressOf(current)?.completed === completed
            ? current
            : undefined;
        });
        stamps.push(record.updatedAt);
      }
      return exited(passingStdout());
    };

    await createAdapter(registry, executor).execute("test_vba", {
      proceduresJson: PROCEDURES_JSON,
    });

    expect(stamps).toHaveLength(2);
    expect((stamps[1] ?? "") > (stamps[0] ?? "")).toBe(true);
  });
});

describe("test_vba partial results survive a run cut short (#1990)", () => {
  it("keeps the finished tests in the record and the envelope when the caller cancels", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const controller = new AbortController();
    const executor: VbaManagerExecutor = async (request) => {
      await writeMarker(request, 2);
      await waitFor(async () => {
        const current = await registry.get(request.operationId ?? "");
        return current !== undefined && progressOf(current)?.completed === 2 ? true : undefined;
      });
      controller.abort();
      if (request.signal?.aborted !== true) throw new Error("the caller's signal was not threaded");
      return exited("", { exitCode: null, aborted: true });
    };

    const result = await createAdapter(registry, executor).execute(
      "test_vba",
      { proceduresJson: PROCEDURES_JSON },
      { signal: controller.signal },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected an aborted run");
    expect(result.error.code).toBe("VBA_MANAGER_ABORTED");
    const record = await onlyRecord(registry);
    expect(record.status).toBe("failed");
    const kept = progressOf(record);
    expect(kept?.completed).toBe(2);
    expect(kept?.results.map((test) => [test.procedure, test.ok])).toEqual([
      ["Test_One", true],
      ["Test_Two", false],
    ]);
    expect((result.error.details as { testProgress?: TestProgress }).testProgress).toEqual(kept);
  });

  it("keeps the finished tests when the run times out", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const executor: VbaManagerExecutor = async (request) => {
      await writeMarker(request, 1);
      return exited("", { exitCode: null, timedOut: true });
    };

    const result = await createAdapter(registry, executor).execute("test_vba", {
      proceduresJson: PROCEDURES_JSON,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a timeout");
    expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
    const record = await onlyRecord(registry);
    expect(record.status).toBe("timed_out");
    expect(record.accessPid).toBe(ACCESS_PID);
    expect(progressOf(record)?.results).toEqual([
      { procedure: "Test_One", ok: true, durationMs: 30 },
    ]);
    const details = result.error.details as { testProgress?: TestProgress };
    expect(details.testProgress?.completed).toBe(1);
    expect(details.testProgress?.currentTest).toBe("Test_Two");
  });
});

describe("test_vba MCP progress notifications (#1990)", () => {
  async function callTestVba(
    executor: VbaManagerExecutor,
    withProgressToken: boolean,
  ): Promise<{
    events: Array<{ progress: number; total?: number; message?: string }>;
    isError: boolean;
  }> {
    const adapter = createAdapter(new InMemoryAccessOperationRegistry(), executor);
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({}) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
        vbaSyncToolService: adapter,
      },
      writes: true,
      writeExecutionPolicy: "developer",
      cwd: root,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverDone = startWithSdkServer(tools, serverTransport);
    const client = new Client({ name: "test-client", version: "0.0.1" }, { capabilities: {} });
    await client.connect(clientTransport);
    const events: Array<{ progress: number; total?: number; message?: string }> = [];
    try {
      const result = await client.callTool(
        {
          name: "test_vba",
          arguments: { proceduresJson: PROCEDURES_JSON, apply: true },
        },
        undefined,
        withProgressToken
          ? {
              onprogress: (notification) => {
                events.push({
                  progress: notification.progress,
                  total: notification.total,
                  message: notification.message,
                });
              },
            }
          : undefined,
      );
      return { events, isError: result.isError === true };
    } finally {
      await client.close();
      await serverDone.catch(() => undefined);
    }
  }

  it("sends one notification per finished test, progress 1..N with total N", async () => {
    const executor: VbaManagerExecutor = async (request) => {
      for (let completed = 0; completed <= RUN.length; completed += 1) {
        await writeMarker(request, completed);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      return exited(passingStdout());
    };

    const { events, isError } = await callTestVba(executor, true);

    expect(isError).toBe(false);
    expect(events).toEqual([
      { progress: 1, total: 3, message: "Test_One passed" },
      { progress: 2, total: 3, message: "Test_Two failed" },
      { progress: 3, total: 3, message: "Test_Three passed" },
    ]);
  });

  it("still sends one notification per test when the marker advanced several tests between reads", async () => {
    const executor: VbaManagerExecutor = async (request) => {
      await writeMarker(request, RUN.length);
      return exited(passingStdout());
    };

    const { events } = await callTestVba(executor, true);

    expect(events.map((event) => event.progress)).toEqual([1, 2, 3]);
    expect(events.every((event) => event.total === 3)).toBe(true);
  });
});
