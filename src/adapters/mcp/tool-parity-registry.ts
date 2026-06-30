import {
  DYSFLOW_MCP_TOOL_NAMES,
  type DysflowMcpToolName,
  VBA_SYNC_TOOL_NAMES,
} from "./mcp-tool-registry.js";

export type ParitySlice = "vba-sync" | "query";
export type ParityStatus = "implemented" | "pending";

export type ParityToolDefinition = {
  name: DysflowMcpToolName;
  slice: ParitySlice;
  status: ParityStatus;
  description: string;
};

const implementedToolNames = new Set<DysflowMcpToolName>([
  // alias tools (direct handler routes)
  "list_access_operations",
  "cleanup_access_operation",
  "run_vba",
  "query_sql",
  "exec_sql",
  "run_script",
  "create_table",
  "drop_table",
  "seed_fixture",
  "teardown_fixture",
  // VBA sync tools — routed to vbaSyncToolService when configured
  "export_modules",
  "export_all",
  "import_modules",
  "import_all",
  "list_objects",
  "exists",
  "test_vba",
  "compile_vba",
  "verify_code",
  "delete_module",
  "generate_erd",
  "fix_encoding",
  "validate_form_spec",
  "generate_form",
  "catalog_add_control",
  "harvest_form_catalog",
  "inspect_form",
  "compare_form",
  "lint_form_code",
  "dysflow_form_add_control",
  "dysflow_form_move_control",
  "dysflow_form_rename_control",
  "vba_orphan_audit",
  "vba_inline_execution",
  // query slice tools — routed to queryService
  "list_tables",
  "list_linked_tables",
  "get_schema",
  "count_rows",
  "distinct_values",
  "compare_backends",
  "list_access_files",
  "get_relationships",
  "list_links",
  "link_tables",
  "relink_tables",
  "localize_backend_links",
  "unlink_table",
  "export_queries",
  "import_queries",
  "compact_repair",
  "relink_directory",
]);

function buildDescription(
  name: DysflowMcpToolName,
  slice: ParitySlice,
  status: ParityStatus,
): string {
  const humanSlice = slice === "vba-sync" ? "VBA sync" : "query/schema";
  const suffix =
    status === "implemented"
      ? "implemented via Dysflow core services."
      : "tracked for parity and not ported in this slice.";
  return `Dysflow MCP tool ${name}; ${humanSlice} ${suffix}`;
}

function classifyToolName(name: DysflowMcpToolName): ParitySlice {
  return (VBA_SYNC_TOOL_NAMES as readonly string[]).includes(name) ? "vba-sync" : "query";
}

/**
 * Real per-tool descriptions advertised to consuming agents (#544). Each line
 * tells an LLM what the tool does, the key arguments, and the footguns
 * (read-only / write-gated / destructive / dry-run / headless). The parity
 * `slice`/`status` above stay separate — they track porting for contract tests,
 * they are NOT the consumer-facing contract. Keep these honest and additive.
 */
export const TOOL_DESCRIPTIONS: Record<DysflowMcpToolName, string> = {
  // VBA sync — operations lifecycle
  list_access_operations:
    "List the Access operations dysflow is tracking, with their PIDs and status. Read-only. Use it to verify whether an MSACCESS process is actually live before asserting it or blocking a destructive action.",
  cleanup_access_operation:
    "Reconcile or release a tracked Access operation by operationId. WITHOUT force it inspects the recorded PID and reconciles a dead one (kills nothing); WITH force:true it kills the process. Write-gated.",
  // VBA sync — source <-> binary sync
  export_modules:
    "Export specific VBA modules from the Access binary to the on-disk source tree. Scope with moduleNames (exact) or filter (substring). Read-only on the binary. destinationRoot is honored only when accessPath is also passed; otherwise the project source root is used. For a full mirror use export_all.",
  export_all:
    "Mirror ALL VBA modules from the binary to the source tree. diff:true reports per-file drift without writing. prune:true DELETES orphaned managed source files (.bas/.cls/.form.txt/.report.txt) absent from the binary; prune is rejected together with filter. Read-only on the binary.",
  import_modules:
    "Import specific source modules INTO the Access binary (mutates the binary; write-gated). USE THIS whenever you know the exact list of modules you want to import — accepts long lists (20-30+ modules, no hard cap) and emits a STRUCTURED PER-MODULE report so callers can pinpoint which entry failed and why. Each module entry carries {module, status, phase (locate-source|remove-existing|import|compile), error:{code, message, machine, user}, durationMs, rollbackApplied}. importMode controls merge vs replace. compile:true compiles after import and fails on a real compile error in standard/class modules; dryRun:true returns a plan without writing. An empty moduleNames array is treated as an explicit no-op plan (NOT a silent fallback to import-all). When Access holds an exclusive lock on the .accdb, the per-module error.code surfaces ACCESS_DATABASE_LOCKED with machine/user when parseable.",
  import_all:
    "Import the entire source tree into the Access binary (mutates the binary; write-gated). RESERVED for whole-project resync (initial setup, disaster recovery, post-fork reconciliation). NOT a fallback for import_modules — if you have an explicit list of modules, use import_modules with moduleNames; if you pass moduleNames: [] to import_modules, it is a no-op plan, it does NOT expand to this tool. Supports compile:true and dryRun:true (plan mode).",
  list_objects:
    "List the VBA project's modules, classes, forms and reports, optionally filtered by name. Read-only.",
  exists: "Check whether a named module/object exists in the VBA project. Read-only.",
  // VBA sync — execution & test
  run_vba:
    "Execute one PUBLIC VBA procedure by name and return its result. Pass arguments via argsJson — a JSON array of scalars only (string/number/boolean/null). Requires a compiled project; subject to the allowedProcedures allowlist when configured. Headless.",
  test_vba:
    "Run VBA test procedures and report pass/fail per atom — the project's green gate. Select tests with proceduresJson (explicit list), filter (name substring) or testsPath. Requires a compiled project: import and compile before running.",
  compile_vba:
    "Compile and save all VBA modules headless. Reports a structured VBA_COMPILE_ERROR when standard/class modules fail to compile (via Application.IsCompiled); mutates only the binary's compiled state. Form/report document modules cannot be verified headless.",
  verify_code:
    "Compare the on-disk source against the VBA source exported live from the binary. Read-only and dry-run. USE BEFORE AND AFTER import_modules / import_all to confirm Unicode characters round-trip cleanly (no mojibake drift) and that the per-module result matches the binary. Act on actionableDifferent / recommendedAction, NOT raw different[] (most diffs are non-functional export noise). Folding is string-aware. strict:true does a byte-exact compare; diff:true adds per-module snippets.",
  delete_module:
    "Delete a module/object from the Access binary (DESTRUCTIVE; write-gated). force:true removes it even when a corruption HRESULT is raised. Edits the binary only — sync the source tree separately.",
  generate_erd:
    "Generate an entity-relationship document of the database schema to erdPath. Read-only.",
  fix_encoding:
    "Normalize a leading UTF-8 BOM on source files (and round-trip module encoding in the binary). It ONLY removes BOMs — it does NOT restore lossy '?' characters left by mojibake; restore those by editing the source and confirm with verify_code.",
  // VBA sync — forms
  validate_form_spec:
    "Validate a form/report spec (inline spec or specPath) against the form schema without creating anything. Read-only.",
  generate_form:
    "Generate a form or report from a spec (spec or specPath). replace:true overwrites an existing object; dryRun:true validates and plans without writing. Write-gated (filesystem mutation).",
  catalog_add_control:
    "Add a control definition to a form-generation catalog. Edits the catalog file, not the Access binary. Write-gated (filesystem mutation).",
  harvest_form_catalog:
    "Harvest control definitions from existing forms into a catalog (optionally filtered), to seed form generation. Read-only on the binary.",
  inspect_form:
    "Parse a version-controlled .form.txt (SaveAsText format) and return its control tree and form-level events as structured JSON. Works offline — Access is not required. Read-only. sourcePath must point to the on-disk source file (e.g. forms/Form_MyForm.form.txt).",
  compare_form:
    "Compare two version-controlled .form.txt files (sourcePath/source + targetPath/target) and return a structured drift report: added/removed controls, changed properties (with oldValue/newValue), and layout-bounds changes (Left/Top/Width/Height). Each drift carries actionable:bool classified against the canonical FORM_NOISE_KEYS noise floor (Checksum, PrtDevMode*, PrtDevNames*, PrtMip, RecSrcDt, LayoutCached*, PublishOption, NoSaveCTIWhenDisabled, NameMap). Read-only and offline — no Access, no PowerShell, no writes. Accepts 'path' as alias for sourcePath and 'target' as alias for targetPath.",
  lint_form_code:
    "Static-analyze a form/report's .cls code-behind against the parsed .form.txt, returning structured diagnostics. Read-only and offline — no Access, no PowerShell, no writes. Use BEFORE import_modules / import_all to catch: (1) Me.<Control> references whose target does not exist in the .form.txt, (2) Access ListBox .List = ... misuse (use RowSource / AddItem instead), (3) bare Function(...) statements (use Call or assign the result), (4) positional arguments after a named argument (VBA rejects them), (5) accented identifiers in executable positions (round-trip risk), (6) per-control-type property mismatches. Pass destinationRoot OR sourceRoot plus one of formName | moduleNames | nothing (full scan under forms/ + reports/). rules filters the rule set; strict elevates warnings to errors.",
  dysflow_form_add_control:
    "Add one control to a version-controlled .form.txt through the FormIR mutation pipeline. Defaults to dry-run and returns mutated source; apply:true writes the source file and then requires the import_modules LoadFromText gate to pass before reporting success. Write-gated.",
  dysflow_form_move_control:
    "Move one existing .form.txt control by updating Left and/or Top only. Defaults to dry-run and preserves control identity, event bindings, and opaque metadata; apply:true writes the source and validates through import_modules/LoadFromText. Write-gated.",
  dysflow_form_rename_control:
    "Rename one existing .form.txt control while preserving its type, properties, event bindings, and opaque metadata. Defaults to dry-run; apply:true writes the source and validates through import_modules/LoadFromText before success. Write-gated.",
  vba_orphan_audit:
    "Audit the project for orphaned/temporary modules (e.g. leftover _inline_* modules) so they can be cleaned up. Read-only.",
  vba_inline_execution:
    "Execute an arbitrary VBA snippet inline (no module needed) and return its result, headless. Powerful and unsandboxed: the snippet must be a single procedure body (no End Sub), is capped at 1024 chars, and runs under a 30s timeout ceiling. Write-gated. For repeatable logic add a module and use run_vba.",
  // Query — read
  query_sql:
    "Run a read-only SQL SELECT against the database and return rows. Pass the statement as sql (or query). Read-only.",
  list_tables:
    "List the database's tables (names only). Read-only — use get_schema for a table's columns.",
  list_linked_tables:
    "List tables linked into the frontend from a backend, with their connection sources. Read-only.",
  get_schema: "Return the column schema (names, types, sizes, keys) of a table. Read-only.",
  count_rows: "Count rows in a table or for a SQL/query predicate. Read-only.",
  distinct_values:
    "Return the distinct values of a column (by tableName+columnName, or via a SQL/query). Read-only.",
  compare_backends:
    "Compare two backend databases (the configured backend vs comparePath) and report schema/data differences. Read-only.",
  list_access_files:
    "List Access database files under a root/directory path. Read-only filesystem scan.",
  get_relationships: "Return the database's defined relationships (foreign keys). Read-only.",
  list_links: "List the frontend's linked-table connections. Read-only.",
  // Query — write & maintenance
  exec_sql:
    "Execute a guarded SQL write (INSERT/UPDATE/DELETE/DDL). Write-gated; dryRun/apply control plan vs commit; allowTables/denyTables constrain which tables may be touched.",
  run_script:
    "Execute a guarded multi-statement Access SQL script from scriptPath/path. Write-gated; dryRun/apply and allow/deny table guards apply.",
  create_table:
    "Create a table from a definition/fields list. Write-gated; dryRun/apply control plan vs commit.",
  drop_table: "Drop a table (DESTRUCTIVE). Write-gated; dryRun/apply control plan vs commit.",
  seed_fixture:
    "Insert fixture rows into a table for testing. Write-gated; dryRun/apply and allow/deny table guards apply.",
  teardown_fixture:
    "Remove fixture rows/data from a table. Write-gated; dryRun/apply and allow/deny table guards apply.",
  link_tables:
    "Link tables from backendPath into the frontend. Write-gated; dryRun:true plans without writing. NOTE: when backendPassword is set, Access stores the credential inside the linked-table Connect string in the .accdb.",
  relink_tables:
    "Re-point existing linked tables to a new/updated backendPath. Write-gated; dryRun:true plans without writing. NOTE: a set backendPassword is persisted in the linked-table Connect string.",
  localize_backend_links:
    "Rewrite backend links to a local copy of the backend. Write-gated; dryRun:true plans without writing.",
  unlink_table:
    "Remove a linked table from the frontend (does not drop backend data). Write-gated; dryRun:true plans without writing.",
  export_queries:
    "Export saved queries (QueryDefs) from the database to exportPath/path. Read-only on the binary.",
  import_queries:
    "Import saved query definitions (queryDefinitions/queries) into the database. Write-gated; dryRun:true plans without writing.",
  compact_repair:
    "Compact and repair the database (maintenance; mutates the file). Write-gated; backupFirst:true backs up before, dryRun/apply control plan vs commit.",
  relink_directory:
    "Batch-relink Access frontends under a root directory to local backends, with alias maps and verification. Large surface (maps/denyPrefixes/strictLocal/removeUnresolved/recursive); write-gated; dryRun/apply control plan vs commit. Prefer passwordEnv over a raw password argument.",
};

export const TOOL_PARITY_REGISTRY: readonly ParityToolDefinition[] = DYSFLOW_MCP_TOOL_NAMES.map(
  (name) => {
    const slice = classifyToolName(name);
    const status = implementedToolNames.has(name) ? "implemented" : "pending";
    return {
      name,
      slice,
      status,
      description: TOOL_DESCRIPTIONS[name] ?? buildDescription(name, slice, status),
    };
  },
);

const TOOL_MAP = new Map<DysflowMcpToolName, ParityToolDefinition>(
  TOOL_PARITY_REGISTRY.map((tool) => [tool.name, tool]),
);

export function getToolDefinition(name: DysflowMcpToolName): ParityToolDefinition {
  const entry = TOOL_MAP.get(name);
  if (entry === undefined) {
    throw new Error(`Unknown MCP tool: ${name}`);
  }
  return entry;
}

export function getToolDefinitionsBySlice(slice: ParitySlice): readonly DysflowMcpToolName[] {
  return TOOL_PARITY_REGISTRY.filter((tool) => tool.slice === slice).map((tool) => tool.name);
}

/**
 * Returns the set of tool names whose status is "pending" in the parity registry.
 * This is the single source of truth for which tools are hidden stubs — derived
 * from the registry rather than maintained as a separate hand-authored literal.
 * Exported for contract testing (closes #433).
 */
export function pendingToolNames(): ReadonlySet<DysflowMcpToolName> {
  return new Set(
    TOOL_PARITY_REGISTRY.filter((tool) => tool.status === "pending").map((tool) => tool.name),
  );
}

/**
 * Returns true when the named tool is a hidden stub (status "pending" in the
 * parity registry). Use this instead of the removed HIDDEN_STUB_TOOL_NAMES set.
 */
export function isHiddenStubTool(name: DysflowMcpToolName): boolean {
  return getToolDefinition(name).status === "pending";
}
