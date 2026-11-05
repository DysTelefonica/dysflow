/**
 * Issue #1993 D2 — `dysflow test-run --run-dir <dir>`, the hidden runner of a
 * detached `test_vba` run.
 *
 * Internal: the MCP server spawns it detached after preparing the run
 * directory, and it is deliberately left out of the user help. It replays the
 * stored `test_vba` request through the same MCP tool pipeline the stdio
 * server serves, so `result.json` holds the synchronous result byte for byte.
 * The Access password is never in the request; it reaches the runner through
 * the environment it inherits (`DYSFLOW_ACCESS_PASSWORD` and the variables the
 * config already reads).
 */
import { basename, dirname, resolve } from "node:path";
import { callToolInProcess } from "../../adapters/mcp/in-process-tool-call.js";
import { createStdioToolRuntime } from "../../adapters/mcp/stdio.js";
import { nodeRunnerProcessProbe, nodeTestRunFileSystem } from "../../adapters/test-runs/index.js";
import { runDetachedTestRun } from "../../core/test-runs/detached-test-runner.js";
import { TestRunStore } from "../../core/test-runs/test-run-store.js";
import type { CliCommandContext, CliResult } from "./types.js";

const USAGE = "Usage: dysflow test-run --run-dir <dir>  (internal: started by test_vba detach)";

function parseRunDir(args: readonly string[]): string | undefined {
  const index = args.indexOf("--run-dir");
  const value = index === -1 ? undefined : args[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
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
  const store = new TestRunStore({
    runsRoot: dirname(runDir),
    fileSystem: nodeTestRunFileSystem,
    processProbe: seams.processProbe ?? nodeRunnerProcessProbe,
  });
  const createToolRuntime =
    seams.createToolRuntime ?? (() => createStdioToolRuntime(undefined, { writesEnabled: true }));

  const outcome = await runDetachedTestRun({
    store,
    operationId: basename(runDir),
    ...(seams.runnerPid === undefined ? {} : { runnerPid: seams.runnerPid }),
    invoke: async (input, onProgress) => {
      const { tools, serverOptions } = await createToolRuntime();
      // Telemetry stays with the server: the detached start is already the
      // recorded test_vba invocation, so the runner does not record it twice.
      return callToolInProcess(
        tools,
        {
          ...(serverOptions.resultValidationPolicy === undefined
            ? {}
            : { resultValidationPolicy: serverOptions.resultValidationPolicy }),
          ...(serverOptions.toolSurface === undefined
            ? {}
            : { toolSurface: serverOptions.toolSurface }),
        },
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
