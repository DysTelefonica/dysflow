// Schemas for the 24 query/access tools (QUERY_TOOL_NAMES).

import {
  ACCESS_OVERRIDE,
  CTX_PROPS,
  type JsonObjectSchema,
  type JsonSchemaProperty,
  SCHEMA_PROPS,
  STRICT_CTX,
} from "../../../shared/validation/index.js";
import type { QueryToolName } from "../mcp-tool-registry.js";

const WRITE_TARGET_OVERRIDE = {
  ...ACCESS_OVERRIDE,
  databasePath: SCHEMA_PROPS.databasePath,
  sourcePath: SCHEMA_PROPS.sourcePath,
};

const EXPLICIT_READ_TARGET_OVERRIDE = {
  accessPath: SCHEMA_PROPS.accessPath,
  backendPath: SCHEMA_PROPS.backendPath,
  databasePath: SCHEMA_PROPS.databasePath,
  sourcePath: SCHEMA_PROPS.sourcePath,
  target: {
    type: "string",
    enum: ["frontend", "backend"],
    description:
      "Semantic target role for database-wide reads. With projectId/contextId, frontend resolves to accessPath and backend resolves to backendPath. Explicit databasePath/sourcePath wins over the semantic role.",
  } as JsonSchemaProperty,
};

const TABLE_READ_TARGET_OVERRIDE = {
  ...EXPLICIT_READ_TARGET_OVERRIDE,
  target: {
    type: "string",
    enum: ["frontend", "backend", "auto"],
    description:
      "Semantic target role for table-aware reads. auto probes the configured backend and frontend using tableName; it fails when the table is missing or exists in both. Explicit databasePath/sourcePath wins.",
  } as JsonSchemaProperty,
};

const FRONTEND_TARGET_OVERRIDE = {
  accessPath: SCHEMA_PROPS.accessPath,
  target: {
    type: "string",
    enum: ["frontend"],
    description:
      "This operation is frontend-only. Omit target to use the configured accessPath, or pass target:'frontend' to make the role explicit. backend and auto are invalid.",
  } as JsonSchemaProperty,
};

export const QUERY_TOOL_SCHEMAS: Record<QueryToolName, JsonObjectSchema> = {
  query_sql: {
    type: "object",
    required: ["sql"],
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...EXPLICIT_READ_TARGET_OVERRIDE,
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
      ...EXPLICIT_READ_TARGET_OVERRIDE,
    },
  },
  list_linked_tables: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...FRONTEND_TARGET_OVERRIDE,
    },
  },
  get_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...TABLE_READ_TARGET_OVERRIDE,
      tableName: SCHEMA_PROPS.tableName,
      table: SCHEMA_PROPS.table,
    },
  },
  count_rows: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...TABLE_READ_TARGET_OVERRIDE,
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
      ...TABLE_READ_TARGET_OVERRIDE,
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
    properties: { ...CTX_PROPS, ...EXPLICIT_READ_TARGET_OVERRIDE },
  },
  list_links: {
    type: "object",
    additionalProperties: false,
    properties: { ...CTX_PROPS, ...FRONTEND_TARGET_OVERRIDE },
  },
  export_queries: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...FRONTEND_TARGET_OVERRIDE,
      exportPath: SCHEMA_PROPS.exportPath,
      path: SCHEMA_PROPS.path,
    },
  },
  link_tables: {
    type: "object",
    description:
      'Links tables from backendPath into the frontend Access database. By default (relink-only) it refreshes/re-points TableDefs that already exist in the frontend and never creates a missing link. Pass mode:"create-or-relink" to also CREATE a linked TableDef for each requested backend table that has no frontend link (issue #851); use tableNames to scope which tables. dryRun:true plans per-table create/relink/no-op actions without writing; apply:true commits. Note: when backendPassword is set, Access stores the credential inside the linked table Connect string in the .accdb file.',
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...FRONTEND_TARGET_OVERRIDE,
      backendPath: SCHEMA_PROPS.backendPath,
      // Issue #851 — opt-in create capability. Omitted / "relink-only" keeps the
      // backward-compatible default (never creates a missing link).
      mode: {
        type: "string",
        enum: ["relink-only", "create-or-relink"],
        description:
          "relink-only (default): refresh/re-point existing links only. create-or-relink: also create a linked TableDef for each requested backend table missing from the frontend.",
      } as JsonSchemaProperty,
      tableNames: {
        type: "array",
        items: { type: "string" },
        description:
          "Scope the link/relink/create operation to these backend table names. Omit to target all existing frontend links (relink-only) or all backend tables (create-or-relink).",
      } as JsonSchemaProperty,
      dryRun: SCHEMA_PROPS.dryRun,
      // Issue #1031 / #1073 — apply parity with relink_tables, localize_backend_links,
      // unlink_table. Apply takes precedence over dryRun per the dispatch resolver.
      apply: SCHEMA_PROPS.apply,
    },
  },
  relink_tables: {
    type: "object",
    description:
      "Relinks existing linked tables to a new or updated backend path. Note: when backendPassword is set, Access stores the credential inside the linked table Connect string in the .accdb file.",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...FRONTEND_TARGET_OVERRIDE,
      backendPath: SCHEMA_PROPS.backendPath,
      dryRun: SCHEMA_PROPS.dryRun,
      // Issue #1031 — apply:true parity with the registry; precedent: #1014 / PR #1030.
      apply: SCHEMA_PROPS.apply,
    },
  },
  localize_backend_links: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...FRONTEND_TARGET_OVERRIDE,
      backendPath: SCHEMA_PROPS.backendPath,
      dryRun: SCHEMA_PROPS.dryRun,
      // Issue #1031 — apply:true parity with the registry; precedent: #1014 / PR #1030.
      apply: SCHEMA_PROPS.apply,
    },
  },
  unlink_table: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...FRONTEND_TARGET_OVERRIDE,
      tableName: SCHEMA_PROPS.tableName,
      table: SCHEMA_PROPS.table,
      dryRun: SCHEMA_PROPS.dryRun,
      // Issue #1031 — apply:true parity with the registry; precedent: #1014 / PR #1030.
      apply: SCHEMA_PROPS.apply,
    },
  },
  import_queries: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...FRONTEND_TARGET_OVERRIDE,
      // #672 — schema now exposes importPath (already supported by the
      // runner and the request mapper). Lets callers point at a file of
      // query definitions without inlining the array.
      importPath: SCHEMA_PROPS.importPath,
      queryDefinitions: SCHEMA_PROPS.queryDefinitions,
      queries: SCHEMA_PROPS.queries,
      dryRun: SCHEMA_PROPS.dryRun,
      // Issue #1031 — apply:true parity with the registry; precedent: #1014 / PR #1030.
      apply: SCHEMA_PROPS.apply,
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
      target: {
        type: "string",
        enum: ["frontend", "backend"],
        description:
          "Database role to compact. Defaults to frontend. backend resolves to the configured backendPath. Explicit databasePath/sourcePath/accessPath overrides the semantic target in that precedence order.",
      } as JsonSchemaProperty,
      backupFirst: SCHEMA_PROPS.backupFirst,
      dryRun: SCHEMA_PROPS.dryRun,
      apply: SCHEMA_PROPS.apply,
    },
  },
  relink_directory: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...CTX_PROPS,
      ...ACCESS_OVERRIDE,
      ...STRICT_CTX,
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
        description:
          "PREFERRED: name of an environment variable holding the backend database password. Use this instead of passing the password inline so the secret never appears in the tool-call arguments.",
      } as JsonSchemaProperty,
      backendPassword: {
        type: "string",
        description:
          "Raw backend database password. DISCOURAGED — prefer passwordEnv; an inline secret can be captured in tool-call transcripts. When set it is forwarded to PowerShell via the environment (never argv) and redacted from error output.",
      } as JsonSchemaProperty,
      password: {
        type: "string",
        description: "Alias for backendPassword. DISCOURAGED — prefer passwordEnv.",
      } as JsonSchemaProperty,
    },
  },
};
