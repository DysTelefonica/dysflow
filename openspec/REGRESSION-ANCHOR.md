# Regression Anchor — Feature Traceability Index

> **Purpose**: Navigational index pointing to the canonical feature catalog at `docs/features/`. The data lives in `docs/features/<domain>/<key>.md`; this file is the summary table and process enforcement point.

## Close-Gate Checklist

Before declaring any feature/Spec closed or archived, **all** of these must be true:

1. [ ] Feature file exists at `docs/features/<domain>/<key>.md` with all REQUIRED sections populated.
2. [ ] `required_tests` matches actual procedures in `src/modules/Test_*.bas` (not just the manifest).
3. [ ] `last_known_passing` references a test run against **current HEAD**, not a stale prior run.
4. [ ] `manifest_drift_status` is `clean` or drift is documented with resolution plan.
5. [ ] `access_sync_status` records import/compile evidence (or N/A).
6. [ ] `integration_commits` lists SHAs with `git merge-base --is-ancestor` verification.
7. [ ] **Staging reachability gate**: ALL `integration_commits` SHAs are reachable from `staging`. If ANY commit is not reachable, the feature status **cannot** be `passing` — it must be `not-current` or `regressed` until commits are merged or recreated into `staging`.
8. [ ] **TDD evidence gate**: Fresh `test_vba` run evidence (manifest pass/total against current HEAD or verified staging commit) is required before the feature can be declared `passing` or ready for UAT/release. Commit-message-level evidence is **not sufficient**.
9. [ ] **Post-test documentation gate**: After staging integration and passing tests, the feature ledger Status section is updated with fresh evidence before declaring work complete. Required fields: `last_verified_commit`, `last_verified_at`, `test_evidence`, `staging_integration_commit`, `evidence_updated_at`. Integration is **not done** until this gate is satisfied.
10. [ ] `uat_status` is `approved` or N/A for features not yet in UAT.
11. [ ] **UAT tag gate**: `approved_uat_tag` is recorded (or N/A) — no production promotion without an approved final UAT tag.
12. [ ] This summary table links to the feature file.
13. [ ] `docs/features/README.md` domain listing includes the feature.

If any check fails, the feature is **not closed** — fix the gap first.

---

## How SDD Phases Read/Write the Catalog

| Phase | Read | Write |
|-------|------|-------|
| `sdd-tasks` | Read affected `docs/features/<key>.md` before planning | Note which fields will change |
| `sdd-apply` | Read current state | Update behavior, tests, sync status |
| `sdd-verify` | Read current state | Update `last_known_passing`, `manifest_drift_status` |
| `sdd-archive` | Read current state | Update `integration_commits`, `access_sync_status`, `status` |
| `sdd-propose` | Read existing features to avoid duplication | Create new feature file if introducing new capability |
| **Post-test gate** | Read current Status section | Update `last_verified_commit`, `last_verified_at`, `test_evidence`, `staging_integration_commit`, `evidence_updated_at` |
| UAT gate | Read `uat_tag`, `uat_tag_history` | Update `uat_tag`, `uat_tag_history`, `uat_status`, `uat_evidence` |
| Production gate | Read `approved_uat_tag` | Update `production_release_tag`, `production_release_commit`, `production_date`, `rollback_release_tag` |

---

## Feature Summary

| feature_key | short_description | status | staging_reachability | tdd_evidence | last_known_passing | manifest_drift_status | ledger_link |
|-------------|-------------------|--------|---------------------|--------------|--------------------|-----------------------|-------------|
| `form-ncproyecto-helper-coverage` | NCProyecto listing helper coverage | ✅ `passing` (B3 RESOLVED) | `reachable` (500d6d5/2ca4de7 ancestors) | `fresh` (9/9 at staging HEAD `20b71f64` 2026-06-14) | 2026-06-14, `20b71f64`, 9/9 (form-helper) | `clean` (listado-helper retired) | [link](../docs/features/project-listing/nc-proyecto-gestion-listado.md) |
| `form-fncproyecto-cache-invalidation` | NCProyecto listing cache invalidation | ✅ `passing` (B1 RESOLVED) | `reachable` (export/reimport path; all functional changes at staging HEAD) | `fresh` (8/8 at staging HEAD `20b71f64` 2026-06-14) | 2026-06-14, `20b71f64`, 8/8 | `clean` (proyecto-gestion-helper) | [link](../docs/features/cache-management/form-fncproyecto-cache-invalidation.md) |
| `ncproyecto-seguimiento-tareas-helper` | Deferred project tracking indicators | `passing` | `reachable` (`aa1ef79` ancestor) | `fresh` (9/9 at verified staging commit) | 2026-06-07, `aa1ef79`, 9/9 | `clean` | [link](../docs/features/project-listing/ncproyecto-seguimiento-tareas-helper.md) |
| `audit-backend-list-cache` | Audit list cache schema + read + rebuild + transaction fix | `passing` | `reachable` (4 commits ancestors) | `fresh` (11/11 at verified staging commits) | 2026-06-06, `3c4692f`, 11/11 | `clean` | [link](../docs/features/audit/audit-backend-list-cache.md) |
| `ce-fecha-obligatoria-postponement` | Postpone FE gating to NC close | `passing` | `reachable` (`8cb7f0a` ancestor) | `fresh` (13/13 at verified staging commit) | 2026-06-06, `8cb7f0a`, 13/13 | `clean` | [link](../docs/features/compliance/ce-fecha-obligatoria-postponement.md) |
| `trust-ncproyecto-cache-hits` | Cache-first for ACs/ARs/Riesgos | ✅ `passing` (B2 RESOLVED) | `reachable` (`23af345` ancestor) | `fresh` (7/7 at staging HEAD `20b71f64` 2026-06-14; includes 3 cache-trust diagnostics) | 2026-06-14, `20b71f64`, 7/7 | `clean` (found in cache-e2e.json) | [link](../docs/features/cache-management/trust-ncproyecto-cache-hits.md) |

**Phase 4 Blocker Resolution (2026-06-14)**:

- **B1 — form-fncproyecto-cache-invalidation ✅ RESOLVED**: equivalent changes (RebuildNCProyectoListadoCache, audit binding rename, helper seams) integrated into staging via binary export/reimport path (commit `20b71f6` and earlier). Original feat-branch SHAs are NOT ancestors but all functional code is verified present at staging HEAD. Full manifest `test_vba` 8/8 PASSED against staging HEAD `20b71f64`.
- **B2 — trust-ncproyecto-cache-hits ✅ RESOLVED**: cache-trust diagnostics procedures located in `tests/tests.vba.cache-e2e.json` (3 procedures: `Test_CacheTrust_LoadedEmptyARs_NoFallback_Atomic`, `Test_CacheTrust_LoadedEmptyRiesgos_NoFallback_Atomic`, `Test_CacheTrust_ARParentLink_NoFallback_Atomic`). Full manifest `test_vba` 7/7 PASSED against staging HEAD `20b71f64`.
- **B3 — form-ncproyecto-helper-coverage ✅ RESOLVED**: `tests/tests.vba.listado-helper.json` RETIRED (`_retired: true`, cleared test entries, recorded `_replacement_manifest: tests/tests.vba.proyecto-gestion-helper.json`). Full manifest `test_vba` 9/9 PASSED against staging HEAD `20b71f64`. Status `regressed` → `passing`.

---

## Resolved / Archived Entries

_(Entries move here after the feature is archived and the regression anchor confirms no open gaps.)_

<!-- Future entries go here -->
