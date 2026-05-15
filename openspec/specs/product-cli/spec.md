# product-cli Specification

## Purpose

Define the Dysflow command surface without coupling commands to adapters.

## Requirements

### Requirement: Command Surface

The system MUST expose `dysflow mcp`, `setup`, `doctor`, `tui`, and planned `serve` commands through a single CLI entrypoint.

#### Scenario: Known command dispatch
- GIVEN a supported command
- WHEN the CLI runs
- THEN it SHALL dispatch to that command handler
- AND return a structured exit result

#### Scenario: Unknown command
- GIVEN an unsupported command
- WHEN the CLI runs
- THEN it MUST fail with usage guidance
