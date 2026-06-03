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

## Local E2E Zombie-Check Follow-up (2026-06-02)

### Scope
- Tightened `Close-AccessDatabase` in `scripts/dysflow-vba-manager.ps1` after local MCP E2E showed `delete_module` could leave its owned `MSACCESS.EXE` PID alive past the per-tool 5s zombie check.
- Kept cleanup targeted to the owned PID path only; no generic Access process killing was added.

### Completed Tasks
- [x] Added behavior-first Pester coverage for `Close-AccessDatabase` owned-PID cleanup.
- [x] Replaced the 5s cleanup wait plus asynchronous `Start-Process taskkill -Wait:$false` fallback with the existing bounded `Stop-AccessPidAndWait` default 20s wait.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Strengthen owned Access PID cleanup in `Close-AccessDatabase` | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Pester/PowerShell port test | ✅ `pnpm test:ps1` baseline passed: 161 passed, 4 skipped | ✅ Focused tests failed against old 5s wait and async taskkill dispatch | ✅ Focused tests passed after switching to default bounded wait | ✅ Covered success path timeout and failed-wait no-async-taskkill path | ✅ Minimal cleanup-only change; no unrelated behavior refactor |

### Tests Run
1. Baseline: `pnpm test:ps1` -> Passed (161 passed, 4 skipped)
2. RED: `pwsh -Command "Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1 -FullName 'Close-AccessDatabase*'"` -> Failed as expected (2 failed)
3. GREEN focused: same focused Pester command -> Passed (2 passed)
4. Full Pester: `pnpm test:ps1` -> Passed (163 passed, 4 skipped)
5. Vitest: `pnpm test` -> Passed (843 passed, 3 skipped across 61 files)
6. Whitespace: `git diff --check` -> Passed (line-ending warnings only)

### Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| Pending orchestrator commit | Local E2E zombie-check follow-up | Follow-up cleanup hardening | Focused Pester, `pnpm test:ps1`, `pnpm test`, `git diff --check` | N/A — PowerShell runtime script only |

## VbaSync operation tracking follow-up (2026-06-02)

### Scope
- Fixed unregistered Access-opening `dysflow-vba-manager.ps1` calls by tracking mapped `VbaSyncAdapter.executeMappedTool()` executions in the shared Access operation registry.
- Wired the MCP stdio service factory so `VbaSyncAdapter` receives the same `operationRegistry` and cleanup service used by core Access runner services.
- Passed `-OperationId` and `-OperationFile` to VBA-manager launches so the PowerShell marker file can report the owned Access PID back to TypeScript.

### Completed Tasks
- [x] Added behavior-first adapter tests proving `delete_module` receives operation marker data, successful runs clean their registry record, and failed mapped runs keep a cleanable failed record updated from the marker PID.
- [x] Added spawn argument coverage for `-OperationId` and `-OperationFile`.
- [x] Implemented registry create/update/purge lifecycle around mapped VBA-manager calls without changing the PowerShell cleanup fix.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Track mapped VBA-manager calls | `test/adapters/vba-sync/vba-sync-adapter.test.ts` | Adapter/port | ✅ Existing focused file had 28 passing tests before new behavior | ✅ New `delete_module` tracking tests failed because marker fields were undefined | ✅ Focused file passed after registry lifecycle implementation | ✅ Covered success purge, failure retention with marker PID, and raw spawn args | ✅ Kept logic local to `VbaSyncAdapter`; stdio only wires shared dependencies |

### Tests Run
1. RED focused: `pnpm vitest run test/adapters/vba-sync/vba-sync-adapter.test.ts` -> Failed as expected (2 failed: missing marker fields/file).
2. GREEN focused: `pnpm vitest run test/adapters/vba-sync/vba-sync-adapter.test.ts` -> Passed (30 passed).
3. Focused MCP stdio: `pnpm vitest run test/adapters/mcp/stdio.test.ts` -> Passed (10 passed).
4. PowerShell: `pnpm test:ps1` -> Passed (163 passed, 4 skipped).
5. Vitest: `pnpm test` -> Passed (845 passed, 3 skipped across 61 files).
6. Targeted lint/typecheck for changed TS files: `pnpm exec tsc -p tsconfig.json --noEmit && pnpm exec tsc -p tsconfig.test.json --noEmit && pnpm exec biome check ...changed files...` -> Passed.
7. Full lint: `pnpm lint` -> Failed on pre-existing Biome formatting findings in unrelated files; changed TS files pass targeted lint/typecheck.
8. Whitespace: `git diff --check` -> Passed with existing CRLF warnings only.

### Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| Pending orchestrator commit | VbaSync operation tracking for Access-opening manager calls | Follow-up product fix | Focused adapter/MCP tests, `pnpm test:ps1`, `pnpm test`, targeted lint/typecheck, `git diff --check` | N/A — TypeScript MCP/VBA-sync orchestration only |

## Ownership-safe cleanup follow-up (2026-06-02)

### Scope
- Removed the remaining broad `Get-Process MSACCESS` / `Stop-Process` fallback from `Close-TargetAccessDbIfOpen` when bounded CIM enumeration returns no processes.
- Changed preflight same-path orphan scanning so unattributed `MSACCESS.EXE` processes are reported as blocking warnings instead of killed by path assumption.
- Preserved registered owned-PID cleanup for stale Dysflow operation records.

### Completed Tasks
- [x] Updated preflight tests to reject same-path orphan killing and require report/block behavior.
- [x] Added Pester source-safety coverage preventing the broad `Get-Process MSACCESS` fallback from returning.
- [x] Implemented no-op/report behavior for unattributed orphan Access processes.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Block unattributed preflight orphans | `test/core/operations/access-operation-preflight.test.ts` | Core/port unit | ✅ Focused preflight file baseline known; new expectations failed against unsafe kill behavior | ✅ 4 tests failed because `orphanedKilled` still contained same-path PIDs | ✅ Focused file passed after switching scanner to warning-only behavior | ✅ Covered quoted path, casing, unquoted token, and explicit scanner path | ✅ Minimal cleanup-only change; owned registry PID cleanup unchanged |
| Remove VBA-manager broad fallback | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Pester/static safety | ✅ `pnpm test:ps1` available; new source-safety test failed on unsafe fallback text | ✅ Pester failed on `Fallback: cerrando MSACCESS PID` / broad loop | ✅ `pnpm test:ps1` passed after replacing fallback with warning-only message | ✅ Source test checks both status marker text and `foreach (Get-Process MSACCESS)` pattern | ✅ No production runtime changes; fallback now reports inability to attribute ownership |

### Tests Run
1. RED focused preflight: `pnpm vitest run test/core/operations/access-operation-preflight.test.ts` -> Failed as expected (4 orphan cleanup tests still observed kills).
2. RED Pester: `pnpm test:ps1` -> Failed as expected (new broad-fallback safety test).
3. GREEN focused preflight: `pnpm vitest run test/core/operations/access-operation-preflight.test.ts` -> Passed (25 passed).
4. Focused cleanup/vba-sync: `pnpm vitest run test/adapters/vba-sync/vba-sync-adapter.test.ts test/core/operations/access-operation-cleanup.test.ts test/core/operations/access-operation-preflight.test.ts` -> Passed (81 passed).
5. PowerShell: `pnpm test:ps1` -> Passed (164 passed, 4 skipped).
6. Full Vitest: `pnpm test` -> First run had a transient registry lock timeout, rerun focused registry passed (47 passed), rerun full suite passed (845 passed, 3 skipped across 61 files).
7. Typecheck/targeted lint: `pnpm exec tsc -p tsconfig.json --noEmit && pnpm exec tsc -p tsconfig.test.json --noEmit`; `pnpm exec biome check src/core/operations/access-operation-preflight.ts test/core/operations/access-operation-preflight.test.ts` -> Passed.
8. Full lint: `pnpm lint` -> Failed on pre-existing unrelated Biome formatting findings outside this change; changed TS files pass targeted checks.
9. Whitespace: `git diff --check` -> Passed with existing CRLF warnings only.

### Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| Pending orchestrator commit | Ownership-safe Access cleanup follow-up | Follow-up product fix | Focused RED/GREEN tests, `pnpm test:ps1`, `pnpm test`, targeted lint/typecheck, `git diff --check` | N/A — TypeScript core cleanup + PowerShell script only |

## VBA-manager path-only ownership fix follow-up (2026-06-02)

### Scope
- Removed the remaining path-only `Stop-Process -Id` fallback from `Close-TargetAccessDbIfOpen` in `scripts/dysflow-vba-manager.ps1`.
- Same-path `MSACCESS.EXE` CommandLine matches are now treated as unattributed blockers and reported without cleanup.
- Owned/current-operation cleanup paths remain unchanged; only unattributed path-based termination was removed.

### Completed Tasks
- [x] Added behavioral Pester coverage proving a same-path `MSACCESS.EXE` process is reported but not killed.
- [x] Added triangulation coverage for nonmatching active `MSACCESS.EXE` PIDs.
- [x] Replaced the path-only kill branch with warning/report/block behavior.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Remove path-only kill in `Close-TargetAccessDbIfOpen` | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Pester/PowerShell port test | ✅ Existing source-safety checks and helper patterns reviewed | ✅ Focused Pester failed because same-path CommandLine still called `Stop-Process` | ✅ Focused Pester passed after warning-only implementation | ✅ Added nonmatching PID report case proving no kill and active-PID reporting | ✅ Minimal branch removal; owned PID cleanup helpers untouched |

### Tests Run
1. RED focused: `Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1 -FullName "Close-TargetAccessDbIfOpen*"` -> Failed as expected (same-path test observed 1 `Stop-Process` call).
2. GREEN focused: same focused Pester command -> Passed (2 passed).
3. PowerShell: `pnpm test:ps1` -> Passed (166 passed, 4 skipped).
4. Vitest: `pnpm test` -> Passed (845 passed, 3 skipped across 61 files).

### Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| Pending user commit | VBA-manager path-only ownership fix | Follow-up product fix | Focused RED/GREEN Pester, `pnpm test:ps1`, `pnpm test`, `git diff --check` | N/A — PowerShell runtime script only |

## Access-runner marker ownership fix follow-up (2026-06-02)

### Scope
- Removed the remaining path-only `CommandLine.Contains(AccessDbPath)` attribution fallback from `Write-AccessProcessMarker` in `scripts/dysflow-access-runner.ps1`.
- Preserved marker emission and `$script:accessPid` assignment for truly captured PIDs from the WMI before/after process delta and hWnd paths.
- When no owned PID is known, the runner now writes a warning and leaves `$script:accessPid` null so final cleanup cannot kill a same-path user-owned process.

### Completed Tasks
- [x] Added Pester source-safety coverage proving `Write-AccessProcessMarker` no longer claims ownership from path-only `CommandLine` matches.
- [x] Replaced the marker fallback with warning-only behavior when no new/captured PID exists.
- [x] Re-ran focused access-runner Pester, full PowerShell Pester, full Vitest, and whitespace checks.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Remove path-only PID ownership in `Write-AccessProcessMarker` | `scripts/tests/dysflow-access-runner.Tests.ps1` | Pester/source safety | ✅ Existing guard focused tests passed before this change (2 passed) | ✅ New guard targets the unsafe `CommandLine.Contains($AccessDbPath)` marker attribution path that existed before implementation | ✅ Focused access-runner Pester passed after warning-only implementation (90 passed) | ✅ Existing cleanup guard plus new marker guard cover final cleanup and marker attribution paths | ✅ Minimal branch removal; owned PID marker paths unchanged |

### Tests Run
1. Baseline focused guard: `pnpm test:ps1 --% -FullName "Access runner final cleanup ownership guard*"` -> Passed (2 passed before new guard).
2. Focused marker/final cleanup guard: `Invoke-Pester scripts/tests/dysflow-access-runner.Tests.ps1 -FullName "Access runner final cleanup ownership guard*"` -> Passed (3 passed).
3. Focused access-runner Pester: `Invoke-Pester scripts/tests/dysflow-access-runner.Tests.ps1` -> Passed (90 passed).
4. PowerShell: `pnpm test:ps1` -> Passed (170 passed, 4 skipped).
5. Vitest: `pnpm test` -> Passed (845 passed, 3 skipped across 61 files).
6. Whitespace: `git diff --check` -> Passed with Git CRLF warnings only.

### Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| Not committed per user request | Access-runner marker ownership fix | Final review blocker follow-up for `fix-msaccess-zombies` | Focused access-runner Pester, `pnpm test:ps1`, `pnpm test`, `git diff --check` | N/A — PowerShell runtime script only |
