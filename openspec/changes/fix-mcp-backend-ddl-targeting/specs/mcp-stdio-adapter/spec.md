# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Legacy MCP Write Target Mapping

Legacy MCP write tools MUST preserve explicit write target inputs when translating MCP requests to core runner contracts. `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, and `teardown_fixture` MUST forward `backendPath` and `databasePath` as write-target candidates without replacing them with the frontend Access path. If no explicit write target is supplied, the adapter MUST preserve current frontend-compatible defaults.

#### Scenario: Legacy tool forwards explicit backend target

- GIVEN a legacy MCP request includes `backendPath` or `databasePath`
- WHEN the adapter maps the request to a core write operation
- THEN the mapped request MUST include the explicit write target unchanged
- AND it MUST NOT substitute `accessPath` as the write database

#### Scenario: Legacy tool without backend target remains compatible

- GIVEN a legacy MCP write request omits `backendPath` and `databasePath`
- WHEN the adapter maps the request
- THEN the mapped request MUST preserve the existing frontend/current-database behavior
- AND no new backend override SHALL be inferred

#### Scenario: No Conformidades Issue 18 table classification

- GIVEN No Conformidades Issue #18 requires cache/config table creation
- WHEN legacy MCP tools are used to manage those tables
- THEN `TbCacheIndicadoresProyectoHeader`, `TbCacheIndicadoresProyectoDetalle`, and `TbConfiguracion` MUST be classified as backend/global targets
- AND `TbConfiguracionBackends` MUST remain a frontend/local table

#### Scenario: Unsafe secret or cleanup input is rejected safely

- GIVEN a legacy MCP request attempts to provide a raw password or requests process-wide cleanup
- WHEN the adapter maps or reports the request
- THEN it MUST NOT pass raw secrets except through configured env/config resolution
- AND diagnostics MUST remain sanitized and operation-owned cleanup MUST be required
