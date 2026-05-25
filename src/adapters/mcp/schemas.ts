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
    procedureName: { type: "string", description: "Public VBA procedure to execute." },
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
    sql: { type: "string", description: "Access SQL to execute." },
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
  sql: { type: "string", description: "SQL text." } as JsonSchemaProperty,
  query: { type: "string", description: "SQL query alias." } as JsonSchemaProperty,
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
/** Access path overrides used by most legacy tools. */
export const ACCESS_OVERRIDE = {
  accessPath: SCHEMA_PROPS.accessPath,
  backendPath: SCHEMA_PROPS.backendPath,
  destinationRoot: SCHEMA_PROPS.destinationRoot,
  projectRoot: SCHEMA_PROPS.projectRoot,
};
const WRITE_TARGET_OVERRIDE = {
  ...ACCESS_OVERRIDE,
  databasePath: SCHEMA_PROPS.databasePath,
  sourcePath: SCHEMA_PROPS.sourcePath,
};
const READ_TARGET_OVERRIDE = {
  accessPath: SCHEMA_PROPS.accessPath,
  backendPath: SCHEMA_PROPS.backendPath,
  databasePath: SCHEMA_PROPS.databasePath,
  sourcePath: SCHEMA_PROPS.sourcePath,
};
/** Strict context guard props. */
export const STRICT_CTX = {
  strictContext: SCHEMA_PROPS.strictContext,
  expectedAccessPath: SCHEMA_PROPS.expectedAccessPath,
  expectedProjectRoot: SCHEMA_PROPS.expectedProjectRoot,
  expectedDestinationRoot: SCHEMA_PROPS.expectedDestinationRoot,
};

export const LEGACY_TOOL_SCHEMAS: Record<string, JsonObjectSchema> = {
  // ---- alias tools (explicit per-tool schemas) ----
  list_access_operations: { type: "object", additionalProperties: false, properties: {} },
  cleanup_access_operation: {
    type: "object",
    required: ["operationId"],
    additionalProperties: false,
    properties: {
      operationId: SCHEMA_PROPS.operationId,
      accessPath: SCHEMA_PROPS.accessPath,
      force: SCHEMA_PROPS.force,
    },
  },
  run_vba: {
    type: "object",
    required: ["procedureName"],
    additionalProperties: false,
    properties: { procedureName: SCHEMA_PROPS.procedureName, argsJson: SCHEMA_PROPS.argsJson },
  },
  query_sql: {
    type: "object",
    additionalProperties: false,
    properties: { ...CTX_PROPS, sql: SCHEMA_PROPS.sql, query: SCHEMA_PROPS.query },
  },
  exec_sql: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...WRITE_TARGET_OVERRIDE,
      sql: SCHEMA_PROPS.sql,
      query: SCHEMA_PROPS.query,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      allowTables: SCHEMA_PROPS.allowTables,
      allowTable: SCHEMA_PROPS.allowTable,
      denyTables: SCHEMA_PROPS.denyTables,
      denyTable: SCHEMA_PROPS.denyTable,
    },
  },
  run_script: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...WRITE_TARGET_OVERRIDE,
      scriptPath: SCHEMA_PROPS.scriptPath,
      path: SCHEMA_PROPS.path,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      allowTables: SCHEMA_PROPS.allowTables,
      allowTable: SCHEMA_PROPS.allowTable,
      denyTables: SCHEMA_PROPS.denyTables,
      denyTable: SCHEMA_PROPS.denyTable,
    },
  },
  create_table: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...WRITE_TARGET_OVERRIDE,
      tableName: SCHEMA_PROPS.tableName,
      table: SCHEMA_PROPS.table,
      definition: SCHEMA_PROPS.definition,
      fields: SCHEMA_PROPS.fields,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
    },
  },
  drop_table: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...WRITE_TARGET_OVERRIDE,
      tableName: SCHEMA_PROPS.tableName,
      table: SCHEMA_PROPS.table,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
    },
  },
  seed_fixture: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...WRITE_TARGET_OVERRIDE,
      tableName: SCHEMA_PROPS.tableName,
      table: SCHEMA_PROPS.table,
      rows: SCHEMA_PROPS.rows,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      allowTables: SCHEMA_PROPS.allowTables,
      allowTable: SCHEMA_PROPS.allowTable,
      denyTables: SCHEMA_PROPS.denyTables,
      denyTable: SCHEMA_PROPS.denyTable,
    },
  },
  teardown_fixture: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...WRITE_TARGET_OVERRIDE,
      tableName: SCHEMA_PROPS.tableName,
      table: SCHEMA_PROPS.table,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      allowTables: SCHEMA_PROPS.allowTables,
      allowTable: SCHEMA_PROPS.allowTable,
      denyTables: SCHEMA_PROPS.denyTables,
      denyTable: SCHEMA_PROPS.denyTable,
    },
  },
  // ---- VBA sync tools ----
  export_modules: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      moduleNames: SCHEMA_PROPS.moduleNames,
      filter: SCHEMA_PROPS.filter,
      destinationRoot: SCHEMA_PROPS.destinationRoot,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  export_all: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      filter: SCHEMA_PROPS.filter,
      diff: SCHEMA_PROPS.diff,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  import_modules: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      moduleNames: SCHEMA_PROPS.moduleNames,
      importMode: SCHEMA_PROPS.importMode,
      dryRun: SCHEMA_PROPS.dryRun,
      compile: SCHEMA_PROPS.compile,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  import_all: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      importMode: SCHEMA_PROPS.importMode,
      dryRun: SCHEMA_PROPS.dryRun,
      compile: SCHEMA_PROPS.compile,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  list_objects: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      filter: SCHEMA_PROPS.filter,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  exists: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      name: SCHEMA_PROPS.name,
      moduleName: SCHEMA_PROPS.moduleName,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  test_vba: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      proceduresJson: SCHEMA_PROPS.proceduresJson,
      filter: SCHEMA_PROPS.filter,
      testsPath: SCHEMA_PROPS.testsPath,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  compile_vba: {
    type: "object",
    additionalProperties: false,
    properties: { ...CTX_PROPS, ...ACCESS_OVERRIDE, timeoutMs: SCHEMA_PROPS.timeoutMs },
  },
  verify_code: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      moduleNames: SCHEMA_PROPS.moduleNames,
      diff: SCHEMA_PROPS.diff,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  verify_binary: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      moduleNames: SCHEMA_PROPS.moduleNames,
      diff: SCHEMA_PROPS.diff,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  reconcile_binary: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
      moduleNames: SCHEMA_PROPS.moduleNames,
      diff: SCHEMA_PROPS.diff,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  delete_module: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      moduleName: SCHEMA_PROPS.moduleName,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  generate_erd: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      erdPath: SCHEMA_PROPS.erdPath,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  fix_encoding: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      location: SCHEMA_PROPS.location,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
    },
  },
  validate_form_spec: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      specPath: SCHEMA_PROPS.specPath,
      spec: SCHEMA_PROPS.spec,
    },
  },
  generate_form: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      specPath: SCHEMA_PROPS.specPath,
      spec: SCHEMA_PROPS.spec,
      kind: SCHEMA_PROPS.kind,
      name: SCHEMA_PROPS.name,
      replace: SCHEMA_PROPS.replace,
      dryRun: SCHEMA_PROPS.dryRun,
    },
  },
  catalog_add_control: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      catalogPath: SCHEMA_PROPS.catalogPath,
      controlName: SCHEMA_PROPS.controlName,
      controlType: SCHEMA_PROPS.controlType,
      type: SCHEMA_PROPS.type,
      spec: SCHEMA_PROPS.spec,
      specPath: SCHEMA_PROPS.specPath,
    },
  },
  harvest_form_catalog: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      catalogPath: SCHEMA_PROPS.catalogPath,
      filter: SCHEMA_PROPS.filter,
    },
  },
  // ---- query slice tools ----
  list_tables: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      backendPath: SCHEMA_PROPS.backendPath,
      databasePath: SCHEMA_PROPS.databasePath,
      sourcePath: SCHEMA_PROPS.sourcePath,
    },
  },
  list_linked_tables: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      backendPath: SCHEMA_PROPS.backendPath,
    },
  },
  get_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...READ_TARGET_OVERRIDE,
      tableName: SCHEMA_PROPS.tableName,
      table: SCHEMA_PROPS.table,
    },
  },
  count_rows: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      tableName: SCHEMA_PROPS.tableName,
      table: SCHEMA_PROPS.table,
      sql: SCHEMA_PROPS.sql,
      query: SCHEMA_PROPS.query,
    },
  },
  distinct_values: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      tableName: SCHEMA_PROPS.tableName,
      table: SCHEMA_PROPS.table,
      columnName: SCHEMA_PROPS.columnName,
      column: SCHEMA_PROPS.column,
      sql: SCHEMA_PROPS.sql,
      query: SCHEMA_PROPS.query,
    },
  },
  compare_backends: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      backendPath: SCHEMA_PROPS.backendPath,
      comparePath: SCHEMA_PROPS.comparePath,
    },
  },
  list_access_files: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      rootPath: SCHEMA_PROPS.rootPath,
      directory: SCHEMA_PROPS.directory,
    },
  },
  get_relationships: {
    type: "object",
    additionalProperties: false,
    properties: { ...CTX_PROPS, ...READ_TARGET_OVERRIDE },
  },
  list_links: {
    type: "object",
    additionalProperties: false,
    properties: { ...CTX_PROPS, accessPath: SCHEMA_PROPS.accessPath },
  },
  export_queries: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      exportPath: SCHEMA_PROPS.exportPath,
      path: SCHEMA_PROPS.path,
    },
  },
  link_tables: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      backendPath: SCHEMA_PROPS.backendPath,
      dryRun: SCHEMA_PROPS.dryRun,
    },
  },
  relink_tables: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      backendPath: SCHEMA_PROPS.backendPath,
      dryRun: SCHEMA_PROPS.dryRun,
    },
  },
  localize_backend_links: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      backendPath: SCHEMA_PROPS.backendPath,
      dryRun: SCHEMA_PROPS.dryRun,
    },
  },
  unlink_table: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      tableName: SCHEMA_PROPS.tableName,
      table: SCHEMA_PROPS.table,
      dryRun: SCHEMA_PROPS.dryRun,
    },
  },
  import_queries: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      queryDefinitions: SCHEMA_PROPS.queryDefinitions,
      queries: SCHEMA_PROPS.queries,
      dryRun: SCHEMA_PROPS.dryRun,
    },
  },
  compact_repair: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      accessPath: SCHEMA_PROPS.accessPath,
      databasePath: SCHEMA_PROPS.databasePath,
      sourcePath: SCHEMA_PROPS.sourcePath,
      backupFirst: SCHEMA_PROPS.backupFirst,
      dryRun: SCHEMA_PROPS.dryRun,
    },
  },
  relink_directory: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      rootPath: SCHEMA_PROPS.rootPath,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
      backup: SCHEMA_PROPS.backup,
      recursive: {
        type: "boolean",
        description: "Recursively scan subdirectories under root.",
      } as JsonSchemaProperty,
      maps: {
        type: "array",
        items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } },
        description: "Alias map entries (OldName.accdb=NewName.accdb).",
      } as JsonSchemaProperty,
      denyPrefixes: {
        type: "array",
        items: { type: "string" },
        description: "UNC prefixes to flag during verify.",
      } as JsonSchemaProperty,
      strictLocal: {
        type: "boolean",
        description: "Fail verify if externalLinkCount > 0.",
      } as JsonSchemaProperty,
      removeUnresolved: {
        type: "boolean",
        description: "Delete TableDef if no local target found.",
      } as JsonSchemaProperty,
      timeoutMs: SCHEMA_PROPS.timeoutMs,
      passwordEnv: {
        type: "string",
        description: "Environment variable name containing the backend database password.",
      } as JsonSchemaProperty,
      backendPassword: {
        type: "string",
        description: "Raw backend database password.",
      } as JsonSchemaProperty,
      password: { type: "string", description: "Alias for backendPassword." } as JsonSchemaProperty,
    },
  },
};
