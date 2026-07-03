# Delta for `mcp-query-tools` — `2026-07-01-mcp-contract-safety`

Scope: Finding #6a — `dysflow_query_execute` (modern, write mode) MUST accept
and enforce `allowTables`/`denyTables` with the same semantics as the legacy
`exec_sql` (which routes through `buildWriteFixtureRequest`). The
`AccessQueryRequest` contract already carries both fields (`core/contracts/index.ts:197-198`)
and the atom lives at `shared/validation/schema-props.ts:110-121`. The gap is
in the `QUERY_EXECUTE_SCHEMA` declaration and the modern handler's request
builder at `tools.ts:108-121` (currently a bare `validatedInput as AccessQueryRequest`
cast that bypasses `buildWriteFixtureRequest`'s allow/deny handling).

## MODIFIED Requirements

### Requirement: Generic SQL tools honor explicit database targets

(Full block copied from `openspec/specs/mcp-query-tools/spec.md`; the
`dysflow_query_execute` read path is unchanged.)
(Previously: the modern and legacy read paths honored explicit backend targets;
write paths left the legacy `exec_sql` carrying `allowTables`/`denyTables`
but the modern `dysflow_query_execute` did not advertise them in its
schema.)

#### Scenario: Modern read query uses an explicit backend target

- GIVEN a project whose backend contains a table that is absent from the frontend
- WHEN `dysflow_dysflow_query_execute` receives read SQL with an explicit backend database target
- THEN the SQL MUST execute against that backend target
- AND the result MUST NOT fail because the frontend lacks the table

#### Scenario: Named alias read query keeps target parity

- GIVEN the same SQL and explicit backend target are sent through `dysflow_query_sql`
- WHEN the tool delegates the request
- THEN it MUST execute against the same target as the primary read query path

#### Scenario: Missing target preserves default behavior

- GIVEN a generic SQL request without `backendPath`, `databasePath`, or `sourcePath`
- WHEN the query tool handles the request
- THEN it MUST use the existing default frontend/current database behavior
- AND it MUST NOT invent a backend override

## ADDED Requirements

### Requirement: Write-Mode Table-Guard Parity

`QUERY_EXECUTE_SCHEMA` (`schemas/dysflow-schemas.ts:73-106`) MUST advertise
`allowTables` (string[]) and `denyTables` (string[]) on the modern
`dysflow_query_execute` write path. The modern handler MUST propagate those
fields onto the `AccessQueryRequest` it hands to `services.queryService.execute`
in write mode (same semantic as `buildWriteFixtureRequest` at
`core/mapping/access-query-request-mapper.ts:162-202`). `services.queryService.execute`
MUST honor them on this path. The legacy alias (`exec_sql`/`run_script`/
`create_table`/...) already does and stays unchanged.

#### Scenario: Schema advertises allowTables and denyTables

- GIVEN the modern `dysflow_query_execute` schema
- WHEN we inspect its `properties`
- THEN it MUST contain `allowTables: { type: "array", items: { type: "string" } }`
- AND it MUST contain `denyTables: { type: "array", items: { type: "string" } }`
- (Pin: extend or new test in `test/adapters/mcp/schemas.test.ts` —
  `QUERY_EXECUTE_SCHEMA exposes allowTables and denyTables`)

#### Scenario: write-mode request reaches the core service carrying both fields

- GIVEN a fake `queryService.execute` that records every `AccessQueryRequest`
- WHEN `dysflow_query_execute` is invoked with
  `{ sql: "INSERT INTO TbX VALUES (1)", mode: "write", allowTables: ["TbX"], denyTables: ["TbSecret"] }`
- THEN the captured request MUST carry `mode: "write"`, `allowTables: ["TbX"]`, `denyTables: ["TbSecret"]`
- AND `services.queryService.execute` MUST be called exactly once with that request
- (Pin: extend `test/adapters/mcp/tools.test.ts` — `dysflow_query_execute write mode passes allowTables/denyTables through to core service`)

#### Scenario: Table-mismatch table in denyTables blocks write at the core service

- GIVEN the same fake `queryService.execute` configured to return
  `failureResult({ code: "TABLE_DENIED" })` when the request's
  `denyTables` cover the SQL's target table
- WHEN `dysflow_query_execute` is invoked with
  `{ sql: "DROP TABLE TbSecret", mode: "write", denyTables: ["TbSecret"] }`
- THEN the MCP result MUST have `isError: true`
- AND `content[0].text` MUST match `/TABLE_DENIED/`
- (Pin: same file — `dysflow_query_execute write mode respects denyTables in core service`)

#### Scenario: Read-mode request is unaffected by table guards

- GIVEN the same fake
- WHEN `dysflow_query_execute` is invoked with `{ sql: "SELECT 1", mode: "read", denyTables: ["Any"] }`
- THEN the result MUST be a successful read
- AND `services.queryService.execute` MUST NOT report a `TABLE_DENIED`
- (Pin: same file — `dysflow_query_execute read mode ignores allowTables/denyTables`)
