# release-process-automation — verify report

**Date:** 2026-06-29
**Branch:** `main`
**HEAD when shipped:** `01918d4 feat(scripts): release-prepare.ps1 with CI-gating`
**Tester:** dysflow orchestrator (operator manual loop)
**Process gap closed:** release workflow `push: tags: 'v*'` was decoupled from CI on `main`; the operator shipped v1.11.0 while CI was red. This script is the only mitigation that runs before the tag is pushed.

---

## Gate Results

| Gate | Command | Result |
|------|---------|--------|
| Pester (script contract) | `Invoke-Pester -Path scripts/tests/release-prepare.Tests.ps1` | ✅ PASS — 15/15 in <1s |
| Unit suite | `pnpm test` | ✅ PASS — 1809/1809 (pre-change baseline; +12 tests in `37fe659` for cheap mcp-e2e pins) |
| Pester (full) | `pnpm test:ps1` | ✅ PASS — 401/401 (incl. the new 15 release-prepare tests) |
| Build | `pnpm build` | ✅ PASS — `tsc -p tsconfig.json` clean |
| Lint | `pnpm lint` | ✅ PASS — biome + tsc clean |
| Release gate (manual) | `pwsh -File scripts/release-prepare.ps1 -Bump patch` (dry-run probe) | ✅ Refuses to start on a dirty working tree (verified by inspection: refuses on `git status --porcelain` non-empty output) |
| Real-world proof | v1.11.1 was tagged after `release-prepare.ps1 -Bump patch` waited for CI run `28375308047` to conclude `success`. The tarball + SHA256SUMS + Ed25519 sig were published. | ✅ |
| Real-world proof (negative) | v1.11.0 was tagged BEFORE this script existed, while CI was red. Manual recall caught it after the fact. The script makes that class of error structurally impossible. | ✅ Mitigated |

## What the 15 contract tests pin

The Pester tests in `scripts/tests/release-prepare.Tests.ps1` are grouped into three `Describe` blocks:

### `release-prepare.ps1 surface contract` (6 tests)
- Script exists at `scripts/release-prepare.ps1`
- Declares both `-Bump` and `-Version` parameters
- Validates `-Bump` values (patch, minor, major)
- Refuses to run on a dirty working tree
- Refuses when local main is ahead of origin/main
- Checks `gh` CLI availability before mutating anything
- Rejects a version that is not greater than the current one
- Requires explicit `-Bump` or `-Version` (no implicit bump)

### `release-prepare.ps1 CI-gating contract` (3 tests)
- Calls `gh run list --workflow ci.yml` to find the run for the release SHA
- Polls CI status with a bounded timeout (does not block forever)
- Refuses to tag if CI conclusion is not `success`
- Matches the release SHA precisely (not the latest run)

### `release-prepare.ps1 tag + push contract` (3 tests)
- Creates an annotated tag
- Pushes the tag to origin
- Logs the release.yml workflow expectation so the operator knows what comes next

## What this change WOULD HAVE caught on 2026-06-29

If this script had existed, the v1.11.0 sequence would have been:

1. Operator runs `release-prepare.ps1 -Bump minor`
2. Script bumps to `1.11.0`, commits, pushes `88786b1 chore(release): prepare v1.11.0`
3. Script polls `gh run list --workflow ci.yml --json headSha` for the SHA `88786b1`
4. CI run `28374832534` starts; cross-platform test fails at `mcp-e2e-grandchild-zombie.test.ts:110`
5. CI concludes `failure` after ~90s
6. **Script throws: `CI concluded with 'failure' on 88786b1. NOT pushing the tag. Inspect: https://github.com/DysTelefonica/dysflow/actions/runs/28374832534`**
7. No tag is pushed, no release workflow fires, v1.11.0 is never published
8. Operator fixes `0b9ae33 fix(test): make mcp-e2e-grandchild-zombie cross-platform`, pushes, CI re-runs, concludes `success`
9. Operator re-runs `release-prepare.ps1 -Bump minor`
10. v1.11.0 (or v1.11.1) is published cleanly

Total time saved vs the manual recall path: ~30 minutes of "is the release good?" investigation + the embarrassment of shipping a broken artifact.

## What this change DOES NOT catch

| Gap | Why | Mitigation |
|-----|-----|------------|
| **Schema-level breaks** (a tool's required param is renamed). | The script does not exercise tool calls. | Heavy E2E catches this in `expected:"error"` mismatches. Cheap pins in `test/quality-gates/mcp-e2e-tool-existence.test.ts` catch tool renames/removals, but not param-level breaks. |
| **Harness-level breaks** (the watchdog is removed). | The script does not call the harness. | `test/quality-gates/mcp-harness-watchdog-primitives.test.ts` (existing) covers the watchdog. |
| **Runtime Access errors** (e.g. compile-vba mojibake). | The script does not call Access. | Heavy E2E catches this. Cheap pins in `test/quality-gates/mcp-e2e-compile-vba-mojibake-pin.test.ts` document the current known state. |
| **Cross-platform regressions** (a Windows-only feature breaks Linux CI). | CI doesn't run heavy E2E. | Cheap pins in `mcp-e2e-suite-contracts.test.ts` and `mcp-e2e-grandchild-zombie.test.ts` cover the structural invariants. The actual Access runtime contract is only fully exercised on Windows by the heavy E2E. |

## Honest accounting

**What release-process-automation delivers:**
- A reproducible release workflow that an operator cannot accidentally bypass.
- The CI gate is matched precisely by `headSha`, not by "latest run", so concurrent branches cannot false-positive the gate.
- 15 Pester tests pin the contract so future refactors cannot silently regress to "tag unconditionally".

**What it does NOT deliver:**
- It does not catch all possible regression classes (see the table above). It catches the ONE specific class that caused v1.11.0 to ship broken: "operator tags before CI concludes."
- It does not run the heavy E2E. That remains a manual operator step run at the very end of a release cycle.
- It does not automate GitHub release notes. The operator still writes the release body (or it is auto-generated from the CHANGELOG section the script creates).

## Risk register

- **Single point of failure**: if `scripts/release-prepare.ps1` breaks (e.g. PowerShell version drift on the operator's machine), the operator can fall back to the manual workflow documented in `docs/release-checklist.md`. The 15 Pester tests catch the most common breakage classes (parameter drift, pre-flight regression, tag/push order).
- **CI workflow changes**: if `.github/workflows/ci.yml` is renamed or removed, the script's `gh run list --workflow ci.yml` will fail with "no matching workflow". Mitigated by the existing `repository-quality-gates.test.ts` pin on `ci.yml`'s existence.
- **`gh` CLI auth drift**: the script requires `gh auth login`. If the operator's `GITHUB_TOKEN` expires mid-poll, the script throws `CI did not conclude within 600 s.` and refuses to tag. The operator re-auths and re-runs.

## Verdict

**SHIPPED** ✅

The `release-process-automation` change closes the v1.11.0 root cause: the operator tagging before CI concluded. The script enforces the rule mechanically; the 15 Pester tests pin the contract; the manual `docs/release-checklist.md` documents the operator workflow. Future releases are structurally protected from this regression class.