# Tasks: 419-runner-output-parsing

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 100-120 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Robust process list parsing and empty stdout rejection | PR 1 | Base branch; unit tests included |

## Phase 1: Process Parsing Refactor (TDD)

- [x] 1.1 RED: Add unit tests in `test/core/operations/windows-processes.test.ts` to cover single process, multiple processes, empty string, malformed values, and non-object inputs.
- [x] 1.2 GREEN: Implement `normalizeProcessList` helper in `src/core/operations/windows-processes.ts` and parse processes as `unknown` before checking/normalizing.
- [x] 1.3 REFACTOR: Refactor process scanner and inspector implementations to use the new helper and ensure vitest suite passes.

## Phase 2: Empty Stdout Rejection (TDD)

- [x] 2.1 RED: Add unit test in `test/core/runner/access-runner.test.ts` verifying that empty stdout throws `SyntaxError` and returns `RUNNER_INVALID_JSON`.
- [x] 2.2 GREEN: Update `parseRunnerData` in `src/core/runner/access-runner.ts` to throw `SyntaxError` on empty stdout instead of returning `{}`.
- [x] 2.3 REFACTOR: Clean up runner parser implementation and verify runner tests pass.

## Phase 3: Integration & Verification

- [x] 3.1 Compile using `pnpm build` to verify strict TypeScript checks.
- [x] 3.2 Execute complete test suite with `pnpm test` to guarantee no regressions.
