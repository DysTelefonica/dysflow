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


export type AccessVbaRequest = {
  moduleName: string;
  procedureName: string;
  arguments?: readonly unknown[];
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
  exportPath?: string;
  importPath?: string;
  queryDefinitions?: readonly { name: string; sql: string }[];
  scriptPath?: string;
  definition?: string;
  rows?: readonly Record<string, unknown>[];
  dryRun?: boolean;
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
};

export function createDiagnostic(
  level: DiagnosticLevel,
  source: string,
  message: string,
): Diagnostic {
  return { level, source, message };
}

/**
 * Creates a normalized Dysflow error for failed operation results.
 */
export function createDysflowError(
  code: string,
  message: string,
  options: { retryable?: boolean } = {},
): DysflowError {
  return { code, message, retryable: options.retryable ?? false };
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
export function failureResult<T = never>(
  error: DysflowError,
  options: {
    diagnostics?: Diagnostic[];
    durationMs?: number;
    operation?: AccessOperationMetadata;
  } = {},
): OperationResult<T> {
  return {
    ok: false,
    error,
    diagnostics: options.diagnostics ?? [],
    durationMs: options.durationMs ?? 0,
    ...(options.operation ? { operation: options.operation } : {}),
  };
}
