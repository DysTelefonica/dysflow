/**
 * #1993 T3c — the detached runner always leaves a terminal state and frees
 * the database, keeps a heartbeat while it runs, and records how it was
 * started.
 *
 * Driven through `runDetachedTestRun` and the real store over a temporary
 * directory; only the process probe and the `test_vba` invocation are faked.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeTestRunFileSystem } from "../../../src/adapters/test-runs/node-test-run-file-system";
import { runDetachedTestRun } from "../../../src/core/test-runs/detached-test-runner";
import type {
  ProcessProbeResult,
  RunnerProcessProbe,
} from "../../../src/core/test-runs/test-run-ports";
import { TestRunStore } from "../../../src/core/test-runs/test-run-store";

const ACCESS_PATH = "C:\\Projects\\App\\Frontend.accdb";
const STARTED = "2026-11-05T08:00:00.000Z";
const PASSED = {
  isError: false,
  structuredContent: { mode: "apply", passed: 1, failed: 0, tests: [{ procedure: "T", ok: true }] },
};

class AliveProbe implements RunnerProcessProbe {
  async inspect(): Promise<ProcessProbeResult> {
    return { alive: true, startTime: STARTED };
  }
}

let runsRoot: string;

function store(): TestRunStore {
  return new TestRunStore({
    runsRoot,
    fileSystem: nodeTestRunFileSystem,
    processProbe: new AliveProbe(),
    selfPid: 100,
    createOperationId: () => "run-001",
  });
}

async function prepare(target: TestRunStore): Promise<string> {
  const prepared = await target.prepareRun({
    input: { proceduresJson: "[]", apply: true },
    accessPath: ACCESS_PATH,
    plannedTests: ["T"],
  });
  if (!prepared.ok) throw new Error(prepared.error.message);
  return prepared.operationId;
}

async function readState(operationId: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(runsRoot, operationId, "state.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

beforeEach(async () => {
  runsRoot = await mkdtemp(join(tmpdir(), "dysflow-detached-runner-hardening-"));
});

afterEach(async () => {
  await rm(runsRoot, { recursive: true, force: true });
});

describe("a run whose request cannot be read (R3-missing-request-leaves-running)", () => {
  for (const [label, damage] of [
    ["is missing", (path: string) => rm(path, { force: true })],
    ["is corrupt", (path: string) => writeFile(path, "{ not json", "utf8")],
  ] as const) {
    it(`ends failed with a clear error and frees the database when request.json ${label}`, async () => {
      const target = store();
      const operationId = await prepare(target);
      await damage(join(runsRoot, operationId, "request.json"));
      let invoked = false;

      const outcome = await runDetachedTestRun({
        store: target,
        operationId,
        runnerPid: 200,
        invoke: async () => {
          invoked = true;
          return PASSED;
        },
      });

      expect(invoked).toBe(false);
      expect(outcome).toMatchObject({ operationId, status: "failed" });
      expect(outcome.exitCode).not.toBe(0);
      const view = await target.readTestRun(operationId);
      expect(view).toMatchObject({
        status: "failed",
        error: { code: "TEST_RUN_REQUEST_UNREADABLE" },
      });
      expect(view?.error?.message).toContain("request.json");
      expect(view?.finishedAt).not.toBeNull();
      await expect(target.getActiveDetachedRun(ACCESS_PATH)).resolves.toBeUndefined();
    });
  }
});

describe("runner heartbeat (R4-null-start-time-pins-lock)", () => {
  it("refreshes updatedAt while a test runs without progress", async () => {
    const target = store();
    const operationId = await prepare(target);
    const seen = new Set<string>();

    await runDetachedTestRun({
      store: target,
      operationId,
      runnerPid: 200,
      heartbeatIntervalMs: 20,
      invoke: async () => {
        for (let index = 0; index < 15; index += 1) {
          await new Promise((resolve) => setTimeout(resolve, 15));
          seen.add(String((await readState(operationId)).updatedAt));
        }
        return PASSED;
      },
    });

    expect(seen.size).toBeGreaterThanOrEqual(3);
    await expect(target.readTestRun(operationId)).resolves.toMatchObject({ status: "passed" });
  });
});

describe("launch method (R3-job-object-survival)", () => {
  it("records how the runner was started in state.json", async () => {
    const target = store();
    const operationId = await prepare(target);
    let whileRunning: unknown;

    await runDetachedTestRun({
      store: target,
      operationId,
      runnerPid: 200,
      launchMethod: "wmi",
      invoke: async () => {
        whileRunning = (await readState(operationId)).launchMethod;
        return PASSED;
      },
    });

    expect(whileRunning).toBe("wmi");
    expect((await readState(operationId)).launchMethod).toBe("wmi");
  });
});

describe("one runner per run (#1993 S2, R3/R4-wmi-timeout-double-runner)", () => {
  it("lets exactly one of two runners started for the same run drive test_vba", async () => {
    const target = store();
    const operationId = await prepare(target);
    let invocations = 0;
    let release: () => void = () => undefined;
    const running = new Promise<void>((resolve) => {
      release = resolve;
    });
    const invoke = async () => {
      invocations += 1;
      await running;
      return PASSED;
    };

    const first = runDetachedTestRun({ store: target, operationId, runnerPid: 200, invoke });
    const second = runDetachedTestRun({ store: target, operationId, runnerPid: 300, invoke });
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    const outcomes = await Promise.all([first, second]);

    expect(invocations).toBe(1);
    expect(outcomes.filter((outcome) => outcome.exitCode === 3)).toHaveLength(1);
    await expect(target.readTestRun(operationId)).resolves.toMatchObject({ status: "passed" });
  });

  it("exits without touching Access or the lock when state.json records another live runner", async () => {
    const target = store();
    const operationId = await prepare(target);
    await target.updateState(operationId, (state) => ({
      ...state,
      runner: { pid: 200, startTime: STARTED },
    }));
    await target.acquireLock(ACCESS_PATH, { operationId, pid: 200, startTime: STARTED });
    const lockBefore = await target.getActiveDetachedRun(ACCESS_PATH);
    const stateBefore = await readState(operationId);
    let invoked = false;

    const outcome = await runDetachedTestRun({
      store: target,
      operationId,
      runnerPid: 300,
      invoke: async () => {
        invoked = true;
        return PASSED;
      },
    });

    expect(invoked).toBe(false);
    expect(outcome).toMatchObject({ operationId, status: "running", exitCode: 3 });
    await expect(target.getActiveDetachedRun(ACCESS_PATH)).resolves.toEqual(lockBefore);
    expect(await readState(operationId)).toEqual(stateBefore);
  });
});
