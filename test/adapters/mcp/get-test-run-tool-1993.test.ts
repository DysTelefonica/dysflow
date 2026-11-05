/**
 * #1993 D4 / S3 — `get_test_run` reads a detached run from disk.
 *
 * A run is started through the real `test_vba` tool with `detach:true`, its
 * runner is the real hidden `dysflow test-run` command, and `get_test_run` is
 * the real MCP tool. Only Access (the PowerShell executor), the detached
 * spawn, process liveness and, for long-polling, time are faked.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveMcpAccessContextForInput } from "../../../src/adapters/mcp/stdio";
import type {
  VbaManagerExecutionRequest,
  VbaManagerExecutor,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";
import {
  callTool,
  DetachedRunHarness,
  exited,
  PLAN,
  PROCEDURES_JSON,
  RUNNER_PID,
  runnerStdout,
  type SpawnCall,
  STARTED,
} from "../../_helpers/detached-test-runs-1993";

const APPLY = { proceduresJson: PROCEDURES_JSON, apply: true };

let harness: DetachedRunHarness;

beforeEach(() => {
  harness = new DetachedRunHarness();
});

afterEach(() => {
  harness.dispose();
});

const neverEnding: VbaManagerExecutor = () => new Promise(() => undefined);

async function startDetached(): Promise<{ operationId: string; spawn: SpawnCall }> {
  const tools = harness.tools(harness.adapter(neverEnding));
  const started = await callTool(tools, "test_vba", { ...APPLY, detach: true });
  const operationId = started.structuredContent?.operationId;
  const spawn = harness.spawns.at(-1);
  if (typeof operationId !== "string" || spawn === undefined) {
    throw new Error(`detached start failed: ${JSON.stringify(started)}`);
  }
  return { operationId, spawn };
}

function readerTools(polling?: { sleep: (ms: number) => Promise<void>; now: () => number }) {
  return harness.tools(harness.adapter(neverEnding), polling);
}

/** A reader whose access context resolves projectId as the stdio server does. */
function projectAwareReader() {
  return harness.tools(harness.adapter(neverEnding), undefined, (input) =>
    resolveMcpAccessContextForInput(input, undefined, { cwd: harness.root }),
  );
}

/** Write the Run-Tests marker after `completed` tests, as the #1990 poller reads it. */
async function writeMarker(request: VbaManagerExecutionRequest, completed: number) {
  const operationFile = request.operationFile;
  if (operationFile === undefined) throw new Error("operationFile was not provided");
  await mkdir(dirname(operationFile), { recursive: true });
  await writeFile(
    operationFile,
    JSON.stringify({
      operationId: request.operationId,
      action: "Run-Tests",
      accessPid: 4321,
      processStartTime: STARTED,
      status: "running",
      updatedAt: new Date().toISOString(),
      progress: {
        total: PLAN.length,
        completed,
        passed: completed,
        failed: 0,
        currentTest: PLAN[completed] ?? null,
        results: PLAN.slice(0, completed).map((procedure) => ({ procedure, ok: true })),
      },
    }),
    "utf8",
  );
}

describe("get_test_run (#1993 D4)", () => {
  it("reports running with progress, then the synchronous test_vba result once the run passed", async () => {
    const { operationId, spawn } = await startDetached();
    const reader = readerTools();

    const before = await callTool(reader, "get_test_run", { operationId });
    expect(before.isError).toBe(false);
    expect(before.structuredContent).toMatchObject({
      operationId,
      status: "running",
      progress: { completed: 0, planned: 2, currentTest: "Test_One", passed: 0, failed: 0 },
    });
    expect(before.structuredContent?.result).toBeUndefined();

    // While the runner drives Access, the reader sees the progress it recorded.
    const midRun: unknown[] = [];
    const registry = new InMemoryAccessOperationRegistry();
    const runner: VbaManagerExecutor = async (request) => {
      await writeMarker(request, 1);
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const view = await callTool(reader, "get_test_run", { operationId });
        const progress = view.structuredContent?.progress as { completed?: number } | undefined;
        if (progress?.completed === 1) {
          midRun.push(view.structuredContent);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      // Run-Tests rewrites the marker after every test, the last one included.
      await writeMarker(request, 2);
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const view = await callTool(reader, "get_test_run", { operationId });
        const progress = view.structuredContent?.progress as { completed?: number } | undefined;
        if (progress?.completed === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return exited(runnerStdout([true, true]));
    };
    const tools = harness.tools(
      harness.adapter(runner, { env: spawn.env, operationRegistry: registry }),
    );
    const { runCli } = await import("../../../src/cli/index");
    const cli = await runCli(["test-run", "--run-dir", spawn.runDir], {
      detachedTestRun: {
        createToolRuntime: async () => ({ tools, serverOptions: {} }),
        processProbe: harness.processes,
        runnerPid: RUNNER_PID,
      },
    });
    expect(cli.exitCode).toBe(0);
    expect(midRun).toEqual([
      expect.objectContaining({
        status: "running",
        progress: { completed: 1, planned: 2, currentTest: "Test_Two", passed: 1, failed: 0 },
      }),
    ]);

    const after = await callTool(reader, "get_test_run", { operationId });
    const synchronous = await callTool(
      harness.tools(harness.adapter(async () => exited(runnerStdout([true, true])))),
      "test_vba",
      APPLY,
    );

    expect(after.isError).toBe(false);
    expect(after.structuredContent).toMatchObject({
      operationId,
      status: "passed",
      progress: { completed: 2, planned: 2, currentTest: null, passed: 2, failed: 0 },
    });
    expect(typeof after.structuredContent?.finishedAt).toBe("string");
    const result = after.structuredContent?.result as Record<string, unknown>;
    expect(result).toMatchObject({ mode: "apply", passed: 2, failed: 0 });
    // The same passed/failed/tests[] a synchronous call returns.
    const { operation: _runOperation, ...detachedResult } = result;
    const { operation: _syncOperation, ...syncResult } = synchronous.structuredContent ?? {};
    expect(detachedResult).toEqual(syncResult);
  });

  it("returns the VBA_TESTS_FAILED envelope of a failed run", async () => {
    const { operationId, spawn } = await startDetached();
    const cli = await harness.runRunner(spawn, async () => exited(runnerStdout([true, false])));
    expect(cli.exitCode).toBe(1);

    const view = await callTool(readerTools(), "get_test_run", { operationId });

    expect(view.isError).toBe(false);
    expect(view.structuredContent).toMatchObject({
      status: "failed",
      progress: { planned: 2 },
      result: {
        error: {
          code: "VBA_TESTS_FAILED",
          details: {
            failedCount: 1,
            failures: [expect.objectContaining({ procedure: "Test_Two" })],
          },
        },
      },
    });
  });

  it("long-polls once a second until the run ends", async () => {
    const { operationId } = await startDetached();
    let clock = 0;
    const sleeps: number[] = [];
    const store = harness.store();
    const reader = readerTools({
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
        if (sleeps.length === 3) {
          await store.writeResult(operationId, { structuredContent: { passed: 2, failed: 0 } });
          await store.updateState(operationId, (state) => ({
            ...state,
            status: "passed",
            finishedAt: new Date().toISOString(),
          }));
        }
      },
    });

    const view = await callTool(reader, "get_test_run", { operationId, wait: 30 });

    expect(view.structuredContent).toMatchObject({
      status: "passed",
      result: { passed: 2, failed: 0 },
    });
    expect(sleeps).toEqual([1_000, 1_000, 1_000]);
  });

  it("caps the wait at 50 seconds", async () => {
    const { operationId } = await startDetached();
    let clock = 0;
    const sleeps: number[] = [];
    const reader = readerTools({
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });

    const view = await callTool(reader, "get_test_run", { operationId, wait: 600 });

    expect(view.structuredContent).toMatchObject({ status: "running" });
    expect(sleeps.reduce((total, ms) => total + ms, 0)).toBe(50_000);
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(1_000);
  });

  it("does not wait when wait is omitted", async () => {
    const { operationId } = await startDetached();
    const sleeps: number[] = [];
    const reader = readerTools({
      now: () => 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    const view = await callTool(reader, "get_test_run", { operationId });

    expect(view.structuredContent).toMatchObject({ status: "running" });
    expect(sleeps).toEqual([]);
  });

  it("reports crashed with the runner log tail when the runner died without a result", async () => {
    const { operationId, spawn } = await startDetached();
    const store = harness.store();
    await store.updateState(operationId, (state) => ({
      ...state,
      runner: { pid: 3_000, startTime: STARTED },
    }));
    await writeFile(join(spawn.runDir, "runner.log"), "starting\nfatal: out of memory\n", "utf8");

    const view = await callTool(readerTools(), "get_test_run", { operationId });

    expect(view.isError).toBe(false);
    expect(view.structuredContent).toMatchObject({
      status: "crashed",
      crash: { logTail: ["starting", "fatal: out of memory"] },
    });
    expect(view.structuredContent).toMatchObject({
      crash: { reason: expect.stringContaining("3000") },
    });
  });

  it("answers TEST_RUN_NOT_FOUND when the run is pruned while it waits, never a stale view", async () => {
    const { operationId, spawn } = await startDetached();
    let clock = 0;
    const reader = readerTools({
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
        await rm(spawn.runDir, { recursive: true, force: true });
      },
    });

    const view = await callTool(reader, "get_test_run", { operationId, wait: 5 });

    expect(view.isError).toBe(true);
    expect(view.structuredContent?.error?.code).toBe("TEST_RUN_NOT_FOUND");
    expect(view.structuredContent?.error?.details).toMatchObject({
      operationId,
      removedWhileWaiting: true,
    });
  });

  it("returns the project error when projectId does not resolve, not TEST_RUN_NOT_FOUND", async () => {
    const { operationId } = await startDetached();

    const view = await callTool(projectAwareReader(), "get_test_run", {
      operationId,
      projectId: "no-such-project",
    });

    expect(view.isError).toBe(true);
    expect(view.structuredContent?.error?.code).toBe("CONFIG_PROJECT_NOT_REGISTERED");
    expect(JSON.stringify(view.structuredContent?.error)).toContain("no-such-project");
  });

  it("still reads the run from cwd when no projectId is passed and no project config exists", async () => {
    const { operationId } = await startDetached();

    const view = await callTool(projectAwareReader(), "get_test_run", { operationId });

    expect(view.isError).toBe(false);
    expect(view.structuredContent?.status).toBe("running");
  });

  it("answers an unknown operationId with TEST_RUN_NOT_FOUND", async () => {
    const view = await callTool(readerTools(), "get_test_run", { operationId: "op-missing" });

    expect(view.isError).toBe(true);
    expect(view.structuredContent?.error?.code).toBe("TEST_RUN_NOT_FOUND");
  });

  it("refuses an operationId that is not a run directory name", async () => {
    const view = await callTool(readerTools(), "get_test_run", { operationId: "../../etc" });

    expect(view.isError).toBe(true);
    expect(view.structuredContent?.error?.code).toBe("MCP_INPUT_INVALID");
  });
});
