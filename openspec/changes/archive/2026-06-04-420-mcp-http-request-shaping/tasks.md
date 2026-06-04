# Tasks: MCP and HTTP Request Shaping

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 150-250 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (size-exception) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Consolidate SQL validation and shape request parameters | PR 1 | Base branch; tests/docs included |

## Phase 1: Consolidated SQL Validation & CTE Support

- [x] 1.1 **RED**: Add failing CTE query tests to `test/adapters/http/server.test.ts` and `test/adapters/mcp/tools.test.ts`.
- [x] 1.2 **GREEN**: Define `looksLikeReadOnlySql` in `src/core/utils/index.ts` supporting CTE (`WITH ... SELECT`) and write keywords.
- [x] 1.3 **REFACTOR**: Replace local SQL checks in `src/adapters/http/server.ts` and `src/adapters/mcp/tools.ts` with the new core import.

## Phase 2: HTTP & MCP Request Shaping

- [x] 2.1 **RED**: Add tests for missing/invalid parameter structures to `test/adapters/http/server.test.ts`.
- [x] 2.2 **GREEN**: Implement type-safe `getStringParam` helper in `src/adapters/http/server.ts` and replace all unsafe `as string` casts.
- [x] 2.3 **RED**: Add fallback argument resolution tests to `test/adapters/mcp/tools.test.ts`.
- [x] 2.4 **GREEN**: Implement `getStr` fallback helper in `src/adapters/mcp/tools.ts` and refactor payload mappers.

## Phase 3: Port Hardening & Visibility Reduction

- [x] 3.1 **RED**: Identify tests in `test/adapters/vba-sync/vba-sync-adapter.test.ts` directly accessing private/helper methods.
- [x] 3.2 **GREEN**: Change visibility of target resolution, strict context, preflight, and execution methods to `private` in `VbaSyncAdapter`.
- [x] 3.3 **GREEN**: Pass bound delegate wrappers in `VbaSyncAdapter` constructor to sub-adapters.
- [x] 3.4 **GREEN**: Refactor the identified tests to execute exclusively through the public `execute()` port.

## Phase 4: Verification & Cleanup

- [x] 4.1 **REFACTOR**: Run all tests via `pnpm test` and ensure they pass.
- [x] 4.2 **REFACTOR**: Perform clean linting checks and remove any unused code/imports.
