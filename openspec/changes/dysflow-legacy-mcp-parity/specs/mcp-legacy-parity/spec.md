# Delta for MCP Legacy Parity

## ADDED Requirements

### Requirement: Legacy Tool Inventory Parity

Dysflow MUST expose the complete legacy MCP tool surface previously provided by `C:\Proyectos\workflow\skills\dysflow`, covering all `access-vba-sync` and `access-query` tools.

#### Scenario: Tool list includes all legacy VBA sync tools

- GIVEN a client calls MCP `tools/list`
- WHEN Dysflow returns its available tools
- THEN the list includes `export_modules`, `export_all`, `import_modules`, `import_all`, `list_objects`, `exists`, `run_vba`, `test_vba`, `compile_vba`, `verify_code`, `verify_binary`, `reconcile_binary`, `delete_module`, `generate_erd`, `fix_encoding`, `init_project`, `normalize_documents`, `validate_form_spec`, `generate_form`, `catalog_add_control`, and `harvest_form_catalog`
- AND `list_access_operations` and `cleanup_access_operation` remain available through backwards-compatible names or documented aliases.

#### Scenario: Tool list includes all legacy Access query tools

- GIVEN a client calls MCP `tools/list`
- WHEN Dysflow returns its available tools
- THEN the list includes `query_sql`, `list_tables`, `list_linked_tables`, `get_schema`, `count_rows`, `distinct_values`, `compare_backends`, `list_access_files`, `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, `teardown_fixture`, `list_links`, `link_tables`, `relink_tables`, `localize_backend_links`, `unlink_table`, `export_queries`, `import_queries`, `get_relationships`, and `compact_repair`.

### Requirement: No Legacy Runtime Dependency

Dysflow MUST NOT depend on the old `C:\Proyectos\workflow\skills\access-vba-sync`, `access-query`, or `dysflow` skill folders at runtime.

#### Scenario: Production code does not import legacy skill paths

- GIVEN the TypeScript source tree
- WHEN architecture tests scan production imports and process invocations
- THEN no production path imports or shells into `C:\Proyectos\workflow\skills\*` as its implementation.

### Requirement: Safety Contract for Access-Opening Tools

Every parity tool that opens Microsoft Access MUST register and return Access operation metadata consistently with the existing Dysflow process ownership contract.

#### Scenario: Access-opening legacy-compatible tool returns operation metadata

- GIVEN a legacy-compatible tool opens Access
- WHEN the tool returns success or failure
- THEN its result includes `operationId`, `accessPath`, `accessPid`, `processStartTime`, and `status` when PID ownership was determined
- AND the operation is visible through the operation registry.

### Requirement: Strict Write Safeguards

Write-capable parity tools MUST preserve legacy safety defaults and must not silently perform destructive writes.

#### Scenario: Write SQL defaults to dry-run

- GIVEN an agent calls `exec_sql` without `dryRun:false`
- WHEN Dysflow handles the request
- THEN the operation is treated as a dry-run
- AND no data is modified.

#### Scenario: Fixture writes require explicit safety intent

- GIVEN an agent calls `seed_fixture` or `teardown_fixture`
- WHEN neither `allowTable` nor `force:true` is provided
- THEN Dysflow refuses the operation with an actionable safety error.
