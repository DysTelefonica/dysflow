# Delta for product-cli

## MODIFIED Requirements

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
