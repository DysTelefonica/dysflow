/** Bespoke source-analysis tools composed by the MCP tools facade. */
export const MODERN_ANALYSIS_TOOL_NAMES = [
  "list_procedures",
  "get_procedure",
  "find_references",
  "detect_dead_code",
  "validate_manifest",
  "lint_module",
] as const;

/** Canonical modern Dysflow MCP tool names advertised via tools/list. */
export const MODERN_TOOL_NAMES = [
  "query_execute",
  "doctor",
  "access_force_cleanup_orphaned",
  "get_capabilities",
  ...MODERN_ANALYSIS_TOOL_NAMES,
  "resolve_project",
  "schema",
  "describe_tool",
  "diagnose",
  "clean_stale_markers",
  "state",
  "logs",
  // Issue #1312 — zero-friction project bootstrap. Plan by default;
  // apply atomically publishes the candidate project config.
  "setup_project",
  "register_worktree",
  "clear_worktree_cache",
  // Issue #1177 — `migrate_project_config` drives legacy config
  // migrations (absolute accessPath → basename frontendFile,
  // top-level allowWrites → capabilities.allowWrites). Conditional-write
  // because `apply:true` rewrites `.dysflow/project.json`; the
  // default `{}` invocation is a pure read-class diff preview.
  "migrate_project_config",
] as const;

export type ModernDysflowMcpToolName = (typeof MODERN_TOOL_NAMES)[number];
