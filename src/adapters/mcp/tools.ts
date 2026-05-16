import type { AccessQueryRequest, AccessVbaRequest, OperationResult } from "../../core/contracts/index.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import type { AccessOperationRecord, AccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import { getDefaultAccessOperationRegistry } from "../../core/runner/access-runner.js";
import { successResult } from "../../core/contracts/index.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";
import { LEGACY_DYSFLOW_MCP_TOOL_NAMES, LEGACY_VBA_SYNC_TOOL_NAMES, type LegacyDysflowMcpToolName } from "./legacy-tool-inventory.js";

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
  inputSchema?: Record<string, unknown>;
  handler(input: unknown): Promise<McpToolResult>;
};

export type DysflowRuntimeContext = {
  configuredAccessPath?: string;
  resolvedAccessPath?: string;
  backendPath?: string;
  projectRoot?: string;
  destinationRoot?: string;
  sessionAccessPath?: string;
  passwordSource: "env" | "missing";
};

export type DysflowMcpServices = {
  vbaService: {
    execute(request: AccessVbaRequest): Promise<OperationResult<AccessVbaResult>>;
  };
  queryService: {
    execute(request: AccessQueryRequest): Promise<OperationResult<AccessQueryResult>>;
  };
  diagnosticsService: {
    run(request?: AccessDiagnosticsRequest): Promise<OperationResult<AccessDiagnosticsResult>>;
  };
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: { cleanup(request: { operationId: string; accessPath: string; force?: boolean }): Promise<OperationResult<AccessCleanupResult>> };
  legacyToolService?: { execute(toolName: LegacyDysflowMcpToolName, input: unknown): Promise<OperationResult<unknown>> };
  context?: DysflowRuntimeContext;
};

export function createDysflowMcpTools(services: DysflowMcpServices): DysflowMcpTool[] {
  const currentTools: DysflowMcpTool[] = [
    {
      name: "dysflow.vba.execute",
      description: "Execute a VBA procedure through Dysflow core services.",
      handler: async (input) => translateCoreResultToMcpContent(await services.vbaService.execute(input as AccessVbaRequest)),
    },
    {
      name: "dysflow.query.execute",
      description: "Execute an Access SQL query through Dysflow core services.",
      handler: async (input) => translateCoreResultToMcpContent(await services.queryService.execute(input as AccessQueryRequest)),
    },
    {
      name: "dysflow.doctor",
      description: "Run Dysflow diagnostics through core services.",
      handler: async (input) => translateCoreResultToMcpContent(await services.diagnosticsService.run(input as AccessDiagnosticsRequest)),
    },
    {
      name: "dysflow.context",
      description: "Report the active Dysflow Access/VBA context, resolved paths, password source, and cleanup safety without opening Access.",
      inputSchema: objectSchema({}),
      handler: async () => translateCoreResultToMcpContent(successResult(await buildRuntimeContext(services))),
    },
    {
      name: "dysflow.access.operations.list",
      description: "List recent Access operations tracked by Dysflow.",
      handler: async () => {
        const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
        return translateCoreResultToMcpContent(successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })));
      },
    },
    {
      name: "dysflow.access.cleanup",
      description: "Safely cleanup a registered Access operation by operationId and accessPath.",
      inputSchema: objectSchema({
        operationId: { type: "string" },
        accessPath: { type: "string" },
        force: { type: "boolean" },
      }, ["operationId", "accessPath"]),
      handler: async (input) => {
        if (services.cleanupService === undefined) {
          return { content: [{ type: "text", text: "CLEANUP_NOT_CONFIGURED: Access cleanup service is not configured." }], isError: true };
        }
        return translateCoreResultToMcpContent(await services.cleanupService.cleanup(input as { operationId: string; accessPath: string; force?: boolean }));
      },
    },
  ];

  return appendLegacyCompatibilityTools(currentTools, services);
}

function appendLegacyCompatibilityTools(currentTools: DysflowMcpTool[], services: DysflowMcpServices): DysflowMcpTool[] {
  const tools = [...currentTools];
  const names = new Set(tools.map((tool) => tool.name));
  const add = (tool: DysflowMcpTool): void => {
    if (!names.has(tool.name)) {
      names.add(tool.name);
      tools.push(tool);
    }
  };

  add({
    name: "list_access_operations",
    description: "Legacy-compatible alias for listing Dysflow Access operations.",
    handler: async () => {
      const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
      return translateCoreResultToMcpContent(successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })));
    },
  });
  add({
    name: "cleanup_access_operation",
    description: "Legacy-compatible alias for safe Access operation cleanup.",
    inputSchema: objectSchema({
      operationId: { type: "string" },
      accessPath: { type: "string" },
      force: { type: "boolean" },
    }, ["operationId", "accessPath"]),
    handler: async (input) => {
      if (services.cleanupService === undefined) {
        return { content: [{ type: "text", text: "CLEANUP_NOT_CONFIGURED: Access cleanup service is not configured." }], isError: true };
      }
      const request = input as { operationId: string; accessPath?: string; force?: boolean };
      return translateCoreResultToMcpContent(await services.cleanupService.cleanup({ operationId: request.operationId, accessPath: request.accessPath ?? "", force: request.force }));
    },
  });
  add({
    name: "run_vba",
    description: "Legacy-compatible alias for executing a public VBA procedure.",
    inputSchema: vbaToolSchema({ procedureName: { type: "string" }, argsJson: { type: "string" }, reuseInstance: { type: "boolean" } }),
    handler: async (input) => {
      if (services.legacyToolService !== undefined) {
        return translateCoreResultToMcpContent(await services.legacyToolService.execute("run_vba", input));
      }
      const request = input as { procedureName: string; argsJson?: string };
      return translateCoreResultToMcpContent(await services.vbaService.execute({
        moduleName: "",
        procedureName: request.procedureName,
        arguments: parseLegacyArgsJson(request.argsJson),
      }));
    },
  });
  add({
    name: "query_sql",
    description: "Legacy-compatible alias for read-only Access SQL queries.",
    inputSchema: objectSchema({
      sql: { type: "string" },
      query: { type: "string" },
      backendPath: { type: "string" },
      projectRoot: { type: "string" },
    }),
    handler: async (input) => {
      const request = input as { sql?: string; query?: string };
      return translateCoreResultToMcpContent(await services.queryService.execute({ sql: request.sql ?? request.query ?? "", mode: "read" }));
    },
  });

  for (const legacyName of LEGACY_DYSFLOW_MCP_TOOL_NAMES) {
    add(createLegacyDispatchTool(legacyName, services));
  }

  return tools;
}

function createLegacyDispatchTool(name: LegacyDysflowMcpToolName, services: DysflowMcpServices): DysflowMcpTool {
  return {
    name,
    description: `Legacy Dysflow MCP tool ${name}; tracked for parity and implemented by its dedicated slice.`,
    inputSchema: schemaForLegacyTool(name),
    handler: async (input) => {
      if (isVbaSyncSliceTool(name) && services.legacyToolService !== undefined) {
        return translateCoreResultToMcpContent(await services.legacyToolService.execute(name, input));
      }
      if (isQuerySliceTool(name)) {
        return translateCoreResultToMcpContent(await services.queryService.execute(toLegacyQueryRequest(name, input)));
      }
      if (isWriteFixtureSliceTool(name)) {
        return translateCoreResultToMcpContent(await services.queryService.execute(toLegacyWriteFixtureRequest(name, input)));
      }
      return {
        isError: true,
        content: [{ type: "text", text: `LEGACY_TOOL_NOT_IMPLEMENTED: ${name} is tracked for legacy parity but not ported in this slice.` }],
      };
    },
  };
}

function isVbaSyncSliceTool(name: LegacyDysflowMcpToolName): boolean {
  return (LEGACY_VBA_SYNC_TOOL_NAMES as readonly string[]).includes(name);
}

async function buildRuntimeContext(services: DysflowMcpServices): Promise<Record<string, unknown>> {
  const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
  const activeOperations = (await registry.listRecent({ limit: 50 })).map((record) => ({
    operationId: record.operationId,
    accessPath: record.accessPath,
    accessPid: record.accessPid,
    processStartTime: record.processStartTime,
    status: record.status,
    cleanupSafe: isCleanupSafe(record),
  }));
  return {
    configuredAccessPath: services.context?.configuredAccessPath,
    resolvedAccessPath: services.context?.resolvedAccessPath,
    backendPath: services.context?.backendPath,
    projectRoot: services.context?.projectRoot,
    destinationRoot: services.context?.destinationRoot,
    sessionAccessPath: services.context?.sessionAccessPath,
    passwordSource: services.context?.passwordSource ?? "missing",
    activeOperations,
  };
}

function isCleanupSafe(record: AccessOperationRecord): boolean {
  return record.accessPid !== null
    && record.processStartTime !== null
    && ["timed_out", "failed", "cleanup_pending"].includes(record.status);
}

function schemaForLegacyTool(name: LegacyDysflowMcpToolName): Record<string, unknown> | undefined {
  if (["import_modules", "import_all"].includes(name)) {
    return vbaToolSchema({
      moduleNames: { type: "array", items: { type: "string" } },
      importMode: { type: "string", enum: ["Auto", "Form", "Code"] },
    });
  }
  if (name === "test_vba") {
    return vbaToolSchema({
      testsPath: { type: "string" },
      procedureName: { type: "string" },
      compile: { type: "boolean" },
      reuseInstance: { type: "boolean" },
      argsJson: { type: "string" },
    });
  }
  if (["compile_vba", "delete_module", "verify_binary", "reconcile_binary"].includes(name)) {
    return vbaToolSchema({
      moduleNames: { type: "array", items: { type: "string" } },
      compile: { type: "boolean" },
      reuseInstance: { type: "boolean" },
    });
  }
  if (isQuerySliceTool(name) || isWriteFixtureSliceTool(name)) {
    return objectSchema({
      sql: { type: "string" },
      backendPath: { type: "string" },
      projectRoot: { type: "string" },
      tableName: { type: "string" },
      columnName: { type: "string" },
    });
  }
  return undefined;
}

function vbaToolSchema(properties: Record<string, unknown> = {}): Record<string, unknown> {
  return objectSchema({
    accessPath: { type: "string" },
    backendPath: { type: "string" },
    destinationRoot: { type: "string" },
    projectRoot: { type: "string" },
    ...properties,
  }, ["accessPath", "destinationRoot"]);
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: true,
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function isQuerySliceTool(name: LegacyDysflowMcpToolName): boolean {
  return (LEGACY_QUERY_SLICE_TOOL_NAMES as readonly string[]).includes(name);
}

function isWriteFixtureSliceTool(name: LegacyDysflowMcpToolName): boolean {
  return (LEGACY_WRITE_FIXTURE_SLICE_TOOL_NAMES as readonly string[]).includes(name);
}

function toLegacyQueryRequest(name: LegacyDysflowMcpToolName, input: unknown): AccessQueryRequest {
  const params = isRecord(input) ? input : {};
  const tableName = stringValue(params.tableName) ?? stringValue(params.table);
  const columnName = stringValue(params.columnName) ?? stringValue(params.column);
  return {
    action: name as AccessQueryRequest["action"],
    mode: "read",
    sql: stringValue(params.sql) ?? stringValue(params.query),
    tableName,
    columnName,
    backendPath: stringValue(params.backendPath) ?? stringValue(params.comparePath),
    rootPath: stringValue(params.rootPath) ?? stringValue(params.directory),
  };
}

function toLegacyWriteFixtureRequest(name: LegacyDysflowMcpToolName, input: unknown): AccessQueryRequest {
  const params = isRecord(input) ? input : {};
  const tableName = stringValue(params.tableName) ?? stringValue(params.table);
  return {
    action: name as AccessQueryRequest["action"],
    mode: "write",
    sql: stringValue(params.sql) ?? stringValue(params.query),
    tableName,
    columnName: stringValue(params.columnName) ?? stringValue(params.column),
    backendPath: stringValue(params.backendPath) ?? stringValue(params.comparePath),
    rootPath: stringValue(params.rootPath) ?? stringValue(params.directory),
    scriptPath: stringValue(params.scriptPath) ?? stringValue(params.path),
    definition: stringValue(params.definition) ?? stringValue(params.fields),
    rows: rowsValue(params.rows),
    dryRun: params.apply === true || params.dryRun === false ? false : true,
    allowTables: stringArrayValue(params.allowTables) ?? singleStringArrayValue(params.allowTable),
    denyTables: stringArrayValue(params.denyTables) ?? singleStringArrayValue(params.denyTable),
  };
}

function parseLegacyArgsJson(argsJson: string | undefined): unknown[] {
  if (argsJson === undefined || argsJson.trim().length === 0) return [];
  const parsed = JSON.parse(argsJson) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
] as const;

const LEGACY_WRITE_FIXTURE_SLICE_TOOL_NAMES = [
  "exec_sql",
  "run_script",
  "create_table",
  "drop_table",
  "seed_fixture",
  "teardown_fixture",
] as const;

export function translateCoreResultToMcpContent<TData>(result: OperationResult<TData>): McpToolResult {
  if (!result.ok) {
    return {
      content: [{ type: "text", text: `${result.error.code}: ${result.error.message}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result.data) }],
    isError: false,
  };
}
