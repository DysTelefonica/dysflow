# Tasks: VbaFormService Real Dependencies

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 520-700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 core ports/tests → PR 2 adapter wiring/compatibility |
| Delivery strategy | force-chained |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Make `VbaFormService` depend on typed form I/O ports | PR 1 | Base = `vba-form-service-deps` tracker toward `staging`; include core tests. |
| 2 | Wire adapter Node ports and protect runner separation | PR 2 | Base = PR 1 branch; include adapter compatibility tests. |

## Phase 1: Core RED Tests

- [x] 1.1 Run safety net: `pnpm test test/core/services/vba-form-service.test.ts` and record baseline before edits.
- [x] 1.2 In `test/core/services/vba-form-service.test.ts`, add failing fake-port tests for `generateForm` path, JSON payload, and deterministic `generatedAt`.
- [x] 1.3 Add failing fake-port tests for `catalogAddControl`: existing catalog append, missing catalog default, and write failure result.
- [x] 1.4 Add failing fake-port tests for `harvestFormCatalog`: form/report filtering, invalid JSON skip, and missing directory empty result.

## Phase 2: Core GREEN/REFACTOR

- [x] 2.1 In `src/core/services/vba-form-service.ts`, export `FormFileSystemPort`, `FormClockPort`, and `VbaFormServiceOptions` with only `cwd`, `fileSystem`, and optional `clock`.
- [x] 2.2 Replace direct `node:fs/promises`, `readJsonFileAsync`, and `Date` behavior in form operations with the typed ports; keep `OperationResult` shapes unchanged.
- [x] 2.3 Remove stored `executor`, `env`, `resolveExecutionTarget`, and `validateStrictContext` fields from `VbaFormService`; run `pnpm test test/core/services/vba-form-service.test.ts`.

## Phase 3: Adapter RED/GREEN

- [x] 3.1 Run safety net: `pnpm test test/adapters/vba-sync/vba-forms-adapter.test.ts test/adapters/vba-sync/vba-sync-adapter.test.ts`.
- [x] 3.2 In `test/adapters/vba-sync/vba-forms-adapter.test.ts`, add failing tests that form tools do not call runner-only orchestrator functions while `generate_erd` still does.
- [x] 3.3 In `src/adapters/vba-sync/vba-forms-adapter.ts`, wire Node filesystem and clock ports into `VbaFormService`; stop passing runner dependencies.
- [x] 3.4 Update `test/adapters/vba-sync/vba-sync-adapter.test.ts` only if constructor expectations need behavior-preserving compatibility fixes.

## Phase 4: Verification

- [x] 4.1 Run focused tests from Phases 1-3, then `pnpm test`.
- [x] 4.2 Confirm no MCP tool names, params, errors, or success payload shapes changed for `validate_form_spec`, `generate_form`, `catalog_add_control`, and `harvest_form_catalog`.
