/**
 * #1993 D2 — the hidden `dysflow test-run --run-dir <dir>` runner, end to end.
 *
 * The runner replays a prepared run through the real `test_vba` MCP tool and
 * the real in-process MCP pipeline. Only Access is faked: the VBA orchestrator
 * reports per-test progress and returns raw runner results, exactly where the
 * PowerShell runner would. The stored result is compared against the same
 * tool called synchronously.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callToolInProcess } from "../../src/adapters/mcp/in-process-tool-call";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools";
import { nodeTestRunFileSystem } from "../../src/adapters/test-runs/node-test-run-file-system";
import {
  type MappedToolExecutionOptions,
  VbaExecutionAdapter,
} from "../../src/adapters/vba-sync/vba-execution-adapter";
import { runCli } from "../../src/cli/index";
import { successResult } from "../../src/core/contracts/index";
import type {
  ProcessProbeResult,
  RunnerProcessProbe,
} from "../../src/core/test-runs/test-run-ports";
import { resolveTestRunsRoot, TestRunStore } from "../../src/core/test-runs/test-run-store";

const ACCESS_PATH = "C:\\Projects\\App\\Frontend.accdb";
const LAUNCHER_PID = 1_000;
const RUNNER_PID = 2_000;
const STARTED = "2026-11-05T08:00:00.000Z";
const PLAN = ["Test_One", "Test_Two"];

const probe: RunnerProcessProbe = {
  async inspect(pid: number): Promise<ProcessProbeResult> {
    return pid === LAUNCHER_PID || pid === RUNNER_PID
      ? { alive: true, startTime: STARTED }
      : { alive: false };
  },
};

function rawTest(procedure: string, ok: boolean) {
  return {
    ok,
    procedure,
    argsCount: 0,
    returnValue: ok,
    returnType: "Boolean",
    byref_values: {},
    payload: { procedure },
    logs: [`${procedure} log`],
    error: ok ? null : `${procedure} assertion failed`,
    durationMs: 5,
  };
}

let projectRoot: string;
let store: TestRunStore;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "dysflow-test-run-cli-"));
  store = new TestRunStore({
    runsRoot: resolveTestRunsRoot(projectRoot),
    fileSystem: nodeTestRunFileSystem,
    processProbe: probe,
    selfPid: LAUNCHER_PID,
  });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

/**
 * The test_vba tool over a fake Access. Each test reports progress the way the
 * #1990 marker poller does; `onTestFinished` lets the test observe disk
 * between two tests.
 */
function testVbaTools(outcomes: boolean[], onTestFinished?: (index: number) => Promise<void>) {
  const adapter = new VbaExecutionAdapter({
    cwd: projectRoot,
    async executeMappedTool(
      _toolName: string,
      _params: Record<string, unknown>,
      _mapping: unknown,
      options?: MappedToolExecutionOptions,
    ) {
      for (const [index, ok] of outcomes.entries()) {
        options?.onProgress?.(index + 1, PLAN.length, `${PLAN[index]} ${ok ? "passed" : "failed"}`);
        await onTestFinished?.(index);
      }
      return successResult({
        tests: outcomes.map((ok, index) => rawTest(PLAN[index] ?? "", ok)),
      });
    },
  } as never);
  return createDysflowMcpTools({
    services: {
      vbaService: { execute: async () => successResult({ returnValue: "unused" }) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
      vbaSyncToolService: {
        execute: (name: string, input: Record<string, unknown>, options?: unknown) =>
          adapter.execute(name, input, options as MappedToolExecutionOptions),
      },
    },
    writes: true,
    writeExecutionPolicy: "developer",
  });
}

const INPUT = {
  proceduresJson: JSON.stringify(PLAN.map((procedure) => ({ procedure, args: [] }))),
  apply: true,
};

async function prepareRun(): Promise<{ operationId: string; runDir: string }> {
  const prepared = await store.prepareRun({
    input: INPUT,
    accessPath: ACCESS_PATH,
    plannedTests: PLAN,
  });
  if (!prepared.ok) throw new Error(prepared.error.message);
  return prepared;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function runRunner(runDir: string, tools: ReturnType<typeof testVbaTools>) {
  return runCli(["test-run", "--run-dir", runDir], {
    detachedTestRun: {
      createToolRuntime: async () => ({ tools, serverOptions: {} }),
      processProbe: probe,
      runnerPid: RUNNER_PID,
    },
  });
}

describe("dysflow test-run (#1993 D2)", () => {
  it("stores the synchronous result of a passing run and marks it passed", async () => {
    const { operationId, runDir } = await prepareRun();
    const progressSeen: unknown[] = [];
    const tools = testVbaTools([true, true], async () => {
      // Wait until the runner persisted this notification, then record it.
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const state = (await readJson(join(runDir, "state.json"))) as {
          progress: { completed: number };
          runner: unknown;
        };
        if (state.progress.completed > progressSeen.length) {
          progressSeen.push({ progress: state.progress, runner: state.runner });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    });

    const cli = await runRunner(runDir, tools);
    const synchronous = await callToolInProcess(testVbaTools([true, true]), {}, "test_vba", INPUT);

    expect(cli.exitCode).toBe(0);
    expect(progressSeen).toEqual([
      {
        progress: { completed: 1, planned: 2, currentTest: "Test_Two", passed: 1, failed: 0 },
        runner: { pid: RUNNER_PID, startTime: STARTED },
      },
      {
        progress: { completed: 2, planned: 2, currentTest: null, passed: 2, failed: 0 },
        runner: { pid: RUNNER_PID, startTime: STARTED },
      },
    ]);
    expect(await readJson(join(runDir, "result.json"))).toEqual(synchronous);
    await expect(store.readTestRun(operationId)).resolves.toMatchObject({
      status: "passed",
      progress: { completed: 2, planned: 2, passed: 2, failed: 0, currentTest: null },
      result: synchronous,
    });
    await expect(store.getActiveDetachedRun(ACCESS_PATH)).resolves.toBeUndefined();
    expect(
      (await readdir(resolveTestRunsRoot(projectRoot))).filter((name) => name.endsWith(".json")),
    ).toEqual([]);
  });

  it("stores the VBA_TESTS_FAILED envelope of a failing run and marks it failed", async () => {
    const { operationId, runDir } = await prepareRun();

    const cli = await runRunner(runDir, testVbaTools([true, false]));
    const synchronous = (await callToolInProcess(
      testVbaTools([true, false]),
      {},
      "test_vba",
      INPUT,
    )) as { isError?: boolean; structuredContent?: { error?: { code?: string } } };

    expect(cli.exitCode).toBe(1);
    expect(synchronous.isError).toBe(true);
    expect(synchronous.structuredContent?.error?.code).toBe("VBA_TESTS_FAILED");
    expect(await readJson(join(runDir, "result.json"))).toEqual(synchronous);
    await expect(store.readTestRun(operationId)).resolves.toMatchObject({
      status: "failed",
      progress: { completed: 2, planned: 2, passed: 1, failed: 1 },
    });
    await expect(store.getActiveDetachedRun(ACCESS_PATH)).resolves.toBeUndefined();
  });

  it("never runs while another live run holds the database", async () => {
    const { operationId: activeOperationId } = await prepareRun();
    // A second run whose request targets the same database the first one holds.
    const second = await store.prepareRun({
      input: INPUT,
      accessPath: "C:\\Projects\\App\\Elsewhere.accdb",
      plannedTests: PLAN,
    });
    if (!second.ok) throw new Error(second.error.message);
    const requestPath = join(second.runDir, "request.json");
    const request = (await readJson(requestPath)) as Record<string, unknown>;
    await nodeTestRunFileSystem.writeAtomic(
      requestPath,
      JSON.stringify({ ...request, accessPath: ACCESS_PATH }),
    );
    let accessCalls = 0;

    const cli = await runRunner(
      second.runDir,
      testVbaTools([true, true], async () => {
        accessCalls += 1;
      }),
    );

    expect(cli.exitCode).toBe(1);
    expect(accessCalls).toBe(0);
    expect(existsSync(join(second.runDir, "result.json"))).toBe(false);
    await expect(store.readTestRun(second.operationId)).resolves.toMatchObject({
      status: "failed",
      error: { code: "TEST_RUN_ALREADY_ACTIVE" },
    });
    await expect(store.getActiveDetachedRun(ACCESS_PATH)).resolves.toMatchObject({
      operationId: activeOperationId,
    });
  });

  it("refuses to start without --run-dir", async () => {
    const cli = await runCli(["test-run"]);

    expect(cli.exitCode).toBe(2);
    expect(cli.stderr).toContain("--run-dir");
  });
});
