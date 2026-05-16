# MCP stdio adapter spec delta

## ADDED Requirements

### Requirement: E2E MUST use the production MCP adapter contract
E2E testing assets MUST NOT maintain a copied MCP adapter implementation that can diverge from `src/adapters/mcp`.

#### Scenario: shadow adapter source is absent
- **Given** the repository contains an `E2E_testing` directory
- **When** architecture tests inspect `E2E_testing/src/adapters/mcp`
- **Then** no copied MCP adapter files are present

#### Scenario: E2E fixtures remain possible
- **Given** real Access E2E fixtures are local binary files
- **When** `.gitignore` is evaluated
- **Then** Access binary fixture extensions remain ignored
- **And** the whole `E2E_testing/` directory is not blanket-ignored

#### Scenario: helper code points at production behavior
- **Given** a TypeScript E2E helper is added later
- **When** architecture tests scan it
- **Then** it does not hardcode MCP version/schema behavior or bypass config propagation
