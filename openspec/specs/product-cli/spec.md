# product-cli Specification

## Purpose

Define the Dysflow command surface without coupling commands to adapters.

## Requirements

### Requirement: Command Surface
The system MUST expose a default `dysflow` dashboard entrypoint plus `dysflow mcp`, `setup`, `doctor`, `install`, `update`, `tui`, and planned `serve` commands through a single CLI entrypoint, and CI quality gates MUST NOT change command dispatch behavior.
(Previously: defined command dispatch without CI-preservation expectation.)

#### Scenario: Default TUI dispatch
- GIVEN no command arguments
- WHEN the CLI runs
- THEN it MUST dispatch to the TUI handler
- AND it MUST NOT print generic help by default

#### Scenario: Explicit help
- GIVEN `--help` or `-h`
- WHEN the CLI runs
- THEN it MUST print help
- AND it MUST NOT start the TUI

#### Scenario: Known command dispatch
- GIVEN a supported command
- WHEN the CLI runs under local execution or CI validation
- THEN it SHALL dispatch to that command handler
- AND return a structured exit result

#### Scenario: Unknown command
- GIVEN an unsupported command
- WHEN the CLI runs
- THEN it MUST fail with usage guidance

### Requirement: TUI Dashboard

The system MUST render a compact TUI dashboard with Dysflow branding and version status.

#### Scenario: Dashboard version status
- GIVEN a local Dysflow version
- WHEN the dashboard is rendered
- THEN it MUST show the local version
- AND it SHOULD show the latest known version when available
- AND it MUST treat unknown latest version as non-fatal

#### Scenario: Outdated guidance
- GIVEN the latest known version is newer than the local version
- WHEN the dashboard is rendered
- THEN it MUST show a short update instruction

### Requirement: Integration Selection

The system MUST support applying a TUI integration selection to Dysflow-owned MCP config entries.

#### Scenario: Selected agents are installed
- GIVEN one or more supported agents are selected
- WHEN the integration selection is applied
- THEN Dysflow MUST install or refresh the selected agents' MCP config entries

#### Scenario: Unselected agents are removed
- GIVEN a supported agent is unselected
- WHEN the integration selection is applied
- THEN Dysflow MUST remove only Dysflow-owned MCP config entries for that agent
- AND it MUST preserve unrelated config

#### Scenario: Claude config removal paths
- GIVEN Claude may use `.claude/settings.json` or Claude Desktop config
- WHEN Claude is unselected
- THEN Dysflow MUST remove Dysflow-owned MCP entries from both supported Claude config paths

### Requirement: Shared Install Utilities Module

`src/cli/install-utils.ts` MUST export `fileExists`, `readJson`, `writeJson`, `ensureObject`, `runCommand`, and `runCommandOutput`. These are the canonical implementations for file system and command helpers in the CLI layer.

#### Scenario: Helpers importable from install-utils
- GIVEN any CLI module needing `fileExists` or `runCommand`
- WHEN it imports
- THEN the symbol MUST be resolvable from `install-utils.ts`

### Requirement: Uninstall Does Not Import From install.ts

`uninstall.ts` MUST import shared helpers from `install-utils.ts`. It MUST NOT import any symbol from `install.ts`.
(Previously: `uninstall.ts` imported helpers directly from `install.ts`, creating a dependency on the install command module.)

#### Scenario: No install.ts import in uninstall
- GIVEN `uninstall.ts`
- WHEN its import graph is resolved
- THEN no transitive or direct import from `install.ts` SHALL exist

#### Scenario: Uninstall functions correctly after decoupling
- GIVEN `install.ts` is modified
- WHEN `uninstall.ts` executes
- THEN it MUST not be affected by changes to non-shared install logic

### Requirement: install.ts Imports From install-utils.ts

`install.ts` MUST import its file system and command helpers from `install-utils.ts` rather than defining them inline.
(Previously: helpers were defined inline in `install.ts`.)

#### Scenario: install.ts delegates helper calls
- GIVEN `install.ts` needs to call `fileExists` or `runCommand`
- WHEN the function executes
- THEN it MUST invoke the implementation from `install-utils.ts`

