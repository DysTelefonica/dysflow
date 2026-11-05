import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
  TEST_RUN_SPAWN_FAILED,
} from "../../core/contracts/index.js";
import { TEST_RUN_OPERATION_ID_ENV } from "../../core/test-runs/test-run-model.js";
import {
  type TestRunStore,
  testRunAlreadyActiveError,
} from "../../core/test-runs/test-run-store.js";
import { createNodeTestRunStore, spawnDetachedTestRunner } from "../test-runs/index.js";

/** Injectable I/O of the detached `test_vba` route; tests fake the spawn and the probe. */
export type DetachedTestRunSeams = {
  /** The run store of one project; defaults to the production store. */
  createStore?: (projectRoot: string) => TestRunStore;
  /** Start the hidden runner on a prepared run directory and return its PID. */
  spawnRunner?: (runDir: string, env: Record<string, string | undefined>) => number;
};

export type DetachedTestRunTarget = { accessPath: string; projectRoot: string };

/**
 * Issue #1993 D1 / Q1 — the server side of a detached `test_vba` run.
 *
 * `start` prepares the run directory and the per-accessPath lock, then spawns
 * the hidden `dysflow test-run` runner and returns at once. The runner replays
 * the stored request synchronously, so the stored input never carries
 * `detach`, and the password reaches it only through its environment.
 *
 * `refuseWhileActive` is the synchronous guard: while a detached run holds the
 * database, a synchronous run is refused, except the call the run's own runner
 * makes (its environment names the run).
 */
export class DetachedTestRunLauncher {
  private readonly createStore: (projectRoot: string) => TestRunStore;
  private readonly spawnRunner: (runDir: string, env: Record<string, string | undefined>) => number;

  constructor(
    private readonly env: Record<string, string | undefined>,
    private readonly accessPassword: string | undefined,
    seams: DetachedTestRunSeams = {},
  ) {
    this.createStore = seams.createStore ?? createNodeTestRunStore;
    this.spawnRunner =
      seams.spawnRunner ??
      ((runDir, env) => spawnDetachedTestRunner(runDir, env as NodeJS.ProcessEnv));
  }

  async start(
    target: DetachedTestRunTarget,
    params: Record<string, unknown>,
    plannedTests: readonly string[],
  ): Promise<OperationResult<unknown>> {
    const { detach: _detach, ...syncInput } = params;
    const store = this.createStore(target.projectRoot);
    const prepared = await store.prepareRun({
      input: syncInput,
      accessPath: target.accessPath,
      plannedTests,
    });
    if (!prepared.ok) return failureResult(prepared.error);

    const { operationId, runDir } = prepared;
    const env = {
      ...this.env,
      [TEST_RUN_OPERATION_ID_ENV]: operationId,
      ...(this.accessPassword === undefined
        ? {}
        : { DYSFLOW_ACCESS_PASSWORD: this.accessPassword }),
    };
    try {
      this.spawnRunner(runDir, env);
    } catch (err) {
      const message = `The detached test runner could not be started: ${err instanceof Error ? err.message : String(err)}`;
      await store.abandonRun(operationId, { code: TEST_RUN_SPAWN_FAILED, message });
      return failureResult(
        createDysflowError(TEST_RUN_SPAWN_FAILED, message, { details: { operationId } }),
      );
    }
    return successResult({
      mode: "apply",
      detached: true,
      operationId,
      status: "running",
      testsPlanned: plannedTests.length,
      accessPath: target.accessPath,
      fetchWith: { tool: "get_test_run", operationId },
    });
  }

  async refuseWhileActive(
    target: DetachedTestRunTarget,
  ): Promise<OperationResult<unknown> | undefined> {
    const active = await this.createStore(target.projectRoot).getActiveDetachedRun(
      target.accessPath,
    );
    if (active === undefined || active.operationId === this.env[TEST_RUN_OPERATION_ID_ENV]) {
      return undefined;
    }
    return failureResult(testRunAlreadyActiveError(active));
  }
}
