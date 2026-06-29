# Tasks: Replace PowerShell Source-Text Tests

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 500-750 test/doc lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 access-runner coverage → PR 2 vba-manager coverage → PR 3 cleanup/docs guard |
| Delivery strategy | force-chained |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Replace access-runner `.ps1` text checks with Vitest/Pester behavior coverage | PR 1 | Base = feature/tracker branch; verify `pnpm test`, `pnpm test:ps1`. |
| 2 | Replace vba-manager dispatcher/body text checks with Pester action contracts | PR 2 | Base = PR 1 branch; fake COM/filesystem/process seams only. |
| 3 | Remove remaining issue-scoped text assertions and update quality-gate docs if needed | PR 3 | Base = PR 2 branch; final repo verification. |

## Phase 1: Access-runner RED coverage

- [x] 1.1 In `test/core/runner/access-runner.test.ts`, add failing runner-port tests for args/payload routing, JSON parsing, stderr marker filtering, timeout/failure diagnostics, operation metadata, and cleanup/lock outcomes; do not read `.ps1` files.
- [x] 1.2 In `scripts/tests/dysflow-access-runner.Tests.ps1`, add failing Pester behavior tests for SQL literal formatting, statement splitting, password/open behavior, sandboxed paths, read/write database routing, ISO start-time formatting, and cleanup invariants using AST extraction only as a loader.
- [x] 1.3 Run focused Vitest/Pester commands, then `pnpm test` and `pnpm test:ps1`; record RED failures that prove coverage replaces the removed text checks.

## Phase 2: Access-runner GREEN cleanup

- [x] 2.1 Remove equivalent source-snippet assertions from `test/scripts-access-runner.test.ts` only after the behavior checks fail for matching regressions.
- [x] 2.2 Keep `scripts/dysflow-access-runner.ps1` runtime behavior unchanged; adjust only test seams/helpers if strictly needed.
- [x] 2.3 Verify PR 1 with `pnpm test`, `pnpm test:ps1`, and a temporary behavior-preserving variable rename safety check.

## Phase 3: VBA-manager RED/GREEN coverage

- [x] 3.1 In `scripts/tests/dysflow-vba-manager.Tests.ps1`, add failing Pester contracts for import/export/list/exists/delete/compile/run-test/run-procedure/fix-encoding action outcomes with fake sessions and mocked I/O seams.
- [x] 3.2 Remove dispatcher-arm/body text detectors from `test/scripts-vba-manager.test.ts` only after each action has observable behavior coverage.
- [x] 3.3 Verify PR 2 with focused Pester, `pnpm test:ps1`, `pnpm test`, and no assertions over function bodies or variable names.

## Phase 4: Final quality gate

- [x] 4.1 Search issue-scoped files for `.ps1` source-text assertions (`toContain`, body slicing, raw source regex) and delete or replace only those covered by behavior tests.
- [x] 4.2 Update `docs/testing/repo-quality-gates.md` if it does not already forbid implementation-coupled PowerShell source-text tests.
- [x] 4.3 Run final `pnpm test`, `pnpm test:ps1`, `pnpm build`, and document any skipped Pester reason; no Standard Mode fallback.
