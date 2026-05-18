# Proposal: Repo Engineering Hardening

## Intent

Implement repository audit recommendations so Dysflow has enforceable quality gates, safer issue follow-through, and reviewable delivery slices before feature work expands.

## Scope

### In Scope
- Add/strengthen CI for `pnpm test`, `pnpm build`, lint, and coverage gates.
- Reconcile stale GitHub issue #160.
- Prioritize inter-process registry locking from #156.
- Start reducing cognitive load around `VbaSyncLegacyService` from #157 without behavior changes.
- Plan chained PR work units under strict TDD and the 400-line review budget.

### Out of Scope
- Full `VbaSyncLegacyService` rewrite.
- New product behavior.
- Changes to `C:\Proyectos\workflow\skills\dysflow`.

## Capabilities

### New Capabilities
- `repo-quality-gates`: CI, lint, coverage, and review-budget requirements.
- `registry-concurrency-safety`: Inter-process locking for shared registry mutations.

### Modified Capabilities
- `access-core-services`: Add maintainability expectations for legacy VBA sync decomposition.
- `product-cli`: Preserve command behavior while gates run in CI.

## Approach

Use strict TDD: add failing tests/config checks first, then minimal CI/lint/coverage and locking changes. Split as chained PRs: quality baseline, #160 reconciliation, registry lock, then small `VbaSyncLegacyService` characterization/seam refactors. Keep independent fixes separate.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `.github/workflows/` | New/Modified | CI and quality gates |
| `package.json`, config files | Modified | Lint/coverage commands and thresholds |
| `src/**`, `test/**` | Modified | Locking and legacy-service tests/refactors |
| `openspec/changes/repo-engineering-hardening/` | New | SDD artifacts |
| GitHub issues #156/#157/#160 | Modified | Priority and reconciliation notes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| CI breaks on Windows-only Access behavior | Med | Isolate/mock Access-dependent checks unless runner support exists |
| Coverage gate blocks progress | Med | Start with realistic threshold; raise later |
| Refactor changes legacy behavior | Med | Characterization tests before seams/refactors |

## Rollback Plan

Revert the affected chained PR slice: remove CI/config gates, disable thresholds, or revert locking/refactor commits. Keep behavior-documenting tests unless tied only to reverted implementation.

## Dependencies

- Existing strict TDD runner (`pnpm test`) and build (`pnpm build`).
- Maintainer decision on #160 status and chained PR sequencing.

## Success Criteria

- [ ] CI runs tests and build on PRs.
- [ ] Lint and coverage commands are documented and enforced.
- [ ] #160 is closed, updated, or converted into follow-up.
- [ ] #156 is highest-priority hardening implementation.
- [ ] #157 starts with tested seams/characterization, not a risky rewrite.
- [ ] Tasks recommend chained PRs when work risks exceeding 400 changed lines.
