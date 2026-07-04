# Proposal: doc-bookkeeping — Close audit-trail gaps from 2026-07-01 sweep (issue #623)

## Intent

Close the two bookkeeping findings from the 2026-07-01 audit
(issue #623). Both are SDD-record-incomplete / audit-trail-
broken findings, in unrelated areas:

- **#A (🟡)** `forms-ui-factory-slice-3-serialize-and-roundtrip`
  has `verify-report.md = PASS` but the folder was never
  archived and no `archive-report.md` was produced.
  Posterior slices 4 and 5 ARE in the archive folder
  (see audit-precision notes), but only slice-5 has a
  proper `archive-report.md`.
- **#B (🟡)** `AGENTS.md:33` and
  `docs/testing/testing-philosophy.md:84` reference
  `test/scripts-access-runner.test.ts` — a file deleted in
  commit `7806c18` (2026-06-06, #443). A new agent hits a
  404 on the canonical docs.

## Scope

### In Scope

- **#A** Archive
  `openspec/changes/2026-06-30-forms-ui-factory-slice-3-serialize-and-roundtrip/`:
  move folder under
  `openspec/changes/archive/2026-06-30-forms-ui-factory-slice-3-serialize-and-roundtrip/`
  and write a backfill `archive-report.md` modeled on
  slice-5's report.
- **#A.2** Backfill `archive-report.md` for
  `openspec/changes/archive/2026-06-30-forms-ui-factory-slice-4-mutation-primitives/`
  (folder already in `archive/` per commit `a803c9c`).
- **#B** Update `AGENTS.md:33` and
  `docs/testing/testing-philosophy.md:83-84` to drop the
  dead `test/scripts-access-runner.test.ts` reference and
  use the actual integration scope
  (`test/e2e/**` + `test/integration/**` per
  `vitest.integration.config.ts:8-11`).

### Out of Scope

- New MCP tools, schema changes, code, tests, or behavior
  changes. This is bookkeeping only.
- Re-running the slice-3 / slice-4 verify cycle. Both
  already PASS.
- Other `test/scripts-*.test.ts` references in
  `openspec/changes/archive/**`, `docs/archive/**`,
  `CHANGELOG.md`, or `docs/work/**` — historical artifacts
  per the 2026-06-28 close-batch-562-580-591 precedent.
- `CHANGELOG.md` entry (doc drift is not user-visible).
- Creating the missing test file. The 2026-06-28 fix for
  #580 explicitly chose to REMOVE phantom references, not
  to create the file.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None.

> Bookkeeping only. No new behavior, no requirement changes.

## Approach

Two self-contained doc work units, both in one PR:

1. **Archive backfill (slice-3 + slice-4).** Use the
   slice-5 `archive-report.md` as the structural template
   (only archived change in this repo with a complete
   report). Source data is read from each folder's existing
   `verify-report.md` / `apply-progress.md` and the relevant
   git commit (`a1243ae` for slice-3, `a803c9c` for
   slice-4). No external data is invented.
2. **Doc drift fix (AGENTS.md + testing-philosophy.md).**
   Two single-line text replacements; verified by `rg
   "scripts-access-runner\.test\.ts"` returning no matches
   in non-historical docs.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/changes/2026-06-30-forms-ui-factory-slice-3-serialize-and-roundtrip/` | Moved to `archive/` | #A: full archive workflow (move + report). |
| `openspec/changes/archive/2026-06-30-forms-ui-factory-slice-3-serialize-and-roundtrip/archive-report.md` | New file | #A: templated on slice-5. |
| `openspec/changes/archive/2026-06-30-forms-ui-factory-slice-4-mutation-primitives/archive-report.md` | New file | #A.2: backfill only (folder already archived). |
| `AGENTS.md:33` | Modified | #B.1: dead-path → real integration scope. |
| `docs/testing/testing-philosophy.md:83-84` | Modified | #B.2: same fix as #B.1. |

## Chain Split (force-chained PRs, 400-line budget)

**Chained PRs recommended: No.** Single PR (50-100 changed
lines; the two `archive-report.md` files are templated
boilerplate, doc edits are single-line replacements).

| # | PR | Goal | Likely Δ | Verification | Rollback |
|---|---|---|---|---|---|
| **1** | `[#623/1] doc-bookkeeping: archive-report backfill + doc drift` | Archive slice-3 + slice-4 backfill reports; fix AGENTS.md + testing-philosophy.md | 50-100 | Read each `archive-report.md` against its `verify-report.md` (PASS, 0 CRITICAL). Read the two doc edits against `vitest.integration.config.ts:8-11`. `rg "scripts-access-runner\.test\.ts"` clean in active docs. `pnpm exec biome check .` green. `pnpm test` smoke. | Revert the commit. Slice-3 folder returns to active `changes/`; the two reports are deleted; the doc drifts return. Lossless. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Archive backfill invents data not in git history | Med | Both folders have `verify-report.md` + `apply-progress.md`; report values come from those plus `git log --follow` of the folder. Slice-5 is the structural template. |
| Move of slice-3 collides with another in-flight change | Low | `git log --all -- openspec/changes/archive/2026-06-30-forms-ui-factory-slice-3*` returns nothing. Safe to move. |
| Doc drift exists in more files than audit named | Low | Verified via `rg`: only `AGENTS.md:33` (active) and `docs/testing/testing-philosophy.md:84` (active) carry the dead reference. All other matches are in `archive/`, `docs/archive/`, `docs/work/`, or `CHANGELOG.md` (historical, out of scope). |
| `pnpm test` surprises on a docs-only change | Low | No `.ts` / `.bas` / `.cls` edited. Pre-existing `access-runner.test.ts:1358` flake tolerated per form-ir-bugs session summary (not introduced here). |

## Rollback Plan

Single revert. Slice-3 folder regains `changes/` (undo the
move). The two `archive-report.md` files are deleted. The two
doc edits revert. No code, no API, no data — revert is
lossless.

## Dependencies

- **Model artifact**: slice-5 `archive-report.md`.
- **Slice-3 source data**: existing `verify-report.md` (PASS)
  + `apply-progress.md` + commit `a1243ae`.
- **Slice-4 source data**: existing `verify-report.md` (PASS)
  + `apply-progress.md` + commit `a803c9c`.
- **Reference for #B**: `vitest.integration.config.ts:8-11`.

## Success Criteria

- [ ] Slice-3 folder is under `archive/` and contains
      `archive-report.md` with PASS verdict, 0 CRITICAL.
- [ ] Slice-4 `archive-report.md` exists with PASS verdict,
      0 CRITICAL.
- [ ] `AGENTS.md:33` no longer contains
      `test/scripts-access-runner.test.ts`; points to real
      integration scope (`test/e2e/**` +
      `test/integration/**`).
- [ ] `docs/testing/testing-philosophy.md:83-84` no longer
      contains `test/scripts-access-runner.test.ts`.
- [ ] `rg "scripts-access-runner\.test\.ts" -g '!openspec/changes/archive/**' -g '!docs/archive/**' -g '!docs/work/**' -g '!CHANGELOG.md' --type md`
      returns no matches.
- [ ] `pnpm test` and `pnpm exec biome check .` green.
- [ ] Commit body carries `SDD: doc-bookkeeping` and
      `Issue: #623` per `gentle-ai:sdd-commit-traceability`.
- [ ] No commit body carries AI co-author attribution.

## Audit-precision notes (informed by reading code)

Two scope-EXPANSIONS, not contract changes — surfaced so the
orchestrator sees the full picture before apply:

- **#A scope widens by one backfill.** The audit says
  "Slices 4 and 5 (posterior) ARE archived." Reading
  `openspec/changes/archive/2026-06-30-forms-ui-factory-slice-4-mutation-primitives/`
  directly: the folder IS in `archive/` (moved by commit
  `a803c9c`), but contains no `archive-report.md`. Only
  slice-5 has the full report. So the audit-trail gap on
  slice-3 is the SAME shape of gap on slice-4. The fix is
  two backfill reports, not one. Same precision pattern the
  campaign found on #619 (inverted branch-2 trigger) and
  #620 (`src/adapters/mcp/` vs `src/core/operations/`).
- **#B scope widens by one doc.** `rg` over the repo
  surfaces TWO active doc references:
  `AGENTS.md:33` AND
  `docs/testing/testing-philosophy.md:84` (the canonical
  "north star" doc per AGENTS.md:28). The 2026-06-28
  `close-batch-562-580-591` (fix for #580) removed phantom
  references from `vitest.config.ts`,
  `vitest.integration.config.ts`, and `.github/workflows/ci.yml`
  — but did NOT touch AGENTS.md or testing-philosophy.md.
  The drift is a partial holdover from that cleanup. Both
  doc edits are single-line replacements (no scope creep).
- **Historical references are NOT in scope.** Same regex
  matches 27+ lines in `CHANGELOG.md`,
  `docs/work/issue-380-test-hardening.md`,
  `docs/archive/AUDIT_*.md`, `docs/archive/WORKLOG_*.md`,
  and `openspec/changes/archive/**`. Per the 2026-06-28
  precedent, historical SDD folders and worklogs are NOT
  retro-fitted. The CHANGELOG line in particular is the
  historical record of a CI fix that referenced the file
  when it still existed. Leaving them alone matches the
  "audit trail is sacred" rule.

## TDD for a docs-only change

`openspec/config.yaml` declares `apply.tdd: true`. This change
has no production code, so strict RED→GREEN is satisfied in
the loose sense: the "test" is reviewer's diff inspection.
- The two `archive-report.md` files are templated on
  slice-5; values come from existing
  `verify-report.md` / `apply-progress.md` / git log, not
  invented.
- The two doc edits are spec-equivalent replacements
  (dead path → real path) and verified by `rg` returning
  no matches post-change.
- `pnpm test` is a smoke run; must remain green
  (pre-existing `access-runner.test.ts:1358` flake
  tolerated, not introduced here).
