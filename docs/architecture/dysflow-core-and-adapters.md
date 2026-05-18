# Dysflow Core and Adapters

Dysflow is built inside-out: adapters depend inward on `src/core/**`, and the core never knows which protocol is calling it.

## Dependency direction

```text
CLI / MCP stdio / future HTTP
  -> src/adapters/*
  -> src/core/services/*
  -> src/core/runner/access-runner.ts
  -> PowerShell / Access process
```

`src/core/**` MUST NOT import MCP or HTTP adapters. Core returns protocol-neutral `OperationResult` values with typed errors, diagnostics, data, and duration. Adapters translate that result at the boundary: MCP returns text content blocks, the future HTTP adapter will return JSON/status codes, and the CLI prints human-readable summaries.

## MCP stdio adapter

The MCP adapter registers tools over core services:

- `dysflow.vba.execute` -> `AccessVbaService`
- `dysflow.query.execute` -> `AccessQueryService`
- `dysflow.doctor` -> `AccessDiagnosticsService`

MCP startup must not write product logs to stdout. Stdout belongs to the stdio protocol; safe messages belong in returned tool content or stderr on startup failure.

## CLI wiring

- `dysflow mcp` starts the MCP stdio adapter and returns empty CLI stdout. SQL write tools are disabled by default and require `dysflow mcp --enable-writes`.
- `dysflow setup` resolves core configuration and prints only redacted values.
- `dysflow doctor` calls core diagnostics and formats check results.
- `dysflow serve` stays planned until the HTTP adapter phase.

## Legacy compatibility

The existing implementation at `C:\Proyectos\workflow\skills\dysflow` is a compatibility reference and fallback. This change does not modify it. The legacy stdio MCP implementation remains untouched while the productized adapter is proven in this repository.

That boundary matters: replacing an operating Access automation path without tests is how you break production. First we prove the new core and adapters; only then should migration decisions happen.
