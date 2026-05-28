import type {
  AccessQueryRequest,
  AccessVbaRequest,
  LegacyVbaSyncPort,
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
import { getLegacyParityToolDefinition } from "./legacy-parity-registry.js";
import {
  LEGACY_DYSFLOW_MCP_TOOL_NAMES,
  LEGACY_VBA_SYNC_TOOL_NAMES,
  type LegacyDysflowMcpToolName,
} from "./legacy-tool-inventory.js";
import {
  CLEANUP_SCHEMA,
  DOCTOR_SCHEMA,
  type JsonObjectSchema,
  LEGACY_TOOL_SCHEMAS,
  NO_INPUT_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
  VBA_EXECUTE_SCHEMA,
} from "./schemas.js";
import type { McpToolContext } from "./types.js";
import { validateInput } from "./validator.js";

export { type JsonObjectSchema, LEGACY_TOOL_SCHEMAS } from "./schemas.js";

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
   * Used for stub tools that always return LEGACY_TOOL_NOT_IMPLEMENTED.
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
  /** Injected adapter for legacy VBA sync tool dispatch. See LegacyVbaSyncPort in core/contracts. */
  legacyToolService?: LegacyVbaSyncPort;
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

async function _handleValidatedLegacyQuery<TData>(
  input: unknown,
  schema: JsonObjectSchema,
  execute: () => Promise<OperationResult<TData>>,
): Promise<McpToolResult> {
  const validation = validateInput(input, schema);
  if (validation !== undefined) return invalidInput(validation);
  return translateCoreResultToMcpContent(await execute());
}

async function handleValidatedLegacyWrite<TData>(
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

  return appendLegacyCompatibilityTools(
    currentTools,
    services,
    writesEnabled,
    writeAccessResolver,
    env,
  );
}

function appendLegacyCompatibilityTools(
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
  const cleanupSchema = legacySchemaFor("cleanup_access_operation");

  add({
    name: "list_access_operations",
    description: "Legacy-compatible alias for listing Dysflow Access operations.",
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
    description: "Legacy-compatible alias for safe Access operation cleanup.",
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
  const runVbaSchema = legacySchemaFor("run_vba");
  add({
    name: "run_vba",
    description: "Legacy-compatible alias for executing a public VBA procedure.",
    inputSchema: runVbaSchema,
    handler: async (input) => {
      const validation = validateInput(input, runVbaSchema);
      if (validation !== undefined) return invalidInput(validation);
      const request = input as { procedureName: string; argsJson?: string };
      const parsedArgs = parseLegacyArgsJson(request.argsJson);
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
  const querySqlSchema = legacySchemaFor("query_sql");
  const execSqlSchema = legacySchemaFor("exec_sql");
  add({
    name: "query_sql",
    description: "Legacy-compatible alias for read-only Access SQL queries.",
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
    description: "Legacy-compatible alias for executing guarded Access SQL writes.",
    inputSchema: execSqlSchema,
    handler: async (input) =>
      handleValidatedLegacyWrite(input, execSqlSchema, writesEnabled, writeAccessResolver, () =>
        services.queryService.execute(toLegacyWriteFixtureRequest("exec_sql", input)),
      ),
  });
  const runScriptSchema = legacySchemaFor("run_script");
  add({
    name: "run_script",
    description: "Legacy-compatible alias for executing a guarded Access script.",
    inputSchema: runScriptSchema,
    handler: async (input) =>
      handleValidatedLegacyWrite(input, runScriptSchema, writesEnabled, writeAccessResolver, () =>
        services.queryService.execute(toLegacyWriteFixtureRequest("run_script", input)),
      ),
  });
  const createTableSchema = legacySchemaFor("create_table");
  add({
    name: "create_table",
    description: "Legacy-compatible alias for creating a table through guarded Access writes.",
    inputSchema: createTableSchema,
    handler: async (input) =>
      handleValidatedLegacyWrite(input, createTableSchema, writesEnabled, writeAccessResolver, () =>
        services.queryService.execute(toLegacyWriteFixtureRequest("create_table", input)),
      ),
  });
  const dropTableSchema = legacySchemaFor("drop_table");
  add({
    name: "drop_table",
    description: "Legacy-compatible alias for dropping a table through guarded Access writes.",
    inputSchema: dropTableSchema,
    handler: async (input) =>
      handleValidatedLegacyWrite(input, dropTableSchema, writesEnabled, writeAccessResolver, () =>
        services.queryService.execute(toLegacyWriteFixtureRequest("drop_table", input)),
      ),
  });
  const seedFixtureSchema = legacySchemaFor("seed_fixture");
  add({
    name: "seed_fixture",
    description: "Legacy-compatible alias for seeding fixtures through guarded Access writes.",
    inputSchema: seedFixtureSchema,
    handler: async (input) =>
      handleValidatedLegacyWrite(input, seedFixtureSchema, writesEnabled, writeAccessResolver, () =>
        services.queryService.execute(toLegacyWriteFixtureRequest("seed_fixture", input)),
      ),
  });
  const teardownFixtureSchema = legacySchemaFor("teardown_fixture");
  add({
    name: "teardown_fixture",
    description: "Legacy-compatible alias for tearing down fixtures through guarded Access writes.",
    inputSchema: teardownFixtureSchema,
    handler: async (input) =>
      handleValidatedLegacyWrite(
        input,
        teardownFixtureSchema,
        writesEnabled,
        writeAccessResolver,
        () => services.queryService.execute(toLegacyWriteFixtureRequest("teardown_fixture", input)),
      ),
  });

  for (const legacyName of LEGACY_DYSFLOW_MCP_TOOL_NAMES) {
    add(createLegacyDispatchTool(legacyName, services, writesEnabled, writeAccessResolver, env));
  }

  return tools;
}

/**
 * Tools that always return LEGACY_TOOL_NOT_IMPLEMENTED.
 * They are hidden from tools/list to avoid advertising unworkable operations,
 * but remain registered so direct calls return a clear error rather than a routing failure.
 * Exported for contract testing.
 */
export const HIDDEN_STUB_TOOL_NAMES = new Set<LegacyDysflowMcpToolName>([
  "verify_binary",
  "reconcile_binary",
]);

function legacySchemaFor(name: keyof typeof LEGACY_TOOL_SCHEMAS): JsonObjectSchema {
  const schema = LEGACY_TOOL_SCHEMAS[name];
  if (schema === undefined) {
    throw new Error(`Missing legacy tool schema: ${String(name)}`);
  }
  return schema;
}

function createLegacyDispatchTool(
  name: LegacyDysflowMcpToolName,
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  env: Record<string, string | undefined>,
): DysflowMcpTool {
  const definition = getLegacyParityToolDefinition(name);
  // LEGACY_TOOL_SCHEMAS is the sole source of truth for all legacy tool schemas (#200).
  const schema = legacySchemaFor(name);
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
        !isDryRun &&
        (isWriteFixtureSliceTool(name) ||
          getLegacyParityToolDefinition(name).queryMode === "write") &&
        !(await isWriteAllowed(input, writesEnabled, writeAccessResolver))
      ) {
        return writesDisabled();
      }
      if (isVbaSyncSliceTool(name) && services.legacyToolService !== undefined) {
        return translateCoreResultToMcpContent(
          await services.legacyToolService.execute(name, input),
        );
      }
      if (isVbaSyncSliceTool(name)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `MCP_SERVICE_UNAVAILABLE: ${name} requires the legacy VBA sync service to be configured.`,
            },
          ],
        };
      }
      if (isQueryMaintenanceSliceTool(name)) {
        return translateCoreResultToMcpContent(
          await services.queryService.execute(toLegacyMaintenanceRequest(name, input, env)),
        );
      }
      if (isQuerySliceTool(name)) {
        return translateCoreResultToMcpContent(
          await services.queryService.execute(toLegacyQueryRequest(name, input)),
        );
      }
      if (isWriteFixtureSliceTool(name)) {
        return translateCoreResultToMcpContent(
          await services.queryService.execute(toLegacyWriteFixtureRequest(name, input)),
        );
      }
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `LEGACY_TOOL_NOT_IMPLEMENTED: ${name} is tracked for legacy parity but not ported in this slice.`,
          },
        ],
      };
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

function isVbaSyncSliceTool(name: LegacyDysflowMcpToolName): boolean {
  return (LEGACY_VBA_SYNC_TOOL_NAMES as readonly string[]).includes(name);
}

function isQuerySliceTool(name: LegacyDysflowMcpToolName): boolean {
  return (LEGACY_QUERY_SLICE_TOOL_NAMES as readonly string[]).includes(name);
}

function isQueryMaintenanceSliceTool(name: LegacyDysflowMcpToolName): boolean {
  return getLegacyParityToolDefinition(name).queryMode !== undefined;
}

function isWriteFixtureSliceTool(name: LegacyDysflowMcpToolName): boolean {
  return (LEGACY_WRITE_FIXTURE_SLICE_TOOL_NAMES as readonly string[]).includes(name);
}

type LegacyArgsJsonParseResult = { ok: true; value: unknown[] } | { ok: false; message: string };

function parseLegacyArgsJson(argsJson: string | undefined): LegacyArgsJsonParseResult {
  if (argsJson === undefined || argsJson.trim().length === 0) return { ok: true, value: [] };
  try {
    const parsed = JSON.parse(argsJson) as unknown;
    return { ok: true, value: Array.isArray(parsed) ? parsed : [parsed] };
  } catch {
    return { ok: false, message: "argsJson must be valid JSON." };
  }
}

function toLegacyQueryRequest(name: LegacyDysflowMcpToolName, input: unknown): AccessQueryRequest {
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

function toLegacyWriteFixtureRequest(
  name: LegacyDysflowMcpToolName,
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

function toLegacyMaintenanceRequest(
  name: LegacyDysflowMcpToolName,
  input: unknown,
  env: Record<string, string | undefined>,
): AccessQueryRequest {
  const params = isRecord(input) ? input : {};
  const queryMode = getLegacyParityToolDefinition(name).queryMode ?? "write";
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

const LEGACY_QUERY_SLICE_TOOL_NAMES = [
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
  "export_queries",
  "link_tables",
  "relink_tables",
  "localize_backend_links",
  "unlink_table",
  "import_queries",
  "compact_repair",
] as const;

const LEGACY_WRITE_FIXTURE_SLICE_TOOL_NAMES = [
  "exec_sql",
  "run_script",
  "create_table",
  "drop_table",
  "seed_fixture",
  "teardown_fixture",
] as const;
