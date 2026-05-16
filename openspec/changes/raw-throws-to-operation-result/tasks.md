# Tasks: raw-throws-to-operation-result

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 30–50 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR — closes #61 and #62 |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (not needed — well within budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Fix #61 + Fix #62 + tests | Single PR | ~30–50 lines; closes both issues |

---

## Phase 1: Foundation — Red Tests (TDD strict mode)

- [ ] 1.1 In `test/core/config/dysflow-config.test.ts`: add failing test — when both `.dysflow/project.json` and `dysflow.project.json` exist in the same directory, `loadDysflowConfig` returns `failureResult` with code `CONFIG_AMBIGUOUS_PROJECT_FILE` and both paths in the message. (Spec: Scenario "Ambiguous project config — both filenames present")
- [ ] 1.2 In `test/core/config/dysflow-config.test.ts`: add regression guard — when only one project config file exists, `loadDysflowConfig` still returns `{ ok: true }`. (Spec: Scenario "Ambiguous project config does not affect success path")
- [ ] 1.3 In `test/core/services/vba-sync-legacy-service.test.ts`: add three failing tests — (a) missing test plan file → `VBA_INVALID_TEST_PLAN`, (b) malformed JSON → `VBA_INVALID_TEST_PLAN`, (c) structurally invalid plan (not an array) → `VBA_INVALID_TEST_PLAN`. (Spec: three failure scenarios under "access-core-services")
- [ ] 1.4 In `test/core/services/vba-sync-legacy-service.test.ts`: add regression guard — valid test plan via `procedureName` inline path returns success. (Spec: Scenario "test_vba with valid test plan")
- [ ] 1.5 Run `pnpm vitest run` — confirm the four new tests are RED and all existing tests stay GREEN.

## Phase 2: Core Implementation — Green

- [ ] 2.1 In `src/core/config/dysflow-config.ts`: modify `findWorktreeProjectConfigPath` — remove the ambiguity `throw`; make it return `candidates[0]` or `undefined` (pure lookup, no failure mode). (Design: ADR-1)
- [ ] 2.2 In `src/core/config/dysflow-config.ts`: modify `loadDysflowConfig` — before calling the helper, sweep `DEFAULT_PROJECT_CONFIG_FILENAMES` with `existsSync`; if both exist, return `failureResult(createDysflowError("CONFIG_AMBIGUOUS_PROJECT_FILE", ...))` with both paths in the message. (Spec: Scenario "Ambiguous project config — both filenames present")
- [ ] 2.3 In `src/core/services/vba-sync-legacy-service.ts`: change `resolveTestProceduresJson` return type from `Promise<string>` to `Promise<OperationResult<string>>`. (Design: ADR-2)
- [ ] 2.4 In `src/core/services/vba-sync-legacy-service.ts`: wrap the file-read/parse/normalize pipeline inside `resolveTestProceduresJson` in `try/catch` — success path returns `successResult(json)`, catch returns `failureResult(createDysflowError("VBA_INVALID_TEST_PLAN", err instanceof Error ? err.message : String(err)))`. (Design: ADR-2, ADR-4)
- [ ] 2.5 In `src/core/services/vba-sync-legacy-service.ts`: update `executeTestVba` — check `resolveTestProceduresJson` result; if `!result.ok`, return that failure early. (Design: component map — caller guard)
- [ ] 2.6 Run `pnpm vitest run` — confirm all seven tests (3 existing + 4 new) are GREEN.

## Phase 3: Cleanup

- [ ] 3.1 Verify `normalizeTestPlan` is untouched — no changes to the pure validator. (Design: ADR-3)
- [ ] 3.2 Confirm error codes `CONFIG_AMBIGUOUS_PROJECT_FILE` and `VBA_INVALID_TEST_PLAN` are set `retryable: false` matching convention. (Design: ADR-5)
- [ ] 3.3 Run full suite one final time (`pnpm vitest run`) — zero regressions.
