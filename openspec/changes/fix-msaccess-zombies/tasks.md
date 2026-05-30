# Tasks: Fix MS Access Zombie Processes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~100 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Refactor runner & verify no zombies | PR 1 | Base branch; tests/docs included |

## Phase 1: Test Setup (TDD RED Phase)

- [x] 1.1 In `E2E_testing/mcp-e2e.mjs`, configure E2E tests to run in isolated runtime folder `C:\Proyectos\dysflow\temp-runtime`.
- [x] 1.2 In `E2E_testing/mcp-e2e.mjs`, add post-test assertion that verifies no lingering `MSACCESS.EXE` processes exist using `tasklist`.
- [x] 1.3 Run E2E tests and verify they successfully catch/fail on lingering MS Access processes (confirming the RED state).

## Phase 2: Core Refactoring (TDD GREEN Phase)

- [x] 2.1 Refactor `scripts/dysflow-access-runner.ps1` to initialize script-scoped `$script:exitCode = 0` and `$script:accessPid = $null`.
- [x] 2.2 In `scripts/dysflow-access-runner.ps1`, replace all early `exit 0`/`exit 1` inside `try` blocks with `$script:exitCode = X; return`.
- [x] 2.3 Update `Write-AccessProcessMarker` in `scripts/dysflow-access-runner.ps1` to capture and store the PID in `$script:accessPid`.
- [x] 2.4 In `scripts/dysflow-access-runner.ps1` global `finally` block, add forced process termination `Stop-Process -Id $script:accessPid -Force` fallback.
- [x] 2.5 In `scripts/dysflow-access-runner.ps1`, ensure all database and COM object references are disposed with `FinalReleaseComObject` in `finally`/error blocks.
- [x] 2.6 Add the final `exit $script:exitCode` statement at the absolute bottom of `scripts/dysflow-access-runner.ps1`.

## Phase 3: Verification (TDD Verification)

- [x] 3.1 Run unit tests with `pnpm test` to verify script output parsing and structure.
- [x] 3.2 Run E2E tests in the isolated `C:\Proyectos\dysflow\temp-runtime` folder to verify they pass and zero zombie processes remain.

## Phase 4: Release & Cleanup

- [x] 4.1 Remove temporary test artifacts and restore standard E2E configuration settings.
- [x] 4.2 Document the return-based script architecture and COM release patterns in comments.

