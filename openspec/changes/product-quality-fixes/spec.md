# Delta Spec: product-quality-fixes (GH #172–#179)

Issues: #172 #173 #174 #175 #176 #177 #178 #179
Capabilities modified: access-core-services, http-api-adapter, mcp-stdio-adapter, registry-concurrency-safety, repo-quality-gates

---

## Domain: access-core-services (#172)

## MODIFIED Requirements

### Requirement: Runner Boundary

The system MUST execute Access-related work only through a bounded runner interface with timeouts and sanitized outputs. WMI process timestamps MUST be converted from DMTF/CIM datetime format (`YYYYMMDDhhmmss.ffffff+ooo`) to ISO 8601 before being surfaced in operation results.
(Previously: no datetime format conversion requirement; raw WMI values were surfaced as-is)

#### Scenario: Service calls runner

- GIVEN a valid Access operation request
- WHEN a core service executes it
- THEN it SHALL call the runner boundary
- AND return a protocol-neutral result

#### Scenario: Runner timeout

- GIVEN a runner exceeds its timeout
- WHEN the service handles completion
- THEN it MUST return a timeout error

#### Scenario: WMI DMTF datetime converted to ISO (#172 — happy path)

- GIVEN the WMI `CreationDate` field contains a DMTF string such as `20240315143000.000000+000`
- WHEN `WindowsMsAccessProcessInspector` reads the process start time
- THEN `startTime` in the returned record MUST be a valid ISO 8601 string (e.g. `2024-03-15T14:30:00.000Z`)
- AND no `CLEANUP_PROCESS_START_TIME_MISMATCH` error SHALL be raised due to format mismatch

#### Scenario: ISO input passes through unchanged (#172 — passthrough)

- GIVEN the process start time is already an ISO 8601 string
- WHEN the inspector reads it
- THEN the value MUST be returned as-is without double-conversion

#### Scenario: Malformed DMTF string (#172 — edge case)

- GIVEN the WMI `CreationDate` field contains an unrecognized format
- WHEN the inspector attempts conversion
- THEN it MUST return a structured error rather than surfacing a raw invalid datetime

---

## Domain: http-api-adapter (#173, #176)

## MODIFIED Requirements

### Requirement: Local Guarded HTTP API

The system MUST bind to `127.0.0.1` by default, disable writes by default, and expose documented routes over core contracts. The SQL read guard MUST accept valid Jet SQL that contains semicolons inside string literals or subqueries while still rejecting multi-statement DML. The HTTP adapter and MCP adapter MUST share the same `FileAccessOperationRegistry` instance, so that operations created through either adapter are visible to the other.
(Previously: SQL guard treated any semicolon as a multi-statement marker; HTTP and MCP adapters held independent registry instances)

#### Scenario: Read route succeeds

- GIVEN the HTTP server is running locally
- WHEN a read request is received
- THEN it SHALL call core services and return JSON

#### Scenario: Write blocked by default

- GIVEN writes are not enabled
- WHEN a write request is received
- THEN it MUST reject the request safely

#### Scenario: SELECT with semicolon in string literal accepted (#173 — happy path)

- GIVEN a SQL query such as `SELECT * FROM T WHERE col = 'val;ue'`
- WHEN `isReadOnlySql` validates the query
- THEN the query MUST be accepted as read-only

#### Scenario: Two DML statements separated by semicolon rejected (#173 — regression safety)

- GIVEN a SQL string containing `INSERT INTO T VALUES (1); DELETE FROM T`
- WHEN `isReadOnlySql` validates the query
- THEN it MUST be rejected as a multi-statement write

#### Scenario: Subquery containing semicolon-like construct accepted (#173 — edge case)

- GIVEN a nested SELECT using a string with an embedded semicolon
- WHEN `isReadOnlySql` validates the query
- THEN string content MUST be stripped before top-level statement detection

#### Scenario: MCP-created operation visible via HTTP (#176 — shared registry)

- GIVEN an operation is created through the MCP stdio adapter
- WHEN `GET /access/operations` is called via the HTTP adapter
- THEN the operation MUST appear in the response
- AND its fields MUST match the values set at creation time

#### Scenario: Adapters start with same registry instance (#176 — regression safety)

- GIVEN the application composition root initializes both adapters
- WHEN either adapter accesses the operation registry
- THEN both MUST reference the same singleton instance

---

## Domain: mcp-stdio-adapter (#175, #177)

## MODIFIED Requirements

### Requirement: MCP Adapter Over Core

The system MUST register MCP tools that translate requests to core contracts and never embed HTTP behavior. Unimplemented legacy stub tools MUST NOT be advertised in `tools/list`. Each registered tool MUST expose a per-tool JSON Schema that covers exactly that tool's parameters, not a shared catch-all schema.
(Previously: 5 legacy stub tools were advertised in tools/list; a single 60-property legacySchemaForTool was used for all tools)

#### Scenario: MCP tool invokes core

- GIVEN an MCP tool request
- WHEN the adapter receives it
- THEN it SHALL call the matching core service
- AND translate the result to MCP output

#### Scenario: Core error returned

- GIVEN core returns an error
- WHEN the adapter responds
- THEN it MUST preserve a safe error message

#### Scenario: Stub tools absent from tools/list (#175 — happy path)

- GIVEN the MCP server is running
- WHEN a client sends `tools/list`
- THEN the response MUST NOT contain any of the 5 unimplemented legacy tool names
- AND the count of advertised tools MUST equal the count of tools with real handlers

#### Scenario: Calling a stub tool returns not-found error (#175 — regression safety)

- GIVEN an agent calls one of the formerly-advertised stub tool names
- WHEN the adapter processes the request
- THEN it MUST respond with a "tool not found" error
- AND the error MUST NOT say "not implemented" (no implementation detail leakage)

#### Scenario: Per-tool schema contains only that tool's params (#177 — happy path)

- GIVEN an agent reads the JSON Schema for `list_tables`
- WHEN it inspects the schema properties
- THEN only parameters relevant to `list_tables` MUST be present
- AND parameters specific to other tools (e.g. `seed_fixture` params) MUST NOT appear

#### Scenario: Invalid param triggers schema validation error (#177 — edge case)

- GIVEN an agent sends an unknown parameter for a registered tool
- WHEN the adapter validates the input
- THEN it MUST return a schema validation error referencing the invalid field
- AND the error MUST NOT propagate to the core service call

#### Scenario: Schema covers all registered tools (#177 — completeness)

- GIVEN the set of tools exposed via `tools/list`
- WHEN each tool name is looked up in the per-tool schema map
- THEN every tool MUST have a corresponding schema entry (no fallback to catch-all)

---

## Domain: registry-concurrency-safety (#179)

## MODIFIED Requirements

### Requirement: Registry Mutation Lock

The system MUST serialize shared registry mutations across processes. Read operations (`get`) MUST NOT acquire the mutation lock; they MUST operate on the last committed snapshot to avoid read contention during concurrent monitoring.
(Previously: get() behavior under lock was unspecified; reads may have contended with writers)

#### Scenario: Single writer enters

- GIVEN no process holds the registry mutation lock
- WHEN a writer mutates shared registry state
- THEN it MUST acquire the lock before writing
- AND it MUST release the lock after completion

#### Scenario: Competing writer waits or fails safely

- GIVEN another process holds the registry mutation lock
- WHEN a second writer attempts mutation
- THEN it MUST wait within a bounded timeout or fail without partial writes

#### Scenario: Concurrent reads produce no lock contention (#179 — happy path)

- GIVEN no mutation is in flight
- WHEN multiple callers invoke `get()` concurrently
- THEN no file lock MUST be acquired
- AND all callers MUST receive consistent data

#### Scenario: Concurrent get() and create() produce no torn read (#179 — edge case)

- GIVEN a `create()` mutation is in flight holding the lock
- WHEN `get()` is called concurrently
- THEN `get()` MUST NOT block on the mutation lock
- AND the returned value MUST be either the snapshot before or after the write — never a partial state

---

## Domain: repo-quality-gates (#178, #174)

## MODIFIED Requirements

### Requirement: CI Quality Gate

The system MUST run test, build, lint, and coverage checks for pull requests. Coverage thresholds MUST be set to non-zero numeric floors in `vitest.config.ts` and MUST be asserted as numeric values in the quality-gate test suite. E2E fixture assertions MUST validate that `rows` is an array with the expected shape, not a plain object.
(Previously: coverage thresholds were zero or unset; E2E row-shape assertion used skipIf that masked a type error)

#### Scenario: Pull request gate

- GIVEN a pull request changes repository code
- WHEN CI runs
- THEN it MUST execute `pnpm test` and `pnpm build`
- AND it SHALL execute lint and coverage when configured

#### Scenario: Gate unavailable

- GIVEN lint or coverage is not configured
- WHEN the gate is evaluated
- THEN the repository MUST document the missing gate and follow-up owner

#### Scenario: Non-zero coverage thresholds enforced (#178 — happy path)

- GIVEN coverage thresholds in `vitest.config.ts` are set to non-zero floors
- WHEN `pnpm test` runs on the current codebase
- THEN it MUST pass (floors calibrated below current measured coverage)

#### Scenario: Coverage drop below floor fails CI (#178 — regression safety)

- GIVEN coverage thresholds are configured
- WHEN a change causes measured coverage to fall below any floor
- THEN `pnpm test` MUST exit non-zero and report the failed threshold

#### Scenario: Quality-gate test asserts numeric floors (#178 — assertability)

- GIVEN the quality-gate test in `ci-workflow.test.ts`
- WHEN it reads `vitest.config.ts` coverage thresholds
- THEN it MUST assert each threshold is a number greater than zero
- AND the assertion MUST fail if any threshold is set to zero or omitted

#### Scenario: E2E rows assertion matches array shape (#174 — happy path)

- GIVEN the e2e fixture runner returns a `rows` property containing an array of row objects
- WHEN the E2E assertion evaluates the result
- THEN it MUST assert `rows` is an array
- AND it MUST assert `rows[0]` matches the expected row field shape

#### Scenario: E2E assertion is not skipped (#174 — regression safety)

- GIVEN the row-shape assertion exists in the E2E test
- WHEN the test runs
- THEN the assertion MUST execute (no `skipIf` or conditional bypass)
- AND a type mismatch between expected and actual shape MUST cause the test to fail

### Requirement: Review Budget

The delivery plan MUST protect the 400 changed-line review budget unless a maintainer records `size:exception`.

#### Scenario: Oversized forecast

- GIVEN planned work may exceed 400 changed lines
- WHEN tasks are created
- THEN they MUST recommend chained PR slices or require `size:exception`
