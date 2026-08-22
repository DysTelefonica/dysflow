import type { DysflowConfig } from "../config/dysflow-config.js";
import type { AccessQueryRequest, DysflowError, OperationResult } from "../contracts/index.js";
import { createDysflowError, failureResult } from "../contracts/index.js";
import { isFrontendOnlyAction } from "../mapping/access-query-request-mapper.js";
import {
  type CrossDbTableRunner,
  lookupTableAcrossDatabases,
} from "../runtime/cross-db-table-lookup.js";
import { isRecord } from "../utils/index.js";
import { parseSimpleSelectShape } from "../utils/simple-select-shape.js";
import type { AccessRunnerOperation } from "./access-runner-operation.js";

/**
 * Issue #1491 — query pre-flight, lifted out of `runLockedOperation`.
 *
 * That method was 601 lines, and roughly 430 of them sat inside
 * `if (operation.kind === "query")` guards: resolving frontend/backend target
 * precedence, disambiguating a table across databases, and validating a
 * `query_sql` shape against the live schema. None of that is locking or
 * running. Every non-query operation paid to skip it, and the branches most
 * likely to change were the ones hardest to reach in a test, because reaching
 * them meant building a whole locked-operation context first.
 *
 * This is a behaviour-preserving move: every failure code, message and details
 * payload is identical to what `runLockedOperation` returned. The two
 * collaborators the block needs are injected rather than reached for through
 * `this`, which is what makes the branches directly testable.
 */
export type QueryPreflightDeps = {
  runProbe: <TData = unknown>(
    request: AccessQueryRequest,
    config: DysflowConfig,
  ) => Promise<OperationResult<TData>>;
  fileExists: (path: string) => boolean;
  crossDbRunner: CrossDbTableRunner;
};

export type QueryPreflightResolution =
  | { outcome: "failure"; failure: OperationResult<never> }
  | {
      outcome: "resolved";
      operation: AccessRunnerOperation;
      compactRepairTarget: "frontend" | "backend" | undefined;
    };

/**
 * Same arity as `failureResult`, so the lifted `return failureResult(...)`
 * sites keep their exact argument expressions and stay diff-comparable against
 * the original method.
 */
function failedPreflight(error: DysflowError): QueryPreflightResolution {
  return { outcome: "failure", failure: failureResult(error) };
}

export async function resolveQueryPreflight(
  operation: AccessRunnerOperation,
  config: DysflowConfig,
  deps: QueryPreflightDeps,
  resolveCompactRepairTarget: (
    request: AccessQueryRequest,
    config: DysflowConfig,
  ) => "frontend" | "backend" | undefined,
): Promise<QueryPreflightResolution> {
  let finalOperation = operation;
  let compactRepairTarget: "frontend" | "backend" | undefined =
    operation.kind === "query" && operation.request.action === "compact_repair"
      ? resolveCompactRepairTarget(operation.request, config)
      : undefined;
  if (operation.kind === "query") {
    if (
      operation.request.action === "compact_repair" &&
      operation.request.target === undefined &&
      operation.request.databasePath === undefined &&
      operation.request.backendPath === undefined
    ) {
      if (config.accessDbPath && config.backendPath) {
        return failedPreflight(
          createDysflowError(
            "CONFIG_TARGET_AMBIGUOUS",
            "compact_repair cannot choose between the configured frontend and backend databases.",
            {
              details: { targets: ["frontend", "backend"] },
              remediation:
                "Pass target:'frontend' or target:'backend' explicitly before retrying compact_repair.",
            },
          ),
        );
      }
      compactRepairTarget = config.backendPath
        ? "backend"
        : config.accessDbPath
          ? "frontend"
          : undefined;
    }
    // #870 — linked-table and saved-query operations act on the frontend
    // database even when backendPath is also present as auxiliary input.
    // Resolve their forced semantic role before the generic target logic,
    // whose normal explicit-backendPath precedence is correct for general reads.
    if (operation.request.target === "frontend" && isFrontendOnlyAction(operation.request.action)) {
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
        return failedPreflight(
          createDysflowError(
            "CONFIG_MISSING_TARGET_PATH",
            "Cannot resolve target='auto': the request requires a tableName so the cross-DB lookup can decide which configured database contains the table. Pass tableName in the request, or pass an explicit target ('frontend' | 'backend') or databasePath.",
          ),
        );
      }
      const runner = deps.crossDbRunner;
      const lookup = await lookupTableAcrossDatabases(config, operation.request.tableName, runner);
      if (!lookup.ok) {
        if (lookup.error === "ACCESS_TABLE_AMBIGUOUS") {
          return failedPreflight(
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
        return failedPreflight(
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
        return failedPreflight(
          createDysflowError(
            "CONFIG_MISSING_TARGET_PATH",
            "Cannot resolve frontend target: project config does not declare accessPath. Pass databasePath explicitly or set accessPath in .dysflow/project.json.",
          ),
        );
      } else if (finalOperation.request.target === "backend") {
        return failedPreflight(
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
      const runner = deps.crossDbRunner;
      const lookup = await lookupTableAcrossDatabases(
        config,
        finalOperation.request.tableName,
        runner,
      );
      if (!lookup.ok) {
        if (lookup.error === "ACCESS_TABLE_AMBIGUOUS") {
          return failedPreflight(
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
        return failedPreflight(
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
        const tablesResult = await deps.runProbe(
          {
            action: "list_tables",
            mode: "read",
            sql: "",
            databasePath: resolvedAccessPath,
          },
          config,
        );
        const linkedTablesResult = await deps.runProbe(
          {
            action: "list_linked_tables",
            mode: "read",
            sql: "",
            databasePath: resolvedAccessPath,
          },
          config,
        );
        const localTables =
          tablesResult.ok && isRecord(tablesResult.data) && Array.isArray(tablesResult.data.tables)
            ? tablesResult.data.tables.filter((table): table is string => typeof table === "string")
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
          return failedPreflight(
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
          const schemaResult = await deps.runProbe(
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
              return failedPreflight(
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
        return failedPreflight(
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
        if (!deps.fileExists(config.accessDbPath)) {
          return failedPreflight(
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
  return { outcome: "resolved", operation: finalOperation, compactRepairTarget };
}
