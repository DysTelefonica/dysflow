# Proposal: MCP and HTTP Request Shaping, SQL Consolidation, and Port Hardening

## Intent

Standardize HTTP parameter extraction, consolidate read-only SQL validation to support CTEs, and reduce test-only exposure of VBA sync methods.

## Scope

### In Scope
- Define a canonical `looksLikeReadOnlySql` in core utility with CTE support (`WITH ... SELECT`).
- Replace unsafe `as string` casts in `src/adapters/http/server.ts` with type-safe parameters validation/extraction helpers.
- Simplify MCP query, write, and maintenance tool argument mapping using declarative helpers.
- Reduce method visibility in `VbaSyncAdapter` (`validateStrictContext`, `resolveExecutionTarget`, `runPreflightCleanup`, `executeMappedTool`) from `public` to `private`.
- Refactor tests to assert exclusively at the public port boundary (`execute()`).

### Out of Scope
- Modifying standard Access VBA execution engine or COM interfaces.
- Supporting write CTE statements (e.g. `WITH ... INSERT/UPDATE/DELETE`) in read mode.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `http-api-adapter`: Allow CTEs (`WITH ... SELECT`) on `/query/read` route under consolidated `looksLikeReadOnlySql` check.
- `mcp-stdio-adapter`: Expose consolidated `looksLikeReadOnlySql` for tool query execution validation and simplify parameter mapping via declarative helpers.

## Approach

1. **Consolidated Heuristic**: Move `looksLikeReadOnlySql` to `src/core/utils/index.ts`. Strip comments/literals, verify one statement starting with `select` or `with`, and deny write keywords.
2. **HTTP Parameter Helpers**: Implement a validation/extraction helper in the HTTP server to parse typed fields and remove `as string` casts.
3. **MCP Argument Helpers**: Implement helper/mapping functions in `tools.ts` to handle parameter fallbacks (e.g. `tableName` / `table`) declaratively.
4. **VBA Sync Visibility**: Mark execution target, strict context, and preflight methods private in `VbaSyncAdapter`. Pass bound adapter methods through anonymous wrappers to sub-adapters.
5. **Test Refactoring**: Assert strict context, target resolution, and preflight behavior solely via the public `execute()` port.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/utils/index.ts` | Modified | Add canonical `looksLikeReadOnlySql` with CTE support. |
| `src/adapters/http/server.ts` | Modified | Use type-safe validation/extraction, delegate to new `looksLikeReadOnlySql`. |
| `src/adapters/mcp/tools.ts` | Modified | Refactor `rejectWriteSqlInReadMode` to use core helper, introduce declarative parameter mappers. |
| `src/adapters/vba-sync/vba-sync-adapter.ts` | Modified | Reduce method visibility from public to private. Define delegate interfaces. |
| `test/adapters/http/server.test.ts` | Modified | Add tests for CTE queries and update validation expectations. |
| `test/adapters/mcp/tools.test.ts` | Modified | Update tests for unified read-only check. |
| `test/adapters/vba-sync/vba-sync-adapter.test.ts` | Modified | Refactor to invoke the public `execute()` method. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| CTE check fails to block write CTEs | Low | Strict denylist pattern checks for write keywords (`delete`, `insert`, etc.) in the SQL string. |
| Refactored tests lose test coverage depth | Low | Assert behavior and failure codes through the public boundary `execute` precisely. |

## Rollback Plan

Revert git branch changes to the main integration commit and rebuild.

## Dependencies

- None

## Success Criteria

- [ ] `looksLikeReadOnlySql` successfully allows CTE read queries and rejects write CTEs.
- [ ] No unsafe `as string` casts remain in `src/adapters/http/server.ts`.
- [ ] Boilerplate field fallback logic in `src/adapters/mcp/tools.ts` is reduced.
- [ ] Class methods in `VbaSyncAdapter` are private, and tests verify logic through public `execute`.
- [ ] `pnpm test` passes cleanly.
