// Schemas for the 24 query/access tools (QUERY_TOOL_NAMES).

import type { QueryToolName } from "../mcp-tool-registry.js";
import {
  ACCESS_OVERRIDE,
  CTX_PROPS,
  type JsonObjectSchema,
  type JsonSchemaProperty,
  SCHEMA_PROPS,
} from "../../../shared/validation/index.js";

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

export const QUERY_TOOL_SCHEMAS: Record<QueryToolName, JsonObjectSchema> = {
  query_sql: {
    type: "object",
    required: ["sql"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...READ_TARGET_OVERRIDE,
      sql: SCHEMA_PROPS.sql,
      query: SCHEMA_PROPS.query,
    },
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
      ...READ_TARGET_OVERRIDE,
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
      ...READ_TARGET_OVERRIDE,
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
    description:
      "Links tables from backendPath into the frontend Access database. Note: when backendPassword is set, Access stores the credential inside the linked table Connect string in the .accdb file.",
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
    description:
      "Relinks existing linked tables to a new or updated backend path. Note: when backendPassword is set, Access stores the credential inside the linked table Connect string in the .accdb file.",
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
        maxItems: 100,
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
