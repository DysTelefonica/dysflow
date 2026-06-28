# Spec: MCP Modern Descriptions

## Requirement

Modern `dysflow_*` MCP tools MUST advertise descriptions that help agents choose safe arguments and avoid write-gate or process-cleanup footguns.

## Scenarios

### Scenario: query execution description explains read/write safety

- **Given** an MCP client calls `tools/list`
- **When** it reads `dysflow_query_execute`
- **Then** the description MUST mention `mode`, read/write execution, `dryRun`/`apply`, and `MCP_WRITES_DISABLED`

### Scenario: cleanup descriptions distinguish listing from killing

- **Given** an MCP client calls `tools/list`
- **When** it reads operation cleanup tools
- **Then** `dysflow_access_cleanup` MUST distinguish non-force reconcile from `force: true` kill behavior
- **And** `dysflow_access_force_cleanup_orphaned` MUST distinguish list-only discovery from `confirmPid` kill behavior

### Scenario: read-only modern tools identify required context

- **Given** an MCP client calls `tools/list`
- **When** it reads read-only modern tool descriptions
- **Then** each description MUST mention the key required argument or context needed to call the tool safely
