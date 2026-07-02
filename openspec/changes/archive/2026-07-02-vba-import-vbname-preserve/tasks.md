# Tasks: Preserve Attribute VB_Name during VBA import

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~260-330 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | single PR (PS1-fix / classifier-fix are the fallback slice boundary if budget is exceeded during apply) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | PS1 import fix: new predicate + `Normalize-VbaImportText` rewire + Pester coverage | PR 1 (fallback only) | ~150-190 lines; self-contained, independently mergeable |
| 2 | Classifier fix: `keepVbName` actionability + Vitest fixtures + E2E assertion + docs | PR 2 (fallback only) | ~110-140 lines; independently revertible per design |

`sdd-apply` proceeds as a single PR by default. If diff exceeds 400 lines during apply, split along Unit 1 / Unit 2 boundary and require `size:exception` or ask the user for chain strategy before merging.

## Phase 1: PS1 — New Predicate (RED)

- [x] 1.1 In `scripts/tests/dysflow-vba-manager.Tests.ps1`, add new `Context "Test-IsVbaImportDroppableMetadataLine"` (after the existing `Test-IsVbaImportMetadataLine` context, ~line 438): assert `$true` for `VERSION 1.0 CLASS`, `BEGIN`, `END`, `MultiUse = -1`; assert `$false` for `Attribute VB_Name = "X"` and for a regular code line; assert `$true` for `Attribute VB_GlobalNameSpace = False`, `Attribute VB_Creatable = True`, `Attribute VB_PredeclaredId = True`, `Attribute VB_Exposed = False`; assert `-Throw` for empty string (mandatory param). Function does not exist yet — RED.
- [x] 1.2 Add `'function Test-IsVbaImportDroppableMetadataLine'` to `$pureFunctions` (~333-359) and `'Test-IsVbaImportDroppableMetadataLine'` to `$pureNames` (~370-393); add `'Merge-AccessDocumentWithCanonicalHeader'` to `$pureNames` (currently only in `$pureFunctions` at line 342).
- [x] 1.3 Run `pnpm run test:ps1` (or `Invoke-Pester scripts/tests/`) — confirm new context fails (function undefined) and nothing else regresses yet.

## Phase 2: PS1 — Normalize/Merge Round-Trip Coverage (RED)

- [x] 2.1 In `dysflow-vba-manager.Tests.ps1`, add round-trip `It` under `Normalize-VbaImportText`: input starts with `Attribute VB_Name = "X"` then `VB_GlobalNameSpace`/`VB_Creatable`/other VB_* attrs, duplicated `Option Explicit` lines, then body — assert output's first non-blank line is the VB_Name line, no `VB_GlobalNameSpace`/other stripped attrs survive, Option lines de-duplicated, body verbatim.
- [x] 2.2 Add new `Context` for `Merge-AccessDocumentWithCanonicalHeader`: local doc and canonical doc each carry a different `Attribute VB_Name`; assert merged output contains exactly ONE `Attribute VB_Name` line holding the canonical value (regression guard pinning the untouched `Split-VbaHeaderAndBody`/919 path).
- [x] 2.3 Confirm 431-432 (`Test-IsVbaImportMetadataLine` "returns true for Attribute VB_ line") is UNCHANGED — still asserts `$true` for `Attribute VB_Name`. Do NOT edit this test.
- [x] 2.4 Run `pnpm run test:ps1` — confirm 2.1/2.2 fail against current `Normalize-VbaImportText` (which still strips VB_Name); 431-432 stays green.

## Phase 3: PS1 — Stale Comment Fix

- [x] 3.1 In `scripts/tests/dysflow-vba-manager-unicode-roundtrip.Tests.ps1:73-74`, replace the stale comment "Attribute VB_Name + Option Explicit are stripped" with "Attribute VB_Name is PRESERVED (issue #646); duplicate Option lines are de-duplicated and the executable body is preserved verbatim." Optionally add `$outText.Contains('Attribute VB_Name = "Demo"') | Should -BeTrue`.

## Phase 4: PS1 — GREEN Implementation

- [x] 4.1 In `scripts/dysflow-vba-manager.ps1`, add `Test-IsVbaImportDroppableMetadataLine` immediately after `Test-IsVbaImportMetadataLine` and before `Test-IsVbaOptionDirectiveLine`, per design.md's exact body (identical clauses except final `'^Attribute\s+VB_(?!Name\b)'`).
- [x] 4.2 In `Normalize-VbaImportText`'s leading-skip loop (~line 799), switch `Test-IsVbaImportMetadataLine` to `Test-IsVbaImportDroppableMetadataLine`.
- [x] 4.3 In `Normalize-VbaImportText`'s directive-block loop (~line 810-835), add the VB_Name-keep-and-continue branch (`if ($trim -match '^Attribute\s+VB_Name\b') { $result.Add($line); continue }`) BEFORE the droppable check, then switch the droppable check (~line 820) from `Test-IsVbaImportMetadataLine` to `Test-IsVbaImportDroppableMetadataLine`.
- [x] 4.4 Leave `Split-VbaHeaderAndBody` (~line 919) and `Merge-AccessDocumentWithCanonicalHeader` UNCHANGED — still call the broad `Test-IsVbaImportMetadataLine`.
- [x] 4.5 Run `pnpm run test:ps1` — all Phase 1/2 tests green, 431-432 still green, full Pester suite green (no regression in `Split-VbaHeaderAndBody`/`Merge-…` consumers).

## Phase 5: TS Classifier — RED

- [x] 5.1 In `test/core/services/vba-semantic-classifier.test.ts`, verify fixtures at 380-394 and 1311-1320 stay green with no edits (both-sides-present cases; design confirms no flip needed) — run baseline to confirm current pass state before touching code.
- [x] 5.2 Add new test: `fileType: "cls"`, source starts with `Attribute VB_Name = "Form_X"` + code, binary starts at `Option Compare Database` + same code (VB_Name entirely absent on binary side) — assert `classification` is NOT `attributeOnly` and `result.actionable`/unique-line signal is truthy (mirror the assertion style at 391-393).
- [x] 5.3 Add the mirrored case: binary has `Attribute VB_Name = "Form_X"`, source omits it entirely — same actionable assertion.
- [x] 5.4 Add/confirm a both-sides-absent regression case stays non-actionable (`attributeOnly`), per spec scenario "Both sides absent — non-functional, unchanged."
- [x] 5.5 Run `pnpm test -- vba-semantic-classifier` — confirm 5.2/5.3 fail against current `keepVbName` logic; 5.1/5.4 pass.

## Phase 6: TS Classifier — GREEN

- [x] 6.1 In `src/core/services/vba-semantic-classifier.ts:875`, change `keepVbName` to `srcVbName !== binVbName` (drop the `!== null && ... !== null` guard so one-side-null counts as differing).
- [x] 6.2 Update the comment at lines 870-872 per design.md's replacement text (functional whenever sides disagree — real rename OR one-side-omission; non-functional only when both match or both omit).
- [x] 6.3 Run `pnpm test -- vba-semantic-classifier` — 5.1-5.4 all green, no other classifier test regresses. **Deviation**: the fix also flipped a pre-existing test not listed in design.md's fixture audit (`"resolves to caseOnly when only a header and identifier casing differ"`, ~line 1294) — its fixture had the binary side omit `Attribute VB_Name` entirely, which is exactly the one-side-missing masking scenario the fix corrects. Split into two tests: one keeping VB_Name equal on both sides (stays `caseOnly`/non-actionable) and one documenting the corrected one-side-missing behavior (`actionable: true`).

## Phase 7: Secondary E2E Confirmation

- [x] 7.1 In `test/e2e/form-codebehind-stale-import.e2e.test.ts`, attempted a VB_Name assertion on the importMode "Auto" case per design.md. **Reverted after execution against real Access COM** (this environment has Access available): `export_modules` writes a form/report `.cls` from `CodeModule.Lines(1, CodeModule.CountOfLines)` (`scripts/dysflow-vba-manager.ps1:1613-1614`), and the VBE `CodeModule.Lines` API never returns `Attribute` statements — they are metadata, not code lines. So the exported `.cls` can NEVER contain `Attribute VB_Name` regardless of whether the import fix works; this artifact cannot verify the fix. Replaced the assertion with an explanatory NOTE pointing back to the Pester suite as the primary pinning seam. Ran the full e2e file against real Access COM: the "Auto" import test (which exercises the exact fixed code path) passes; the `#543` compile:true test fails identically on baseline (pre-fix) code, confirmed via `git stash` isolation — pre-existing, unrelated to this change.

## Phase 8: Docs

- [x] 8.1 `AGENTS.md` — replace the VB_Name bullet (~line 58-59) per design.md's exact replacement text.
- [x] 8.2 `README.md:619` — apply the identical correction to the `attributeOnly` row's VB_Name clause.
- [x] 8.3 `CHANGELOG` — add a prominent bugfix entry for issue #646 (VB_Name preserved through import; `verify_code` no longer masks one-side-missing VB_Name).

## Phase 9: Final Verification Gate

- [x] 9.1 Run `pnpm test` (Vitest unit suite) — full green (161 files, 2026 tests).
- [x] 9.2 Run `pnpm run build` — green, no type errors.
- [x] 9.3 Run `pnpm run test:ps1` (`pwsh -Command "Invoke-Pester scripts/tests/"`) — full Pester suite green (423 tests, 419 passed, 4 skipped, 0 failed), including unchanged 431-432 and the new predicate/round-trip/merge contexts.
- [x] 9.4 Confirmed success criteria from proposal.md are all satisfied (see apply-progress / final report) before requesting sdd-verify.
