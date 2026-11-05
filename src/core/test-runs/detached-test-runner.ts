import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";
import {
  applyTestVbaNotification,
  innerAccessOperationId,
  type TestRunStatus,
  terminalStatusForResult,
} from "./test-run-model.js";
import type { TestRunStore } from "./test-run-store.js";

/** One #1990 progress notification: `progress` finished tests out of `total`. */
export type TestRunProgressCallback = (progress: number, total?: number, message?: string) => void;

/**
 * Runs `test_vba` through the same tool handler path the MCP server uses and
 * resolves the MCP tool result exactly as a synchronous caller receives it.
 */
export type TestVbaInvoker = (
  input: Record<string, unknown>,
  onProgress: TestRunProgressCallback,
) => Promise<unknown>;

export type DetachedTestRunOutcome = {
  operationId: string;
  status: TestRunStatus;
  exitCode: number;
};

/**
 * Issue #1993 D2 — the body of the hidden `dysflow test-run` command.
 *
 * Records the runner's own identity, holds the accessPath lock for the whole
 * run, mirrors every progress notification into `state.json`, then stores the
 * tool result in `result.json` before marking the run terminal: a reader that
 * sees a terminal status always finds the result. The lock is released however
 * the run ends.
 */
export async function runDetachedTestRun(options: {
  store: TestRunStore;
  operationId: string;
  invoke: TestVbaInvoker;
  runnerPid?: number;
}): Promise<DetachedTestRunOutcome> {
  const { store, operationId, invoke } = options;
  const request = await store.readRequest(operationId);
  if (request === undefined) {
    return { operationId, status: "crashed", exitCode: 2 };
  }
  const runner = await store.identify(options.runnerPid ?? process.pid);
  const lock = await store.acquireLock(request.accessPath, { operationId, ...runner });
  if (!lock.ok) {
    await store.updateState(operationId, (state) => ({
      ...state,
      status: "failed",
      runner,
      finishedAt: new Date().toISOString(),
      error: { code: lock.error.code, message: lock.error.message },
    }));
    return { operationId, status: "failed", exitCode: 1 };
  }

  try {
    await store.updateState(operationId, (state) => ({ ...state, status: "running", runner }));

    // Progress writes are chained so they land in order and the final state
    // write never races a late progress write.
    let progressWrites: Promise<unknown> = Promise.resolve();
    const onProgress: TestRunProgressCallback = (progress, total, message) => {
      progressWrites = progressWrites
        .then(() =>
          store.updateState(operationId, (state) =>
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
          ),
        )
        .catch((err: unknown) => logSwallowedIoError("detached-test-runner:progress", err));
    };

    let result: unknown;
    try {
      result = await invoke(request.input, onProgress);
    } catch (err) {
      await progressWrites;
      await store.updateState(operationId, (state) => ({
        ...state,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: {
          code: "TEST_RUN_INVOCATION_FAILED",
          message: err instanceof Error ? err.message : String(err),
        },
      }));
      return { operationId, status: "failed", exitCode: 1 };
    }

    await progressWrites;
    await store.writeResult(operationId, result);
    const status = terminalStatusForResult(result);
    await store.updateState(operationId, (state) => ({
      ...state,
      status,
      accessOperationId: innerAccessOperationId(result) ?? state.accessOperationId,
      progress: { ...state.progress, currentTest: null },
      finishedAt: new Date().toISOString(),
    }));
    return { operationId, status, exitCode: status === "passed" ? 0 : 1 };
  } finally {
    await store.releaseLock(request.accessPath, operationId);
  }
}
