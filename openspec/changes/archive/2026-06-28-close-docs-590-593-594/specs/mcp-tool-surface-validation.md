# Spec: MCP Tool Surface Validation

## Requirement

The README MCP tool surface documentation MUST stay aligned with the MCP adapter's advertised `tools/list` surface.

## Scenarios

### Scenario: README visible count matches runtime-advertised tools

- **Given** the MCP adapter can construct its advertised tool list
- **When** the README states the visible MCP tool count
- **Then** every stated count MUST equal the number of non-hidden tools returned by the adapter

### Scenario: README inventory includes every advertised tool

- **Given** a tool name appears in the adapter's visible MCP tool list
- **When** a maintainer reads the README MCP sections
- **Then** the tool name MUST appear in the README inventory or core MCP tool list

### Scenario: newly added tools cannot silently miss documentation

- **Given** a future change adds, removes, hides, or renames an MCP tool
- **When** the docs gate runs in CI
- **Then** the gate MUST fail until the README visible count and inventory are updated
