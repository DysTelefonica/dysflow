import { spawn } from "node:child_process";
import { createDiagnostic, createDysflowError, failureResult, successResult, type OperationResult } from "../contracts/index.js";
import type { AccessQueryRequest, AccessVbaRequest, Diagnostic } from "../contracts/index.js";
import type { DysflowConfig } from "../config/dysflow-config.js";

const DEFAULT_RUNNER_SCRIPT_PATH = "scripts/dysflow-access-runner.ps1";
const POWERSHELL_COMMAND = "powershell.exe";
const REDACTED_SECRET = "[REDACTED]";

export type AccessDiagnosticsRequest = {
  includeEnvironment?: boolean;
};

export type AccessRunnerOperation =
  | { kind: "vba"; request: AccessVbaRequest }
  | { kind: "query"; request: AccessQueryRequest }
  | { kind: "diagnostics"; request: AccessDiagnosticsRequest };

export type PowerShellExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export type PowerShellExecutorOptions = {
  timeoutMs: number;
};

export type PowerShellExecutor = (
  command: string,
  args: readonly string[],
  options: PowerShellExecutorOptions,
) => Promise<PowerShellExecutionResult>;

export type AccessRunner = {
  run<TData = unknown>(operation: AccessRunnerOperation, config?: DysflowConfig): Promise<OperationResult<TData>>;
};

export type AccessPowerShellRunnerOptions = {
  executor?: PowerShellExecutor;
  scriptPath?: string;
};

export class AccessPowerShellRunner implements AccessRunner {
  private readonly executor: PowerShellExecutor;
  private readonly scriptPath: string;

  constructor(options: AccessPowerShellRunnerOptions = {}) {
    this.executor = options.executor ?? spawnPowerShell;
    this.scriptPath = options.scriptPath ?? DEFAULT_RUNNER_SCRIPT_PATH;
  }

  async run<TData = unknown>(operation: AccessRunnerOperation, config?: DysflowConfig): Promise<OperationResult<TData>> {
    if (config === undefined) {
      return failureResult(createDysflowError("CONFIG_MISSING_ACCESS_PATH", "Access runner requires resolved configuration."));
    }

    const execution = await this.executor(POWERSHELL_COMMAND, buildPowerShellArguments(this.scriptPath, operation, config), {
      timeoutMs: config.timeoutMs,
    });
    const secrets = [config.accessPassword].filter((secret): secret is string => Boolean(secret));
    const diagnostics = collectDiagnostics(execution, secrets);

    if (execution.timedOut) {
      return failureResult(
        createDysflowError("RUNNER_TIMEOUT", `Access operation timed out after ${config.timeoutMs}ms.`, { retryable: true }),
        { diagnostics, durationMs: execution.durationMs },
      );
    }

    if (execution.exitCode !== 0) {
      const safeOutput = sanitizePowerShellOutput(execution.stderr || execution.stdout || "No runner output.", secrets);
      return failureResult(
        createDysflowError(
          "RUNNER_FAILED",
          `PowerShell runner failed with exit code ${execution.exitCode ?? "unknown"}: ${safeOutput}`,
        ),
        { diagnostics, durationMs: execution.durationMs },
      );
    }

    return successResult(parseRunnerData<TData>(execution.stdout, secrets), {
      diagnostics,
      durationMs: execution.durationMs,
    });
  }
}

export function sanitizePowerShellOutput(output: string, secrets: readonly string[] = []): string {
  return secrets.reduce((safeOutput, secret) => {
    if (secret.length === 0) {
      return safeOutput;
    }

    return safeOutput.split(secret).join(REDACTED_SECRET);
  }, output);
}

function buildPowerShellArguments(scriptPath: string, operation: AccessRunnerOperation, config: DysflowConfig): string[] {
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-AccessDbPath",
    config.accessDbPath,
    "-Operation",
    operation.kind,
    "-PayloadJson",
    JSON.stringify(operation.request),
  ];

  if (config.accessPassword !== undefined) {
    args.push("-AccessPassword", config.accessPassword);
  }

  return args;
}

function collectDiagnostics(execution: PowerShellExecutionResult, secrets: readonly string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const safeStdout = sanitizePowerShellOutput(execution.stdout, secrets);
  const safeStderr = sanitizePowerShellOutput(execution.stderr, secrets);

  if (safeStdout.length > 0 && (execution.exitCode !== 0 || execution.timedOut)) {
    diagnostics.push(createDiagnostic("warning", "powershell.stdout", safeStdout));
  }

  if (safeStderr.length > 0) {
    diagnostics.push(createDiagnostic("error", "powershell.stderr", safeStderr));
  }

  return diagnostics;
}

function parseRunnerData<TData>(stdout: string, secrets: readonly string[]): TData {
  const safeStdout = sanitizePowerShellOutput(stdout, secrets);
  if (safeStdout.trim().length === 0) {
    return {} as TData;
  }

  return JSON.parse(safeStdout) as TData;
}

const spawnPowerShell: PowerShellExecutor = (command, args, options) => {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: Error) => {
      stderr += error.message;
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
    });
  });
};

