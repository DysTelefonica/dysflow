export const MCP_E2E_TOOL_ALIASES: Readonly<{
  dysflow_resolve_project_no_dysflow_field_guidance: "resolve_project";
  get_capabilities_status_missing_semantics: "get_capabilities";
  discovered_projects_isolation: "get_capabilities";
}>;

export function resolveMcpE2eToolName(label: string): string;
