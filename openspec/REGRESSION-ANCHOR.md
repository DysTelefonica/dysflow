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
| `form-ncproyecto-helper-coverage` | NCProyecto listing helper coverage | `regressed` | `reachable` (500d6d5/2ca4de7 ancestors) | `thin` (last known 2026-06-06, not current HEAD) | 2026-06-06, `500d6d5`/`2ca4de7`, 9/9 (form-helper) | `drifted` (listado-helper) | [link](../docs/features/project-listing/nc-proyecto-gestion-listado.md) |
| `form-fncproyecto-cache-invalidation` | NCProyecto listing cache invalidation | `passing` (slice-level) | `not-reachable` (5 SHAs on feat branch only) | `thin` (slice-level only; no full manifest run) | 2026-06-12, slice-level (3+4+1) | `clean` (proyecto-gestion-helper) | [link](../docs/features/cache-management/form-fncproyecto-cache-invalidation.md) |
| `ncproyecto-seguimiento-tareas-helper` | Deferred project tracking indicators | `passing` | `reachable` (`aa1ef79` ancestor) | `fresh` (9/9 at verified staging commit) | 2026-06-07, `aa1ef79`, 9/9 | `clean` | [link](../docs/features/project-listing/ncproyecto-seguimiento-tareas-helper.md) |
| `audit-backend-list-cache` | Audit list cache schema + read + rebuild + transaction fix | `passing` | `reachable` (4 commits ancestors) | `fresh` (11/11 at verified staging commits) | 2026-06-06, `3c4692f`, 11/11 | `clean` | [link](../docs/features/audit/audit-backend-list-cache.md) |
| `ce-fecha-obligatoria-postponement` | Postpone FE gating to NC close | `passing` | `reachable` (`8cb7f0a` ancestor) | `fresh` (13/13 at verified staging commit) | 2026-06-06, `8cb7f0a`, 13/13 | `clean` | [link](../docs/features/compliance/ce-fecha-obligatoria-postponement.md) |
| `trust-ncproyecto-cache-hits` | Cache-first for ACs/ARs/Riesgos | `passing` (commit-message) | `reachable` (`23af345` ancestor) | `thin` (commit-message-level only; no fresh test_vba) | 2026-06-06, `23af345`, 3/3 (commit msg) | `unregistered` (no manifest located) | [link](../docs/features/cache-management/trust-ncproyecto-cache-hits.md) |

**Blockers identified (Phase 3 guard analysis)**: 3 features are `not-current` or have `thin` TDD evidence and cannot be promoted to UAT until resolved:

- **B1 — form-fncproyecto-cache-invalidation**: `staging_reachability = not-reachable`. All 5 feat-branch SHAs must be merged or recreated into `staging`.
- **B2 — trust-ncproyecto-cache-hits**: `tdd_evidence = thin`. No fresh `test_vba` run; manifest location unknown. Must locate cache-trust manifest and run full manifest.
- **B3 — form-ncproyecto-helper-coverage**: `tdd_evidence = thin`. Last known passing is from 2026-06-06 (old commits), not current HEAD. Must re-run `test_vba` against staging HEAD.

These are addressed in Phase 4 (PR 4).

---

## Resolved / Archived Entries

_(Entries move here after the feature is archived and the regression anchor confirms no open gaps.)_

<!-- Future entries go here -->
