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

### Requirement: OpenCode MCP config uses a Windows-safe runtime entrypoint

Dysflow MUST generate OpenCode MCP configuration that avoids directly spawning the Windows `.cmd` launcher for MCP startup while preserving a functional `dysflow mcp` server startup.

#### Scenario: Install writes a non-cmd OpenCode MCP command

- **Given** Dysflow is installed on Windows
- **When** the user runs the install flow with OpenCode integration selected
- **Then** the generated OpenCode MCP command MUST NOT directly reference `dysflow.cmd`
- **And** it MUST invoke the installed runtime entrypoint with the `mcp` argument.

#### Scenario: Integration refresh preserves the safe OpenCode command

- **Given** an existing OpenCode integration is refreshed from Dysflow
- **When** the integration selection is applied again
- **Then** Dysflow MUST write the same Windows-safe MCP startup shape
- **And** it MUST NOT regress the command back to direct `.cmd` spawning.

#### Scenario: Wrapper fallback still avoids direct cmd spawn

- **Given** a fallback wrapper is required to preserve runtime environment behavior
- **When** Dysflow writes the OpenCode MCP command
- **Then** the wrapper MUST be explicit and test-covered
- **And** the configured command MUST still avoid OpenCode directly spawning `dysflow.cmd`.

#### Scenario: Runtime entrypoint cannot be resolved

- **Given** Dysflow cannot resolve the installed runtime entrypoint for OpenCode
- **When** the integration writer attempts to generate the MCP config
- **Then** Dysflow MUST fail with an actionable error
- **And** it MUST NOT silently persist an invalid OpenCode MCP command.

### Requirement: Non-OpenCode agent launchers remain unchanged

Dysflow MUST keep existing launcher behavior for non-OpenCode agent integrations unless the user explicitly selects OpenCode.

#### Scenario: Other agent configs keep their existing launcher

- **Given** the user selects a non-OpenCode agent integration
- **When** Dysflow writes that agent config
- **Then** the generated command SHOULD remain compatible with the existing launcher behavior for that agent
- **And** the OpenCode-specific startup fix MUST NOT change unrelated agent config formats.

