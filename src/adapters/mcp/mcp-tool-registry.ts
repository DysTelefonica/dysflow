export const VBA_SYNC_TOOL_NAMES = [
  "list_access_operations",
  "cleanup_access_operation",
  "export_modules",
  "export_all",
  "import_modules",
  "import_all",
  "list_objects",
  "exists",
  "run_vba",
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
