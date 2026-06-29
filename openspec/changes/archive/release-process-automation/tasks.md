# release-process-automation — tasks

Implementation shipped via the commits below. Strict-TDD discipline:
the 15 Pester tests in `scripts/tests/release-prepare.Tests.ps1` were
written first (RED) and pinned the contract, and the script was
implemented to satisfy them (GREEN). The full cycle is one work unit.

## Work Unit A — script + tests (single commit `01918d4`)

- [x] **A.1** `scripts/release-prepare.ps1` — NEW: pre-flight + bump + commit + push + poll-CI + tag + push-tag. Refuses on dirty tree / behind origin / missing `gh` / no bump / non-greater version. [RED] 15 Pester tests in `scripts/tests/release-prepare.Tests.ps1` written FIRST and they fail against the empty stub. [GREEN] script implemented to satisfy the tests. ~280 lines.

## Commits

| SHA | Subject |
|-----|---------|
| `01918d4` | `feat(scripts): release-prepare.ps1 with CI-gating` |

## Companion work in the same release batch

These are not part of `release-process-automation` proper — they are
companion fixes for the regressions that surfaced when this script's
absence caused v1.11.0 to ship broken. They live under the
`tdd-coverage-holes` SDD retroactively.

| SHA | Subject | SDD |
|-----|---------|-----|
| `0b9ae33` | `fix(test): make mcp-e2e-grandchild-zombie cross-platform` | tdd-coverage-holes (retroactive) |
| `ae80b2e` | `fix(e2e): restore tools/list advertised-count preflight (WU-D regression)` | tdd-coverage-holes (retroactive) |
| `b578893` | `test(e2e): pin compile_vba expectation to the documented mojibake state` | tdd-coverage-holes (retroactive) |
| `37fe659` | `test(quality-gates): pin every mcp-e2e suite contract the heavy battery would otherwise catch 30 minutes in` | tdd-coverage-holes (retroactive — cheap pins) |

## Tasks Summary

| Work Unit | Tasks | Phase | Lines |
|-----------|-------|-------|-------|
| A | A.1 | RED + GREEN | ~280 |
| **Total** | **1 task** | | **~280** |

## Implementation commits (final)

| Commit | Work unit | SDD tasks | Verification | Access sync |
|--------|-----------|-----------|--------------|-------------|
| `01918d4` | A | A.1 | `pwsh -Command "Invoke-Pester -Path scripts/tests/release-prepare.Tests.ps1"` → 15/15 PASS | N/A (script-only) |