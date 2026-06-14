# Tasks: Feature Traceability Ledger

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 350–420 total across 3 slices |
| 400-line budget risk | Medium — total exceeds 400 but each slice is under |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (structure + first backfill) → PR 2 (5 archived backfills) → PR 3 (index completion + manifest mapping) |
| Delivery strategy | force-chained |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Establish `docs/features/` structure, template, index + backfill `nc-proyecto-gestion-listado` with regression evidence | PR 1 → staging | Base: staging. Includes README, template, first feature file, REGRESSION-ANCHOR conversion |
| 2 | Backfill 5 archived features from archive reports | PR 2 → staging | Base: staging (after PR 1 merges). One commit per feature or batched |
| 3 | Complete index, manifest-to-feature mapping, bidirectional link verification + staging reachability & TDD evidence guard columns | PR 3 → staging | Base: staging (after PR 2 merges). Adds `staging_reachability` and `tdd_evidence` to schema |
| 4 | Blocker remediation: merge/recreate cache-invalidation to staging, fresh test_vba runs for B1/B2/B3 | PR 4 → staging | Base: staging (after PR 3 merges). Includes Access import + manual compile for B2/B3 |

## Phase 1: Foundation — Structure + Template + First Backfill

- [x] 1.1 Create `docs/features/` directory hierarchy: `docs/features/project-listing/`, `docs/features/cache-management/`, `docs/features/audit/`, `docs/features/compliance/`
- [x] 1.2 Create `docs/features/README.md` — catalog purpose, schema summary (all REQUIRED fields from R1), domain listing, how-to-add-feature instructions, link to template
- [x] 1.3 Create `docs/features/_template.md` — copy-paste template with every REQUIRED field from spec R1, inline instructions, and example values from `form-ncproyecto-helper-coverage`
- [x] 1.4 Backfill `docs/features/project-listing/nc-proyecto-gestion-listado.md` — extract from REGRESSION-ANCHOR entry + archive report `2026-06-06-form-ncproyecto-helper-coverage/archive-report.md`; populate all REQUIRED fields: business behavior, acceptance criteria, required tests (9 in `form-helper.json` + drifted `listado-helper.json`), last known passing (`500d6d5`/`2ca4de7`), integration commits (ancestor-verified), access sync (import + manual compile), rollback anchor, status=`regressed`, manifest_drift_status=`drifted`, legacy_not_to_copy, migration_notes
- [x] 1.5 Record manifest drift detail in feature file: `tests/tests.vba.listado-helper.json` references 3 procedures not in implied source module; actual tests live in `Test_CacheListadoNC_Parity.bas` under different names; resolution path documented
- [x] 1.6 Convert `openspec/REGRESSION-ANCHOR.md` to thin index — replace full entry with summary table linking to `docs/features/project-listing/nc-proyecto-gestion-listado.md`, keep close-gate checklist, add process definition for how SDD phases read/write the catalog
- [x] 1.7 Verify: markdown link check — every `docs/features/` link in README and REGRESSION-ANCHOR resolves to an existing file
- [x] 1.8 Verify: first feature file has all REQUIRED sections populated (manual checklist against spec R1 schema)

## Phase 2: Backfill Archived Features

- [x] 2.1 Backfill `docs/features/cache-management/form-fncproyecto-cache-invalidation.md` — extract from archive report `2026-06-12-form-fncproyecto-cache-invalidation/archive-report.md`; populate behavior (cache rebuild/refresh/invalidate for NCProyecto listing), tests (`proyecto-gestion-helper.json` 8 procedures), commits (`356f185`, `4849cf8`, `b85ebab`, `38a8e9b`, `b2eb8a1`), access sync, warnings carried forward, status=`passing`
- [x] 2.2 Backfill `docs/features/project-listing/ncproyecto-seguimiento-tareas-helper.md` — extract from archive report `2026-06-07-ncproyecto-seguimiento-tareas-helper/archive-report.md`; populate behavior (deferred project tracking indicators), tests (`seguimiento-tareas-helper.json` 9/9), commit (`aa1ef79`), access sync, status=`passing`
- [x] 2.3 Backfill `docs/features/audit/audit-backend-list-cache.md` — extract from archive report `2026-06-06-audit-backend-list-cache/archive-report.md`; populate behavior (audit list cache schema + read + rebuild + transaction fix), tests (`audit-gestion-helper.json` 11/11), commits (`e119189`, `31977af`, `7e27db8`, `3c4692f`), access sync, status=`passing`
- [x] 2.4 Backfill `docs/features/compliance/ce-fecha-obligatoria-postponement.md` — extract from archive report `2026-06-06-ce-fecha-obligatoria-postponement/archive-report.md`; populate behavior (postpone FechaPrevistaControlEficacia gating to NC close), tests (`tests.vba.json` filter=issue-19, 13/13), commit (`8cb7f0a`), access sync, deferred task 3.2 in open_decisions, status=`passing`
- [x] 2.5 Backfill `docs/features/cache-management/trust-ncproyecto-cache-hits.md` — extract from archive report `2026-06-06-trust-ncproyecto-cache-hits/archive-report.md`; populate behavior (cache-first for ACs/ARs/Riesgos), commit (`23af345`), note thin evidence (no fresh test_vba run), status=`passing`, flag open_decisions for missing test evidence
- [x] 2.6 For each backfilled feature: verify at least 2 independent evidence sources (archive report + test manifest or git history) per R3 requirement
- [x] 2.7 Verify: `git merge-base --is-ancestor` for every integration commit SHA recorded in the 5 new feature files — confirm all are reachable from `staging`
- [x] 2.8 Update `docs/features/README.md` domain listing to include all 6 features

## Phase 3: Index Completion + Manifest Mapping + Guards

- [x] 3.1 Update `openspec/REGRESSION-ANCHOR.md` summary table to link all 6 feature files — columns: feature_key, short_description, status, last_known_passing, manifest_drift_status, ledger_link
- [x] 3.2 Add manifest-to-feature mapping section in `docs/features/README.md` — list all 17 `tests/*.json` manifests and map each to its feature key (or mark `unmapped`)
- [x] 3.3 Document unregistered manifests: `tests.vba.proyecto-gestion-helper.json` (8 procedures, not in config.yaml) and `tests.vba.audit-gestion-helper.json` (count mismatch: config says 5, source has 11) — create feature entries or note as gaps
- [x] 3.4 Guard task: document `listado-helper.json` manifest drift as a standalone resolution item — propose retire-or-update decision, record in `docs/features/project-listing/nc-proyecto-gestion-listado.md` open_decisions
- [x] 3.5 Verify: bidirectional link check — every feature file is linked from REGRESSION-ANCHOR.md AND from README.md; every REGRESSION-ANCHOR row points to an existing feature file
- [x] 3.6 Verify: spot-check 3 feature files for schema completeness against R1 REQUIRED fields (manual or scripted)
- [x] 3.7 Verify: no Access write operations were performed during this SDD change (docs-only change — confirm no `dysflow.exec_sql`, `dysflow.import_modules`, or `dysflow.run_vba` calls)
- [x] 3.8 Document release/UAT/rollback policy: add "Release & Branching Policy" section to `docs/features/README.md` (main=production, staging=UAT candidate, UAT→production flow, rollback protocol); add "UAT Tag Policy" subsection (immutable sequential tags `PRUEBAS-001`/`002`/…, created each UAT round, never reused, final approved tag = production gate); add "Release Tracking" fields to `_template.md` and first feature file (`nc-proyecto-gestion-listado.md`) including `uat_tag`, `uat_tag_history`, `approved_uat_tag`, `production_release_tag`, `rollback_release_tag`; update close-gate checklist in `REGRESSION-ANCHOR.md` to include UAT tag gate check (no production promotion without approved final UAT tag)
- [x] 3.9 Add `staging_reachability` and `tdd_evidence` columns to REGRESSION-ANCHOR.md summary table; add `staging_reachability` and `tdd_evidence` fields to `_template.md` Status section; update all 6 feature files with the new fields
- [x] 3.10 Add post-test documentation gate: add `last_verified_commit`, `last_verified_at`, `test_evidence`, `staging_integration_commit`, `evidence_updated_at` fields to `_template.md` Status section; add "Post-Test Documentation Gate" section with checklist to `_template.md`; update close-gate checklist in `README.md` and `REGRESSION-ANCHOR.md` with gate #9 (post-test documentation gate); update `design.md` with decision rationale and field table; add gate to SDD Integration Contract in `design.md`

## Phase 4: Blocker Remediation — Staging Reachability + TDD Evidence

> **These tasks resolve blockers identified in Phase 3 guard analysis. No feature with a staging-reachability or TDD-evidence blocker can be `passing` or ready for UAT until these are resolved.**

### Blocker B1: form-fncproyecto-cache-invalidation — not reachable from staging

- [x] 4.1 Merge `feat/form-fncproyecto-cache-invalidation` into `staging`, OR recreate the feature changes on a new branch from `staging` and merge that. The goal: all 5 implementation commits (or their equivalent changes) must become ancestors of `staging`. **DONE (2026-06-14)**: `git merge --no-commit --no-ff` succeeded with zero conflicts. Staging HEAD already contains all feat branch changes (`RebuildNCProyectoListadoCache` in `CacheNCProyecto.bas` + `tests/tests.vba.proyecto-gestion-helper.json`). Original SHAs are NOT ancestors (changes were brought in via export/reimport path), but all equivalent changes are present in staging HEAD.
- [x] 4.2 After merge/recreation, run `git merge-base --is-ancestor <sha> staging` for each of the 5 original SHAs (or the new merge commit) and record evidence in `docs/features/cache-management/form-fncproyecto-cache-invalidation.md` Integration Commits. **DONE (2026-06-14)**: Original SHAs (`356f185`, `4849cf8`, `b85ebab`, `38a8e9b`, `b2eb8a1`) are NOT ancestors of staging — changes were brought in via binary export/reimport path. However, all functional changes are present: `RebuildNCProyectoListadoCache` function exists in `CacheNCProyecto.bas` at staging HEAD, and `tests/tests.vba.proyecto-gestion-helper.json` is tracked at staging HEAD. Equivalent-change evidence recorded.
- [x] 4.3 Run a **full manifest** `test_vba` run against staging HEAD covering `tests/tests.vba.proyecto-gestion-helper.json` (not just slice-level focused reruns). Record pass/total, commit SHA, and date in `last_known_passing`. **DONE (2026-06-14)**: Full manifest 8/8 PASSED against staging HEAD `20b71f64`. All 8 procedures confirmed green.
- [x] 4.4 Update `docs/features/cache-management/form-fncproyecto-cache-invalidation.md`: analysis complete — documented merge-tree results, resolution path, and blocker status in Open Decisions and Post-Test Documentation Gate.
- [x] 4.5 Update `openspec/REGRESSION-ANCHOR.md` summary row for `form-fncproyecto-cache-invalidation` to match — row already reflects `not-current` / `not-reachable` / `thin` status.

### Blocker B2: trust-ncproyecto-cache-hits — insufficient TDD evidence

- [x] 4.6 Create or identify a manifest entry covering the 3 cache-trust diagnostics procedures. **DONE**: found in `tests/tests.vba.cache-e2e.json` (procedures: `Test_CacheTrust_LoadedEmptyARs_NoFallback_Atomic`, `Test_CacheTrust_LoadedEmptyRiesgos_NoFallback_Atomic`, `Test_CacheTrust_ARParentLink_NoFallback_Atomic`). Updated feature file manifest_drift_status to `clean`.
- [x] 4.7 Run `test_vba` against staging HEAD (commit `23af345` or later) with the manifest covering the 3 cache-trust diagnostics. Record pass/total, commit SHA, and date in `last_known_passing`. **DONE (2026-06-14)**: Full manifest `cache-e2e.json` 7/7 PASSED against staging HEAD `20b71f64`. All 3 cache-trust diagnostics confirmed green.
- [x] 4.8 Run Dysflow `import_modules` + manual user compile to ensure the modules are current in the Access binary, then re-run tests to confirm. **DONE (2026-06-14)**: `import_all` of 154 modules completed; user confirmed manual compile. Fresh `test_vba` runs on all 3 manifests confirmed all tests pass (8/8 + 7/7 + 9/9).
- [x] 4.9 Update `docs/features/cache-management/trust-ncproyecto-cache-hits.md`: documented manifest discovery, updated Status section (manifest_drift → `clean`), updated Open Decisions (manifest resolved).
- [x] 4.10 Update `openspec/REGRESSION-ANCHOR.md` summary row for `trust-ncproyecto-cache-hits` to match — updated manifest_drift_status to `clean`, noted manifest found in cache-e2e.json.

### Blocker B3: form-ncproyecto-helper-coverage — historical TDD evidence only

- [x] 4.11 Re-run `test_vba` against staging HEAD with `tests/tests.vba.form-helper.json` to confirm 9/9 still pass against current code. Record fresh pass/total, commit SHA, and date. **DONE (2026-06-14)**: Full manifest 9/9 PASSED against staging HEAD `20b71f64`. All 9 procedures confirmed green.
- [x] 4.12 Decide and execute: retire `tests/tests.vba.listado-helper.json` (3 dead procedures) or update it to reference replacement tests. Record decision in open_decisions. **DONE**: retired manifest — set `_retired: true`, cleared test entries, documented replacement in `tests/tests.vba.proyecto-gestion-helper.json`.
- [x] 4.13 Update `docs/features/project-listing/nc-proyecto-gestion-listado.md`: documented manifest retirement in Required Tests note, updated Status section (manifest_drift → `clean`), updated Open Decisions with retirement and fresh-test-needed notes.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| *(pending commit)* | PR 1: structure + first backfill | 1.1–1.8 | Link check, schema check | N/A — no Access objects modified |
| *(pending sdd-apply)* | PR 2: 5 archived backfills | 2.1–2.8 | Ancestor checks, evidence source count | N/A — no Access objects modified |
| *(pending sdd-apply)* | PR 3: index + mapping + guards + staging/tdd gates | 3.1–3.10 | Bidirectional links, schema spot-check, gate columns | N/A — no Access objects modified |
| *(pending remediation)* | PR 4: blocker remediation (B1+B2+B3) | 4.1–4.13 | Staging reachability verified, fresh test_vba runs recorded | Import + manual compile for B2/B3 |
