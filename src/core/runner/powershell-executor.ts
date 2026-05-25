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

export function spawnPowerShellProcess(
  options: PowerShellProcessOptions,
): Promise<PowerShellProcessResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(options.command ?? POWERSHELL_EXE, options.args, {
      shell: false,
      windowsHide: true,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
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
      child.kill();
    }, options.timeoutMs);

    options.signal?.addEventListener(
      "abort",
      () => {
        timedOut = true;
        child.kill();
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
    });
    child.on("close", finish);
  });
}
