# release-process-automation — spec

## ADDED Requirements

### R1: Canonical release workflow is one script

The canonical release workflow for dysflow is `scripts/release-prepare.ps1`. The
script must wrap the entire release cycle (bump version, update changelog, push,
wait for CI green, tag, push tag) so an operator cannot accidentally tag before
CI concludes on the release commit.

#### Scenario: Operator runs release-prepare.ps1 with a dirty working tree

Given an operator has uncommitted changes (or untracked files) in the working tree
When they run `pwsh -File scripts/release-prepare.ps1 -Bump patch`
Then the script refuses with exit code ≠ 0
And the message identifies the dirty paths
And no `package.json` modification, no `CHANGELOG.md` modification, no commit, and no push occurs.

#### Scenario: Operator runs release-prepare.ps1 with local main ahead of origin/main

Given local `main` has 1 or more commits not yet pushed to `origin/main`
When they run `pwsh -File scripts/release-prepare.ps1 -Bump patch`
Then the script refuses with exit code ≠ 0
And the message identifies the count of unpushed commits
And no commit and no push occurs.

#### Scenario: Operator runs release-prepare.ps1 without `gh` CLI on PATH

Given the operator's shell does NOT have `gh` available
When they run `pwsh -File scripts/release-prepare.ps1 -Bump patch`
Then the script refuses with exit code ≠ 0
And the message tells them to install `gh` and run `gh auth login`
And no commit and no push occurs.

#### Scenario: Operator runs release-prepare.ps1 with no version arg

Given the operator invokes `pwsh -File scripts/release-prepare.ps1` with neither `-Bump` nor `-Version`
Then the script refuses with exit code ≠ 0
And the message tells them to specify `-Bump patch|minor|major` or `-Version X.Y.Z`.

#### Scenario: Operator supplies a non-greater version

Given the current version is `1.11.1` and the operator supplies `-Version 1.11.0`
When they run `pwsh -File scripts/release-prepare.ps1 -Version 1.11.0`
Then the script refuses with exit code ≠ 0
And the message says the next version must be greater than the current.

#### Scenario: CI concludes failure on the release commit

Given the script has pushed the release commit to `origin/main`
And `gh run list --workflow ci.yml --json headSha,status,conclusion` shows
`conclusion: failure` for the release commit's SHA within the 10-minute poll window
When the script polls and observes that conclusion
Then the script throws `CI concluded with 'failure' on $sha. NOT pushing the tag.`
And no `git tag` is created and no `git push origin <tag>` occurs.

#### Scenario: CI concludes success on the release commit

Given the script has pushed the release commit to `origin/main`
And `gh run list --workflow ci.yml --json headSha,status,conclusion` shows
`conclusion: success` for the release commit's SHA within the 10-minute poll window
When the script polls and observes that conclusion
Then the script creates an annotated tag `vX.Y.Z` with message `vX.Y.Z`
And pushes the tag via `git push origin vX.Y.Z`
And logs that the release.yml workflow will build, sign, and publish.

#### Scenario: CI does not conclude within the poll window

Given the script is polling `gh run list --workflow ci.yml --json headSha,status,conclusion`
And the release commit's run is still `in_progress` after 600 seconds (10 minutes)
Then the script throws `CI did not conclude within 600 s. Check run at: <url>`
And no tag is created and no push occurs.

### R2: Release script matches the release commit's SHA, not "latest run"

When the script polls for CI status, it MUST filter by `headSha == $releaseCommitSha`,
not by `headSha == "latest"`. This ensures a concurrent CI run on an unrelated branch
cannot be mistaken for the release run.

#### Scenario: Concurrent branch pushes a commit while the release script polls

Given the release script has pushed the release commit `R` to `origin/main`
And another branch has pushed an unrelated commit `U` to a PR targeting `main`
And CI has started runs for both `R` and `U`
When the script polls `gh run list --workflow ci.yml --json headSha,status,conclusion`
Then the script MUST filter by `headSha == R`, ignoring runs for `U`.

### R3: Release script validates semver strictly

The script must accept only clean semver strings (MAJOR.MINOR.PATCH, all numeric)
for `-Version`. Strings like `v1.11.0`, `1.11`, `1.11.0-beta` MUST be rejected.

#### Scenario: Operator supplies a non-semver version

Given the operator supplies `-Version "v1.11.0"` (with the `v` prefix)
When they run the script
Then the script refuses with exit code ≠ 0
And the message tells them to omit the `v` prefix and use clean semver.

## MODIFIED Requirements

None. This change does not modify any existing contract — it adds a process automation on top of the existing release flow.

## REMOVED Requirements

None.

## Cross-references

- `docs/release-checklist.md` — the manual pre-release checklist, now references `scripts/release-prepare.ps1` as the canonical workflow.
- `docs/release-checklist.md#cheap-e2e-suite-contract-tests` — lists the cheap vitest tests that pin mcp-e2e structural contracts.
- `docs/release-checklist.md#tests` — heavy E2E is the last step (run by humans, not CI).
- `.github/workflows/release.yml` — the workflow that fires on the tag push and publishes the release.