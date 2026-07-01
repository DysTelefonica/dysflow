# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Public Create-From-Template MCP Tool

The MCP stdio adapter MUST register a public tool for cloning a form from a template. The tool MUST be discoverable in the tool list, MUST accept the documented arguments (source form, target form, token map, and optional policy flags), and MUST route to the core Form Template Cloning Service. Its result MUST be a structured payload containing the post-replacement layout preview, the list of applied tokens, and any missing-token warnings. Core errors MUST be translated to a safe error code and a user-facing message.

#### Scenario: Tool is registered and returns structured result
- GIVEN the adapter advertises its available tools
- WHEN the create-from-template tool is invoked with valid arguments
- THEN the tool MUST be present in the tool list with its exact public name
- AND the result MUST contain the post-replacement preview, the applied-tokens list, and the missing-tokens warnings

#### Scenario: Core error returns a safe message
- GIVEN the core service returns a typed error (e.g., invalid token map or existing target)
- WHEN the adapter responds
- THEN it MUST preserve a safe error code and a user-facing message
- AND it MUST NOT emit a success result

### Requirement: Create-From-Template Write-Gate and Dry-Run Semantics

The tool MUST default to dry-run (OQ7): a dry-run call MUST NOT mutate the binary or the filesystem and MUST return the post-replacement preview plus the token replacement summary without invoking an import. When the caller enables apply, the call MUST route through the standard MCP write gate and commit through the import path with the LoadFromText round-trip gate. One call clones exactly one source into one target (OQ6). The handler MUST accept an optional `McpToolContext` and MUST forward its `sendProgress` when present.

#### Scenario: Dry-run default does not mutate
- GIVEN a create-from-template call with no apply flag
- WHEN the adapter handles it
- THEN it MUST NOT mutate the binary or the source tree
- AND it MUST return the post-replacement preview and token replacement summary

#### Scenario: Apply routes through the write gate and load gate
- GIVEN a create-from-template call with apply enabled
- WHEN the adapter handles it
- THEN it MUST pass the standard MCP write gate for a binary-and-filesystem mutation
- AND it MUST commit the target through the import path and the LoadFromText round-trip gate before reporting success

#### Scenario: Progress token is forwarded when present
- GIVEN a `tools/call` request carrying a progress token
- WHEN the handler runs
- THEN it MUST receive a `McpToolContext` with a defined `sendProgress`
- AND forwarding that callback to the core service MUST NOT throw

### Requirement: Load Gate Failure Restores Source State

When the LoadFromText gate rejects the newly cloned target during an apply, the tool MUST return the gate error and MUST restore the source tree to its pre-call state. If restoration itself fails, the tool MUST return a structured partial-success result that captures the original gate error and the restoration failure.

#### Scenario: Gate rejection restores prior state
- GIVEN an apply call whose cloned target fails the LoadFromText gate
- WHEN the adapter finalizes the request
- THEN it MUST return the gate error
- AND the source tree MUST be restored to its pre-call state

#### Scenario: Failed restoration returns structured partial-success
- GIVEN the gate rejected the target and the restore step also fails
- WHEN the adapter finalizes the request
- THEN it MUST return a structured partial-success result
- AND that result MUST capture both the original gate error and the restoration failure
