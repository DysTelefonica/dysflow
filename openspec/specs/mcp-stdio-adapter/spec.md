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

`toLegacyMaintenanceRequest` MUST derive environment values exclusively from the `env` parameter passed through context. It MUST NOT read `process.env` directly.
(Previously: the function read `process.env` directly, bypassing env injection.)

#### Scenario: Env value from injected context
- GIVEN `toLegacyMaintenanceRequest` is called with an `env` parameter containing a key
- WHEN the function builds the legacy request
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
(Previously: contained both for legacy compatibility scaffolding.)

#### Scenario: No as-any casts
- GIVEN the test file is compiled
- WHEN TypeScript strict mode is active
- THEN no `as any` casts SHALL appear in the file

#### Scenario: No ungated console output
- GIVEN a test suite run
- WHEN any test in `release-matrix-gate.test.ts` executes
- THEN no `console.log` calls SHALL execute unconditionally in test bodies

