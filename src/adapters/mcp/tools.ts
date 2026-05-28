import type {
  AccessQueryRequest,
  AccessVbaRequest,
  VbaSyncPort,
  OperationResult,
} from "../../core/contracts/index.js";
import { successResult } from "../../core/contracts/index.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import type {
  AccessOperationRecord,
  AccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import { getDefaultAccessOperationRegistry } from "../../core/runner/access-runner.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";
import { isRecord, stringValue } from "../../core/utils/index.js";
import { getToolDefinition } from "./tool-parity-registry.js";
import {
  DYSFLOW_MCP_TOOL_NAMES,
  type DysflowMcpToolName,
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

const WRITE_SQL_PATTERN =
  /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|EXEC(?:UTE)?|GRANT|REVOKE)\b/i;

export function rejectWriteSqlInReadMode(sql: string): string | undefined {
  if (!WRITE_SQL_PATTERN.test(sql)) return undefined;
  const keyword = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
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
        const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
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
  );
}

function registerMcpTools(
  currentTools: DysflowMcpTool[],
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  env: Record<string, string | undefined>,
): DysflowMcpTool[] {
  const tools = [...currentTools];
  const names = new Set(tools.map((tool) => tool.name));
  const add = (tool: DysflowMcpTool): void => {
    if (!names.has(tool.name)) {
      names.add(tool.name);
      tools.push(tool);
    }
  };
  const cleanupSchema = mcpSchemaFor("cleanup_access_operation");

  add({
    name: "list_access_operations",
    description: "Alias for listing Dysflow Access operations.",
    inputSchema: NO_INPUT_SCHEMA,
    handler: async () => {
      const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
      return translateCoreResultToMcpContent(
        successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })),
      );
    },
  });
  add({
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
  });
  const runVbaSchema = mcpSchemaFor("run_vba");
  add({
    name: "run_vba",
    description: "Alias for executing a public VBA procedure.",
    inputSchema: runVbaSchema,
    handler: async (input) => {
      const validation = validateInput(input, runVbaSchema);
      if (validation !== undefined) return invalidInput(validation);
      const request = input as { procedureName: string; argsJson?: string };
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
  });
  const querySqlSchema = mcpSchemaFor("query_sql");
  const execSqlSchema = mcpSchemaFor("exec_sql");
  add({
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
  });
  add({
    name: "exec_sql",
    description: "Alias for executing guarded Access SQL writes.",
    inputSchema: execSqlSchema,
    handler: async (input) =>
      handleValidatedMcpWrite(input, execSqlSchema, writesEnabled, writeAccessResolver, () =>
        services.queryService.execute(toWriteFixtureRequest("exec_sql", input)),
      ),
  });
  const runScriptSchema = mcpSchemaFor("run_script");
  add({
    name: "run_script",
    description: "Alias for executing a guarded Access script.",
    inputSchema: runScriptSchema,
    handler: async (input) =>
      handleValidatedMcpWrite(input, runScriptSchema, writesEnabled, writeAccessResolver, () =>
        services.queryService.execute(toWriteFixtureRequest("run_script", input)),
      ),
  });
  const createTableSchema = mcpSchemaFor("create_table");
  add({
    name: "create_table",
    description: "Alias for creating a table through guarded Access writes.",
    inputSchema: createTableSchema,
    handler: async (input) =>
      handleValidatedMcpWrite(input, createTableSchema, writesEnabled, writeAccessResolver, () =>
        services.queryService.execute(toWriteFixtureRequest("create_table", input)),
      ),
  });
  const dropTableSchema = mcpSchemaFor("drop_table");
  add({
    name: "drop_table",
    description: "Alias for dropping a table through guarded Access writes.",
    inputSchema: dropTableSchema,
    handler: async (input) =>
      handleValidatedMcpWrite(input, dropTableSchema, writesEnabled, writeAccessResolver, () =>
        services.queryService.execute(toWriteFixtureRequest("drop_table", input)),
      ),
  });
  const seedFixtureSchema = mcpSchemaFor("seed_fixture");
  add({
    name: "seed_fixture",
    description: "Alias for seeding fixtures through guarded Access writes.",
    inputSchema: seedFixtureSchema,
    handler: async (input) =>
      handleValidatedMcpWrite(input, seedFixtureSchema, writesEnabled, writeAccessResolver, () =>
        services.queryService.execute(toWriteFixtureRequest("seed_fixture", input)),
      ),
  });
  const teardownFixtureSchema = mcpSchemaFor("teardown_fixture");
  add({
    name: "teardown_fixture",
    description: "Alias for tearing down fixtures through guarded Access writes.",
    inputSchema: teardownFixtureSchema,
    handler: async (input) =>
      handleValidatedMcpWrite(
        input,
        teardownFixtureSchema,
        writesEnabled,
        writeAccessResolver,
        () => services.queryService.execute(toWriteFixtureRequest("teardown_fixture", input)),
      ),
  });

  for (const toolName of DYSFLOW_MCP_TOOL_NAMES) {
    add(createDispatchTool(toolName, services, writesEnabled, writeAccessResolver, env));
  }

  return tools;
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
  list_access_operations:   { kind: "vba-sync" },
  cleanup_access_operation: { kind: "vba-sync" },
  export_modules:           { kind: "vba-sync" },
  export_all:               { kind: "vba-sync" },
  import_modules:           { kind: "vba-sync" },
  import_all:               { kind: "vba-sync" },
  list_objects:             { kind: "vba-sync" },
  exists:                   { kind: "vba-sync" },
  run_vba:                  { kind: "vba-sync" },
  test_vba:                 { kind: "vba-sync" },
  compile_vba:              { kind: "vba-sync" },
  verify_code:              { kind: "vba-sync" },
  verify_binary:            { kind: "vba-sync" },
  reconcile_binary:         { kind: "vba-sync" },
  delete_module:            { kind: "vba-sync" },
  generate_erd:             { kind: "vba-sync" },
  fix_encoding:             { kind: "vba-sync" },
  validate_form_spec:       { kind: "vba-sync" },
  generate_form:            { kind: "vba-sync" },
  catalog_add_control:      { kind: "vba-sync" },
  harvest_form_catalog:     { kind: "vba-sync" },
  // query maintenance (9)
  list_links:               { kind: "query-maintenance", queryMode: "read" },
  export_queries:           { kind: "query-maintenance", queryMode: "read" },
  link_tables:              { kind: "query-maintenance", queryMode: "write" },
  relink_tables:            { kind: "query-maintenance", queryMode: "write" },
  localize_backend_links:   { kind: "query-maintenance", queryMode: "write" },
  unlink_table:             { kind: "query-maintenance", queryMode: "write" },
  import_queries:           { kind: "query-maintenance", queryMode: "write" },
  compact_repair:           { kind: "query-maintenance", queryMode: "write" },
  relink_directory:         { kind: "query-maintenance", queryMode: "write" },
  // query read (9)
  query_sql:                { kind: "query-read" },
  list_tables:              { kind: "query-read" },
  list_linked_tables:       { kind: "query-read" },
  get_schema:               { kind: "query-read" },
  count_rows:               { kind: "query-read" },
  distinct_values:          { kind: "query-read" },
  compare_backends:         { kind: "query-read" },
  list_access_files:        { kind: "query-read" },
  get_relationships:        { kind: "query-read" },
  // write fixture (6)
  exec_sql:                 { kind: "query-write-fixture" },
  run_script:               { kind: "query-write-fixture" },
  create_table:             { kind: "query-write-fixture" },
  drop_table:               { kind: "query-write-fixture" },
  seed_fixture:             { kind: "query-write-fixture" },
  teardown_fixture:         { kind: "query-write-fixture" },
};

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
      if (isWriteGated && !isDryRun && !(await isWriteAllowed(input, writesEnabled, writeAccessResolver))) {
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
            content: [{ type: "text", text: `MCP_SERVICE_UNAVAILABLE: ${name} requires the VBA sync service to be configured.` }],
          };
        case "query-maintenance":
          return translateCoreResultToMcpContent(
            await services.queryService.execute(toMaintenanceRequest(name, input, env)),
          );
        case "query-read":
          return translateCoreResultToMcpContent(
            await services.queryService.execute(toQueryRequest(name, input)),
          );
        case "query-write-fixture":
          return translateCoreResultToMcpContent(
            await services.queryService.execute(toWriteFixtureRequest(name, input)),
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

function resolveIsDryRun(input: unknown): boolean {
  if (!isRecord(input)) return true;
  if (input.apply === true) return false;
  if (input.dryRun === false) return false;
  return true;
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

function toQueryRequest(name: DysflowMcpToolName, input: unknown): AccessQueryRequest {
  const params = isRecord(input) ? input : {};
  const tableName = stringValue(params.tableName) ?? stringValue(params.table);
  const columnName = stringValue(params.columnName) ?? stringValue(params.column);
  return {
    action: name as AccessQueryRequest["action"],
    mode: "read",
    sql: stringValue(params.sql) ?? stringValue(params.query) ?? "",
    tableName,
    columnName,
    backendPath: stringValue(params.backendPath) ?? stringValue(params.comparePath),
    databasePath: stringValue(params.databasePath) ?? stringValue(params.sourcePath),
    rootPath: stringValue(params.rootPath) ?? stringValue(params.directory),
    exportPath: stringValue(params.exportPath) ?? stringValue(params.path),
    importPath: stringValue(params.importPath) ?? stringValue(params.path),
    queryDefinitions:
      queryDefinitionsValue(params.queryDefinitions) ?? queryDefinitionsValue(params.queries),
  };
}

function toWriteFixtureRequest(
  name: DysflowMcpToolName,
  input: unknown,
): AccessQueryRequest {
  const params = isRecord(input) ? input : {};
  const tableName = stringValue(params.tableName) ?? stringValue(params.table);
  return {
    action: name as AccessQueryRequest["action"],
    mode: "write",
    sql: stringValue(params.sql) ?? stringValue(params.query) ?? "",
    tableName,
    columnName: stringValue(params.columnName) ?? stringValue(params.column),
    backendPath: stringValue(params.backendPath) ?? stringValue(params.comparePath),
    databasePath: stringValue(params.databasePath) ?? stringValue(params.sourcePath),
    rootPath: stringValue(params.rootPath) ?? stringValue(params.directory),
    scriptPath: stringValue(params.scriptPath) ?? stringValue(params.path),
    definition: stringValue(params.definition) ?? stringValue(params.fields),
    rows: rowsValue(params.rows),
    dryRun: resolveIsDryRun(input),
    allowTables: stringArrayValue(params.allowTables) ?? singleStringArrayValue(params.allowTable),
    denyTables: stringArrayValue(params.denyTables) ?? singleStringArrayValue(params.denyTable),
  };
}

function toMaintenanceRequest(
  name: DysflowMcpToolName,
  input: unknown,
  env: Record<string, string | undefined>,
): AccessQueryRequest {
  const params = isRecord(input) ? input : {};
  const queryMode = getToolDefinition(name).queryMode ?? "write";
  return {
    action: name as AccessQueryRequest["action"],
    mode: queryMode,
    sql: stringValue(params.sql) ?? stringValue(params.query) ?? "",
    tableName: stringValue(params.tableName) ?? stringValue(params.table),
    columnName: stringValue(params.columnName) ?? stringValue(params.column),
    backendPath: stringValue(params.backendPath) ?? stringValue(params.comparePath),
    rootPath: stringValue(params.rootPath) ?? stringValue(params.directory),
    databasePath: stringValue(params.databasePath) ?? stringValue(params.sourcePath),
    exportPath: stringValue(params.exportPath) ?? stringValue(params.path),
    importPath: stringValue(params.importPath) ?? stringValue(params.path),
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
      stringValue(params.backendPassword) ??
      stringValue(params.password) ??
      (params.passwordEnv ? env[stringValue(params.passwordEnv) ?? ""] : undefined),
  };
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

export function translateCoreResultToMcpContent<TData>(
  result: OperationResult<TData>,
): McpToolResult {
  if (!result.ok) {
    return {
      content: [
        {
          type: "text",
          text: `${result.error.code}: ${sanitizeMcpErrorMessage(result.error.message)}`,
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

export function sanitizeMcpErrorMessage(message: string): string {
  // Each alternative is applied sequentially to avoid nested unbounded quantifiers
  // in a single combined pattern (defense against catastrophic backtracking).
  // UNC paths: \\server\share[\subdir...][\ ]
  let result = message.replace(
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

