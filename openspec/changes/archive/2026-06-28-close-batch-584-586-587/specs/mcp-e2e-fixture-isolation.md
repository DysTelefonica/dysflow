# Spec: MCP E2E Fixture Isolation (#586)

## ADDED Requirements

### Requirement: MCP E2E runs against temporary fixture copies

The real MCP E2E harness MUST copy database and source fixtures into a temporary sandbox before executing any tool call. All write, relink, import, export, compact, query-write, and form-generation operations MUST target sandbox paths only.

#### Scenario: sandbox is prepared before tool execution

- **Given** repository fixture databases and source files exist
- **When** `E2E_testing/mcp-e2e.mjs` starts
- **Then** it MUST create a temp sandbox
- **And** it MUST copy the frontend database, backend database, and source fixture tree into that sandbox before the first MCP call.

#### Scenario: write-capable tools run in sandbox

- **Given** the MCP E2E harness executes write/relink/import/export operations
- **When** those operations pass `accessPath`, `backendPath`, `destinationRoot`, `databasePath`, `rootPath`, or output paths
- **Then** each mutable path MUST resolve under the sandbox root
- **And** no operation may target `E2E_testing/NoConformidades*.accdb` or `E2E_testing/src` directly.

#### Scenario: cleanup and failure preservation are documented

- **Given** an MCP E2E run completes successfully
- **When** cleanup executes
- **Then** the sandbox SHOULD be removed automatically.
- **Given** an MCP E2E run fails and preserve-on-failure is enabled
- **When** cleanup executes
- **Then** the sandbox MUST remain available and its path MUST be printed for diagnosis.

### Acceptance Criteria

- `mcp-e2e.mjs` uses temp copied frontend/backend/source fixtures for all tool calls.
- A regression test proves mutable paths are sandbox-contained.
- README or inline harness help documents cleanup and preserve-on-failure behavior.
