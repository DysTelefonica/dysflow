import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MAX_SUBPROCESS_BUFFER_BYTES = 10 * 1024 * 1024;

const DEFAULT_TIMEOUT_MS = 60_000;

function createCommandError(command: string, error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`${command} failed: ${error.message}`);
  }
  return new Error(`${command} failed.`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
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
    await withTimeout(
      execFileAsync(execCmd, execArgs, {
        cwd,
        windowsHide: true,
        maxBuffer: MAX_SUBPROCESS_BUFFER_BYTES,
        shell: false,
      }),
      timeoutMs,
      `${command} ${args.join(" ")}`,
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
    const { stdout } = await withTimeout(
      execFileAsync(execCmd, execArgs, {
        cwd,
        windowsHide: true,
        maxBuffer: MAX_SUBPROCESS_BUFFER_BYTES,
        shell: false,
      }),
      timeoutMs,
      `${command} ${args.join(" ")}`,
    );
    return String(stdout).trim();
  } catch (error) {
    throw createCommandError(`${command} ${args.join(" ")}`, error);
  }
}
