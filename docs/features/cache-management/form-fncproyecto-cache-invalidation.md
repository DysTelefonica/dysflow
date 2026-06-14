# form-fncproyecto-cache-invalidation — NCProyecto listing cache invalidation

> Backfilled from archive report `2026-06-12-form-fncproyecto-cache-invalidation/archive-report.md`. Sources: archive report, test manifest `tests.vba.proyecto-gestion-helper.json`, git history.

## Status

| Field | Value |
|-------|-------|
| **Current** | `passing` |
| **Last verified** | 2026-06-12 (slice-level: Slice 2 3/3, Slice 3 4/4, Slice 4 1/1) |
| **Manifest drift** | `clean` (for `proyecto-gestion-helper.json`) |

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
| `Test_NCProyectoGestionListadoHelper_*` (Slice 2: T1-T3) | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (3/3) |
| `Test_NCProyectoGestionListadoHelper_*` (Slice 3: T4-T7) | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (4/4) |
| `Test_NCProyectoGestionListadoHelper_*` (Slice 4: T8-T10) | `tests/tests.vba.proyecto-gestion-helper.json` | PASS (1/1) |

**Note**: Slice-level verification passed. Full manifest run was not claimed in the archive; full run is deferred to a later phase.

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | 2026-06-12 |
| **Commits** | `356f185`, `4849cf8`, `b85ebab`, `38a8e9b`, `b2eb8a1` (feat branch) |
| **Manifest** | `tests/tests.vba.proyecto-gestion-helper.json` |
| **Result** | Slice 2: 3/3; Slice 3: 4/4; Slice 4: 1/1 (slice-level only) |

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

1. **Staging reachability**: feat branch not yet merged to staging. All 5 implementation SHAs are reachable only from the feature branch. Resolution: merge feat branch to staging (or recreate on staging) and re-verify.
2. **Full manifest run**: only slice-level evidence is recorded. Full manifest `test_vba` run needed before production promotion.
3. **Spec wording drift**: R2 signature wording (`As Boolean` vs `As String`) remains inconsistent across artifacts.

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-12-form-fncproyecto-cache-invalidation/archive-report.md)
- [Test manifest: proyecto-gestion-helper](../../../tests/tests.vba.proyecto-gestion-helper.json)
- [Spec](../../../openspec/specs/form-fncproyecto-cache-invalidation/spec.md)
