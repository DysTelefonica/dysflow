# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Legacy Tool Visibility and Dispatch Contracts

The system MUST expose implemented legacy MCP tools in tools/list, MUST hide only compatibility stubs, and MUST dispatch implemented legacy tools through `legacyToolService` rather than legacy fallback behavior.

#### Scenario: Implemented verify/reconcile tools are visible

- GIVEN legacy tool registry is built through `createDysflowMcpTools`
- WHEN tools/list is projected
- THEN `verify_code`, `verify_binary`, and `reconcile_binary` are present
- AND `init_project` and `normalize_documents` are not present

#### Scenario: Implemented legacy tool uses legacy service path

- GIVEN a legacy-compatible MCP adapter with `legacyToolService`
- WHEN `verify_binary` is invoked via `tools/call` with `diff: true`
- THEN handler dispatches directly to `legacyToolService.execute("verify_binary", input)`
- AND returns the translated MCP success content from that service

#### Scenario: Unsupported legacy commands are callable but explicit

- GIVEN a tool named `init_project` is requested via `tools/call`
- WHEN its handler runs
- THEN the call must return `isError: false`
- AND the text must be JSON with `ok: false`, `supported: false`, and `operation: "init_project"`

#### Scenario: Visible VBA sync tools fail explicitly when service is unavailable

- GIVEN a visible VBA sync tool such as `verify_code`
- AND no `legacyToolService` is configured
- WHEN its handler runs
- THEN the call must return `isError: true`
- AND the text must include `MCP_SERVICE_UNAVAILABLE`
- AND the text must not include `LEGACY_TOOL_NOT_IMPLEMENTED`
