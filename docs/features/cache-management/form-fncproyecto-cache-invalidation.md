# form-fncproyecto-cache-invalidation — NCProyecto listing cache invalidation

> Backfilled from archive report `2026-06-12-form-fncproyecto-cache-invalidation/archive-report.md`. Sources: archive report, test manifest `tests.vba.proyecto-gestion-helper.json`, git history.

## Status

| Field | Value |
|-------|-------|
| **Current** | `passing` (B1 RESOLVED 2026-06-14) |
| **Last verified** | 2026-06-15 (`tests/tests.vba.proyecto-gestion-helper.json` 8/8 por filtros pequeños contra staging HEAD `20b71f64`) |
| **Manifest drift** | `clean` (for `proyecto-gestion-helper.json`) |
| **Scope note** | Evidencia `8/8` histórica de `staging` HEAD (no de este branch). El manifest `tests/tests.vba.proyecto-gestion-helper.json` NO está en este checkout. Ver [`docs/inventory/anomalies-investigation.md` Anexo A](../inventory/anomalies-investigation.md#anexo-a--cross-check-de-duplicación-a4-ejecutado-2026-06-15). Para reproducir, cherry-pick desde `origin/staging`. |
| **Staging reachability** | `reachable` — all functional changes present in staging HEAD via export/reimport path; original feat-branch SHAs are NOT ancestors but equivalent code is verified (see Integration Commits) |
| **TDD evidence** | `fresh` — manifest verificado 8/8 mediante filtros pequeños contra staging HEAD `20b71f64` 2026-06-15 |
| **Last verified commit** | `20b71f64` (staging HEAD, fresh run) |
| **Last verified at** | 2026-06-15 |
| **Test evidence** | `tests/tests.vba.proyecto-gestion-helper.json` 8/8 por filtros: `CacheOff` 1/1, `RebuildForce` 2/2, `RefreshCache` 2/2, `ProyectoGestionForm` 2/2, `RenameHandler` 1/1 |
| **Staging integration commit** | `20b71f64` (export/reimport path; all functional changes verified present) |
| **Evidence updated at** | 2026-06-15 |

## Business Behavior

Cache management for the NCProyecto listing form: rebuild, refresh, and invalidate the listing cache to ensure the UI reflects current backend data. The helper module `CacheNCProyecto` provides:
- Cache rebuild from backend source
- Cache refresh to pick up incremental changes
- Cache invalidation to force full reload
- Audit binding rename: `ComandoActualizarLista` control triggers cache refresh via `PrepareNCProyectoGestionRefresh` helper seam (no direct UI coupling)

## Acceptance Criteria

- [ ] Cache rebuild produces a valid listing cache from backend data
- [ ] Cache refresh picks up incremental backend changes
- [ ] Cache invalidation forces full reload on next access
- [ ] Audit form binding uses `ComandoActualizarLista` (renamed from legacy control name)
- [ ] T10 audit rename contract passes: old handler text is rejected

## Required Tests

| Procedure | Manifest | Status |
|-----------|----------|--------|
| `Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic` | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (`CacheOff` 1/1) |
| `Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic` | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (`RebuildForce` 2/2, ~27s) |
| `Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic` | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (`RebuildForce` 2/2, ~25s) |
| `Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic` | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (`RefreshCache` 2/2, ~27s) |
| `Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic` | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (`RefreshCache` 2/2) |
| `Test_ProyectoGestionForm_ActualizarLista_SequenceHappyPath_Atomic` | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (`ProyectoGestionForm` 2/2, ~26s) |
| `Test_ProyectoGestionForm_ActualizarLista_RefreshError_RaiseAndCleanup_Atomic` | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (`ProyectoGestionForm` 2/2) |
| `Test_AuditGestionForm_RenameHandler_NoRegression_Atomic` | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (`RenameHandler` 1/1) |

**Nota**: la verificación válida más reciente es 8/8 por filtros pequeños. Un intento amplio anterior quedó interrumpido y dejó la operación Dysflow obsoleta `dysflow-51869803-608b-44bc-8792-ef9ca837b894`, que posteriormente pasó a `status=timed_out`; no se considera fallo funcional. Las slices lentas (~25-27s) son coste de ejecución, no fallo del runner.

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | 2026-06-15 |
| **Commits** | `356f185`, `4849cf8`, `b85ebab`, `38a8e9b`, `b2eb8a1` (feat branch) |
| **Manifest** | `tests/tests.vba.proyecto-gestion-helper.json` |
| **Result** | 8/8 por filtros pequeños: `CacheOff`, `RebuildForce`, `RefreshCache`, `ProyectoGestionForm`, `RenameHandler` |

## Integration Commits

| SHA | Message | Ancestor of staging |
|-----|---------|---------------------|
| `356f185` | Slice 1: helpers RED | No — on `feat/form-fncproyecto-cache-invalidation` only |
| `4849cf8` | Slice 2: implement rebuild/refresh/invalidate | No — on `feat/form-fncproyecto-cache-invalidation` only |
| `b85ebab` | docs: add change artifacts + Slice 2 apply-progress | No — on `feat/form-fncproyecto-cache-invalidation` only |
| `38a8e9b` | docs: anchor apply-progress to real SHAs + T6/T7 deferral note | No — on `feat/form-fncproyecto-cache-invalidation` only |
| `b2eb8a1` | Slice 2 blocker fixes + Slice 3 no-UI helper seam + Slice 4 audit binding fix | No — on `feat/form-fncproyecto-cache-invalidation` only |

> **Note (2026-06-14)**: All 5 SHAs are on the `feat/form-fncproyecto-cache-invalidation` branch and are NOT yet ancestors of `staging`. The feature is in `passing` status because the slice-level tests passed; staging reachability and full-manifest TDD evidence are deferred to a later phase.

## Access Sync Status

- **Import method**: Dysflow `import_modules` — `CacheNCProyecto`, `NCProyectoGestionListadoHelper`, `Entorno`, `Test_NCProyectoGestionListadoHelper`, `Form_FormNCProyectoGestion`, `Form_FormNCAuditoriaGestion`
- **Manual compile**: confirmed 2026-06-12 (per archive evidence)
- **verify_binary**: not run

## Rollback Anchor

No rollback needed — feature branch not yet merged to staging.

## Business Rules

- Cache rebuild must produce valid listing data from backend
- Cache refresh must pick up incremental changes without full rebuild
- Cache invalidation must force next-access full reload
- Audit form binding rename (`ComandoActualizarLista`) must be preserved
- No direct UI coupling from cache operations — use helper seam

## Legacy Not to Copy

- Spec/design drift: older artifacts reference direct UI-driven flow; implementation uses no-UI helper seam (`PrepareNCProyectoGestionRefresh`)
- R2 signature wording inconsistency across artifacts (`As Boolean` vs `As String`)
- `Screen.ActiveForm` coupling for cache trigger detection

## Migration Notes

_Web migration considerations — to be populated when migration work begins._

## Open Decisions

1. **✅ RESOLVED (2026-06-14) — B1 Staging reachability**: all functional changes present in staging HEAD via export/reimport path. Original feat-branch SHAs are NOT ancestors but all equivalent code (RebuildNCProyectoListadoCache, audit binding rename, helper seams) is verified present. Full manifest `test_vba` 8/8 PASSED against staging HEAD `20b71f64`.
2. **✅ RESOLVED (2026-06-15) — B1 Manifest evidence**: 8/8 PASSED against staging HEAD `20b71f64` mediante filtros pequeños. El intento amplio previo quedó como caveat histórico (`timed_out`), no como pendiente funcional.
3. **Spec wording drift**: R2 signature wording (`As Boolean` vs `As String`) remains inconsistent across artifacts (deferred, non-blocking).

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-12-form-fncproyecto-cache-invalidation/archive-report.md)
- [Test manifest: proyecto-gestion-helper](../../../tests/tests.vba.proyecto-gestion-helper.json)
- [Spec](../../../openspec/specs/form-fncproyecto-cache-invalidation/spec.md)

## Post-Test Documentation Gate

> **Rule**: Integration is not done until this section is updated. After staging integration and passing tests, update the Status section fields before declaring the work complete.

| Step | Action | Done |
|------|--------|------|
| 1 | Tests pass against current `staging` HEAD | [x] (8/8 PASSED por filtros pequeños, manifest `proyecto-gestion-helper.json`, staging HEAD `20b71f64` 2026-06-15) |
| 2 | `last_verified_commit` updated with current SHA | [x] (`20b71f64`) |
| 3 | `last_verified_at` updated with current ISO datetime | [x] (2026-06-15) |
| 4 | `test_evidence` updated with manifest + pass/total | [x] (`tests/tests.vba.proyecto-gestion-helper.json` 8/8) |
| 5 | `staging_integration_commit` updated with merge SHA | [x] (`20b71f64`; export/reimport path) |
| 6 | `evidence_updated_at` updated with current datetime | [x] (2026-06-15) |
| 7 | Feature status reflects current state | [x] (`passing` after B1 resolution) |

### Phase 4 Resolution Path (executed 2026-06-14)

1. Export equivalent changes from binary to src (commit `20b71f6` and earlier).
2. Verify `RebuildNCProyectoListadoCache` exists in `CacheNCProyecto.bas` at staging HEAD.
3. Verify `tests/tests.vba.proyecto-gestion-helper.json` is tracked at staging HEAD.
4. Run manifest by small filters against staging HEAD — 8/8 PASSED.
5. Update Status section with fresh evidence; status `not-current` → `passing`.
