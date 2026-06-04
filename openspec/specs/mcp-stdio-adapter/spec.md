# mcp-stdio-adapter Specification

## Purpose

Expose core services as MCP stdio tools while preserving protocol safety and supporting real-time progress notifications.

## Requirements

### Requirement: MCP Adapter Over Core

The system MUST register MCP tools that translate requests to core contracts and never embed HTTP behavior. Tool handlers MUST accept an optional `McpToolContext` parameter so callers may supply a progress callback.

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

### Requirement: Progress Token Extraction

The adapter MUST extract `params._meta.progressToken` from every `tools/call` JSON-RPC request and expose it through a `McpToolContext` object passed to each tool handler.

The `McpToolContext` interface MUST be:
```ts
interface McpToolContext {
  progressToken?: string | number;
  sendProgress?(progress: number, total?: number, message?: string): void;
}
```

When `progressToken` is absent or undefined, `sendProgress` MUST be undefined and no notifications SHALL be written to stdout.

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

When `sendProgress` is invoked, the adapter MUST write a single-line JSON-RPC notification to stdout conforming to:
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

The frame MUST be a complete JSON-RPC notification (no `id` field). Optional fields (`total`, `message`) MUST be omitted when not provided, not set to null.

#### Scenario: sendProgress with all fields
- GIVEN an active tool call with a valid `progressToken`
- WHEN `sendProgress(25, 100, "Importing...")` is called
- THEN stdout MUST receive a single JSON line with `method: "notifications/progress"`, `progress: 25`, `total: 100`, `message: "Importing..."`

#### Scenario: sendProgress with progress only
- GIVEN an active tool call with a valid `progressToken`
- WHEN `sendProgress(50)` is called
- THEN the emitted frame MUST include `progress: 50` and MUST NOT include `total` or `message` keys

### Requirement: Environment Injection in MCP Adapter

`toMaintenanceRequest` MUST derive environment values exclusively from the `env` parameter passed through context. It MUST NOT read `process.env` directly.
(Previously: the function read `process.env` directly, bypassing env injection.)

#### Scenario: Env value from injected context
- GIVEN `toMaintenanceRequest` is called with an `env` parameter containing a key
- WHEN the function builds the request
- THEN it MUST use the value from `env`, not from `process.env`

#### Scenario: process.env not accessed
- GIVEN `process.env` differs from the injected `env`
- WHEN the function executes
- THEN the result MUST reflect only the injected `env` values

### Requirement: Canonical Dry-Run Resolution

A single exported function `resolveIsDryRun(input: unknown): boolean` MUST exist and be the sole entry point for computing dry-run state from tool input. All four dry-run evaluation sites in `tools.ts` MUST delegate to it.

Resolution rules (in priority order):
1. If `apply === true` → MUST return `false` (writes enabled), regardless of `dryRun`.
2. If `dryRun === false` → MUST return `false`.
3. Otherwise → MUST return `true` (dry-run active).

#### Scenario: apply true overrides dryRun true
- GIVEN tool input `{ apply: true, dryRun: true }`
- WHEN `resolveIsDryRun` is called
- THEN it MUST return `false`

#### Scenario: apply false with dryRun false
- GIVEN tool input `{ apply: false, dryRun: false }`
- WHEN `resolveIsDryRun` is called
- THEN it MUST return `false`

#### Scenario: default — no apply, no dryRun
- GIVEN tool input `{}`
- WHEN `resolveIsDryRun` is called
- THEN it MUST return `true`

#### Scenario: apply true alone
- GIVEN tool input `{ apply: true }`
- WHEN `resolveIsDryRun` is called
- THEN it MUST return `false`

#### Scenario: all four sites delegate
- GIVEN any tool that previously computed dry-run state inline
- WHEN the tool evaluates dry-run
- THEN it MUST call `resolveIsDryRun`, not reimplement the logic

### Requirement: Unified Context Schema Props

A single `CONTEXT_SCHEMA_PROPS` object MUST replace both `CONTEXT_PROPERTIES` and `CTX` in `tools.ts`. All tool schema definitions MUST reference `CONTEXT_SCHEMA_PROPS`.

#### Scenario: Single source of truth
- GIVEN a tool schema definition
- WHEN it references context property definitions
- THEN it MUST use `CONTEXT_SCHEMA_PROPS` — importing neither `CONTEXT_PROPERTIES` nor `CTX`

#### Scenario: No duplicate definitions
- GIVEN the module is loaded
- WHEN any context property key is looked up
- THEN exactly one definition for that key SHALL exist in the module

### Requirement: Sanitizer Regex Safety

The UNC-path branch of `sanitizeErrorMessage` MUST use a linear regex free of nested repetition.
(Previously: used nested quantifiers that could trigger catastrophic backtracking on adversarial input.)

#### Scenario: Safe UNC path sanitization
- GIVEN an error message containing a UNC path `\\server\share\file`
- WHEN `sanitizeErrorMessage` processes it
- THEN it MUST redact the path without regex timeout or catastrophic backtracking

#### Scenario: Non-UNC message unchanged
- GIVEN an error message without a UNC path
- WHEN `sanitizeErrorMessage` processes it
- THEN it MUST return the message with only standard redactions applied

### Requirement: Test Quality in release-matrix-gate

`release-matrix-gate.test.ts` MUST contain no `as any` type casts and no bare `console.log` calls in test bodies.
(Previously: contained both for compatibility scaffolding.)

#### Scenario: No as-any casts
- GIVEN the test file is compiled
- WHEN TypeScript strict mode is active
- THEN no `as any` casts SHALL appear in the file

#### Scenario: No ungated console output
- GIVEN a test suite run
- WHEN any test in `release-matrix-gate.test.ts` executes
- THEN no `console.log` calls SHALL execute unconditionally in test bodies

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

### Requirement: MCP Write Target Mapping

MCP write tools MUST preserve explicit write target inputs when translating MCP requests to core runner contracts. `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, and `teardown_fixture` MUST forward `backendPath` and `databasePath` as write-target candidates without replacing them with the frontend Access path. If no explicit write target is supplied, the adapter MUST preserve current frontend-compatible defaults.

#### Scenario: Write tool forwards explicit backend target

- GIVEN an MCP write request includes `backendPath` or `databasePath`
- WHEN the adapter maps the request to a core write operation
- THEN the mapped request MUST include the explicit write target unchanged
- AND it MUST NOT substitute `accessPath` as the write database

#### Scenario: Write tool without backend target remains compatible

- GIVEN an MCP write request omits `backendPath` and `databasePath`
- WHEN the adapter maps the request
- THEN the mapped request MUST preserve the existing frontend/current-database behavior
- AND no new backend override SHALL be inferred

#### Scenario: No Conformidades Issue 18 table classification

- GIVEN No Conformidades Issue #18 requires cache/config table creation
- WHEN MCP write tools are used to manage those tables
- THEN `TbCacheIndicadoresProyectoHeader`, `TbCacheIndicadoresProyectoDetalle`, and `TbConfiguracion` MUST be classified as backend/global targets
- AND `TbConfiguracionBackends` MUST remain a frontend/local table

#### Scenario: Unsafe secret or cleanup input is rejected safely

- GIVEN an MCP request attempts to provide a raw password or requests process-wide cleanup
- WHEN the adapter maps or reports the request
- THEN it MUST NOT pass raw secrets except through configured env/config resolution
- AND diagnostics MUST remain sanitized and operation-owned cleanup MUST be required

### Requirement: Consolidated SQL Validation for MCP Read Tools

The MCP stdio adapter MUST reject write SQL statements in read-only tools by validating SQL input using the consolidated read-only heuristic (`looksLikeReadOnlySql`). This validation MUST allow read-only Common Table Expression (CTE) statements (starting with `WITH ... SELECT`) while rejecting write statements and multi-statement queries.

#### Scenario: MCP read tool execution succeeds with SELECT
- GIVEN the MCP adapter is active
- WHEN a read-only query tool is invoked with a standard SELECT query
- THEN it SHALL allow query execution and return the result

#### Scenario: MCP read tool execution succeeds with CTE
- GIVEN the MCP adapter is active
- WHEN a read-only query tool is invoked with a CTE query starting with `WITH ... SELECT`
- THEN it SHALL allow query execution and return the result

#### Scenario: MCP read tool execution rejects write statement
- GIVEN the MCP adapter is active
- WHEN a read-only query tool is invoked with SQL containing write keywords (e.g., `INSERT`, `UPDATE`, `DELETE`)
- THEN it MUST reject the request and return an `MCP_INPUT_INVALID` error

### Requirement: Declarative Parameter Mapping

The MCP stdio adapter MUST map tool input arguments to core operation payloads using declarative mapping helpers that handle fallbacks (such as mapping `table` or `tableName`, `query` or `sql`, etc.) consistently and type-safely.

#### Scenario: Parameter fallback resolves tableName from table
- GIVEN a tool invocation with parameter `table` but no `tableName`
- WHEN the argument mapper processes the input
- THEN it MUST map the value to `tableName` in the target operation payload

#### Scenario: Parameter fallback resolves sql from query
- GIVEN a tool invocation with parameter `query` but no `sql`
- WHEN the argument mapper processes the input
- THEN it MUST map the value to `sql` in the target operation payload

