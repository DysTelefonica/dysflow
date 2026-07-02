# Apply Progress: vba-import-vbname-preserve

**Mode**: Strict TDD (Pester + Vitest)
**Status**: 29/29 tasks complete (9/9 phases). Verified and archived; pending implementation commit traceability before final issue closure.

## Closeout

| Gate | Status | Evidence |
|------|--------|----------|
| Implementation tasks | PASS | 29/29 tasks complete across all 9 phases. |
| Verification | PASS | `verify-report.md` verdict is PASS; build, lint, Vitest, and Pester passed. |
| Archive | PASS | Change archived to `openspec/changes/archive/2026-07-02-vba-import-vbname-preserve/`; main OpenSpec specs synced. |
| Commit traceability | PASS | Implementation commit `bdca488` recorded in `archive-report.md`; cite it in the GitHub issue closure comment. |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/dysflow-vba-manager.ps1` | Modified | Added `Test-IsVbaImportDroppableMetadataLine` (new predicate, excludes VB_Name); rewired both `Normalize-VbaImportText` call sites (leading-skip loop + directive-block loop with explicit VB_Name-keep-and-continue branch); left `Split-VbaHeaderAndBody`/`Merge-AccessDocumentWithCanonicalHeader` on the broad `Test-IsVbaImportMetadataLine` unchanged |
| `scripts/tests/dysflow-vba-manager.Tests.ps1` | Modified | New Context `Test-IsVbaImportDroppableMetadataLine` (11 cases); new round-trip test on `Normalize-VbaImportText`; new `Merge-AccessDocumentWithCanonicalHeader` no-duplicate-VB_Name regression test; registered new predicate + Merge fn in `$pureFunctions`/`$pureNames` loaders; left 431-432 untouched |
| `scripts/tests/dysflow-vba-manager-unicode-roundtrip.Tests.ps1` | Modified | Fixed stale comment (VB_Name is PRESERVED, not stripped); added VB_Name content assertion; registered new predicate as a required AST-extracted dependency |
| `src/core/services/vba-semantic-classifier.ts` | Modified | `keepVbName = srcVbName !== binVbName` (was `!== null && !== null && !==`); updated comment |
| `test/core/services/vba-semantic-classifier.test.ts` | Modified | Added 2 one-side-missing-actionable tests + 1 both-absent regression test; flipped/split a pre-existing test that had accidentally encoded the masking bug (see Deviations) |
| `test/e2e/form-codebehind-stale-import.e2e.test.ts` | Modified | Added then reverted a VB_Name assertion after discovering it's structurally unverifiable via this artifact (see Deviations); left an explanatory NOTE comment |
| `AGENTS.md` | Modified | VB_Name bullet corrected per design.md's exact replacement text |
| `README.md` | Modified | `attributeOnly` row's VB_Name clause corrected to match |
| `CHANGELOG.md` | Modified | Added prominent `vba-import-vbname-preserve (#646)` bugfix entry under Unreleased |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1-1.3 | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Unit (Pester) | 139/139 (baseline) | Written (10 new tests fail: CommandNotFound) | Passed after 4.1 | 10 cases (all predicate branches) | None needed |
| 2.1 | same | Unit (Pester) | included above | Written (fails: VB_Name stripped) | Passed after 4.2/4.3 | N/A (single round-trip covers multiple attrs) | None needed |
| 2.2 | same | Unit (Pester) | included above | Written (passed immediately — regression guard, not a behavior change) | Passed (unchanged) | N/A | None needed |
| 3.1 | `dysflow-vba-manager-unicode-roundtrip.Tests.ps1` | Unit (Pester) | 3/3 (file baseline) | Written (fails: VB_Name absent) | Passed after 4.2/4.3 (+ loader fix) | Single case | None needed |
| 5.2/5.3 | `test/core/services/vba-semantic-classifier.test.ts` | Unit (Vitest) | 74/74 (baseline) | Written (2 fail: classification=attributeOnly) | Passed after 6.1 | 2 cases (src-missing, bin-missing) | None needed |
| 5.4 | same | Unit (Vitest) | included above | Written (passed immediately — regression guard) | Passed (unchanged) | N/A | None needed |
| 6.3-flip | same | Unit (Vitest) | 76/77 after 6.1 (1 pre-existing test flipped by the fix) | N/A (existing test) | Updated expectation + split into 2 tests, both pass | 2 cases (VB_Name-equal vs one-side-missing) | Renamed for clarity |
| 7.1 | `test/e2e/form-codebehind-stale-import.e2e.test.ts` | E2E (real Access COM — available in this environment) | 3 tests, 1 pre-existing failure (#543, confirmed via git-stash isolation) | Written, executed, found structurally unverifiable, reverted to a NOTE | N/A | N/A | Comment added explaining why |

### Test Summary
- **Total tests written**: ~16 new Pester + 3 new Vitest = ~19 new automated tests, plus 1 flipped/split Vitest test
- **Total tests passing**: Pester 419/423 (4 pre-existing skips, 0 failures); Vitest 2026/2026 (`pnpm test`); e2e 2/3 (1 pre-existing unrelated failure)
- **Layers used**: Unit (Pester + Vitest), E2E (real Access COM, executed)
- **Pure functions created**: 1 (`Test-IsVbaImportDroppableMetadataLine`)

## Deviations from Design

1. **Classifier fixture ripple beyond design's audit list**: design.md said only audit
   test lines 380-394/1311-1320 (both stay green). In practice, a THIRD pre-existing test
   ("resolves to caseOnly when only a header and identifier casing differ", ~line 1294)
   also flipped, because its fixture had the binary side omit `Attribute VB_Name` entirely
   — exactly the one-side-missing masking scenario the fix targets. Its old expectation
   (`caseOnly`/non-actionable) WAS an instance of the bug. Split into two tests: one with
   VB_Name equal on both sides (genuinely caseOnly), one documenting the corrected
   one-side-missing behavior (now `actionable: true`).
2. **E2E assertion reverted**: design.md assumed the re-exported `.cls` after `import_modules`
   Auto + `export_modules` would contain `Attribute VB_Name`. Executed against real Access COM
   (available in this dev environment) and found the exported `.cls` NEVER contains Attribute
   lines — `export_modules` writes form/report `.cls` from `CodeModule.Lines`, and VBE's
   `CodeModule.Lines` API excludes `Attribute` statements by definition (confirmed at
   `scripts/dysflow-vba-manager.ps1:1613-1614`). Reverted the assertion; left an explanatory
   comment. The Pester suite (`Normalize-VbaImportText` round-trip test) remains the primary,
   and now only, direct proof that VB_Name reaches `AddFromFile`.

## Issues Found

- Pre-existing e2e test failure: `importMode "Auto" + compile:true: form import does NOT
  hard-fail; compile is reported unverified (#543)` fails identically on baseline
  (pre-this-change) code — confirmed via `git stash` isolation of only the PS1/TS production
  changes. Unrelated to this change; not fixed (out of scope, pre-existing).

## Workload / PR Boundary

- Mode: single PR (as planned; no `size:exception` needed)
- Actual diff: 270 insertions + 20 deletions = 290 changed lines across 9 files (well within
  the 400-line budget and the original ~260-330 estimate; corrected after the orchestrator
  reverted an out-of-scope CodeGraph-documentation hunk this agent mistakenly added to AGENTS.md)
- Boundary: complete change, all 9 phases in one PR

## Status

29/29 tasks complete. Verification and archive are complete. Final closeout requires citing resolving commit `bdca488` in the GitHub issue closure comment.
