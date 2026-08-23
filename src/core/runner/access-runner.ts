import { existsSync } from "node:fs";
import type { DysflowConfig } from "../config/dysflow-config.js";
import type {
  AccessQueryRequest,
  AccessRunnerProgressCallback,
  Diagnostic,
  PowerShellExecutionResult,
  PowerShellExecutor,
} from "../contracts/index.js";
import {
  createDiagnostic,
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import {
  type AccessOperationPreflightCleanup,
  diagnosticsFromPreflightCleanup,
} from "../operations/access-operation-preflight.js";
import {
  type AccessOperationRecord,
  type AccessOperationRegistry,
  createAccessOperationId,
  resolveAccessOperationRegistry,
  toOperationMetadata,
} from "../operations/access-operation-registry.js";
import type { CrossDbTableRunner } from "../runtime/cross-db-table-lookup.js";
import { isRecord, normalizePathForMatching, sanitizeSecrets } from "../utils/index.js";
import type { AccessRunnerOperation } from "./access-runner-operation.js";
import { resolveQueryPreflight } from "./query-preflight.js";
import { classifyInvalidPasswordFailure } from "./runner-failure-classifier.js";

export type {
  AccessProcessOwnership,
  AccessRunnerProgressCallback,
  PowerShellExecutionResult,
  PowerShellExecutor,
  PowerShellExecutorOptions,
} from "../contracts/index.js";
export { sanitizeSecrets as sanitizePowerShellOutput } from "../utils/index.js";

import {
  CROSS_PROCESS_LOCK_STALE_MS,
  defaultAccessExecutionLocks,
  getCrossProcessLockPath,
  type LockFileSystemPort,
  RunnerLockTimeoutError,
  runWithAccessExecutionLock,
  runWithAccessExecutionReadLock,
} from "./cross-process-lock.js";

export type { LockFileSystemPort };
export { CROSS_PROCESS_LOCK_STALE_MS, getCrossProcessLockPath, RunnerLockTimeoutError };

export const RUNNER_INVALID_OUTPUT = "RUNNER_INVALID_OUTPUT";

export function ensureResultShape<TData>(
  result: OperationResult<TData>,
  isValid: (data: unknown) => boolean,
): OperationResult<TData> {
  if (!result.ok) return result;
  if (isValid(result.data)) return result;
  return failureResult(
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

// Import and re-export the result channel contract so existing consumers of access-runner.ts
// continue to work without changes (backward-compat re-exports).
import {
  extractResultPayload,
  RESULT_MARKER,
  RunnerResultChannelError,
} from "./ps-result-channel.js";

export type { AccessDiagnosticsRequest, AccessRunnerOperation } from "./access-runner-operation.js";
export { extractResultPayload, RESULT_MARKER, RunnerResultChannelError };

export type AccessRunnerRunOptions = { onProgress?: AccessRunnerProgressCallback };
export type AccessRunner = {
  run<TData = unknown>(
    operation: AccessRunnerOperation,
    config?: DysflowConfig,
    options?: AccessRunnerRunOptions,
  ): Promise<OperationResult<TData>>;
  /**
   * v1.20.0 (issues #763 + #764) — internal probe seam that runs a query
   * WITHOUT acquiring the cross-process file lock. Used exclusively by
   * `cross-db-table-lookup` (the cross-DB table lookup primitive).
   *
   * Why this exists:
   *   - Calling `run()` recursively would deadlock on the cross-process
   *     lock (the lock is keyed by `config.accessDbPath` and the parent
   *     call already holds it).
   *   - The auto-mode resolution path (and the no-target cross-DB
   *     detection) MUST consult both DBs without re-entering the lock.
   *
   * Contract:
   *   - `runProbe` MUST only be called from within a `run()` invocation
   *     that is already holding the cross-process lock. Production
   *     code MUST NOT call it directly — only `cross-db-table-lookup.ts`
   *     is allowed to.
   *   - The probe uses the same `runLockedOperation` body as `run()`
   *     minus the lock acquisition. The result envelope is identical.
   *   - The probe MUST NOT create an operation-registry record. The
   *     parent call's record covers the whole flow.
   *
   * Implementation lives on `AccessPowerShellRunner.runProbe` (below).
   */
  runProbe<TData = unknown>(
    request: AccessQueryRequest,
    config: DysflowConfig,
  ): Promise<OperationResult<TData>>;
};
/**
 * Filesystem existence port. Injected so the domain never reaches `node:fs`
 * directly (issue #499) — keeping the runner testable at the port, per the
 * repo's hexagonal rule. Defaults to a `node:fs` adapter in production.
 */
export type FileExistsChecker = (path: string) => boolean;

export type AccessPowerShellRunnerOptions = {
  executor: PowerShellExecutor;
  scriptPath?: string;
  operationRegistry?: AccessOperationRegistry;
  preflightCleanup?: AccessOperationPreflightCleanup;
  operationIdFactory?: () => string;
  clock?: () => string;
  lockAcquireTimeoutMs?: number;
  fileExists?: FileExistsChecker;
  /**
   * Filesystem port for the cross-process execution lock. Injected so the domain never
   * reaches `node:fs` directly. Production injects `nodeLockFileSystem`
   * (src/adapters/runner/node-lock-file-system.ts); tests inject a fake or the node port.
   */
  lockFileSystem: LockFileSystemPort;
};

const noopPreflightCleanup: AccessOperationPreflightCleanup = {
  async cleanup() {
    return { cleaned: [], killed: [], orphanedKilled: [], errors: [] };
  },
};

function resolveCompactRepairTarget(
  request: AccessQueryRequest,
  config: DysflowConfig,
): "frontend" | "backend" | undefined {
  const explicitPath = request.databasePath ?? request.backendPath;
  if (explicitPath !== undefined) {
    const normalizedPath = normalizePathForMatching(explicitPath);
    if (
      config.backendPath !== undefined &&
      normalizedPath === normalizePathForMatching(config.backendPath)
    ) {
      return "backend";
    }
    if (normalizedPath === normalizePathForMatching(config.accessDbPath)) return "frontend";
    return undefined;
  }
  return request.target === "frontend" || request.target === "backend" ? request.target : undefined;
}

export class AccessPowerShellRunner implements AccessRunner {
  private readonly executor: PowerShellExecutor;
  private readonly scriptPath: string;
  private readonly operationRegistry: AccessOperationRegistry;
  private readonly preflightCleanup: AccessOperationPreflightCleanup;
  private readonly operationIdFactory: () => string;
  private readonly clock: () => string;
  private readonly lockAcquireTimeoutMs: number;
  private readonly fileExists: FileExistsChecker;
  private readonly lockFileSystem: LockFileSystemPort;

  constructor(options: AccessPowerShellRunnerOptions) {
    this.executor = options.executor;
    this.scriptPath = options.scriptPath ?? resolveDefaultRunnerScriptPath();
    this.operationRegistry = resolveAccessOperationRegistry(options.operationRegistry);
    this.preflightCleanup = options.preflightCleanup ?? noopPreflightCleanup;
    this.operationIdFactory = options.operationIdFactory ?? createAccessOperationId;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.lockAcquireTimeoutMs = options.lockAcquireTimeoutMs ?? 30_000;
    this.fileExists = options.fileExists ?? ((path) => existsSync(path));
    this.lockFileSystem = options.lockFileSystem;
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
      // #750 — diagnostics and any `kind: "vba"` request that explicitly opts
      // into readOnly (export_modules, export_all) must NOT acquire the
      // cross-process file lock. Acquiring that lock tells Access "another
      // process is editing" and causes Access to rewrite metadata on the
      // .accdb (timestamps, internal stats) even when the runner itself
      // doesn't write. A read-only tool must never trigger that. We still
      // serialize in-process via the same `lockState` map so two read-only
      // calls don't run concurrently against the same .accdb.
      const isReadOnlyPath =
        operation.kind === "diagnostics" ||
        (operation.kind === "vba" && operation.request.readOnly === true);
      if (isReadOnlyPath) {
        return await runWithAccessExecutionReadLock<OperationResult<TData>>(
          config.accessDbPath,
          async () => {
            return await this.runLockedOperation<TData>(operation, config, options);
          },
          defaultAccessExecutionLocks,
        );
      }
      // F3b (#620): collect non-ENOENT heartbeat errors in a closure so they can
      // be drained as warning diagnostics on the returned `OperationResult`.
      // ENOENT (lock already released) is still suppressed inside
      // `startLockHeartbeat` and never reaches this sink.
      const heartbeatErrors: unknown[] = [];
      const heartbeatSink = (error: unknown) => {
        heartbeatErrors.push(error);
      };
      return await runWithAccessExecutionLock(
        config.accessDbPath,
        async () => {
          return await this.runLockedOperation<TData>(operation, config, options, heartbeatErrors);
        },
        this.lockAcquireTimeoutMs,
        this.lockFileSystem,
        defaultAccessExecutionLocks,
        heartbeatSink,
      );
    } catch (error) {
      if (error instanceof RunnerLockTimeoutError) {
        return failureResult(createDysflowError("RUNNER_LOCK_TIMEOUT", error.message));
      }
      throw error;
    }
  }

  /**
   * v1.20.0 (issues #763 + #764) — internal probe seam for the cross-DB
   * table lookup primitive. Runs a query WITHOUT acquiring the cross-process
   * file lock and WITHOUT creating an operation-registry record.
   *
   * MUST only be called from within a `run()` invocation that is already
   * holding the lock. Production code does not call this directly — only
   * `cross-db-table-lookup.ts` does.
   *
   * The probe request MUST carry an explicit `databasePath` so the
   * auto-mode branch in `runLockedOperation` is bypassed. The probe MUST
   * NOT carry `target` (set it to `undefined`).
   */
  async runProbe<TData = unknown>(
    request: AccessQueryRequest,
    config: DysflowConfig,
  ): Promise<OperationResult<TData>> {
    const operation: AccessRunnerOperation = { kind: "query", request };
    // Synthetic probe operation id; we do NOT register the probe with
    // the operation registry (the parent `run()` invocation's record
    // covers the whole flow). The id is purely for executor logging.
    const operationId = `probe-${this.operationIdFactory()}`;
    const dynamicBackendPassword =
      request.backendPassword !== undefined ? request.backendPassword : config.backendPassword;
    const secrets = [config.accessPassword, dynamicBackendPassword].filter(
      (secret): secret is string => Boolean(secret),
    );
    const execution = await this.executor(
      "powershell.exe",
      buildPowerShellArguments(this.scriptPath, operation, config, operationId),
      {
        timeoutMs: config.timeoutMs,
        operationId,
        accessPath: config.accessDbPath,
        env: buildPowerShellEnvironment(config, operation),
        // No-op `onAccessProcessCaptured`: probes do not update the
        // parent's operation registry (no registry entry was created for
        // the probe — the parent's `run()` invocation owns the record).
        onAccessProcessCaptured: async () => {
          /* probe: registry update is the parent's responsibility */
        },
      },
    );

    if (execution.timedOut) {
      return failureResult(
        createDysflowError("RUNNER_TIMEOUT", `Probe timed out after ${config.timeoutMs}ms.`, {
          retryable: true,
        }),
        { durationMs: execution.durationMs },
      );
    }
    if (execution.exitCode !== 0) {
      const safeOutput = sanitizeSecrets(
        execution.stderr || execution.stdout || "No runner output.",
        secrets,
      );
      // #1186 — a rejected database password is a config defect, not a runner
      // defect; surface the typed code so the consumer never has to recognise
      // a localized Access string.
      return failureResult(
        classifyInvalidPasswordFailure(safeOutput, config) ??
          createDysflowError(
            "RUNNER_FAILED",
            `Probe failed with exit code ${execution.exitCode ?? "unknown"}: ${safeOutput}`,
          ),
        { durationMs: execution.durationMs },
      );
    }
    try {
      return successResult(parseRunnerData<TData>(execution.stdout, secrets), {
        durationMs: execution.durationMs,
      });
    } catch (parseError) {
      const underlyingMessage =
        parseError instanceof Error ? parseError.message : String(parseError);
      return failureResult(
        createDysflowError(
          "RUNNER_INVALID_JSON",
          `Probe produced invalid JSON output: ${underlyingMessage}`,
        ),
        { durationMs: execution.durationMs },
      );
    }
  }

  private async runLockedOperation<TData = unknown>(
    operation: AccessRunnerOperation,
    config: DysflowConfig,
    options: AccessRunnerRunOptions,
    // F3b (#620): closure-pushed array of heartbeat errors, drained below into
    // the result's diagnostics. Optional so existing test fixtures that call
    // `runLockedOperation` directly (without going through `run`) still compile.
    heartbeatErrors?: unknown[],
  ): Promise<OperationResult<TData>> {
    const queryPreflight = await resolveQueryPreflight(
      operation,
      config,
      {
        runProbe: (request, cfg) => this.runProbe(request, cfg),
        fileExists: this.fileExists,
        crossDbRunner: this as unknown as CrossDbTableRunner,
      },
      resolveCompactRepairTarget,
    );
    if (queryPreflight.outcome === "failure") return queryPreflight.failure;
    const finalOperation = queryPreflight.operation;
    const compactRepairTarget = queryPreflight.compactRepairTarget;

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
      metadata: stripPayloadSecrets(finalOperation.request),
      updatedAt: this.clock(),
    });

    // Compute secrets before the executor call so they are in scope for
    // marker-payload sanitization inside onAccessProcessCaptured (#417).
    const dynamicBackendPassword =
      finalOperation.kind === "query" && finalOperation.request.backendPassword !== undefined
        ? finalOperation.request.backendPassword
        : config.backendPassword;
    const secrets = [config.accessPassword, dynamicBackendPassword].filter(
      (secret): secret is string => Boolean(secret),
    );

    const captureDiagnostics: Diagnostic[] = diagnosticsFromPreflightCleanup(preflightResult);
    const execution = await this.executor(
      "powershell.exe",
      buildPowerShellArguments(this.scriptPath, finalOperation, config, operationId),
      {
        timeoutMs: config.timeoutMs,
        operationId,
        accessPath: config.accessDbPath,
        env: buildPowerShellEnvironment(config, finalOperation),
        onProgress: options.onProgress,
        onAccessProcessCaptured: async (process) => {
          try {
            // Sanitize free-text marker fields before persisting so secrets
            // (passwords, tokens) are never stored in the registry (#417).
            const safeCommandLine =
              typeof process.commandLine === "string"
                ? sanitizeSecrets(process.commandLine, secrets)
                : undefined;
            record =
              (await this.operationRegistry.update(operationId, {
                accessPid: process.pid,
                processStartTime: process.processStartTime,
                commandLine: safeCommandLine,
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

    // #735: Capture the PowerShell worker PID from the spawn result so the
    // orphan cleanup service can find and kill stuck workers.
    if (execution.powershellWorkerPid != null) {
      try {
        record =
          (await this.operationRegistry.update(operationId, {
            powershellWorkerPid: execution.powershellWorkerPid,
            updatedAt: this.clock(),
          })) ?? record;
      } catch (error) {
        captureDiagnostics.push(
          createDiagnostic(
            "error",
            "powershell.worker-pid",
            `Failed to record PowerShell worker PID: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    }
    const diagnostics = [...collectDiagnostics(execution, secrets), ...captureDiagnostics];
    // F3b (#620): drain heartbeat errors collected during the lock into warning
    // diagnostics on the returned `OperationResult`. ENOENT (lock already
    // released) is suppressed by `startLockHeartbeat` and never reaches this
    // sink; only real failures (EPERM, EIO, etc.) are surfaced here.
    if (heartbeatErrors !== undefined && heartbeatErrors.length > 0) {
      for (const err of heartbeatErrors) {
        diagnostics.push(
          createDiagnostic(
            "warning",
            "access.heartbeat",
            `Heartbeat refresh failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    }
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
      // #1186 — see the matching comment in the probe path above.
      return failureResult(
        classifyInvalidPasswordFailure(safeOutput, config) ??
          createDysflowError(
            "RUNNER_FAILED",
            `PowerShell runner failed with exit code ${execution.exitCode ?? "unknown"}: ${safeOutput}`,
          ),
        { diagnostics, durationMs: execution.durationMs, operation: operationMetadata },
      );
    }

    try {
      const parsed = parseRunnerData<TData>(execution.stdout, secrets);
      const data =
        finalOperation.kind === "query" && isRecord(parsed)
          ? finalOperation.request.action === "query_sql"
            ? ({
                ...parsed,
                resolvedAccessPath:
                  finalOperation.request.databasePath ?? finalOperation.request.backendPath,
              } as TData)
            : finalOperation.request.action === "compact_repair" &&
                compactRepairTarget !== undefined
              ? ({ ...parsed, target: compactRepairTarget } as TData)
              : parsed
          : parsed;
      return successResult(data, {
        diagnostics,
        durationMs: execution.durationMs,
        operation: operationMetadata,
      });
    } catch (parseError) {
      const underlyingMessage =
        parseError instanceof Error ? parseError.message : String(parseError);
      // Truncated, secret-scrubbed stdout preview for operator diagnostics (#474)
      const rawPreview = execution.stdout.slice(0, 200);
      const safePreview = sanitizeSecrets(rawPreview, secrets);
      const stdoutPreviewDiags: Diagnostic[] =
        safePreview.length > 0
          ? [createDiagnostic("warning", "powershell.stdout", `[stdout-preview] ${safePreview}`)]
          : [];
      return failureResult(
        createDysflowError(
          "RUNNER_INVALID_JSON",
          `PowerShell runner produced invalid JSON output: ${underlyingMessage}`,
        ),
        {
          diagnostics: [...diagnostics, ...stdoutPreviewDiags],
          durationMs: execution.durationMs,
          operation: operationMetadata,
        },
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
        errors: [
          {
            operationId: "preflight",
            message: `Pre-flight cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        transitioned: [],
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

/**
 * Secret-bearing request fields that must NEVER be serialized into the
 * `-PayloadJson` command-line argument (issue #498). Windows exposes a
 * process's command line to any local process via Win32_Process.CommandLine,
 * so these values are forwarded out-of-band through the child environment
 * (see {@link buildPowerShellEnvironment} → DYSFLOW_BACKEND_PASSWORD). The
 * PowerShell runner reads them from `$BackendPassword`/`$AccessPassword`,
 * which are sourced from env, so stripping them here is behavior-preserving.
 */
const PAYLOAD_SECRET_FIELDS = ["backendPassword", "accessPassword", "password"] as const;

function stripPayloadSecrets(request: object): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...(request as Record<string, unknown>) };
  for (const field of PAYLOAD_SECRET_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
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
    JSON.stringify(stripPayloadSecrets(operation.request)),
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
  // Strict sentinel extraction (issue #440): result MUST be on a DYSFLOW_RESULT line.
  // RunnerResultChannelError and SyntaxError both propagate loudly to the caller.
  const parsed = extractResultPayload(stdout, secrets);
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

/**
 * TS↔PowerShell marker contract for ACCESS_PROCESS lines.
 *
 * The PowerShell child script emits one line of the form:
 *   DYSFLOW_ACCESS_PROCESS {"pid":<number>,"processStartTime":<ISO-string|null>,"commandLine":<string|null>}
 *
 * Required fields: pid (number).
 * Nullable fields (the PowerShell child renders absent values as JSON null, not omission):
 *   - processStartTime: ISO-8601 string, or null when the child cannot resolve the OS StartTime
 *     (see ConvertTo-IsoStartTime in scripts/dysflow-access-runner.ps1).
 *   - commandLine: the full command line of the spawned Access process, or null on the primary
 *     hWnd capture path (Write-AccessProcessMarkerFromPid), which avoids WMI/CIM and so has no
 *     command line to report.
 *
 * Any unrecognised fields are ignored. A malformed line is treated as plain stderr.
 */
type AccessProcessMarker = {
  pid: number;
  processStartTime: string | null;
  commandLine?: string | null;
};

export function isAccessProcessMarker(value: unknown): value is AccessProcessMarker {
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
