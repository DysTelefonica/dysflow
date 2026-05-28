// Base types and schemas for the 5 dysflow_* official tools.

export type JsonSchemaPrimitiveType = "string" | "boolean" | "number" | "array" | "object";

export type JsonSchemaProperty = {
  type?: JsonSchemaPrimitiveType;
  description?: string;
  enum?: readonly string[];
  minLength?: number;
  pattern?: string;
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

export const NO_INPUT_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

export const VBA_EXECUTE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["procedureName"],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden by a tool that supports overrides.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    moduleName: { type: "string", description: "Optional VBA module name." },
    procedureName: {
      type: "string",
      minLength: 1,
      description: "Public VBA procedure to execute.",
    },
    arguments: { type: "array", items: {}, description: "Procedure arguments." },
  },
};

export const QUERY_EXECUTE_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["sql", "mode"],
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden by a tool that supports overrides.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    sql: { type: "string", minLength: 1, description: "Access SQL to execute." },
    backendPath: {
      type: "string",
      description: "Optional override for Access backend database path.",
    },
    databasePath: { type: "string", description: "Database path." },
    sourcePath: {
      type: "string",
      description: "Source path alias for databasePath.",
    },
    mode: {
      type: "string",
      enum: ["read", "write"],
      description: "Execution mode: read or write.",
    },
  },
};

export const DOCTOR_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "canonical project identity for traceability. Prefer the Engram project name when available. Paths and roots still come from .dysflow/project.json unless explicitly overridden by a tool that supports overrides.",
    },
    contextId: {
      type: "string",
      description:
        "Optional run/context id for this call. Do not duplicate projectId when it has the same value; use this only for a distinct execution context or as a fallback when no projectId is known.",
    },
    includeEnvironment: {
      type: "boolean",
      description: "Include environment diagnostics when supported.",
    },
  },
};

export const CLEANUP_SCHEMA: JsonObjectSchema = {
  type: "object",
  required: ["operationId", "accessPath"],
  additionalProperties: false,
  properties: {
    operationId: { type: "string", description: "Dysflow-owned Access operation id." },
    accessPath: {
      type: "string",
      description: "Access database path associated with the operation.",
    },
    force: { type: "boolean", description: "Force cleanup when supported." },
  },
};

/** Shared property atoms reused across multiple tool schemas. */
export const SCHEMA_PROPS = {
  // context / identity
  projectId: {
    type: "string",
    description: "Canonical project identity for traceability.",
  } as JsonSchemaProperty,
  contextId: {
    type: "string",
    description: "Optional run/context id for this call.",
  } as JsonSchemaProperty,
  // path overrides
  accessPath: {
    type: "string",
    description: "Optional override for Access frontend database path.",
  } as JsonSchemaProperty,
  backendPath: {
    type: "string",
    description: "Optional override for Access backend database path.",
  } as JsonSchemaProperty,
  comparePath: {
    type: "string",
    description: "Backend comparison path alias for backendPath.",
  } as JsonSchemaProperty,
  databasePath: { type: "string", description: "Database path." } as JsonSchemaProperty,
  sourcePath: {
    type: "string",
    description: "Source path alias for databasePath.",
  } as JsonSchemaProperty,
  rootPath: {
    type: "string",
    description: "Optional override for root directory.",
  } as JsonSchemaProperty,
  directory: {
    type: "string",
    description: "Directory path alias for rootPath.",
  } as JsonSchemaProperty,
  exportPath: { type: "string", description: "Export path." } as JsonSchemaProperty,
  importPath: { type: "string", description: "Import path." } as JsonSchemaProperty,
  path: {
    type: "string",
    description: "Path alias (used as exportPath or importPath depending on tool).",
  } as JsonSchemaProperty,
  scriptPath: { type: "string", description: "SQL script path." } as JsonSchemaProperty,
  destinationRoot: {
    type: "string",
    description: "Optional override for source/export root.",
  } as JsonSchemaProperty,
  projectRoot: {
    type: "string",
    description: "Optional override for project root.",
  } as JsonSchemaProperty,
  // schema/table
  tableName: { type: "string", description: "Table name." } as JsonSchemaProperty,
  table: { type: "string", description: "Table name alias." } as JsonSchemaProperty,
  columnName: { type: "string", description: "Column name." } as JsonSchemaProperty,
  column: { type: "string", description: "Column name alias." } as JsonSchemaProperty,
  definition: { type: "string", description: "Table definition or fields." } as JsonSchemaProperty,
  fields: { type: "string", description: "Table definition alias." } as JsonSchemaProperty,
  // query / SQL
  sql: { type: "string", minLength: 1, description: "SQL text." } as JsonSchemaProperty,
  query: { type: "string", minLength: 1, description: "SQL query alias." } as JsonSchemaProperty,
  queryDefinitions: {
    type: "array",
    items: { type: "object", properties: { name: { type: "string" }, sql: { type: "string" } } },
    description: "Query definitions.",
  } as JsonSchemaProperty,
  queries: {
    type: "array",
    items: { type: "object", properties: { name: { type: "string" }, sql: { type: "string" } } },
    description: "Query definitions alias.",
  } as JsonSchemaProperty,
  // write / fixture
  rows: {
    type: "array",
    items: { type: "object", additionalProperties: true },
    description: "Fixture rows.",
  } as JsonSchemaProperty,
  dryRun: { type: "boolean", description: "Run without applying writes." } as JsonSchemaProperty,
  apply: {
    type: "boolean",
    description: "Apply a write instead of dry run.",
  } as JsonSchemaProperty,
  allowTables: {
    type: "array",
    items: { type: "string" },
    description: "Allowed tables.",
  } as JsonSchemaProperty,
  allowTable: { type: "string", description: "Single allowed table." } as JsonSchemaProperty,
  denyTables: {
    type: "array",
    items: { type: "string" },
    description: "Denied tables.",
  } as JsonSchemaProperty,
  denyTable: { type: "string", description: "Single denied table." } as JsonSchemaProperty,
  // VBA / module
  moduleName: { type: "string", description: "VBA module name." } as JsonSchemaProperty,
  moduleNames: {
    type: "array",
    items: { type: "string" },
    description: "VBA module names.",
  } as JsonSchemaProperty,
  procedureName: {
    type: "string",
    description: "Public VBA procedure name.",
  } as JsonSchemaProperty,
  proceduresJson: {
    type: "string",
    description: "JSON encoded VBA test procedures.",
  } as JsonSchemaProperty,
  argsJson: { type: "string", description: "JSON encoded argument array." } as JsonSchemaProperty,
  compile: { type: "boolean", description: "Compile before running." } as JsonSchemaProperty,
  filter: { type: "string", description: "Test or object filter." } as JsonSchemaProperty,
  importMode: { type: "string", description: "VBA import mode." } as JsonSchemaProperty,
  mode: {
    type: "string",
    enum: ["read", "write"],
    description: "Execution mode: read or write.",
  } as JsonSchemaProperty,
  // strict context
  strict: {
    type: "boolean",
    description: "Use strict comparison or validation.",
  } as JsonSchemaProperty,
  strictContext: {
    type: "boolean",
    description: "Abort before opening Access if resolved target does not match expected paths.",
  } as JsonSchemaProperty,
  expectedAccessPath: {
    type: "string",
    description: "Expected resolved Access database path for strictContext.",
  } as JsonSchemaProperty,
  expectedProjectRoot: {
    type: "string",
    description: "Expected resolved project root for strictContext.",
  } as JsonSchemaProperty,
  expectedDestinationRoot: {
    type: "string",
    description: "Expected resolved destination root for strictContext.",
  } as JsonSchemaProperty,
  // misc
  name: { type: "string", description: "Object or generated form name." } as JsonSchemaProperty,
  operationId: { type: "string", description: "Dysflow operation id." } as JsonSchemaProperty,
  force: { type: "boolean", description: "Force operation when supported." } as JsonSchemaProperty,
  backup: {
    type: "boolean",
    description: "Create a backup before destructive changes.",
  } as JsonSchemaProperty,
  backupFirst: {
    type: "boolean",
    description: "Create a backup before compact/repair.",
  } as JsonSchemaProperty,
  diff: { type: "boolean", description: "Include a diff when supported." } as JsonSchemaProperty,
  limit: {
    type: "number",
    description: "Maximum number of items or diff lines.",
  } as JsonSchemaProperty,
  timeoutMs: {
    type: "number",
    description: "Operation timeout in milliseconds. Overrides project config timeout.",
  } as JsonSchemaProperty,
  replace: { type: "boolean", description: "Replace existing resources." } as JsonSchemaProperty,
  strict_write: { type: "boolean", description: "Use strict write guards." } as JsonSchemaProperty,
  // ERD / form
  erdPath: { type: "string", description: "ERD output path." } as JsonSchemaProperty,
  catalogPath: { type: "string", description: "Form control catalog path." } as JsonSchemaProperty,
  specPath: {
    type: "string",
    description: "Form/report specification path.",
  } as JsonSchemaProperty,
  spec: { type: "object", description: "Form/report specification object." } as JsonSchemaProperty,
  kind: { type: "string", description: "Form/report kind." } as JsonSchemaProperty,
  controlName: { type: "string", description: "Control name." } as JsonSchemaProperty,
  controlType: { type: "string", description: "Control type." } as JsonSchemaProperty,
  type: { type: "string", description: "Control type alias." } as JsonSchemaProperty,
  location: { type: "string", description: "Encoding fix location." } as JsonSchemaProperty,
  top: { type: "number", description: "Maximum returned rows." } as JsonSchemaProperty,
  testsPath: { type: "string", description: "VBA test plan path." } as JsonSchemaProperty,
  exists_name: {
    type: "string",
    description: "Object name to check for existence.",
  } as JsonSchemaProperty,
};

/** Shared context props used by most tools (single source of truth). */
export const CTX_PROPS = { projectId: SCHEMA_PROPS.projectId, contextId: SCHEMA_PROPS.contextId };

/** Access path overrides used by most MCP tools. */
export const ACCESS_OVERRIDE = {
  accessPath: SCHEMA_PROPS.accessPath,
  backendPath: SCHEMA_PROPS.backendPath,
  destinationRoot: SCHEMA_PROPS.destinationRoot,
  projectRoot: SCHEMA_PROPS.projectRoot,
};

/** Strict context guard props. */
export const STRICT_CTX = {
  strictContext: SCHEMA_PROPS.strictContext,
  expectedAccessPath: SCHEMA_PROPS.expectedAccessPath,
  expectedProjectRoot: SCHEMA_PROPS.expectedProjectRoot,
  expectedDestinationRoot: SCHEMA_PROPS.expectedDestinationRoot,
};
