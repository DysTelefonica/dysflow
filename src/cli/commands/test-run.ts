/**
 * Issue #1993 D2 — `dysflow test-run --run-dir <dir>`, the hidden runner of a
 * detached `test_vba` run.
 *
 * Internal: the MCP server spawns it detached after preparing the run
 * directory, and it is deliberately left out of the user help. It replays the
 * stored `test_vba` request through the same MCP tool pipeline the stdio
 * server serves, so `result.json` holds the synchronous result byte for byte.
 * The replay is served with the MCP session write switch the launching server
 * recorded in the request, so the project's write posture decides exactly as
 * it did for the detached start; nothing is forced on.
 * The Access password is never in the request; it reaches the runner through
 * its environment (`DYSFLOW_ACCESS_PASSWORD` and the variables the config
 * already reads).
 */
import { basename, dirname, resolve } from "node:path";
import { callToolInProcess } from "../../adapters/mcp/in-process-tool-call.js";
import { createStdioToolRuntime, type StdioServerOptions } from "../../adapters/mcp/stdio.js";
import type { DysflowMcpTool } from "../../adapters/mcp/tools.js";
import { nodeRunnerProcessProbe, nodeTestRunFileSystem } from "../../adapters/test-runs/index.js";
import { runDetachedTestRun } from "../../core/test-runs/detached-test-runner.js";
import {
  parseTestRunLaunchMethod,
  TEST_RUN_LAUNCH_METHOD_ENV,
} from "../../core/test-runs/test-run-model.js";
import { TestRunStore } from "../../core/test-runs/test-run-store.js";
import type { CliCommandContext, CliResult } from "./types.js";

const USAGE = "Usage: dysflow test-run --run-dir <dir>  (internal: started by test_vba detach)";

/** Builds the replay's tool set, served with the launching server's write switch. */
type CreateReplayToolRuntime = (options: {
  writesEnabled: boolean;
}) => Promise<{ tools: DysflowMcpTool[]; serverOptions: StdioServerOptions }>;

function parseRunDir(args: readonly string[]): string | undefined {
  const index = args.indexOf("--run-dir");
  const value = index === -1 ? undefined : args[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

/**
 * The stdio server's options without its telemetry: the detached start is
 * already the recorded `test_vba` invocation, so the runner does not record
 * it twice. Every other option reaches the replay as the server set it.
 */
function replayServerOptions(serverOptions: StdioServerOptions): StdioServerOptions {
  const {
    invocationContextResolver: _invocationContextResolver,
    invocationRecorder: _invocationRecorder,
    schemaAdvertisementRecorder: _schemaAdvertisementRecorder,
    ...replay
  } = serverOptions;
  return replay;
}

export async function handleTestRunCommand(
  args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  const runDirArg = parseRunDir(args);
  if (runDirArg === undefined) {
    return { exitCode: 2, stdout: "", stderr: USAGE };
  }
  const runDir = resolve(context.cwd ?? process.cwd(), runDirArg);
  const seams = context.detachedTestRun ?? {};
  const env = context.env ?? process.env;
  const store = new TestRunStore({
    runsRoot: dirname(runDir),
    fileSystem: nodeTestRunFileSystem,
    processProbe: seams.processProbe ?? nodeRunnerProcessProbe,
  });
  const createToolRuntime: CreateReplayToolRuntime =
    seams.createToolRuntime ?? ((options) => createStdioToolRuntime(undefined, options));

  const outcome = await runDetachedTestRun({
    store,
    operationId: basename(runDir),
    launchMethod: parseTestRunLaunchMethod(env[TEST_RUN_LAUNCH_METHOD_ENV]),
    ...(seams.runnerPid === undefined ? {} : { runnerPid: seams.runnerPid }),
    invoke: async (input, onProgress, { writesEnabled }) => {
      const { tools, serverOptions } = await createToolRuntime({ writesEnabled });
      return callToolInProcess(
        tools,
        replayServerOptions(serverOptions),
        "test_vba",
        input,
        onProgress,
      );
    },
  });
  return {
    exitCode: outcome.exitCode,
    stdout: `[dysflow test-run] ${outcome.operationId} ${outcome.status}`,
    stderr: "",
  };
}
