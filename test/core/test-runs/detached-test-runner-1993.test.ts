/**
 * #1993 S3 — the final progress of a detached run agrees with its stored
 * result, even when the runner never received a progress notification for
 * the last tests (the #1990 marker can lag the result).
 *
 * Driven through `runDetachedTestRun` and the real store over a temporary
 * directory; only the process probe and the `test_vba` invocation are faked.
 */
import { mkdtemp, rm } from "node:fs/promises";
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
const PLAN = ["Test_One", "Test_Two", "Test_Three"];

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

async function runWith(
  result: unknown,
  notify: (onProgress: (progress: number, total?: number, message?: string) => void) => void = () =>
    undefined,
) {
  const target = store();
  const prepared = await target.prepareRun({
    input: { proceduresJson: "[]", apply: true },
    accessPath: ACCESS_PATH,
    plannedTests: PLAN,
  });
  if (!prepared.ok) throw new Error("prepare failed");
  await runDetachedTestRun({
    store: target,
    operationId: prepared.operationId,
    runnerPid: 200,
    invoke: async (_input, onProgress) => {
      notify(onProgress);
      return result;
    },
  });
  return target.readTestRun(prepared.operationId);
}

function test(procedure: string, ok: boolean) {
  return { procedure, ok };
}

beforeEach(async () => {
  runsRoot = await mkdtemp(join(tmpdir(), "dysflow-detached-runner-"));
});

afterEach(async () => {
  await rm(runsRoot, { recursive: true, force: true });
});

describe("final progress of a detached run (#1993 S3)", () => {
  it("counts an all-green result even when no progress notification arrived", async () => {
    const view = await runWith({
      isError: false,
      structuredContent: {
        mode: "apply",
        passed: 3,
        failed: 0,
        tests: PLAN.map((name) => test(name, true)),
      },
    });

    expect(view?.status).toBe("passed");
    expect(view?.progress).toEqual({
      completed: 3,
      planned: 3,
      currentTest: null,
      passed: 3,
      failed: 0,
    });
  });

  it("counts a VBA_TESTS_FAILED result even when no progress notification arrived", async () => {
    const view = await runWith({
      isError: true,
      structuredContent: {
        error: {
          code: "VBA_TESTS_FAILED",
          details: {
            failedCount: 1,
            failures: [{ procedure: "Test_Two" }],
            results: [test("Test_One", true), test("Test_Two", false), test("Test_Three", true)],
          },
        },
      },
    });

    expect(view?.status).toBe("failed");
    expect(view?.progress).toEqual({
      completed: 3,
      planned: 3,
      currentTest: null,
      passed: 2,
      failed: 1,
    });
  });

  it("corrects a progress that lagged behind the result", async () => {
    const view = await runWith(
      {
        isError: false,
        structuredContent: {
          mode: "apply",
          passed: 3,
          failed: 0,
          tests: PLAN.map((name) => test(name, true)),
        },
      },
      (onProgress) => onProgress(1, 3, "Test_One passed"),
    );

    expect(view?.progress).toEqual({
      completed: 3,
      planned: 3,
      currentTest: null,
      passed: 3,
      failed: 0,
    });
  });

  it("keeps the received progress when the result counts no tests", async () => {
    const view = await runWith(
      {
        isError: true,
        structuredContent: { error: { code: "CONFIG_MISSING_ACCESS_PATH", message: "no db" } },
      },
      (onProgress) => onProgress(1, 3, "Test_One passed"),
    );

    expect(view?.status).toBe("failed");
    expect(view?.progress).toEqual({
      completed: 1,
      planned: 3,
      currentTest: null,
      passed: 1,
      failed: 0,
    });
  });
});
