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
] as const;

export type ModernDysflowMcpToolName = (typeof MODERN_TOOL_NAMES)[number];
