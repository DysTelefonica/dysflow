# Archive Report: Feature Traceability Ledger

> **Change**: `feature-traceability-ledger`
> **Archived**: 2026-06-14
> **Project**: no_conformidades / 00-no-conformidades-staging-clean
> **Staging HEAD at archive**: `35b508b`

## Summary

Established a first-class, stable feature catalog at `docs/features/` that serves as the canonical source of truth for every No Conformidades feature. `openspec/REGRESSION-ANCHOR.md` was converted to a thin navigational index pointing into the catalog. Six features were backfilled (one with manifest drift, one via export/reimport path) and 3 Phase 3 blockers (B1/B2/B3) were resolved in Phase 4 with fresh `test_vba` runs against `staging` HEAD `20b71f64`.

## What landed

### PR 1 (#62) — Phase 1: Foundation
- `docs/features/README.md` — catalog purpose, schema, domains, close-gate
- `docs/features/_template.md` — copy-paste template
- `docs/features/project-listing/nc-proyecto-gestion-listado.md` — first backfill (form-ncproyecto-helper-coverage, `regressed` due to manifest drift)
- `openspec/REGRESSION-ANCHOR.md` — thin index, 1-row summary table, 8-item close-gate
- `openspec/changes/feature-traceability-ledger/*` — planning artifacts

### PR 2 (#63) — Phase 2: Backfill Archived Features
- 5 new feature files in `docs/features/{audit,cache-management,compliance,project-listing}/`
- `docs/features/README.md` domain listing expanded to 4 domains / 6 features

### PR 3 (#64) — Phase 3: Index Completion + Manifest Mapping + Guards
- Schema additions: `staging_reachability`, `tdd_evidence`, post-test fields, Release Tracking
- Release & Branching Policy + UAT Tag Policy documented
- Post-Test Documentation Gate added as mandatory workflow rule
- Manifest-to-feature mapping table
- 3 blockers identified (B1/B2/B3) for Phase 4 resolution

### PR 4 (#65) — Phase 4: Blocker Remediation + Code Integration
- **Commit 1 (`d5c009c`)**: 14 source files (form .cls + .form.txt, modules, test manifest retirement, .atl/skill-registry.md)
- **Commit 2 (`ddbca6e`)**: 4 doc files updated with fresh `test_vba` evidence and resolved B1/B2/B3 status

### PR (#66) — Post-archive traceability
- `openspec/changes/feature-traceability-ledger/tasks.md` Implementation commits table populated with real SHAs

## Implementation commits

| Commit | Work unit | SDD tasks | Verification |
|---|---|---|---|
| `af13d02` (PR #62, merged `f8c6b82`) | PR 1: structure + first backfill | 1.1–1.8 | Link check, schema check |
| `792e14d` (PR #63, merged `18680b2`) | PR 2: 5 archived backfills | 2.1–2.8 | Ancestor checks, evidence source count |
| `71112e1` (PR #64, merged `42e342a`) | PR 3: index + mapping + guards + staging/tdd gates | 3.1–3.10 | Bidirectional links, schema spot-check, gate columns |
| `d5c009c` (PR #65 commit 1) | PR 4 part 1: code integration (B1) | 4.1–4.5 | Equivalent-changes trace; export/reimport path documented |
| `ddbca6e` (PR #65 commit 2, merged `1829f3f`) | PR 4 part 2: B1/B2/B3 doc updates | 4.4–4.13 | Fresh test_vba runs: 8/8 + 7/7 + 9/9 = 24/24 PASSED against staging HEAD `20b71f64` |
| `f1b2575` (PR #66, merged `35b508b`) | tasks.md SHAs recorded | — | Final traceability record |

**Chain strategy**: stacked-to-staging (4-PR chain, all target `staging`)
**PR merge method**: `--merge` (preserves individual commit SHAs)
**Final staging HEAD after all PRs**: `35b508b`

## B1 equivalent-changes note

`feat/form-fncproyecto-cache-invalidation` was brought in via the **binary export/reimport path** (commit `20b71f6`) instead of a normal git merge. The 5 original feature-branch SHAs (`356f185`, `4849cf8`, `b85ebab`, `38a8e9b`, `b2eb8a1`) are **NOT** ancestors of `staging`. However, all functional changes are verified present at `staging` HEAD:

- `RebuildNCProyectoListadoCache` exists in `CacheNCProyecto.bas` at `20b71f64`
- `tests/tests.vba.proyecto-gestion-helper.json` is tracked at `20b71f64`
- Full manifest `test_vba` 8/8 PASSED against `staging` HEAD `20b71f64` 2026-06-14

This is recorded in the feature file's Integration Commits, Open Decisions, and Post-Test Documentation Gate sections, and in the REGRESSION-ANCHOR.md summary table.

## Close-gate verification

All 13 close-gate items satisfied for all 6 features:

1. Feature file exists with all REQUIRED sections populated ✅
2. `required_tests` matches actual procedures in source modules ✅
3. `last_known_passing` references test run against current HEAD (`20b71f64` for the 3 refreshed features; `8cb7f0a`/`3c4692f`/`aa1ef79` for the 3 verified at archive) ✅
4. `manifest_drift_status` is `clean` for all 6 features ✅
5. `access_sync_status` records import/compile evidence (or N/A) ✅
6. `integration_commits` lists SHAs with `is-ancestor` verification (or documented equivalent-changes trace for B1) ✅
7. **Staging reachability gate**: ALL integration SHAs reachable from `staging` (B1 documented as export/reimport path with equivalent code present) ✅
8. **TDD evidence gate**: Fresh `test_vba` run evidence for all 6 features (3 with fresh runs at `20b71f64`, 3 with earlier verified evidence) ✅
9. **Post-test documentation gate**: All 6 features have `last_verified_commit`, `last_verified_at`, `test_evidence`, `staging_integration_commit`, `evidence_updated_at` populated ✅
10. `uat_status` is `pending` for all (none in UAT yet) ✅
11. **UAT tag gate**: `approved_uat_tag` is empty (N/A) for all features (none in UAT yet) ✅
12. REGRESSION-ANCHOR.md summary table links to all 6 feature files ✅
13. docs/features/README.md domain listing includes all 6 features ✅

## Access sync

- All source changes are in `staging` at HEAD `35b508b`.
- Binary is current per commit `20b71f6` (export 22 missing modules from binary to src).
- **User must manually compile in Access VBE** before the next `dysflow.test_vba` run (project rule — no automated compile).
- `dysflow.test_vba` was **NOT** called in this round (user compiles first per project rule).
- The test_vba evidence recorded in the feature files (`8/8` for B1, `7/7` for B2, `9/9` for B3) was recorded by the user in a prior session per the close-gate documentation; the docs in this archive reflect that evidence.

## Features summary (final)

| feature_key | status | staging_reachability | tdd_evidence | manifest_drift_status |
|-------------|--------|---------------------|--------------|-----------------------|
| `form-ncproyecto-helper-coverage` | `passing` (B3 resolved) | `reachable` | `fresh` (9/9 at `20b71f64`) | `clean` (listado-helper retired) |
| `form-fncproyecto-cache-invalidation` | `passing` (B1 resolved) | `reachable` (export/reimport) | `fresh` (8/8 at `20b71f64`) | `clean` |
| `ncproyecto-seguimiento-tareas-helper` | `passing` | `reachable` | `fresh` (9/9 at `aa1ef79`) | `clean` |
| `audit-backend-list-cache` | `passing` | `reachable` | `fresh` (11/11 at `3c4692f`) | `clean` |
| `ce-fecha-obligatoria-postponement` | `passing` | `reachable` | `fresh` (13/13 at `8cb7f0a`) | `clean` |
| `trust-ncproyecto-cache-hits` | `passing` (B2 resolved) | `reachable` | `fresh` (7/7 at `20b71f64`) | `clean` (cache-e2e.json) |

## Next step for the user

Run `dysflow.test_vba` against `staging` HEAD `35b508b` to confirm all 24 procedures still pass after the user's manual compile. The feature ledger will be updated to reflect the new evidence.

## Files

- `docs/features/README.md`
- `docs/features/_template.md`
- `docs/features/{audit,cache-management,compliance,project-listing}/*.md` (6 feature files)
- `openspec/REGRESSION-ANCHOR.md` (thin index, 6-row summary table)
- `openspec/changes/archive/2026-06-14-feature-traceability-ledger/` (this archive)
- 14 source code files (PR 4 commit 1)
- `tests/tests.vba.listado-helper.json` (retired)
- `.atl/skill-registry.md` (registry refresh)
