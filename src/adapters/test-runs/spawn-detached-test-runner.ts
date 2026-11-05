import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  TEST_RUN_LAUNCH_METHOD_ENV,
  type TestRunLaunchMethod,
} from "../../core/test-runs/test-run-model.js";
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

/** Runs `powershell.exe` with `args`, writes `stdin` to it, and resolves its output. */
export type PowerShellRunner = (
  args: readonly string[],
  stdin: string,
) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>;

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
   * instead of waiting for the no-runner crash window. Spawn path only.
   */
  onError?: (err: unknown) => void;
  /** Defaults to `process.platform`; the WMI launch is used on `win32` only. */
  platform?: NodeJS.Platform;
  /** Runs the WMI bootstrap; injected by tests. */
  runPowerShell?: PowerShellRunner;
  /** The `cmd.exe` that redirects the runner's output; defaults to `%ComSpec%`. */
  comSpec?: string;
};

export type DetachedRunnerLaunch = {
  /** The started process: the runner itself (spawn) or its `cmd.exe` wrapper (WMI). */
  pid: number;
  method: TestRunLaunchMethod;
  /** Why the WMI launch was not used, when it was tried and fell back. */
  fallbackReason?: string;
};

/** How long the WMI bootstrap may take before the launch falls back to a spawn. */
const WMI_BOOTSTRAP_TIMEOUT_MS = 20_000;

/**
 * The WMI bootstrap. It reads base64 lines from stdin: the command line, the
 * working directory, then one `NAME=value` per environment variable, and
 * creates the process through `Win32_Process.Create`. Values travel only as
 * data through .NET method calls, never as cmdlet parameters, so PowerShell
 * module logging cannot record them. `EnvironmentVariables` replaces the
 * whole environment, so the full one is passed; `ShowWindow = 0` hides the
 * console (WMI refuses `CREATE_NO_WINDOW`).
 */
const WMI_BOOTSTRAP_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$decode = { param($t) [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($t.Trim())) }",
  "$lines = @([Console]::In.ReadToEnd().Split([char]10) | Where-Object { $_.Trim().Length -gt 0 })",
  "$commandLine = & $decode $lines[0]",
  "$directory = & $decode $lines[1]",
  "$variables = New-Object 'System.Collections.Generic.List[string]'",
  "for ($i = 2; $i -lt $lines.Count; $i++) { $variables.Add((& $decode $lines[$i])) }",
  "$startup = ([wmiclass]'Win32_ProcessStartup').CreateInstance()",
  "$startup.ShowWindow = 0",
  "$startup.EnvironmentVariables = [string[]]$variables.ToArray()",
  "$created = ([wmiclass]'Win32_Process').Create($commandLine, $directory, $startup)",
  "[Console]::Out.Write('DYSFLOW_WMI_CREATE ' + $created.ReturnValue + ' ' + $created.ProcessId)",
].join("\n");

/**
 * Issue #1993 D2 — start `dysflow test-run --run-dir <runDir>` as a process
 * that outlives its caller, and resolve how it was started.
 *
 * On Windows the MCP host (an agent harness, an IDE) may run the server in a
 * Job Object that kills every member when the host closes it, and a Node
 * `detached` child stays in that job. So the runner is created through WMI
 * `Win32_Process.Create`: the WMI provider host creates it outside the
 * caller's job. A small PowerShell bootstrap makes the call; the command
 * line and the environment (the password included) reach it on its stdin,
 * never on a command line or on disk. `cmd.exe` appends the runner's output
 * to `runner.log`, since a WMI-created process gets no inherited handles.
 *
 * When WMI is not available (another platform, no PowerShell, WMI refused,
 * or a path `cmd.exe` would expand), the runner is spawned detached and
 * windowless, with stdout and stderr appended to `runner.log` through file
 * descriptors (a pipe would tie the runner to this process), and unreferenced
 * so the caller can exit.
 *
 * Either way the runner's environment names the method
 * (`DYSFLOW_TEST_RUN_LAUNCH`), and the runner records it in `state.json`.
 */
export async function spawnDetachedTestRunner(
  runDir: string,
  env: NodeJS.ProcessEnv,
  options: SpawnDetachedTestRunnerOptions = {},
): Promise<DetachedRunnerLaunch> {
  const entryPoint = options.entryPoint ?? resolveCliEntryPoint();
  const cwd = options.cwd ?? projectRootForRunDir(runDir);
  if ((options.platform ?? process.platform) !== "win32") {
    return { pid: spawnRunner(runDir, env, entryPoint, cwd, options), method: "spawn" };
  }
  let fallbackReason: string;
  try {
    return {
      pid: await createRunnerThroughWmi(runDir, env, entryPoint, cwd, options),
      method: "wmi",
    };
  } catch (err) {
    fallbackReason = err instanceof Error ? err.message : String(err);
    logSwallowedIoError("spawn-detached-test-runner:wmi", err);
  }
  return {
    pid: spawnRunner(runDir, env, entryPoint, cwd, options),
    method: "spawn",
    fallbackReason,
  };
}

async function createRunnerThroughWmi(
  runDir: string,
  env: NodeJS.ProcessEnv,
  entryPoint: string,
  cwd: string,
  options: SpawnDetachedTestRunnerOptions,
): Promise<number> {
  const comSpec = options.comSpec ?? process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe";
  const logPath = join(runDir, TEST_RUN_FILES.log);
  for (const path of [comSpec, process.execPath, entryPoint, runDir, logPath]) {
    // cmd.exe expands %VAR% even inside quotes, and a quote ends the argument.
    if (/[%"]/.test(path)) {
      throw new Error(`The path ${path} contains % or ", which cmd.exe would not pass verbatim.`);
    }
  }
  const commandLine = `"${comSpec}" /d /v:off /s /c ""${process.execPath}" "${entryPoint}" test-run --run-dir "${runDir}" >> "${logPath}" 2>&1"`;
  const variables = Object.entries({ ...env, [TEST_RUN_LAUNCH_METHOD_ENV]: "wmi" })
    .filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0].length > 0 && !entry[0].startsWith("="),
    )
    .map(([name, value]) => `${name}=${value}`);
  const stdin = `${[commandLine, cwd, ...variables].map(toBase64Line).join("\n")}\n`;
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    Buffer.from(WMI_BOOTSTRAP_SCRIPT, "utf16le").toString("base64"),
  ];
  const { stdout, stderr, exitCode } = await (options.runPowerShell ?? runPowerShell)(args, stdin);
  const match = /DYSFLOW_WMI_CREATE (\d+) (\d+)/.exec(stdout);
  if (match === null) {
    throw new Error(
      `The WMI bootstrap gave no result (exit ${exitCode ?? "none"}): ${stderr.trim().slice(0, 300)}`,
    );
  }
  const returnValue = Number(match[1]);
  const pid = Number(match[2]);
  if (returnValue !== 0 || pid <= 0) {
    throw new Error(`Win32_Process.Create returned ${returnValue}.`);
  }
  return pid;
}

function toBase64Line(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/** The production {@link PowerShellRunner}: stdin piped, output collected, bounded in time. */
const runPowerShell: PowerShellRunner = (args, stdin) =>
  new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [...args], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`The WMI bootstrap did not answer within ${WMI_BOOTSTRAP_TIMEOUT_MS} ms.`));
    }, WMI_BOOTSTRAP_TIMEOUT_MS);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
    child.stdin.on("error", (err) => logSwallowedIoError("spawn-detached-test-runner:stdin", err));
    child.stdin.end(stdin, "utf8");
  });

function spawnRunner(
  runDir: string,
  env: NodeJS.ProcessEnv,
  entryPoint: string,
  cwd: string,
  options: SpawnDetachedTestRunnerOptions,
): number {
  const logFd = openSync(join(runDir, TEST_RUN_FILES.log), "a");
  try {
    const child = (options.spawnProcess ?? spawn)(
      process.execPath,
      [entryPoint, "test-run", "--run-dir", runDir],
      {
        cwd,
        env: { ...env, [TEST_RUN_LAUNCH_METHOD_ENV]: "spawn" },
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
