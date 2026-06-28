# Spec: MCP Tool Contract Surface (#587)

## ADDED Requirements

### Requirement: Shared MCP tool contract metadata

Overlapping modern and legacy/generated MCP tool capabilities MUST share safety/write metadata where practical so schema descriptions, write gates, and parity tests do not drift independently.

#### Scenario: write-gated tool metadata is consistent

- **Given** a tool mutates an Access binary, filesystem, linked-table connection, fixture table, or database object
- **When** its contract metadata is inspected
- **Then** the metadata MUST mark it as write-gated
- **And** generated descriptions MUST mention the relevant mutation/write-gate contract.

#### Scenario: read-only tool metadata is consistent

- **Given** a tool is read-only
- **When** its contract metadata is inspected
- **Then** the metadata MUST classify it as read-only
- **And** its generated/advertised description MUST NOT imply mutation.

#### Scenario: modern and legacy aliases overlap

- **Given** a modern `dysflow_*` tool and a legacy/generated alias expose overlapping behavior
- **When** parity tests compare their safety metadata
- **Then** both surfaces MUST agree on write-gate and read/write classification unless a documented exception exists.

### Acceptance Criteria

- Contract metadata is centralized or derived from a common source for overlapping tools.
- Parity tests cover divergence risks between modern and legacy/generated tool surfaces.
- Tool descriptions are guarded by tests or generated from metadata so safety wording stays aligned.
