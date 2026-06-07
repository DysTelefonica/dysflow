import type { AccessQueryAction } from "../../core/mapping/access-query-request-mapper.js";
import type { AliasToolName } from "./alias-tools.js";
import {
  type DysflowMcpToolName,
  QUERY_TOOL_NAMES,
  type QueryToolName,
} from "./mcp-tool-registry.js";

// ─── Route table ──────────────────────────────────────────────────────────────

export type McpToolRoute =
  | { kind: "vba-sync" }
  | { kind: "query-read" }
  | { kind: "query-maintenance"; queryMode: "read" | "write" }
  | { kind: "query-write-fixture" };

export type GeneratedDispatchToolName = Exclude<DysflowMcpToolName, AliasToolName>;

export const MCP_TOOL_ROUTES: Record<GeneratedDispatchToolName, McpToolRoute> = {
  // VBA sync (18)
  export_modules: { kind: "vba-sync" },
  export_all: { kind: "vba-sync" },
  import_modules: { kind: "vba-sync" },
  import_all: { kind: "vba-sync" },
  list_objects: { kind: "vba-sync" },
  exists: { kind: "vba-sync" },
  test_vba: { kind: "vba-sync" },
  compile_vba: { kind: "vba-sync" },
  verify_code: { kind: "vba-sync" },
  verify_binary: { kind: "vba-sync" },
  reconcile_binary: { kind: "vba-sync" },
  delete_module: { kind: "vba-sync" },
  generate_erd: { kind: "vba-sync" },
  fix_encoding: { kind: "vba-sync" },
  validate_form_spec: { kind: "vba-sync" },
  generate_form: { kind: "vba-sync" },
  catalog_add_control: { kind: "vba-sync" },
  harvest_form_catalog: { kind: "vba-sync" },
  // query maintenance (9)
  list_links: { kind: "query-maintenance", queryMode: "read" },
  export_queries: { kind: "query-maintenance", queryMode: "read" },
  link_tables: { kind: "query-maintenance", queryMode: "write" },
  relink_tables: { kind: "query-maintenance", queryMode: "write" },
  localize_backend_links: { kind: "query-maintenance", queryMode: "write" },
  unlink_table: { kind: "query-maintenance", queryMode: "write" },
  import_queries: { kind: "query-maintenance", queryMode: "write" },
  compact_repair: { kind: "query-maintenance", queryMode: "write" },
  relink_directory: { kind: "query-maintenance", queryMode: "write" },
  // query read (8)
  list_tables: { kind: "query-read" },
  list_linked_tables: { kind: "query-read" },
  get_schema: { kind: "query-read" },
  count_rows: { kind: "query-read" },
  distinct_values: { kind: "query-read" },
  compare_backends: { kind: "query-read" },
  list_access_files: { kind: "query-read" },
  get_relationships: { kind: "query-read" },
};

/**
 * Typed binding of MCP query tool names to their domain `AccessQueryRequest`
 * action. This REPLACES the former `name as AccessQueryRequest["action"]` cast:
 * the `Record<QueryToolName, AccessQueryAction>` type makes a missing entry a
 * COMPILE error (every query tool must be listed) and an out-of-union value a
 * COMPILE error (the action must be a valid `AccessQueryRequest["action"]`).
 *
 * The binding is an identity map (tool name === action) but is written
 * explicitly rather than derived, so the type checker — not a runtime cast —
 * guarantees coverage. The companion test mcp-tool-action-map.test.ts asserts
 * coverage against MCP_TOOL_ROUTES at runtime as a second net.
 */
export const MCP_TOOL_QUERY_ACTIONS: Record<QueryToolName, AccessQueryAction> = Object.fromEntries(
  QUERY_TOOL_NAMES.map((name) => [name, name]),
) as Record<QueryToolName, AccessQueryAction>;

export function queryActionFor(name: DysflowMcpToolName): AccessQueryAction {
  const action = MCP_TOOL_QUERY_ACTIONS[name as QueryToolName];
  if (action === undefined) {
    throw new Error(`No AccessQueryRequest action registered for MCP tool: ${name}`);
  }
  return action;
}
