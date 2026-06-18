# Tasks: MCP Override Validation Alignment

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 400-500 lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Core & Config) → PR 2 (Schemas & Dynamic Stdio) → PR 3 (Tests) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Core Contracts, Mapping & Target Resolution | PR 1 | Base branch; extends Access types and resolves timeout |
| 2 | Schemas & Dynamic Services Wrapper | PR 2 | Integrates createDynamicServices and updates MCP schemas |
| 3 | Testing & Verification | PR 3 | Validation, mapper, stdio caching and E2E mock tests |

## Phase 1: TDD Red (Failing Tests)

- [ ] 1.1 Add failing cases to `test/shared/validation/validator.test.ts` for schemas allowing context, overrides, and `timeoutMs`.
- [x] 1.2 Add failing mapping assertions in `test/core/mapping/access-query-request-mapper.test.ts` for override parameters.
- [ ] 1.3 Add failing test cases in `test/adapters/mcp/stdio.test.ts` for cache-based dynamic resolution and config-isolated routing.

## Phase 2: Core Foundation & Mapping (TDD Green)

- [x] 2.1 Update `AccessVbaRequest` and `AccessQueryRequest` in `src/core/contracts/index.ts` with context/override properties.
- [x] 2.2 Add optional overrides properties to `AccessDiagnosticsRequest` in `src/core/runner/access-runner.ts`.
- [x] 2.3 Map context and override properties in `buildQueryReadRequest`, `buildWriteFixtureRequest`, and `buildMaintenanceRequest` inside `src/core/mapping/access-query-request-mapper.ts`.
- [x] 2.4 Update `resolveExecutionTarget` in `src/core/config/execution-target.ts` to pass `timeoutMs` and override fallback timeout.

## Phase 3: Schema Definitions & Tool Aliases (TDD Green)

- [ ] 3.1 Update `run_vba` and `cleanup_access_operation` in `src/adapters/mcp/schemas/vba-sync-schemas.ts` with overrides/context/timeoutMs.
- [ ] 3.2 Add override and context parameters to `relink_directory` schema in `src/adapters/mcp/schemas/query-schemas.ts`.
- [ ] 3.3 Extend `VBA_EXECUTE_SCHEMA` and `DOCTOR_SCHEMA` in `src/adapters/mcp/schemas/dysflow-schemas.ts` to support overrides.
- [ ] 3.4 Update alias tool handlers mapping in `src/adapters/mcp/alias-tools.ts` to forward validated override parameters.

## Phase 4: Dynamic Services Implementation (TDD Green)

- [ ] 4.1 Replace `createUnavailableServices` with `createDynamicServices` in `src/adapters/mcp/stdio.ts` using caching with `resolvedConfigCacheKey`.
- [ ] 4.2 Wrap `cleanupService`, `orphanCleanupService`, and `operationRegistry` in dynamic routing in `stdio.ts`.
- [ ] 4.3 Update `resolveConfigForInput` in `stdio.ts` to forward `timeoutMs` to configuration resolution.

## Phase 5: Verification (TDD Green/Refactor)

- [ ] 5.1 Run test suite using `pnpm test` to verify all new validation, mapping, and services tests pass.
- [ ] 5.2 Add and execute E2E mock transport tests in `test/adapters/mcp/stdio.test.ts` verifying multiple database targeting with overrides.
