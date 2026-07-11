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
  "list_vba_modules",
  "exists",
  "test_vba",
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
  "form_add_control",
  "form_move_control",
  "form_rename_control",
  "form_serialize",
  "form_deserialize",
  "create_form_from_template",
  "analyze_form_ui",
  "map_form_behavior",
  "generate_form_design_plan",
  "apply_form_design_plan",
  "copy_form_ui_pattern",
  "verify_form_ui",
  // Phase 6 (#813) — atomic exposure of the form mutation family.
  "form_set_property",
  "form_delete_control",
  // Phase 3 (#816) — batch geometry ergonomics. Align + distribute verbs.
  "form_align_controls",
  "form_distribute_controls",
  // Phase 2 — Perception (#814). Read-only geometric renderer.
  "render_form_preview",
  // Phase 2 — Perception (#815). Read-only geometry lint.
  "analyze_form_layout",
  // Issue #817 — before/after visual diff composer.
  "diff_form_preview",
  // Issue #818 — schema-binding validator.
  "verify_form_bindings",
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
    "Export specific VBA modules from the Access binary to the on-disk source tree. Scope with moduleNames (exact) or filter (substring). Read-only on the binary. destinationRoot is honored only when accessPath is also passed; otherwise the project source root is used. For a full mirror use export_all. Set verbose:true to detect silent truncation/encoding-loss — the response includes per-module {source, destination, line-count + sha256} and a truncated flag.",
  export_all:
    "By default this WRITES to disk: it mirrors ALL VBA modules from the binary to the source tree, OVERWRITING on-disk source. Pass diff:true is REJECTED at the dispatch seam with DIFF_MODE_REQUIRES_VERIFY_CODE (#802): the adapter does not honor diff mode, so callers must use verify_code({ strict, moduleNames }) for a real read-only compare instead. prune:true DELETES orphaned managed source files (.bas/.cls/.form.txt/.report.txt) absent from the binary; prune is rejected together with filter. Read-only on the binary. Set verbose:true to detect silent truncation/encoding-loss — the response includes per-module {source, destination, line-count + sha256} and a truncated flag.",
  import_modules:
    "Import specific source modules INTO the Access binary (mutates the binary; write-gated). USE THIS whenever you know the exact list of modules you want to import — accepts long lists (20-30+ modules, no hard cap) and emits a STRUCTURED PER-MODULE REPORT so callers can pinpoint which entry failed and why. Each module entry carries {module, status, phase (locate-source|remove-existing|import), error:{code, message, machine, user}, durationMs}. importMode controls merge vs replace. Mutations persist via save-only (acCmdSaveAllModules = RunCommand 280); the runtime does NOT compile — the human compiles in Access (Debug > Compile) before re-running tests. dryRun:true returns a plan without writing. Set verbose:true to detect silent truncation/encoding-loss (issue #752) — when a pre-existing module's CountOfLines caps AddFromFile the per-module entry carries verbose:{source:{bytes,lines,sha256}, destination:{bytes,lines,sha256}, truncated, mismatchReason}. An empty moduleNames array is treated as an explicit no-op plan (NOT a silent fallback to import-all). When Access holds an exclusive lock on the .accdb, the per-module error.code surfaces ACCESS_DATABASE_LOCKED with machine/user when parseable. Defensive validations (issue #752) surface as typed error.code values: VB_NAME_MISMATCH, DUPLICATE_OPTION_DIRECTIVE, IMPORT_TRUNCATED.",
  import_all:
    "Import the entire source tree into the Access binary (mutates the binary; write-gated). RESERVED for whole-project resync (initial setup, disaster recovery, post-fork reconciliation). NOT a fallback for import_modules — if you have an explicit list of modules, use import_modules with moduleNames; if you pass moduleNames: [] to import_modules, it is a no-op plan, it does NOT expand to this tool. Mutations persist via save-only (acCmdSaveAllModules = RunCommand 280); the runtime does NOT compile. Supports dryRun:true (plan mode). Set verbose:true to detect silent truncation/encoding-loss (issue #752) — same per-module verbose field as import_modules.",
  list_objects:
    "List the VBA project's modules, classes, forms and reports, optionally filtered by name. Read-only.",
  // Issue #807 (Feature 1) — list_vba_modules. Walks VBProject.VBComponents once
  // (COM-safe: every component is FinalReleaseComObject'd in `finally`), pairs
  // each row with its on-disk counterpart, and reports
  // {modules[], summary: {total, inBinaryOnly, inSourceOnly, inBoth}}. typeFilter
  // narrows to standard|class|form|report|document; namePattern accepts a single
  // '*' wildcard on either end (Test_* == starts-with Test_; *Issue* == substring).
  // Read-only; never opens Access for the source-side cross-reference.
  list_vba_modules:
    "Enumerate the VBA project's components with a binary<->source cross-reference. Returns {modules:[{name, type, fileType, sourcePath, binaryPath, sourceExists, binaryExists, contentMatch?}], summary:{total, inBinaryOnly, inSourceOnly, inBoth}}. typeFilter narrows to standard|class|form|report|document. namePattern accepts a glob with a single '*' wildcard on either end (e.g. 'Test_*' or '*Issue*'). Read-only; the runner walks VBComponents once and releases every COM reference.",
  exists: "Check whether a named module/object exists in the VBA project. Read-only.",
  // VBA sync — execution & test
  run_vba:
    "Execute one PUBLIC VBA procedure by name and return its result. Pass arguments via argsJson — a JSON array of scalars only (string/number/boolean/null). Requires a compiled project: import first, then the human compiles in Access (Debug > Compile), then run run_vba. The dysflow runtime does NOT compile. Subject to the allowedProcedures allowlist when configured. PR1a (#621 F1): the adapter defaults to deny when no allowlist is configured — pass dryRun:true in the request body to use the explicit escape hatch. Headless.",
  test_vba:
    "Run VBA test procedures and report pass/fail per atom — the project's green gate. Select tests with proceduresJson (explicit list), filter (name substring) or testsPath. Requires a compiled project: import first, then the human compiles in Access (Debug > Compile), then run test_vba. The dysflow runtime does NOT compile; consumers compile in Access. PR1b (#621 F1): the in-adapter allowlist gate is implemented in VbaExecutionAdapter.executeTestVba (default-deny when no allowlist is configured, with dryRun:true as the escape hatch).",
  // feat-759-no-compile (v1.19.0) — compile_vba tool description removed.
  // Compile no longer lives in the dysflow runtime; the human compiles in
  // Access (Debug > Compile).
  verify_code:
    "Compare the on-disk source against the VBA source exported live from the binary. Read-only and dry-run. moduleNames is a true focused export request (Access exports only requested modules, then the compare is filtered to the same modules). USE BEFORE AND AFTER import_modules / import_all to confirm Unicode characters round-trip cleanly (no mojibake drift) and that the per-module result matches the binary. Act on actionableDifferent / recommendedAction, NOT raw different[] (most diffs are non-functional export noise). Timeout failures are phase-aware: export stalls return VBA_MANAGER_TIMEOUT; preflight and compare stalls return VERIFY_CODE_PHASE_TIMEOUT with details.phase, details.moduleName/details.moduleNames, details.operationTimeoutMs and details.phaseTimeoutMs. Export-phase errors also carry details.durationMs; if post-timeout Access orphan cleanup exceeds its own bound, details.cleanupTimedOut:true and details.cleanupTimeoutMs are set on the parent error. Folding is string-aware. strict:true does a byte-exact compare; diff:true adds per-module snippets. Round 5 / PR5 (v2.4.0, semantic mode only): the response now also carries `summaryStructured` (nested actionable / nonActionable counts with totals), per-entry `classification` + `reason` on `nonActionableDifferent[*]`, and `bulkImportable` / `bulkExportable` + their `_count` siblings; `bulkImportable` is a pre-sorted, deduped drop-in for `import_modules({ moduleNames: bulkImportable })` (and `bulkExportable` for `export_modules`), with `bothChanged` modules excluded from both — pass them straight in, no client-side filter needed.",
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
  form_add_control:
    "Add one control to a version-controlled .form.txt through the FormIR mutation pipeline. Defaults to dry-run and returns mutated source; apply:true writes the source file and then requires the import_modules LoadFromText gate to pass before reporting success. Write-gated.",
  form_move_control:
    "Move one existing .form.txt control by updating Left and/or Top only. Defaults to dry-run and preserves control identity, event bindings, and opaque metadata; apply:true writes the source and validates through import_modules/LoadFromText. Write-gated.",
  form_rename_control:
    "Rename one existing .form.txt control while preserving its type, properties, event bindings, and opaque metadata. Defaults to dry-run; apply:true writes the source and validates through import_modules/LoadFromText before success. Write-gated.",
  form_serialize:
    "Read-only round-trip serializer: parse the .form.txt at sourcePath, run it through parseFormTxt -> serializeFormTxt, and return the resulting text with byteEqual + metadataReport (preservedKeys, byteDiff, opaqueCount). Use it to verify that a form has round-trip-safe serialization before any mutation or clone attempt. Default read-only (dry-run), no writes; apply:true is ignored on this tool.",
  form_deserialize:
    "Write a FormIR to sourcePath after re-serializing it, then invoke the import_modules LoadFromText gate. Defaults to dry-run (no write, no import). apply:true writes the .form.txt and requires the LoadFromText gate to pass; if the gate fails the original source is restored best-effort. Write-gated.",
  // slice 5 (issue #618) — clone a form from a template by applying a caller-supplied
  // `{{Token}}` token map; resolve source/target via bench-cache first then projectRoot;
  // default dry-run, apply:true routes through the LoadFromText gate and restores the
  // original target on gate failure. Write-gated.
  create_form_from_template:
    "Clone a source .form.txt into a new target form by applying a {{Token}} token map (e.g. {{FormName}} -> Form_FormNuevaAuditoria). The adapter resolves sourceForm/targetForm bench-cache first, projectRoot second, and appends the .form.txt extension automatically. Default dry-run returns the post-replacement preview plus the applied/missing token summary without writing or importing; apply:true writes the target and routes through the import_modules LoadFromText gate, restoring the original target best-effort when the gate rejects. Token replacement walks scalar FormIR strings and non-preserved blob lines; PRESERVED_METADATA_KEYS (Checksum / PrtDevMode* / Format) are skipped so PrtDevMode round-trips unchanged. Use overwrite:true to replace an existing target. missingTokenPolicy:'warn-pass-through' (default) leaves missing tokens in place with a warning; strictMissingTokens:true (alias of missingTokenPolicy:'strict') fails with FORM_MUTATION_INVALID. Write-gated.",
  analyze_form_ui:
    "Analyze a version-controlled .form.txt through FormIR and return semantic controls, roles, form events, bindings, and warnings. Read-only and offline; screenshots are not a source of truth.",
  // Issue #830 — `autoFetchCodeGraph` opt-in flag relaxes the no-MCP-to-MCP
  // boundary for this tool only (dysflow → codegraph-vba, one-way). When
  // the caller passes `autoFetchCodeGraph: true` AND `codegraphEvidence` is
  // absent, the adapter invokes codegraph-vba internally and merges the
  // result. Graceful fallback on any failure (no `.codegraph/` index,
  // CLI missing, parse error): the `.form.txt`-declared events are still
  // surfaced, and a warning is appended.
  map_form_behavior:
    "Build a behavior map for a form by merging FormIR semantic analysis with caller-supplied CodeGraph-VBA evidence payloads. Read-only. Pass autoFetchCodeGraph:true to relax the no-MCP-to-MCP boundary and have dysflow invoke codegraph-vba internally (one-way: dysflow → codegraph-vba) and merge the result with any caller-supplied evidence. Graceful fallback: if the internal lookup fails (no .codegraph/ index, codegraph-vba CLI missing, parse error), the .form.txt-declared events are surfaced alone and a warning is appended; never throws. Default (autoFetchCodeGraph unset/false) preserves the original caller-supplied evidence contract exactly.",
  generate_form_design_plan:
    "Generate an explicit AI form UI design plan from a behavior map and requested operations. Read-only; operations outside the mapped contract are rejected with warnings.",
  apply_form_design_plan:
    "Apply or preview an AI form UI design plan against a version-controlled .form.txt through the applyGuardedFormWrite seam (single accumulated write, single import_modules LoadFromText gate, single rollback on import failure). Defaults to dry-run and returns the would-be-written source plus advisories without writing; apply:true writes the source and requires the LoadFromText gate to pass. Source path resolved out-of-band via sourcePath/path (mirrors form_add_control). plan.formName is non-empty-checked and matched case-insensitively against the parsed form name; mismatch returns FORM_UI_PLAN_FORM_MISMATCH with no write. note operations are counted as advisories, never silently dropped; unknown kinds fail closed with FORM_UI_UNSUPPORTED_OPERATION. Write-gated.",
  copy_form_ui_pattern:
    "Copy a reference form UI pattern as traceable design intent without erasing the target behavior map. Read-only contract preview.",
  form_set_property:
    "Set one named layout/property entry on a control in a version-controlled .form.txt through the FormIR setProperty primitive. Refuses to mutate protected/metadata keys (Checksum, PrtDevMode*, Format) and refuses to change a control's Name (identity changes belong to form_rename_control). When the existing entry for the target property is blob-kind (e.g. PrtMip, PrtDevNamesW, FormatConditions), the primitive refuses with FORM_PROPERTY_NOT_SCALAR rather than pushing a duplicate scalar entry. Defaults to dry-run; apply:true writes the source and validates through the import_modules LoadFromText gate. Never touches codeBehind (the sibling .cls owns code-behind). Write-gated.",
  form_delete_control:
    "Delete one named control from a version-controlled .form.txt through the FormIR deleteControl primitive. Fail-closed when the control (or any descendant) has an [Event Procedure] binding (FORM_CONTROL_HAS_EVENT_BINDING — handlers live in the sibling .cls) or when it has named child controls (FORM_CONTROL_HAS_CHILDREN — delete children first). This primitive protects ONLY property-sheet-declared event bindings visible to FormIR — it does not detect code-only references such as WithEvents in the .cls or Me!ControlName. Defaults to dry-run; apply:true writes the source and validates through the import_modules LoadFromText gate. Destructive — Write-gated.",
  // Issue #816 — Phase 3 (Ergonomic actions). Pure batch geometry verb
  // over the FormIR. Aligns N named controls to a common edge
  // (left/right/top/bottom/center-horizontal/center-vertical) using the
  // MEDIAN of the selection (preserves the spread of off-median
  // outliers; not min/max). Identity-preserving: only the moved axis
  // property (`Left` for horizontal verbs; `Top` for vertical verbs)
  // changes; Name, type, Width, Height, other layout properties, event
  // bindings, and codeBehind are untouched. Refuses unknown control
  // names (FORM_CONTROL_NOT_FOUND) and missing geometry
  // (FORM_MUTATION_INVALID). Never touches codeBehind (the sibling .cls
  // owns code-behind). Routes through the applyGuardedFormWrite seam —
  // defaults to dry-run; apply:true writes the source and validates
  // through the import_modules LoadFromText gate. Write-gated.
  form_align_controls:
    "Align N named controls in a version-controlled .form.txt to a common edge (left | right | top | bottom | center-horizontal | center-vertical) using the MEDIAN of the selection (preserves the spread of off-median outliers; not min/max). Only the moved axis property (`Left` for horizontal verbs; `Top` for vertical verbs) changes — Name, type, Width, Height, other layout properties, event bindings, and codeBehind are preserved verbatim. Refuses unknown control names (FORM_CONTROL_NOT_FOUND) and missing geometry (FORM_MUTATION_INVALID). Never touches codeBehind (the sibling .cls owns code-behind). Routes through the applyGuardedFormWrite seam — defaults to dry-run; apply:true writes the source and validates through the import_modules LoadFromText gate. Write-gated.",
  // Issue #816 — Phase 3 (Ergonomic actions). Pure batch geometry verb
  // over the FormIR. Distributes N named controls evenly along an axis
  // (horizontal → moves Left; vertical → moves Top). Without `spacing`,
  // distributes across the bounding box of the selection (first control
  // stays at start, last at end, middle ones spaced evenly). With
  // `spacing` (twips) provided, uses the exact gap between consecutive
  // control edges. Identity-preserving: only the moved axis property
  // changes; everything else is untouched. Refuses <2 controls
  // (FORM_MUTATION_INVALID — the issue acceptance criterion), unknown
  // control names (FORM_CONTROL_NOT_FOUND), and missing geometry
  // (FORM_MUTATION_INVALID). Never touches codeBehind. Routes through
  // the applyGuardedFormWrite seam — defaults to dry-run; apply:true
  // writes the source and validates through the import_modules
  // LoadFromText gate. Write-gated.
  form_distribute_controls:
    "Distribute N named controls in a version-controlled .form.txt evenly along an axis (horizontal | vertical). Without `spacing`, distributes across the bounding box of the selection (first control stays at start, last at end, middle ones spaced evenly). With `spacing` (twips) provided, uses the exact gap between consecutive control edges. Only the moved axis property (`Left` for horizontal; `Top` for vertical) changes — Name, type, Width, Height, other layout properties, event bindings, and codeBehind are preserved verbatim. Refuses <2 controls (FORM_MUTATION_INVALID — issue acceptance criterion), unknown control names (FORM_CONTROL_NOT_FOUND), and missing geometry (FORM_MUTATION_INVALID). Never touches codeBehind. Routes through the applyGuardedFormWrite seam — defaults to dry-run; apply:true writes the source and validates through the import_modules LoadFromText gate. Write-gated.",
  verify_form_ui:
    "Verify an applied form UI contract against the source behavior map and report actionable drift for missing controls, handlers, or bindings. Read-only.",
  // Issue #814 — pure, deterministic, read-only. The renderer is the
  // single source of truth both #817 (diff_form_preview) and the agent
  // composition layer rely on. The byte-stable contract is documented in
  // the form-ui-render.ts module header.
  render_form_preview:
    "Compute a geometric layout from a .form.txt and emit a deterministic, inspectable artifact — SVG (primary, browser-friendly) and ASCII (terminal/agent fallback). Pure and offline: the renderer walks the FormIR tree, resolves each control's twip rectangle, and emits a labeled, role-colored layout. The output shape `{ svg, ascii, viewport, warnings }` is the single primitive #817 (`diff_form_preview`) composes pairs of frames from. Read-only — no Access, no COM, no filesystem mutation. The agent can pipe the SVG payload to a browser, render the ASCII grid inline in a terminal, or open the .form.txt in Access for ground truth.",
  // Issue #815 — pure read-class geometry lint over a single .form.txt.
  // Reuses the shared primitives in form-ui-geometry.ts (parseBoundingBox,
  // boxesOverlap, isWithinSection, visualOrder, tabOrderMatchesVisual) —
  // no duplicated bounding-box math. Findings carry severity `warning`
  // (informational; never gating). The result envelope `{ findings,
  // controls, sections }` is non-blocking and the agent decides what to
  // act on. Default `alignmentThresholdTwips` is 50; pass a custom value
  // to tighten or loosen the alignment net. Pass `sectionBounds` +
  // `controlSection` to enable the off-section check. Pure and offline.
  analyze_form_layout:
    "Run a geometry lint over a single .form.txt and report overlap, alignment (visual rows), off-section, tab-order vs visual order, and missing-geometry smells. Pure read-class — parses the .form.txt through FormIR, builds a behavior map, and delegates to the pure `lintFormLayout` core service. No Access, no COM, no filesystem mutation. Returns `{ findings, controls, sections }` where every finding carries severity `warning` (informational; never gating). The default `alignmentThresholdTwips` is 50; pass a smaller value to tighten the alignment net. Supply `sectionBounds` + `controlSection` together to enable the off-section check. Source path resolved via the #718 project-aware resolver (sourcePath/path or projectId+formName).",
  // Issue #817 — before/after visual diff composer. Reads two
  // .form.txt files (beforePath/afterPath or projectId+beforeName/afterName),
  // parses both through FormIR, and emits a structured `{changes: {added,
  // removed, moved, resized}, warnings}` report with diff overlays on the
  // SVG (data-diff='added|removed|moved|resized|same' on each control rect)
  // and ASCII (per-control legend + in-grid markers). `output` selects
  // which frame(s) to surface; the structured envelope is always returned.
  // `epsilon` (twips) loosens the moved/resized classifier. Read-only and
  // offline — pure renderer, no Access, no COM, no filesystem mutation.
  diff_form_preview:
    "Compose a before/after visual diff of two .form.txt files. Reads both via the fileSystem port, parses both through FormIR, and delegates to the pure `diffFormPreview` core service. Returns `{ changes: { added, removed, moved, resized }, warnings, beforeForm, afterForm, svg?, ascii? }` where every entry of `added`/`removed` carries a `box` BoundingBox and every entry of `moved`/`resized` carries `before` + `after` BoundingBoxes. The SVG frame is the same `render_form_preview` artifact with `data-diff='added|removed|moved|resized|same'` on every control rect and a `<g data-section='removed'>` group of dashed-stroke ghost rects for removed controls. The ASCII frame carries a diff-marker legend (`+`, `-`, `*`) plus per-cell annotations. `output` selects the payload (`svg` | `ascii` | `both`); the structured envelope is always returned. `epsilon` (twips) loosens the moved/resized classifier. Read-only and offline — no Access, no COM, no filesystem mutation. Accepts `before`/`after` as aliases for `beforePath`/`afterPath` and `beforeName`/`afterName` for projectId-based resolution.",
  // Issue #818 — Phase 2 Perception. Pure read-class binding validator.
  // Validates a form's ControlSource + RowSource against a caller-supplied
  // schema aggregate (typically pre-aggregated upstream from dysflow
  // `get_schema` MCP calls; the adapter itself never fetches the schema).
  // Returns `{ formName, controls, findings[] }` where each finding
  // carries a typed `code` (`FORM_BINDING_MISSING_TABLE`,
  // `FORM_BINDING_MISSING_COLUMN`, `FORM_BINDING_EMPTY`,
  // `FORM_BINDING_SQL_UNPARSEABLE`, `FORM_BINDING_TYPE_MISMATCH`),
  // `severity:"warning"` (informational; never gating), `controlName`,
  // and structured `data`. Accepts the schema aggregate
  // `Record<tableName, ColumnSchema[]>` AND a single-table `get_schema`
  // payload `{schema:[...], tableName:"..."}` — the adapter wraps the
  // latter into the former. Read-only and offline — no Access, no COM,
  // no filesystem mutation, no schema fetch.
  verify_form_bindings:
    'Validate a .form.txt\'s ControlSource + RowSource bindings against a caller-supplied schema aggregate. Reads the .form.txt through the fileSystem port, parses to FormIR, and delegates to the pure `validateBindings` core service. Returns `{ formName, controls, findings[] }` where every finding carries `code` (typed: `FORM_BINDING_MISSING_TABLE` / `FORM_BINDING_MISSING_COLUMN` / `FORM_BINDING_EMPTY` / `FORM_BINDING_SQL_UNPARSEABLE` / `FORM_BINDING_TYPE_MISMATCH`), `severity:"warning"` (informational; never gating), `controlName`, and structured `data` (table, column, binding). The `schema` parameter accepts either a multi-table `Record<tableName, ColumnSchema[]>` aggregate (fan out one `get_schema` per table upstream) or a single-table `get_schema` payload `{schema:[{name,type,nullable}], tableName:"..."}` — the adapter normalizes both. The adapter itself never fetches the schema; the caller owns the upstream `get_schema` calls. Pure read-class — no Access, no COM, no filesystem mutation. Path resolution mirrors the other Phase 2 tools (sourcePath/path or projectId+formName).',
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
  get_schema:
    'Return the column schema (names, types, sizes, keys) of a table. Read-only. When `projectId` and `target` (`"frontend"` | `"backend"`) are passed together, Dysflow resolves `target` to the configured `accessPath` / `backendPath` from `.dysflow/project.json` so callers do not have to know the local file paths; explicit `accessPath`/`backendPath`/`databasePath` still win when provided.',
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
