export const MCP_E2E_TOOL_ALIASES = Object.freeze({
  dysflow_resolve_project_no_dysflow_field_guidance: "resolve_project",
  get_capabilities_status_missing_semantics: "get_capabilities",
  discovered_projects_isolation: "get_capabilities",
  project_config_not_write_ready_has_remediation: "import_modules",
  "list_access_files:remediation-actionable": "describe_tool",
  "access_force_cleanup_orphaned:complete-enumeration": "access_force_cleanup_orphaned",
  "state:orphans-msaccess-accurate": "state",
  "logs:orphans-msaccess-recent": "logs",
  "data-schema-coverage": "schema",
  "effective-dry-run-default-coherence": "get_capabilities",
});

export function resolveMcpE2eToolName(label) {
  return MCP_E2E_TOOL_ALIASES[label] ?? label.split(":", 1)[0];
}
