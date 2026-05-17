# Tasks: Update from Latest GitHub Release

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300-450 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 SDD + tests → PR 2 implementation → PR 3 docs/version/release |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | SDD artifacts and RED tests | PR 1 | Base main; no production behavior change. |
| 2 | GitHub release update implementation | PR 2 | Base after PR 1; makes tests pass. |
| 3 | Docs, version, release verification | PR 3 | Base after PR 2; closes #141. |

## Phase 1: RED Tests

- [x] 1.1 Add test: newer release provider installs provider package version.
- [x] 1.2 Add test: equal latest release skips without `--force`.
- [x] 1.3 Add test: `--force` reinstalls equal latest release.
- [x] 1.4 Add test: provider failure returns actionable update error.

## Phase 2: GREEN Implementation

- [x] 2.1 Add `ReleaseUpdateProvider` and injected context support in `install.ts`.
- [x] 2.2 Update `handleUpdateCommand` to compare installed version with provider latest version.
- [x] 2.3 Implement default GitHub provider using temporary release source/build workspace.
- [x] 2.4 Ensure provider cleanup runs after success and failure.

## Phase 3: Docs and Release Prep

- [x] 3.1 Update README `dysflow update` docs.
- [x] 3.2 Bump package minor version and changelog.
- [x] 3.3 Run `pnpm test`, `pnpm build`, and `git diff --check`.
