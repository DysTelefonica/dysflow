import {
  DYSFLOW_MCP_TOOL_NAMES,
  type DysflowMcpToolName,
  VBA_SYNC_TOOL_NAMES,
} from "./mcp-tool-registry.js";

export type ParitySlice = "vba-sync" | "query";
export type ParityStatus = "implemented" | "pending";

export type QueryMode = "read" | "write";

export type ParityToolDefinition = {
  name: DysflowMcpToolName;
  slice: ParitySlice;
  status: ParityStatus;
  description: string;
  queryMode?: QueryMode;
};

const maintenanceQueryModes: Partial<Record<DysflowMcpToolName, QueryMode>> = {
  list_links: "read",
  export_queries: "read",
  link_tables: "write",
  relink_tables: "write",
  localize_backend_links: "write",
  unlink_table: "write",
  import_queries: "write",
  compact_repair: "write",
  relink_directory: "write",
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
  "verify_binary",
  "reconcile_binary",
  "delete_module",
  "generate_erd",
  "fix_encoding",
  "validate_form_spec",
  "generate_form",
  "catalog_add_control",
  "harvest_form_catalog",
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

export const TOOL_PARITY_REGISTRY: readonly ParityToolDefinition[] = DYSFLOW_MCP_TOOL_NAMES.map(
  (name) => {
    const slice = classifyToolName(name);
    const status = implementedToolNames.has(name) ? "implemented" : "pending";
    return {
      name,
      slice,
      status,
      description: buildDescription(name, slice, status),
      queryMode: maintenanceQueryModes[name],
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
