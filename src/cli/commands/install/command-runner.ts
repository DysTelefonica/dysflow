import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MAX_SUBPROCESS_BUFFER_BYTES = 10 * 1024 * 1024;

function createCommandError(command: string, error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`${command} failed: ${error.message}`);
  }
  return new Error(`${command} failed.`);
}

export async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<void> {
  const isCmd = process.platform === "win32" && (command === "pnpm" || command === "npm");
  const execCmd = isCmd ? process.env.ComSpec || "cmd.exe" : command;
  const execArgs = isCmd ? ["/d", "/s", "/c", `${command}.cmd`, ...args] : [...args];
  try {
    await execFileAsync(execCmd, execArgs, {
      cwd,
      windowsHide: true,
      maxBuffer: MAX_SUBPROCESS_BUFFER_BYTES,
      shell: false,
    });
  } catch (error) {
    throw createCommandError(`${command} ${args.join(" ")}`, error);
  }
}

export async function runCommandOutput(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<string> {
  const isCmd = process.platform === "win32" && (command === "pnpm" || command === "npm");
  const execCmd = isCmd ? process.env.ComSpec || "cmd.exe" : command;
  const execArgs = isCmd ? ["/d", "/s", "/c", `${command}.cmd`, ...args] : [...args];
  try {
    const { stdout } = await execFileAsync(execCmd, execArgs, {
      cwd,
      windowsHide: true,
      maxBuffer: MAX_SUBPROCESS_BUFFER_BYTES,
      shell: false,
    });
    return String(stdout).trim();
  } catch (error) {
    throw createCommandError(`${command} ${args.join(" ")}`, error);
  }
}
