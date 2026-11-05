import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { TEST_RUN_FILES } from "../../core/test-runs/test-run-store.js";
import { logSwallowedIoError } from "../../core/utils/log-swallowed-io-error.js";
import { findPackageRootNear } from "../../core/utils/package-info.js";

/**
 * The built CLI entry of this runtime: `<packageRoot>/dist/cli/index.js`,
 * which is `<runtimeDir>/app/dist/cli/index.js` in an installed runtime.
 */
export function resolveCliEntryPoint(moduleUrl: string = import.meta.url): string {
  const root = findPackageRootNear(moduleUrl);
  if (root === undefined) {
    throw new Error("Cannot locate the dysflow package root to start the test runner.");
  }
  return join(root, "dist", "cli", "index.js");
}

/** The project root that owns `<projectRoot>/.dysflow/runtime/test-runs/<operationId>`. */
export function projectRootForRunDir(runDir: string): string {
  return dirname(dirname(dirname(dirname(runDir))));
}

export type SpawnDetachedTestRunnerOptions = {
  /** Defaults to the CLI entry of this runtime. */
  entryPoint?: string;
  /** Defaults to the project root that owns `runDir`, so config resolves as in the server. */
  cwd?: string;
  /** Defaults to Node's `child_process.spawn`; injected by tests. */
  spawnProcess?: typeof spawn;
  /**
   * Called when the child reports `error` after this function returned (for
   * example ENOENT once the PID was assigned), so the caller can end the run
   * instead of waiting for the no-runner crash window.
   */
  onError?: (err: unknown) => void;
};

/**
 * Issue #1993 D2 — start `dysflow test-run --run-dir <runDir>` as a process
 * that outlives its caller: detached, windowless, with stdout and stderr
 * appended to `<runDir>/runner.log` through file descriptors (a pipe would
 * tie the runner to this process), and unreferenced so the caller can exit.
 *
 * Secrets travel only in `env`; nothing secret is put on the command line.
 * Resolves the runner PID.
 */
export function spawnDetachedTestRunner(
  runDir: string,
  env: NodeJS.ProcessEnv,
  options: SpawnDetachedTestRunnerOptions = {},
): number {
  const entryPoint = options.entryPoint ?? resolveCliEntryPoint();
  const logFd = openSync(join(runDir, TEST_RUN_FILES.log), "a");
  try {
    const child = (options.spawnProcess ?? spawn)(
      process.execPath,
      [entryPoint, "test-run", "--run-dir", runDir],
      {
        cwd: options.cwd ?? projectRootForRunDir(runDir),
        env,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", logFd, logFd],
      },
    );
    // A failed spawn is reported through the missing PID below, or through
    // `onError` when it fails later; an unhandled `error` event would
    // otherwise crash the caller.
    child.on("error", (err) => {
      logSwallowedIoError("spawn-detached-test-runner:spawn", err);
      options.onError?.(err);
    });
    child.unref();
    if (child.pid === undefined) {
      throw new Error("The detached test runner did not start (no PID was assigned).");
    }
    return child.pid;
  } finally {
    // The child holds its own copy of the descriptor.
    closeSync(logFd);
  }
}
