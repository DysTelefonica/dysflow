# Tasks: parse-runner-validation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~120–160 (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All 5 files in one PR | PR 1 | helper + 3 service guards + tests; single coherent change |

---

## Phase 1: Foundation — Error code + helper

- [ ] 1.1 In `src/core/runner/access-runner.ts`: add `export const RUNNER_INVALID_OUTPUT = "RUNNER_INVALID_OUTPUT"` as a bare string const, following the `RUNNER_INVALID_JSON` / `RUNNER_TIMEOUT` pattern.
- [ ] 1.2 In `src/core/runner/access-runner.ts`: implement and export `ensureResultShape<TData>(result: OperationResult<TData>, isValid: (data: unknown) => boolean): OperationResult<TData>`. Must pass `failureResult(createDysflowError(RUNNER_INVALID_OUTPUT, "..."))` with original `diagnostics`, `durationMs`, and optional `operation` when `isValid` returns false on a success result. Failures and timeouts pass through unchanged.

## Phase 2: RED tests (failing first)

- [ ] 2.1 In `test/core/services/core-services.test.ts`: add test — DiagnosticsService rejects non-record runner output: `FakeRunner` returns `successResult(42)` → result must be `ok: false` with `error.code === "RUNNER_INVALID_OUTPUT"`.
- [ ] 2.2 Add test — DiagnosticsService rejects record with non-array `checks`: `FakeRunner` returns `successResult({ checks: "nope" })` → `ok: false, error.code === "RUNNER_INVALID_OUTPUT"`.
- [ ] 2.3 Add test — DiagnosticsService accepts empty record `{}`: `FakeRunner` returns `successResult({})` → `ok: true`.
- [ ] 2.4 Add test — DiagnosticsService passes through runner failure (RUNNER_TIMEOUT) unchanged: `FakeRunner` returns `failureResult({code:"RUNNER_TIMEOUT",...})` → same failure propagates with no extra wrapping.
- [ ] 2.5 Add test — QueryService rejects non-object output: `FakeRunner` returns `successResult(null)` → `ok: false, error.code === "RUNNER_INVALID_OUTPUT"`.
- [ ] 2.6 Add test — QueryService accepts valid record: `FakeRunner` returns `successResult({ rows: [] })` → `ok: true`.
- [ ] 2.7 Add test — VbaService rejects non-object output: `FakeRunner` returns `successResult("string")` → `ok: false, error.code === "RUNNER_INVALID_OUTPUT"`.
- [ ] 2.8 Add test — VbaService accepts valid record: `FakeRunner` returns `successResult({ returnValue: 0 })` → `ok: true`.

All 8 tests must be RED (failing) before Phase 3 starts.

## Phase 3: GREEN — Wire guards into services

- [ ] 3.1 In `src/core/services/diagnostics-service.ts`: after `runner.run()` resolves, call `ensureResultShape(result, (d) => isRecord(d) && Array.isArray((d as Record<string,unknown>).checks))`. Import `ensureResultShape`, `RUNNER_INVALID_OUTPUT` from `access-runner.ts` and `isRecord` from `src/core/utils/index.ts`. Return the guarded result.
- [ ] 3.2 In `src/core/services/query-service.ts`: after `runner.run()` resolves, call `ensureResultShape(result, isRecord)`. Import `ensureResultShape` from `access-runner.ts` and `isRecord` from `src/core/utils/index.ts`. Return the guarded result.
- [ ] 3.3 In `src/core/services/vba-service.ts`: after `runner.run()` resolves, call `ensureResultShape(result, isRecord)`. Import `ensureResultShape` from `access-runner.ts` and `isRecord` from `src/core/utils/index.ts`. Return the guarded result.

After Phase 3, all 8 new tests must be GREEN. All pre-existing tests in `core-services.test.ts` must remain GREEN.

## Phase 4: Verify

- [ ] 4.1 Run full test suite (`vitest run` or project test command) — zero regressions in `core-services.test.ts`, `vba-service-progress.test.ts`, `query-service-progress.test.ts`.
- [ ] 4.2 Confirm `AccessRunner` interface, `AccessPowerShellRunner`, and `parseRunnerData` signatures are unchanged (no diff in those sections of `access-runner.ts`).
- [ ] 4.3 Confirm no new npm dependencies were introduced (`package.json` unchanged).
