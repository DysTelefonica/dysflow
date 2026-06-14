# form-ncproyecto-helper-coverage — NCProyecto listing helper coverage

> First backfilled feature. Sources: REGRESSION-ANCHOR.md entry, archive report `2026-06-06-form-ncproyecto-helper-coverage/archive-report.md`, test manifests `form-helper.json` and `listado-helper.json`.

## Status

| Field | Value |
|-------|-------|
| **Current** | `passing` (B3 RESOLVED 2026-06-14) |
| **Last verified** | 2026-06-14 (full manifest run 9/9 against staging HEAD `20b71f64`) |
| **Manifest drift** | `clean` — `form-helper.json` 9 procedures verified; `listado-helper.json` retired (see Required Tests note) |
| **Staging reachability** | `reachable` — both integration commits (`500d6d5`/`2ca4de7`) are ancestors of `staging` |
| **TDD evidence** | `fresh` — full manifest `test_vba` run 9/9 PASSED against staging HEAD `20b71f64` 2026-06-14 |
| **Last verified commit** | `20b71f64` (staging HEAD, fresh run) |
| **Last verified at** | 2026-06-14 |
| **Test evidence** | `tests/tests.vba.form-helper.json` 9/9 (fresh run 2026-06-14) |
| **Staging integration commit** | `20b71f64` |
| **Evidence updated at** | 2026-06-14 |

## Business Behavior

NCProyecto listing form routes through a helper module (`NCProyectoGestionListadoHelper`) for cache-first data loading. The helper provides:
- Cache-aware listing with fallback to legacy direct-query when cache is empty or disabled
- Schema enforcement (`EnsureSchema`) for listing pipe columns
- Filter parity between cache and legacy paths
- Alta/edicion mode routing for NCProyecto open/edit operations

## Acceptance Criteria

- [ ] NCProyecto listing form loads data through helper, not directly from DAO
- [ ] Empty cache triggers fallback to legacy source with log
- [ ] Disabled cache triggers fallback to legacy source with log
- [ ] Cache filters produce deterministic results
- [ ] Alta mode returns fresh NCProyecto record
- [ ] Edicion mode loads existing NCProyecto; reports missing; allows borrado load

## Required Tests

| Procedure | Manifest | Status |
|-----------|----------|--------|
| `Test_FormHelper_Coverage_Canary_Atomic` | `tests/tests.vba.form-helper.json` | PASS (9/9 last known at `500d6d5`/`2ca4de7`) |
| `Test_FormHelper_Listing_EnsureSchema_Atomic` | `tests/tests.vba.form-helper.json` | PASS (same) |
| `Test_FormHelper_Listing_EmptyCacheFallback_Atomic` | `tests/tests.vba.form-helper.json` | PASS (same) |
| `Test_FormHelper_Listing_DisabledCacheFallback_Atomic` | `tests/tests.vba.form-helper.json` | PASS (same) |
| `Test_FormHelper_Listing_CacheFilters_Atomic` | `tests/tests.vba.form-helper.json` | PASS (same) |
| `Test_FormHelper_Open_AltaMode_Atomic` | `tests/tests.vba.form-helper.json` | PASS (same) |
| `Test_FormHelper_Open_EdicionMode_Exists_Atomic` | `tests/tests.vba.form-helper.json` | PASS (same) |
| `Test_FormHelper_Open_EdicionMode_NotFound_Atomic` | `tests/tests.vba.form-helper.json` | PASS (same) |
| `Test_FormHelper_Open_EdicionMode_Borrado_Atomic` | `tests/tests.vba.form-helper.json` | PASS (same) |
| `Test_Form_Fallback_EmptyCache_Atomic` | `tests/tests.vba.listado-helper.json` | **MISSING** — procedure not in source (drifted) |
| `Test_Form_Fallback_DisabledCache_Atomic` | `tests/tests.vba.listado-helper.json` | **MISSING** — procedure not in source (drifted) |
| `Test_Form_Fallback_NoLogFailure_Atomic` | `tests/tests.vba.listado-helper.json` | **MISSING** — procedure not in source (drifted) |

**Manifest note**: `form-helper.json` lists 9 procedures — all confirmed present in last known passing. `listado-helper.json` listed 3 procedures — none existed in any source module (commit `ec6b4d0` deleted the original `Test_ListadoHelper_*` functions; the actual tests live in `Test_CacheListadoNC_Parity.bas` under different names). Resolution path: retire `listado-helper.json` or update it to reference the new procedures in `Test_CacheListadoNC_Parity.bas`. This is the regression that drove the feature into `regressed` status.

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | 2026-06-06 |
| **Commit** | `500d6d5` (form-helper 9/9) and `2ca4de7` (form-helper 9/9) |
| **Manifest** | `tests/tests.vba.form-helper.json` |
| **Result** | 9/9 |

## Integration Commits

| SHA | Message | Ancestor of staging |
|-----|---------|---------------------|
| `500d6d5` | `perf(cache): route project listing form through helper` | Yes — verified 2026-06-14 |
| `2ca4de7` | `perf(forms): defer project tracking indicators` | Yes — verified 2026-06-14 |

## Access Sync Status

- **Import method**: Dysflow `import_modules` — `NCProyectoGestionListadoHelper`, `Form_FormNCProyectoGestion`, `constructor`, `Test_FormHelper_Coverage`, `Form_FormNCProyectoSeguimiento`, `NCProyectoSeguimientoHelper`, `Test_IndicadoresCaracterizacion`
- **Manual compile**: confirmed 2026-06-06 (per commit bodies)
- **verify_binary**: not run
- **Frontend restore**: `a40e0b8` after corruption during `500d6d5`

## Rollback Anchor

Revert to `500d6d5` to restore original helper coverage state.

## Business Rules

- Listing form must route through helper for cache-first loading
- Empty/disabled cache must fallback to legacy source (never blank screen)
- Filter parity between cache and legacy paths
- Alta mode creates fresh NCProyecto; edicion mode loads existing
- Edicion mode must report missing record and allow borrado load

## Legacy Not to Copy

- `Screen.ActiveForm` coupling for form state detection
- `Debug.Print` as user-facing feedback mechanism
- Tempvar-based state management across form events
- Direct DAO recordset access from form code-behind (should be in helper module)

## Migration Notes

_Web migration considerations — to be populated when migration work begins._

## Open Decisions

1. **✅ RESOLVED (2026-06-14) — B3 Manifest drift**: `tests/tests.vba.listado-helper.json` retired — set `_retired: true`, cleared all test entries, recorded `_replacement_manifest: tests/tests.vba.proyecto-gestion-helper.json`. Replacement coverage provided by `Test_ProyectoGestionHelper_*` procedures.
2. **✅ RESOLVED (2026-06-14) — B3 Fresh TDD evidence**: full manifest `test_vba` run 9/9 PASSED against staging HEAD `20b71f64` 2026-06-14. Status `regressed` → `passing`.

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-06-form-ncproyecto-helper-coverage/archive-report.md)
- [Test manifest: form-helper](../../../tests/tests.vba.form-helper.json)
- [Test manifest: listado-helper](../../../tests/tests.vba.listado-helper.json) (drifted)
- [REGRESSION-ANCHOR entry](../../../openspec/REGRESSION-ANCHOR.md#form-ncproyecto-helper-coverage--project-listing-helper-coverage)

## Post-Test Documentation Gate

> **Rule**: Integration is not done until this section is updated. After staging integration and passing tests, update the Status section fields before declaring the work complete.

| Step | Action | Done |
|------|--------|------|
| 1 | Tests pass against current `staging` HEAD | [x] (9/9 PASSED, manifest `form-helper.json`, staging HEAD `20b71f64` 2026-06-14) |
| 2 | `last_verified_commit` updated with current SHA | [x] (`20b71f64`) |
| 3 | `last_verified_at` updated with current ISO datetime | [x] (2026-06-14) |
| 4 | `test_evidence` updated with manifest + pass/total | [x] (`tests/tests.vba.form-helper.json` 9/9) |
| 5 | `staging_integration_commit` updated with merge SHA | [x] (`20b71f64`) |
| 6 | `evidence_updated_at` updated with current datetime | [x] (2026-06-14) |
| 7 | Feature status reflects current state | [x] (`passing` after B3 resolution) |
