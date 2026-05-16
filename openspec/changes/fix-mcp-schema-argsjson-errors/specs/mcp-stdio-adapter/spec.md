# Delta for MCP Stdio Adapter

## MODIFIED Requirements

### Requirement: MCP Adapter Over Core

The system MUST register MCP tools that translate requests to core contracts and never embed HTTP behavior. The adapter MUST validate MCP tool input before invoking core services and MUST return safe MCP tool errors for invalid input.

#### Scenario: MCP tool invokes core

- GIVEN an MCP tool request with valid input
- WHEN the adapter receives it
- THEN it SHALL call the matching core service
- AND translate the result to MCP output

#### Scenario: Core error returned

- GIVEN core returns an error
- WHEN the adapter responds
- THEN it MUST preserve a safe error message

#### Scenario: Invalid top-level input rejected before core

- GIVEN an MCP tool request with a missing required field or wrong top-level field type
- WHEN the adapter validates the input
- THEN it MUST return an MCP tool result with `isError: true`
- AND the content text MUST begin with `MCP_INPUT_INVALID:`
- AND it MUST NOT call the core service.

#### Scenario: Invalid nested object input rejected before core

- GIVEN an MCP tool request whose schema declares nested object properties
- WHEN a nested field has the wrong type or an undeclared nested field is present where additional properties are forbidden
- THEN the adapter MUST return an MCP tool result with `isError: true`
- AND the content text MUST identify the invalid field path
- AND it MUST NOT call the core service.

#### Scenario: Invalid array item input rejected before core

- GIVEN an MCP tool request whose schema declares array item types
- WHEN an array item does not match the declared item schema
- THEN the adapter MUST return an MCP tool result with `isError: true`
- AND the content text MUST identify the invalid item path
- AND it MUST NOT call the core service.

### Requirement: Legacy argsJson Errors Are MCP Input Errors

Legacy MCP compatibility tools that accept `argsJson` MUST parse it safely and MUST NOT let malformed JSON escape as a raw exception or JSON-RPC internal error.

#### Scenario: Blank argsJson maps to no arguments

- GIVEN a legacy `run_vba` tool call with omitted, empty, or whitespace-only `argsJson`
- WHEN the adapter maps the request
- THEN it SHALL call the core VBA service with `arguments: []`.

#### Scenario: JSON array argsJson maps to argument array

- GIVEN a legacy `run_vba` tool call with `argsJson` set to a valid JSON array
- WHEN the adapter maps the request
- THEN it SHALL call the core VBA service with that array as `arguments`.

#### Scenario: Non-array JSON argsJson maps to one argument

- GIVEN a legacy `run_vba` tool call with `argsJson` set to valid JSON that is not an array
- WHEN the adapter maps the request
- THEN it SHALL call the core VBA service with the parsed value wrapped as the single argument.

#### Scenario: Malformed argsJson returns MCP input invalid

- GIVEN a legacy `run_vba` tool call with malformed `argsJson`
- WHEN the adapter validates and maps the request
- THEN it MUST return an MCP tool result with `isError: true`
- AND the content text MUST begin with `MCP_INPUT_INVALID:`
- AND the content text SHOULD mention `argsJson`
- AND it MUST NOT call the core VBA service.

#### Scenario: Malformed argsJson over stdio is not JSON-RPC internal error

- GIVEN a JSON-RPC `tools/call` request for legacy `run_vba` with malformed `argsJson`
- WHEN the stdio runtime dispatches the call
- THEN the JSON-RPC response MUST contain a normal `result` with `isError: true`
- AND it MUST NOT contain a JSON-RPC `error` with code `-32603`.
