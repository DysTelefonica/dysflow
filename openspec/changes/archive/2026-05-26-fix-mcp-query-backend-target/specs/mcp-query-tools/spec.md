# Delta for MCP Query Tools

## ADDED Requirements

### Requirement: Generic SQL tools honor explicit database targets

Generic MCP SQL tools MUST execute against the caller-requested database target when a target is supplied. Legacy and modern query tools MUST preserve equivalent target behavior for equivalent inputs.

#### Scenario: Modern read query uses an explicit backend target

- GIVEN a project whose backend contains a table that is absent from the frontend
- WHEN `dysflow_dysflow_query_execute` receives read SQL with an explicit backend database target
- THEN the SQL MUST execute against that backend target
- AND the result MUST NOT fail because the frontend lacks the table

#### Scenario: Legacy read query keeps target parity

- GIVEN the same SQL and explicit backend target are sent through `dysflow_query_sql`
- WHEN the legacy tool delegates the request
- THEN it MUST execute against the same target as the modern read query path

#### Scenario: Missing target preserves default behavior

- GIVEN a generic SQL request without `backendPath`, `databasePath`, or `sourcePath`
- WHEN the query tool handles the request
- THEN it MUST use the existing default frontend/current database behavior
- AND it MUST NOT invent a backend override

### Requirement: Write safety remains target-aware and guarded

Generic write SQL tools MUST retain existing dry-run, allow-list, deny-list, and write-mode guards while applying any explicit database target only after the request is authorized.

#### Scenario: Blocked write is not executed on backend

- GIVEN a write SQL request with an explicit backend target and a denied table
- WHEN the write guard rejects the request
- THEN no SQL MUST execute against the backend target
- AND the rejection MUST report the guard failure rather than a target-resolution failure

#### Scenario: Allowed write uses the requested target

- GIVEN an authorized write SQL request with an explicit backend target
- WHEN the write operation executes
- THEN it MUST execute against the requested backend target
- AND existing dry-run behavior MUST remain unchanged

### Requirement: Deterministic backend-target regression coverage

Backend-target regressions MUST be covered by deterministic tests. Access-backed regression tests MAY be skipped only when the local Access/runtime fixture is unavailable and the skip reason is explicit.

#### Scenario: Access-backed backend table regression is deterministic

- GIVEN a controlled backend fixture with a known table and rows
- WHEN a generic read query targets that backend
- THEN the test MUST assert concrete returned rows from that fixture
- AND teardown MUST remove only deterministic test data

#### Scenario: Access runtime unavailable is explicit

- GIVEN the Access runtime or backend fixture prerequisites are unavailable
- WHEN the regression suite runs
- THEN the Access-backed case MAY be skipped with an explicit reason
- AND non-Access unit tests MUST still run
