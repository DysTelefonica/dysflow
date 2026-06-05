import type {
  AccessQueryRequest,
  AccessVbaRequest,
  OperationResult,
  VbaSyncPort,
} from "../../core/contracts/index.js";
import { successResult } from "../../core/contracts/index.js";
import {
  type AccessQueryAction,
  buildMaintenanceRequest,
  buildQueryReadRequest,
  buildWriteFixtureRequest,
  resolveIsDryRun,
} from "../../core/mapping/access-query-request-mapper.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import {
  type AccessOperationRecord,
  type AccessOperationRegistry,
  InMemoryAccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";
import {
  looksLikeReadOnlySql,
  sanitizeConnectStrings,
  sanitizeSecrets,
} from "../../core/utils/index.js";
import {
  DYSFLOW_MCP_TOOL_NAMES,
  type DysflowMcpToolName,
  QUERY_TOOL_NAMES,
  type QueryToolName,
} from "./mcp-tool-registry.js";
import {
  CLEANUP_SCHEMA,
  DOCTOR_SCHEMA,
  type JsonObjectSchema,
  MCP_TOOL_SCHEMAS,
  NO_INPUT_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
  VBA_EXECUTE_SCHEMA,
} from "./schemas.js";
import { getToolDefinition } from "./tool-parity-registry.js";
import type { McpToolContext } from "./types.js";
import { validateInput } from "./validator.js";

export { type JsonObjectSchema, MCP_TOOL_SCHEMAS } from "./schemas.js";

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: readonly McpTextContent[];
  isError: boolean;
};

export type DysflowMcpTool = {
  name: string;
  description: string;
  inputSchema?: JsonObjectSchema;
  /**
   * When true, this tool is excluded from the tools/list MCP projection.
   * The handler remains callable via tools/call for backwards compatibility.
   * Used for stub tools that always return TOOL_NOT_IMPLEMENTED.
   */
  hidden?: boolean;
  handler(input: unknown, context?: McpToolContext): Promise<McpToolResult>;
};

export type DysflowMcpServices = {
  vbaService: {
    execute(
      request: AccessVbaRequest,
      onProgress?: (percent: number, total?: number, message?: string) => void,
    ): Promise<OperationResult<AccessVbaResult>>;
  };
  queryService: {
    execute(
      request: AccessQueryRequest,
      onProgress?: (percent: number, total?: number, message?: string) => void,
    ): Promise<OperationResult<AccessQueryResult>>;
  };
  diagnosticsService: {
    run(request?: AccessDiagnosticsRequest): Promise<OperationResult<AccessDiagnosticsResult>>;
  };
  /** Optional registry override. When omitted, MCP operation-list tools intentionally use Dysflow's default process-local registry. */
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: {
    cleanup(request: {
      operationId: string;
      accessPath: string;
      force?: boolean;
    }): Promise<OperationResult<AccessCleanupResult>>;
  };
  /** Injected adapter for VBA sync tool dispatch. See VbaSyncPort in core/contracts. */
  vbaSyncToolService?: VbaSyncPort;
};

export type McpWriteAccessResolver = (input: unknown) => Promise<boolean>;

function writesDisabled(): McpToolResult {
  return {
    content: [
      { type: "text", text: "MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter." },
    ],
    isError: true,
  };
}

function invalidInput(message: string): McpToolResult {
  return { content: [{ type: "text", text: `MCP_INPUT_INVALID: ${message}` }], isError: true };
}

export function rejectWriteSqlInReadMode(sql: string): string | undefined {
  if (looksLikeReadOnlySql(sql)) return undefined;
  const match = sql
    .toLowerCase()
    .match(/\b(insert|update|delete|create|drop|alter|truncate|into|exec|execute|grant|revoke)\b/);
  const keyword = match
    ? match[1].toUpperCase()
    : (sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "");
  return `${keyword} statements are not allowed in read-only queries. Use exec_sql or dysflow_query_execute with mode "write" for write operations.`;
}

async function handleValidatedMcpWrite<TData>(
  input: unknown,
  schema: JsonObjectSchema,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  execute: () => Promise<OperationResult<TData>>,
): Promise<McpToolResult> {
  const validation = validateInput(input, schema);
  if (validation !== undefined) return invalidInput(validation);
  const isDryRun = resolveIsDryRun(input);
  if (!isDryRun && !(await isWriteAllowed(input, writesEnabled, writeAccessResolver)))
    return writesDisabled();
  return translateCoreResultToMcpContent(await execute());
}

/**
 * Canonical modern Dysflow MCP tool names.
 * These names use underscore separators and are the authoritative source of truth
 * for the five modern tool identifiers advertised via tools/list.
 * Exported for contract testing and regression guards.
 */
export const MODERN_TOOL_NAMES = [
  "dysflow_vba_execute",
  "dysflow_query_execute",
  "dysflow_doctor",
  "dysflow_access_operations_list",
  "dysflow_access_cleanup",
] as const;

export type ModernDysflowMcpToolName = (typeof MODERN_TOOL_NAMES)[number];

export function createDysflowMcpTools(
  services: DysflowMcpServices,
  writesEnabled = false,
  writeAccessResolver?: McpWriteAccessResolver,
  env: Record<string, string | undefined> = process.env,
  allowedProcedures?: readonly string[],
): DysflowMcpTool[] {
  const currentTools: DysflowMcpTool[] = [
    {
      name: "dysflow_vba_execute",
      description: "Execute a VBA procedure through Dysflow core services.",
      inputSchema: VBA_EXECUTE_SCHEMA,
      handler: async (input, context) => {
        const validation = validateInput(input, VBA_EXECUTE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as AccessVbaRequest;
        if (
          allowedProcedures !== undefined &&
          allowedProcedures.length > 0 &&
          !allowedProcedures.includes(request.procedureName)
        ) {
          return invalidInput(
            `Procedure '${request.procedureName}' is not in the configured allowedProcedures list.`,
          );
        }
        return translateCoreResultToMcpContent(
          await services.vbaService.execute(request, context?.sendProgress),
        );
      },
    },
    {
      name: "dysflow_query_execute",
      description: "Execute a query action through Dysflow core services.",
      inputSchema: QUERY_EXECUTE_SCHEMA,
      handler: async (input, context) => {
        const validation = validateInput(input, QUERY_EXECUTE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as AccessQueryRequest;
        if (request.mode === "read") {
          const sqlGuard = rejectWriteSqlInReadMode(request.sql);
          if (sqlGuard !== undefined) return invalidInput(sqlGuard);
        }
        if (
          request.mode === "write" &&
          !(await isWriteAllowed(request, writesEnabled, writeAccessResolver))
        ) {
          return writesDisabled();
        }
        return translateCoreResultToMcpContent(
          await services.queryService.execute(request, context?.sendProgress),
        );
      },
    },
    {
      name: "dysflow_doctor",
      description: "Run core diagnostic checks through Dysflow services.",
      inputSchema: DOCTOR_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, DOCTOR_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as AccessDiagnosticsRequest;
        return translateCoreResultToMcpContent(await services.diagnosticsService.run(request));
      },
    },
    {
      name: "dysflow_access_operations_list",
      description: "List recent Dysflow Access operation records.",
      inputSchema: NO_INPUT_SCHEMA,
      handler: async () => {
        const registry = services.operationRegistry ?? new InMemoryAccessOperationRegistry();
        return translateCoreResultToMcpContent(
          successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })),
        );
      },
    },
    {
      name: "dysflow_access_cleanup",
      description: "Clean up resources associated with a recent Access operation.",
      inputSchema: CLEANUP_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, CLEANUP_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        if (services.cleanupService === undefined) {
          return {
            content: [
              {
                type: "text",
                text: "CLEANUP_NOT_CONFIGURED: Access cleanup service is not configured.",
              },
            ],
            isError: true,
          };
        }
        return translateCoreResultToMcpContent(
          await services.cleanupService.cleanup(
            input as { operationId: string; accessPath: string; force?: boolean },
          ),
        );
      },
    },
  ];

  return registerMcpTools(
    currentTools,
    services,
    writesEnabled,
    writeAccessResolver,
    env,
    allowedProcedures,
  );
}

/**
 * Pure registration helper: accepts a list of tool entries, detects duplicate names, and
 * returns the final list. Throws on any repeated name. Exported for contract testing (#405).
 */
export function registerMcpToolList(entries: readonly DysflowMcpTool[]): DysflowMcpTool[] {
  const names = new Set<string>();
  const out: DysflowMcpTool[] = [];
  for (const tool of entries) {
    if (names.has(tool.name)) {
      throw new Error(`Duplicate MCP tool registration: ${tool.name}`);
    }
    names.add(tool.name);
    out.push(tool);
  }
  return out;
}

// Names that have a bespoke (alias) handler instead of the generic dispatch handler.
// This is the SINGLE place that says "these names are NOT generated by the dispatch loop" (#405).
const ALIAS_TOOL_NAMES = new Set<DysflowMcpToolName>([
  "list_access_operations",
  "cleanup_access_operation",
  "run_vba",
  "query_sql",
  "exec_sql",
  "run_script",
  "create_table",
  "drop_table",
  "seed_fixture",
  "teardown_fixture",
]);

function buildAliasTools(
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  allowedProcedures: readonly string[] | undefined,
): DysflowMcpTool[] {
  const cleanupSchema = mcpSchemaFor("cleanup_access_operation");
  const runVbaSchema = mcpSchemaFor("run_vba");
  const querySqlSchema = mcpSchemaFor("query_sql");
  const execSqlSchema = mcpSchemaFor("exec_sql");
  const runScriptSchema = mcpSchemaFor("run_script");
  const createTableSchema = mcpSchemaFor("create_table");
  const dropTableSchema = mcpSchemaFor("drop_table");
  const seedFixtureSchema = mcpSchemaFor("seed_fixture");
  const teardownFixtureSchema = mcpSchemaFor("teardown_fixture");

  return [
    {
      name: "list_access_operations",
      description: "Alias for listing Dysflow Access operations.",
      inputSchema: NO_INPUT_SCHEMA,
      handler: async () => {
        const registry = services.operationRegistry ?? new InMemoryAccessOperationRegistry();
        return translateCoreResultToMcpContent(
          successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })),
        );
      },
    },
    {
      name: "cleanup_access_operation",
      description: "Alias for safe Access operation cleanup.",
      inputSchema: cleanupSchema,
      handler: async (input) => {
        const validation = validateInput(input, cleanupSchema);
        if (validation !== undefined) return invalidInput(validation);
        if (services.cleanupService === undefined) {
          return {
            content: [
              {
                type: "text",
                text: "CLEANUP_NOT_CONFIGURED: Access cleanup service is not configured.",
              },
            ],
            isError: true,
          };
        }
        const request = input as { operationId: string; accessPath?: string; force?: boolean };
        return translateCoreResultToMcpContent(
          await services.cleanupService.cleanup({
            operationId: request.operationId,
            accessPath: request.accessPath ?? "",
            force: request.force,
          }),
        );
      },
    },
    {
      name: "run_vba",
      description: "Alias for executing a public VBA procedure.",
      inputSchema: runVbaSchema,
      handler: async (input) => {
        const validation = validateInput(input, runVbaSchema);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as { procedureName: string; argsJson?: string };
        if (
          allowedProcedures !== undefined &&
          allowedProcedures.length > 0 &&
          !allowedProcedures.includes(request.procedureName)
        ) {
          return invalidInput(
            `Procedure '${request.procedureName}' is not in the configured allowedProcedures list.`,
          );
        }
        const parsedArgs = parseMcpArgsJson(request.argsJson);
        if (!parsedArgs.ok) return invalidInput(parsedArgs.message);
        return translateCoreResultToMcpContent(
          await services.vbaService.execute({
            moduleName: "",
            procedureName: request.procedureName,
            arguments: parsedArgs.value,
          }),
        );
      },
    },
    {
      name: "query_sql",
      description: "Alias for read-only Access SQL queries.",
      inputSchema: querySqlSchema,
      handler: async (input) => {
        const validation = validateInput(input, querySqlSchema);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as {
          sql?: string;
          query?: string;
          backendPath?: string;
          databasePath?: string;
          sourcePath?: string;
        };
        const sql = request.sql ?? request.query ?? "";
        const sqlGuard = rejectWriteSqlInReadMode(sql);
        if (sqlGuard !== undefined) return invalidInput(sqlGuard);
        return translateCoreResultToMcpContent(
          await services.queryService.execute({
            sql,
            mode: "read",
            backendPath: request.backendPath,
            databasePath: request.databasePath ?? request.sourcePath,
          }),
        );
      },
    },
    {
      name: "exec_sql",
      description: "Alias for executing guarded Access SQL writes.",
      inputSchema: execSqlSchema,
      handler: async (input) =>
        handleValidatedMcpWrite(input, execSqlSchema, writesEnabled, writeAccessResolver, () =>
          services.queryService.execute(
            buildWriteFixtureRequest(MCP_TOOL_QUERY_ACTIONS.exec_sql, input),
          ),
        ),
    },
    {
      name: "run_script",
      description: "Alias for executing a guarded Access script.",
      inputSchema: runScriptSchema,
      handler: async (input) =>
        handleValidatedMcpWrite(input, runScriptSchema, writesEnabled, writeAccessResolver, () =>
          services.queryService.execute(
            buildWriteFixtureRequest(MCP_TOOL_QUERY_ACTIONS.run_script, input),
          ),
        ),
    },
    {
      name: "create_table",
      description: "Alias for creating a table through guarded Access writes.",
      inputSchema: createTableSchema,
      handler: async (input) =>
        handleValidatedMcpWrite(input, createTableSchema, writesEnabled, writeAccessResolver, () =>
          services.queryService.execute(
            buildWriteFixtureRequest(MCP_TOOL_QUERY_ACTIONS.create_table, input),
          ),
        ),
    },
    {
      name: "drop_table",
      description: "Alias for dropping a table through guarded Access writes.",
      inputSchema: dropTableSchema,
      handler: async (input) =>
        handleValidatedMcpWrite(input, dropTableSchema, writesEnabled, writeAccessResolver, () =>
          services.queryService.execute(
            buildWriteFixtureRequest(MCP_TOOL_QUERY_ACTIONS.drop_table, input),
          ),
        ),
    },
    {
      name: "seed_fixture",
      description: "Alias for seeding fixtures through guarded Access writes.",
      inputSchema: seedFixtureSchema,
      handler: async (input) =>
        handleValidatedMcpWrite(input, seedFixtureSchema, writesEnabled, writeAccessResolver, () =>
          services.queryService.execute(
            buildWriteFixtureRequest(MCP_TOOL_QUERY_ACTIONS.seed_fixture, input),
          ),
        ),
    },
    {
      name: "teardown_fixture",
      description: "Alias for tearing down fixtures through guarded Access writes.",
      inputSchema: teardownFixtureSchema,
      handler: async (input) =>
        handleValidatedMcpWrite(
          input,
          teardownFixtureSchema,
          writesEnabled,
          writeAccessResolver,
          () =>
            services.queryService.execute(
              buildWriteFixtureRequest(MCP_TOOL_QUERY_ACTIONS.teardown_fixture, input),
            ),
        ),
    },
  ];
}

function registerMcpTools(
  currentTools: DysflowMcpTool[],
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  env: Record<string, string | undefined>,
  allowedProcedures?: readonly string[],
): DysflowMcpTool[] {
  const aliasTools = buildAliasTools(
    services,
    writesEnabled,
    writeAccessResolver,
    allowedProcedures,
  );

  // Dispatch loop skips alias names — each DysflowMcpToolName is owned by exactly one path (#405).
  const dispatchTools = DYSFLOW_MCP_TOOL_NAMES.filter((name) => !ALIAS_TOOL_NAMES.has(name)).map(
    (name) => createDispatchTool(name, services, writesEnabled, writeAccessResolver, env),
  );

  return registerMcpToolList([...currentTools, ...aliasTools, ...dispatchTools]);
}

/**
 * Tools that always return TOOL_NOT_IMPLEMENTED.
 * They are hidden from tools/list to avoid advertising unworkable operations,
 * but remain registered so direct calls return a clear error rather than a routing failure.
 * Exported for contract testing.
 */
export const HIDDEN_STUB_TOOL_NAMES = new Set<DysflowMcpToolName>([
  "verify_binary",
  "reconcile_binary",
]);

type McpToolRoute =
  | { kind: "vba-sync" }
  | { kind: "query-read" }
  | { kind: "query-maintenance"; queryMode: "read" | "write" }
  | { kind: "query-write-fixture" };

export const MCP_TOOL_ROUTES: Record<DysflowMcpToolName, McpToolRoute> = {
  // VBA sync (21)
  list_access_operations: { kind: "vba-sync" },
  cleanup_access_operation: { kind: "vba-sync" },
  export_modules: { kind: "vba-sync" },
  export_all: { kind: "vba-sync" },
  import_modules: { kind: "vba-sync" },
  import_all: { kind: "vba-sync" },
  list_objects: { kind: "vba-sync" },
  exists: { kind: "vba-sync" },
  run_vba: { kind: "vba-sync" },
  test_vba: { kind: "vba-sync" },
  compile_vba: { kind: "vba-sync" },
  verify_code: { kind: "vba-sync" },
  verify_binary: { kind: "vba-sync" },
  reconcile_binary: { kind: "vba-sync" },
  delete_module: { kind: "vba-sync" },
  generate_erd: { kind: "vba-sync" },
  fix_encoding: { kind: "vba-sync" },
  validate_form_spec: { kind: "vba-sync" },
  generate_form: { kind: "vba-sync" },
  catalog_add_control: { kind: "vba-sync" },
  harvest_form_catalog: { kind: "vba-sync" },
  // query maintenance (9)
  list_links: { kind: "query-maintenance", queryMode: "read" },
  export_queries: { kind: "query-maintenance", queryMode: "read" },
  link_tables: { kind: "query-maintenance", queryMode: "write" },
  relink_tables: { kind: "query-maintenance", queryMode: "write" },
  localize_backend_links: { kind: "query-maintenance", queryMode: "write" },
  unlink_table: { kind: "query-maintenance", queryMode: "write" },
  import_queries: { kind: "query-maintenance", queryMode: "write" },
  compact_repair: { kind: "query-maintenance", queryMode: "write" },
  relink_directory: { kind: "query-maintenance", queryMode: "write" },
  // query read (9)
  query_sql: { kind: "query-read" },
  list_tables: { kind: "query-read" },
  list_linked_tables: { kind: "query-read" },
  get_schema: { kind: "query-read" },
  count_rows: { kind: "query-read" },
  distinct_values: { kind: "query-read" },
  compare_backends: { kind: "query-read" },
  list_access_files: { kind: "query-read" },
  get_relationships: { kind: "query-read" },
  // write fixture (6)
  exec_sql: { kind: "query-write-fixture" },
  run_script: { kind: "query-write-fixture" },
  create_table: { kind: "query-write-fixture" },
  drop_table: { kind: "query-write-fixture" },
  seed_fixture: { kind: "query-write-fixture" },
  teardown_fixture: { kind: "query-write-fixture" },
};

/**
 * Typed binding of MCP query tool names to their domain `AccessQueryRequest`
 * action. This REPLACES the former `name as AccessQueryRequest["action"]` cast:
 * the `Record<QueryToolName, AccessQueryAction>` type makes a missing entry a
 * COMPILE error (every query tool must be listed) and an out-of-union value a
 * COMPILE error (the action must be a valid `AccessQueryRequest["action"]`).
 *
 * The binding is an identity map (tool name === action) but is written
 * explicitly rather than derived, so the type checker — not a runtime cast —
 * guarantees coverage. The companion test mcp-tool-action-map.test.ts asserts
 * coverage against MCP_TOOL_ROUTES at runtime as a second net.
 */
export const MCP_TOOL_QUERY_ACTIONS: Record<QueryToolName, AccessQueryAction> = Object.fromEntries(
  QUERY_TOOL_NAMES.map((name) => [name, name]),
) as Record<QueryToolName, AccessQueryAction>;

/**
 * Narrows a routed tool name to a {@link QueryToolName} so the typed action map
 * can be indexed without a cast. Query routes (read / maintenance / write
 * fixture) are exactly the QUERY_TOOL_NAMES; this is asserted at runtime by the
 * action-map coverage test.
 */
function queryActionFor(name: DysflowMcpToolName): AccessQueryAction {
  const action = MCP_TOOL_QUERY_ACTIONS[name as QueryToolName];
  if (action === undefined) {
    throw new Error(`No AccessQueryRequest action registered for MCP tool: ${name}`);
  }
  return action;
}

function mcpSchemaFor(name: keyof typeof MCP_TOOL_SCHEMAS): JsonObjectSchema {
  const schema = MCP_TOOL_SCHEMAS[name];
  if (schema === undefined) {
    throw new Error(`Missing MCP tool schema: ${String(name)}`);
  }
  return schema;
}

function createDispatchTool(
  name: DysflowMcpToolName,
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  env: Record<string, string | undefined>,
): DysflowMcpTool {
  const definition = getToolDefinition(name);
  // MCP_TOOL_SCHEMAS is the sole source of truth for all MCP tool schemas (#200).
  const schema = mcpSchemaFor(name);
  const route = MCP_TOOL_ROUTES[name];
  const isWriteGated =
    route.kind === "query-write-fixture" ||
    (route.kind === "query-maintenance" && route.queryMode === "write");

  return {
    name,
    description: definition.description,
    inputSchema: schema,
    hidden: HIDDEN_STUB_TOOL_NAMES.has(name) ? true : undefined,
    handler: async (input) => {
      const validation = validateInput(input, schema);
      if (validation !== undefined) return invalidInput(validation);
      const isDryRun = resolveIsDryRun(input);
      if (
        isWriteGated &&
        !isDryRun &&
        !(await isWriteAllowed(input, writesEnabled, writeAccessResolver))
      ) {
        return writesDisabled();
      }
      switch (route.kind) {
        case "vba-sync":
          if (services.vbaSyncToolService !== undefined) {
            return translateCoreResultToMcpContent(
              await services.vbaSyncToolService.execute(name, input),
            );
          }
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `MCP_SERVICE_UNAVAILABLE: ${name} requires the VBA sync service to be configured.`,
              },
            ],
          };
        case "query-maintenance": {
          const queryMode = getToolDefinition(name).queryMode ?? "write";
          const maintenanceRequest = buildMaintenanceRequest(
            queryActionFor(name),
            queryMode,
            input,
            (key) => env[key],
          );
          return translateCoreResultToMcpContent(
            await services.queryService.execute(maintenanceRequest),
            resolveInScopeSecrets(maintenanceRequest.backendPassword),
          );
        }
        case "query-read":
          return translateCoreResultToMcpContent(
            await services.queryService.execute(buildQueryReadRequest(queryActionFor(name), input)),
          );
        case "query-write-fixture":
          return translateCoreResultToMcpContent(
            await services.queryService.execute(
              buildWriteFixtureRequest(queryActionFor(name), input),
            ),
          );
      }
    },
  };
}

async function isWriteAllowed(
  input: unknown,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
): Promise<boolean> {
  if (writesEnabled) return true;
  if (writeAccessResolver === undefined) return false;
  return await writeAccessResolver(input);
}

type McpArgsJsonParseResult = { ok: true; value: unknown[] } | { ok: false; message: string };

function parseMcpArgsJson(argsJson: string | undefined): McpArgsJsonParseResult {
  if (argsJson === undefined || argsJson.trim().length === 0) return { ok: true, value: [] };
  try {
    const parsed = JSON.parse(argsJson) as unknown;
    return { ok: true, value: Array.isArray(parsed) ? parsed : [parsed] };
  } catch {
    return { ok: false, message: "argsJson must be valid JSON." };
  }
}

/**
 * Builds the explicit secret list for a maintenance error sink, mirroring the
 * HTTP adapter which filters non-empty secret values before sanitizeSecrets.
 * Returns undefined when no secret is in scope so the sink falls back to the
 * heuristic-only path.
 */
function resolveInScopeSecrets(...values: readonly (string | undefined)[]): string[] | undefined {
  const secrets = values.filter((v): v is string => typeof v === "string" && v.length > 0);
  return secrets.length > 0 ? secrets : undefined;
}

export function translateCoreResultToMcpContent<TData>(
  result: OperationResult<TData>,
  secrets?: readonly string[],
): McpToolResult {
  if (!result.ok) {
    return {
      content: [
        {
          type: "text",
          text: `${result.error.code}: ${sanitizeMcpErrorMessage(result.error.message, secrets)}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result.data) }],
    isError: false,
  };
}

export function sanitizeMcpErrorMessage(message: string, secrets?: readonly string[]): string {
  // Secret redaction runs BEFORE path stripping so that:
  // 1. Explicit known secret values (parity with the HTTP adapter, which calls
  //    sanitizeSecrets at its sink) are removed verbatim while still intact.
  // 2. Connect-string passwords (`;PWD=...`) are stripped heuristically even when
  //    the exact value is not known at this sink. This is a defense-in-depth net
  //    applied uniformly at every MCP error boundary (translate + transport wrapper).
  let result = secrets !== undefined ? sanitizeSecrets(message, secrets) : message;
  result = sanitizeConnectStrings(result);
  // Each alternative is applied sequentially to avoid nested unbounded quantifiers
  // in a single combined pattern (defense against catastrophic backtracking).
  // UNC paths: \\server\share[\subdir...][\ ]
  result = result.replace(
    /\\\\[^\\\s"'<>|:*?]+\\[^\\\s"'<>|:*?]+(?:\\[^\\\s"'<>|:*?]+)*\\?/g,
    "[PATH]",
  );
  // Windows paths with database extension: C:\...\file.accdb
  result = result.replace(/[A-Za-z]:\\[^:\r\n]*?\.(?:accdb|mdb|accde|mde|laccdb)\b/gi, "[PATH]");
  // POSIX paths with database extension: /path/to/file.accdb
  result = result.replace(/(?<!\S)\/[^:\r\n]*?\.(?:accdb|mdb|accde|mde|laccdb)\b/gi, "[PATH]");
  // Windows drive root paths: C:\dir/...
  result = result.replace(/[A-Za-z]:\\(?:[^\\\s"'<>|:*?]+(?:\\[^\\\s"'<>|:*?]+)*\\?)?/g, "[PATH]");
  // POSIX directory paths: /dir/subdir/...
  result = result.replace(/(?<!\S)\/(?:[^/\s"'<>:]+\/)*[^/\s"'<>:]+/g, "[PATH]");
  return result;
}
