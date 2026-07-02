# Proposal: Form IR Bugs — rpt prefix, FormatConditions token collision, corrupt catalog overwrite

## Intent

Close three form-IR bugs from the 2026-07-01 audit (issue #622):

- **#A (🟡)** `resolveComponent` doesn't recognize `rpt`; a
  `rptFoo` report falls to `vbaType === 100` fallback → lands
  in `forms/`.
- **#B (🟡)** `applyTokenMap` uses `startsWith` for preserved
  metadata, so `FormatConditions` is mis-classified. A
  `{{FormatConditions}}` token is recorded as "applied" but
  the IR is never rewritten.
- **#C (🟡)** `catalogAddControl` swallows every `readJson`
  error the same way; corrupt catalog silently overwritten
  with one-control stub. All other entries lost, no warning,
  no backup.

Chain splits cleanly along the three findings → 3
independently-revertable PRs.

## Scope

### In Scope

- **#A** Extend the report-prefix set at
  `src/core/mapping/component-resolver.ts:27` to include
  `rpt` and `rpt_`, mirroring the existing `frm` form pattern
  at line 24. RED tests at
  `test/core/mapping/component-resolver.test.ts` (10 tests
  today, none for `rpt`).
- **#B** Replace `startsWith`-based preserved-metadata
  predicate in
  `src/core/services/form-ir-service.ts:750-752` with
  exact-match `["Checksum", "Format", "PrtDevMode"]`. Fix
  `appliedTokens` (line 829-841) to reflect ACTUAL
  replacement (currently "source-AND-map", lies when a
  preserved key holds the token). RED test in
  `test/core/services/form-ir-clone-template.test.ts` (line
  106-129 covers `Format` only; nothing covers the
  `FormatConditions` collision).
- **#C** Distinguish ENOENT (genuine missing → empty catalog)
  from JSON parse errors (corrupt → refuse) in
  `src/core/services/vba-form-service.ts:193-201`. Replace
  the pinning test at
  `test/core/services/vba-form-service.test.ts:814` (mocks
  `readJson` rejection and asserts empty-catalog fallback —
  this test pins the bug) with two tests: ENOENT keeps
  behavior, parse error returns `VBA_CATALOG_CORRUPT` and
  does NOT call `writeFile`.

### Out of Scope

- Wiring `resolveComponent` into production code (it has NO
  caller in `src/` today; see Audit Notes). Connecting it is
  a separate design change.
- Renaming Access `Format`/`FormatConditions` semantics.
- Catalog backup/audit subsystem (fix is minimal — refuse
  corrupt writes; backups are a separate capability).

## Capabilities

### New Capabilities
None.

### Modified Capabilities

- **`access-core-services`** (delta, 4 requirements):
  1. **Preserved-key predicate is exact-match.** MUST use
     `includes()` against
     `["Checksum", "Format", "PrtDevMode"]`. Keys starting
     with those strings (e.g. `FormatConditions`) MUST flow
     through token replacement like layout keys. (Closes #B.)
  2. **`appliedTokens` truthfulness.** MUST list only tokens
     whose `{{...}}` pattern was actually replaced in the
     post-IR serialization. A token whose pattern remains
     (lives inside a preserved key) MUST NOT appear. (Closes #B.)
  3. **Catalog corruption refusal.**
     `catalogAddControl` MUST distinguish `ENOENT` (empty
     catalog) from JSON parse error
     (return `VBA_CATALOG_CORRUPT` and MUST NOT call
     `writeFile`). (Closes #C.)
  4. **Component resolver prefix coverage.** Report prefix
     set MUST include legacy Access prefixes. Today
     `{report_}`; delta adds `rpt` and `rpt_`. (Closes #A.)

## Approach

Each PR is a one-fix PR with RED-first unit tests. Strict TDD
per campaign rule (NO E2E this cycle). For #B, swap
`startsWith` for `includes`; derive `appliedTokens` from the
post-IR serialization diff (a token whose `{{...}}` still
appears was not replaced). For #C, the existing
`isMissingPathError` helper at `vba-form-service.ts:332` is
the gate — call it inside the catch arm. No E2E; the
real-Access `access-runner.test.ts:1358` flake is expected
across all PRs (campaign note, not a regression).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/mapping/component-resolver.ts:27` | Modified | #A: replace single-prefix `startsWith("report_")` with a `REPORT_PREFIXES` set including `rpt`/`rpt_`. |
| `src/core/services/form-ir-service.ts:750-752` | Modified | #B: drop `startsWith` from `isPreservedMetadataKey`; exact-match via `includes`. |
| `src/core/services/form-ir-service.ts:829-841` | Modified | #B: derive `appliedTokens` from post-IR serialization. |
| `src/core/services/vba-form-service.ts:193-201` | Modified | #C: split catch arm — ENOENT keeps empty, parse error returns `VBA_CATALOG_CORRUPT`. |
| `test/core/mapping/component-resolver.test.ts` | Modified | #A: add 4 RED cases (`rptFoo`, `rpt_Foo`, `Rpt_X`, `rptAudit`). |
| `test/core/services/form-ir-clone-template.test.ts` | Modified | #B: add RED test pinning `FormatConditions ="{{Token}}"` is replaced when mapped; second test pinning `appliedTokens` excludes tokens still in serialized IR. |
| `test/core/services/vba-form-service.test.ts:814` | Modified | #C: split into ENOENT (keep) + parse-error (refuse + no write). |
| `openspec/specs/access-core-services/spec.md` | Modified | Delta: 4 requirements above. |

## Chain Split (force-chained PRs, 400-line budget)

| # | PR | Goal | Likely Δ | TDD evidence | Rollback |
|---|---|---|---|---|---|
| **1** | `[#622/1] #A component resolver recognizes rpt prefix` | Extend report prefix set. | 60-120 | RED 4 cases in `component-resolver.test.ts`. | Revert; latent (no caller today). |
| **2** | `[#622/2] #B exact-match preserve predicate + appliedTokens truth` | Drop `startsWith`; fix `appliedTokens`. | 150-200 | RED `form-ir-clone-template.test.ts`: `FormatConditions` token replaced; `appliedTokens` excludes tokens still in serialized IR. | Revert; bug returns. |
| **3** | `[#622/3] #C catalog corruption refusal` | ENOENT vs parse error. | 100-160 | RED `vba-form-service.test.ts`: split pinning test 814. | Revert; bug returns. |

Total: 310-480 changed lines across 3 PRs. Each PR is
independently reviewable and revertable. User has authorized
merging to `main` as we go (per #619 / #620 / #621 precedent)
— no `staging` gate.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| #A `rpt` false-positives unrelated module (e.g. `RptConfig` → reports/ instead of modules/) | Low | Same risk as existing `frm`. Folder-existence gates already check write paths. If it bites, narrow to `rpt[A-Z]`. |
| #B removing `startsWith` re-preserves a key currently caught by prefix match (future `FormatXxx` blob) | Med | Snapshot `preservedKeys` of every `E2E_testing/src/forms/*.form.txt`; assert equality after change. Add new key explicitly if drift surfaces. |
| #B `appliedTokens` truth ripples into `vba-forms-adapter.ts:984` which copies it into success envelope | Low | No branch logic depends on it today. Pinned via test. |
| #C `VBA_CATALOG_CORRUPT` is new; downstream MCP consumers handling only known codes may surface raw error | Low | Code follows dysflow `VBA_*` UPPER_SNAKE convention; MCP adapter passes failure codes through. Document in CHANGELOG. |
| #C `readJson` may surface ENOENT wrapped in `Invalid JSON file:` message | Low | `nodeFileSystem.readJson` at line 50-57 wraps ONLY parse errors; ENOENT falls through unchanged. `isMissingPathError(err)` checks `err.code === "ENOENT"`. Pinned via test. |

## Rollback Plan

Each PR is independently revertable. PR1 restores the
single-prefix `report_` check. PR2 restores the `startsWith`
predicate (bug returns). PR3 merges the catch arms back (bug
returns). No data loss in any rollback.

## Dependencies

- `test/core/mapping/component-resolver.test.ts`,
  `test/core/services/form-ir-clone-template.test.ts`,
  `test/core/services/vba-form-service.test.ts`.
- Existing helper `isMissingPathError` at
  `vba-form-service.ts:332`.
- Capability spec `openspec/specs/access-core-services/spec.md`.
- Real-Access `access-runner.test.ts:1358` flake — campaign
  note, not a regression.

## Success Criteria

- [ ] **#A**: `resolveComponent("rptFoo")` returns
      `{ folder: "reports", extension: ".report.txt", type: "report" }`
      (and `rpt_Foo`, `Rpt_X`, `rptAudit`). Existing
      `Report_`/`frm` unchanged.
- [ ] **#B**: Source with `FormatConditions ="{{Token}}"` +
      map `{Token: "X"}` produces output with
      `FormatConditions ="X"`. `appliedTokens` excludes
      tokens whose `{{...}}` pattern remains in serialized IR.
- [ ] **#C**: `catalogAddControl` against corrupt catalog
      returns `ok: false` with `error.code === "VBA_CATALOG_CORRUPT"`;
      `writeFile` NOT called. ENOENT keeps empty-catalog.
- [ ] `pnpm test`, `pnpm lint`, `pnpm build` pass after each PR.
- [ ] Each PR commit body carries `SDD: form-ir-bugs` and
      `Issue: #622`.
- [ ] No commit body carries AI co-author attribution.

## Audit-precision notes (informed by reading code)

- **Path imprecision.** Audit locates bugs at
  `src/adapters/vba-sync/component-resolver.ts:24-34` and
  `src/adapters/vba-sync/vba-form-service.ts:193-201`. Actual
  paths: `src/core/mapping/component-resolver.ts` and
  `src/core/services/vba-form-service.ts`. The
  `src/adapters/vba-sync/` path is the **adapter** that
  wires these services into MCP (e.g.
  `vba-forms-adapter.ts:191-193`). Same path imprecision #620
  surfaced; doesn't change the fix.
- **#A `resolveComponent` is dead code.** Audit says reports
  "are lost or corrupted in export/mutation/template
  operations". Reading the code, `resolveComponent` has
  **zero production callers in `src/`** today — only its own
  file + test file reference it. Historical
  `archive/form-ui-factory/design.md:103` sketched it as the
  `inspect_form` data flow, but the actual
  `VbaFormsAdapter.inspectForm` takes `sourcePath` directly
  and uses `parseFormTxt`. The bug is **latent** — correct
  behavior is needed before this function is wired into
  anything that matters. Fix is forward-looking + prevents
  the next adapter author from inheriting the gap, but
  urgency is lower than the audit's framing suggests. PR1
  should add a "no current caller" note in the JSDoc.
- **#B the lie is twofold.** `applyTokenMap` at 829-841
  computes `appliedTokens` via `Object.hasOwn(tokenMap,
  sourceToken)` — i.e. "the name is in source AND in map".
  The predicate does NOT check whether the entry was
  actually rewritten. So `appliedTokens: ["Format"]` is
  returned while the serialized IR still contains
  `{{Format}}`. Both halves must be fixed: (1) the
  preserved-key predicate must be exact-match (so
  `FormatConditions` is no longer mis-classified), and (2)
  `appliedTokens` must reflect ACTUAL replacement (so a
  preserved key holding a token does not falsely report
  `applied`).
- **#C the bug is pinned by an existing test.**
  `vba-form-service.test.ts:814` mocks `readJson` rejection
  with `mockRejectedValue(new Error("ENOENT"))` and asserts
  the empty-catalog fallback. Because production code does
  not distinguish ENOENT from parse errors, this test ALSO
  passes when `readJson` rejects with a parse error —
  pinning the bug. PR3 must **split** this test into two
  (ENOENT keeps behavior; parse error fails), not just add
  a new test on top.
- **Adjacent surface for #A.** Audit calls out `rpt`. Same
  risk applies to other Access-prefix variants (`rpt_`,
  `rep`, `rep_`). PR1 adds `rpt` and `rpt_`; further
  prefixes deferred until a real project surfaces them,
  per "fix what's reported, don't widen scope".