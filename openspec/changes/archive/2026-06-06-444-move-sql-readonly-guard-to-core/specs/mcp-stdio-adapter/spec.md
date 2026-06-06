# Delta for mcp-stdio-adapter

## ADDED Requirements

### Requirement: SQL Read-Only Guard Authority

The read-only SQL check for any MCP or HTTP read-mode entry point MUST be owned by core. A single core function — `AccessQueryService.execute` — is the authoritative source of truth for deciding whether a `mode: "read"` request may proceed. Adapters MUST NOT re-implement the keyword heuristic. Adapters MAY format or translate the error code returned by the core service; they MUST NOT run a parallel keyword list before delegating to the service.

#### Scenario: MCP modern handler delegates to the core guard

- GIVEN the MCP stdio adapter handles a `dysflow_query_execute` call with `mode: "read"` and a non-empty `sql`
- WHEN the adapter invokes the core service
- THEN the call MUST reach `queryService.execute` exactly once
- AND the result MUST come from the core guard (i.e., either the core service's own guard or a fake service that mirrors the core guard)
- AND the adapter MUST NOT run a separate keyword check before calling the service

#### Scenario: MCP alias handler delegates to the core guard

- GIVEN the MCP stdio adapter handles a `query_sql` alias call with a non-empty `sql`
- WHEN the adapter invokes the core service
- THEN the call MUST reach `queryService.execute` exactly once
- AND the result MUST come from the core guard
- AND the alias handler MUST NOT run a separate keyword check before calling the service

#### Scenario: HTTP read route delegates to the core guard

- GIVEN the HTTP adapter handles a `POST /query/read` request with a non-empty `sql`
- WHEN the handler invokes the core service
- THEN the call MUST reach `queryService.execute` exactly once
- AND when the result has `error.code === "INVALID_READ_ONLY_QUERY"`, the handler MUST translate it to HTTP 400 with error code `HTTP_READ_ONLY_SQL_REQUIRED`
- AND the handler MUST NOT run a separate `looksLikeReadOnlySql` check before calling the service

#### Scenario: Adapter does not duplicate keyword logic

- GIVEN the MCP stdio adapter or HTTP adapter receives a read-only request
- WHEN the implementation is inspected
- THEN no adapter module under `src/adapters/mcp/` or `src/adapters/http/` SHALL define its own list of forbidden SQL keywords
- AND any compatibility re-export of the old `rejectWriteSqlInReadMode` helper SHALL delegate to `detectWriteSqlKeyword` from `src/core/utils/index.ts` (no parallel list)

### Requirement: Port-Level Test Coverage for the Read-Only Guard

Tests that protect the read-only SQL check MUST be written at the adapter port. They MUST assert observable outcomes — MCP result text, HTTP response status/body, and the captured core service request — and MUST NOT assert on internal adapter call order, private helper names, or which module performs the guard. The fake services used in those tests MUST mirror the core guard 1:1 (same keyword set, same `looksLikeReadOnlySql` / `detectWriteSqlKeyword` calls) so that a test passing against the fake is meaningful for the real service.

#### Scenario: Read-mode write test proves delegation

- GIVEN an MCP or HTTP read-mode test sends a write SQL (DDL, DML, multi-statement, `SELECT ... INTO`, write CTE)
- WHEN the assertion runs
- THEN it MUST verify the SQL reached the core service (e.g., `queryService.requests.length === 1`)
- AND it MUST verify the error reaches the user (MCP `isError: true` with `INVALID_READ_ONLY_QUERY` text, or HTTP 400 with `HTTP_READ_ONLY_SQL_REQUIRED`)
- AND it MUST NOT assert "the service was never called" (that is no longer the expected behavior under the consolidated guard)

#### Scenario: Test survives a future file or module move

- GIVEN the test imports from `src/adapters/mcp/tools` or `src/adapters/http/server` and uses a fake core service
- WHEN adapter internals are reorganized
- THEN the test MUST continue to pass without rewriting assertions for the new file layout
- AND fakes MUST remain limited to legitimate I/O or core-service boundaries

#### Scenario: Clean architecture boundary remains intact

- GIVEN the MCP and HTTP adapters depend on core contracts
- WHEN the read-only guard consolidation is complete
- THEN no core module SHALL import from `src/adapters/mcp` or `src/adapters/http`
- AND the read-only check SHALL be exposed only through the core service contract, not through adapter helpers
