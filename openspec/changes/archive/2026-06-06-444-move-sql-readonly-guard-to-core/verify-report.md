# Verification Report: Move SQL Read-Only Guard Entirely Into Core

## Verdict

PASS

## Change

- Change: `444-move-sql-readonly-guard-to-core`
- Issue: #444
- Mode: hybrid SDD (`openspec` + Engram)
- Strict TDD: expected for this repo; runtime-level TDD evidence collected on port layers.

## Evidence

| Command | Result |
|---|---|
| `pnpm -s vitest run test/adapters/mcp/tools.test.ts test/adapters/http/server.test.ts` | PASS — 2 files, 102 tests |
| `pnpm -s tsc -p tsconfig.json --noEmit` | PASS |
| `pnpm -s tsc -p tsconfig.test.json --noEmit` | PASS |
| `pnpm -s build` | PASS |
| `pnpm -s biome check src/core/services/query-service.ts test/adapters/mcp/tools.test.ts test/adapters/http/server.test.ts src/adapters/mcp/tools.ts src/adapters/mcp/alias-tools.ts src/adapters/http/server.ts` | PASS |
| `pnpm -s test` | PASS — 71 files passed |
| `pnpm -s test test/cli/install-utils.test.ts` | PASS — readJson expectation suite fixed |

## Completeness

- Phase 1: ✅
- Phase 2: ✅
- Phase 3: ✅
- Phase 4.1: ✅

## Spec Compliance Matrix

| Requirement | Scenario | Evidence | Status |
|---|---|---|---|
| SQL Read-Only Guard Authority | MCP modern handler delegates to core guard | `test/adapters/mcp/tools.test.ts` (`blocks DDL via dysflow_query_execute with mode read by delegating to queryService`) asserts one `queryService.execute` call and `INVALID_READ_ONLY_QUERY` text | ✅ |
| SQL Read-Only Guard Authority | MCP alias handler delegates to core guard | `test/adapters/mcp/tools.test.ts` (`blocks DDL via query_sql tool by delegating to queryService`) asserts one `queryService.execute` call and `INVALID_READ_ONLY_QUERY` text | ✅ |
| SQL Read-Only Guard Authority | HTTP read route delegates to core guard | `test/adapters/http/server.test.ts` (`rejects write SQL on the read route...`) validates `services.calls.queries` has the exact SQL and `HTTP 400 + HTTP_READ_ONLY_SQL_REQUIRED` | ✅ |
| SQL Read-Only Guard Authority | Adapters do not duplicate keyword heuristic | Static review of `src/adapters/mcp/alias-tools.ts`, `src/adapters/mcp/tools.ts`, `src/adapters/http/server.ts` and `src/adapters/mcp/dispatch-factory.ts` + compatibility function delegates to `detectWriteSqlKeyword` | ✅ |
| Port-Level Coverage | MCP read-mode write rejection proves delegation | `test/adapters/mcp/tools.test.ts` now asserts request reaches service and `INVALID_READ_ONLY_QUERY` outcome for read-mode DDL/DML inputs | ✅ |
| Port-Level Coverage | HTTP read-route write rejection proves delegation | `test/adapters/http/server.test.ts` asserts `services.calls.queries.length === 1` for write and CTE/write-like inputs, and 400/`HTTP_READ_ONLY_SQL_REQUIRED` | ✅ |

## Correctness

| Area | Status | Notes |
|---|---|---|
| Core ownership | ✅ | `AccessQueryService.execute` now owns read-mode guard (`looksLikeReadOnlySql` + `detectWriteSqlKeyword`) and returns `INVALID_READ_ONLY_QUERY` before runner invocation. |
| MCP adapter behavior | ✅ | Alias and modern query handlers no longer run local keyword checks; they pass SQL to core. |
| HTTP adapter behavior | ✅ | `/query/read` always calls `queryService.execute` with `mode: "read"`; maps core error code to `HTTP_READ_ONLY_SQL_REQUIRED` only on expected guard rejection. |
| Compatibility contract | ✅ | `rejectWriteSqlInReadMode` remains exported and continues delegating to `detectWriteSqlKeyword` for compatibility. |

## Design Coherence

- ✅ Guard moved to core and used consistently across MCP + HTTP.
- ✅ Adapters retain transport-level responsibility only (validation/mapping/translation).
- ✅ No adapter-local forbidden keyword list was added in touched transport files.

## Issues

### CRITICAL

- None for this change.

### SUGGESTION

- If you want separate changelog granularity, split `install-utils` JSON validation hardening into its own follow-up SDD change.

## Diff Reviewed

- `src/core/services/query-service.ts`
- `src/adapters/mcp/alias-tools.ts`
- `src/adapters/mcp/tools.ts`
- `src/adapters/http/server.ts`
- `test/adapters/mcp/tools.test.ts`
- `test/adapters/http/server.test.ts`
- `src/cli/commands/install/file-utils.ts` *(follow-up validation hardening to recover full-suite green)

## Ready State

Implementation changes are verifiably aligned with task/spec intent and the full suite is green.
