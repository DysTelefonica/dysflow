# Tasks: Release Fixes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (DEP0190) -> PR 2 (Runner and E2E fixes) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

---

## PR 1 — Resolve DEP0190 on Windows

> Base branch: `main`
> Scope: CLI install command.

### Phase 1: Install Command
- [x] 1.1 **MODIFY** [install.ts](file:///C:/Proyectos/dysflow/src/cli/commands/install.ts): update `runCommand` and `runCommandOutput` to execute `.cmd` files via `cmd.exe` on Windows instead of using `shell: true`.
- [x] 1.2 Run `pnpm build` to compile TypeScript.
- [x] 1.3 Run unit tests using `pnpm test` to verify no regressions in CLI installation commands.

---

## PR 2 — Fix relink-directory Password Propagation and E2E Tests

> Base branch: `main` (after PR 1 merged)
> Scope: PowerShell Access runner and E2E tests.

### Phase 2: PowerShell Runner Modifications
- [x] 2.1 **MODIFY** [dysflow-access-runner.ps1](file:///C:/Proyectos/dysflow/scripts/dysflow-access-runner.ps1): implement `Open-DatabaseWithPassword` helper.
- [x] 2.2 **MODIFY** [dysflow-access-runner.ps1](file:///C:/Proyectos/dysflow/scripts/dysflow-access-runner.ps1): update `Open-DatabaseWithBackendPassword` to use the helper.
- [x] 2.3 **MODIFY** [dysflow-access-runner.ps1](file:///C:/Proyectos/dysflow/scripts/dysflow-access-runner.ps1): update scanned and applied database opens in `Invoke-RelinkDirectory` to use `$AccessPassword`.
- [x] 2.4 **MODIFY** [dysflow-access-runner.ps1](file:///C:/Proyectos/dysflow/scripts/dysflow-access-runner.ps1): update link chain resolution database opens in `Resolve-LinkChain` to use `$BackendPassword` (falling back to `$AccessPassword`).
- [x] 2.5 **MODIFY** [dysflow-access-runner.ps1](file:///C:/Proyectos/dysflow/scripts/dysflow-access-runner.ps1): update connection string reconstruction to include `;PWD=$BackendPassword` if set.
- [x] 2.6 **MODIFY** [dysflow-access-runner.ps1](file:///C:/Proyectos/dysflow/scripts/dysflow-access-runner.ps1): conditionally set `$tdW.SourceTableName` only when it differs from `$chain.resolvedTable`.

### Phase 3: E2E Test Suite Adjustments
- [ ] 3.1 **MODIFY** [access-relink-directory.test.ts](file:///C:/Proyectos/dysflow/test/e2e/access-relink-directory.test.ts): fix setup for `chain A→B→C` test.
- [ ] 3.2 **MODIFY** [access-relink-directory-apply.test.ts](file:///C:/Proyectos/dysflow/test/e2e/access-relink-directory-apply.test.ts): fix setup for `chain A→B→C` test.
- [ ] 3.3 Run `pnpm exec vitest run --config vitest.integration.config.ts` and verify all tests pass.
