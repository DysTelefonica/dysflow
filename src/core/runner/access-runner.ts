import { createDiagnostic, createDysflowError, failureResult, successResult, type OperationResult } from "../contracts/index.js";
import type { AccessQueryRequest, AccessVbaRequest, Diagnostic } from "../contracts/index.js";
import type { DysflowConfig } from "../config/dysflow-config.js";
import { createAccessOperationId, InMemoryAccessOperationRegistry, toOperationMetadata, type AccessOperationRegistry, type AccessOperationRecord } from "../operations/access-operation-registry.js";
import { AccessOperationPreflightCleanupService, diagnosticsFromPreflightCleanup, type AccessOperationPreflightCleanup } from "../operations/access-operation-preflight.js";
import { WindowsMsAccessProcessInspector, WindowsMsAccessProcessScanner, WindowsProcessKiller } from "../operations/windows-processes.js";
import { POWERSHELL_EXE, spawnPowerShellProcess } from "./powershell-executor.js";
import { sanitizeSecrets } from "../utils/index.js";

export { sanitizeSecrets as sanitizePowerShellOutput } from "../utils/index.js";

const DEFAULT_RUNNER_SCRIPT_PATH = "scripts/dysflow-access-runner.ps1";
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
  env?: Record<string, string | undefined>;
  onAccessProcessCaptured(process: AccessProcessOwnership): Promise<void>;
};
export type PowerShellExecutor = (command: string, args: readonly string[], options: PowerShellExecutorOptions) => Promise<PowerShellExecutionResult>;
export type AccessRunner = { run<TData = unknown>(operation: AccessRunnerOperation, config?: DysflowConfig): Promise<OperationResult<TData>> };
export type AccessPowerShellRunnerOptions = {
  executor?: PowerShellExecutor;
  scriptPath?: string;
  operationRegistry?: AccessOperationRegistry;
  preflightCleanup?: AccessOperationPreflightCleanup;
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
  private readonly preflightCleanup: AccessOperationPreflightCleanup;
  private readonly operationIdFactory: () => string;
  private readonly clock: () => string;

  constructor(options: AccessPowerShellRunnerOptions = {}) {
    this.executor = options.executor ?? spawnPowerShell;
    this.scriptPath = options.scriptPath ?? resolveDefaultRunnerScriptPath();
    this.operationRegistry = options.operationRegistry ?? defaultRegistry;
    this.preflightCleanup = options.preflightCleanup ?? new AccessOperationPreflightCleanupService({
      registry: this.operationRegistry,
      processInspector: new WindowsMsAccessProcessInspector(),
      processKiller: new WindowsProcessKiller(),
      processScanner: new WindowsMsAccessProcessScanner(),
      clock: options.clock,
    });
    this.operationIdFactory = options.operationIdFactory ?? createAccessOperationId;
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async run<TData = unknown>(operation: AccessRunnerOperation, config?: DysflowConfig): Promise<OperationResult<TData>> {
    if (config === undefined) {
      return failureResult(createDysflowError("CONFIG_MISSING_ACCESS_PATH", "Access runner requires resolved configuration."));
    }

    const preflightResult = await this.runPreflightCleanup(config);
    const operationId = this.operationIdFactory();
    let record = await this.operationRegistry.create({
      operationId,
      action: operation.kind,
      accessPath: config.accessDbPath,
      projectRootAbs: config.projectRoot ?? process.cwd(),
      destinationRootAbs: config.destinationRoot ?? config.projectRoot ?? process.cwd(),
      accessPid: null,
      processStartTime: null,
      status: "starting",
      metadata: operation.request as Record<string, unknown>,
      updatedAt: this.clock(),
    });

    const captureDiagnostics: Diagnostic[] = diagnosticsFromPreflightCleanup(preflightResult);
    const execution = await this.executor(POWERSHELL_EXE, buildPowerShellArguments(this.scriptPath, operation, config, operationId), {
      timeoutMs: config.timeoutMs,
      operationId,
      accessPath: config.accessDbPath,
      env: buildPowerShellEnvironment(config),
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
    const secrets = [config.accessPassword, config.backendPassword].filter((secret): secret is string => Boolean(secret));
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

    try {
      return successResult(parseRunnerData<TData>(execution.stdout, secrets), { diagnostics, durationMs: execution.durationMs, operation: operationMetadata });
    } catch {
      return failureResult(
        createDysflowError("RUNNER_INVALID_JSON", "PowerShell runner produced invalid JSON output."),
        { diagnostics, durationMs: execution.durationMs, operation: operationMetadata },
      );
    }
  }

  private async runPreflightCleanup(config: DysflowConfig) {
    try {
      return await this.preflightCleanup.cleanup({
        accessPath: config.accessDbPath,
        projectRoot: config.projectRoot ?? process.cwd(),
      });
    } catch (error) {
      return {
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [{ operationId: "preflight", message: `Pre-flight cleanup failed: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
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
  return args;
}

function buildPowerShellEnvironment(config: DysflowConfig): Record<string, string | undefined> | undefined {
  if (config.accessPassword === undefined) return undefined;
  return { DYSFLOW_ACCESS_PASSWORD: config.accessPassword, ACCESS_VBA_PASSWORD: config.accessPassword };
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
  const captureTasks: Promise<void>[] = [];
  let stderr = "";
  return spawnPowerShellProcess({
    command,
    args,
    timeoutMs: options.timeoutMs,
    env: options.env,
    onStderr: (text) => {
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
    },
  }).then(async (result) => {
    await Promise.allSettled(captureTasks);
    return { ...result, stderr };
  });
};
