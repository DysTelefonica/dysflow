# Delta for MCP Tooling

## MODIFIED Requirements

### Requirement: Modern Tool Name Compatibility

The MCP adapter MUST expose modern Dysflow tools using underscore-separated names. It MUST NOT advertise modern Dysflow tool names containing dots. Legacy tools MAY keep their existing underscore names.

#### Scenario: tools/list exposes canonical modern names

- GIVEN the Dysflow MCP tool registry is created
- WHEN a client lists tools
- THEN the modern tool names include `dysflow_vba_execute`, `dysflow_query_execute`, `dysflow_doctor`, `dysflow_access_operations_list`, and `dysflow_access_cleanup`
- AND none of those modern names contains `.`

#### Scenario: modern handlers remain wired to core services

- GIVEN a client calls an underscore-named modern tool
- WHEN the handler validates input
- THEN it invokes the same core service as the previous dotted tool name
- AND preserves write guards and progress forwarding.
