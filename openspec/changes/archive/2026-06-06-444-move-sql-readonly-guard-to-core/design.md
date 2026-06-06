# Design: Move SQL Read-Only Guard Entirely Into Core

## Technical Approach

Consolidate the read-only SQL check into `AccessQueryService.execute` in core. Adapters (MCP alias, MCP modern, HTTP) stop running their own keyword check and instead rely on the service's `OperationResult`. The HTTP adapter translates the resulting `INVALID_READ_ONLY_QUERY` failure to its own error code; the MCP adapters propagate the message through the existing `translateCoreResultToMcpContent` path.

This is a behavior-preserving consolidation. The keyword list, the heuristic, the error code, and the human-readable message are unchanged. Only the call site moves: from adapter to core.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Guard location | `AccessQueryService.execute` (core) at top of method, before the runner call | New `query-guard.ts` module in core; a guard middleware in the MCP adapter | Co-locates the check with the request it protects; no extra boundary to import; runner is never reached when SQL is non-read-only. |
| Single source of truth for the keyword list | Reuse `looksLikeReadOnlySql` and `detectWriteSqlKeyword` from `src/core/utils/index.ts` | Define a new core function that wraps both | These utilities already exist and are the only place the keyword list lives; no need for a third definition. |
| Adapter behavior | Stop running `rejectWriteSqlInReadMode`; rely on the service's `failureResult` | Re-implement the check in the adapter for defense in depth | Re-implementation reintroduces the drift the audit flagged. The core guard runs before the runner, so the SQL is never executed. |
| HTTP translation | Detect `result.error.code === "INVALID_READ_ONLY_QUERY"` and map to `HTTP_READ_ONLY_SQL_REQUIRED` (HTTP 400) | Throw a typed error and catch it | Code match is consistent with the existing `failureResult` shape and avoids a new error type for a single adapter. |
| Backwards compat for `rejectWriteSqlInReadMode` | Re-export from `src/adapters/mcp/dispatch.ts`; do not delete the function | Delete it; rename it | Contract test and any external consumers keep working; no signature change. |
| Tests | Update fakes to mirror the core guard 1:1 and assert delegation (service was called) | Drop the assertions entirely | Fakes need to know the guard exists so they don't accidentally pass a write SQL through. The "was the service called" assertion is the proof of delegation at the port. |

## Data Flow

```text
MCP alias  (query_sql)        MCP modern  (dysflow_query_execute)        HTTP /query/read
       │                              │                                       │
       ▼                              ▼                                       ▼
buildAliasTools               createDysflowMcpTools                       routeRequest
       │                              │                                       │
       │  no precheck                │  no precheck                            │  no precheck
       ▼                              ▼                                       ▼
queryService.execute({ sql, mode: "read" })  ◀─────── single core entry point ───
       │
       │  AccessQueryService.execute
       │  if mode === "read" && sql present && !looksLikeReadOnlySql(sql):
       │    return failureResult(createDysflowError("INVALID_READ_ONLY_QUERY", msg))
       │
       ▼
  runner.run (only if guard passes)
       │
       ▼
  OperationResult
       │
       ├── translateCoreResultToMcpContent ──▶ MCP text/isError
       │
       └── HTTP: if error.code === "INVALID_READ_ONLY_QUERY" → HTTP 400 + HTTP_READ_ONLY_SQL_REQUIRED
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/core/services/query-service.ts` | Modify | Add `looksLikeReadOnlySql` / `detectWriteSqlKeyword` to the import list. At the start of `execute`, if `request.mode === "read"` and `request.sql` is a non-empty string, return `failureResult(createDysflowError("INVALID_READ_ONLY_QUERY", message))` when the SQL is not read-only. |
| `src/adapters/mcp/alias-tools.ts` | Modify | Remove the `rejectWriteSqlInReadMode` import and the `invalidInput` precheck inside the `query_sql` alias handler. Handler now delegates to `queryService.execute` directly. |
| `src/adapters/mcp/tools.ts` | Modify | Remove the `request.mode === "read"` branch that called `rejectWriteSqlInReadMode`. The `dysflow_query_execute` handler now relies on the core service. |
| `src/adapters/http/server.ts` | Modify | Remove the `looksLikeReadOnlySql` import. In the `/query/read` branch, call `queryService.execute` first; if the result has `error.code === "INVALID_READ_ONLY_QUERY"`, return HTTP 400 with `HTTP_READ_ONLY_SQL_REQUIRED`; otherwise forward the result. |
| `test/adapters/mcp/tools.test.ts` | Modify | `FakeQueryService.execute` now mirrors the core guard (same `looksLikeReadOnlySql` / `detectWriteSqlKeyword` call). Two test cases ("blocks DDL via query_sql", "blocks DDL via dysflow_query_execute") renamed and re-asserted to prove the call reached the service (`query.requests` has length 1, content contains `INVALID_READ_ONLY_QUERY`). |
| `test/adapters/http/server.test.ts` | Modify | `createFakeServices.queryService.execute` mirrors the core guard. 9 test cases updated to assert the offending SQL reached the service (`services.calls.queries` has length 1) and the HTTP response is 400 with `HTTP_READ_ONLY_SQL_REQUIRED`. |

## Interfaces / Contracts

- No new public API.
- No new error code in core (`INVALID_READ_ONLY_QUERY` is reused).
- The HTTP adapter still emits `HTTP_READ_ONLY_SQL_REQUIRED` (HTTP 400) for read-only violations.
- `rejectWriteSqlInReadMode` remains importable through `src/adapters/mcp/dispatch.ts` for the contract test (and any external consumer); it still delegates to `detectWriteSqlKeyword` in `src/core/utils/index.ts`, so it is the same code path, not a parallel implementation.

Clean-architecture boundary: `src/core/**` continues to have no imports from `src/adapters/**`. The guard lives in core, the adapters consume it.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Port: MCP alias | `query_sql` rejects write SQL by delegating to the service | Fake service mirrors the guard; assert the call reached the service and the MCP result is `isError: true` with `INVALID_READ_ONLY_QUERY` in the text |
| Port: MCP modern | `dysflow_query_execute` with `mode: "read"` rejects write SQL by delegating to the service | Same shape as alias test, with `mode: "read"` |
| Port: HTTP | `/query/read` rejects write SQL with HTTP 400 + `HTTP_READ_ONLY_SQL_REQUIRED` by delegating to the service | Fake service mirrors the guard; assert the call reached the service and the response body has the HTTP code |
| Port: HTTP, edge cases | CTE write, multi-statement, `SELECT * INTO`, DDL after SELECT | Same port-level assertion; the keyword set is exhaustive at the core level |
| Regression | Existing read-only and CTE pass-through tests stay green | `pnpm test` |

No implementation-coupled assertions: tests assert observable outcomes (MCP result text / HTTP body code / captured service request). They do not assert on adapter call order, internal helper names, or how many times the guard ran.

## Migration / Rollout

No data, schema, config, or runtime migration. Implementation in a single PR — the change is small (one new check in core, three removals in adapters, two test fakes updated). Well under the 400-line review budget.

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Add core guard; remove adapter prechecks; update tests | Single review slice; run `pnpm test` |

## Open Questions

None.
