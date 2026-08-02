export const MCP_E2E_TOOL_ALIASES: Readonly<{
  dysflow_resolve_project_no_dysflow_field_guidance: "resolve_project";
  get_capabilities_status_missing_semantics: "get_capabilities";
  discovered_projects_isolation: "get_capabilities";
  project_config_not_write_ready_has_remediation: "import_modules";
  "list_access_files:remediation-actionable": "describe_tool";
  "response-schema-version-discriminator": "get_capabilities";
}>;

export function resolveMcpE2eToolName(label: string): string;
