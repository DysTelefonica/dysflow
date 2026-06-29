## ADDED Requirements

### Requirement: Bounded tool-call response semantics

The MCP stdio adapter MUST complete every `tools/call` request with a JSON-RPC response frame after MCP startup has succeeded, even when the invoked core service fails or times out. The adapter MUST NOT leave the client pending without a terminal response.

#### Scenario: Successful call after startup

- **Given** `initialize` and `tools/list` already succeeded
- **When** a `tools/call` handler returns a successful tool result
- **Then** the adapter MUST emit exactly one terminal JSON-RPC response for that request id
- **And** the response payload MUST contain the tool result.

#### Scenario: Core timeout maps to terminal tool response

- **Given** `initialize` and `tools/list` already succeeded
- **And** the handler result maps to a bounded runner timeout or failure
- **When** the adapter finalizes the request
- **Then** it MUST emit exactly one terminal JSON-RPC response for that request id
- **And** the response MUST contain structured failure details safe for clients
- **And** the request MUST NOT remain pending.

#### Scenario: E2E project context preserves request completion

- **Given** config resolves from an `E2E_testing`-style `.dysflow/project.json`
- **When** a `tools/call` for `dysflow_doctor` or `list_tables` reaches a bounded runner failure
- **Then** the adapter SHALL return a terminal response
- **And** it MUST NOT require startup/config changes from the OpenCode startup fix.
