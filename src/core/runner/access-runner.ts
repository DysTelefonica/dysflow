import { existsSync } from "node:fs";
import type { DysflowConfig } from "../config/dysflow-config.js";
import type {
  AccessQueryRequest,
  AccessRunnerProgressCallback,
  AccessVbaRequest,
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
import { isFrontendOnlyAction } from "../mapping/access-query-request-mapper.js";
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
import {
  type CrossDbTableRunner,
  lookupTableAcrossDatabases,
} from "../runtime/cross-db-table-lookup.js";
import { isRecord, sanitizeSecrets } from "../utils/index.js";
import { parseSimpleSelectShape } from "../utils/simple-select-shape.js";

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

export { extractResultPayload, RESULT_MARKER, RunnerResultChannelError };

export type AccessDiagnosticsRequest = {
  includeEnvironment?: boolean;
  // Overrides
  projectId?: string;
  contextId?: string;
  accessPath?: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  timeoutMs?: number;
  strictContext?: boolean;
  expectedAccessPath?: string;
  expectedProjectRoot?: string;
  expectedDestinationRoot?: string;
};
export type AccessRunnerOperation =
  | { kind: "vba"; request: AccessVbaRequest }
  | { kind: "query"; request: AccessQueryRequest }
  | { kind: "diagnostics"; request: AccessDiagnosticsRequest };

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
      return failureResult(
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
    let finalOperation = operation;
    if (operation.kind === "query") {
      // #870 — linked-table and saved-query operations act on the frontend
      // database even when backendPath is also present as auxiliary input.
      // Resolve their forced semantic role before the generic target logic,
      // whose normal explicit-backendPath precedence is correct for general reads.
      if (
        operation.request.target === "frontend" &&
        isFrontendOnlyAction(operation.request.action)
      ) {
        finalOperation = {
          ...operation,
          request: {
            ...operation.request,
            databasePath: operation.request.databasePath ?? config.accessDbPath,
            target: undefined,
          },
        };
      }
      // #763 — when the caller passed `target: "auto"` and did not supply
      // an explicit `databasePath` or `backendPath`, resolve the target
      // via the cross-DB table lookup primitive. The lookup probes
      // `config.backendPath` first, then `config.accessDbPath`, and:
      //   - On a single-DB hit → sets `databasePath` and clears `target`.
      //   - On ambiguous → returns ACCESS_TABLE_AMBIGUOUS.
      //   - On not-found → returns ACCESS_TABLE_NOT_FOUND (the runner
      //     falls through to the existing CONFIG_MISSING_TARGET_PATH
      //     guard, preserving the v1.19.0 behaviour for that edge).
      //
      // Auto-mode requires a `tableName`; without one the lookup cannot
      // resolve a "which DB has this table" answer. In that case we
      // refuse with a structured error rather than picking a DB at random.
      if (
        operation.request.target === "auto" &&
        !operation.request.databasePath &&
        !operation.request.backendPath
      ) {
        if (operation.request.tableName === undefined || operation.request.tableName.length === 0) {
          return failureResult(
            createDysflowError(
              "CONFIG_MISSING_TARGET_PATH",
              "Cannot resolve target='auto': the request requires a tableName so the cross-DB lookup can decide which configured database contains the table. Pass tableName in the request, or pass an explicit target ('frontend' | 'backend') or databasePath.",
            ),
          );
        }
        const runner = this as unknown as CrossDbTableRunner;
        const lookup = await lookupTableAcrossDatabases(
          config,
          operation.request.tableName,
          runner,
        );
        if (!lookup.ok) {
          if (lookup.error === "ACCESS_TABLE_AMBIGUOUS") {
            return failureResult(
              createDysflowError(lookup.error, lookup.message, {
                details: {
                  roles: lookup.details.roles,
                  candidates: lookup.details.candidates,
                },
              }),
            );
          }
          // ACCESS_TABLE_NOT_FOUND — fall through to the existing
          // CONFIG_MISSING_TARGET_PATH guard below.
          return failureResult(
            createDysflowError(
              "CONFIG_MISSING_TARGET_PATH",
              `target='auto' could not locate the table in either configured database (backend or frontend). ${lookup.message}`,
            ),
          );
        }
        // Single-DB answer — set the resolved databasePath and clear target.
        finalOperation = {
          ...operation,
          request: {
            ...operation.request,
            databasePath: lookup.databasePath,
            target: undefined,
          },
        };
      }

      // #716 — when the caller passed a semantic `target` (frontend/backend)
      // and did not supply an explicit `databasePath` or `backendPath`,
      // resolve it from the project config. Explicit paths always win so
      // callers can still override the configured target per-call.
      if (
        finalOperation.kind === "query" &&
        finalOperation.request.target !== undefined &&
        finalOperation.request.target !== "auto" &&
        !finalOperation.request.databasePath
      ) {
        if (
          finalOperation.request.target === "backend" &&
          (finalOperation.request.backendPath || config.backendPath)
        ) {
          finalOperation = {
            ...finalOperation,
            request: {
              ...finalOperation.request,
              backendPath: finalOperation.request.backendPath ?? config.backendPath,
              target: undefined,
            },
          };
        } else if (finalOperation.request.target === "frontend" && config.accessDbPath) {
          finalOperation = {
            ...finalOperation,
            request: {
              ...finalOperation.request,
              databasePath: config.accessDbPath,
              target: undefined,
            },
          };
        } else if (finalOperation.request.target === "frontend" && config.backendPath) {
          // Frontend target requested but no frontend path is configured —
          // fall back to a structured error rather than silently switching
          // to the backend (which would violate the caller's intent).
          return failureResult(
            createDysflowError(
              "CONFIG_MISSING_TARGET_PATH",
              "Cannot resolve frontend target: project config does not declare accessPath. Pass databasePath explicitly or set accessPath in .dysflow/project.json.",
            ),
          );
        } else if (finalOperation.request.target === "backend") {
          return failureResult(
            createDysflowError(
              "CONFIG_MISSING_TARGET_PATH",
              "Cannot resolve backend target: project config does not declare backendPath. Pass backendPath explicitly or set backendPath in .dysflow/project.json.",
            ),
          );
        }
      }

      // #764 — when the caller did NOT pass `target` / `databasePath` /
      // `backendPath` AND the request carries a `tableName`, run the
      // cross-DB table lookup. This catches the "non-deterministic
      // answer on ambiguous tables" footgun where the caller used to
      // get either the backend's or the frontend's row set without
      // knowing which one was queried. Now the lookup reports the
      // ambiguity as a typed error and, on a single-DB answer, sets
      // the resolved `databasePath` so the rest of the runner path
      // executes against the right DB.
      if (
        finalOperation.kind === "query" &&
        finalOperation.request.target === undefined &&
        finalOperation.request.databasePath === undefined &&
        finalOperation.request.backendPath === undefined &&
        finalOperation.request.tableName !== undefined &&
        finalOperation.request.tableName.length > 0
      ) {
        const runner = this as unknown as CrossDbTableRunner;
        const lookup = await lookupTableAcrossDatabases(
          config,
          finalOperation.request.tableName,
          runner,
        );
        if (!lookup.ok) {
          if (lookup.error === "ACCESS_TABLE_AMBIGUOUS") {
            return failureResult(
              createDysflowError(lookup.error, lookup.message, {
                details: {
                  roles: lookup.details.roles,
                  candidates: lookup.details.candidates,
                },
              }),
            );
          }
          // ACCESS_TABLE_NOT_FOUND — fall through to the existing
          // CONFIG_MISSING_TARGET_PATH guard below. The default-backend
          // fallback MUST NOT silently switch DBs when the lookup said
          // the table is in neither.
          return failureResult(
            createDysflowError(
              "CONFIG_MISSING_TARGET_PATH",
              `Could not locate the table in either configured database (backend or frontend). ${lookup.message} Pass an explicit target ('frontend' | 'backend' | 'auto') or databasePath to disambiguate.`,
            ),
          );
        }
        // Single-DB answer — set the resolved databasePath.
        finalOperation = {
          ...finalOperation,
          request: {
            ...finalOperation.request,
            databasePath: lookup.databasePath,
          },
        };
      }

      // Default the read/write target to the project's configured
      // backend when the caller did not pass databasePath or
      // backendPath. This used to silently fall through to the
      // frontend (CurrentDb) when the config also had no
      // backendPath, which surfaced to MCP callers as the opaque
      // "RUNNER_INVALID_JSON: No DYSFLOW_RESULT line" error after
      // the PowerShell runner threw "Access database not found".
      //
      // Reads `finalOperation.request` (not `operation.request`) so the
      // #716 semantic-target block above is not clobbered: when target
      // resolution already populated `backendPath` or `databasePath`,
      // we must not re-run this default and lose the cleared `target`.
      // The `kind === "query"` guard re-narrows `finalOperation` after
      // the `let` reassign so TypeScript accepts `.backendPath` etc.
      if (finalOperation.kind === "query") {
        const queryRequest = finalOperation.request;
        if (!queryRequest.backendPath && !queryRequest.databasePath) {
          if (config.backendPath) {
            finalOperation = {
              ...finalOperation,
              request: {
                ...queryRequest,
                backendPath: config.backendPath,
              },
            };
          } else if (config.accessDbPath) {
            finalOperation = {
              ...finalOperation,
              request: {
                ...queryRequest,
                databasePath: config.accessDbPath,
              },
            };
          }
        }
      }

      // #882 — ACE reports both a missing table and an unknown projected
      // column as the same "too few parameters" failure. For the deliberately
      // narrow SELECT shape we can prove, inspect the resolved database schema
      // before executing and return an actionable code. Complex SQL bypasses
      // this branch and retains the engine's conservative ACCESS_QUERY_FAILED.
      if (finalOperation.kind === "query" && finalOperation.request.action === "query_sql") {
        const shape = parseSimpleSelectShape(finalOperation.request.sql);
        const resolvedAccessPath =
          finalOperation.request.databasePath ?? finalOperation.request.backendPath;
        if (shape !== undefined && resolvedAccessPath !== undefined) {
          const tablesResult = await this.runProbe(
            {
              action: "list_tables",
              mode: "read",
              sql: "",
              databasePath: resolvedAccessPath,
            },
            config,
          );
          const linkedTablesResult = await this.runProbe(
            {
              action: "list_linked_tables",
              mode: "read",
              sql: "",
              databasePath: resolvedAccessPath,
            },
            config,
          );
          const localTables =
            tablesResult.ok &&
            isRecord(tablesResult.data) &&
            Array.isArray(tablesResult.data.tables)
              ? tablesResult.data.tables.filter(
                  (table): table is string => typeof table === "string",
                )
              : undefined;
          const linkedTables =
            linkedTablesResult.ok &&
            isRecord(linkedTablesResult.data) &&
            Array.isArray(linkedTablesResult.data.tables)
              ? linkedTablesResult.data.tables.filter(
                  (table): table is string => typeof table === "string",
                )
              : undefined;
          const tables =
            localTables !== undefined && linkedTables !== undefined
              ? [...localTables, ...linkedTables]
              : undefined;
          if (
            tables !== undefined &&
            !tables.some((table) => table.toLowerCase() === shape.tableName.toLowerCase())
          ) {
            return failureResult(
              createDysflowError(
                "TABLE_NOT_IN_DATABASE",
                `Table '${shape.tableName}' does not exist in the resolved database.`,
                { details: { tableName: shape.tableName, resolvedAccessPath } },
              ),
            );
          }
          // If listing tables itself failed, classification is not provable:
          // execute the original SQL and preserve the engine's error instead.
          if (tables !== undefined) {
            const schemaResult = await this.runProbe(
              {
                action: "get_schema",
                mode: "read",
                sql: "",
                tableName: shape.tableName,
                databasePath: resolvedAccessPath,
              },
              config,
            );
            const schema =
              schemaResult.ok &&
              isRecord(schemaResult.data) &&
              Array.isArray(schemaResult.data.schema)
                ? schemaResult.data.schema
                : undefined;
            // An unavailable schema is not evidence that a projected column
            // is absent, so only classify from a concrete schema array.
            if (schema !== undefined) {
              const availableColumns = new Set(
                schema
                  .filter(isRecord)
                  .map((column) => column.name)
                  .filter((name): name is string => typeof name === "string")
                  .map((name) => name.toLowerCase()),
              );
              const missingColumn = shape.columnNames.find(
                (column) => !availableColumns.has(column.toLowerCase()),
              );
              if (missingColumn !== undefined) {
                return failureResult(
                  createDysflowError(
                    "COLUMN_NOT_IN_TABLE",
                    `Column '${missingColumn}' does not exist in table '${shape.tableName}'.`,
                    {
                      details: {
                        tableName: shape.tableName,
                        columnName: missingColumn,
                        resolvedAccessPath,
                      },
                    },
                  ),
                );
              }
            }
          }
        }
      }

      // Fail fast with a structured error if no read/write target
      // can be resolved. Without this check, the PowerShell runner
      // would throw "Access database not found:" mid-execution and
      // the MCP caller would only see RUNNER_INVALID_JSON, hiding
      // the real cause.
      if (finalOperation.kind === "query") {
        const finalRequest = finalOperation.request;
        // Biome lint forbids `in` operator against optional fields; use
        // value checks instead. The query request fields are all
        // optional strings so a typeof + length > 0 check is the
        // canonical "is this present and non-empty?" probe.
        const candidatePaths: readonly unknown[] = [
          finalRequest.databasePath,
          finalRequest.backendPath,
        ];
        const hasTarget = candidatePaths.some(
          (value) => typeof value === "string" && value.length > 0,
        );
        if (!hasTarget) {
          return failureResult(
            createDysflowError(
              "CONFIG_MISSING_TARGET_PATH",
              "Cannot resolve a target Access database. Pass databasePath / backendPath in the request, or set accessPath / backendPath in the project config (.dysflow/project.json).",
            ),
          );
        }
        // Also fail fast if the project config's accessPath points
        // at a .accdb that does not exist on disk. Without this
        // check the PowerShell runner opens MSACCESS, fails to
        // find the file, throws "Access database not found", and
        // the MCP caller only sees "RUNNER_INVALID_JSON: No
        // DYSFLOW_RESULT line". The error has to surface as a
        // structured CONFIG_TARGET_NOT_FOUND so the caller can
        // tell config from a real Access failure.
        if (typeof config.accessDbPath === "string" && config.accessDbPath.length > 0) {
          if (!this.fileExists(config.accessDbPath)) {
            return failureResult(
              createDysflowError(
                "CONFIG_TARGET_NOT_FOUND",
                `Configured accessPath does not exist on disk: ${config.accessDbPath}. Update .dysflow/project.json (accessPath/backendPath) or pass databasePath in the request.`,
                {
                  details: {
                    accessDbPath: config.accessDbPath,
                    configPath: config.configPath,
                    projectRoot: config.projectRoot,
                  },
                },
              ),
            );
          }
        }
      }
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
      return failureResult(
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
        finalOperation.kind === "query" &&
        finalOperation.request.action === "query_sql" &&
        isRecord(parsed)
          ? ({
              ...parsed,
              resolvedAccessPath:
                finalOperation.request.databasePath ?? finalOperation.request.backendPath,
            } as TData)
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
