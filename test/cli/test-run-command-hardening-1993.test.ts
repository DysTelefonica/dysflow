/**
 * #1993 T3c — the hidden `dysflow test-run` runner keeps the launching
 * server's write posture, turns a server that cannot start into a terminal
 * state, keeps telemetry with the server, and records how it was started.
 *
 * Driven through `runCli` and the real store over a temporary directory;
 * only Access (the VBA orchestrator) and process liveness are faked.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StdioServerOptions } from "../../src/adapters/mcp/stdio";
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
const STARTED = "2026-11-05T08:00:00.000Z";
const PLAN = ["Test_One"];
const INPUT = {
  proceduresJson: JSON.stringify(PLAN.map((procedure) => ({ procedure, args: [] }))),
  apply: true,
};

const probe: RunnerProcessProbe = {
  async inspect(): Promise<ProcessProbeResult> {
    return { alive: true, startTime: STARTED };
  },
};

let projectRoot: string;
let store: TestRunStore;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "dysflow-test-run-cli-hardening-"));
  store = new TestRunStore({
    runsRoot: resolveTestRunsRoot(projectRoot),
    fileSystem: nodeTestRunFileSystem,
    processProbe: probe,
    selfPid: 1_000,
  });
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

function passingTools() {
  const adapter = new VbaExecutionAdapter({
    cwd: projectRoot,
    async executeMappedTool() {
      return successResult({
        tests: [
          {
            ok: true,
            procedure: "Test_One",
            argsCount: 0,
            returnValue: true,
            returnType: "Boolean",
            byref_values: {},
            payload: {},
            logs: [],
            error: null,
            durationMs: 1,
          },
        ],
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

async function prepareRun(writesEnabled: boolean) {
  const prepared = await store.prepareRun({
    input: INPUT,
    accessPath: ACCESS_PATH,
    plannedTests: PLAN,
    writesEnabled,
  });
  if (!prepared.ok) throw new Error(prepared.error.message);
  return prepared;
}

function withinSeconds<T>(seconds: number, work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`did not finish within ${seconds} s`)), seconds * 1_000),
    ),
  ]);
}

describe("write posture of the replay (R1-writes-forced-on-runner)", () => {
  for (const writesEnabled of [false, true]) {
    it(`serves the replay with the launching server's write switch (${writesEnabled})`, async () => {
      const { runDir } = await prepareRun(writesEnabled);
      const requested: unknown[] = [];

      const cli = await runCli(["test-run", "--run-dir", runDir], {
        detachedTestRun: {
          // The runner calls this seam with the recorded write switch.
          createToolRuntime: (async (options: unknown) => {
            requested.push(options);
            return { tools: passingTools(), serverOptions: {} };
          }) as () => Promise<{ tools: ReturnType<typeof passingTools>; serverOptions: object }>,
          processProbe: probe,
          runnerPid: 2_000,
        },
      });

      expect(cli.exitCode).toBe(0);
      expect(requested).toEqual([{ writesEnabled }]);
    });
  }
});

describe("in-process server (R3-inprocess-start-failure, R3-runner-options-subset)", () => {
  it("ends the run failed and frees the database when the server cannot start", async () => {
    const { operationId, runDir } = await prepareRun(true);
    const broken = {} as StdioServerOptions;
    Object.defineProperty(broken, "toolSurface", {
      enumerable: true,
      get() {
        throw new Error("server options unavailable");
      },
    });

    const cli = await withinSeconds(
      5,
      runCli(["test-run", "--run-dir", runDir], {
        detachedTestRun: {
          createToolRuntime: async () => ({ tools: passingTools(), serverOptions: broken }),
          processProbe: probe,
          runnerPid: 2_000,
        },
      }),
    );

    expect(cli.exitCode).toBe(1);
    const view = await store.readTestRun(operationId);
    expect(view).toMatchObject({
      status: "failed",
      error: { code: "TEST_RUN_INVOCATION_FAILED" },
    });
    expect(view?.error?.message).toContain("server options unavailable");
    await expect(store.getActiveDetachedRun(ACCESS_PATH)).resolves.toBeUndefined();
  });

  it("serves the replay with the server's options but leaves telemetry to the server", async () => {
    const { operationId, runDir } = await prepareRun(true);
    const telemetryCalls: string[] = [];
    const serverOptions: StdioServerOptions = {
      resultValidationPolicy: "enforce",
      toolSurface: "core",
      invocationContextResolver: async () => {
        telemetryCalls.push("invocation");
        return { cwd: projectRoot, enabled: true, writeExecutionPolicy: "developer" } as never;
      },
      invocationRecorder: {
        record: async () => {
          telemetryCalls.push("record");
        },
      } as never,
    };

    const cli = await runCli(["test-run", "--run-dir", runDir], {
      detachedTestRun: {
        createToolRuntime: async () => ({ tools: passingTools(), serverOptions }),
        processProbe: probe,
        runnerPid: 2_000,
      },
    });

    expect(cli.exitCode).toBe(0);
    expect(telemetryCalls).toEqual([]);
    await expect(store.readTestRun(operationId)).resolves.toMatchObject({ status: "passed" });
  });
});

describe("launch method (R3-job-object-survival)", () => {
  it("records the launch method its environment names", async () => {
    const { operationId, runDir } = await prepareRun(true);

    await runCli(["test-run", "--run-dir", runDir], {
      env: { DYSFLOW_TEST_RUN_LAUNCH: "wmi" },
      detachedTestRun: {
        createToolRuntime: async () => ({ tools: passingTools(), serverOptions: {} }),
        processProbe: probe,
        runnerPid: 2_000,
      },
    });

    const state = JSON.parse(
      await readFile(join(resolveTestRunsRoot(projectRoot), operationId, "state.json"), "utf8"),
    ) as { launchMethod?: unknown };
    expect(state.launchMethod).toBe("wmi");
  });
});
