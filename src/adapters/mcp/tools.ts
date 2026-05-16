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
import { getLegacyParityToolDefinition } from "./legacy-parity-registry.js";
import { stringValue, isRecord } from "../../core/utils/index.js";

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: readonly McpTextContent[];
  isError: boolean;
};

export type JsonSchemaPrimitiveType = "string" | "boolean" | "number" | "array" | "object";

export type JsonSchemaProperty = {
  type: JsonSchemaPrimitiveType;
  description?: string;
  enum?: readonly string[];
  items?: JsonSchemaProperty;
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchemaProperty>;
};

export type JsonObjectSchema = {
  type: "object";
  description?: string;
  required?: readonly string[];
  additionalProperties: boolean;
  properties: Record<string, JsonSchemaProperty>;
};

export type DysflowMcpTool = {
  name: string;
  description: string;
  inputSchema?: JsonObjectSchema;
  handler(input: unknown): Promise<McpToolResult>;
};

const NO_INPUT_SCHEMA: JsonObjectSchema = { type: "object", additionalProperties: false, properties: {} };

const VBA_EXECUTE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["procedureName"],
  additionalProperties: false,
  properties: {
    moduleName: { type: "string", description: "Optional VBA module name." },
    procedureName: { type: "string", description: "Public VBA procedure to execute." },
    arguments: { type: "array", description: "Procedure arguments." },
  },
};

const QUERY_EXECUTE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["sql", "mode"],
  additionalProperties: false,
  properties: {
    sql: { type: "string", description: "Access SQL to execute." },
    mode: { type: "string", enum: ["read", "write"], description: "Execution mode: read or write." },
  },
};

const DOCTOR_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    includeEnvironment: { type: "boolean", description: "Include environment diagnostics when supported." },
  },
};

const CLEANUP_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["operationId", "accessPath"],
  additionalProperties: false,
  properties: {
    operationId: { type: "string", description: "Dysflow-owned Access operation id." },
    accessPath: { type: "string", description: "Access database path associated with the operation." },
    force: { type: "boolean", description: "Force cleanup when supported." },
  },
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
};

function invalidInput(message: string): McpToolResult {
  return { content: [{ type: "text", text: `MCP_INPUT_INVALID: ${message}` }], isError: true };
}

function validateInput(input: unknown, schema: JsonObjectSchema): string | undefined {
  const params = input === undefined ? {} : input;
  if (!isRecord(params)) return "input must be an object.";

  for (const required of schema.required ?? []) {
    if (params[required] === undefined) return `${required} is required.`;
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(params)) {
      if (schema.properties[key] === undefined) return `${key} is not allowed.`;
    }
  }

  for (const [key, property] of Object.entries(schema.properties)) {
    const value = params[key];
    if (value === undefined) continue;
    const validation = validateJsonSchemaProperty(value, property, key);
    if (validation !== undefined) return validation;
  }

  return undefined;
}

function validateJsonSchemaProperty(value: unknown, property: JsonSchemaProperty, path: string): string | undefined {
  if (!matchesJsonSchemaType(value, property.type)) return `${path} must be ${articleFor(property.type)} ${property.type}.`;

  if (property.enum !== undefined) {
    if (typeof value !== "string" || !property.enum.includes(value)) return `${path} must be one of: ${property.enum.join(", ")}.`;
  }

  if (property.type === "array" && property.items !== undefined && Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const validation = validateJsonSchemaProperty(item, property.items, `${path}[${index}]`);
      if (validation !== undefined) return validation;
    }
  }

  if (property.type === "object" && isRecord(value)) {
    if (property.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (property.properties?.[key] === undefined) return `${path}.${key} is not allowed.`;
      }
    }
    for (const [key, childProperty] of Object.entries(property.properties ?? {})) {
      const childValue = value[key];
      if (childValue === undefined) continue;
      const validation = validateJsonSchemaProperty(childValue, childProperty, `${path}.${key}`);
      if (validation !== undefined) return validation;
    }
  }

  return undefined;
}

function matchesJsonSchemaType(value: unknown, type: JsonSchemaPrimitiveType): boolean {
  switch (type) {
    case "array": return Array.isArray(value);
    case "object": return isRecord(value);
    case "boolean": return typeof value === "boolean";
    case "number": return typeof value === "number";
    case "string": return typeof value === "string";
  }
}

function articleFor(type: JsonSchemaPrimitiveType): "a" | "an" {
  return type === "object" || type === "array" ? "an" : "a";
}

function legacySchemaForTool(name: LegacyDysflowMcpToolName | "run_vba" | "query_sql" | "cleanup_access_operation"): JsonObjectSchema {
  const properties: Record<string, JsonSchemaProperty> = {
    accessPath: { type: "string", description: "Access frontend database path." },
    allowTable: { type: "string", description: "Single allowed table." },
    allowTables: { type: "array", items: { type: "string" }, description: "Allowed tables." },
    apply: { type: "boolean", description: "Apply a write instead of dry run." },
    argsJson: { type: "string", description: "JSON encoded argument array." },
    backendPath: { type: "string", description: "Access backend database path." },
    comparePath: { type: "string", description: "Backend comparison path." },
    column: { type: "string", description: "Column name alias." },
    backup: { type: "boolean", description: "Create a backup before destructive changes." },
    backupFirst: { type: "boolean", description: "Create a backup before compact/repair." },
    catalogPath: { type: "string", description: "Form control catalog path." },
    columnName: { type: "string", description: "Column name." },
    compile: { type: "boolean", description: "Compile before running." },
    databasePath: { type: "string", description: "Database path." },
    definition: { type: "string", description: "Table definition or fields." },
    destinationRoot: { type: "string", description: "Source/export root directory." },
    diff: { type: "boolean", description: "Include a diff when supported." },
    erdPath: { type: "string", description: "ERD output path." },
    denyTable: { type: "string", description: "Single denied table." },
    denyTables: { type: "array", items: { type: "string" }, description: "Denied tables." },
    directory: { type: "string", description: "Directory path alias." },
    dryRun: { type: "boolean", description: "Run without applying writes." },
    exportPath: { type: "string", description: "Export path." },
    fields: { type: "string", description: "Table definition alias." },
    force: { type: "boolean", description: "Force operation when supported." },
    filter: { type: "string", description: "Test or object filter." },
    includeQueries: { type: "boolean", description: "Include saved queries." },
    importMode: { type: "string", description: "VBA import mode." },
    limit: { type: "number", description: "Maximum number of items or diff lines." },
    importPath: { type: "string", description: "Import path." },
    moduleName: { type: "string", description: "VBA module name." },
    moduleNames: { type: "array", items: { type: "string" }, description: "VBA module names." },
    name: { type: "string", description: "Object or generated form name." },
    operationId: { type: "string", description: "Dysflow operation id." },
    path: { type: "string", description: "Path alias." },
    proceduresJson: { type: "string", description: "JSON encoded VBA test procedures." },
    projectRoot: { type: "string", description: "Project root path." },
    procedureName: { type: "string", description: "Public VBA procedure name." },
    query: { type: "string", description: "SQL query alias." },
    queryDefinitions: { type: "array", items: { type: "object", properties: { name: { type: "string" }, sql: { type: "string" } } }, description: "Query definitions." },
    replace: { type: "boolean", description: "Replace existing resources." },
    queries: { type: "array", items: { type: "object", properties: { name: { type: "string" }, sql: { type: "string" } } }, description: "Query definitions alias." },
    rootPath: { type: "string", description: "Root directory path." },
    strict: { type: "boolean", description: "Use strict comparison or validation." },
    strictWrite: { type: "boolean", description: "Use strict write guards." },
    rows: { type: "array", description: "Fixture rows." },
    scriptPath: { type: "string", description: "SQL script path." },
    sourcePath: { type: "string", description: "Source path alias." },
    spec: { type: "object", description: "Form/report specification object." },
    specPath: { type: "string", description: "Form/report specification path." },
    sql: { type: "string", description: "SQL text." },
    table: { type: "string", description: "Table name alias." },
    tableName: { type: "string", description: "Table name." },
    testsPath: { type: "string", description: "VBA test plan path." },
    top: { type: "number", description: "Maximum returned rows." },
    type: { type: "string", description: "Control type alias." },
    controlName: { type: "string", description: "Control name." },
    controlType: { type: "string", description: "Control type." },
    kind: { type: "string", description: "Form/report kind." },
    location: { type: "string", description: "Encoding fix location." },
  };

  if (name === "run_vba") {
    return { type: "object", required: ["procedureName"], additionalProperties: false, properties: { procedureName: properties.procedureName, argsJson: { type: "string", description: "JSON encoded argument array." } } };
  }
  if (name === "cleanup_access_operation") {
    return { type: "object", required: ["operationId"], additionalProperties: false, properties: { operationId: properties.operationId, accessPath: properties.accessPath, force: properties.force } };
  }
  return { type: "object", additionalProperties: false, properties };
}

async function handleValidatedLegacyQuery<TData>(input: unknown, schema: JsonObjectSchema, execute: () => Promise<OperationResult<TData>>): Promise<McpToolResult> {
  const validation = validateInput(input, schema);
  if (validation !== undefined) return invalidInput(validation);
  return translateCoreResultToMcpContent(await execute());
}

export function createDysflowMcpTools(services: DysflowMcpServices): DysflowMcpTool[] {
  const currentTools: DysflowMcpTool[] = [
    {
      name: "dysflow.vba.execute",
      description: "Execute a VBA procedure through Dysflow core services.",
      inputSchema: VBA_EXECUTE_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, VBA_EXECUTE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        return translateCoreResultToMcpContent(await services.vbaService.execute(input as AccessVbaRequest));
      },
    },
    {
      name: "dysflow.query.execute",
      description: "Execute an Access SQL query through Dysflow core services.",
      inputSchema: QUERY_EXECUTE_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, QUERY_EXECUTE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        return translateCoreResultToMcpContent(await services.queryService.execute(input as AccessQueryRequest));
      },
    },
    {
      name: "dysflow.doctor",
      description: "Run Dysflow diagnostics through core services.",
      inputSchema: DOCTOR_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, DOCTOR_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        return translateCoreResultToMcpContent(await services.diagnosticsService.run(input as AccessDiagnosticsRequest));
      },
    },
    {
      name: "dysflow.access.operations.list",
      description: "List recent Access operations tracked by Dysflow.",
      inputSchema: NO_INPUT_SCHEMA,
      handler: async () => {
        const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
        return translateCoreResultToMcpContent(successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })));
      },
    },
    {
      name: "dysflow.access.cleanup",
      description: "Safely cleanup a registered Access operation by operationId and accessPath.",
      inputSchema: CLEANUP_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, CLEANUP_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
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
    inputSchema: NO_INPUT_SCHEMA,
    handler: async () => {
      const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
      return translateCoreResultToMcpContent(successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })));
    },
  });
  add({
    name: "cleanup_access_operation",
    description: "Legacy-compatible alias for safe Access operation cleanup.",
    inputSchema: legacySchemaForTool("cleanup_access_operation"),
    handler: async (input) => {
      const validation = validateInput(input, legacySchemaForTool("cleanup_access_operation"));
      if (validation !== undefined) return invalidInput(validation);
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
    inputSchema: legacySchemaForTool("run_vba"),
    handler: async (input) => {
      const validation = validateInput(input, legacySchemaForTool("run_vba"));
      if (validation !== undefined) return invalidInput(validation);
      const request = input as { procedureName: string; argsJson?: string };
      const parsedArgs = parseLegacyArgsJson(request.argsJson);
      if (!parsedArgs.ok) return invalidInput(parsedArgs.message);
      return translateCoreResultToMcpContent(await services.vbaService.execute({
        moduleName: "",
        procedureName: request.procedureName,
        arguments: parsedArgs.value,
      }));
    },
  });
  add({
    name: "query_sql",
    description: "Legacy-compatible alias for read-only Access SQL queries.",
    inputSchema: legacySchemaForTool("query_sql"),
    handler: async (input) => {
      const validation = validateInput(input, legacySchemaForTool("query_sql"));
      if (validation !== undefined) return invalidInput(validation);
      const request = input as { sql?: string; query?: string };
      return translateCoreResultToMcpContent(await services.queryService.execute({ sql: request.sql ?? request.query ?? "", mode: "read" }));
    },
  });
  add({
    name: "exec_sql",
    description: "Legacy-compatible alias for executing guarded Access SQL writes.",
    inputSchema: legacySchemaForTool("exec_sql"),
    handler: async (input) => handleValidatedLegacyQuery(input, legacySchemaForTool("exec_sql"), () => services.queryService.execute(toLegacyWriteFixtureRequest("exec_sql", input))),
  });
  add({
    name: "run_script",
    description: "Legacy-compatible alias for executing a guarded Access script.",
    inputSchema: legacySchemaForTool("run_script"),
    handler: async (input) => handleValidatedLegacyQuery(input, legacySchemaForTool("run_script"), () => services.queryService.execute(toLegacyWriteFixtureRequest("run_script", input))),
  });
  add({
    name: "create_table",
    description: "Legacy-compatible alias for creating a table through guarded Access writes.",
    inputSchema: legacySchemaForTool("create_table"),
    handler: async (input) => handleValidatedLegacyQuery(input, legacySchemaForTool("create_table"), () => services.queryService.execute(toLegacyWriteFixtureRequest("create_table", input))),
  });
  add({
    name: "drop_table",
    description: "Legacy-compatible alias for dropping a table through guarded Access writes.",
    inputSchema: legacySchemaForTool("drop_table"),
    handler: async (input) => handleValidatedLegacyQuery(input, legacySchemaForTool("drop_table"), () => services.queryService.execute(toLegacyWriteFixtureRequest("drop_table", input))),
  });
  add({
    name: "seed_fixture",
    description: "Legacy-compatible alias for seeding fixtures through guarded Access writes.",
    inputSchema: legacySchemaForTool("seed_fixture"),
    handler: async (input) => handleValidatedLegacyQuery(input, legacySchemaForTool("seed_fixture"), () => services.queryService.execute(toLegacyWriteFixtureRequest("seed_fixture", input))),
  });
  add({
    name: "teardown_fixture",
    description: "Legacy-compatible alias for tearing down fixtures through guarded Access writes.",
    inputSchema: legacySchemaForTool("teardown_fixture"),
    handler: async (input) => handleValidatedLegacyQuery(input, legacySchemaForTool("teardown_fixture"), () => services.queryService.execute(toLegacyWriteFixtureRequest("teardown_fixture", input))),
  });

  for (const legacyName of LEGACY_DYSFLOW_MCP_TOOL_NAMES) {
    add(createLegacyDispatchTool(legacyName, services));
  }

  return tools;
}

function createLegacyDispatchTool(name: LegacyDysflowMcpToolName, services: DysflowMcpServices): DysflowMcpTool {
  const definition = getLegacyParityToolDefinition(name);
  return {
    name,
    description: definition.description,
    inputSchema: legacySchemaForTool(name),
    handler: async (input) => {
      const validation = validateInput(input, legacySchemaForTool(name));
      if (validation !== undefined) return invalidInput(validation);
      if (isVbaSyncSliceTool(name) && services.legacyToolService !== undefined) {
        return translateCoreResultToMcpContent(await services.legacyToolService.execute(name, input));
      }
      if (isQueryMaintenanceSliceTool(name)) {
        return translateCoreResultToMcpContent(await services.queryService.execute(toLegacyMaintenanceRequest(name, input)));
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

function isQuerySliceTool(name: LegacyDysflowMcpToolName): boolean {
  return (LEGACY_QUERY_SLICE_TOOL_NAMES as readonly string[]).includes(name);
}

function isQueryMaintenanceSliceTool(name: LegacyDysflowMcpToolName): boolean {
  return (LEGACY_QUERY_MAINTENANCE_SLICE_TOOL_NAMES as readonly string[]).includes(name);
}

function isWriteFixtureSliceTool(name: LegacyDysflowMcpToolName): boolean {
  return (LEGACY_WRITE_FIXTURE_SLICE_TOOL_NAMES as readonly string[]).includes(name);
}

type LegacyArgsJsonParseResult =
  | { ok: true; value: unknown[] }
  | { ok: false; message: string };

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
    rootPath: stringValue(params.rootPath) ?? stringValue(params.directory),
    databasePath: stringValue(params.databasePath) ?? stringValue(params.sourcePath),
    exportPath: stringValue(params.exportPath) ?? stringValue(params.path),
    importPath: stringValue(params.importPath) ?? stringValue(params.path),
    queryDefinitions: queryDefinitionsValue(params.queryDefinitions) ?? queryDefinitionsValue(params.queries),
  };
}

function toLegacyWriteFixtureRequest(name: LegacyDysflowMcpToolName, input: unknown): AccessQueryRequest {
  const params = isRecord(input) ? input : {};
  const tableName = stringValue(params.tableName) ?? stringValue(params.table);
  return {
    action: name as AccessQueryRequest["action"],
    mode: "write",
    sql: stringValue(params.sql) ?? stringValue(params.query) ?? "",
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

function toLegacyMaintenanceRequest(name: LegacyDysflowMcpToolName, input: unknown): AccessQueryRequest {
  const params = isRecord(input) ? input : {};
  const isReadOnly = name === "list_links" || name === "export_queries";
  return {
    action: name as AccessQueryRequest["action"],
    mode: isReadOnly ? "read" : "write",
    sql: stringValue(params.sql) ?? stringValue(params.query) ?? "",
    tableName: stringValue(params.tableName) ?? stringValue(params.table),
    columnName: stringValue(params.columnName) ?? stringValue(params.column),
    backendPath: stringValue(params.backendPath) ?? stringValue(params.comparePath),
    rootPath: stringValue(params.rootPath) ?? stringValue(params.directory),
    databasePath: stringValue(params.databasePath) ?? stringValue(params.sourcePath),
    exportPath: stringValue(params.exportPath) ?? stringValue(params.path),
    importPath: stringValue(params.importPath) ?? stringValue(params.path),
    queryDefinitions: queryDefinitionsValue(params.queryDefinitions) ?? queryDefinitionsValue(params.queries),
    dryRun: params.dryRun === false ? false : true,
  };
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

function queryDefinitionsValue(value: unknown): readonly { name: string; sql: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const definitions = value
    .filter(isRecord)
    .map((item) => ({ name: stringValue(item.name) ?? "", sql: stringValue(item.sql) ?? "" }))
    .filter((item) => item.name.length > 0 && item.sql.length > 0);
  return definitions.length > 0 ? definitions : undefined;
}

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

const LEGACY_QUERY_MAINTENANCE_SLICE_TOOL_NAMES = [
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
