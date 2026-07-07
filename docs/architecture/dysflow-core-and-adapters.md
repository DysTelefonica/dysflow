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

## Adapter-to-adapter boundary

Adapters MUST NOT import from sibling adapters for shared request validation, schema atoms, or protocol-neutral helpers. Use `src/shared/**` for protocol-neutral shared kernels, or move domain behavior into `src/core/**` when it is part of the product model.

The shared validation kernel lives in `src/shared/validation/**` so the HTTP and MCP adapters can reuse the same request schemas and `validateInput()` behavior without a lateral HTTP -> MCP or MCP -> HTTP dependency.

## MCP stdio adapter

The MCP adapter registers tools over core services:

- `dysflow_vba_execute` -> `AccessVbaService`
- `query_execute` -> `AccessQueryService`
- `doctor` -> `AccessDiagnosticsService`

MCP startup must not write product logs to stdout. Stdout belongs to the stdio protocol; safe messages belong in returned tool content or stderr on startup failure.

## CLI wiring

- `dysflow mcp` starts the MCP stdio adapter and returns empty CLI stdout. SQL write tools are **enabled by default** (the stdio surface is process-ownership-trusted); pass `dysflow mcp --disable-writes` to run read-only.
- `dysflow setup` resolves core configuration and prints only redacted values.
- `dysflow doctor` calls core diagnostics and formats check results.
- `dysflow serve` starts the HTTP adapter and listens on the configured port.

## VBA sync timeout

`VbaSyncAdapter` resolves the execution timeout with this priority:

1. **Explicit per-call `timeoutMs`** — the caller passes `timeoutMs` in the tool params (e.g. from MCP input). Takes precedence over everything.
2. **Project config `timeoutMs`** — loaded from `.dysflow/project.json` via `loadDysflowConfig`. This is the primary mechanism for repos with slow VBA test suites (e.g. `"timeoutMs": 180000`).
3. **Service-level `timeoutMs`** — the value passed to `VbaSyncAdapter` at construction (default 30 000 ms). Used when no project config is resolved.

The MCP startup timeout is only a fallback. Once `resolveExecutionTarget` loads a real project config, `timeoutMs` from that config governs the call.

```jsonc
// .dysflow/project.json
{
  "id": "my-project",
  "accessPath": "MyDb.accdb",
  "timeoutMs": 180000   // applied to all VBA tools in this repo
}
```

A per-call override (rarely needed):
```jsonc
{ "projectId": "my-project", "testsPath": "tests/tests.vba.json", "timeoutMs": 300000 }
```

## Compatibility reference

The existing implementation at `<workflow-repo>/skills/dysflow` is a compatibility reference. The productized adapter in this repository (`src/adapters/mcp`) is the active implementation.

That boundary matters: replacing an operating Access automation path without tests is how you break production.
