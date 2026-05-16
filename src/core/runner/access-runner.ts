import { spawn } from "node:child_process";
import { createDiagnostic, createDysflowError, failureResult, successResult, type OperationResult } from "../contracts/index.js";
import type { AccessQueryRequest, AccessVbaRequest, Diagnostic } from "../contracts/index.js";
import type { DysflowConfig } from "../config/dysflow-config.js";
import { createAccessOperationId, InMemoryAccessOperationRegistry, toOperationMetadata, type AccessOperationRegistry, type AccessOperationRecord } from "../operations/access-operation-registry.js";
import { sanitizeSecrets } from "../utils/index.js";

export { sanitizeSecrets as sanitizePowerShellOutput } from "../utils/index.js";

const DEFAULT_RUNNER_SCRIPT_PATH = "scripts/dysflow-access-runner.ps1";
const POWERSHELL_COMMAND = "powershell.exe";
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
    this.scriptPath = options.scriptPath ?? resolveDefaultRunnerScriptPath();
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

    const captureDiagnostics: Diagnostic[] = [];
    const execution = await this.executor(POWERSHELL_COMMAND, buildPowerShellArguments(this.scriptPath, operation, config, operationId), {
      timeoutMs: config.timeoutMs,
      operationId,
      accessPath: config.accessDbPath,
      onAccessProcessCaptured: async (process) => {
        try {
          record = (await this.operationRegistry.update(operationId, {
            accessPid: process.pid,
            processStartTime: process.processStartTime,
            commandLine: process.commandLine,
            status: "running",
            updatedAt: this.clock(),
          })) ?? record;
        } catch (error) {
          captureDiagnostics.push(createDiagnostic("error", "access.pid", `Failed to record Access PID ownership: ${error instanceof Error ? error.message : String(error)}`));
        }
      },
    });
    const secrets = [config.accessPassword].filter((secret): secret is string => Boolean(secret));
    const diagnostics = [...collectDiagnostics(execution, secrets), ...captureDiagnostics];
    record = await this.updateOperationFromExecution(record, execution);
    const operationMetadata = toOperationMetadata(record);

    if (execution.timedOut) {
      return failureResult(
        createDysflowError("RUNNER_TIMEOUT", `Access operation timed out after ${config.timeoutMs}ms.`, { retryable: true }),
        { diagnostics, durationMs: execution.durationMs, operation: operationMetadata },
      );
    }

    if (execution.exitCode !== 0) {
      const safeOutput = sanitizeSecrets(execution.stderr || execution.stdout || "No runner output.", secrets);
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

function buildPowerShellArguments(scriptPath: string, operation: AccessRunnerOperation, config: DysflowConfig, operationId: string): string[] {
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-AccessDbPath", config.accessDbPath, "-Operation", operation.kind, "-PayloadJson", JSON.stringify(operation.request), "-OperationId", operationId];
  if (config.accessPassword !== undefined) args.push("-AccessPassword", config.accessPassword);
  return args;
}

function collectDiagnostics(execution: PowerShellExecutionResult, secrets: readonly string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const safeStdout = sanitizeSecrets(execution.stdout, secrets);
  const safeStderr = sanitizeSecrets(execution.stderr, secrets);
  if (safeStdout.length > 0 && (execution.exitCode !== 0 || execution.timedOut)) diagnostics.push(createDiagnostic("warning", "powershell.stdout", safeStdout));
  if (safeStderr.length > 0) diagnostics.push(createDiagnostic("error", "powershell.stderr", safeStderr));
  if (execution.accessProcess === undefined) diagnostics.push(createDiagnostic("warning", "access.pid", "Access PID could not be determined; automatic cleanup is not safe."));
  return diagnostics;
}

function parseRunnerData<TData>(stdout: string, secrets: readonly string[]): TData {
  const safeStdout = sanitizeSecrets(stdout, secrets);
  if (safeStdout.trim().length === 0) return {} as TData;
  return JSON.parse(safeStdout) as TData;
}

export function resolveDefaultRunnerScriptPath(env: Record<string, string | undefined> = process.env): string {
  const dysflowHome = env.DYSFLOW_HOME;
  if (dysflowHome !== undefined && dysflowHome.trim().length > 0) {
    return `${dysflowHome.replace(/\\$/, "")}/app/scripts/dysflow-access-runner.ps1`;
  }

  return DEFAULT_RUNNER_SCRIPT_PATH;
}

const spawnPowerShell: PowerShellExecutor = (command, args, options) => {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const captureTasks: Promise<void>[] = [];
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      const nonMarkerLines: string[] = [];
      for (const line of text.split(/\r?\n/)) {
        if (line.startsWith(ACCESS_PROCESS_MARKER)) {
          try {
            const parsed = JSON.parse(line.slice(ACCESS_PROCESS_MARKER.length)) as AccessProcessOwnership;
            captureTasks.push(options.onAccessProcessCaptured(parsed));
          } catch {
            nonMarkerLines.push(line);
          }
          continue;
        }
        nonMarkerLines.push(line);
      }
      const nonMarkerText = nonMarkerLines.filter((line) => line.length > 0).join("\n");
      if (nonMarkerText.length > 0) stderr += nonMarkerText;
    });
    child.on("error", (error: Error) => { stderr += error.message; });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      void Promise.allSettled(captureTasks).then(() => {
        resolve({ exitCode, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
      });
    });
  });
};
