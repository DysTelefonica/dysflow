# product-cli Specification

## Purpose

Define the Dysflow command surface without coupling commands to adapters.

## Requirements

### Requirement: Command Surface

The system MUST expose a default `dysflow` dashboard entrypoint plus `dysflow mcp`, `setup`, `doctor`, `install`, `update`, `tui`, and planned `serve` commands through a single CLI entrypoint.

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
- WHEN the CLI runs
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
