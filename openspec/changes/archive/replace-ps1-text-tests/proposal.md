# Proposal: Replace PowerShell Source-Text Tests

## Intent

Issue #443/C4 removes brittle tests that read `.ps1` files and assert internal variable names/snippets. They fail on behavior-preserving PowerShell refactors, violating `docs/testing/testing-philosophy.md`: tests must exercise behavior at ports, mocking only I/O.

## Scope

### In Scope
- Replace source-text `toContain`/body-slicing assertions over `scripts/dysflow-access-runner.ps1` and `scripts/dysflow-vba-manager.ps1` with behavior tests.
- Prefer Pester under `scripts/tests/` for PowerShell helper/action behavior; use Vitest only at the TS runner port for args, stdout/stderr, result JSON, errors, or cleanup metadata.
- Add an acceptance guard proving variable renames do not break tests.

### Out of Scope
- Changing runtime behavior or script architecture.
- Modifying production runtime under `%LOCALAPPDATA%\dysflow` or opencode config.
- Broad cleanup of unrelated source-text assertions outside the issue evidence.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `repo-quality-gates`: quality gates must reject implementation-coupled PowerShell source-text tests and require port/Pester behavior coverage for PowerShell runner contracts.

## Approach

Use strict TDD with `pnpm test`; include `pnpm test:ps1` where PowerShell behavior is exercised. Design fork: (A) Pester AST extraction with fake I/O seams for `.ps1` helper/action contracts; (B) Vitest runner-port tests with injected executor for TS↔PowerShell command/result/error contracts. Avoid variable names, snippets, function-body text, or dispatch layout assertions.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `test/scripts-access-runner.test.ts` | Modified/Removed | Replace source assertions with behavior/Pester coverage or delete redundant checks. |
| `test/scripts-vba-manager.test.ts` | Modified/Removed | Remove dispatcher-arm/body text detectors; keep only behavior-safe contract checks. |
| `test/core/runner/access-runner.test.ts:300-325,860-883` | Modified | Replace structural `.ps1` assertions with runner-port behavior. |
| `scripts/tests/*.Tests.ps1` | Modified | Add/adjust Pester tests with mocked I/O seams. |
| `package.json` | Referenced | `pnpm test`; `pnpm test:ps1` for Pester validation. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Losing coverage while deleting text checks | Med | First write behavior tests for each protected contract. |
| Pester tests become source-text checks in disguise | Med | Require observable outputs/effects and mocked I/O seams only. |
| Review size exceeds 400 lines | Med | Chain PRs: access-runner tests first, vba-manager tests second. |

## Rollback Plan

Revert the test-only commits for this change. Runtime code should be untouched; if any test gap appears, restore only the missing behavior coverage, not source-text assertions.

## Dependencies

- `pnpm test`, `pnpm test:ps1`, Pester availability for PS suites.

## Success Criteria

- [ ] No `toContain`/regex assertions over `.ps1` internals remain in the issue-scoped files.
- [ ] Equivalent behavior is covered through Pester or runner-port tests.
- [ ] A behavior-preserving internal variable rename in `.ps1` does not break tests.
- [ ] `pnpm test` passes; `pnpm test:ps1` considered/run for PowerShell behavior changes.
