import type { AccessOperationMetadata } from "../operations/access-operation-registry.js";

export type DiagnosticLevel = "info" | "warning" | "error";

export type Diagnostic = {
  level: DiagnosticLevel;
  source: string;
  message: string;
};

export type DysflowError = {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  /**
   * Currently-allowed procedure allowlist, populated only on refusals
   * that hit the gate (e.g. `PROCEDURE_NOT_ALLOWED`). Lets a consuming
   * agent read the live allowlist directly off the error envelope instead
   * of re-asking the user. Mirrors the field exposed by
   * `get_capabilities.allowedProcedures` (#656 / PR #661).
   */
  allowedProcedures?: readonly string[];
  /**
   * One-line fix instruction, populated only on refusals that hit the
   * gate (e.g. `PROCEDURE_NOT_ALLOWED`). The MCP text content mirrors
   * the same line for log-grep convenience.
   */
  remediation?: string;
};

/**
 * Protocol-neutral result envelope returned by core operations.
 *
 * Adapters should translate this shape to their transport protocol without
 * throwing for expected operation failures.
 */
export type OperationResult<T> =
  | {
      ok: true;
      data: T;
      diagnostics: Diagnostic[];
      durationMs: number;
      operation?: AccessOperationMetadata;
    }
  | {
      ok: false;
      error: DysflowError;
      diagnostics: Diagnostic[];
      durationMs: number;
      operation?: AccessOperationMetadata;
    };

/**
 * Seam that allows the MCP adapter to dispatch VBA sync tool calls
 * through an injected implementation without importing the adapter module.
 *
 * The port uses `string` for `toolName` (not `DysflowMcpToolName`) so
 * that core does not import adapter-layer type definitions.
 * Concrete implementations (e.g. VbaSyncAdapter) live in src/adapters/.
 */
export type VbaSyncPort = {
  execute(toolName: string, input: unknown): Promise<OperationResult<unknown>>;
};

export type AccessProcessOwnership = {
  pid: number;
  processStartTime: string | null;
  commandLine?: string | null;
};

export type AccessRunnerProgressCallback = (
  percent: number,
  total?: number,
  message?: string,
) => void;

export type PowerShellExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  accessProcess?: AccessProcessOwnership;
  powershellWorkerPid?: number;
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

export type AccessVbaRequest = {
  moduleName: string;
  procedureName: string;
  arguments?: readonly unknown[];
  /**
   * PR1a (#621 F1) — explicit "plan only" escape hatch for VBA execution at
   * the MCP adapter boundary. When the project config does not declare
   * `allowedProcedures`, the adapter refuses execution unless the caller
   * sets `dryRun: true`. The core service honors this flag by skipping the
   * real Access side-effect and returning a plan-shaped result.
   *
   * Optional; default `undefined` is treated as "not a dry-run".
   */
  dryRun?: boolean;
  /**
   * #750 — explicit read-only marker for VBA operations that extract or
   * inspect the binary without writing (e.g. `export_modules`,
   * `export_all`). When `true`, the runner skips the cross-process file
   * lock so Access does not rewrite metadata on the .accdb for what is
   * actually a read. The `vba-sync-adapter` sets this automatically for
   * the export tools; other callers (HTTP / direct runner use) can set it
   * explicitly.
   *
   * Optional; default `undefined` is treated as "not read-only" (the
   * runner takes the write path with the cross-process lock).
   */
  readOnly?: boolean;
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

export type LinkClassification =
  | "alreadyLocal"
  | "plannedRelink"
  | "ambiguous"
  | "unresolved"
  | "cycle"
  | "applied"
  | "removed";

export type RelinkDirectoryLinkResult = {
  database: string;
  linkName: string;
  originalBackendPath: string;
  classification: LinkClassification;
  resolvedLocalPath?: string | null;
  cycleDetected?: boolean;
  chainHops?: number;
  ambiguous?: boolean;
};

export type RelinkDirectoryFileResult = {
  filePath: string;
  linkedTablesFound: number;
  alreadyLocal: number;
  plannedRelinks: number;
  appliedRelinks: number;
  links: RelinkDirectoryLinkResult[];
  backupPath?: string;
  errors: string[];
};

export type RelinkDirectoryReport = {
  mode: "dry-run" | "apply" | "verify";
  root: string;
  filesScanned: number;
  linkedTablesFound: number;
  alreadyLocal: number;
  plannedRelinks: number;
  appliedRelinks: number;
  unresolved: RelinkDirectoryLinkResult[];
  removed: RelinkDirectoryLinkResult[];
  externalLinkCount: number;
  datosteLinkCount: number;
  brokenLinkCount: number;
  backupPaths: string[];
  errors: string[];
  fileResults: RelinkDirectoryFileResult[];
};

export type AccessQueryRequest = {
  sql: string;
  mode: "read" | "write";
  action?:
    | "query_sql"
    | "list_tables"
    | "list_linked_tables"
    | "get_schema"
    | "count_rows"
    | "distinct_values"
    | "compare_backends"
    | "list_access_files"
    | "get_relationships"
    | "list_links"
    | "link_tables"
    | "relink_tables"
    | "localize_backend_links"
    | "unlink_table"
    | "export_queries"
    | "import_queries"
    | "compact_repair"
    | "exec_sql"
    | "run_script"
    | "create_table"
    | "drop_table"
    | "seed_fixture"
    | "teardown_fixture"
    | "relink_directory";
  tableName?: string;
  columnName?: string;
  backendPath?: string;
  rootPath?: string;
  databasePath?: string;
  /**
   * Semantic target role for read-only query/schema tools (#716).
   * `frontend` resolves to the configured `accessPath`; `backend` resolves to `backendPath`.
   * `auto` (PR-2 of v1.20.0, issue #763) triggers the cross-DB table
   * lookup primitive: the runner probes the configured backend first,
   * then the frontend, and resolves to whichever one contains the
   * table. When both have it, the runner returns a typed
   * `ACCESS_TABLE_AMBIGUOUS` error (issue #764).
   *
   * Resolution requires `projectId` (or `contextId`) and happens
   * downstream of the mapper; explicit `accessPath`/`backendPath`/
   * `databasePath` win when provided.
   */
  target?: "frontend" | "backend" | "auto";
  exportPath?: string;
  importPath?: string;
  queryDefinitions?: readonly { name: string; sql: string }[];
  scriptPath?: string;
  definition?: string;
  rows?: readonly Record<string, unknown>[];
  dryRun?: boolean;
  /** compact_repair: back up the database (Backup-AccessFile) before compacting. */
  backupFirst?: boolean;
  allowTables?: readonly string[];
  denyTables?: readonly string[];
  maps?: readonly { from: string; to: string }[];
  denyPrefixes?: readonly string[];
  strictLocal?: boolean;
  removeUnresolved?: boolean;
  noBackup?: boolean;
  recursive?: boolean;
  timeoutMs?: number;
  backendPassword?: string;
  // Overrides
  projectId?: string;
  contextId?: string;
  accessPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  strictContext?: boolean;
  expectedAccessPath?: string;
  expectedProjectRoot?: string;
  expectedDestinationRoot?: string;
};

export function createDiagnostic(
  level: DiagnosticLevel,
  source: string,
  message: string,
): Diagnostic {
  return { level, source, message };
}

export type {
  PayloadType,
  SerializationFailedEnvelope,
} from "./result-writer.js";
export {
  buildSerializationFailedEnvelope,
  DIAGNOSTICS_MAX_LENGTH,
  DIAGNOSTICS_PREFIX,
  PAYLOAD_TYPE_WHITELIST,
  PayloadTypeSchema,
  RESULT_MARKER,
  ResultEnvelopeSchema,
  SERIALIZATION_FAILED_CODE,
  SerializationFailedEnvelopeSchema,
  whyPayloadTypeIsNotWhitelisted,
} from "./result-writer.js";

/**
 * Creates a normalized Dysflow error for failed operation results.
 */
export function createDysflowError(
  code: string,
  message: string,
  options: {
    retryable?: boolean;
    details?: Record<string, unknown>;
    allowedProcedures?: readonly string[];
    remediation?: string;
  } = {},
): DysflowError {
  return {
    code,
    message,
    retryable: options.retryable ?? false,
    ...(options.details ? { details: options.details } : {}),
    ...(options.allowedProcedures ? { allowedProcedures: options.allowedProcedures } : {}),
    ...(options.remediation ? { remediation: options.remediation } : {}),
  };
}

/**
 * Creates a successful operation result with optional diagnostics, timing, and
 * Access operation metadata.
 */
export function successResult<T>(
  data: T,
  options: {
    diagnostics?: Diagnostic[];
    durationMs?: number;
    operation?: AccessOperationMetadata;
  } = {},
): OperationResult<T> {
  return {
    ok: true,
    data,
    diagnostics: options.diagnostics ?? [],
    durationMs: options.durationMs ?? 0,
    ...(options.operation ? { operation: options.operation } : {}),
  };
}

/**
 * Creates a failed operation result without throwing, preserving diagnostics,
 * timing, and optional Access operation metadata for adapter translation.
 */
export function failureResult(
  error: DysflowError,
  options: {
    diagnostics?: Diagnostic[];
    durationMs?: number;
    operation?: AccessOperationMetadata;
  } = {},
): OperationResult<never> {
  return {
    ok: false,
    error,
    diagnostics: options.diagnostics ?? [],
    durationMs: options.durationMs ?? 0,
    ...(options.operation ? { operation: options.operation } : {}),
  };
}
