import { createHash } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DysflowConfig } from "../config/dysflow-config.js";
import type { AccessQueryRequest, AccessVbaRequest, Diagnostic } from "../contracts/index.js";
import {
  createDiagnostic,
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import {
  type AccessOperationPreflightCleanup,
  AccessOperationPreflightCleanupService,
  diagnosticsFromPreflightCleanup,
} from "../operations/access-operation-preflight.js";
import {
  type AccessOperationRecord,
  type AccessOperationRegistry,
  createAccessOperationId,
  InMemoryAccessOperationRegistry,
  toOperationMetadata,
} from "../operations/access-operation-registry.js";
import {
  WindowsMsAccessProcessInspector,
  WindowsMsAccessProcessScanner,
  WindowsProcessKiller,
} from "../operations/windows-processes.js";
import { isRecord, sanitizeSecrets } from "../utils/index.js";
import { POWERSHELL_EXE, spawnPowerShellProcess } from "./powershell-executor.js";

export { sanitizeSecrets as sanitizePowerShellOutput } from "../utils/index.js";

export const CROSS_PROCESS_LOCK_STALE_MS = 30_000;

export const RUNNER_INVALID_OUTPUT = "RUNNER_INVALID_OUTPUT";

export function ensureResultShape<TData>(
  result: OperationResult<TData>,
  isValid: (data: unknown) => boolean,
): OperationResult<TData> {
  if (!result.ok) return result;
  if (isValid(result.data)) return result;
  return failureResult<TData>(
    createDysflowError(
      RUNNER_INVALID_OUTPUT,
      "PowerShell runner produced output with an unexpected shape.",
    ),
    {
      diagnostics: result.diagnostics,
      durationMs: result.durationMs,
      ...(result.operation ? { operation: result.operation } : {}),
    },
  );
}

const DEFAULT_RUNNER_SCRIPT_PATH = "scripts/dysflow-access-runner.ps1";
const ACCESS_PROCESS_MARKER = "DYSFLOW_ACCESS_PROCESS ";
const PROGRESS_MARKER = "DYSFLOW_PROGRESS ";

export type AccessDiagnosticsRequest = { includeEnvironment?: boolean };
export type AccessRunnerOperation =
  | { kind: "vba"; request: AccessVbaRequest }
  | { kind: "query"; request: AccessQueryRequest }
  | { kind: "diagnostics"; request: AccessDiagnosticsRequest };

export type AccessProcessOwnership = {
  pid: number;
  processStartTime: string;
  commandLine?: string;
};
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
  onProgress?: AccessRunnerProgressCallback;
};
export type PowerShellExecutor = (
  command: string,
  args: readonly string[],
  options: PowerShellExecutorOptions,
) => Promise<PowerShellExecutionResult>;
export type AccessRunnerProgressCallback = (
  percent: number,
  total?: number,
  message?: string,
) => void;
export type AccessRunnerRunOptions = { onProgress?: AccessRunnerProgressCallback };
export type AccessRunner = {
  run<TData = unknown>(
    operation: AccessRunnerOperation,
    config?: DysflowConfig,
    options?: AccessRunnerRunOptions,
  ): Promise<OperationResult<TData>>;
};
export type AccessPowerShellRunnerOptions = {
  executor?: PowerShellExecutor;
  scriptPath?: string;
  operationRegistry?: AccessOperationRegistry;
  preflightCleanup?: AccessOperationPreflightCleanup;
  operationIdFactory?: () => string;
  clock?: () => string;
  lockAcquireTimeoutMs?: number;
};

const defaultRegistry = new InMemoryAccessOperationRegistry();
const accessExecutionLocks = new Map<string, Promise<void>>();

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
  private readonly lockAcquireTimeoutMs: number;

  constructor(options: AccessPowerShellRunnerOptions = {}) {
    this.executor = options.executor ?? spawnPowerShell;
    this.scriptPath = options.scriptPath ?? resolveDefaultRunnerScriptPath();
    this.operationRegistry = options.operationRegistry ?? defaultRegistry;
    this.preflightCleanup =
      options.preflightCleanup ??
      new AccessOperationPreflightCleanupService({
        registry: this.operationRegistry,
        processInspector: new WindowsMsAccessProcessInspector(),
        processKiller: new WindowsProcessKiller(),
        processScanner: new WindowsMsAccessProcessScanner(),
        clock: options.clock,
      });
    this.operationIdFactory = options.operationIdFactory ?? createAccessOperationId;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.lockAcquireTimeoutMs = options.lockAcquireTimeoutMs ?? 30_000;
  }

  async run<TData = unknown>(
    operation: AccessRunnerOperation,
    config?: DysflowConfig,
    options: AccessRunnerRunOptions = {},
  ): Promise<OperationResult<TData>> {
    if (config === undefined) {
      return failureResult(
        createDysflowError(
          "CONFIG_MISSING_ACCESS_PATH",
          "Access runner requires resolved configuration.",
        ),
      );
    }

    try {
      return await runWithAccessExecutionLock(
        config.accessDbPath,
        this.lockAcquireTimeoutMs,
        async () => {
          let finalOperation = operation;
          if (
            operation.kind === "query" &&
            !operation.request.backendPath &&
            !operation.request.databasePath &&
            config.backendPath
          ) {
            finalOperation = {
              ...operation,
              request: {
                ...operation.request,
                backendPath: config.backendPath,
              },
            };
          }

          const preflightResult = await this.runPreflightCleanup(config);
          const operationId = this.operationIdFactory();
          let record = await this.operationRegistry.create({
            operationId,
            action: finalOperation.kind,
            accessPath: config.accessDbPath,
            projectRootAbs: config.projectRoot ?? process.cwd(),
            destinationRootAbs: config.destinationRoot ?? config.projectRoot ?? process.cwd(),
            accessPid: null,
            processStartTime: null,
            status: "starting",
            metadata: finalOperation.request as Record<string, unknown>,
            updatedAt: this.clock(),
          });

          const captureDiagnostics: Diagnostic[] = diagnosticsFromPreflightCleanup(preflightResult);
          const execution = await this.executor(
            POWERSHELL_EXE,
            buildPowerShellArguments(this.scriptPath, finalOperation, config, operationId),
            {
              timeoutMs: config.timeoutMs,
              operationId,
              accessPath: config.accessDbPath,
              env: buildPowerShellEnvironment(config, finalOperation),
              onProgress: options.onProgress,
              onAccessProcessCaptured: async (process) => {
                try {
                  record =
                    (await this.operationRegistry.update(operationId, {
                      accessPid: process.pid,
                      processStartTime: process.processStartTime,
                      commandLine: process.commandLine,
                      status: "running",
                      updatedAt: this.clock(),
                    })) ?? record;
                } catch (error) {
                  captureDiagnostics.push(
                    createDiagnostic(
                      "error",
                      "access.pid",
                      `Failed to record Access PID ownership: ${error instanceof Error ? error.message : String(error)}`,
                    ),
                  );
                }
              },
            },
          );
          let dynamicBackendPassword = config.backendPassword;
          if (
            finalOperation.kind === "query" &&
            finalOperation.request.backendPassword !== undefined
          ) {
            dynamicBackendPassword = finalOperation.request.backendPassword;
          }
          const secrets = [config.accessPassword, dynamicBackendPassword].filter(
            (secret): secret is string => Boolean(secret),
          );
          const diagnostics = [...collectDiagnostics(execution, secrets), ...captureDiagnostics];
          record = await this.updateOperationFromExecution(record, execution);
          const operationMetadata = toOperationMetadata(record);

          if (execution.timedOut) {
            return failureResult(
              createDysflowError(
                "RUNNER_TIMEOUT",
                `Access operation timed out after ${config.timeoutMs}ms.`,
                { retryable: true },
              ),
              { diagnostics, durationMs: execution.durationMs, operation: operationMetadata },
            );
          }

          if (execution.exitCode !== 0) {
            const safeOutput = sanitizeSecrets(
              execution.stderr || execution.stdout || "No runner output.",
              secrets,
            );
            return failureResult(
              createDysflowError(
                "RUNNER_FAILED",
                `PowerShell runner failed with exit code ${execution.exitCode ?? "unknown"}: ${safeOutput}`,
              ),
              { diagnostics, durationMs: execution.durationMs, operation: operationMetadata },
            );
          }

          try {
            return successResult(parseRunnerData<TData>(execution.stdout, secrets), {
              diagnostics,
              durationMs: execution.durationMs,
              operation: operationMetadata,
            });
          } catch {
            return failureResult(
              createDysflowError(
                "RUNNER_INVALID_JSON",
                "PowerShell runner produced invalid JSON output.",
              ),
              { diagnostics, durationMs: execution.durationMs, operation: operationMetadata },
            );
          }
        },
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("RUNNER_LOCK_TIMEOUT:")) {
        return failureResult(
          createDysflowError(
            "RUNNER_LOCK_TIMEOUT",
            error.message.slice("RUNNER_LOCK_TIMEOUT: ".length),
          ),
        );
      }
      throw error;
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
        errors: [
          {
            operationId: "preflight",
            message: `Pre-flight cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  private async updateOperationFromExecution(
    record: AccessOperationRecord,
    execution: PowerShellExecutionResult,
  ): Promise<AccessOperationRecord> {
    const status = execution.timedOut
      ? "timed_out"
      : execution.accessProcess === undefined && record.accessPid === null
        ? "pid_unknown"
        : execution.exitCode === 0
          ? "completed"
          : "failed";
    return (
      (await this.operationRegistry.update(record.operationId, {
        accessPid: execution.accessProcess?.pid ?? record.accessPid,
        processStartTime: execution.accessProcess?.processStartTime ?? record.processStartTime,
        commandLine: execution.accessProcess?.commandLine ?? record.commandLine,
        status,
        updatedAt: this.clock(),
      })) ?? record
    );
  }
}

export function getCrossProcessLockPath(accessPath: string): string {
  const hash = createHash("md5").update(accessPath.toLowerCase()).digest("hex");
  return join(tmpdir(), "dysflow-locks", `${hash}.lock`);
}

async function acquireCrossProcessAccessLock(lockPath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await mkdir(lockPath, { recursive: false });
      await writeFile(join(lockPath, "owner"), `${process.pid}\n`, "utf8").catch(() => {});
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const info = await stat(lockPath).catch(() => null);
      if (info !== null && Date.now() - info.mtimeMs > CROSS_PROCESS_LOCK_STALE_MS) {
        await rm(lockPath, { recursive: true, force: true }).catch(() => {});
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(
    `RUNNER_LOCK_TIMEOUT: Could not acquire cross-process lock for ${lockPath} within ${timeoutMs}ms`,
  );
}

async function releaseCrossProcessAccessLock(lockPath: string): Promise<void> {
  await rm(lockPath, { recursive: true, force: true }).catch(() => {});
}

async function runWithAccessExecutionLock<T>(
  accessPath: string,
  lockAcquireTimeoutMs: number,
  work: () => Promise<T>,
): Promise<T> {
  const key = accessPath.toLowerCase();
  const previous = (accessExecutionLocks.get(key) ?? Promise.resolve()).catch(() => undefined);
  let releaseCurrent!: () => void;
  const current = previous.then(
    () =>
      new Promise<void>((resolve) => {
        releaseCurrent = resolve;
      }),
  );
  accessExecutionLocks.set(key, current);

  await previous;
  const lockPath = getCrossProcessLockPath(accessPath);
  await mkdir(join(lockPath, ".."), { recursive: true }).catch(() => {});
  await acquireCrossProcessAccessLock(lockPath, lockAcquireTimeoutMs);
  try {
    return await work();
  } finally {
    releaseCurrent();
    if (accessExecutionLocks.get(key) === current) accessExecutionLocks.delete(key);
    await releaseCrossProcessAccessLock(lockPath);
  }
}

function buildPowerShellArguments(
  scriptPath: string,
  operation: AccessRunnerOperation,
  config: DysflowConfig,
  operationId: string,
): string[] {
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
    "-OperationId",
    operationId,
  ];
  return args;
}

function buildPowerShellEnvironment(
  config: DysflowConfig,
  operation?: AccessRunnerOperation,
): Record<string, string | undefined> | undefined {
  const env: Record<string, string> = {};
  if (config.accessPassword !== undefined) {
    env.DYSFLOW_ACCESS_PASSWORD = config.accessPassword;
    env.ACCESS_VBA_PASSWORD = config.accessPassword;
  }

  let backendPassword = config.backendPassword;
  if (operation?.kind === "query" && operation.request.backendPassword !== undefined) {
    backendPassword = operation.request.backendPassword;
  }

  if (backendPassword !== undefined) {
    env.DYSFLOW_BACKEND_PASSWORD = backendPassword;
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

function collectDiagnostics(
  execution: PowerShellExecutionResult,
  secrets: readonly string[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const safeStdout = sanitizeSecrets(execution.stdout, secrets);
  const safeStderr = sanitizeSecrets(execution.stderr, secrets);
  if (safeStdout.length > 0 && (execution.exitCode !== 0 || execution.timedOut))
    diagnostics.push(createDiagnostic("warning", "powershell.stdout", safeStdout));
  if (safeStderr.length > 0)
    diagnostics.push(createDiagnostic("error", "powershell.stderr", safeStderr));
  if (execution.accessProcess === undefined)
    diagnostics.push(
      createDiagnostic(
        "warning",
        "access.pid",
        "Access PID could not be determined; automatic cleanup is not safe.",
      ),
    );
  return diagnostics;
}

function parseRunnerData<TData>(stdout: string, secrets: readonly string[]): TData {
  const safeStdout = sanitizeSecrets(stdout, secrets);
  if (safeStdout.trim().length === 0) return {} as TData;
  const parsed: unknown = JSON.parse(safeStdout);
  if (!isRecord(parsed)) {
    throw new SyntaxError(`Runner output is not a JSON object (got ${typeof parsed})`);
  }
  return parsed as TData;
}

export function resolveDefaultRunnerScriptPath(
  env: Record<string, string | undefined> = process.env,
): string {
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
            const parsed = JSON.parse(
              line.slice(ACCESS_PROCESS_MARKER.length),
            ) as AccessProcessOwnership;
            captureTasks.push(options.onAccessProcessCaptured(parsed));
          } catch {
            nonMarkerLines.push(line);
          }
          continue;
        }
        if (line.startsWith(PROGRESS_MARKER)) {
          try {
            const data = JSON.parse(line.slice(PROGRESS_MARKER.length)) as {
              percent: number;
              total?: number;
              message?: string;
            };
            options.onProgress?.(data.percent, data.total, data.message);
          } catch {
            // swallow malformed progress lines — progress is best-effort telemetry
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
