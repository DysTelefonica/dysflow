import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
  TEST_RUN_SPAWN_FAILED,
} from "../../core/contracts/index.js";
import {
  type AccessOperationRecord,
  type AccessOperationRegistry,
  isInterruptedStartingRecord,
} from "../../core/operations/access-operation-registry.js";
import { canonicalizeAccessLockIdentity } from "../../core/runner/cross-process-lock.js";
import { TEST_RUN_OPERATION_ID_ENV } from "../../core/test-runs/test-run-model.js";
import {
  synchronousTestRunActiveError,
  type TestRunStore,
  testRunAlreadyActiveError,
} from "../../core/test-runs/test-run-store.js";
import { logSwallowedIoError } from "../../core/utils/log-swallowed-io-error.js";
import { createNodeTestRunStore, spawnDetachedTestRunner } from "../test-runs/index.js";

/**
 * Start the hidden runner on a prepared run directory and return its PID.
 * `onError` reports a spawn that fails after the PID was returned.
 */
export type SpawnTestRunner = (
  runDir: string,
  env: Record<string, string | undefined>,
  onError: (err: unknown) => void,
) => number;

/** Injectable I/O of the detached `test_vba` route; tests fake the spawn and the probe. */
export type DetachedTestRunSeams = {
  /** The run store of one project; defaults to the production store. */
  createStore?: (projectRoot: string) => TestRunStore;
  spawnRunner?: SpawnTestRunner;
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
 * `start` is refused while another detached run holds the database, and also
 * while a synchronous `test_vba` drives it (a live tracked `test_vba`
 * operation in the registry), so two Access never run on one database (S2).
 * A spawn that fails after returning a PID crashes the run and frees the lock
 * at once, instead of waiting for the no-runner crash window.
 *
 * `refuseWhileActive` is the synchronous guard: while a detached run holds the
 * database, a synchronous run is refused, except the call the run's own runner
 * makes (its environment names the run). A guard that cannot read the lock
 * logs it and lets the synchronous run through (S6): an unreadable lock proves
 * no live holder.
 */
export class DetachedTestRunLauncher {
  private readonly createStore: (projectRoot: string) => TestRunStore;
  private readonly spawnRunner: SpawnTestRunner;

  constructor(
    private readonly env: Record<string, string | undefined>,
    private readonly accessPassword: string | undefined,
    seams: DetachedTestRunSeams = {},
    private readonly operationRegistry?: AccessOperationRegistry,
  ) {
    this.createStore = seams.createStore ?? createNodeTestRunStore;
    this.spawnRunner =
      seams.spawnRunner ??
      ((runDir, env, onError) =>
        spawnDetachedTestRunner(runDir, env as NodeJS.ProcessEnv, { onError }));
  }

  async start(
    target: DetachedTestRunTarget,
    params: Record<string, unknown>,
    plannedTests: readonly string[],
  ): Promise<OperationResult<unknown>> {
    const { detach: _detach, ...syncInput } = params;
    const store = this.createStore(target.projectRoot);
    // The detached lock is read first: a detached runner's own inner call is a
    // live synchronous record too, and must be reported as the detached run.
    const detachedHolder = await store.getActiveDetachedRun(target.accessPath);
    if (detachedHolder !== undefined) {
      return failureResult(testRunAlreadyActiveError(detachedHolder));
    }
    const synchronous = await this.activeSynchronousRun(store, target.accessPath);
    if (synchronous !== undefined) {
      return failureResult(synchronousTestRunActiveError(synchronous));
    }

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
      this.spawnRunner(runDir, env, (err) => {
        this.abandonUnstartedRun(store, operationId, err).catch((abandonErr: unknown) =>
          logSwallowedIoError("detached-test-run-launcher:async-spawn-error", abandonErr),
        );
      });
    } catch (err) {
      const message = spawnFailureMessage(err);
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
    let active: Awaited<ReturnType<TestRunStore["getActiveDetachedRun"]>>;
    try {
      active = await this.createStore(target.projectRoot).getActiveDetachedRun(target.accessPath);
    } catch (err) {
      logSwallowedIoError("detached-test-run-launcher:sync-guard", err);
      return undefined;
    }
    if (active === undefined || active.operationId === this.env[TEST_RUN_OPERATION_ID_ENV]) {
      return undefined;
    }
    return failureResult(testRunAlreadyActiveError(active));
  }

  /**
   * A spawn that failed after returning a PID: the runner never started, so
   * the run is crashed and its lock released. A runner that already recorded
   * itself owns its run; a late `error` never overrides it.
   */
  private async abandonUnstartedRun(
    store: TestRunStore,
    operationId: string,
    err: unknown,
  ): Promise<void> {
    const state = await store.readState(operationId);
    if (state === undefined || state.status !== "running" || state.runner !== null) return;
    await store.abandonRun(operationId, {
      code: TEST_RUN_SPAWN_FAILED,
      message: spawnFailureMessage(err),
    });
  }

  /**
   * The synchronous `test_vba` driving `accessPath` now, read from the
   * operation registry: a `starting`/`running` `test_vba` record that is not
   * an interrupted start and whose recorded Access process is still alive. A
   * registry that cannot be read is logged and reads as none; the detached
   * lock stays the guard.
   */
  private async activeSynchronousRun(
    store: TestRunStore,
    accessPath: string,
  ): Promise<AccessOperationRecord | undefined> {
    if (this.operationRegistry === undefined) return undefined;
    let records: AccessOperationRecord[];
    try {
      records = await this.operationRegistry.listRecent();
    } catch (err) {
      logSwallowedIoError("detached-test-run-launcher:registry-read", err);
      return undefined;
    }
    const target = canonicalizeAccessLockIdentity(accessPath);
    const nowMs = Date.now();
    for (const record of records) {
      if (record.metadata.toolName !== "test_vba") continue;
      if (record.status !== "starting" && record.status !== "running") continue;
      if (canonicalizeAccessLockIdentity(record.accessPath) !== target) continue;
      if (isInterruptedStartingRecord(record, nowMs)) continue;
      const pid = record.accessPid;
      if (
        pid !== null &&
        !(await store.isProcessAlive({ pid, startTime: record.processStartTime }))
      ) {
        continue;
      }
      return record;
    }
    return undefined;
  }
}

function spawnFailureMessage(err: unknown): string {
  return `The detached test runner could not be started: ${err instanceof Error ? err.message : String(err)}`;
}
