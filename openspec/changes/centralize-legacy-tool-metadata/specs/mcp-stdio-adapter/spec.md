# MCP stdio adapter spec delta

## ADDED Requirements

### Requirement: Legacy maintenance access mode MUST be declared centrally
Maintenance query tools MUST get their read/write mode from central legacy metadata instead of adapter-local name conditionals.

#### Scenario: read-only maintenance tool
- **Given** `list_links` is dispatched
- **When** the MCP adapter creates an Access query request
- **Then** the request mode is `read`
- **And** that mode comes from the legacy parity registry metadata

#### Scenario: write maintenance tool
- **Given** `compact_repair` is dispatched
- **When** the MCP adapter creates an Access query request
- **Then** the request mode is `write`
