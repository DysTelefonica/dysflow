# Archive Report: release-fixes

| Field | Value |
|-------|-------|
| Change Name | `release-fixes` |
| Status | CLOSED |
| Archive Date | 2026-05-24 |
| Delivery | 3 PRs (stacked-to-main) |

## Summary

Resolved three release blockers: (1) eliminated the Node `DEP0190` deprecation warning on Windows by spawning `.cmd` files through `cmd.exe` explicitly instead of using `shell: true` with an array; (2) fixed `DYSFLOW_BACKEND_PASSWORD` propagation in the PowerShell Access runner's `Invoke-RelinkDirectory` and `Resolve-LinkChain` functions, ensuring connection strings include `;PWD=<password>` when a backend password is set; (3) repaired E2E test setup for `chain A→B→C` scenarios by constructing intermediate databases with native tables before converting them to linked tables, avoiding COM schema-validation errors.

## PRs

| PR | Title | Status |
|----|-------|--------|
| PR1 | DEP0190 fix: spawn `.cmd` files via `cmd.exe` on Windows | Merged |
| PR2 | Password propagation for relink_directory in PS runner | Merged → PR #317 |
| PR3 | E2E chain A→B→C test fixes | Merged → PR #318 |

## Key Artifacts

- `src/cli/commands/install.ts` — Windows `.cmd` spawn via `cmd.exe`
- `scripts/dysflow-access-runner.ps1` — `Open-DatabaseWithPassword` helper, password propagation
- `test/e2e/access-relink-directory.test.ts` — chain test setup fix
- `test/e2e/access-relink-directory-apply.test.ts` — chain test setup fix
