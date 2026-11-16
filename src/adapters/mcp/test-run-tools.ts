import {
  createDysflowError,
  failureResult,
  successResult,
  TEST_RUN_NOT_FOUND,
} from "../../core/contracts/index.js";
import {
  isValidTestRunOperationId,
  TEST_RUN_MAX_WAIT_SECONDS,
  TEST_RUN_READ_FAILED,
  TEST_RUN_WAIT_POLL_MS,
  type TestRunView,
} from "../../core/test-runs/test-run-model.js";
import type { TestRunStore } from "../../core/test-runs/test-run-store.js";
import { isRecord } from "../../core/utils/index.js";
import { createNodeTestRunStore } from "../test-runs/index.js";
import { getTestRunResultContract } from "./contracts/remaining-result-contracts.js";
import { resolveCwdOverride } from "./cwd-override.js";
import { invalidInput } from "./dispatch-common.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import {
  type DysflowMcpTool,
  type McpAccessContextResolver,
  translateCoreResultToMcpContent,
} from "./result-translation.js";
import { GET_TEST_RUN_SCHEMA } from "./schemas.js";
import { validateInput } from "./validator.js";

/** Time, injectable so a test can drive the long-poll without waiting. */
export type TestRunPolling = {
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

/**
 * Reads of a run's state that may fail for a moment (the runner replacing
 * `state.json`, an antivirus holding it) before the run is judged unreadable.
 */
const READ_ATTEMPTS = 3;
const READ_RETRY_MS = 50;

type RunRead =
  | { kind: "found"; view: TestRunView }
  | { kind: "gone" }
  | { kind: "unreadable"; reason: string };

/**
 * Read a run, retrying a state that cannot be read for a moment. A run is
 * `gone` only when its directory no longer exists; a directory whose state
 * stays unreadable is `unreadable`, never reported as not found.
 */
async function readRun(
  store: TestRunStore,
  operationId: string,
  polling: TestRunPolling,
): Promise<RunRead> {
  let reason = "state.json is missing or unreadable";
  for (let attempt = 1; ; attempt += 1) {
    try {
      const view = await store.readTestRun(operationId);
      if (view !== undefined) return { kind: "found", view };
      reason = "state.json is missing or unreadable";
      if (!(await store.runExists(operationId))) return { kind: "gone" };
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }
    if (attempt >= READ_ATTEMPTS) return { kind: "unreadable", reason };
    await polling.sleep(READ_RETRY_MS);
  }
}

const realPolling: TestRunPolling = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

export type GetTestRunToolOptions = {
  cwd: string;
  accessContextResolver: McpAccessContextResolver;
  createStore?: (projectRoot: string) => TestRunStore;
  polling?: TestRunPolling;
};

/**
 * Issue #1993 D4 — `get_test_run`, the read side of a detached `test_vba`.
 *
 * Reads only the run's own files under `.dysflow/runtime/test-runs/`, never
 * the operation registry, so it never waits on a running test. A terminal run
 * carries the stored synchronous `test_vba` result (`structuredContent`), so
 * the caller reads the same `passed`/`failed`/`tests[]` or `VBA_TESTS_FAILED`
 * details a synchronous call returns.
 *
 * A run whose directory is gone answers `TEST_RUN_NOT_FOUND`. A run whose
 * state cannot be read for a moment is retried; one that stays unreadable
 * answers the retryable `TEST_RUN_READ_FAILED`, and a long-poll keeps the
 * last state it read and polls on.
 */
export function createGetTestRunTool(options: GetTestRunToolOptions): DysflowMcpTool {
  const createStore = options.createStore ?? createNodeTestRunStore;
  const polling = options.polling ?? realPolling;

  // An explicit projectId that does not resolve is the caller's real error:
  // it is returned, never swallowed into a cwd lookup that would answer
  // TEST_RUN_NOT_FOUND. Without a projectId, a missing project config falls
  // back to the cwd (or its override).
  const resolveProjectRoot = async (
    input: unknown,
  ): Promise<
    { ok: true; root: string } | { ok: false; error: ReturnType<typeof invalidInput> }
  > => {
    const context = await options.accessContextResolver(input);
    if (context.ok && context.data.projectRoot.length > 0) {
      return { ok: true, root: context.data.projectRoot };
    }
    if (!context.ok && isRecord(input) && typeof input.projectId === "string") {
      return { ok: false, error: translateCoreResultToMcpContent(context) };
    }
    const cwd = resolveCwdOverride(input, options.cwd);
    return cwd.ok ? { ok: true, root: cwd.cwd } : { ok: false, error: cwd.error };
  };

  return {
    name: "get_test_run",
    resultContract: getTestRunResultContract,
    description: `Read a detached test_vba run (test_vba with detach:true and apply:true) by operationId: status running|passed|failed|cancelled|crashed, progress {completed, planned, currentTest, passed, failed}, and once it ended the same result the synchronous test_vba returns. wait long-polls up to ${TEST_RUN_MAX_WAIT_SECONDS} s. ${MCP_TOOL_CONTRACTS.get_test_run.summary}`,
    inputSchema: GET_TEST_RUN_SCHEMA,
    handler: async (input) => {
      const validation = validateInput(input, GET_TEST_RUN_SCHEMA);
      if (validation !== undefined) return invalidInput(validation);
      const params = input as { operationId: string; wait?: number };
      if (!isValidTestRunOperationId(params.operationId)) {
        return invalidInput(
          `operationId '${params.operationId}' is not a test run id.`,
          "Pass the operationId test_vba returned with detach:true.",
          { rejectedFlag: "operationId", toolName: "get_test_run" },
        );
      }
      const root = await resolveProjectRoot(input);
      if (!root.ok) return root.error;

      const store = createStore(root.root);
      const first = await readRun(store, params.operationId, polling);
      if (first.kind === "gone") {
        return translateCoreResultToMcpContent(
          failureResult(
            createDysflowError(
              TEST_RUN_NOT_FOUND,
              `No test run '${params.operationId}' under ${root.root}.`,
              { details: { operationId: params.operationId, projectRoot: root.root } },
            ),
          ),
        );
      }
      if (first.kind === "unreadable") {
        return translateCoreResultToMcpContent(
          failureResult(
            createDysflowError(
              TEST_RUN_READ_FAILED,
              `Test run '${params.operationId}' exists under ${root.root}, but its state could not be read: ${first.reason}`,
              {
                retryable: true,
                remediation:
                  "Call get_test_run again in a moment: the run exists, and its state file is being replaced or is held open by another process.",
                details: {
                  operationId: params.operationId,
                  projectRoot: root.root,
                  retryable: true,
                },
              },
            ),
          ),
        );
      }
      let view = first.view;
      const deadline = polling.now() + waitSeconds(params.wait) * 1_000;
      while (view.status === "running") {
        const remaining = deadline - polling.now();
        if (remaining <= 0) break;
        await polling.sleep(Math.min(TEST_RUN_WAIT_POLL_MS, remaining));
        const next = await readRun(store, params.operationId, polling);
        // An unreadable moment keeps the last state read; the poll goes on.
        if (next.kind === "unreadable") continue;
        // A run pruned while waiting is gone: answer that, never a stale view.
        if (next.kind === "gone") {
          return translateCoreResultToMcpContent(
            failureResult(
              createDysflowError(
                TEST_RUN_NOT_FOUND,
                `Test run '${params.operationId}' was removed under ${root.root} while waiting for it.`,
                {
                  details: {
                    operationId: params.operationId,
                    projectRoot: root.root,
                    removedWhileWaiting: true,
                  },
                },
              ),
            ),
          );
        }
        view = next.view;
      }
      return translateCoreResultToMcpContent(successResult(toTestRunResult(view)));
    },
  };
}

function waitSeconds(wait: number | undefined): number {
  if (wait === undefined || !Number.isFinite(wait) || wait <= 0) return 0;
  return Math.min(wait, TEST_RUN_MAX_WAIT_SECONDS);
}

/** The reader's view; `result` is the `structuredContent` the synchronous call returned. */
function toTestRunResult(view: TestRunView): Record<string, unknown> {
  const { result, ...rest } = view;
  if (result === undefined) return rest;
  return {
    ...rest,
    result:
      isRecord(result) && isRecord(result.structuredContent) ? result.structuredContent : result,
  };
}
