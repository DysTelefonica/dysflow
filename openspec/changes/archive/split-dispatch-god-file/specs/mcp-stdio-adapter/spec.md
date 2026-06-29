# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: Dispatch Decomposition Preserves MCP Tool Contract

When MCP dispatch internals are decomposed, the adapter MUST preserve the observable MCP tool contract. Registered tool names, hidden flags, schemas, parameter aliases, read/write gates, and handler results SHALL remain unchanged for existing MCP clients.

#### Scenario: Tool registration remains stable
- GIVEN the MCP stdio adapter registers its tool list before and after dispatch decomposition
- WHEN a client requests the registered tools
- THEN the same tool names, schemas, descriptions, and hidden flags MUST be exposed
- AND no new, removed, or renamed MCP tool SHALL appear because of the refactor

#### Scenario: Dispatch result remains stable
- GIVEN an existing MCP tool call with valid inputs and a fake core service response
- WHEN the call is handled through the MCP adapter after decomposition
- THEN the returned MCP content MUST match the pre-decomposition behavior
- AND the same core boundary operation SHALL be observable at the adapter port

#### Scenario: Read-mode write guard remains stable
- GIVEN a read-only MCP query tool receives SQL that is rejected today
- WHEN dispatch handling runs after decomposition
- THEN it MUST still reject the input with the same safe MCP input-invalid outcome
- AND permitted read-only SELECT or CTE inputs SHALL still pass through unchanged

### Requirement: Dispatch Refactor Tests Are Port-Level

Strict TDD MUST characterize MCP dispatch behavior before production decomposition. Tests SHALL assert observable adapter-port behavior and MUST NOT depend on the new module layout, private helper names, import graph, or internal call order.

#### Scenario: RED coverage precedes production split
- GIVEN a dispatch behavior not already protected by port-level tests
- WHEN implementation starts
- THEN a failing Vitest expectation MUST be added first using `pnpm test`
- AND production changes SHALL wait until the RED failure proves the missing behavior contract

#### Scenario: Tests survive internal file movement
- GIVEN dispatch code is split into focused adapter modules without behavior changes
- WHEN `pnpm test` runs
- THEN MCP adapter tests MUST pass without rewriting assertions for file paths or private helpers
- AND mocks SHALL remain limited to legitimate I/O or core-service boundaries

#### Scenario: Clean architecture boundary remains intact
- GIVEN the MCP adapter depends on core contracts
- WHEN dispatch responsibilities are moved between adapter modules
- THEN no core module SHALL import from `src/adapters/mcp`
- AND dispatch behavior SHALL remain exposed only through adapter-facing public APIs
