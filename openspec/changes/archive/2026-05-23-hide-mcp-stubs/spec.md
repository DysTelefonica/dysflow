# Delta for MCP Legacy Parity — hide-mcp-stubs

Base spec: `openspec/changes/archive/2026-05-21-dysflow-legacy-mcp-parity/specs/mcp-legacy-parity/spec.md`

---

## MODIFIED Requirements

### Requirement: Legacy Tool Inventory Parity

Dysflow MUST expose the complete legacy MCP tool surface through `tools/list`, **excluding tools whose names appear in `HIDDEN_STUB_TOOL_NAMES`**. Hidden stub tools MUST NOT appear in `tools/list` responses. Hidden stub tools MUST remain invocable via `tools/call` and MUST return `LEGACY_TOOL_NOT_IMPLEMENTED`.

(Previously: all parity tools including `verify_binary` and `reconcile_binary` appeared in `tools/list`.)

#### Scenario: Tool list includes all visible legacy VBA sync tools

- GIVEN a client calls MCP `tools/list`
- WHEN Dysflow returns its available tools
- THEN the list includes `export_modules`, `export_all`, `import_modules`, `import_all`, `list_objects`, `exists`, `run_vba`, `test_vba`, `compile_vba`, `verify_code`, `delete_module`, `generate_erd`, `fix_encoding`, `init_project`, `normalize_documents`, `validate_form_spec`, `generate_form`, `catalog_add_control`, and `harvest_form_catalog`
- AND `list_access_operations` and `cleanup_access_operation` remain available through backwards-compatible names or documented aliases
- AND `verify_binary` and `reconcile_binary` are NOT present in the list

#### Scenario: Tool list includes all legacy Access query tools

- GIVEN a client calls MCP `tools/list`
- WHEN Dysflow returns its available tools
- THEN the list includes `query_sql`, `list_tables`, `list_linked_tables`, `get_schema`, `count_rows`, `distinct_values`, `compare_backends`, `list_access_files`, `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, `teardown_fixture`, `list_links`, `link_tables`, `relink_tables`, `localize_backend_links`, `unlink_table`, `export_queries`, `import_queries`, `get_relationships`, and `compact_repair`

#### Scenario: Visible tool count is 48

- GIVEN a client calls MCP `tools/list`
- WHEN Dysflow returns its tool list
- THEN exactly 48 tools are present in the response

#### Scenario: Hidden stub tools are callable and return the not-implemented contract

- GIVEN `verify_binary` or `reconcile_binary` is passed to MCP `tools/call`
- WHEN Dysflow dispatches the call
- THEN the response contains `LEGACY_TOOL_NOT_IMPLEMENTED`
- AND no routing failure or unknown-tool error is raised

#### Scenario: Hidden stub tools do NOT appear in tools/list

- GIVEN a client calls MCP `tools/list`
- WHEN Dysflow returns its tool list
- THEN `verify_binary` is absent from the list
- AND `reconcile_binary` is absent from the list

---

## ADDED Requirements

### Requirement: Hidden Stub Registry Consistency

`HIDDEN_STUB_TOOL_NAMES` and `LEGACY_PARITY_REGISTRY` MUST be consistent: any tool name in `HIDDEN_STUB_TOOL_NAMES` MUST have status `"pending"` (not `"implemented"`) in `LEGACY_PARITY_REGISTRY`.

#### Scenario: Stub names have pending status in parity registry

- GIVEN `verify_binary` and `reconcile_binary` are in `HIDDEN_STUB_TOOL_NAMES`
- WHEN the parity registry is inspected
- THEN both names have status `"pending"` in `LEGACY_PARITY_REGISTRY`
- AND neither name appears under `implementedToolNames`

### Requirement: Release Matrix Gate Counts

The release matrix gate MUST enforce that hidden stub count equals 2 and visible tool count equals 48.

#### Scenario: Release gate asserts correct stub and visible counts

- GIVEN the release matrix gate test runs
- WHEN it checks tool projection counts
- THEN `stubCount === 2`
- AND `visibleCount === 48`
