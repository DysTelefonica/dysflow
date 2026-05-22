import type { AccessQueryRequest, AccessVbaRequest, OperationResult } from "../../core/contracts/index.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import type { AccessOperationRecord, AccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import { getDefaultAccessOperationRegistry } from "../../core/runner/access-runner.js";
import { successResult } from "../../core/contracts/index.js";
import type { McpToolContext } from "./types.js";
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
  type?: JsonSchemaPrimitiveType;
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
  /**
   * When true, this tool is excluded from the tools/list MCP projection.
   * The handler remains callable via tools/call for backwards compatibility.
   * Used for stub tools that always return LEGACY_TOOL_NOT_IMPLEMENTED.
   */
  hidden?: boolean;
  handler(input: unknown, context?: McpToolContext): Promise<McpToolResult>;
};

const NO_INPUT_SCHEMA: JsonObjectSchema = { type: "object", additionalProperties: false, properties: {} };

const CONTEXT_PROPERTIES: Record<string, JsonSchemaProperty> = {
  projectId: { type: "string", description: "canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden by a tool that supports overrides." },
  contextId: { type: "string", description: "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known." },
};

const VBA_EXECUTE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["procedureName"],
  additionalProperties: false,
  properties: {
    ...CONTEXT_PROPERTIES,
    moduleName: { type: "string", description: "Optional VBA module name." },
    procedureName: { type: "string", description: "Public VBA procedure to execute." },
    arguments: { type: "array", items: {}, description: "Procedure arguments." },
  },
};

const QUERY_EXECUTE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["sql", "mode"],
  additionalProperties: false,
  properties: {
    ...CONTEXT_PROPERTIES,
    sql: { type: "string", description: "Access SQL to execute." },
    mode: { type: "string", enum: ["read", "write"], description: "Execution mode: read or write." },
  },
};

const DOCTOR_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...CONTEXT_PROPERTIES,
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
    execute(request: AccessVbaRequest, onProgress?: (percent: number, total?: number, message?: string) => void): Promise<OperationResult<AccessVbaResult>>;
  };
  queryService: {
    execute(request: AccessQueryRequest, onProgress?: (percent: number, total?: number, message?: string) => void): Promise<OperationResult<AccessQueryResult>>;
  };
  diagnosticsService: {
    run(request?: AccessDiagnosticsRequest): Promise<OperationResult<AccessDiagnosticsResult>>;
  };
  /** Optional registry override. When omitted, MCP operation-list tools intentionally use Dysflow's default process-local registry. */
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: { cleanup(request: { operationId: string; accessPath: string; force?: boolean }): Promise<OperationResult<AccessCleanupResult>> };
  legacyToolService?: { execute(toolName: LegacyDysflowMcpToolName, input: unknown): Promise<OperationResult<unknown>> };
};

export type McpWriteAccessResolver = (input: unknown) => Promise<boolean>;

function writesDisabled(): McpToolResult {
  return { content: [{ type: "text", text: "MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter." }], isError: true };
}

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
  if (property.type === undefined) return undefined;
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

// ---------------------------------------------------------------------------
// Per-tool schemas (#177)
// ---------------------------------------------------------------------------

/** Shared property atoms reused across multiple tool schemas. */
const SCHEMA_PROPS = {
  // context / identity
  projectId: { type: "string", description: "Canonical project identity for traceability." } as JsonSchemaProperty,
  contextId: { type: "string", description: "Optional run/context id for this call." } as JsonSchemaProperty,
  // path overrides
  accessPath: { type: "string", description: "Optional override for Access frontend database path." } as JsonSchemaProperty,
  backendPath: { type: "string", description: "Optional override for Access backend database path." } as JsonSchemaProperty,
  comparePath: { type: "string", description: "Backend comparison path alias for backendPath." } as JsonSchemaProperty,
  databasePath: { type: "string", description: "Database path." } as JsonSchemaProperty,
  sourcePath: { type: "string", description: "Source path alias for databasePath." } as JsonSchemaProperty,
  rootPath: { type: "string", description: "Optional override for root directory." } as JsonSchemaProperty,
  directory: { type: "string", description: "Directory path alias for rootPath." } as JsonSchemaProperty,
  exportPath: { type: "string", description: "Export path." } as JsonSchemaProperty,
  importPath: { type: "string", description: "Import path." } as JsonSchemaProperty,
  path: { type: "string", description: "Path alias (used as exportPath or importPath depending on tool)." } as JsonSchemaProperty,
  scriptPath: { type: "string", description: "SQL script path." } as JsonSchemaProperty,
  destinationRoot: { type: "string", description: "Optional override for source/export root." } as JsonSchemaProperty,
  projectRoot: { type: "string", description: "Optional override for project root." } as JsonSchemaProperty,
  // schema/table
  tableName: { type: "string", description: "Table name." } as JsonSchemaProperty,
  table: { type: "string", description: "Table name alias." } as JsonSchemaProperty,
  columnName: { type: "string", description: "Column name." } as JsonSchemaProperty,
  column: { type: "string", description: "Column name alias." } as JsonSchemaProperty,
  definition: { type: "string", description: "Table definition or fields." } as JsonSchemaProperty,
  fields: { type: "string", description: "Table definition alias." } as JsonSchemaProperty,
  // query / SQL
  sql: { type: "string", description: "SQL text." } as JsonSchemaProperty,
  query: { type: "string", description: "SQL query alias." } as JsonSchemaProperty,
  queryDefinitions: { type: "array", items: { type: "object", properties: { name: { type: "string" }, sql: { type: "string" } } }, description: "Query definitions." } as JsonSchemaProperty,
  queries: { type: "array", items: { type: "object", properties: { name: { type: "string" }, sql: { type: "string" } } }, description: "Query definitions alias." } as JsonSchemaProperty,
  // write / fixture
  rows: { type: "array", items: { type: "object", additionalProperties: true }, description: "Fixture rows." } as JsonSchemaProperty,
  dryRun: { type: "boolean", description: "Run without applying writes." } as JsonSchemaProperty,
  apply: { type: "boolean", description: "Apply a write instead of dry run." } as JsonSchemaProperty,
  allowTables: { type: "array", items: { type: "string" }, description: "Allowed tables." } as JsonSchemaProperty,
  allowTable: { type: "string", description: "Single allowed table." } as JsonSchemaProperty,
  denyTables: { type: "array", items: { type: "string" }, description: "Denied tables." } as JsonSchemaProperty,
  denyTable: { type: "string", description: "Single denied table." } as JsonSchemaProperty,
  // VBA / module
  moduleName: { type: "string", description: "VBA module name." } as JsonSchemaProperty,
  moduleNames: { type: "array", items: { type: "string" }, description: "VBA module names." } as JsonSchemaProperty,
  procedureName: { type: "string", description: "Public VBA procedure name." } as JsonSchemaProperty,
  proceduresJson: { type: "string", description: "JSON encoded VBA test procedures." } as JsonSchemaProperty,
  argsJson: { type: "string", description: "JSON encoded argument array." } as JsonSchemaProperty,
  compile: { type: "boolean", description: "Compile before running." } as JsonSchemaProperty,
  filter: { type: "string", description: "Test or object filter." } as JsonSchemaProperty,
  importMode: { type: "string", description: "VBA import mode." } as JsonSchemaProperty,
  // strict context
  strict: { type: "boolean", description: "Use strict comparison or validation." } as JsonSchemaProperty,
  strictContext: { type: "boolean", description: "Abort before opening Access if resolved target does not match expected paths." } as JsonSchemaProperty,
  expectedAccessPath: { type: "string", description: "Expected resolved Access database path for strictContext." } as JsonSchemaProperty,
  expectedProjectRoot: { type: "string", description: "Expected resolved project root for strictContext." } as JsonSchemaProperty,
  expectedDestinationRoot: { type: "string", description: "Expected resolved destination root for strictContext." } as JsonSchemaProperty,
  // misc
  name: { type: "string", description: "Object or generated form name." } as JsonSchemaProperty,
  operationId: { type: "string", description: "Dysflow operation id." } as JsonSchemaProperty,
  force: { type: "boolean", description: "Force operation when supported." } as JsonSchemaProperty,
  backup: { type: "boolean", description: "Create a backup before destructive changes." } as JsonSchemaProperty,
  backupFirst: { type: "boolean", description: "Create a backup before compact/repair." } as JsonSchemaProperty,
  diff: { type: "boolean", description: "Include a diff when supported." } as JsonSchemaProperty,
  limit: { type: "number", description: "Maximum number of items or diff lines." } as JsonSchemaProperty,
  timeoutMs: { type: "number", description: "Operation timeout in milliseconds. Overrides project config timeout." } as JsonSchemaProperty,
  replace: { type: "boolean", description: "Replace existing resources." } as JsonSchemaProperty,
  strict_write: { type: "boolean", description: "Use strict write guards." } as JsonSchemaProperty,
  // ERD / form
  erdPath: { type: "string", description: "ERD output path." } as JsonSchemaProperty,
  catalogPath: { type: "string", description: "Form control catalog path." } as JsonSchemaProperty,
  specPath: { type: "string", description: "Form/report specification path." } as JsonSchemaProperty,
  spec: { type: "object", description: "Form/report specification object." } as JsonSchemaProperty,
  kind: { type: "string", description: "Form/report kind." } as JsonSchemaProperty,
  controlName: { type: "string", description: "Control name." } as JsonSchemaProperty,
  controlType: { type: "string", description: "Control type." } as JsonSchemaProperty,
  type: { type: "string", description: "Control type alias." } as JsonSchemaProperty,
  location: { type: "string", description: "Encoding fix location." } as JsonSchemaProperty,
  top: { type: "number", description: "Maximum returned rows." } as JsonSchemaProperty,
  testsPath: { type: "string", description: "VBA test plan path." } as JsonSchemaProperty,
  exists_name: { type: "string", description: "Object name to check for existence." } as JsonSchemaProperty,
};

/** Shared context props used by most tools. */
const CTX = { projectId: SCHEMA_PROPS.projectId, contextId: SCHEMA_PROPS.contextId };
/** Access path overrides used by most legacy tools. */
const ACCESS_OVERRIDE = { accessPath: SCHEMA_PROPS.accessPath, backendPath: SCHEMA_PROPS.backendPath, destinationRoot: SCHEMA_PROPS.destinationRoot, projectRoot: SCHEMA_PROPS.projectRoot };
/** Strict context guard props. */
const STRICT_CTX = { strictContext: SCHEMA_PROPS.strictContext, expectedAccessPath: SCHEMA_PROPS.expectedAccessPath, expectedProjectRoot: SCHEMA_PROPS.expectedProjectRoot, expectedDestinationRoot: SCHEMA_PROPS.expectedDestinationRoot };

/**
 * Per-tool input schemas (#177).
 * Each entry contains only the properties that the corresponding handler actually reads.
 * Exported for contract testing.
 */
export const LEGACY_TOOL_SCHEMAS: Record<string, JsonObjectSchema> = {
  // ---- alias tools (explicit per-tool schemas) ----
  list_access_operations: { type: "object", additionalProperties: false, properties: {} },
  cleanup_access_operation: { type: "object", required: ["operationId"], additionalProperties: false, properties: { operationId: SCHEMA_PROPS.operationId, accessPath: SCHEMA_PROPS.accessPath, force: SCHEMA_PROPS.force } },
  run_vba: { type: "object", required: ["procedureName"], additionalProperties: false, properties: { procedureName: SCHEMA_PROPS.procedureName, argsJson: SCHEMA_PROPS.argsJson } },
  query_sql: { type: "object", additionalProperties: false, properties: { ...CTX, sql: SCHEMA_PROPS.sql, query: SCHEMA_PROPS.query } },
  exec_sql: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, sql: SCHEMA_PROPS.sql, query: SCHEMA_PROPS.query, dryRun: SCHEMA_PROPS.dryRun, apply: SCHEMA_PROPS.apply, allowTables: SCHEMA_PROPS.allowTables, allowTable: SCHEMA_PROPS.allowTable, denyTables: SCHEMA_PROPS.denyTables, denyTable: SCHEMA_PROPS.denyTable } },
  run_script: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, scriptPath: SCHEMA_PROPS.scriptPath, path: SCHEMA_PROPS.path, dryRun: SCHEMA_PROPS.dryRun, apply: SCHEMA_PROPS.apply, allowTables: SCHEMA_PROPS.allowTables, allowTable: SCHEMA_PROPS.allowTable, denyTables: SCHEMA_PROPS.denyTables, denyTable: SCHEMA_PROPS.denyTable } },
  create_table: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, tableName: SCHEMA_PROPS.tableName, table: SCHEMA_PROPS.table, definition: SCHEMA_PROPS.definition, fields: SCHEMA_PROPS.fields, dryRun: SCHEMA_PROPS.dryRun, apply: SCHEMA_PROPS.apply } },
  drop_table: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, tableName: SCHEMA_PROPS.tableName, table: SCHEMA_PROPS.table, dryRun: SCHEMA_PROPS.dryRun, apply: SCHEMA_PROPS.apply } },
  seed_fixture: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, tableName: SCHEMA_PROPS.tableName, table: SCHEMA_PROPS.table, rows: SCHEMA_PROPS.rows, dryRun: SCHEMA_PROPS.dryRun, apply: SCHEMA_PROPS.apply, allowTables: SCHEMA_PROPS.allowTables, allowTable: SCHEMA_PROPS.allowTable, denyTables: SCHEMA_PROPS.denyTables, denyTable: SCHEMA_PROPS.denyTable } },
  teardown_fixture: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, tableName: SCHEMA_PROPS.tableName, table: SCHEMA_PROPS.table, dryRun: SCHEMA_PROPS.dryRun, apply: SCHEMA_PROPS.apply, allowTables: SCHEMA_PROPS.allowTables, allowTable: SCHEMA_PROPS.allowTable, denyTables: SCHEMA_PROPS.denyTables, denyTable: SCHEMA_PROPS.denyTable } },
  // ---- VBA sync tools ----
  export_modules: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, ...STRICT_CTX, moduleNames: SCHEMA_PROPS.moduleNames, filter: SCHEMA_PROPS.filter, destinationRoot: SCHEMA_PROPS.destinationRoot, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  export_all: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, ...STRICT_CTX, filter: SCHEMA_PROPS.filter, diff: SCHEMA_PROPS.diff, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  import_modules: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, ...STRICT_CTX, moduleNames: SCHEMA_PROPS.moduleNames, importMode: SCHEMA_PROPS.importMode, dryRun: SCHEMA_PROPS.dryRun, compile: SCHEMA_PROPS.compile, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  import_all: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, ...STRICT_CTX, importMode: SCHEMA_PROPS.importMode, dryRun: SCHEMA_PROPS.dryRun, compile: SCHEMA_PROPS.compile, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  list_objects: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, filter: SCHEMA_PROPS.filter, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  exists: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, name: SCHEMA_PROPS.name, moduleName: SCHEMA_PROPS.moduleName, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  test_vba: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, proceduresJson: SCHEMA_PROPS.proceduresJson, filter: SCHEMA_PROPS.filter, testsPath: SCHEMA_PROPS.testsPath, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  compile_vba: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  verify_code: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, ...STRICT_CTX, moduleNames: SCHEMA_PROPS.moduleNames, diff: SCHEMA_PROPS.diff, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  verify_binary: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, ...STRICT_CTX, moduleNames: SCHEMA_PROPS.moduleNames, diff: SCHEMA_PROPS.diff, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  reconcile_binary: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, ...STRICT_CTX, moduleNames: SCHEMA_PROPS.moduleNames, diff: SCHEMA_PROPS.diff, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  delete_module: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, moduleName: SCHEMA_PROPS.moduleName, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  generate_erd: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, erdPath: SCHEMA_PROPS.erdPath, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  fix_encoding: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, location: SCHEMA_PROPS.location, timeoutMs: SCHEMA_PROPS.timeoutMs } },
  validate_form_spec: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, specPath: SCHEMA_PROPS.specPath, spec: SCHEMA_PROPS.spec } },
  generate_form: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, specPath: SCHEMA_PROPS.specPath, spec: SCHEMA_PROPS.spec, kind: SCHEMA_PROPS.kind, name: SCHEMA_PROPS.name, replace: SCHEMA_PROPS.replace, dryRun: SCHEMA_PROPS.dryRun } },
  catalog_add_control: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, catalogPath: SCHEMA_PROPS.catalogPath, controlName: SCHEMA_PROPS.controlName, controlType: SCHEMA_PROPS.controlType, type: SCHEMA_PROPS.type } },
  harvest_form_catalog: { type: "object", additionalProperties: false, properties: { ...CTX, ...ACCESS_OVERRIDE, catalogPath: SCHEMA_PROPS.catalogPath, filter: SCHEMA_PROPS.filter } },
  // ---- query slice tools ----
  list_tables: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, backendPath: SCHEMA_PROPS.backendPath, databasePath: SCHEMA_PROPS.databasePath, sourcePath: SCHEMA_PROPS.sourcePath } },
  list_linked_tables: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, backendPath: SCHEMA_PROPS.backendPath } },
  get_schema: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, tableName: SCHEMA_PROPS.tableName, table: SCHEMA_PROPS.table } },
  count_rows: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, tableName: SCHEMA_PROPS.tableName, table: SCHEMA_PROPS.table, sql: SCHEMA_PROPS.sql, query: SCHEMA_PROPS.query } },
  distinct_values: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, tableName: SCHEMA_PROPS.tableName, table: SCHEMA_PROPS.table, columnName: SCHEMA_PROPS.columnName, column: SCHEMA_PROPS.column, sql: SCHEMA_PROPS.sql, query: SCHEMA_PROPS.query } },
  compare_backends: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, backendPath: SCHEMA_PROPS.backendPath, comparePath: SCHEMA_PROPS.comparePath } },
  list_access_files: { type: "object", additionalProperties: false, properties: { ...CTX, rootPath: SCHEMA_PROPS.rootPath, directory: SCHEMA_PROPS.directory } },
  get_relationships: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath } },
  list_links: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath } },
  export_queries: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, exportPath: SCHEMA_PROPS.exportPath, path: SCHEMA_PROPS.path } },
  link_tables: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, backendPath: SCHEMA_PROPS.backendPath, dryRun: SCHEMA_PROPS.dryRun } },
  relink_tables: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, backendPath: SCHEMA_PROPS.backendPath, dryRun: SCHEMA_PROPS.dryRun } },
  localize_backend_links: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, backendPath: SCHEMA_PROPS.backendPath, dryRun: SCHEMA_PROPS.dryRun } },
  unlink_table: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, tableName: SCHEMA_PROPS.tableName, table: SCHEMA_PROPS.table, dryRun: SCHEMA_PROPS.dryRun } },
  import_queries: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, queryDefinitions: SCHEMA_PROPS.queryDefinitions, queries: SCHEMA_PROPS.queries, dryRun: SCHEMA_PROPS.dryRun } },
  compact_repair: { type: "object", additionalProperties: false, properties: { ...CTX, accessPath: SCHEMA_PROPS.accessPath, databasePath: SCHEMA_PROPS.databasePath, sourcePath: SCHEMA_PROPS.sourcePath, backupFirst: SCHEMA_PROPS.backupFirst, dryRun: SCHEMA_PROPS.dryRun } },
  relink_directory: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX,
      rootPath: SCHEMA_PROPS.rootPath,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      backup: SCHEMA_PROPS.backup,
      recursive: { type: "boolean", description: "Recursively scan subdirectories under root." } as JsonSchemaProperty,
      maps: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } }, description: "Alias map entries (OldName.accdb=NewName.accdb)." } as JsonSchemaProperty,
      denyPrefixes: { type: "array", items: { type: "string" }, description: "UNC prefixes to flag during verify." } as JsonSchemaProperty,
      strictLocal: { type: "boolean", description: "Fail verify if externalLinkCount > 0." } as JsonSchemaProperty,
      removeUnresolved: { type: "boolean", description: "Delete TableDef if no local target found." } as JsonSchemaProperty,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
      passwordEnv: { type: "string", description: "Environment variable name containing the backend database password." } as JsonSchemaProperty,
      backendPassword: { type: "string", description: "Raw backend database password." } as JsonSchemaProperty,
      password: { type: "string", description: "Alias for backendPassword." } as JsonSchemaProperty,
    },
  },
};

async function handleValidatedLegacyQuery<TData>(input: unknown, schema: JsonObjectSchema, execute: () => Promise<OperationResult<TData>>): Promise<McpToolResult> {
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
  const isDryRun = isLegacyWriteDryRun(input);
  if (!isDryRun && !(await isWriteAllowed(input, writesEnabled, writeAccessResolver))) return writesDisabled();
  return translateCoreResultToMcpContent(await execute());
}

export function createDysflowMcpTools(
  services: DysflowMcpServices,
  writesEnabled = false,
  writeAccessResolver?: McpWriteAccessResolver,
): DysflowMcpTool[] {
  const currentTools: DysflowMcpTool[] = [
    {
      name: "dysflow.vba.execute",
      description: "Execute a VBA procedure through Dysflow core services.",
      inputSchema: VBA_EXECUTE_SCHEMA,
      handler: async (input, context) => {
        const validation = validateInput(input, VBA_EXECUTE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        return translateCoreResultToMcpContent(await services.vbaService.execute(input as AccessVbaRequest, context?.sendProgress));
      },
    },
    {
      name: "dysflow.query.execute",
      description: "Execute an Access SQL query through Dysflow core services.",
      inputSchema: QUERY_EXECUTE_SCHEMA,
      handler: async (input, context) => {
        const validation = validateInput(input, QUERY_EXECUTE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        if ((input as AccessQueryRequest).mode === "write") {
          if (!(await isWriteAllowed(input, writesEnabled, writeAccessResolver))) return writesDisabled();
        }
        return translateCoreResultToMcpContent(await services.queryService.execute(input as AccessQueryRequest, context?.sendProgress));
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

  return appendLegacyCompatibilityTools(currentTools, services, writesEnabled, writeAccessResolver);
}

function appendLegacyCompatibilityTools(
  currentTools: DysflowMcpTool[],
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
): DysflowMcpTool[] {
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
    inputSchema: LEGACY_TOOL_SCHEMAS["cleanup_access_operation"]!,
    handler: async (input) => {
      const validation = validateInput(input, LEGACY_TOOL_SCHEMAS["cleanup_access_operation"]!);
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
    inputSchema: LEGACY_TOOL_SCHEMAS["run_vba"]!,
    handler: async (input) => {
      const validation = validateInput(input, LEGACY_TOOL_SCHEMAS["run_vba"]!);
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
  const querySqlSchema = LEGACY_TOOL_SCHEMAS["query_sql"]!;
  add({
    name: "query_sql",
    description: "Legacy-compatible alias for read-only Access SQL queries.",
    inputSchema: querySqlSchema,
    handler: async (input) => {
      const validation = validateInput(input, querySqlSchema);
      if (validation !== undefined) return invalidInput(validation);
      const request = input as { sql?: string; query?: string };
      return translateCoreResultToMcpContent(await services.queryService.execute({ sql: request.sql ?? request.query ?? "", mode: "read" }));
    },
  });
  add({
    name: "exec_sql",
    description: "Legacy-compatible alias for executing guarded Access SQL writes.",
    inputSchema: LEGACY_TOOL_SCHEMAS["exec_sql"]!,
    handler: async (input) => handleValidatedLegacyWrite(input, LEGACY_TOOL_SCHEMAS["exec_sql"]!, writesEnabled, writeAccessResolver, () => services.queryService.execute(toLegacyWriteFixtureRequest("exec_sql", input))),
  });
  add({
    name: "run_script",
    description: "Legacy-compatible alias for executing a guarded Access script.",
    inputSchema: LEGACY_TOOL_SCHEMAS["run_script"]!,
    handler: async (input) => handleValidatedLegacyWrite(input, LEGACY_TOOL_SCHEMAS["run_script"]!, writesEnabled, writeAccessResolver, () => services.queryService.execute(toLegacyWriteFixtureRequest("run_script", input))),
  });
  add({
    name: "create_table",
    description: "Legacy-compatible alias for creating a table through guarded Access writes.",
    inputSchema: LEGACY_TOOL_SCHEMAS["create_table"]!,
    handler: async (input) => handleValidatedLegacyWrite(input, LEGACY_TOOL_SCHEMAS["create_table"]!, writesEnabled, writeAccessResolver, () => services.queryService.execute(toLegacyWriteFixtureRequest("create_table", input))),
  });
  add({
    name: "drop_table",
    description: "Legacy-compatible alias for dropping a table through guarded Access writes.",
    inputSchema: LEGACY_TOOL_SCHEMAS["drop_table"]!,
    handler: async (input) => handleValidatedLegacyWrite(input, LEGACY_TOOL_SCHEMAS["drop_table"]!, writesEnabled, writeAccessResolver, () => services.queryService.execute(toLegacyWriteFixtureRequest("drop_table", input))),
  });
  add({
    name: "seed_fixture",
    description: "Legacy-compatible alias for seeding fixtures through guarded Access writes.",
    inputSchema: LEGACY_TOOL_SCHEMAS["seed_fixture"]!,
    handler: async (input) => handleValidatedLegacyWrite(input, LEGACY_TOOL_SCHEMAS["seed_fixture"]!, writesEnabled, writeAccessResolver, () => services.queryService.execute(toLegacyWriteFixtureRequest("seed_fixture", input))),
  });
  add({
    name: "teardown_fixture",
    description: "Legacy-compatible alias for tearing down fixtures through guarded Access writes.",
    inputSchema: LEGACY_TOOL_SCHEMAS["teardown_fixture"]!,
    handler: async (input) => handleValidatedLegacyWrite(input, LEGACY_TOOL_SCHEMAS["teardown_fixture"]!, writesEnabled, writeAccessResolver, () => services.queryService.execute(toLegacyWriteFixtureRequest("teardown_fixture", input))),
  });

  for (const legacyName of LEGACY_DYSFLOW_MCP_TOOL_NAMES) {
    add(createLegacyDispatchTool(legacyName, services, writesEnabled, writeAccessResolver));
  }

  return tools;
}

/**
 * Tools that always return LEGACY_TOOL_NOT_IMPLEMENTED.
 * They are hidden from tools/list to avoid advertising unworkable operations,
 * but remain registered so direct calls return a clear error rather than a routing failure.
 * Exported for contract testing.
 */
export const HIDDEN_STUB_TOOL_NAMES = new Set<LegacyDysflowMcpToolName>([]);

function createLegacyDispatchTool(
  name: LegacyDysflowMcpToolName,
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
): DysflowMcpTool {
  const definition = getLegacyParityToolDefinition(name);
  // LEGACY_TOOL_SCHEMAS is the sole source of truth for all legacy tool schemas (#200).
  const schema = LEGACY_TOOL_SCHEMAS[name]!;
  return {
    name,
    description: definition.description,
    inputSchema: schema,
    hidden: HIDDEN_STUB_TOOL_NAMES.has(name) ? true : undefined,
    handler: async (input) => {
      const validation = validateInput(input, schema);
      if (validation !== undefined) return invalidInput(validation);
      const isDryRun = isRecord(input) && input.dryRun === true;
      if (!isDryRun && (isWriteFixtureSliceTool(name) || getLegacyParityToolDefinition(name).queryMode === "write") && !(await isWriteAllowed(input, writesEnabled, writeAccessResolver))) {
        return writesDisabled();
      }
      if (isVbaSyncSliceTool(name) && services.legacyToolService !== undefined) {
        return translateCoreResultToMcpContent(await services.legacyToolService.execute(name, input));
      }
      if (isVbaSyncSliceTool(name)) {
        return {
          isError: true,
          content: [{ type: "text", text: `MCP_SERVICE_UNAVAILABLE: ${name} requires the legacy VBA sync service to be configured.` }],
        };
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

async function isWriteAllowed(
  input: unknown,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
): Promise<boolean> {
  if (writesEnabled) return true;
  if (writeAccessResolver === undefined) return false;
  return await writeAccessResolver(input);
}

function isLegacyWriteDryRun(input: unknown): boolean {
  if (!isRecord(input)) return true;
  if (input.apply === true || input.dryRun === false) return false;
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
    queryDefinitions: queryDefinitionsValue(params.queryDefinitions) ?? queryDefinitionsValue(params.queries),
    dryRun: params.apply === true || params.dryRun === false ? false : true,
    maps: Array.isArray(params.maps)
      ? params.maps.filter((m): m is { from: string; to: string } => isRecord(m) && typeof m.from === "string" && typeof m.to === "string")
      : undefined,
    denyPrefixes: stringArrayValue(params.denyPrefixes),
    strictLocal: params.strictLocal === true ? true : undefined,
    removeUnresolved: params.removeUnresolved === true ? true : undefined,
    noBackup: params.backup === false ? true : undefined,
    recursive: typeof params.recursive === "boolean" ? params.recursive : undefined,
    timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
    backendPassword: stringValue(params.backendPassword) ?? stringValue(params.password) ?? (params.passwordEnv ? process.env[stringValue(params.passwordEnv) ?? ""] : undefined),
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
      content: [{ type: "text", text: `${result.error.code}: ${sanitizeErrorMessage(result.error.message)}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result.data) }],
    isError: false,
  };
}

function sanitizeErrorMessage(message: string): string {
  const pathPattern = /(?:[A-Za-z]:\\[^:\r\n]*?\.(?:accdb|mdb|accde|mde|laccdb)\b|(?<!\S)\/[^:\r\n]*?\.(?:accdb|mdb|accde|mde|laccdb)\b|\\\\[^\\\s"'<>|:*?]+\\[^\\\s"'<>|:*?]+(?:\\[^\\\s"'<>|:*?]+)*\\?|[A-Za-z]:\\(?:[^\\\s"'<>|:*?]+(?:\\[^\\\s"'<>|:*?]+)*\\?)?|(?<!\S)\/(?:[^/\s"'<>:]+\/)*[^/\s"'<>:]+)/gi;
  return message.replace(pathPattern, "[PATH]");
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
