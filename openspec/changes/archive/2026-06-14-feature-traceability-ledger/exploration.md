# Exploration: Feature Traceability Ledger

> **Change**: `feature-traceability-ledger`
> **Phase**: explore
> **Date**: 2026-06-14
> **Project**: no_conformidades / 00-no-conformidades-staging-clean

## Current State

The project has rich but fragmented traceability artifacts:

1. **`openspec/REGRESSION-ANCHOR.md`** — already exists as a manually-maintained feature ledger with a solid template and close-gate checklist. Has one entry (`form-ncproyecto-helper-coverage`) marked `regressed`.

2. **Archive reports** (`openspec/changes/archive/*/archive-report.md`) — 6 archived changes with varying quality:
   - `form-fncproyecto-cache-invalidation`: full traceability (implementation commits table, verification evidence, warnings, access sync)
   - `ncproyecto-seguimiento-tareas-helper`: full traceability with re-anchoring notes
   - `audit-backend-list-cache`: full traceability with spec promotion
   - `ce-fecha-obligatoria-postponement`: full traceability
   - `trust-ncproyecto-cache-hits`: retroactive, thin evidence
   - `form-ncproyecto-helper-coverage`: placeholder, reconstructed proposal

3. **Test manifests** (`tests/*.json`) — 17 manifest files with 81+ tests. No feature-to-manifest mapping exists.

4. **Promoted specs** (`openspec/specs/*/spec.md`) — 5 domain specs promoted from change deltas.

5. **No web migration notes** exist anywhere.

## Affected Areas

- `openspec/REGRESSION-ANCHOR.md` — existing ledger, needs expansion and process definition
- `openspec/changes/archive/*/archive-report.md` — existing evidence, needs cross-referencing
- `tests/*.json` — test manifests, need feature tagging and drift detection
- `openspec/specs/*/spec.md` — promoted specs, need bidirectional links to features
- `openspec/config.yaml` — manifest registry, needs feature mapping

## Key Discovery: Manifest Drift

`tests/tests.vba.listado-helper.json` references 3 procedures (`Test_Form_Fallback_EmptyCache_Atomic`, `Test_Form_Fallback_DisabledCache_Atomic`, `Test_Form_Fallback_NoLogFailure_Atomic`) that actually live in `Test_CacheListadoNC_Parity.bas`, not in the module the manifest name implies. The original `Test_ListadoHelper_*` functions were deleted by commit `ec6b4d0`. The manifest count is 3 but `config.yaml` says 5. This is the exact kind of drift the ledger must catch.

### Source-to-Manifest Verification (2026-06-14 HEAD)

| Manifest | Listed Count (config.yaml) | Actual Procedures in Source | Status |
|---|---|---|---|
| `tests.vba.form-helper.json` | 9 | 9 in `Test_FormHelper_Coverage.bas` | OK |
| `tests.vba.listado-helper.json` | 5 | 3 listed, 0 in implied module; 3 exist in `Test_CacheListadoNC_Parity.bas` | DRIFTED |
| `tests.vba.proyecto-gestion-helper.json` | (not in config.yaml) | 8 in `Test_NCProyectoGestionListadoHelper.bas` | UNREGISTERED |
| `tests.vba.audit-gestion-helper.json` | 5 | 11 in `Test_NCAuditoriaGestionListadoHelper.bas` | COUNT MISMATCH |

## Approaches

1. **Expand REGRESSION-ANCHOR.md as the single feature ledger** — add entries for all archived features, define process for new features, add drift detection checklist
   - Pros: Already exists, familiar, single file
   - Cons: Manual maintenance, no automation, single file grows unwieldy
   - Effort: Low

2. **Create per-feature ledger entries** (`openspec/features/*/ledger.md`) — each feature gets its own ledger file linked from REGRESSION-ANCHOR.md
   - Pros: Scalable, each feature self-contained, easy to update
   - Cons: More files to maintain, cross-feature view requires scanning multiple files
   - Effort: Medium

3. **Hybrid: REGRESSION-ANCHOR.md as index + per-feature ledger files** — index has summary table, per-feature files have full detail
   - Pros: Scalable + navigable, index gives at-a-glance view
   - Cons: Two places to update, index can drift from detail files
   - Effort: Medium

## Recommendation

**Approach 3 (Hybrid)** — `REGRESSION-ANCHOR.md` becomes the index/overview with a summary table and close-gate checklist. Each feature gets a dedicated ledger file under `openspec/features/<feature-key>/ledger.md` with full detail (behavior, acceptance criteria, required tests, passing evidence, integration commits, access sync status, rollback notes, migration notes). The index links to each feature file.

**Minimal first slice**:
1. Define the feature ledger process in `REGRESSION-ANCHOR.md`
2. Create `openspec/features/form-ncproyecto-helper-coverage/ledger.md` as the first backfilled entry
3. Add a feature-manifest mapping section to identify which test manifests cover which features

## Risks

- **Manifest drift**: manifests reference procedures that don't exist in source (confirmed: `listado-helper.json`)
- **Tests passing against old commit**: evidence from commits `500d6d5`/`2ca4de7` may not reflect current HEAD state
- **Access sync gaps**: manual compile requirement means source/binary can drift silently
- **Feature renames**: SDD keys don't always match issue titles or commit messages (e.g., issue #50 → `cache-form-business-logic-extraction` vs `form-ncproyecto-helper-coverage`)
- **No automated drift detection**: currently no way to verify manifest procedure counts match source module procedure counts
- **Migration notes absent**: no web migration strategy documented for any feature

## Ready for Proposal

Yes — the exploration is complete enough to design the ledger system. The orchestrator should proceed to `sdd-propose` to define the feature ledger schema, process, and first backfill.
