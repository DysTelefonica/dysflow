# Proposal: Move SQL Read-Only Guard Entirely Into Core

## Intent

Issue #444 (high-severity audit finding, `docs/AUDIT_2026-06-05.md` Weakness `mcp`) reports that `rejectWriteSqlInReadMode` in `src/adapters/mcp/dispatch.ts:106-115` reimplements SQL keyword extraction in the adapter layer on top of core's `looksLikeReadOnlySql` and `detectWriteSqlKeyword`. Two separate keyword lists (one inline in the adapter, one in `src/core/utils/index.ts`) can silently drift apart, producing inconsistent read-only enforcement across MCP, HTTP, and CLI surfaces.

The intent of this change is to make a single core function the authoritative source of truth for the read-only SQL check, and to leave adapters with only error formatting responsibility. All three read-mode entry points — MCP direct (`dysflow_query_execute`), MCP alias (`query_sql`), and HTTP `/query/read` — must go through the same core guard.

## Scope

### In Scope
- Move the read-only SQL guard from the MCP adapter into `AccessQueryService.execute` in core.
- Remove the adapter-level `rejectWriteSqlInReadMode` call from `buildAliasTools` and `createDysflowMcpTools` (alias and modern dispatch paths).
- Remove the adapter-level `looksLikeReadOnlySql` short-circuit from the HTTP `/query/read` handler; the handler now relies on the service's guard result and translates `INVALID_READ_ONLY_QUERY` to `HTTP_READ_ONLY_SQL_REQUIRED`.
- Update the affected port tests to assert delegation to the core guard instead of asserting the guard ran in the adapter.
- Keep `rejectWriteSqlInReadMode` exported as a compatibility shim from `src/adapters/mcp/dispatch.ts` so external consumers (and the contract test) keep working; the function may delegate to the core utility.

### Out of Scope
- New MCP tools, new HTTP routes, or new schema fields.
- Changes to `looksLikeReadOnlySql` or `detectWriteSqlKeyword` semantics (this change moves the call site, not the algorithm).
- Moving VBA-sync, runner, or config logic into core.
- Production runtime install / opencode config changes.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `mcp-stdio-adapter`: the spec gains a requirement declaring that the read-only SQL check is owned by core and that adapters only translate the failure. The existing "Consolidated SQL Validation for MCP Read Tools" requirement remains valid; this change tightens the contract by removing the adapter-level parallel implementation.

## Approach

Add the read-only check at the very start of `AccessQueryService.execute` for any request with `mode === "read"` and a non-empty `sql`. The check reuses the existing `looksLikeReadOnlySql` and `detectWriteSqlKeyword` utilities already in `src/core/utils/index.ts`. On rejection, the service returns `failureResult(createDysflowError("INVALID_READ_ONLY_QUERY", message))` with the same human-readable message the adapter used to produce.

Then delete the duplicate adapter-level call sites:

- `src/adapters/mcp/alias-tools.ts` — drop the `rejectWriteSqlInReadMode` precheck inside the `query_sql` alias handler.
- `src/adapters/mcp/tools.ts` — drop the `rejectWriteSqlInReadMode` precheck inside the `dysflow_query_execute` modern handler.
- `src/adapters/http/server.ts` — replace the local `looksLikeReadOnlySql` short-circuit with a call to `queryService.execute({ sql, mode: "read" })`; if the result has `error.code === "INVALID_READ_ONLY_QUERY"`, translate to HTTP 400 with `HTTP_READ_ONLY_SQL_REQUIRED`.

Tests are updated at the port: fakes now mirror the core guard (so behavior under test is identical to what the real service does) and the assertions prove delegation by checking `queryService.execute` was actually called with the offending SQL.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/services/query-service.ts` | Modified | New read-only guard at the start of `execute`; returns `INVALID_READ_ONLY_QUERY` failure when SQL is not read-only in `read` mode |
| `src/adapters/mcp/alias-tools.ts` | Modified | Removed `rejectWriteSqlInReadMode` call from `buildAliasTools`; delegates entirely to core |
| `src/adapters/mcp/tools.ts` | Modified | Removed `rejectWriteSqlInReadMode` call from `createDysflowMcpTools` for `dysflow_query_execute`; delegates entirely to core |
| `src/adapters/http/server.ts` | Modified | `/query/read` no longer pre-checks `looksLikeReadOnlySql`; calls `queryService.execute` and translates `INVALID_READ_ONLY_QUERY` to `HTTP_READ_ONLY_SQL_REQUIRED` |
| `test/adapters/mcp/tools.test.ts` | Modified | `FakeQueryService` mirrors the core guard; read-mode write tests now assert delegation to service |
| `test/adapters/http/server.test.ts` | Modified | `createFakeServices` mirrors the core guard; 9 read-mode write tests now assert the SQL reached the service |

## Open Design Forks

- Keep `rejectWriteSqlInReadMode` as a compatibility re-export vs. delete it entirely. Kept (re-exported from `dispatch.ts`) for the existing contract test and any external imports — no observable behavior change for consumers.
- Translate `INVALID_READ_ONLY_QUERY` in the HTTP adapter by checking `result.error.code` vs. catching a specific error type. Code-check keeps the change minimal and matches the existing `failureResult` shape.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Compatibility break for consumers of `rejectWriteSqlInReadMode` | Low | Re-export from `dispatch.ts`; no signature change |
| Drift between fakes and real core guard | Med | Fake logic mirrors `looksLikeReadOnlySql` + `detectWriteSqlKeyword` 1:1; same keyword set as core; the real service test (in `test/core`) is the authoritative check |
| HTTP behavior change (status code, error body) | Low | Same `HTTP_READ_ONLY_SQL_REQUIRED` code and HTTP 400 status; assertion updated but observable contract preserved |
| Read-mode guard in core might reject a SQL the adapter used to allow | Low | Same underlying utility (`looksLikeReadOnlySql`); no algorithm change |

## Rollback Plan

Revert the change. The single core guard can be removed from `AccessQueryService.execute` and the adapter-level precheck reinstated without any data, config, or runtime migration. The only fallout would be the divergence risk returns.

## Dependencies

- Existing `looksLikeReadOnlySql` and `detectWriteSqlKeyword` in `src/core/utils/index.ts` (no change to their semantics).
- Existing `INVALID_READ_ONLY_QUERY` error code and `failureResult` / `createDysflowError` contracts in `src/core/contracts/index.ts`.
- `docs/testing/testing-philosophy.md` — tests assert at the port, not on internal call order.

## Success Criteria

- [ ] A single core function (`AccessQueryService.execute`) is the authoritative source of truth for the read-only SQL check.
- [ ] The MCP adapter only formats/returns the error message; it does not duplicate keyword logic.
- [ ] Both MCP dispatch paths (direct via `dysflow_query_execute` and alias via `query_sql`) use the shared core function.
- [ ] The HTTP `/query/read` handler delegates the check to the core service and translates the resulting `INVALID_READ_ONLY_QUERY` to `HTTP_READ_ONLY_SQL_REQUIRED`.
- [ ] Tests cover the behavior at the port (no implementation-coupled assertions per `docs/testing/testing-philosophy.md`).
