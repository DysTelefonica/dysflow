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
7. [ ] This summary table links to the feature file.
8. [ ] `docs/features/README.md` domain listing includes the feature.

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

---

## Feature Summary

| feature_key | short_description | status | last_known_passing | manifest_drift_status | ledger_link |
|-------------|-------------------|--------|--------------------|-----------------------|-------------|
| `form-ncproyecto-helper-coverage` | NCProyecto listing helper coverage | `regressed` | 2026-06-06, `500d6d5`/`2ca4de7`, 9/9 (form-helper) | `drifted` (listado-helper) | [link](../docs/features/project-listing/nc-proyecto-gestion-listado.md) |

---

## Resolved / Archived Entries

_(Entries move here after the feature is archived and the regression anchor confirms no open gaps.)_

<!-- Future entries go here -->
