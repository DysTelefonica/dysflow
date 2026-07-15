export const VBA_SYNC_TOOL_NAMES = [
  "list_access_operations",
  "cleanup_access_operation",
  "export_modules",
  "export_all",
  "import_modules",
  "import_all",
  "list_objects",
  "list_vba_modules",
  "exists",
  "run_vba",
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
  // Phase 6 (#813) — atomic exposure of two net-new standalone tools
  // sharing the apply_form_design_plan guarded-write seam. They are
  // registered here BEFORE MCP_TOOL_ROUTES so the GeneratedDispatchToolName
  // type picks them up and the route table can reference them.
  "form_set_property",
  "form_delete_control",
  // Issue #872 — four net-new tools surface the form-UX frictions that
  // real-world reorganisations hit. F1 + F2 join the applyGuardedFormWrite
  // seam (write-gated, mutatesBinary:true, mutatesFilesystem:true);
  // F5 is pure read-only (mutatesBinary:false, mutatesFilesystem:false).
  //   F1 `form_set_properties` — atomic batch property updates against a
  //     single control. Collapses N `form_set_property` calls into one IR
  //     mutation. LayoutCached* keys are silently stripped (F3).
  //   F2 `form_duplicate_control` — clone an existing control under a
  //     new name, with optional property overrides and target section.
  //     Event bindings carry over verbatim — the duplicated control is
  //     pre-wired with the source's behaviour.
  //   F5 `form_get_geometry` — read-only geometry helper for one control.
  //   F5 `form_list_controls` — read-only flat inventory with the
  //     hasEventBinding bit per control.
  // The four names are registered here BEFORE MCP_TOOL_ROUTES so the
  // GeneratedDispatchToolName type picks them up and the route table can
  // reference them. vba-sync 45 -> 47 (F1, F2) + 49 (F5); total 69 -> 73.
  "form_set_properties",
  "form_duplicate_control",
  "form_get_geometry",
  "form_list_controls",
  // Phase 3 (#816) — batch geometry ergonomics. Two net-new write-class
  // tools (form_align_controls + form_distribute_controls) sharing the
  // same applyGuardedFormWrite seam as the Phase 6 form mutation family.
  // Registered here BEFORE MCP_TOOL_ROUTES so the route table can
  // reference them and the cascade tool count steps from 40 to 42 (vba
  // sync slice) — and 75 to 77 advertised tools.
  "form_align_controls",
  "form_distribute_controls",
  // Phase 2 — Perception (#814). Geometric SVG/ASCII render of a
  // .form.txt. Read-only (the renderer is pure and offline; it never
  // opens Access or touches the filesystem). Registered here so the
  // route table can reference it.
  "render_form_preview",
  // Phase 2 — Perception (#815). Geometry lint over a single .form.txt:
  // overlap, alignment, off-section, tab-order vs visual order. Pure
  // read-class; never opens Access. Registered here so the route table
  // can reference it.
  "analyze_form_layout",
  // Issue #817 — before/after visual diff composer. Reads two
  // .form.txt files and composes a structured `{added, removed, moved,
  // resized}` change report with diff overlays on the SVG/ASCII frames.
  // Pure read-class; never opens Access. Registered here so the route
  // table can reference it. vba-sync 42 -> 43, total 66 -> 67.
  "diff_form_preview",
  // Issue #818 — ControlSource / RowSource schema validator. Reads a
  // .form.txt and validates every binding against a caller-supplied
  // `Record<tableName, ColumnSchema[]>` aggregate (typically pre-aggregated
  // from dysflow `get_schema` MCP calls). Pure read-class; never opens
  // Access; the schema is passed in as a parameter. vba-sync 43 -> 44,
  // total 67 -> 68.
  "verify_form_bindings",
  // Issue #809 — sync_binary workflow tool. Composes the three
  // existing primitives (verify_code + import_modules + export_modules)
  // into a single round-trip: verify -> plan -> execute -> re-verify
  // -> recommend. The tool is write-class (mutatesBinary + mutatesFilesystem
  // both true because apply:true can write either side) and dryRun-capable
  // (the dispatch consults resolveIsDryRun instead of collapsing to false).
  // vba-sync 44 -> 45, total 68 -> 69. Advertised 79 -> 80.
  "sync_binary",
  "vba_orphan_audit",
  "vba_inline_execution",
] as const;

export const QUERY_TOOL_NAMES = [
  "query_sql",
  "list_tables",
  "list_linked_tables",
  "get_schema",
  "count_rows",
  "distinct_values",
  "compare_backends",
  "list_access_files",
  "exec_sql",
  "run_script",
  "create_table",
  "drop_table",
  "seed_fixture",
  "teardown_fixture",
  "list_links",
  "link_tables",
  "relink_tables",
  "localize_backend_links",
  "unlink_table",
  "export_queries",
  "import_queries",
  "get_relationships",
  "compact_repair",
  "relink_directory",
] as const;

export const DYSFLOW_MCP_TOOL_NAMES = [...VBA_SYNC_TOOL_NAMES, ...QUERY_TOOL_NAMES] as const;

export type DysflowMcpToolName = (typeof DYSFLOW_MCP_TOOL_NAMES)[number];
export type VbaSyncToolName = (typeof VBA_SYNC_TOOL_NAMES)[number];
export type QueryToolName = (typeof QUERY_TOOL_NAMES)[number];
