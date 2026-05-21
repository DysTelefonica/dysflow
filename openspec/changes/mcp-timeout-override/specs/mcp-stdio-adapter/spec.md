# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Legacy VBA Tools Accept Per-call Timeout Overrides

Legacy VBA-sync MCP tools that execute the Access/VBA runner MUST accept an optional `timeoutMs` number in their input schema.

#### Scenario: Runner tool schema accepts timeoutMs

- GIVEN the MCP adapter exposes legacy VBA runner tools such as `compile_vba`, `test_vba`, `export_all`, and `verify_code`
- WHEN a caller passes `timeoutMs`
- THEN schema validation MUST accept the property
- AND the handler MUST dispatch the original input to `legacyToolService`
