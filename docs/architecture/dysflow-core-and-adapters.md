# Dysflow Core and Adapters

Dysflow is built inside-out: adapters depend inward on `src/core/**`, and the core never knows which protocol is calling it.

## Dependency direction

```text
CLI / MCP stdio / HTTP
  -> src/adapters/*
  -> src/core/services/*
  -> src/core/runner/access-runner.ts
  -> PowerShell / Access process
```

`src/core/**` MUST NOT import MCP or HTTP adapters. Core returns protocol-neutral `OperationResult` values with typed errors, diagnostics, data, and duration. Adapters translate that result at the boundary: MCP returns text content blocks, the HTTP adapter returns JSON/status codes, and the CLI prints human-readable summaries.

## MCP stdio adapter

The MCP adapter registers tools over core services:

- `dysflow_vba_execute` -> `AccessVbaService`
- `dysflow_query_execute` -> `AccessQueryService`
- `dysflow_doctor` -> `AccessDiagnosticsService`

MCP startup must not write product logs to stdout. Stdout belongs to the stdio protocol; safe messages belong in returned tool content or stderr on startup failure.

## CLI wiring

- `dysflow mcp` starts the MCP stdio adapter and returns empty CLI stdout. SQL write tools are disabled by default and require `dysflow mcp --enable-writes`.
- `dysflow setup` resolves core configuration and prints only redacted values.
- `dysflow doctor` calls core diagnostics and formats check results.
- `dysflow serve` starts the HTTP adapter and listens on the configured port.

## Legacy VBA sync timeout

`VbaSyncLegacyService` resolves the execution timeout with this priority:

1. **Explicit per-call `timeoutMs`** — the caller passes `timeoutMs` in the tool params (e.g. from MCP input). Takes precedence over everything.
2. **Project config `timeoutMs`** — loaded from `.dysflow/project.json` via `loadDysflowConfig`. This is the primary mechanism for repos with slow VBA test suites (e.g. `"timeoutMs": 180000`).
3. **Service-level `processTimeoutMs`** — the value passed to `VbaSyncLegacyService` at construction (default 30 000 ms). Used when no project config is resolved.

The MCP startup timeout is only a fallback. Once `resolveExecutionTarget` loads a real project config, `processTimeoutMs` from that config governs the call.

```jsonc
// .dysflow/project.json
{
  "id": "my-project",
  "accessPath": "MyDb.accdb",
  "timeoutMs": 180000   // applied to all legacy VBA tools in this repo
}
```

A per-call override (rarely needed):
```jsonc
{ "projectId": "my-project", "testsPath": "tests/tests.vba.json", "timeoutMs": 300000 }
```

## Legacy compatibility

The existing implementation at `C:\Proyectos\workflow\skills\dysflow` is a compatibility reference and fallback. This change does not modify it. The legacy stdio MCP implementation remains untouched while the productized adapter is proven in this repository.

That boundary matters: replacing an operating Access automation path without tests is how you break production. First we prove the new core and adapters; only then should migration decisions happen.
