# Delta for product-cli

## MODIFIED Requirements

### Requirement: Command Surface

The system MUST expose a default `dysflow` dashboard entrypoint plus `dysflow mcp`, `setup`, `doctor`, `install`, `update`, `tui`, and planned `serve` commands through a single CLI entrypoint. `dysflow update` MUST update installed Dysflow from the latest published GitHub release when a newer release exists or `--force` is supplied.
(Previously: `update` only reinstalled when the local source checkout version was newer.)

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

#### Scenario: Update from newer GitHub release
- GIVEN the installed runtime version is older than the latest GitHub release
- WHEN `dysflow update` runs
- THEN it MUST download/build the release source
- AND install that version into the runtime directory
- AND report the previous and new versions

#### Scenario: Up-to-date release skip
- GIVEN the installed runtime version matches the latest GitHub release
- WHEN `dysflow update` runs without `--force`
- THEN it MUST skip reinstall
- AND report that the runtime is up to date

#### Scenario: Forced release reinstall
- GIVEN the installed runtime version matches the latest GitHub release
- WHEN `dysflow update --force` runs
- THEN it MUST reinstall the latest release
- AND report a version-to-same-version update

#### Scenario: Release update failure
- GIVEN GitHub resolution, download, build, or install fails
- WHEN `dysflow update` runs
- THEN it MUST return exit code 1
- AND print an actionable error message
