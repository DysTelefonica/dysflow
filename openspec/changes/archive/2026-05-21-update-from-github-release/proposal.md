# Proposal: Update from Latest GitHub Release

## Intent

Make `dysflow update` useful for installed users by fetching the latest published Dysflow GitHub release instead of only comparing against a local source checkout.

## Scope

### In Scope
- Resolve the latest release/tag from GitHub.
- Download/build a release source workspace in a temporary directory.
- Install the built release into the configured runtime directory.
- Preserve existing `--runtime-dir` and `--force` semantics.
- Surface clear network, download, build, and install errors.

### Out of Scope
- Background auto-update daemon.
- Binary release asset packaging.
- Updating non-Dysflow user config entries.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `product-cli`: `dysflow update` becomes a release updater for installed users.

## Approach

Introduce an injectable update provider for tests and a default GitHub release updater for production. The CLI keeps `handleUpdateCommand` as the boundary, compares installed/runtime versions against the latest release, downloads/builds only when needed or forced, then reuses existing runtime install logic.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cli/commands/install.ts` | Modified | Update command orchestration and runtime install source selection. |
| `test/cli/install.test.ts` | Modified | Strict TDD coverage for release update behavior. |
| `README.md` | Modified | Document GitHub-backed update behavior. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Network/toolchain failure | Medium | Return explicit stderr and non-zero exit. |
| Updating to same version unintentionally | Low | Keep version comparison and require `--force` for reinstall. |
| Review size creep | Medium | Use chained PR work units. |

## Rollback Plan

Revert the feature PRs; existing local-source update logic can be restored from prior commit history.

## Dependencies

- GitHub release API/source archive availability.
- Local Node/pnpm build tooling for source-archive installs.

## Success Criteria

- [ ] `dysflow update` installs newer latest GitHub release.
- [ ] `dysflow update` skips when installed version is current.
- [ ] `dysflow update --force` reinstalls current latest release.
- [ ] Failures are explainable and tested.
