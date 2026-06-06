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
  return typeof action === "string" && (VALID_ACCESS_QUERY_ACTIONS as readonly string[]).includes(action);
}

function paramsOf(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
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
    databasePath: getStr(params, "databasePath", ["sourcePath"]),
    exportPath: getStr(params, "exportPath", ["path"]),
    importPath: getStr(params, "importPath", ["path"]),
    queryDefinitions:
      queryDefinitionsValue(params.queryDefinitions) ?? queryDefinitionsValue(params.queries),
    dryRun: resolveIsDryRun(input),
    maps: Array.isArray(params.maps)
      ? params.maps.filter(
          (m): m is { from: string; to: string } =>
            isRecord(m) && typeof m.from === "string" && typeof m.to === "string",
        )
      : undefined,
    denyPrefixes: stringArrayValue(params.denyPrefixes),
    strictLocal: params.strictLocal === true ? true : undefined,
    removeUnresolved: params.removeUnresolved === true ? true : undefined,
    noBackup: params.backup === false ? true : undefined,
    recursive: typeof params.recursive === "boolean" ? params.recursive : undefined,
    timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
    backendPassword:
      getStr(params, "backendPassword", ["password"]) ??
      (params.passwordEnv ? env(getStr(params, "passwordEnv") ?? "") : undefined),
  };
}
