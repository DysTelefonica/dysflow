import type { AccessQueryRequest } from "../contracts/index.js";
import { isRecord, stringValue } from "../utils/index.js";

/**
 * Pure request-shaping for Access query operations.
 *
 * These functions translate a raw, untyped input record (as received by an
 * adapter such as MCP or HTTP) into a domain {@link AccessQueryRequest}. The
 * shaping itself — param aliasing, dryRun resolution, array filtering, password
 * resolution — is DOMAIN logic and therefore lives in `src/core`, free of any
 * adapter import (enforced by test/architecture/core-boundary.test.ts).
 *
 * Adapter-specific knowledge (which tool name maps to which `action`, and the
 * concrete env/secret source) is supplied by the caller: `action` and `mode`
 * are passed in, and secret lookup is delegated through an {@link EnvAccessor}.
 */

/** Resolves an environment/secret value by key. Injected by the adapter. */
export type EnvAccessor = (key: string) => string | undefined;

/** Concrete `action` values accepted by {@link AccessQueryRequest}. */
export type AccessQueryAction = NonNullable<AccessQueryRequest["action"]>;

export const VALID_ACCESS_QUERY_ACTIONS = [
  "query_sql",
  "list_tables",
  "list_linked_tables",
  "get_schema",
  "count_rows",
  "distinct_values",
  "compare_backends",
  "list_access_files",
  "get_relationships",
  "list_links",
  "link_tables",
  "relink_tables",
  "localize_backend_links",
  "unlink_table",
  "export_queries",
  "import_queries",
  "compact_repair",
  "exec_sql",
  "run_script",
  "create_table",
  "drop_table",
  "seed_fixture",
  "teardown_fixture",
  "relink_directory",
] as const;

export function isValidAccessQueryAction(action: unknown): action is AccessQueryAction {
  return (
    typeof action === "string" && (VALID_ACCESS_QUERY_ACTIONS as readonly string[]).includes(action)
  );
}

function paramsOf(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
}

/**
 * The override slice fields produced by {@link pickOverrides}. Centralized
 * so the 3 builder functions (`buildQueryReadRequest`,
 * `buildWriteFixtureRequest`, `buildMaintenanceRequest`) cannot drift.
 */
export type OverrideShape = {
  projectId: string | undefined;
  contextId: string | undefined;
  accessPath: string | undefined;
  destinationRoot: string | undefined;
  projectRoot: string | undefined;
  strictContext: boolean | undefined;
  expectedAccessPath: string | undefined;
  expectedProjectRoot: string | undefined;
  expectedDestinationRoot: string | undefined;
  timeoutMs: number | undefined;
  /** Semantic target role for read tools (#716). Resolved to accessPath/backendPath by the consumer. */
  target: QueryTarget | undefined;
};

/**
 * Semantic target role for read-only query/schema tools (#716).
 * `frontend` resolves to the configured `accessPath`; `backend` resolves to `backendPath`.
 * Resolution requires `projectId` (or `contextId`) and happens downstream of the mapper.
 *
 * v1.20.0 (#763) — `auto` is a NEW third value that triggers the cross-DB
 * table lookup primitive (`cross-db-table-lookup`). The runner resolves
 * `auto` by querying the configured backend first, then the frontend,
 * returning whichever one contains the table. When the table exists in
 * both, the runner returns a typed `ACCESS_TABLE_AMBIGUOUS` error (sibling
 * issue #764). Resolution requires `projectId` (or `contextId`) AND a
 * `tableName` in the request.
 */
export type QueryTarget = "frontend" | "backend" | "auto";

export const VALID_QUERY_TARGETS: readonly QueryTarget[] = ["frontend", "backend", "auto"];

export function isValidQueryTarget(value: unknown): value is QueryTarget {
  return typeof value === "string" && (VALID_QUERY_TARGETS as readonly string[]).includes(value);
}

/**
 * Reads a trimmed non-empty string from `params[key]`, falling back to the
 * provided alias keys in order. Returns undefined when no key yields a value.
 */
export function getStr(
  params: Record<string, unknown>,
  key: string,
  fallbackKeys?: readonly string[],
): string | undefined {
  const keys = [key, ...(fallbackKeys ?? [])];
  for (const k of keys) {
    const val = stringValue(params[k]);
    if (val !== undefined) return val;
  }
  return undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return values.length > 0 ? values : undefined;
}

function singleStringArrayValue(value: unknown): string[] | undefined {
  const single = stringValue(value);
  return single === undefined ? undefined : [single];
}

function rowsValue(value: unknown): readonly Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.filter(isRecord);
  return rows.length > 0 ? rows : undefined;
}

/**
 * Centralized override-slice picker for all 3 builder functions.
 * Pure of I/O; identical shape across every builder ensures no behavioral
 * drift between read / write-fixture / maintenance call sites.
 */
export function pickOverrides(params: Record<string, unknown>): OverrideShape {
  return {
    projectId: getStr(params, "projectId"),
    contextId: getStr(params, "contextId"),
    accessPath: getStr(params, "accessPath"),
    destinationRoot: getStr(params, "destinationRoot"),
    projectRoot: getStr(params, "projectRoot"),
    strictContext:
      params.strictContext === true ? true : params.strictContext === false ? false : undefined,
    expectedAccessPath: getStr(params, "expectedAccessPath"),
    expectedProjectRoot: getStr(params, "expectedProjectRoot"),
    expectedDestinationRoot: getStr(params, "expectedDestinationRoot"),
    timeoutMs: coerceTimeoutMs(params.timeoutMs as number | string | undefined),
    target: pickQueryTarget(params),
  };
}

/**
 * Reads `target` from the raw input and validates it is one of
 * `"frontend" | "backend"`. Invalid values surface as `undefined`
 * so the upstream Zod schema (which declares the enum) still
 * refuses them at the MCP boundary; this picker just defensively
 * normalizes whatever reaches the mapper.
 */
export function pickQueryTarget(params: Record<string, unknown>): QueryTarget | undefined {
  const raw = params.target;
  return isValidQueryTarget(raw) ? raw : undefined;
}

/**
 * Actions whose semantic target is always the frontend, even when an
 * auxiliary `backendPath` is also present in the request (#870). This is the
 * single source of truth for that role: the mapper forces `target: "frontend"`
 * here, and the runner resolves it to `config.accessDbPath` via
 * {@link isFrontendOnlyAction}. Adding a frontend-only tool means adding it to
 * this set only — the `frontend-only-action-parity` suite fails if the MCP
 * schema layer and this set ever disagree.
 */
export const FRONTEND_ONLY_ACTIONS: ReadonlySet<AccessQueryAction> = new Set([
  "list_linked_tables",
  "list_links",
  "export_queries",
  "link_tables",
  "relink_tables",
  "localize_backend_links",
  "unlink_table",
  "import_queries",
]);

export function isFrontendOnlyAction(action: AccessQueryAction | undefined): boolean {
  return action !== undefined && FRONTEND_ONLY_ACTIONS.has(action);
}

function targetForAction(action: AccessQueryAction, overrides: OverrideShape): OverrideShape {
  if (isFrontendOnlyAction(action)) return { ...overrides, target: "frontend" };
  if (action === "compact_repair") return { ...overrides, target: overrides.target ?? "frontend" };
  return overrides;
}

function maintenanceDatabasePath(
  action: AccessQueryAction,
  params: Record<string, unknown>,
): string | undefined {
  return action === "compact_repair"
    ? getStr(params, "databasePath", ["sourcePath", "accessPath"])
    : getStr(params, "databasePath", ["sourcePath"]);
}

/**
 * Coerces a `timeoutMs` value to `number | undefined`. The Zod schemas at
 * the MCP boundary already declare `timeoutMs: z.number().optional()`,
 * so the string branch is unreachable in practice — but the type
 * signature `number | string | undefined` forces us to handle it, and
 * we MUST NOT silently re-introduce the dead `parseFloat` branch the
 * refactor was meant to delete. Throwing turns a future regression into
 * a loud failure rather than a silent runtime mis-coercion.
 */
export function coerceTimeoutMs(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  throw new TypeError(
    `timeoutMs must be a number; received ${typeof value}. Zod schemas reject strings at parse time.`,
  );
}

function queryDefinitionsValue(
  value: unknown,
): readonly { name: string; sql: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const definitions = value
    .filter(isRecord)
    .map((item) => ({ name: stringValue(item.name) ?? "", sql: stringValue(item.sql) ?? "" }))
    .filter((item) => item.name.length > 0 && item.sql.length > 0);
  return definitions.length > 0 ? definitions : undefined;
}

/**
 * Resolves the dry-run flag. Defaults to dry-run (`true`) unless the caller
 * explicitly opts into applying (`apply: true`) or disables dry-run
 * (`dryRun: false`).
 */
export function resolveIsDryRun(input: unknown): boolean {
  if (!isRecord(input)) return true;
  if (input.apply === true) return false;
  if (input.dryRun === false) return false;
  return true;
}

/** Shapes a read-only Access query request. `mode` is fixed to `"read"`. */
export function buildQueryReadRequest(
  action: AccessQueryAction,
  input: unknown,
): AccessQueryRequest {
  if (!isValidAccessQueryAction(action)) {
    throw new Error(`Invalid Access query action: ${action}`);
  }
  const params = paramsOf(input);
  return {
    action,
    mode: "read",
    sql: getStr(params, "sql", ["query"]) ?? "",
    tableName: getStr(params, "tableName", ["table"]),
    columnName: getStr(params, "columnName", ["column"]),
    backendPath: getStr(params, "backendPath", ["comparePath"]),
    databasePath: getStr(params, "databasePath", ["sourcePath"]),
    rootPath: getStr(params, "rootPath", ["directory"]),
    exportPath: getStr(params, "exportPath", ["path"]),
    importPath: getStr(params, "importPath", ["path"]),
    queryDefinitions:
      queryDefinitionsValue(params.queryDefinitions) ?? queryDefinitionsValue(params.queries),
    ...targetForAction(action, pickOverrides(params)),
  };
}

/** Shapes a write-fixture Access query request. `mode` is fixed to `"write"`. */
export function buildWriteFixtureRequest(
  action: AccessQueryAction,
  input: unknown,
): AccessQueryRequest {
  if (!isValidAccessQueryAction(action)) {
    throw new Error(`Invalid Access query action: ${action}`);
  }
  const params = paramsOf(input);
  return {
    action,
    mode: "write",
    sql: getStr(params, "sql", ["query"]) ?? "",
    tableName: getStr(params, "tableName", ["table"]),
    columnName: getStr(params, "columnName", ["column"]),
    backendPath: getStr(params, "backendPath", ["comparePath"]),
    databasePath: getStr(params, "databasePath", ["sourcePath"]),
    rootPath: getStr(params, "rootPath", ["directory"]),
    scriptPath: getStr(params, "scriptPath", ["path"]),
    definition: getStr(params, "definition", ["fields"]),
    rows: rowsValue(params.rows),
    dryRun: resolveIsDryRun(input),
    allowTables: stringArrayValue(params.allowTables) ?? singleStringArrayValue(params.allowTable),
    denyTables: stringArrayValue(params.denyTables) ?? singleStringArrayValue(params.denyTable),
    ...targetForAction(action, pickOverrides(params)),
  };
}

/**
 * Shapes a maintenance Access query request. `action` and `mode` come from the
 * caller (the maintenance `queryMode` is adapter-resolved). `env` resolves the
 * `passwordEnv` secret; the resulting `backendPassword` MUST be preserved so the
 * error sink can redact it (#429).
 */
export function buildMaintenanceRequest(
  action: AccessQueryAction,
  mode: "read" | "write",
  input: unknown,
  env: EnvAccessor,
): AccessQueryRequest {
  if (!isValidAccessQueryAction(action)) {
    throw new Error(`Invalid Access query action: ${action}`);
  }
  const params = paramsOf(input);
  return {
    action,
    mode,
    sql: getStr(params, "sql", ["query"]) ?? "",
    tableName: getStr(params, "tableName", ["table"]),
    columnName: getStr(params, "columnName", ["column"]),
    backendPath: getStr(params, "backendPath", ["comparePath"]),
    rootPath: getStr(params, "rootPath", ["directory"]),
    databasePath: maintenanceDatabasePath(action, params),
    exportPath: getStr(params, "exportPath", ["path"]),
    importPath: getStr(params, "importPath", ["path"]),
    queryDefinitions:
      queryDefinitionsValue(params.queryDefinitions) ?? queryDefinitionsValue(params.queries),
    dryRun: resolveIsDryRun(input),
    backupFirst: params.backupFirst === true ? true : undefined,
    maps: Array.isArray(params.maps)
      ? params.maps.filter(
          (m): m is { from: string; to: string } =>
            isRecord(m) && typeof m.from === "string" && typeof m.to === "string",
        )
      : undefined,
    denyPrefixes: stringArrayValue(params.denyPrefixes),
    // Issue #851 — forward the opt-in link_tables create capability. The
    // tool-level `mode` param maps to `linkMode` (distinct from the read/write
    // dispatch `mode`); `tableNames[]` scopes the operation.
    linkMode: params.mode === "create-or-relink" ? "create-or-relink" : undefined,
    tableNames: stringArrayValue(params.tableNames),
    strictLocal: params.strictLocal === true ? true : undefined,
    removeUnresolved: params.removeUnresolved === true ? true : undefined,
    noBackup: params.backup === false ? true : undefined,
    recursive: typeof params.recursive === "boolean" ? params.recursive : undefined,
    backendPassword:
      getStr(params, "backendPassword", ["password"]) ??
      (params.passwordEnv ? env(getStr(params, "passwordEnv") ?? "") : undefined),
    ...targetForAction(action, pickOverrides(params)),
  };
}
