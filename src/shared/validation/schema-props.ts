// Shared schema property atoms used across MCP tool schemas, the HTTP
// adapter validation, and the shared validation kernel. Originally defined
// in src/adapters/mcp/schemas/dysflow-schemas.ts; moved here so the HTTP
// adapter can import them without crossing the adapter-to-adapter
// boundary.

import type { JsonSchemaProperty } from "./schemas.js";

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
  sql: {
    type: "string",
    minLength: 1,
    maxLength: 100000,
    description: "SQL text.",
  } as JsonSchemaProperty,
  query: {
    type: "string",
    minLength: 1,
    maxLength: 100000,
    description: "SQL query alias.",
  } as JsonSchemaProperty,
  queryDefinitions: {
    type: "array",
    maxItems: 200,
    items: { type: "object", properties: { name: { type: "string" }, sql: { type: "string" } } },
    description: "Query definitions.",
  } as JsonSchemaProperty,
  queries: {
    type: "array",
    maxItems: 200,
    items: { type: "object", properties: { name: { type: "string" }, sql: { type: "string" } } },
    description: "Query definitions alias.",
  } as JsonSchemaProperty,
  // write / fixture
  rows: {
    type: "array",
    maxItems: 1000,
    items: { type: "object", additionalProperties: true },
    description: "Fixture rows.",
  } as JsonSchemaProperty,
  dryRun: {
    type: "boolean",
    description:
      "Plan the write without applying it. Writes DEFAULT to dry-run: a write tool only commits when apply:true or dryRun:false is passed, so omitting both flags is safe. dryRun:true is the explicit form of that default.",
  } as JsonSchemaProperty,
  apply: {
    type: "boolean",
    description:
      "Commit the write, disabling the default dry-run. apply:true takes precedence over dryRun. Omit both apply and dryRun to plan only (the safe default).",
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
    description:
      "VBA module names. No hard length cap — long lists (20-30+) are accepted; the import path emits one per-module entry in the structured report so consumers can pinpoint which entry failed and why. An empty array is a valid explicit no-op plan and is NOT silently expanded to import-all.",
  } as JsonSchemaProperty,
  procedureName: {
    type: "string",
    description: "Public VBA procedure name.",
  } as JsonSchemaProperty,
  proceduresJson: {
    type: "string",
    description:
      'JSON-encoded VBA test plan: a string that parses to an array of tests, or an object with a "tests" array. Each test is either a procedure-name string (shorthand, no args) or an object {"procedure":"Test_Name","args":[...],"tags":[...]} ("proc" is accepted as an alias for "procedure"). Examples: ["Test_A","Test_B"] or [{"procedure":"Test_A","args":["fixture",1]}].',
  } as JsonSchemaProperty,
  argsJson: {
    type: "string",
    description:
      "JSON encoded argument array. Non-arrays will be wrapped in a single-element array [value].",
  } as JsonSchemaProperty,
  compile: {
    type: "boolean",
    description:
      "Trigger a VBA project compile+save (acCmdCompileAndSaveAllModules). For test_vba: runs before the test. For import_modules/import_all: runs after a successful import. Compile errors are propagated with component and line context.",
  } as JsonSchemaProperty,
  filter: { type: "string", description: "Test or object filter." } as JsonSchemaProperty,
  importMode: {
    type: "string",
    enum: ["Auto", "Form", "Code", "auto", "form", "code", "replace"],
    description:
      "VBA import mode. Auto (default) imports a form/report's UI from its .form.txt and its canonical code from the sibling .cls. Code imports only code-behind/.bas. Form is a deprecated alias for Auto (there is no layout-only import). Lowercase variants and replace are normalized before invoking the runner.",
  } as JsonSchemaProperty,
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
  prune: {
    type: "boolean",
    description:
      "Mirror mode. For export_all: after a fully clean export, delete on-disk source files (.bas/.cls/.form.txt/.report.txt) whose module no longer exists in the binary, so the destination mirrors the binary. NEVER prunes if the export reported any warning. For import_all: before importing, delete binary modules absent from managed source so the binary mirrors source. Saved queries are never pruned. Default false.",
  } as JsonSchemaProperty,
  limit: {
    type: "number",
    minimum: 1,
    description: "Maximum number of items or diff lines.",
  } as JsonSchemaProperty,
  timeoutMs: {
    type: "number",
    minimum: 1,
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
  newName: { type: "string", description: "New control name." } as JsonSchemaProperty,
  targetSectionName: {
    type: "string",
    description: "Optional target section/container name for a new form control.",
  } as JsonSchemaProperty,
  properties: {
    type: "object",
    additionalProperties: true,
    description: "Control properties to write to the form source.",
  } as JsonSchemaProperty,
  left: {
    type: "number",
    minimum: 0,
    description: "Control Left coordinate in Access twips.",
  } as JsonSchemaProperty,
  location: { type: "string", description: "Encoding fix location." } as JsonSchemaProperty,
  top: {
    type: "number",
    minimum: 0,
    description: "Control Top coordinate in Access twips.",
  } as JsonSchemaProperty,
  testsPath: { type: "string", description: "VBA test plan path." } as JsonSchemaProperty,
  exists_name: {
    type: "string",
    description: "Object name to check for existence.",
  } as JsonSchemaProperty,
  code: {
    type: "string",
    description: "VBA code snippet to execute inline.",
  } as JsonSchemaProperty,
  // form-template cloning (slice 5, issue #618)
  sourceForm: {
    type: "string",
    description:
      "Source form name (e.g. 'Form_FormRiesgosGestionRiesgo'). Resolved bench-cache first then projectRoot.",
  } as JsonSchemaProperty,
  targetForm: {
    type: "string",
    description:
      "Target form name (e.g. 'Form_FormNuevaAuditoria'). The new form being created. Rejected if the file already exists and overwrite is false.",
  } as JsonSchemaProperty,
  tokenMap: {
    type: "object",
    additionalProperties: { type: "string" },
    description:
      "Token replacement map: '{{Token}}' placeholder -> replacement string. Keys must be non-empty strings; values must be strings.",
  } as JsonSchemaProperty,
  missingTokenPolicy: {
    type: "string",
    enum: ["warn-pass-through", "strict"],
    description:
      "How to handle a token present in the source but absent from tokenMap. 'warn-pass-through' (default) leaves the token verbatim and emits a warning; 'strict' throws FORM_MUTATION_INVALID.",
  } as JsonSchemaProperty,
  strictMissingTokens: {
    type: "boolean",
    description:
      "Convenience flag equivalent to missingTokenPolicy:'strict'. When true, any unmapped source token is a typed error and no target is written.",
  } as JsonSchemaProperty,
  overwrite: {
    type: "boolean",
    description:
      "When true, an existing target .form.txt is replaced via the gated restore path so a failed load restores prior state. Default false.",
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
