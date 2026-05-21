# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Progress Token Extraction

The adapter MUST extract `params._meta.progressToken` from every `tools/call`
JSON-RPC request and expose it through a `McpToolContext` object passed to each
tool handler.

The `McpToolContext` interface MUST be:

```
progressToken?: string | number
sendProgress?(progress: number, total?: number, message?: string): void
```

When `progressToken` is absent or undefined, `sendProgress` MUST be undefined
and no notifications SHALL be written to stdout.

#### Scenario: Request carries progressToken

- GIVEN a `tools/call` request with `params._meta.progressToken` set to a non-null value
- WHEN the adapter routes the call to the tool handler
- THEN it MUST pass a `McpToolContext` where `sendProgress` is a callable function
- AND calling `sendProgress(progress, total, message)` MUST write a valid `notifications/progress` JSON-RPC frame to stdout

#### Scenario: Request has no progressToken

- GIVEN a `tools/call` request with no `_meta` field, or `_meta.progressToken` absent
- WHEN the adapter routes the call
- THEN `McpToolContext.sendProgress` MUST be undefined
- AND no `notifications/progress` frame SHALL be written to stdout during the call

### Requirement: Progress Notification Frame Format

When `sendProgress` is invoked, the adapter MUST write a single-line JSON-RPC
notification to stdout conforming to:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "<token>",
    "progress": <number>,
    "total": <number | omitted>,
    "message": "<string | omitted>"
  }
}
```

The frame MUST be a complete JSON-RPC notification (no `id` field). Optional
fields (`total`, `message`) MUST be omitted when not provided, not set to null.

#### Scenario: sendProgress with all fields

- GIVEN an active tool call with a valid `progressToken`
- WHEN `sendProgress(25, 100, "Importing...")` is called
- THEN stdout MUST receive a single JSON line with `method: "notifications/progress"`, `progress: 25`, `total: 100`, `message: "Importing..."`

#### Scenario: sendProgress with progress only

- GIVEN an active tool call with a valid `progressToken`
- WHEN `sendProgress(50)` is called
- THEN the emitted frame MUST include `progress: 50` and MUST NOT include `total` or `message` keys

## MODIFIED Requirements

### Requirement: MCP Adapter Over Core

The system MUST register MCP tools that translate requests to core contracts and
never embed HTTP behavior. Tool handlers MUST accept an optional `McpToolContext`
parameter so callers may supply a progress callback.

(Previously: handler signature had no context parameter)

#### Scenario: MCP tool invokes core

- GIVEN an MCP tool request
- WHEN the adapter receives it
- THEN it SHALL call the matching core service
- AND translate the result to MCP output

#### Scenario: Core error returned

- GIVEN core returns an error
- WHEN the adapter responds
- THEN it MUST preserve a safe error message

#### Scenario: Tool handler receives context when token present

- GIVEN a `tools/call` request with a `progressToken`
- WHEN the handler is invoked
- THEN it MUST receive a `McpToolContext` with a defined `sendProgress` function
- AND forwarding that function to the service MUST not throw

#### Scenario: Tool handler receives empty context when token absent

- GIVEN a `tools/call` request without a `progressToken`
- WHEN the handler is invoked
- THEN `McpToolContext.sendProgress` MUST be undefined
- AND the handler MUST complete normally without emitting any progress frame
