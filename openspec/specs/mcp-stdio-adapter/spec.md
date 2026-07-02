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

### Requirement: SQL Read-Only Guard Authority

The read-only SQL check for any MCP or HTTP read-mode entry point MUST be owned by core. A single core function — `AccessQueryService.execute` — is the authoritative source of truth for deciding whether a `mode: "read"` request may proceed. Adapters MUST NOT re-implement the keyword heuristic. Adapters MAY format or translate the error code returned by the core service; they MUST NOT run a parallel keyword list before delegating to the service.

#### Scenario: MCP modern handler delegates to the core guard

- GIVEN the MCP stdio adapter handles a `dysflow_query_execute` call with `mode: "read"` and a non-empty `sql`
- WHEN the adapter invokes the core service
- THEN the call MUST reach `queryService.execute` exactly once
- AND the result MUST come from the core guard (i.e., either the core service's own guard or a fake service that mirrors the core guard)
- AND the adapter MUST NOT run a separate keyword check before calling the service

#### Scenario: MCP alias handler delegates to the core guard

- GIVEN the MCP stdio adapter handles a `query_sql` alias call with a non-empty `sql`
- WHEN the adapter invokes the core service
- THEN the call MUST reach `queryService.execute` exactly once
- AND the result MUST come from the core guard
- AND the alias handler MUST NOT run a separate keyword check before calling the service

#### Scenario: HTTP read route delegates to the core guard

- GIVEN the HTTP adapter handles a `POST /query/read` request with a non-empty `sql`
- WHEN the handler invokes the core service
- THEN the call MUST reach `queryService.execute` exactly once
- AND when the result has `error.code === "INVALID_READ_ONLY_QUERY"`, the handler MUST translate it to HTTP 400 with error code `HTTP_READ_ONLY_SQL_REQUIRED`
- AND the handler MUST NOT run a separate `looksLikeReadOnlySql` check before calling the service

#### Scenario: Adapter does not duplicate keyword logic

- GIVEN the MCP stdio adapter or HTTP adapter receives a read-only request
- WHEN the implementation is inspected
- THEN no adapter module under `src/adapters/mcp/` or `src/adapters/http/` SHALL define its own list of forbidden SQL keywords
- AND any compatibility re-export of the old `rejectWriteSqlInReadMode` helper SHALL delegate to `detectWriteSqlKeyword` from `src/core/utils/index.ts` (no parallel list)

### Requirement: Port-Level Test Coverage for the Read-Only Guard

Tests that protect the read-only SQL check MUST be written at the adapter port. They MUST assert observable outcomes — MCP result text, HTTP response status/body, and the captured core service request — and MUST NOT assert on internal adapter call order, private helper names, or which module performs the guard. The fake services used in those tests MUST mirror the core guard 1:1 (same keyword set, same `looksLikeReadOnlySql` / `detectWriteSqlKeyword` calls) so that a test passing against the fake is meaningful for the real service.

#### Scenario: Read-mode write test proves delegation

- GIVEN an MCP or HTTP read-mode test sends a write SQL (DDL, DML, multi-statement, `SELECT ... INTO`, write CTE)
- WHEN the assertion runs
- THEN it MUST verify the SQL reached the core service (e.g., `queryService.requests.length === 1`)
- AND it MUST verify the error reaches the user (MCP `isError: true` with `INVALID_READ_ONLY_QUERY` text, or HTTP 400 with `HTTP_READ_ONLY_SQL_REQUIRED`)
- AND it MUST NOT assert "the service was never called" (that is no longer the expected behavior under the consolidated guard)

#### Scenario: Test survives a future file or module move

- GIVEN the test imports from `src/adapters/mcp/tools` or `src/adapters/http/server` and uses a fake core service
- WHEN adapter internals are reorganized
- THEN the test MUST continue to pass without rewriting assertions for the new file layout
- AND fakes MUST remain limited to legitimate I/O or core-service boundaries

#### Scenario: Clean architecture boundary remains intact

- GIVEN the MCP and HTTP adapters depend on core contracts
- WHEN the read-only guard consolidation is complete
- THEN no core module SHALL import from `src/adapters/mcp` or `src/adapters/http`
- AND the read-only check SHALL be exposed only through the core service contract, not through adapter helpers

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

### Requirement: Stdio Size Limit Connection Closure

The stdio size guard (`SizeLimitTransform`) MUST enforce a 1 MiB line/payload limit. When a payload size violation occurs, the system MUST push a JSON-RPC error frame with `id: null` to the stream and immediately destroy/close the stdio connection to prevent the client from hanging.

#### Scenario: Payload size limit exceeded
- GIVEN an incoming payload exceeding 1 MiB
- WHEN the payload is processed by the stdio size guard
- THEN the size guard MUST push a JSON-RPC error frame with `id: null`
- AND it MUST immediately destroy/close the stdio connection

### Requirement: Orphan Cleanup Service Error Mapping

The `listOrphans` operation handler in the MCP stdio adapter MUST NOT throw raw Error exceptions. It MUST map the core `AccessOrphanCleanupService.listOrphans` result (which returns a standard `OperationResult`) and safely propagate error codes using standard MCP JSON-RPC protocol error structures.

#### Scenario: orphanCleanupService returns failure OperationResult
- GIVEN the orphan cleanup service returns a failure OperationResult
- WHEN the MCP adapter processes the request
- THEN it MUST return a valid MCP error response
- AND it MUST NOT throw a raw Error exception

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

### Requirement: Stdio Process-Wide Write Default Is Enabled

The stdio adapter's process-wide write default MUST be ENABLED when `startMcpStdioAdapter()` receives no explicit `writesEnabled` option. A caller MUST pass an explicit disable signal (`writesEnabled: false`) to run the adapter read-only. This process-wide default is a coarse gate only; it does NOT replace or alter per-request per-repo `allowWrites` resolution.

#### Scenario: No writesEnabled option defaults to enabled
- GIVEN `startMcpStdioAdapter(config)` is called with no `options` argument (or `options.writesEnabled` is `undefined`)
- WHEN the adapter resolves its process-wide write default
- THEN it MUST resolve to `true` (writes enabled)

#### Scenario: Explicit writesEnabled: false stays read-only
- GIVEN `startMcpStdioAdapter(config, { writesEnabled: false })` is called
- WHEN the adapter resolves its process-wide write default
- THEN it MUST resolve to `false` (writes disabled)

#### Scenario: Explicit writesEnabled: true is unaffected
- GIVEN `startMcpStdioAdapter(config, { writesEnabled: true })` is called
- WHEN the adapter resolves its process-wide write default
- THEN it MUST resolve to `true`

### Requirement: Per-Repo Write Access Resolution Is Unchanged

Per-request per-repo `allowWrites` resolution performed by `resolveMcpWriteAccessForInput` (in `dispatch-common.ts`) MUST NOT be altered by the stdio process-wide default change. The process-wide `writesEnabled` flag remains a coarse upstream gate; `resolveMcpWriteAccessForInput` and the `dispatch-common.ts` precedence order MUST continue to apply on top of it, unmodified.

#### Scenario: Per-repo allowWrites still gates writes when process-wide default is enabled
- GIVEN the stdio adapter starts with the new default (writes enabled process-wide)
- AND a request targets a repo whose config sets `allowWrites: false`
- WHEN `resolveMcpWriteAccessForInput` evaluates that request
- THEN it MUST still resolve write access as disallowed for that repo
- AND the resolution logic and precedence order MUST be identical to before this change

#### Scenario: HTTP/serve default remains explicitly out of scope
- GIVEN the HTTP adapter (`dysflow serve`) write-default behavior
- WHEN the stdio process-wide default flips to enabled
- THEN the HTTP adapter's own write-disabled-by-default posture MUST remain unchanged
- AND no HTTP adapter code path MUST be modified as part of this requirement

