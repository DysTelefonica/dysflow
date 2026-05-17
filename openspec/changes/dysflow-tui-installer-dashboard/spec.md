# Spec: Dysflow TUI Installer Dashboard

## Requirement: Default TUI entrypoint

Dysflow MUST open the TUI when invoked without a command.

### Scenario: no-arg command opens TUI

Given a user runs `dysflow` with no arguments
When the CLI dispatches the command
Then it MUST call the TUI handler
And it MUST NOT print the generic help text by default.

### Scenario: explicit help remains available

Given a user runs `dysflow --help` or `dysflow -h`
When the CLI dispatches the command
Then it MUST print the help text
And it MUST NOT start the TUI.

## Requirement: Dashboard header

The TUI MUST render a compact dashboard header.

### Scenario: render local and latest versions

Given local version `0.2.0`
And latest repository version `0.2.1`
When the dashboard is rendered
Then it MUST include a small Dysflow ASCII logo
And it MUST include `local: 0.2.0`
And it MUST include `latest: 0.2.1`.

### Scenario: outdated update guidance

Given local version `0.2.0`
And latest repository version `0.2.1`
When the dashboard is rendered
Then it MUST display a short update instruction such as `pnpm add -g git+https://github.com/DysTelefonica/dysflow.git#v0.2.1`.

### Scenario: latest unavailable

Given latest repository version cannot be discovered
When the dashboard is rendered
Then it MUST still show the local version
And it MUST show latest as `unknown` or an equivalent non-fatal status.

## Requirement: Integration selection

The TUI MUST provide an integrations installer screen.

### Scenario: render selectable agents

Given supported agents are `codex`, `opencode`, `claude`, and `pi`
When the integrations screen is rendered
Then each agent MUST appear as a checkbox-style item
And existing Dysflow installs SHOULD be preselected.

### Scenario: selected agents are installed

Given `opencode` and `pi` are selected
When the user applies the integration selection
Then Dysflow MUST install/refresh MCP config for `opencode` and `pi`.

### Scenario: unselected agents are uninstalled

Given `codex` previously contains a Dysflow MCP entry
And `codex` is unselected
When the user applies the integration selection
Then Dysflow MUST remove only the Dysflow MCP entry from Codex config
And MUST preserve unrelated config.

## Requirement: Reviewable delivery

The feature MUST be delivered as chained PRs.

### Scenario: tracker and child PRs

Given issue #118 is approved
When implementation begins
Then a tracker branch/PR MUST hold SDD context
And child PRs MUST each represent one reviewable work unit.
