# release-process-automation — proposal

**Status:** SHIPPED (retroactive SDD; implementation already on `main`)
**Branch:** `main`
**Release when shipped:** v1.11.2 (planned)
**Process gap closed:** the release workflow (`push: tags: 'v*'`) fires independently of the CI workflow (`push: branches: [main]`), so an operator who pushed a tag without first confirming CI green shipped a broken artifact (v1.11.0 was tagged and released on 2026-06-29 while CI was red on the release commit; only the operator's manual recall caught it before more consumers pulled).

## Why

Two design forces collided:

1. **`release.yml` is decoupled from CI by design.** It triggers on tag push, not branch push — that is the only way a release can be cut from a tagged commit without an interim branch. But the decoupling means a tag can publish a release even if CI on the release commit is failing.
2. **`v1.11.0` shipped anyway.** The operator tagged and pushed without checking CI; the release workflow fired; v1.11.0 became `Latest` with a broken `mcp-e2e-grandchild-zombie.test.ts` (the wmic-only assertion that passed on Windows dev but failed on the Ubuntu CI runner).

The fix is structural: script the release workflow so the tag step waits for CI to succeed first.

## What ships

A single PowerShell script, `scripts/release-prepare.ps1`, that wraps the entire release:

  1. **Pre-flight** (refuses to start):
     - Working tree is dirty → `throw "Aborting release preparation."`
     - `origin/main` is behind local `main` → `throw "this release would land un-CI'd commits"`
     - `gh` CLI not on PATH → `throw "gh auth login"`
     - No `-Bump` and no `-Version` → `throw "Specify -Bump … or -Version X.Y.Z"`
     - Next version ≤ current version → `throw "Use a higher version."`

  2. **Bump and commit** (interactive or explicit):
     - `-Bump patch|minor|major`: derives the next semver from `package.json`'s current version
     - `-Version X.Y.Z`: explicit override (only accepts clean semver)
     - Updates `package.json` (`"version"`) and prepends a `## [vX.Y.Z] - YYYY-MM-DD` block to `CHANGELOG.md` from `git log <last-tag>..HEAD`
     - Commits `chore(release): prepare vX.Y.Z` (only `CHANGELOG.md` + `package.json`)

  3. **Push and wait for CI** (the new gate):
     - Pushes the release commit to `origin/main` via `git push`
     - Polls `gh run list --limit 20 --workflow ci.yml --json databaseId,headSha,status,conclusion` every 10s for up to 10 minutes
     - **Filters by `headSha == $releaseCommitSha`** — not by "latest run" — so a concurrent CI run on an unrelated branch cannot be mistaken for the release run
     - On `conclusion: success`: continues
     - On `conclusion: failure`: throws `CI concluded with 'failure' on $sha. NOT pushing the tag.`
     - On timeout: throws `CI did not conclude within 600 s.`

  4. **Tag and push tag** (only on CI green):
     - `git tag -a vX.Y.Z -m vX.Y.Z` (annotated tag with the same message)
     - `git push origin vX.Y.Z`
     - The release workflow `.github/workflows/release.yml` fires on the tag push, builds the tarball, signs `SHA256SUMS` with Ed25519, and publishes the GitHub Release.

  5. **Operator log** (always):
     - Final log explains what comes next ("Watch progress: gh run watch --workflow release.yml")

## Contract (pinned by tests)

The script's contract is locked by 15 Pester tests in `scripts/tests/release-prepare.Tests.ps1` (run with `Invoke-Pester -Path scripts/tests/release-prepare.Tests.ps1`). Each test reads the script as text and asserts specific structural patterns — surface parameters, pre-flight refusals, the CI-gating logic, the tag + push behavior, and the link to the release.yml workflow. Any future refactor that "tags unconditionally again" fails the suite in <1s.

Plus the user's manual contract documented in `docs/release-checklist.md`:

> "The canonical release workflow is `scripts/release-prepare.ps1`. It [refuses on dirty tree, refuses on ahead of origin, waits for CI green, refuses to tag unless success]."

## Out of scope (by design)

- **Replacing the GitHub Actions release workflow.** The existing `.github/workflows/release.yml` already builds, signs, and publishes correctly. The bug was upstream of it (the operator deciding to push the tag). Fix is in the operator-facing script.
- **CI changes.** The CI workflow (`ci.yml`) was already correct (`pnpm test` + `pnpm test:ps1` + `pnpm build` + `pnpm lint`). It does NOT run the heavy `node E2E_testing/mcp-e2e.mjs` battery because that is ~30 minutes; the user runs the heavy E2E manually only at the very end of a release cycle.
- **Local-only heavy E2E.** The script does not auto-trigger `node E2E_testing/mcp-e2e.mjs` because (a) CI cannot run it cross-platform (Windows-only Access fixture), and (b) it takes ~30 minutes. The operator runs it locally, watches the report, and then runs `release-prepare.ps1`.

## Why PowerShell, not bash

Dysflow's CI runs cross-platform (GitHub Actions: ubuntu + windows runners), but the ops-installer audience is Windows-first (Access fixtures are Windows-only). The repo's `scripts/` is already PowerShell-only (`dysflow-access-runner.ps1`, `dysflow-vba-manager.ps1`); an inventory of `scripts/` shows 6 files, all `.ps1`. A bash release script would be a foreign object; a PowerShell one fits the existing tooling.

`Invoke-Pester` is the cross-platform test runner for the script (no separate Windows / POSIX path).

## Retrospective

What this change WOULD HAVE caught, had it existed on 2026-06-29:
- v1.11.0 would not have published until CI concluded `success` on `88786b1`. The cross-platform test failure on `0b9ae33`'s predecessor would have been visible before the tag push.

What this change DOES NOT catch:
- Schema-level breaks (e.g. a tool's required param is renamed). Those surface as runtime `expected:"error"` mismatches in the heavy E2E.
- Harness-level breaks (e.g. the watchdog is removed). Those would have to be caught by manual E2E or by adding cheap tests to `mcp-harness-watchdog-primitives.test.ts`.
- Runtime Access errors (e.g. compile-vba mojibake). Those need either a clean fixture or `expected:"error"` assertions (now pinned by `mcp-e2e-compile-vba-mojibake-pin.test.ts` for the current known state).

## Follow-up

- [`docs/release-checklist.md`](../../docs/release-checklist.md) updated to reference the script as the canonical workflow.
- [README](../../README.md) gains a "Releases" section pointing at the script.
- The heavy `node E2E_testing/mcp-e2e.mjs` remains a manual operator step. Cheap contract tests in `test/quality-gates/mcp-e2e-suite-contracts.test.ts` (9 tests) and `mcp-e2e-tool-existence.test.ts` (3 tests) pin the structural invariants the heavy E2E would have caught in 30 minutes, so the heavy E2E is now the LAST verification step rather than the first.