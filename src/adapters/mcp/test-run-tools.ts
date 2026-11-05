import {
  createDysflowError,
  failureResult,
  successResult,
  TEST_RUN_NOT_FOUND,
} from "../../core/contracts/index.js";
import {
  isValidTestRunOperationId,
  TEST_RUN_MAX_WAIT_SECONDS,
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
 */
export function createGetTestRunTool(options: GetTestRunToolOptions): DysflowMcpTool {
  const createStore = options.createStore ?? createNodeTestRunStore;
  const polling = options.polling ?? realPolling;

  const resolveProjectRoot = async (
    input: unknown,
  ): Promise<
    { ok: true; root: string } | { ok: false; error: ReturnType<typeof invalidInput> }
  > => {
    const context = await options.accessContextResolver(input);
    if (context.ok && context.data.projectRoot.length > 0) {
      return { ok: true, root: context.data.projectRoot };
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
      let view = await store.readTestRun(params.operationId);
      if (view === undefined) {
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
      const deadline = polling.now() + waitSeconds(params.wait) * 1_000;
      while (view.status === "running") {
        const remaining = deadline - polling.now();
        if (remaining <= 0) break;
        await polling.sleep(Math.min(TEST_RUN_WAIT_POLL_MS, remaining));
        view = (await store.readTestRun(params.operationId)) ?? view;
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
