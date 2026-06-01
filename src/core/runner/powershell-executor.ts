import { spawn } from "node:child_process";

export type PowerShellProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export type PowerShellProcessOptions = {
  command?: string;
  args: readonly string[];
  timeoutMs: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  onStdout?(text: string): void;
  onStderr?(text: string): void;
};

export const POWERSHELL_EXE = "powershell.exe";

/** Maximum time to wait for taskkill to exit before giving up and settling anyway. */
const KILL_TREE_BOUND_MS = 3_000;

/**
 * Spawns `taskkill /T /F /PID <pid>` and awaits its close event within a
 * bounded timeout so the caller knows the kill attempt has completed.
 *
 * The function is non-throwing: a stuck or failing taskkill will resolve after
 * KILL_TREE_BOUND_MS so it can never hang the executor forever.
 */
async function killProcessTree(pid: number): Promise<void> {
  const taskkill = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], {
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise<void>((resolve) => {
    const guard = setTimeout(resolve, KILL_TREE_BOUND_MS);
    taskkill.on("close", () => {
      clearTimeout(guard);
      resolve();
    });
    // Also resolve on error so a missing taskkill binary doesn't hang forever
    taskkill.on("error", () => {
      clearTimeout(guard);
      resolve();
    });
  });
}

export const POWERSHELL_SYSTEM_ENV_KEYS = [
  "SystemRoot",
  "windir",
  "PATH",
  "PATHEXT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "USERNAME",
  "COMPUTERNAME",
  "LOCALAPPDATA",
  "APPDATA",
  "HOMEDRIVE",
  "HOMEPATH",
] as const;

function buildChildEnv(
  override?: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const base: Record<string, string | undefined> = {};
  for (const key of POWERSHELL_SYSTEM_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      base[key] = process.env[key];
    }
  }
  return { ...base, ...override };
}

export function spawnPowerShellProcess(
  options: PowerShellProcessOptions,
): Promise<PowerShellProcessResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(options.command ?? POWERSHELL_EXE, options.args, {
      shell: false,
      windowsHide: true,
      cwd: options.cwd,
      env: buildChildEnv(options.env),
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) {
        void killProcessTree(child.pid).then(() => {
          finish(null);
        });
      } else {
        child.kill();
        finish(null);
      }
    }, options.timeoutMs);

    options.signal?.addEventListener(
      "abort",
      () => {
        timedOut = true;
        if (child.pid !== undefined) {
          void killProcessTree(child.pid).then(() => {
            finish(null);
          });
        } else {
          child.kill();
          finish(null);
        }
      },
      { once: true },
    );
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      options.onStderr?.(text);
    });
    child.on("error", (error: Error) => {
      stderr += error.message;
      finish(null);
    });
    child.on("close", finish);
  });
}
