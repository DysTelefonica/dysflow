# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Consistent VBA Write-Gating
The MCP adapter MUST enforce consistent write-gating (dry-run check) across all VBA modification tools (`delete_module`, `import_modules`, `import_all`, `compile_vba`). When a write tool is blocked, the error message MUST explicitly name the blocked tool.

#### Scenario: Blocked delete_module names the tool
- GIVEN write authorization is disabled
- WHEN the client calls `delete_module`
- THEN the adapter MUST reject the call with an error naming "delete_module"

### Requirement: Stdio Endpoints for New Services
The MCP stdio adapter MUST register the new `vba_orphan_audit` and `vba_inline_execution` tools.

#### Scenario: Call inline execution tool
- GIVEN a valid VBA snippet in tool input
- WHEN the `vba_inline_execution` tool is called
- THEN it MUST delegate to the core inline execution service and return output
