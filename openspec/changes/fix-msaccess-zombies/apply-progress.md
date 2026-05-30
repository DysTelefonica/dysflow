# Apply Progress: fix-msaccess-zombies

## Scope
Implement exit code tracking, process ID tracking, and hard-kill fallback in the PowerShell runner scripts (`dysflow-access-runner.ps1` and `dysflow-vba-manager.ps1`). Implement per-call zombie verification in the E2E test suite `E2E_testing/mcp-e2e.mjs` and isolated execution verification using `temp-runtime`.

## Workload / PR Boundary
- Mode: Single PR
- Boundary: Fully refactored PowerShell script and updated unit/E2E test files with complete verification.

## Completed Tasks
- [x] 1.1 In `E2E_testing/mcp-e2e.mjs`, configure E2E tests to run in isolated runtime folder `C:\Proyectos\dysflow\temp-runtime`.
- [x] 1.2 In `E2E_testing/mcp-e2e.mjs`, add post-test assertion that verifies no lingering `MSACCESS.EXE` processes exist using `tasklist`.
- [x] 1.3 Run E2E tests and verify they successfully catch/fail on lingering MS Access processes (confirming the RED state).
- [x] 2.1 Refactor `scripts/dysflow-access-runner.ps1` to initialize script-scoped `$script:exitCode = 0` and `$script:accessPid = $null`.
- [x] 2.2 In `scripts/dysflow-access-runner.ps1`, replace all early `exit 0`/`exit 1` inside `try` blocks with `$script:exitCode = X; return`.
- [x] 2.3 Update `Write-AccessProcessMarker` in `scripts/dysflow-access-runner.ps1` to capture and store the PID in `$script:accessPid`.
- [x] 2.4 In `scripts/dysflow-access-runner.ps1` global `finally` block, add forced process termination `Stop-Process -Id $script:accessPid -Force` fallback.
- [x] 2.5 In `scripts/dysflow-access-runner.ps1`, ensure all database and COM object references are disposed with `FinalReleaseComObject` in `finally`/error blocks.
- [x] 2.6 Add the final `exit $script:exitCode` statement at the absolute bottom of `scripts/dysflow-access-runner.ps1`.
- [x] 3.1 Run unit tests with `pnpm test` to verify script output parsing and structure.
- [x] 3.2 Run E2E tests in the isolated `C:\Proyectos\dysflow\temp-runtime` folder to verify they pass and zero zombie processes remain.
- [x] 4.1 Remove temporary test artifacts and restore standard E2E configuration settings.
- [x] 4.2 Document the return-based script architecture and COM release patterns in comments.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Setup isolated E2E tests & zombie checks (Phase 1) | `E2E_testing/mcp-e2e.mjs` | E2E | ✅ Pre-existing tests run | ✅ Confirmed RED: caught lingering process on unmodified runner | ✅ Green after Phase 2 runner fix | ✅ Checked multiple tool calls (48 tools) | ✅ Restored configuration and cleaned files |
| Runner refactoring & return-based exits (Phase 2) | `test/core/runner/access-runner.test.ts` | Unit/Static | ✅ vitest runner suite passed | ✅ Added static check expecting return-based exits | ✅ Script content matched return pattern | ✅ Verified all try/catch blocks | ✅ Wrapped cleanup in clean global finally |
| Diagnostic runtime check & process safety | `test/core/runner/access-runner.test.ts` | Integration | ✅ vitest runner suite passed | ✅ Added test checking actual process termination | ✅ Processes terminated successfully | ✅ Checked PID capture on windows | ✅ Standardized GC collect and finalizers |

## Tests Run
1. Unit tests: `pnpm test test/core/runner/access-runner.test.ts` -> Passed (24/24)
2. E2E tests: `node E2E_testing/mcp-e2e.mjs` with `DYSFLOW_E2E_COMMAND` pointing to isolated runtime -> Passed (all tools and zombie checks passed)
3. Process audit: `tasklist /FI "IMAGENAME eq MSACCESS.EXE"` -> Confirmed 0 lingering processes.
