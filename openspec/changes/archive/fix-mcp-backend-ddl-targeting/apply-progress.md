# Apply Progress: fix-mcp-backend-ddl-targeting

## Scope

PR1 added RED regression tests for issue #347. PR2 implemented the GREEN production fix: legacy MCP write target mapping, runner fallback precedence, and PowerShell write-action database selection. PR3 tightened docs/artifacts and ran broader verification without adding real Access E2E.

## Workload / PR Boundary

- Mode: chained PR slice
- Chain strategy: stacked-to-main
- Current work unit: PR3 docs/artifact tightening + broader verification
- Boundary: reconstruct missing OpenSpec tasks, document No Conformidades Issue #18 safe backend DDL usage, and capture broad verification; no production code or real Access E2E in this slice
- Estimated review budget impact: PR3 incremental docs/artifact work is small, but the full working tree including previously untracked OpenSpec artifacts is ~493 changed lines; split or explicitly exclude prior artifacts before opening a ≤400-line PR.

## Completed Tasks

- [x] PR1 RED: Added unit/contract regression tests proving legacy write/DDL targeting must preserve explicit backend/database targets and must not always use the frontend.
- [x] PR2 GREEN: Updated schemas/mapping, AccessPowerShellRunner fallback, and PowerShell write dispatch so explicit `databasePath`/`sourcePath` wins over `backendPath`, then falls back to backend, then frontend/current DB.
- [x] PR3 Docs/artifacts: Reconstructed missing `tasks.md`, documented safe No Conformidades Issue #18 backend DDL usage, and recorded broader verification.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| PR1 RED legacy MCP write target mapping | `test/adapters/mcp/legacy-parity.test.ts` | Unit/contract | ✅ 21/21 baseline relevant tests passed | ✅ Failing test added | ⏸️ Not attempted by PR1 RED-only scope | ✅ Covers `backendPath`, `databasePath`, and `sourcePath` aliases across legacy write tools | ⏸️ Not attempted |
| PR1 RED runner write target selection | `test/core/runner/access-runner.test.ts` | Unit/static contract | ✅ 21/21 baseline relevant tests passed | ✅ Failing tests added | ⏸️ Not attempted by PR1 RED-only scope | ✅ Covers explicit `databasePath` precedence and PowerShell write-target helper dispatch | ⏸️ Not attempted |
| PR2 GREEN legacy MCP write target mapping | `test/adapters/mcp/legacy-parity.test.ts` | Unit/contract | ❌ PR1 RED confirmed 3 failures before production changes | ✅ Existing PR1 RED test used | ✅ `pnpm test test/adapters/mcp/legacy-parity.test.ts test/core/runner/access-runner.test.ts` passed 24/24 | ✅ Existing cases cover `backendPath`, `databasePath`, and `sourcePath` aliases | ✅ Removed duplicate `databasePath` mapping warning after green |
| PR2 GREEN runner write target selection | `test/core/runner/access-runner.test.ts` | Unit/static contract | ❌ PR1 RED confirmed 3 failures before production changes | ✅ Existing PR1 RED test used | ✅ `pnpm test test/adapters/mcp/legacy-parity.test.ts test/core/runner/access-runner.test.ts` passed 24/24 | ✅ Existing cases cover fallback precedence and helper dispatch | ✅ Kept PowerShell helper small and helper-owned cleanup only |
| PR3 docs/artifact tightening | Documentation/OpenSpec artifacts | Docs/artifact | ✅ Existing PR2 apply progress and OpenSpec proposal/spec/design read before edits | ✅ Docs/artifact task accepted as structural; no production test written | ✅ Broader verification executed after docs/artifact changes | ➖ Triangulation skipped: documentation/artifact-only slice, no branching logic | ✅ Kept docs concise and avoided real Access E2E/password/process-kill shortcuts |

## Tests Run

1. Baseline: `pnpm test test/adapters/mcp/legacy-parity.test.ts test/core/runner/access-runner.test.ts test/scripts-access-runner.test.ts`
   - Result: ✅ 21 passed; Vitest executed the included MCP/runner files. Root `test/scripts-access-runner.test.ts` is excluded by Vitest config.
2. Baseline script probe: `pnpm vitest run test/scripts-access-runner.test.ts`
   - Result: ⚠️ No test files found because Vitest excludes `test/scripts-access-runner.test.ts`.
3. RED: `pnpm test test/adapters/mcp/legacy-parity.test.ts test/core/runner/access-runner.test.ts`
   - Result: ❌ 3 failed, 21 passed, 2 files failed.
4. PR2 GREEN: `pnpm test test/adapters/mcp/legacy-parity.test.ts test/core/runner/access-runner.test.ts`
   - Result: ✅ 24 passed, 2 files passed.
5. Narrow script/static probe: `pnpm vitest run test/scripts-access-runner.test.ts`
   - Result: ⚠️ No test files found because Vitest config excludes `test/scripts-access-runner.test.ts`.
6. PowerShell script tests: `pnpm test:ps1`
   - Result: ✅ 94 passed, 4 skipped, 0 failed.
7. PR3 broad test suite: `pnpm test`
   - Result: ❌ 5 files failed / 43 passed, 9 failed / 561 passed. Failures were timeouts in unrelated stdio/VBA/relink integration/export-path tests; issue #347 focused tests remained green within the full run.
8. PR3 build/type check: `pnpm build`
   - Result: ✅ passed.
9. PR3 PowerShell script tests: `pnpm test:ps1`
   - Result: ✅ 94 passed, 4 skipped, 0 failed.

## RED Failure Summary

- `legacy-parity.test.ts`: explicit `databasePath`/`sourcePath` legacy write requests are not accepted/forwarded; only `backendPath` calls reached the query service.
- `access-runner.test.ts`: config `backendPath` is added even when a write request already has explicit `databasePath`.
- `access-runner.test.ts`: `scripts/dysflow-access-runner.ps1` lacks `Resolve-WriteActionDatabase` and still dispatches write actions with `Invoke-WriteAction -Database $db`, where `$db` is `$access.CurrentDb()`.

## GREEN Summary

- Legacy write schemas now accept `databasePath`/`sourcePath` for `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, and `teardown_fixture`.
- `toLegacyWriteFixtureRequest` preserves `databasePath: databasePath ?? sourcePath` while keeping explicit `backendPath`.
- `AccessPowerShellRunner` only falls back to `config.backendPath` when neither `backendPath` nor `databasePath` is present.
- `dysflow-access-runner.ps1` dispatches write actions through `Resolve-WriteActionDatabase`, choosing `databasePath/sourcePath > backendPath > CurrentDb`; it uses `Open-DatabaseWithBackendPassword` and closes/final-releases only helper-owned DBs.

## Deviations / Issues

- `openspec/changes/fix-mcp-backend-ddl-targeting/tasks.md` was missing on disk and absent from Engram; PR3 reconstructed it concisely from the approved artifacts and prior apply progress.
- Real Access E2E was not added in PR3 because project testing capabilities still mark E2E unavailable; manual dry-run/apply/drop command patterns are documented instead.
