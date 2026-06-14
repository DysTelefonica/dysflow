# Feature Catalog

> **Purpose**: First-class, stable, versioned source of truth for every No Conformidades feature. Each file documents what a feature is, whether it works today, how to recover from regression, and what to preserve during migration.

**Canonical location**: `docs/features/` — this directory, not `openspec/`, is the permanent home.

## How to use

| Audience | Action |
|----------|--------|
| SDD `sdd-tasks` | Read the relevant feature file before planning implementation |
| SDD `sdd-apply` | Update behavior, tests, sync status after implementation |
| SDD `sdd-verify` | Update `last_known_passing`, `manifest_drift_status` |
| SDD `sdd-archive` | Update `integration_commits`, `access_sync_status`, `status` |
| Anyone | Read any feature file to understand current state |

## Schema summary (REQUIRED fields)

Every feature file MUST populate these fields. Empty = close-gate fails.

| Field | Description |
|-------|-------------|
| `feature_key` | Stable identifier (e.g. `form-ncproyecto-helper-coverage`) |
| `short_description` | One-line business capability |
| `acceptance_criteria` | Bullet list defining "done" |
| `required_tests` | Procedure names + manifest file paths |
| `last_known_passing` | Date, commit SHA, manifest, pass/total |
| `integration_commits` | SHAs reaching `staging` with `is-ancestor` evidence |
| `access_sync_status` | Import method, manual compile, `verify_binary` result |
| `rollback_anchor` | Commit to revert to, or "no rollback needed" |
| `business_rules` | Preserved functional capabilities |
| `legacy_not_to_copy` | Access anti-patterns web migration must NOT replicate |
| `migration_notes` | Web migration considerations (empty until migration begins) |
| `status` | `active` / `passing` / `regressed` / `archived` |
| `last_verified` | ISO date of most recent verification |
| `manifest_drift_status` | `clean` / `drifted` / `unregistered` |

## Domains

| Domain | Features | Description |
|--------|----------|-------------|
| `project-listing` | 1 | NCProyecto listing, helpers, form integration, tracking indicators |

## How to add a feature

1. Copy `_template.md` to `docs/features/<domain>/<feature-key>.md`
2. Fill every REQUIRED field (see schema above)
3. Cross-reference at least 2 independent evidence sources (archive report + test manifest, or git history + source module)
4. Add a row to `openspec/REGRESSION-ANCHOR.md` summary table
5. Add the feature to the domain listing above

## Close-gate checklist

Before declaring any feature closed:

- [ ] Feature file exists with all REQUIRED sections populated
- [ ] `required_tests` matches actual procedures in source modules
- [ ] `last_known_passing` references test run against current HEAD
- [ ] `manifest_drift_status` is `clean` or drift is documented with resolution plan
- [ ] `access_sync_status` records import/compile evidence (or N/A)
- [ ] `integration_commits` lists SHAs with `is-ancestor` verification
- [ ] `openspec/REGRESSION-ANCHOR.md` summary table links to the feature file
- [ ] This README domain listing includes the feature
