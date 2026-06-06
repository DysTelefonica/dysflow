# Tasks: Move SQL Read-Only Guard Entirely Into Core

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150 total (under review budget) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-PR |
| Chain strategy | n/a |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Consolidate read-only guard into core, remove adapter prechecks, update port tests | PR 1 | Single small slice; full `pnpm test` on completion |

## Phase 1: Add Core Guard

- [x] 1.1 In `src/core/services/query-service.ts`, import `looksLikeReadOnlySql` and `detectWriteSqlKeyword` from `../utils/index.js` alongside the existing `isRecord` import.
- [x] 1.2 In `src/core/services/query-service.ts`, at the start of `AccessQueryService.execute` (before `runner.run`), add the read-only check: if `request.mode === "read"` and `request.sql` is a non-empty string, and `!looksLikeReadOnlySql(request.sql)`, return `failureResult(createDysflowError("INVALID_READ_ONLY_QUERY", ...))` using the existing human-readable message (forbidden keyword in uppercase + the "Use exec_sql or dysflow_query_execute with mode \"write\"" hint).

## Phase 2: Remove Adapter Prechecks

- [x] 2.1 In `src/adapters/mcp/alias-tools.ts`, remove the `rejectWriteSqlInReadMode` import from `./dispatch-factory.js` and the precheck call inside the `query_sql` alias handler. The handler now calls `queryService.execute({ sql, mode: "read" })` directly.
- [x] 2.2 In `src/adapters/mcp/tools.ts`, remove the `if (request.mode === "read") { ... rejectWriteSqlInReadMode(request.sql) ... }` block inside the `dysflow_query_execute` handler. The handler now relies on the core service.
- [x] 2.3 In `src/adapters/http/server.ts`, remove the `looksLikeReadOnlySql` import from `../../core/utils/index.js`. In the `/query/read` branch, call `queryService.execute({ sql, mode: "read" })`; when the result has `error.code === "INVALID_READ_ONLY_QUERY"`, return the existing HTTP 400 + `HTTP_READ_ONLY_SQL_REQUIRED` response; otherwise forward the result.
- [x] 2.4 `rejectWriteSqlInReadMode` remains exported through `src/adapters/mcp/dispatch.ts` (the existing contract test and any external consumers keep working). No deletion needed.

## Phase 3: Update Port Tests

- [x] 3.1 In `test/adapters/mcp/tools.test.ts`, `FakeQueryService.execute` now mirrors the core guard: when `request.mode === "read"` and the SQL is non-empty, it runs the same `looksLikeReadOnlySql` / `detectWriteSqlKeyword` check and returns `INVALID_READ_ONLY_QUERY` on failure.
- [x] 3.2 In `test/adapters/mcp/tools.test.ts`, rename and update the "blocks DDL via query_sql" and "blocks DDL via dysflow_query_execute with mode read" test cases to assert delegation: `query.requests` has length 1 and the MCP result text contains `INVALID_READ_ONLY_QUERY`.
- [x] 3.3 In `test/adapters/http/server.test.ts`, `createFakeServices.queryService.execute` mirrors the core guard (same keyword set, same `looksLikeReadOnlySql` / `detectWriteSqlKeyword` calls).
- [x] 3.4 In `test/adapters/http/server.test.ts`, update 9 test cases that previously asserted "rejects write SQL ... before it reaches core services" to instead assert the SQL reached the service (`services.calls.queries` has length 1) and the HTTP response is 400 with `HTTP_READ_ONLY_SQL_REQUIRED`.

## Phase 4: Verification

- [x] 4.1 Run `pnpm test` and confirm all suites pass; no regressions on read-only SELECT / CTE pass-through tests.
- [x] 4.2 Verify clean architecture: `src/core/**` has no imports from `src/adapters/**`.
- [x] 4.3 Verify the audit acceptance criteria: a single core function owns the check; the adapter only formats the error message; both MCP dispatch paths use the shared core function; tests cover the behavior at the port with no implementation-coupled assertions.
- [x] 4.4 Record implementation commits in the "Implementation commits" table below during apply (per SDD traceability rules).

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `2e284ac` | Consolidate read-only guard into `AccessQueryService.execute`; remove `rejectWriteSqlInReadMode` prechecks from `buildAliasTools`, `createDysflowMcpTools`, and `/query/read`; update `FakeQueryService` (MCP) and `createFakeServices.queryService` (HTTP) to mirror the core guard; update 11 port tests to assert delegation | 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4 | `pnpm -s vitest run test/adapters/mcp/tools.test.ts test/adapters/http/server.test.ts` (pass), `pnpm -s tsc -p tsconfig.json --noEmit` (pass), `pnpm -s test` (pass after fixing pre-existing `readJson` object-shape contract) | n/a (no Access/VBA binary in this change) |
