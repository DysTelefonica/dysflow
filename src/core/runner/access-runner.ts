import { spawn } from "node:child_process";
import { createDiagnostic, createDysflowError, failureResult, successResult, type OperationResult } from "../contracts/index.js";
import type { AccessQueryRequest, AccessVbaRequest, Diagnostic } from "../contracts/index.js";
import type { DysflowConfig } from "../config/dysflow-config.js";
import { createAccessOperationId, InMemoryAccessOperationRegistry, toOperationMetadata, type AccessOperationRegistry, type AccessOperationRecord } from "../operations/access-operation-registry.js";

const DEFAULT_RUNNER_SCRIPT_PATH = "scripts/dysflow-access-runner.ps1";
const POWERSHELL_COMMAND = "powershell.exe";
const REDACTED_SECRET = "[REDACTED]";
const ACCESS_PROCESS_MARKER = "DYSFLOW_ACCESS_PROCESS ";

export type AccessDiagnosticsRequest = { includeEnvironment?: boolean };
export type AccessRunnerOperation =
  | { kind: "vba"; request: AccessVbaRequest }
  | { kind: "query"; request: AccessQueryRequest }
  | { kind: "diagnostics"; request: AccessDiagnosticsRequest };

export type AccessProcessOwnership = { pid: number; processStartTime: string; commandLine?: string };
export type PowerShellExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  accessProcess?: AccessProcessOwnership;
};
export type PowerShellExecutorOptions = {
  timeoutMs: number;
  operationId: string;
  accessPath: string;
  onAccessProcessCaptured(process: AccessProcessOwnership): Promise<void>;
};
export type PowerShellExecutor = (command: string, args: readonly string[], options: PowerShellExecutorOptions) => Promise<PowerShellExecutionResult>;
export type AccessRunner = { run<TData = unknown>(operation: AccessRunnerOperation, config?: DysflowConfig): Promise<OperationResult<TData>> };
export type AccessPowerShellRunnerOptions = {
  executor?: PowerShellExecutor;
  scriptPath?: string;
  operationRegistry?: AccessOperationRegistry;
  operationIdFactory?: () => string;
  clock?: () => string;
};

const defaultRegistry = new InMemoryAccessOperationRegistry();

export function getDefaultAccessOperationRegistry(): AccessOperationRegistry {
  return defaultRegistry;
}

export class AccessPowerShellRunner implements AccessRunner {
  private readonly executor: PowerShellExecutor;
  private readonly scriptPath: string;
  private readonly operationRegistry: AccessOperationRegistry;
  private readonly operationIdFactory: () => string;
  private readonly clock: () => string;

  constructor(options: AccessPowerShellRunnerOptions = {}) {
    this.executor = options.executor ?? spawnPowerShell;
    this.scriptPath = options.scriptPath ?? DEFAULT_RUNNER_SCRIPT_PATH;
    this.operationRegistry = options.operationRegistry ?? defaultRegistry;
    this.operationIdFactory = options.operationIdFactory ?? createAccessOperationId;
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async run<TData = unknown>(operation: AccessRunnerOperation, config?: DysflowConfig): Promise<OperationResult<TData>> {
    if (config === undefined) {
      return failureResult(createDysflowError("CONFIG_MISSING_ACCESS_PATH", "Access runner requires resolved configuration."));
    }

    const operationId = this.operationIdFactory();
    let record = await this.operationRegistry.create({
      operationId,
      action: operation.kind,
      accessPath: config.accessDbPath,
      projectRootAbs: process.cwd(),
      destinationRootAbs: process.cwd(),
      accessPid: null,
      processStartTime: null,
      status: "starting",
      metadata: operation.request as Record<string, unknown>,
      updatedAt: this.clock(),
    });

    const execution = await this.executor(POWERSHELL_COMMAND, buildPowerShellArguments(this.scriptPath, operation, config, operationId), {
      timeoutMs: config.timeoutMs,
      operationId,
      accessPath: config.accessDbPath,
      onAccessProcessCaptured: async (process) => {
        record = (await this.operationRegistry.update(operationId, {
          accessPid: process.pid,
          processStartTime: process.processStartTime,
          commandLine: process.commandLine,
          status: "running",
          updatedAt: this.clock(),
        })) ?? record;
      },
    });
    const secrets = [config.accessPassword].filter((secret): secret is string => Boolean(secret));
    const diagnostics = collectDiagnostics(execution, secrets);
    record = await this.updateOperationFromExecution(record, execution);
    const operationMetadata = toOperationMetadata(record);

    if (execution.timedOut) {
      return failureResult(
        createDysflowError("RUNNER_TIMEOUT", `Access operation timed out after ${config.timeoutMs}ms.`, { retryable: true }),
        { diagnostics, durationMs: execution.durationMs, operation: operationMetadata },
      );
    }

    if (execution.exitCode !== 0) {
      const safeOutput = sanitizePowerShellOutput(execution.stderr || execution.stdout || "No runner output.", secrets);
      return failureResult(
        createDysflowError("RUNNER_FAILED", `PowerShell runner failed with exit code ${execution.exitCode ?? "unknown"}: ${safeOutput}`),
        { diagnostics, durationMs: execution.durationMs, operation: operationMetadata },
      );
    }

    return successResult(parseRunnerData<TData>(execution.stdout, secrets), { diagnostics, durationMs: execution.durationMs, operation: operationMetadata });
  }

  private async updateOperationFromExecution(record: AccessOperationRecord, execution: PowerShellExecutionResult): Promise<AccessOperationRecord> {
    const status = execution.accessProcess === undefined && record.accessPid === null
      ? "pid_unknown"
      : execution.timedOut
        ? "timed_out"
        : execution.exitCode === 0
          ? "completed"
          : "failed";
    return (await this.operationRegistry.update(record.operationId, {
      accessPid: execution.accessProcess?.pid ?? record.accessPid,
      processStartTime: execution.accessProcess?.processStartTime ?? record.processStartTime,
      commandLine: execution.accessProcess?.commandLine ?? record.commandLine,
      status,
      updatedAt: this.clock(),
    })) ?? record;
  }
}

export function sanitizePowerShellOutput(output: string, secrets: readonly string[] = []): string {
  return secrets.reduce((safeOutput, secret) => secret.length === 0 ? safeOutput : safeOutput.split(secret).join(REDACTED_SECRET), output);
}

function buildPowerShellArguments(scriptPath: string, operation: AccessRunnerOperation, config: DysflowConfig, operationId: string): string[] {
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-AccessDbPath", config.accessDbPath, "-Operation", operation.kind, "-PayloadJson", JSON.stringify(operation.request), "-OperationId", operationId];
  if (config.accessPassword !== undefined) args.push("-AccessPassword", config.accessPassword);
  return args;
}

function collectDiagnostics(execution: PowerShellExecutionResult, secrets: readonly string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const safeStdout = sanitizePowerShellOutput(execution.stdout, secrets);
  const safeStderr = sanitizePowerShellOutput(execution.stderr, secrets);
  if (safeStdout.length > 0 && (execution.exitCode !== 0 || execution.timedOut)) diagnostics.push(createDiagnostic("warning", "powershell.stdout", safeStdout));
  if (safeStderr.length > 0) diagnostics.push(createDiagnostic("error", "powershell.stderr", safeStderr));
  if (execution.accessProcess === undefined) diagnostics.push(createDiagnostic("warning", "access.pid", "Access PID could not be determined; automatic cleanup is not safe."));
  return diagnostics;
}

function parseRunnerData<TData>(stdout: string, secrets: readonly string[]): TData {
  const safeStdout = sanitizePowerShellOutput(stdout, secrets);
  if (safeStdout.trim().length === 0) return {} as TData;
  return JSON.parse(safeStdout) as TData;
}

const spawnPowerShell: PowerShellExecutor = (command, args, options) => {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith(ACCESS_PROCESS_MARKER)) continue;
        try {
          const parsed = JSON.parse(line.slice(ACCESS_PROCESS_MARKER.length)) as AccessProcessOwnership;
          void options.onAccessProcessCaptured(parsed);
        } catch {
          // Keep stderr intact; malformed ownership markers become diagnostics through normal stderr handling.
        }
      }
    });
    child.on("error", (error: Error) => { stderr += error.message; });
    child.on("close", (exitCode) => { clearTimeout(timer); resolve({ exitCode, stdout, stderr, durationMs: Date.now() - startedAt, timedOut }); });
  });
};
