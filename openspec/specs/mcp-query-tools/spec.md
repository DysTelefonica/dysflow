# MCP Query Tools Specification

## Purpose

Defines backend/database target behavior for MCP generic SQL tools.

## Requirements

### Requirement: Generic SQL tools honor explicit database targets

Generic MCP SQL tools MUST execute against the caller-requested database target when a target is supplied. All query tools MUST preserve equivalent target behavior for equivalent inputs.

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

### Requirement: Override fields share a single pickOverrides helper

`buildQueryReadRequest`, `buildWriteFixtureRequest`, and
`buildMaintenanceRequest` in
`src/core/mapping/access-query-request-mapper.ts` MUST share one helper
`pickOverrides(params)` that returns the canonical 10-field override
shape (projectId, contextId, accessPath, backendPath, destinationRoot,
projectRoot, strictContext, expectedAccessPath, expectedProjectRoot,
expectedDestinationRoot). Each of the 3 builders MUST spread
`pickOverrides(params)` instead of inline-redeclaring the override block.
TypeScript MUST fail the build if any builder spreads the override block
inline.

(Addresses audit finding #F. The `timeoutMs` field stays in the per-builder
mapping because `coerceTimeoutMs` (next requirement) is its sole home.)

#### Scenario: All 3 builders produce identical override shapes (happy)

- **GIVEN** a fixed input object `params` containing every one of the 10
  override fields (the full set), one field omitted, and every field as a
  string
- **WHEN** each of `buildQueryReadRequest`, `buildWriteFixtureRequest`,
  and `buildMaintenanceRequest` runs with the same input
- **THEN** the override fields in each builder's output MUST be
  deep-equal to one another
- **AND** the result MUST be a deep-equal snapshot of the pre-refactor
  behavior (no behavior drift)

#### Scenario: `pickOverrides` is the single source (structural)

- **GIVEN** `src/core/mapping/access-query-request-mapper.ts`
- **WHEN** its override-handling code is inspected
- **THEN** exactly one function named `pickOverrides` MUST exist and
  return the override shape
- **AND** no override-spreading literal (e.g. an inline 10-field object
  with the override fields) MUST appear in any of the 3 builders

#### Scenario: missing-field default is `undefined` (regression)

- **GIVEN** a `params` object that omits some override fields
- **WHEN** `pickOverrides(params)` runs
- **THEN** those missing fields MUST be `undefined` in the result
- **AND** the builders MUST NOT default them to any new value
  (no accidental fallbacks introduced)

#### Scenario: snapshot regression for one builder (adversarial)

- **GIVEN** `buildQueryReadRequest` runs with an input that lacks
  `expectedAccessPath`
- **WHEN** the output is compared against the pre-refactor snapshot (a
  fixture in the test)
- **THEN** the output MUST deep-equal the snapshot
- **AND** any accidental default change (e.g. filling in a new value) MUST
  fail the snapshot test

### Requirement: timeoutMs coercion lives in coerceTimeoutMs

A single helper `coerceTimeoutMs(value: number | string | undefined): number | undefined`
MUST be the sole `timeoutMs` string→number coercion site in
`src/core/mapping/access-query-request-mapper.ts`. The 3 inline
`typeof === "string" ? parseFloat(...) : ...` blocks at lines 147-152,
190-195, 246-251 MUST be deleted. `pickOverrides(params)` MUST delegate
`timeoutMs` to `coerceTimeoutMs(params.timeoutMs)`.

Zod schemas declare `timeoutMs` as `z.number().optional()` — the string
branch in the deleted blocks is unreachable in practice (dead-by-Zod, not
"live coercion"). After the helper exists, the existing tests (which only
pass numbers or omit the field) MUST remain GREEN; no new string-passing
test SHOULD be added (would re-introduce the dead branch's reachability).

#### Scenario: mapper has a single coercion site (structural)

- **GIVEN** `src/core/mapping/access-query-request-mapper.ts`
- **WHEN** its `timeoutMs` handling is scanned
- **THEN** there MUST be exactly one `coerceTimeoutMs` function and
  exactly one call site (inside `pickOverrides`)
- **AND** the 3 inline `typeof === "string"` blocks MUST be deleted

#### Scenario: pickOverrides delegates to coerceTimeoutMs

- **GIVEN** a `params` object with `timeoutMs: 12345`
- **WHEN** `pickOverrides(params)` runs
- **THEN** the resulting `timeoutMs` field MUST be `12345` (number, not
  string)
- **AND** TypeScript MUST show `pickOverrides` calling `coerceTimeoutMs`
  on `params.timeoutMs`

#### Scenario: number pass-through is unchanged (regression)

- **GIVEN** `coerceTimeoutMs(12345)`
- **WHEN** called
- **THEN** it MUST return `12345`

#### Scenario: undefined pass-through is `undefined` (regression)

- **GIVEN** `coerceTimeoutMs(undefined)`
- **WHEN** called
- **THEN** it MUST return `undefined`

#### Scenario: dead string branch is unreachable (audit-imprecision surfaced)

- **GIVEN** the Zod schema for the 3 builders declares
  `timeoutMs: z.number().optional()`
- **WHEN** a caller passes `timeoutMs: "15000"` (a string, against the
  schema)
- **THEN** Zod MUST reject the string at parse time, BEFORE reaching
  `coerceTimeoutMs`
- **AND** the new `coerceTimeoutMs` helper MUST NOT silently accept a
  string — either it returns a `number | undefined` typed result, or it
  throws a `TypeError` for non-number input
- **AND** the audit's "dead branch" claim holds: the schema's number type
  makes the string branch unreachable in practice

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
