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

Long-running Access workflows follow the same inward dependency rule. For example,
[`relink_directory`](./relink-directory-orchestration.md) keeps traversal, planning, sequencing,
and partial-failure policy in core while PowerShell implements filesystem and DAO primitives.

## Adapter-to-adapter boundary

Adapters MUST NOT import from sibling adapters for shared request validation, schema atoms, or protocol-neutral helpers. Use `src/shared/**` for protocol-neutral shared kernels, or move domain behavior into `src/core/**` when it is part of the product model.

The shared validation kernel lives in `src/shared/validation/**`. HTTP and MCP adapters reuse its
request schemas and `validateInput()` behavior without a lateral dependency.

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

## VBA import orchestration

VBA import policy follows the same inward dependency direction as the protocol adapters:

```text
scripts/dysflow-vba-manager.ps1
  -> scripts/lib/dysflow-vba-import-transport.psm1
  -> src/cli/vba-import-orchestration.ts
  -> src/core/services/vba-import-orchestration.ts
  -> ordered PowerShell/Access COM primitive pass
```

The pure core service owns ordered pass selection, progress-based retry, rollback policy,
save-only decisions, typed per-module error mapping, and the terminal result projection.

The PowerShell boundary retains the one live Access session and implements only the raw mutation
and save primitives.

This keeps COM out of `src/core/**` without opening a new Access process for each module.

The observable contract is preserved:

- Retries target failed modules only after another module made progress.
- Mutation failures request rollback to the pre-import snapshot.
- New components and re-imported forms/reports request `RunCommand(280)`.
- A post-import save failure is a warning and does not replace successful module results.

Import never compiles VBA. The human still compiles in Access before running tests.

Review the executable behavior matrix first:
[`test/fixtures/vba-import-orchestration-contract.json`](../../test/fixtures/vba-import-orchestration-contract.json).

For the full boundary contract, continue with
[`vba-import-orchestration.md`](./vba-import-orchestration.md).

## Compatibility reference

The existing implementation at `<workflow-repo>/skills/dysflow` is a compatibility reference. The productized adapter in this repository (`src/adapters/mcp`) is the active implementation.

That boundary matters: replacing an operating Access automation path without tests is how you break production.
