import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { dirname, join, win32 } from "node:path";
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

/**
 * Runs `powershell.exe` with `args`, writes `stdin` to it, and resolves its
 * output. `timedOut` is set when it was stopped for not answering in time;
 * a rejection means the bootstrap could not be started at all.
 */
export type PowerShellRunner = (
  args: readonly string[],
  stdin: string,
) => Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut?: boolean }>;

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
  /** The `cmd.exe` that redirects the runner's output; defaults to `%SystemRoot%\System32\cmd.exe`. */
  comSpec?: string;
  /** The environment `%SystemRoot%` is read from; defaults to `process.env`. */
  systemEnv?: NodeJS.ProcessEnv;
};

export type StartedRunnerLaunch = {
  /** The started process: the runner itself (spawn) or its `cmd.exe` wrapper (WMI). */
  pid: number;
  method: TestRunLaunchMethod;
  /** Why the WMI launch was not used, when it was tried and fell back. */
  fallbackReason?: string;
  launchAmbiguous?: undefined;
};

/**
 * The WMI bootstrap may have created the runner without saying so (it timed
 * out, or it died after calling `Win32_Process.Create`). No second runner is
 * started: the run's own records decide, since a runner that exists records
 * itself in `state.json`, and a run whose runner never does reads as crashed
 * once the start grace runs out.
 */
export type AmbiguousRunnerLaunch = {
  pid: null;
  method: "wmi";
  launchAmbiguous: true;
  reason: string;
  fallbackReason?: undefined;
};

export type DetachedRunnerLaunch = StartedRunnerLaunch | AmbiguousRunnerLaunch;

/** How long the WMI bootstrap may take before it is stopped. */
const WMI_BOOTSTRAP_TIMEOUT_MS = 20_000;

/** The line the bootstrap prints right before it calls `Win32_Process.Create`. */
const WMI_CREATE_STAGE_MARKER = "DYSFLOW_WMI_STAGE create";

const DEFAULT_SYSTEM_ROOT = "C:\\Windows";

/**
 * `%SystemRoot%` (or `%windir%`) when it is an absolute drive path that
 * `cmd.exe` passes verbatim, else `C:\Windows`.
 */
function resolveSystemRoot(env: NodeJS.ProcessEnv): string {
  for (const candidate of [env.SystemRoot, env.windir]) {
    if (candidate !== undefined && /^[A-Za-z]:\\[^%"]*$/.test(candidate)) return candidate;
  }
  return DEFAULT_SYSTEM_ROOT;
}

/**
 * Windows PowerShell by absolute path, never through a `PATH` lookup: the
 * bootstrap receives the runner's environment, the password included, on its
 * stdin, so a `powershell.exe` planted on `PATH` must never receive it.
 */
export function resolveWindowsPowerShellPath(env: NodeJS.ProcessEnv = process.env): string {
  return win32.join(
    resolveSystemRoot(env),
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

/** `cmd.exe` by absolute path, for the reason {@link resolveWindowsPowerShellPath} gives. */
export function resolveWindowsCmdPath(env: NodeJS.ProcessEnv = process.env): string {
  return win32.join(resolveSystemRoot(env), "System32", "cmd.exe");
}

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
  `[Console]::Out.Write('${WMI_CREATE_STAGE_MARKER}' + [char]10)`,
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
 * When WMI certainly created no process (another platform, a bootstrap that
 * could not start or failed before calling `Win32_Process.Create`, a non-zero
 * `ReturnValue`, or a path `cmd.exe` would expand), the runner is spawned
 * detached and windowless, with stdout and stderr appended to `runner.log` through file
 * descriptors (a pipe would tie the runner to this process), and unreferenced
 * so the caller can exit.
 *
 * A WMI launch whose outcome is unknown (the bootstrap timed out, or died
 * after calling `Win32_Process.Create`) may already have created the runner,
 * so it never falls back: it resolves an {@link AmbiguousRunnerLaunch}, and no
 * second runner ever drives the same run (#1993 S2).
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
    const created = await createRunnerThroughWmi(runDir, env, entryPoint, cwd, options);
    if (typeof created === "number") return { pid: created, method: "wmi" };
    logSwallowedIoError("spawn-detached-test-runner:wmi-ambiguous", new Error(created.ambiguous));
    return { pid: null, method: "wmi", launchAmbiguous: true, reason: created.ambiguous };
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

/**
 * The PID WMI created; `{ ambiguous }` when it may have created a process
 * without reporting it; a throw when it certainly created none.
 */
async function createRunnerThroughWmi(
  runDir: string,
  env: NodeJS.ProcessEnv,
  entryPoint: string,
  cwd: string,
  options: SpawnDetachedTestRunnerOptions,
): Promise<number | { ambiguous: string }> {
  const systemEnv = options.systemEnv ?? process.env;
  const comSpec = options.comSpec ?? resolveWindowsCmdPath(systemEnv);
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
  const runBootstrap =
    options.runPowerShell ??
    createPowerShellRunner({ command: resolveWindowsPowerShellPath(systemEnv) });
  const { stdout, stderr, exitCode, timedOut } = await runBootstrap(args, stdin);
  const match = /DYSFLOW_WMI_CREATE (\d+) (\d+)/.exec(stdout);
  if (match === null) {
    const detail = `(exit ${exitCode ?? "none"}): ${stderr.trim().slice(0, 300)}`;
    if (timedOut === true) {
      return {
        ambiguous: `The WMI bootstrap did not answer within ${WMI_BOOTSTRAP_TIMEOUT_MS} ms and may have created the runner ${detail}`,
      };
    }
    if (stdout.includes(WMI_CREATE_STAGE_MARKER)) {
      return {
        ambiguous: `The WMI bootstrap called Win32_Process.Create but reported no result ${detail}`,
      };
    }
    throw new Error(`The WMI bootstrap gave no result ${detail}`);
  }
  const returnValue = Number(match[1]);
  const pid = Number(match[2]);
  // A failed Create reports its error code and creates no process.
  if (returnValue !== 0) throw new Error(`Win32_Process.Create returned ${returnValue}.`);
  if (pid <= 0) {
    return { ambiguous: `Win32_Process.Create succeeded but reported process id ${pid}.` };
  }
  return pid;
}

function toBase64Line(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/**
 * The production {@link PowerShellRunner}: `command` (an absolute
 * `powershell.exe`) with stdin piped, output collected, bounded in time. A
 * bootstrap stopped for not answering resolves with `timedOut` and never
 * rejects, since it may already have created the runner.
 */
export function createPowerShellRunner(options: {
  command: string;
  spawnProcess?: typeof spawn;
  timeoutMs?: number;
}): PowerShellRunner {
  const timeoutMs = options.timeoutMs ?? WMI_BOOTSTRAP_TIMEOUT_MS;
  return (args, stdin) =>
    new Promise((resolve, reject) => {
      const child = (options.spawnProcess ?? spawn)(options.command, [...args], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        if (timedOut) resolve({ exitCode: null, stdout, stderr, timedOut });
        else reject(err);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({ exitCode, stdout, stderr, ...(timedOut ? { timedOut } : {}) });
      });
      child.stdin.on("error", (err) =>
        logSwallowedIoError("spawn-detached-test-runner:stdin", err),
      );
      child.stdin.end(stdin, "utf8");
    });
}

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
