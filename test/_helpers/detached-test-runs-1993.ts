/**
 * #1993 — shared harness for the detached `test_vba` route.
 *
 * Everything runs through the real MCP tool pipeline, the real
 * `VbaSyncAdapter` and the real run store over a temporary project. Only the
 * I/O the store and the adapter cannot own is faked: the PowerShell/Access
 * executor, the detached spawn, process liveness and (for long-polling) time.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callToolInProcess } from "../../src/adapters/mcp/in-process-tool-call";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools";
import { nodeTestRunFileSystem } from "../../src/adapters/test-runs/node-test-run-file-system";
import {
  type VbaManagerExecutionResult,
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../src/adapters/vba-sync/vba-sync-adapter";
import { runCli } from "../../src/cli/index";
import { successResult } from "../../src/core/contracts/index";
import type { AccessOperationRegistry } from "../../src/core/operations/access-operation-registry";
import type {
  ProcessProbeResult,
  RunnerProcessProbe,
} from "../../src/core/test-runs/test-run-ports";
import { resolveTestRunsRoot, TestRunStore } from "../../src/core/test-runs/test-run-store";

export const LAUNCHER_PID = 1_000;
export const RUNNER_PID = 2_000;
export const STARTED = "2026-11-05T08:00:00.000Z";
export const PLAN = ["Test_One", "Test_Two"] as const;
export const PROCEDURES_JSON = JSON.stringify(PLAN.map((procedure) => ({ procedure, args: [] })));

/** Processes the fake probe reports alive; tests remove one to simulate its death. */
export class FakeProcesses implements RunnerProcessProbe {
  readonly alive = new Set<number>([LAUNCHER_PID, RUNNER_PID]);

  async inspect(pid: number): Promise<ProcessProbeResult> {
    return this.alive.has(pid) ? { alive: true, startTime: STARTED } : { alive: false };
  }
}

export function exited(
  stdout: string,
  extra: Partial<VbaManagerExecutionResult> = {},
): VbaManagerExecutionResult {
  return { exitCode: 0, stdout, stderr: "", durationMs: 10, timedOut: false, ...extra };
}

/** What the PowerShell runner prints for the plan, one outcome per test. */
export function runnerStdout(outcomes: readonly boolean[]): string {
  return `DYSFLOW_RESULT ${JSON.stringify({
    tests: outcomes.map((ok, index) => ({
      ok,
      procedure: PLAN[index],
      argsCount: 0,
      returnValue: ok,
      returnType: "Boolean",
      payload: { procedure: PLAN[index] },
      logs: [`${PLAN[index]} log`],
      error: ok ? null : `${PLAN[index]} assertion failed`,
      durationMs: 5,
    })),
  })}`;
}

export type SpawnCall = { runDir: string; env: Record<string, string | undefined> };

export class DetachedRunHarness {
  readonly root: string;
  readonly accessPath: string;
  readonly processes = new FakeProcesses();
  readonly spawns: SpawnCall[] = [];
  /** Set to make the next detached spawn throw. */
  spawnFailure: Error | undefined;

  constructor() {
    this.root = mkdtempSync(join(tmpdir(), "dysflow-1993-detach-"));
    mkdirSync(join(this.root, "src"), { recursive: true });
    this.accessPath = join(this.root, "front.accdb");
  }

  dispose(): void {
    rmSync(this.root, { recursive: true, force: true });
  }

  /** The run store of the project, as the launcher sees it. */
  store(selfPid = LAUNCHER_PID): TestRunStore {
    return new TestRunStore({
      runsRoot: resolveTestRunsRoot(this.root),
      fileSystem: nodeTestRunFileSystem,
      processProbe: this.processes,
      selfPid,
    });
  }

  adapter(
    executor: VbaManagerExecutor,
    options: {
      env?: Record<string, string | undefined>;
      operationRegistry?: AccessOperationRegistry;
      accessPassword?: string;
    } = {},
  ): VbaSyncAdapter {
    return new VbaSyncAdapter({
      ...(options.operationRegistry === undefined
        ? {}
        : { operationRegistry: options.operationRegistry }),
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
      cwd: this.root,
      accessPath: this.accessPath,
      destinationRoot: join(this.root, "src"),
      env: options.env ?? {},
      ...(options.accessPassword === undefined ? {} : { accessPassword: options.accessPassword }),
      detachedTestRuns: {
        createStore: () => this.store(),
        spawnRunner: (runDir, env) => {
          if (this.spawnFailure !== undefined) throw this.spawnFailure;
          this.spawns.push({ runDir, env: { ...env } });
          return RUNNER_PID;
        },
      },
    });
  }

  tools(
    adapter: VbaSyncAdapter,
    testRunPolling?: { sleep: (ms: number) => Promise<void>; now: () => number },
  ) {
    return createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({ returnValue: "unused" }) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
        vbaSyncToolService: adapter,
      },
      writes: true,
      writeExecutionPolicy: "developer",
      cwd: this.root,
      testRunStore: () => this.store(),
      ...(testRunPolling === undefined ? {} : { testRunPolling }),
    });
  }

  /** Run the hidden runner on a prepared run directory with the env the launcher spawned it with. */
  async runRunner(spawn: SpawnCall, executor: VbaManagerExecutor) {
    const tools = this.tools(this.adapter(executor, { env: spawn.env }));
    return runCli(["test-run", "--run-dir", spawn.runDir], {
      detachedTestRun: {
        createToolRuntime: async () => ({ tools, serverOptions: {} }),
        processProbe: this.processes,
        runnerPid: RUNNER_PID,
      },
    });
  }
}

export type ToolCallResult = {
  isError?: boolean;
  structuredContent?: Record<string, unknown> & {
    data?: Record<string, unknown>;
    error?: { code?: string; details?: Record<string, unknown> };
  };
};

export async function callTool(
  tools: ReturnType<typeof createDysflowMcpTools>,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  return (await callToolInProcess(tools, {}, name, args)) as ToolCallResult;
}
