# Proposal: Preserve Attribute VB_Name during VBA import

## Intent

Issue #646 (bug/high): `Test-IsVbaImportMetadataLine` regex `^Attribute\s+VB_` matches `Attribute VB_Name`, so `Normalize-VbaImportText` strips it before every `AddFromFile` write. `VB_Name` never reaches the compiled binary — reimporting the 38 forms dropped their identity line, and Access spawned a broken `Form_TempSccObj1` placeholder. A companion classifier gap in `verify_code` (`keepVbName` folds one-side-missing VB_Name to `attributeOnly`) MASKS this corruption from drift audits. Both ship together so the fix is verifiable end-to-end.

## Scope

### In Scope
- **PS1 fix**: NEW predicate `Test-IsVbaImportDroppableAttributeLine` (regex `^Attribute\s+VB_(?!Name\b)`) used ONLY by `Normalize-VbaImportText` call sites (lines 799, 820). Add explicit "recognize VB_Name → keep line AND `continue`" branch in the directive-block loop (810-835) so later droppable attrs still strip.
- **Classifier fix**: `keepVbName = srcVbName !== binVbName` (treat `null` as distinct) in `vba-semantic-classifier.ts:873` — one-side-missing VB_Name becomes actionable.
- **Tests (RED first)**: flip `dysflow-vba-manager.Tests.ps1:431-432`; correct stale comment in `dysflow-vba-manager-unicode-roundtrip.Tests.ps1:67-114`; register new predicate in `$pureFunctions`/`$pureNames` (333-393); add `Merge-AccessDocumentWithCanonicalHeader` coverage (no duplicate VB_Name); flip/add classifier fixtures (`vba-semantic-classifier.test.ts:380-394, 1311-1320`); add VB_Name assertion to `form-codebehind-stale-import.e2e.test.ts`.
- **Docs**: AGENTS.md VB_Name bullet + README semantic-diff section + prominent CHANGELOG bugfix entry.

### Out of Scope
- `Test-IsVbaImportMetadataLine` itself and its `Split-VbaHeaderAndBody` call (line 919) — MUST keep current broad behavior; excluding VB_Name there duplicates the line in LoadFromText → duplicate-declaration compile error. Do NOT unify the two predicates.
- `Test-LooksLikeVbaCodeLine` (1041-1045) — correct as-is.
- Version bump / release cut — follow-up after verify+archive.

## Capabilities

### New Capabilities
- `vba-semantic-diff`: `verify_code` classifies a one-side-missing `Attribute VB_Name` (source present, binary absent, or vice versa) as actionable, not `attributeOnly`.

### Modified Capabilities
- `vba-manager-actions`: Import Action Behavior MUST preserve `Attribute VB_Name` through import normalization so it reaches the binary via `AddFromFile`.

## Approach

Two conceptually-aligned edits mirroring the classifier's existing "strip all VB_* except VB_Name" semantic in PS1. Pester (COM-free) is the primary TDD loop; Access E2E is secondary confirmation. Strict TDD: RED test precedes every behavior change in both Pester and Vitest.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/dysflow-vba-manager.ps1` | Modified | New predicate + loop-control fix |
| `src/core/services/vba-semantic-classifier.ts` | Modified | `keepVbName` actionability |
| `scripts/tests/*.Tests.ps1` | Modified | Flip stale, add coverage |
| `test/core/services/vba-semantic-classifier.test.ts` | Modified | Flip/add fixtures |
| `AGENTS.md`, `README.md`, `CHANGELOG` | Modified | Contract + release note |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Loop control-flow regression drops later attrs | Med | Explicit VB_Name-keep-and-continue branch + Pester test |
| Predicate unification breaks LoadFromText merge | Med | Scope guard: new predicate, Split path untouched; Merge regression test |
| Classifier change regresses legit both-absent case | Low | Audit fixtures 380-394/1311-1320; keep green ones green |

## Rollback Plan

Single revert of the change commit(s) restores prior behavior; no data migration, no persisted state. Classifier change is pure-function logic — safe to revert independently if needed.

## Review Workload

Estimated ~250-350 changed lines across two cleanly-separable work units (PS1 import fix + TS classifier fix). Borderline vs the 400-line budget. Flagging per delivery instructions — orchestrator applies the cached single-pr policy (stop and record). `Decision needed before apply: Yes`. `Chained PRs recommended: No` (single PR feasible; slices are separable if budget exceeded). `400-line budget risk: Medium`.

## Success Criteria

- [ ] Pester proves `Test-IsVbaImportDroppableAttributeLine` keeps VB_Name, strips other VB_* attrs.
- [ ] Import path writes VB_Name to binary; E2E VB_Name assertion green on Access host.
- [ ] `verify_code` reports one-side-missing VB_Name as actionable.
- [ ] No duplicate VB_Name in `Merge-AccessDocumentWithCanonicalHeader` output.
- [ ] AGENTS.md/README/CHANGELOG updated; full suite green.
