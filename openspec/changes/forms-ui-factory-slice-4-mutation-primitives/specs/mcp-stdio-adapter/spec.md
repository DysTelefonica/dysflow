# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Public Form Mutation MCP Tools

The MCP stdio adapter MUST register public tools named `dysflow_form_add_control`, `dysflow_form_move_control`, and `dysflow_form_rename_control`. These tools MUST route to the core form mutation service and MUST enforce write-gate semantics.

#### Scenario: Tool registration is discoverable
- GIVEN MCP tools are listed
- WHEN the adapter advertises available tools
- THEN the three form mutation tools MUST be present
- AND their names MUST match the public contract exactly

#### Scenario: Tool call routes to core mutation service
- GIVEN a valid mutation request
- WHEN the adapter handles the tool call
- THEN it MUST call the matching core form mutation operation
- AND it MUST return a protocol-safe result

#### Scenario: Write-gate failure is safe
- GIVEN a mutation request is blocked by write-gate policy
- WHEN the adapter evaluates the request
- THEN it MUST reject the call safely
- AND it MUST NOT claim success

### Requirement: Form Mutation Validation and Load Gate

The adapter MUST validate form mutation inputs and MUST require a successful LoadFromText-style round-trip gate before reporting success for supported mutations.

#### Scenario: Valid mutation passes gate
- GIVEN a supported mutation and a benchmark form source
- WHEN the adapter mutates and validates the form
- THEN it MUST report success only after the round-trip gate passes

#### Scenario: Invalid mutation fails before success
- GIVEN malformed form input or a rejected mutation
- WHEN the adapter processes the request
- THEN it MUST return a safe error
- AND it MUST NOT emit a success result
