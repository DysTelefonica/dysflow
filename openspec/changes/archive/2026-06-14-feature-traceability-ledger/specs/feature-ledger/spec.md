# Feature Traceability Ledger — Specification

## Purpose

Define a durable, per-feature source of truth for No Conformidades: what each feature is, whether it works today, how to recover from regression, and what to preserve during legacy-to-web migration. Serves regression safety, SDD change traceability, and migration planning.

## Requirements

### Requirement: R1 — Ledger Schema

Each feature MUST have a ledger entry in `openspec/features/<feature-key>/ledger.md` containing these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `feature_key` | YES | Stable identifier (e.g. `form-ncproyecto-helper-coverage`) |
| `short_description` | YES | One-line business capability summary |
| `github_issue` | NO | Issue number if tracked |
| `acceptance_criteria` | YES | Bullet list defining "done" |
| `required_tests` | YES | Procedure names + manifest file paths |
| `last_known_passing` | YES | Date, commit SHA, manifest, pass/total counts |
| `integration_commits` | YES | SHAs reaching `staging` with `git merge-base --is-ancestor` evidence |
| `access_sync_status` | YES | Import status, manual compile confirmation, `verify_binary` result |
| `rollback_anchor` | YES | Commit to revert to, or "no rollback needed" |
| `business_rules` | YES | Preserved functional capabilities (not Access implementation details) |
| `legacy_not_to_copy` | YES | Access-specific patterns that web migration must NOT replicate |
| `migration_notes` | YES | Web migration considerations (empty until migration begins) |
| `open_decisions` | NO | Unresolved design or process questions |
| `status` | YES | `active` / `passing` / `regressed` / `archived` |
| `last_verified` | YES | ISO date of most recent verification against current HEAD |
| `manifest_drift_status` | YES | `clean` / `drifted` / `unregistered` |

#### Scenario: Ledger entry creation

- GIVEN a new feature reaches staging with passing tests
- WHEN the close-gate checklist runs
- THEN a ledger entry exists at `openspec/features/<feature-key>/ledger.md` with all REQUIRED fields populated
- AND the entry is linked from `openspec/REGRESSION-ANCHOR.md` summary table

#### Scenario: Schema completeness enforced

- GIVEN a feature ledger entry being created or updated
- WHEN any REQUIRED field is empty or missing
- THEN the close-gate checklist fails
- AND the feature CANNOT be declared closed or archived

### Requirement: R2 — REGRESSION-ANCHOR.md Index

`openspec/REGRESSION-ANCHOR.md` MUST serve as the navigational index with a summary table linking to all feature ledger files.

The summary table MUST contain columns: `feature_key`, `short_description`, `status`, `last_known_passing`, `manifest_drift_status`, and `ledger_link`.

#### Scenario: Index reflects all features

- GIVEN N feature ledger files exist under `openspec/features/`
- WHEN the REGRESSION-ANCHOR.md is checked
- THEN the summary table has exactly N rows
- AND each row links to the correct `openspec/features/<key>/ledger.md`

#### Scenario: Index updated on feature status change

- GIVEN a feature status changes (e.g. from `passing` to `regressed`)
- WHEN the feature ledger is updated
- THEN the REGRESSION-ANCHOR.md summary table row is updated in the same commit

### Requirement: R3 — Feature Discovery and Backfill

Features MUST be discovered from existing evidence sources in this priority order:

1. Archived SDD changes (`openspec/changes/archive/*/archive-report.md`)
2. Test manifests (`tests/*.json`) and source modules (`src/modules/Test_*.bas`)
3. Promoted specs (`openspec/specs/*/spec.md`)
4. Git history (commits referencing issues or SDD keys)

Backfill MUST cross-reference at least two independent evidence sources before creating a ledger entry.

#### Scenario: Backfill from archive evidence

- GIVEN an archived change with `archive-report.md` containing implementation commits, verification evidence, and access sync details
- WHEN backfilling the feature ledger
- THEN the ledger entry extracts behavior, tests, commits, and sync status from the archive report
- AND the entry cites the archive report as evidence source

#### Scenario: Manifest drift detection during backfill

- GIVEN a manifest file (`tests/*.json`) with procedure names
- WHEN backfilling and the source module (`src/modules/Test_*.bas`) does NOT contain all listed procedures
- THEN `manifest_drift_status` is set to `drifted`
- AND the drift is documented in the ledger entry with the specific missing procedures

**Grounded example**: `tests/tests.vba.listado-helper.json` lists `Test_Form_Fallback_EmptyCache_Atomic`, `Test_Form_Fallback_DisabledCache_Atomic`, `Test_Form_Fallback_NoLogFailure_Atomic` — but commit `ec6b4d0` deleted the original `Test_ListadoHelper_*` functions. The manifest references 3 procedures that do not exist in any source module. The actual tests live in `Test_CacheListadoNC_Parity.bas` under different names. This is confirmed manifest drift that the ledger MUST catch.

### Requirement: R4 — Test Traceability and Last-Known-Passing Evidence

Each feature's `required_tests` field MUST map every test procedure to its manifest file. `last_known_passing` MUST record:

- Date of the test run
- Commit SHA the tests ran against
- Manifest file path
- Pass count / total count

Tests MUST be verified against current HEAD (or the exact commit being closed), not a stale prior run.

#### Scenario: Test count matches manifest

- GIVEN a feature ledger listing required tests
- WHEN the procedure count in `required_tests` is compared to the actual manifest JSON
- THEN the counts match
- AND `manifest_drift_status` is `clean`

#### Scenario: Stale passing evidence rejected

- GIVEN a feature ledger with `last_known_passing` referencing commit `X`
- WHEN commit `X` is NOT an ancestor of current `staging` HEAD
- THEN the close-gate checklist fails
- AND the feature cannot be declared closed until re-verified against current HEAD

### Requirement: R5 — Commit and Integration Traceability

Each feature's `integration_commits` MUST list SHAs that reached `staging`. Each SHA MUST have `git merge-base --is-ancestor <sha> staging` evidence recorded.

Commits MUST include SDD change key in the commit body per the SDD commit traceability rule.

#### Scenario: Commit reachability verified

- GIVEN a feature ledger with integration commits `["abc123", "def456"]`
- WHEN the close-gate runs
- THEN `git merge-base --is-ancestor abc123 staging` succeeds
- AND `git merge-base --is-ancestor def456` succeeds
- OR the close-gate fails with the unreachable SHA identified

#### Scenario: Missing SDD key in commit

- GIVEN a feature was implemented via SDD
- WHEN an integration commit does NOT reference the SDD change key
- THEN the ledger records this as a warning in `open_decisions`
- AND the close-gate does NOT block (warning only, not a hard gate)

### Requirement: R6 — Access Sync and Binary Verification Evidence

Each feature's `access_sync_status` MUST record:

- Whether source modules were imported via Dysflow (`import_modules` / `import_all`)
- Whether the user manually compiled in Access VBE (NEVER automated via `compile_vba`)
- `verify_binary` result if run (actionable differences vs non-actionable noise)

#### Scenario: Import and compile documented

- GIVEN a feature that modified VBA source files
- WHEN the feature is closed
- THEN `access_sync_status` records import method, import date, and manual compile confirmation
- AND if `verify_binary` was run, the result is recorded with classification of any differences

#### Scenario: No Access objects modified

- GIVEN a feature that only changed documentation or test manifests (no `.bas`/`.cls`/`.form.txt`)
- WHEN the feature is closed
- THEN `access_sync_status` is set to `N/A — no Access objects modified`

### Requirement: R7 — Change Workflow Against Existing Features

SDD changes MUST reference existing feature ledger records when modifying established features:

- `sdd-tasks` MUST read the feature ledger before planning implementation tasks
- `sdd-apply` MUST update the ledger after implementation (new tests, changed behavior)
- `sdd-verify` MUST update `last_known_passing` and test evidence
- `sdd-archive` MUST update the ledger with final integration commits and sync status

#### Scenario: SDD change modifies existing feature

- GIVEN an SDD change that modifies behavior covered by an existing feature ledger entry
- WHEN `sdd-tasks` runs
- THEN the task plan references the feature key and notes which ledger fields will change
- AND the plan includes a ledger update task

#### Scenario: New feature from SDD change

- GIVEN an SDD change introducing a new capability not in any existing ledger entry
- WHEN `sdd-archive` runs
- THEN a new feature ledger entry is created with all REQUIRED fields
- AND the REGRESSION-ANCHOR.md summary table is updated

### Requirement: R8 — Legacy-Not-to-Copy and Migration Notes

Each feature ledger entry MUST have:

- `legacy_not_to_copy`: Access-specific patterns that web migration must NOT replicate (e.g. `Screen.ActiveForm` coupling, `Debug.Print` as UI feedback, tempvar-based state management)
- `migration_notes`: Web migration considerations (empty string allowed until migration begins; MUST be populated before any web migration task references this feature)

#### Scenario: Legacy patterns documented

- GIVEN a feature ledger entry for an Access/VBA feature
- WHEN the entry is created
- THEN `legacy_not_to_copy` identifies at least one Access-specific anti-pattern used by the feature
- OR the entry notes "no legacy anti-patterns identified" explicitly

#### Scenario: Migration notes gate

- GIVEN a web migration task that references a feature ledger entry
- WHEN the migration task is planned
- THEN `migration_notes` is non-empty
- OR the migration task is blocked until migration notes are populated

### Requirement: R9 — Close Gate

Before declaring any feature/Spec closed or archived, ALL of these MUST be true:

1. Ledger entry exists with all REQUIRED fields populated
2. `required_tests` matches actual procedures in source modules (not just manifest)
3. `last_known_passing` references test run against current HEAD
4. `manifest_drift_status` is `clean` or drift is documented with resolution plan
5. `access_sync_status` records import and compile evidence (or N/A justification)
6. `integration_commits` lists SHAs with `is-ancestor` verification
7. REGRESSION-ANCHOR.md summary table links to the ledger entry

#### Scenario: All gates pass

- GIVEN a feature with all close-gate conditions satisfied
- WHEN the archive phase runs
- THEN the feature is declared closed
- AND the ledger entry moves to `archived` status

#### Scenario: Gate blocks on manifest drift

- GIVEN a feature where `manifest_drift_status` is `drifted`
- WHEN the close-gate runs
- THEN the feature CANNOT be closed
- AND the drift must be resolved (retire or update manifest) before re-attempting close

### Requirement: R10 — Regression Recovery

When a previously passing test fails against current HEAD, the feature's `status` MUST be updated to `regressed` and a regression note MUST be added to the ledger entry.

The regression note MUST include:
- Which tests failed
- The commit where regression was introduced (if known)
- Impact assessment (which business capability is affected)
- Resolution path

#### Scenario: Regression detected

- GIVEN a feature with `status: passing` and `last_known_passing` at commit `X`
- WHEN tests are run against commit `Y` (Y > X) and previously passing tests fail
- THEN `status` changes to `regressed`
- AND a regression note is added with failure details
- AND the REGRESSION-ANCHOR.md summary table reflects the regressed status

#### Scenario: Regression resolved

- GIVEN a feature with `status: regressed`
- WHEN the regression is fixed and tests pass against current HEAD
- THEN `status` changes back to `passing`
- AND `last_known_passing` is updated with new commit SHA and date
- AND the regression note is preserved (not deleted) for historical context

**Grounded example**: `form-ncproyecto-helper-coverage` was `passing` at commits `500d6d5`/`2ca4de7`. Commit `ec6b4d0` deleted the original `Test_ListadoHelper_*` functions without updating the manifest. Status changed to `regressed` with a regression note documenting the manifest drift. Resolution requires deciding whether to retire `tests/tests.vba.listado-helper.json` or update it to reference the new procedures in `Test_CacheListadoNC_Parity.bas`.

## Non-goals

- Automated drift detection tooling (future enhancement; current process is manual verification)
- Test manifest restructuring (tracked separately; ledger documents current state)
- Access form UI/visual design documentation
- Web migration feature-by-feature content (structure enables it; content is later work)
