# Tasks: form-ir-bugs — 3-Fix Campaign
## Archive Reconciliation

- **Issue**: #622
- **Merged PR evidence**: #635, #636, #637
- **Status**: Archive reconciliation: all planned tasks are marked complete based on merged PRs #635, #636, and #637.

---


## Review Workload Forecast

| PR | Estimated changed lines | 400-line budget risk | Files touched | Tests | Notes |
| --- | ----------------------- | -------------------- | ------------- | ----- | ----- |
| #A | 90–130 | **Low** | `component-resolver.ts`, `component-resolver.test.ts` | +4 RED | Latent fix; 10 existing tests stay green |
| #B | 140–190 | **Low** | `form-ir-service.ts`, `form-ir-clone-template.test.ts` | +3 RED | Behavior change — strict policy |
| #C | 110–160 | **Low** | `vba-form-service.ts`, `vba-form-service.test.ts` | +4 RED (1 split: −1 +2) | Behavior change — corrupt catalog refusal |

**Decision needed before apply**: No
**Chained PRs recommended**: Yes
**Chain strategy**: `force-chained` (3 PRs, 400 line budget each)
**400-line budget risk**: Low
**Suggested split**: PR1 → PR2 → PR3

> All three PRs are well within the 400-line budget. The force-chain is per campaign rule, not a risk mitigation.

---

## PR 1 — #A: `rpt` prefix in `component-resolver`

**Commit**: `fix(form-ir-bugs): resolveComponent recognizes rpt/rpt_ prefixes (#622)`
**Branch base**: `main`

### Commit body

```
SDD: form-ir-bugs
Issue: #622
Tests: +4 RED cases in test/core/mapping/component-resolver.test.ts
Note: resolveComponent has no production callers today (latent fix).
```

### Test plan (RED first)

1. Add to `test/core/mapping/component-resolver.test.ts` inside `describe("resolveComponent", ...)`:
   - `it("should resolve rpt prefixed components as reports (issue #622 #A)")`
   - `it("should resolve rpt_ underscored form as reports (issue #622 #A)")`
   - `it("should resolve uppercase Rpt prefix as reports (issue #622 #A)")`
   - `it("should resolve type 100 with rpt prefix as reports — prefix wins over fallback (issue #622 #A)")` ← regression guard
2. Run `pnpm test` — all 4 RED.
3. Implement fix.

### Implementation steps

1. **Add `REPORT_PREFIXES` const** — insert after line 9 of `src/core/mapping/component-resolver.ts`, before the `// If type is explicitly provided` comment:
   ```ts
   const REPORT_PREFIXES = ["report_", "rpt", "rpt_"] as const;
   ```
2. **Replace the single-prefix check** (lines 23-29) — widen `report_`-only check to `REPORT_PREFIXES.some(...)`. Keep `startsWith("form_") || startsWith("frm")` block above it.
3. **Commit**.

### Verification steps

1. `pnpm test` — all 4 new tests GREEN.
2. `pnpm lint` — clean.
3. `pnpm build` — clean.
4. `pnpm test` (full suite) — 10 existing tests stay GREEN.

### Rollback

```bash
git revert HEAD --no-edit
```
Reverts to single-prefix `report_` check; bug returns.

---

## PR 2 — #B: `FormatConditions` predicate + `appliedTokens` truth

**Commit**: `fix(form-ir-bugs): exact-match preserved-key predicate + appliedTokens truth (#622)`
**Branch base**: `main` (independent of PR1)

### Commit body

```
SDD: form-ir-bugs
Issue: #622
Tests: +3 RED cases in test/core/services/form-ir-clone-template.test.ts
Note: strict policy behavior change — tokens inside preserved keys now
count as missing. See CHANGELOG.
```

### Test plan (RED first)

1. Add to `test/core/services/form-ir-clone-template.test.ts` inside `describe("applyTokenMap (low-level IR transformation)")`:
   - `it("replaces a {{Token}} occurrence in a FormatConditions scalar when mapped (issue #622 #B)")`
   - `it("appliedTokens excludes a token whose only occurrence was inside a preserved-metadata key (issue #622 #B)")`
   - `it("appliedTokens includes only tokens whose {{...}} pattern was actually replaced in the serialized IR (issue #622 #B)")`
2. Run `pnpm test` — all 3 RED.
3. Implement fix.

### Implementation steps

1. **Predicate fix** — replace `isPreservedMetadataKey` at `src/core/services/form-ir-service.ts:750-756`:
   - Old: `PRESERVED_METADATA_KEYS.some((prefix) => key === prefix || key.startsWith(prefix))`
   - New: `PRESERVED_METADATA_KEYS.includes(key)` (exact match)
   - Update JSDoc to document the exact-match contract.
2. **`appliedTokens` derivation** — replace the `Object.hasOwn`-based loop at lines 826-841 inside `applyTokenMap`:
   - Add `nextText = serializeFormTxt(next)` and `survivingTokens = new Set(collectSourceTokens(nextText))`.
   - Partition `sourceTokens` by `survivingTokens.has(token)` — survivors go to `missingTokens`, non-survivors go to `appliedTokens`.
   - Update warning message to describe the preserved-key scenario.
3. **Commit**.

### Verification steps

1. `pnpm test` — all 3 new tests GREEN.
2. `pnpm lint` — clean.
3. `pnpm build` — clean.
4. `pnpm test` (full suite) — existing `form-ir-clone-template.test.ts` suite stays GREEN.

### Rollback

```bash
git revert HEAD --no-edit
```
Reverts to `startsWith` predicate and `Object.hasOwn` derivation; bug returns.

### CHANGELOG entry (add to `CHANGELOG.md` under this change)

```markdown
### `fix(form-ir-bugs): exact-match preserved-key predicate + appliedTokens truth`

**Behavior change — strict policy.** `applyTokenMap` now derives `appliedTokens` from a post-IR serialization diff rather than from `Object.hasOwn(tokenMap, token)`. A source token whose only `{{...}}` occurrence lives inside a preserved metadata key (e.g. inside `Checksum`) is now reported in `missingTokens` and triggers `FORM_MUTATION_INVALID` under strict policy. Previously it was reported as `applied` and the operation succeeded. warn-pass-through (default) is unchanged for the IR text.

**Action required for strict-policy users**: If your source forms contain tokens inside `Checksum`, `Format`, or `PrtDevMode` scalars, either widen the token map to cover them or remove the tokens from the preserved-key scalars.
```

---

## PR 3 — #C: corrupt catalog refusal

**Commit**: `fix(form-ir-bugs): catalogAddControl refuses corrupt catalog with VBA_CATALOG_CORRUPT (#622)`
**Branch base**: `main` (independent of PRs 1+2)

### Commit body

```
SDD: form-ir-bugs
Issue: #622
Tests: split pinning test at vba-form-service.test.ts:814; +3 new RED cases
Note: dryRun short-circuit moved to AFTER catalog read; corruption is now
visible in dryRun. See CHANGELOG.
```

### Test plan (RED first)

1. **REPLACE** the pinning test at `test/core/services/vba-form-service.test.ts:814` — split into 4 tests:
   - `it("catalogAddControl uses empty catalog when readJson rejects with ENOENT (issue #622 #C)")` — keeps behavior, uses `Object.assign(new Error("ENOENT"), { code: "ENOENT" })` mock pattern
   - `it("catalogAddControl returns VBA_CATALOG_CORRUPT when readJson rejects with a non-ENOENT error and does not write (issue #622 #C)")` — RED (current code silently overwrites)
   - `it("catalogAddControl returns success in dryRun with ENOENT and does not write (issue #622 #C)")` — RED (current code skips read in dryRun)
   - `it("catalogAddControl returns VBA_CATALOG_CORRUPT in dryRun with parse error and does not write (issue #622 #C)")` — RED (current code skips read in dryRun)
2. **UPDATE** the existing `VBA_CATALOG_WRITE_FAILED` test at line ~841 — add `Object.assign(new Error("ENOENT"), { code: "ENOENT" })` mock to the `readJson` mock so the new read-before-write flow does not fail at the read step.
3. Run `pnpm test` — all 4 new tests RED (3 new + 1 replaced).
4. Implement fix.

### Implementation steps

1. **Reorder `catalogAddControl`** — at `src/core/services/vba-form-service.ts`:
   - Move the `dryRun` short-circuit (lines ~182-191) to occur AFTER the catalog read.
   - Branch the `readJson` catch on `isMissingPathError(err)`:
     - `isMissingPathError` → swallow, `catalog = {}`, continue.
     - else → return `failureResult(VBA_CATALOG_CORRUPT, ...)`.
   - `dryRun` block returns `successResult({ dryRun: true, written: false, ... })` after the read+update.
   - Write + write-error arm follow.
2. **Commit**.

### Verification steps

1. `pnpm test` — all 4 new/split tests GREEN; existing `VBA_CATALOG_WRITE_FAILED` test GREEN.
2. `pnpm lint` — clean.
3. `pnpm build` — clean.
4. `pnpm test` (full suite) — full suite GREEN.

### Rollback

```bash
git revert HEAD --no-edit
```
Merges catch arms back, re-inserts dryRun short-circuit before read; bug returns.

### CHANGELOG entry (add to `CHANGELOG.md` under this change)

```markdown
### `fix(form-ir-bugs): catalogAddControl refuses corrupt catalog with VBA_CATALOG_CORRUPT`

**Behavior change.** `catalogAddControl` now reads the catalog file before the `dryRun` short-circuit. Previously, a corrupt (unparseable) catalog was silently overwritten with a one-control stub in `apply` mode. Now it returns `VBA_CATALOG_CORRUPT` in both `apply` and `dryRun` modes and does NOT modify the on-disk catalog. ENOENT (missing catalog) retains existing behavior (proceeds with empty catalog).

**Recovery**: If you receive `VBA_CATALOG_CORRUPT`, inspect the catalog file at the path in the error message, restore it from backup, or delete it to let the tool rebuild it on the next run.
```

---

## Spec Divergence Noted (not propagated to tasks)

Spec said "dryRun/apply parity with `generateForm`" — aspirational, not empirical. `generateForm` does NOT do a read in dryRun. The `catalogAddControl` reorder achieves **intra-method** parity (read always → write-or-skip), which is the spec's actual intent. The design noted this; tasks do not depend on the parity claim.

---

## Strict-Policy Hidden Behavior Change (documented for CHANGELOG)

Under `strict` policy, a source token whose only `{{Token}}` occurrence lives inside a preserved metadata key (e.g. `Checksum ="{{X}}"`) now triggers `FORM_MUTATION_INVALID`. Previously it was reported as `applied` and the operation succeeded. The existing test at `form-ir-clone-template.test.ts:106-129` stays green by accident (does not assert on `appliedTokens`/`missingTokens`). CHANGELOG entry is in PR2 above.

---

## AGENTS.md update

No AGENTS.md entry required. The `component-resolver` section does not document prefix conventions, and the new `rpt`/`rpt_` behavior is adequately captured in the code comments added by PR1. If a future maintainer searches for "report prefix" in AGENTS.md and finds nothing, the comment in `component-resolver.ts` is the source of truth.

---

## Implementation Order

1. **PR1 (#A)** — pure refactor, no behavior change, 10 existing tests as regression baseline. Implement first.
2. **PR2 (#B)** — behavior change (strict policy only), no interdependency with #A or #C. Independent of PR1.
3. **PR3 (#C)** — behavior change on corrupt catalog. Independent of PRs 1+2.

All three PRs are **fully independent** — no shared files, no git merge conflicts between them. They may be reviewed and merged in any order (force-chain is a campaign discipline constraint, not a dependency constraint). Each PR individually reverts to bug-state.
