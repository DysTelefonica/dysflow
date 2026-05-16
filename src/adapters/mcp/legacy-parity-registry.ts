import {
  LEGACY_DYSFLOW_MCP_TOOL_NAMES,
  LEGACY_QUERY_TOOL_NAMES,
  LEGACY_VBA_SYNC_TOOL_NAMES,
  type LegacyDysflowMcpToolName,
} from "./legacy-tool-inventory.js";

export type LegacyParitySlice = "vba-sync" | "query";
export type LegacyParityStatus = "implemented" | "pending";

export type LegacyParityToolDefinition = {
  name: LegacyDysflowMcpToolName;
  slice: LegacyParitySlice;
  status: LegacyParityStatus;
  description: string;
};

const implementedToolNames = new Set<LegacyDysflowMcpToolName>([
  "list_access_operations",
  "cleanup_access_operation",
  "run_vba",
  "query_sql",
  "list_tables",
  "list_linked_tables",
  "get_schema",
  "count_rows",
  "distinct_values",
  "compare_backends",
  "list_access_files",
  "get_relationships",
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
  "compact_repair",
  "validate_form_spec",
  "generate_form",
  "catalog_add_control",
  "harvest_form_catalog",
]);

function buildDescription(name: LegacyDysflowMcpToolName, slice: LegacyParitySlice, status: LegacyParityStatus): string {
  const humanSlice = slice === "vba-sync" ? "VBA sync" : "query/schema";
  const suffix = status === "implemented" ? "implemented via Dysflow core services." : "tracked for parity and not ported in this slice.";
  return `Legacy Dysflow MCP tool ${name}; ${humanSlice} ${suffix}`;
}

function classifyToolName(name: LegacyDysflowMcpToolName): LegacyParitySlice {
  return (LEGACY_VBA_SYNC_TOOL_NAMES as readonly string[]).includes(name) ? "vba-sync" : "query";
}

export const LEGACY_PARITY_REGISTRY: readonly LegacyParityToolDefinition[] = LEGACY_DYSFLOW_MCP_TOOL_NAMES.map((name) => {
  const slice = classifyToolName(name);
  const status = implementedToolNames.has(name) ? "implemented" : "pending";
  return {
    name,
    slice,
    status,
    description: buildDescription(name, slice, status),
  };
});

export function getLegacyParityToolDefinition(name: LegacyDysflowMcpToolName): LegacyParityToolDefinition {
  const entry = LEGACY_PARITY_REGISTRY.find((tool) => tool.name === name);
  if (entry === undefined) {
    throw new Error(`Unknown legacy parity tool: ${name}`);
  }
  return entry;
}

export function getLegacyParityToolNamesBySlice(slice: LegacyParitySlice): readonly LegacyDysflowMcpToolName[] {
  return LEGACY_PARITY_REGISTRY.filter((tool) => tool.slice === slice).map((tool) => tool.name);
}
