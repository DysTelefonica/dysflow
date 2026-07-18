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
 *
 * `metadata` (#757) — optional structured bag for non-diagnostic machine-readable
 * signals (deprecation notices, schema-version hints, etc.). Distinct from
 * `diagnostics` so an AI consumer can branch on `metadata.deprecated.flag`
 * without text-grepping the diagnostics stream. When present it MAY also be
 * mirrored in `diagnostics` as a level:"warning" entry for human-readability.
 */
export type OperationResult<T> =
  | {
      ok: true;
      data: T;
      diagnostics: Diagnostic[];
      durationMs: number;
      operation?: AccessOperationMetadata;
      metadata?: OperationMetadata;
    }
  | {
      ok: false;
      error: DysflowError;
      diagnostics: Diagnostic[];
      durationMs: number;
      operation?: AccessOperationMetadata;
      metadata?: OperationMetadata;
    };

/**
 * Structured machine-readable metadata returned alongside an operation result.
 *
 * Today this carries `deprecated` (issue #757, C1 — surfacing
 * `diff:true → apply:true` migration hints on `export_all` / `export_modules`)
 * and `transactional` (issue #975 — proof of the copy / atomic-rename
 * round-trip when `transactional: true` was requested).
 * Future versions may add additional fields; consumers should treat unknown
 * keys as forward-compatible and use `metadata.deprecated` / `metadata.transactional`
 * as the stable branch keys for migrations.
 */
export type OperationMetadata = {
  /**
   * Migration hint for a deprecated flag the caller just exercised. The
   * adapter preserves the legacy behavior for at least one minor version
   * and emits this field whenever the legacy path is hit.
   */
  deprecated?: {
    /** The flag the caller passed (e.g. `"diff"`, `"compile"`). */
    flag: string;
    /** The runtime version that introduced the deprecation, `vX.Y.Z`. */
    since: string;
    /** The replacement flag the caller should switch to (e.g. `"apply"`). */
    use: string;
  };
  /**
   * Issue #975 — surfaced when the caller passed `transactional: true` and
   * the operation committed atomically. The SHA-256 of the ORIGINAL binary
   * is included so the consumer can verify the round-trip byte-for-byte.
   * The `stagingPath` field reports the absolute path of the staging copy
   * before the atomic commit. On failure the `transactional` field is
   * absent; the failure envelope already carries the originalSha256 inside
   * `details.originalSha256` so a rollback can be proven.
   */
  transactional?: {
    /** Absolute path the staging copy lived at before the atomic rename. */
    stagingPath: string;
    /** SHA-256 (hex) of the original binary BEFORE the staging copy was taken. */
    originalSha256: string;
  };
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
  /**
   * #781 P2 — non-empty when `child_process.spawn` itself failed (e.g. ENOENT
   * because `pwsh` is not on PATH). Distinct from `timedOut: true` (the
   * process was spawned and then killed by the timeout bound). When set,
   * `exitCode` is `null` and `timedOut` is `false`. Callers that need a
   * specific diagnostic for the "could not start" path MUST switch on
   * `spawnError` rather than treating the result as a generic exit-code
   * failure.
   */
  spawnError?: string;
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
  /**
   * Issue #851 — opt-in `link_tables` create capability. `"create-or-relink"`
   * creates a linked TableDef for each requested backend table missing from the
   * frontend (and relinks existing ones); when omitted, `link_tables` keeps its
   * default relink-only semantics and never creates a missing link. Named
   * `linkMode` to avoid colliding with the read/write dispatch `mode` above.
   */
  linkMode?: "relink-only" | "create-or-relink";
  /** Issue #851 — scope link/relink/create to specific backend tables. */
  tableNames?: readonly string[];
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
const CANONICAL_ERROR_REMEDIATION: Readonly<Record<string, string>> = {
  FORM_CONTROL_NOT_FOUND:
    "Run dysflow.form_list_controls to enumerate existing controls in the form.",
  FORM_IMPORT_GATE_FAILED:
    "Inspect details.cause and details.rollback, then follow references/error-codes.md#form_import_gate_failed before retrying.",
  VBA_IMPORT_PHASE_FAILED:
    "The Access parser rejected the module source. See references/error-codes.md#vba_import_phase_failed for diagnostic decoding.",
  MCP_INPUT_INVALID:
    "Check the tool schema and replace unsupported or missing fields before retrying.",
  FORM_UNKNOWN_PROPERTY:
    "Inspect details.knownProperties to find the right key. Use form_list_controls, form_get_geometry, or inspect_form for the full inventory.",
  FORM_PROPERTY_VALUE_INVALID:
    'Inspect details.expectedType vs details.actualType. Wrap as the appropriate literal: text → "value", boolean → true/false, integer → number, color → &HBBGGRR& hex, twip → finite number 0..50000.',
};
const DEFAULT_ERROR_REMEDIATION =
  "Review the error message and correct the reported condition before retrying.";

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
  const remediation =
    options.remediation ?? CANONICAL_ERROR_REMEDIATION[code] ?? DEFAULT_ERROR_REMEDIATION;
  return {
    code,
    message,
    retryable: options.retryable ?? false,
    ...(options.details ? { details: options.details } : {}),
    ...(options.allowedProcedures ? { allowedProcedures: options.allowedProcedures } : {}),
    remediation,
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
    metadata?: OperationMetadata;
  } = {},
): OperationResult<T> {
  return {
    ok: true,
    data,
    diagnostics: options.diagnostics ?? [],
    durationMs: options.durationMs ?? 0,
    ...(options.operation ? { operation: options.operation } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
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
    metadata?: OperationMetadata;
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
