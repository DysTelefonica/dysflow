import { spawn } from "node:child_process";
import type {
  AccessProcessOwnership,
  PowerShellExecutionResult,
  PowerShellExecutor,
} from "../../core/contracts/index.js";
import { isRecord } from "../../core/utils/index.js";

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

export const POWERSHELL_EXE = process.platform === "win32" ? "powershell.exe" : "pwsh";

const KILL_TREE_BOUND_MS = 3_000;
const ACCESS_PROCESS_MARKER = "DYSFLOW_ACCESS_PROCESS ";
const PROGRESS_MARKER = "DYSFLOW_PROGRESS ";

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
  "HOME",
  "USER",
] as const;

function buildChildEnv(override?: Record<string, string | undefined>) {
  const base: Record<string, string | undefined> = {};
  for (const key of POWERSHELL_SYSTEM_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      base[key] = process.env[key];
    }
  }
  if (process.platform !== "win32") {
    base.DYSFLOW_MOCK_COM = "1";
  }
  return { ...base, ...override };
}

export function spawnPowerShellProcess(
  options: PowerShellProcessOptions,
): Promise<PowerShellProcessResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const resolvedCommand =
      options.command === "powershell.exe" || !options.command ? POWERSHELL_EXE : options.command;
    const child = spawn(resolvedCommand, options.args, {
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
      resolve({ exitCode, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
    };
    const abortChild = () => {
      timedOut = true;
      if (child.pid !== undefined && process.platform === "win32") {
        void killProcessTree(child.pid).then(() => finish(null));
      } else {
        child.kill();
        finish(null);
      }
    };
    const timer = setTimeout(abortChild, options.timeoutMs);

    options.signal?.addEventListener("abort", abortChild, { once: true });
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

type ProgressMarker = {
  percent: number;
  total?: number;
  message?: string;
};

function isAccessProcessMarker(value: unknown): value is AccessProcessOwnership {
  return (
    isRecord(value) &&
    typeof value.pid === "number" &&
    (value.processStartTime === null ||
      value.processStartTime === undefined ||
      typeof value.processStartTime === "string") &&
    (value.commandLine === null ||
      value.commandLine === undefined ||
      typeof value.commandLine === "string")
  );
}

function isProgressMarker(value: unknown): value is ProgressMarker {
  return isRecord(value) && typeof value.percent === "number";
}

export function createDefaultPowerShellExecutor(): PowerShellExecutor {
  return (command, args, options): Promise<PowerShellExecutionResult> => {
    const captureTasks: Promise<void>[] = [];
    let stderr = "";

    // Node emits stderr in arbitrary-sized chunks, so a single marker line can be split
    // across two `data` events. Buffer the stream and only parse whole lines (terminated
    // by `\n`); carry any partial trailing line into the next chunk. Without this, a
    // marker fragmented at a chunk boundary fails to parse and the captured PID is lost.
    let pending = "";

    const processLine = (rawLine: string): void => {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line.startsWith(ACCESS_PROCESS_MARKER)) {
        try {
          const parsed: unknown = JSON.parse(line.slice(ACCESS_PROCESS_MARKER.length));
          if (isAccessProcessMarker(parsed)) {
            captureTasks.push(options.onAccessProcessCaptured(parsed));
            return;
          }
        } catch {
          // Fall through: surface the unparseable line as ordinary stderr.
        }
        if (line.length > 0) stderr += line;
        return;
      }
      if (line.startsWith(PROGRESS_MARKER)) {
        try {
          const data: unknown = JSON.parse(line.slice(PROGRESS_MARKER.length));
          if (isProgressMarker(data)) {
            options.onProgress?.(data.percent, data.total, data.message);
          }
        } catch {
          // Progress is best-effort telemetry; malformed progress is ignored.
        }
        return;
      }
      if (line.length > 0) stderr += line;
    };

    return spawnPowerShellProcess({
      command,
      args,
      timeoutMs: options.timeoutMs,
      env: options.env,
      onStderr: (text) => {
        pending += text;
        let newlineIndex = pending.indexOf("\n");
        while (newlineIndex !== -1) {
          processLine(pending.slice(0, newlineIndex));
          pending = pending.slice(newlineIndex + 1);
          newlineIndex = pending.indexOf("\n");
        }
      },
    }).then(async (result) => {
      // Flush a trailing marker/line that never received its newline before the stream ended.
      if (pending.length > 0) {
        processLine(pending);
        pending = "";
      }
      await Promise.allSettled(captureTasks);
      return { ...result, stderr };
    });
  };
}
