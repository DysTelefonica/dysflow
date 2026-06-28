# Spec — CLI --help Consistency (#591)

## Context

Three subcommands handle `--help` inconsistently:

- `dysflow mcp --help` — `src/cli/commands/mcp.ts:11-14` rejects `--help` as unknown arg, returns exit 1 with usage on stderr.
- `dysflow doctor --help` — `src/cli/commands/doctor.ts:20-31` ignores the args and runs the full diagnostics service (a side effect).
- `dysflow access --help` — `src/cli/commands/access.ts:59-62` falls through to "Unknown access subcommand" because `--help` is parsed as the subcommand name.

The contract for ALL subcommands MUST be: `--help` / `-h` exits 0, prints usage to stdout, and performs NO operational side effects (no PowerShell spawn, no Access COM, no filesystem mutation beyond reading config).

## MODIFIED Requirements

### Requirement: `dysflow <subcommand> --help` MUST exit 0 with no side effects

For each of `mcp`, `doctor`, `access`:

- When `args[0]` is `--help` or `-h`, the handler MUST return `{ exitCode: 0, stdout: <usage>, stderr: "" }` without invoking `loadDysflowConfig`, `PowerShell`, `Access`, `runner`, or any operational service.

#### Scenario: `dysflow mcp --help` returns usage with no side effects

- **Given** the CLI dispatcher receives `["mcp", "--help"]`
- **When** the handler runs
- **Then** the result has `exitCode === 0`
- **And** `stdout` is non-empty and contains the string `mcp`
- **And** `stderr` is empty
- **And** `loadDysflowConfigAsync` is NOT called
- **And** `startMcpStdioAdapter` is NOT called

#### Scenario: `dysflow doctor --help` returns usage with no side effects

- **Given** the CLI dispatcher receives `["doctor", "--help"]`
- **When** the handler runs
- **Then** the result has `exitCode === 0`
- **And** `stdout` is non-empty and contains the string `doctor`
- **And** `stderr` is empty
- **And** `diagnosticsService.run` is NOT called
- **And** `checkMcpWiring` is NOT called

#### Scenario: `dysflow access --help` returns usage with no side effects

- **Given** the CLI dispatcher receives `["access", "--help"]`
- **When** the handler runs
- **Then** the result has `exitCode === 0`
- **And** `stdout` is non-empty and contains the string `access`
- **And** `stderr` is empty
- **And** `loadDysflowConfig` is NOT called
- **And** `AccessPowerShellRunner` is NOT instantiated

### Requirement: `-h` MUST behave identically to `--help`

The same `args[0] === "-h"` case MUST produce the same result as `args[0] === "--help"` for every subcommand.

#### Scenario: `dysflow mcp -h` returns the same usage as `--help`

- **Given** the CLI dispatcher receives `["mcp", "-h"]`
- **When** the handler runs
- **Then** the result equals the result for `["mcp", "--help"]`

### Requirement: Help text MUST be visible to the user

The CLI dispatcher MUST print help to `stdout`, not `stderr`. Tests assert on the `stdout` field, which is the user-visible channel for command usage.

#### Scenario: Help stdout is non-empty for every subcommand

- **Given** a subcommand receives `--help`
- **When** the handler returns
- **Then** the `stdout` field length is `> 0`

## Cross-references

- Affected capability: `cli-help`
- Issue: #591
- Files modified: `src/cli/index.ts` (dispatch layer help handling), `src/cli/commands/mcp.ts`, `src/cli/commands/doctor.ts`, `src/cli/commands/access.ts` (defense in depth at handler level)
- Test path: `test/cli/subcommand-help.test.ts` (new)
