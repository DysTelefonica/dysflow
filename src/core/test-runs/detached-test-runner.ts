import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";
import {
  applyTestVbaNotification,
  finalProgressForResult,
  innerAccessOperationId,
  TEST_RUN_HEARTBEAT_INTERVAL_MS,
  TEST_RUN_INVOCATION_FAILED,
  TEST_RUN_REQUEST_UNREADABLE,
  type TestRunLaunchMethod,
  type TestRunState,
  type TestRunStatus,
  terminalStatusForResult,
} from "./test-run-model.js";
import { TEST_RUN_FILES, type TestRunStore } from "./test-run-store.js";

/** One #1990 progress notification: `progress` finished tests out of `total`. */
export type TestRunProgressCallback = (progress: number, total?: number, message?: string) => void;

/**
 * Runs `test_vba` through the same tool handler path the MCP server uses and
 * resolves the MCP tool result exactly as a synchronous caller receives it.
 * `writesEnabled` is the launching server's session write switch, recorded
 * in the request, so the replay is gated as the detached start was.
 */
export type TestVbaInvoker = (
  input: Record<string, unknown>,
  onProgress: TestRunProgressCallback,
  context: { writesEnabled: boolean },
) => Promise<unknown>;

export type DetachedTestRunOutcome = {
  operationId: string;
  status: TestRunStatus;
  exitCode: number;
};

/**
 * Issue #1993 D2 — the body of the hidden `dysflow test-run` command.
 *
 * Records the runner's own identity and how it was started, holds the
 * accessPath lock for the whole run, mirrors every progress notification into
 * `state.json` and refreshes it on a heartbeat (so a runner whose identity
 * the OS cannot verify is not mistaken for a recycled PID), then stores the
 * tool result in `result.json` before marking the run terminal: a reader that
 * sees a terminal status always finds the result, and its final progress is
 * counted from that result.
 *
 * Every way the run ends leaves a terminal state and releases the lock: a
 * request that cannot be read, a refused lock, an invocation that throws.
 */
export async function runDetachedTestRun(options: {
  store: TestRunStore;
  operationId: string;
  invoke: TestVbaInvoker;
  runnerPid?: number;
  launchMethod?: TestRunLaunchMethod | null;
  heartbeatIntervalMs?: number;
}): Promise<DetachedTestRunOutcome> {
  const { store, operationId, invoke } = options;
  const runner = await store.identify(options.runnerPid ?? process.pid);
  const launchMethod = options.launchMethod ?? null;
  const request = await store.readRequest(operationId);
  if (request === undefined) {
    // Without a request there is nothing to run; the state still names the
    // database, so its lock is released.
    const state = await store.updateState(operationId, (current) =>
      endWith(current, "failed", {
        code: TEST_RUN_REQUEST_UNREADABLE,
        message: `The run's ${TEST_RUN_FILES.request} is missing or unreadable; nothing was run.`,
      }),
    );
    if (state === undefined) return { operationId, status: "crashed", exitCode: 2 };
    await store.releaseLock(state.accessPath, operationId);
    return { operationId, status: "failed", exitCode: 1 };
  }
  const lock = await store.acquireLock(request.accessPath, { operationId, ...runner });
  if (!lock.ok) {
    // The lock belongs to another run: this one ends without touching it.
    await store.updateState(operationId, (state) => ({
      ...endWith(state, "failed", { code: lock.error.code, message: lock.error.message }),
      runner,
      launchMethod,
    }));
    return { operationId, status: "failed", exitCode: 1 };
  }

  // State writes are chained so they land in order and the final state write
  // never races a late progress or heartbeat write.
  let stateWrites: Promise<unknown> = Promise.resolve();
  const queueStateWrite = (label: string, update: (state: TestRunState) => TestRunState) => {
    stateWrites = stateWrites
      .then(() => store.updateState(operationId, update))
      .catch((err: unknown) => logSwallowedIoError(`detached-test-runner:${label}`, err));
  };
  const heartbeat = setInterval(
    () => queueStateWrite("heartbeat", (state) => state),
    options.heartbeatIntervalMs ?? TEST_RUN_HEARTBEAT_INTERVAL_MS,
  );
  heartbeat.unref();

  try {
    await store.updateState(operationId, (state) => ({
      ...state,
      status: "running",
      runner,
      launchMethod,
    }));

    const onProgress: TestRunProgressCallback = (progress, total, message) => {
      queueStateWrite("progress", (state) =>
        state.status === "running"
          ? {
              ...state,
              progress: applyTestVbaNotification(state.progress, request.plannedTests, {
                progress,
                ...(total === undefined ? {} : { total }),
                ...(message === undefined ? {} : { message }),
              }),
            }
          : state,
      );
    };

    let result: unknown;
    try {
      result = await invoke(request.input, onProgress, { writesEnabled: request.writesEnabled });
    } catch (err) {
      clearInterval(heartbeat);
      await stateWrites;
      await store.updateState(operationId, (state) =>
        endWith(state, "failed", {
          code: TEST_RUN_INVOCATION_FAILED,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return { operationId, status: "failed", exitCode: 1 };
    }

    clearInterval(heartbeat);
    await stateWrites;
    await store.writeResult(operationId, result);
    const status = terminalStatusForResult(result);
    await store.updateState(operationId, (state) => ({
      ...state,
      status,
      accessOperationId: innerAccessOperationId(result) ?? state.accessOperationId,
      progress: finalProgressForResult(state.progress, result),
      finishedAt: new Date().toISOString(),
    }));
    return { operationId, status, exitCode: status === "passed" ? 0 : 1 };
  } finally {
    clearInterval(heartbeat);
    await stateWrites;
    await store.releaseLock(request.accessPath, operationId);
  }
}

function endWith(
  state: TestRunState,
  status: "failed",
  error: { code: string; message: string },
): TestRunState {
  return { ...state, status, finishedAt: new Date().toISOString(), error };
}
