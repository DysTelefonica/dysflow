import { type ExecFileOptions, execFile, spawn } from "node:child_process";

export const MAX_SUBPROCESS_BUFFER_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

function createCommandError(command: string, error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`${command} failed: ${error.message}`);
  }
  return new Error(`${command} failed.`);
}

function runCommandWithTimeout(
  command: string,
  args: readonly string[],
  execCmd: string,
  execArgs: string[],
  options: ExecFileOptions,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    let isTimedOut = false;
    const child = execFile(execCmd, execArgs, options, (error, stdout, stderr) => {
      if (timer) {
        clearTimeout(timer);
      }
      if (isTimedOut) {
        return;
      }
      if (error) {
        reject(error);
      } else {
        if (stdout && typeof stdout === "object" && "stdout" in stdout) {
          resolve(stdout as unknown as { stdout: string; stderr: string });
        } else {
          resolve({ stdout: stdout as string, stderr: stderr as string });
        }
      }
    });

    timer = setTimeout(() => {
      isTimedOut = true;
      if (child.pid !== undefined && process.platform === "win32") {
        const taskkill = spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], {
          stdio: "ignore",
          windowsHide: true,
        });
        const handleEnd = () => {
          reject(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms`));
        };
        taskkill.on("close", handleEnd);
        taskkill.on("error", handleEnd);
      } else {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore kill errors
        }
        reject(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
  });
}

export async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const isCmd = process.platform === "win32" && (command === "pnpm" || command === "npm");
  const execCmd = isCmd ? process.env.ComSpec || "cmd.exe" : command;
  const execArgs = isCmd ? ["/d", "/s", "/c", `${command}.cmd`, ...args] : [...args];
  try {
    await runCommandWithTimeout(
      command,
      args,
      execCmd,
      execArgs,
      {
        cwd,
        windowsHide: true,
        maxBuffer: MAX_SUBPROCESS_BUFFER_BYTES,
        shell: false,
      },
      timeoutMs,
    );
  } catch (error) {
    throw createCommandError(`${command} ${args.join(" ")}`, error);
  }
}

export async function runCommandOutput(
  command: string,
  args: readonly string[],
  cwd: string,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const isCmd = process.platform === "win32" && (command === "pnpm" || command === "npm");
  const execCmd = isCmd ? process.env.ComSpec || "cmd.exe" : command;
  const execArgs = isCmd ? ["/d", "/s", "/c", `${command}.cmd`, ...args] : [...args];
  try {
    const { stdout } = await runCommandWithTimeout(
      command,
      args,
      execCmd,
      execArgs,
      {
        cwd,
        windowsHide: true,
        maxBuffer: MAX_SUBPROCESS_BUFFER_BYTES,
        shell: false,
      },
      timeoutMs,
    );
    return String(stdout).trim();
  } catch (error) {
    throw createCommandError(`${command} ${args.join(" ")}`, error);
  }
}
