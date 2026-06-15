# ncproyecto-seguimiento-tareas-helper — Deferred project tracking indicators

> Backfilled from archive report `2026-06-07-ncproyecto-seguimiento-tareas-helper/archive-report.md`. Sources: archive report, test manifest `seguimiento-tareas-helper.json`, git history.

## Status

| Field | Value |
|-------|-------|
| **Current** | `passing` |
| **Last verified** | 2026-06-15 (evidencia runtime recogida por slices; 9/9 procedimientos únicos) |
| **Manifest drift** | `clean` |
| **Scope note** | Evidencia `9/9` histórica de `staging` HEAD (no de este branch). El manifest `tests/tests.vba.seguimiento-tareas-helper.json` NO está en este checkout. Ver [`docs/inventory/anomalies-investigation.md` Anexo A](../inventory/anomalies-investigation.md#anexo-a--cross-check-de-duplicación-a4-ejecutado-2026-06-15). Para reproducir, cherry-pick desde `origin/staging`. |
| **Staging reachability** | `reachable` — commit `aa1ef79` is ancestor of `staging` |
| **TDD evidence** | `fresh` — fallback 4/4, helper 4/4 y form 1/1; 9/9 procedimientos únicos PASS |
| **Last verified commit** | `aa1ef79` |
| **Last verified at** | 2026-06-15 |
| **Test evidence** | `tests/tests.vba.seguimiento-tareas-helper.json` 9/9 procedimientos únicos; fallback/log, helper y form slices |
| **Staging integration commit** | `aa1ef79` |
| **Evidence updated at** | 2026-06-15 |

## Business Behavior

Deferred project tracking indicators for NCProyecto follow-up. The helper module `NCProyectoSeguimientoHelper` provides:
- Tracking indicator calculation for deferred project tasks
- Status display on the NCProyecto follow-up form
- Helper seams for UI-free testability

Evidencia runtime 2026-06-15: gate de esquema documentado, backend sandbox seguro, filas de fallback de caché registradas, caché desactivada registrada, ausencia de usuario registrada como `Sistema`, error forzado en seam de caché registrado, orden de predicados legacy preservado, fuente seleccionada por `Estado`, sin hidratación AR/AC/NC por fila, orden/export input determinista y delegación del formulario de rutas de filtro/carga/limpieza al helper.

## Acceptance Criteria

- [ ] Tracking indicators correctly reflect deferred project task status
- [ ] Helper module provides UI-free seams for testability
- [ ] All 9 test procedures pass

## Required Tests

| Procedure | Manifest | Status |
|-----------|----------|--------|
| `Test_TareasHelper_Fallback_EmptyCache_Logs` | `tests/tests.vba.seguimiento-tareas-helper.json` | PASS (fallback/log 4/4, evidencia 2026-06-15) |
| `Test_TareasHelper_Fallback_DisabledCache_Logs` | `tests/tests.vba.seguimiento-tareas-helper.json` | PASS (fallback/log 4/4, evidencia 2026-06-15) |
| `Test_TareasHelper_Fallback_NoUser_SafeLog` | `tests/tests.vba.seguimiento-tareas-helper.json` | PASS (fallback/log 4/4, evidencia 2026-06-15) |
| `Test_TareasHelper_Fallback_CacheError_Logs` | `tests/tests.vba.seguimiento-tareas-helper.json` | PASS (fallback/log 4/4, evidencia 2026-06-15) |
| `Test_TareasHelper_FilterParity_AllPredicates_Atomic` | `tests/tests.vba.seguimiento-tareas-helper.json` | PASS (helper 4/4, evidencia 2026-06-15) |
| `Test_TareasHelper_Estado_SelectsSource` | `tests/tests.vba.seguimiento-tareas-helper.json` | PASS (helper 4/4, evidencia 2026-06-15) |
| `Test_TareasHelper_NoARPerRowHydration` | `tests/tests.vba.seguimiento-tareas-helper.json` | PASS (helper 4/4, evidencia 2026-06-15) |
| `Test_TareasHelper_DeterministicOrder_ExportInput` | `tests/tests.vba.seguimiento-tareas-helper.json` | PASS (helper 4/4, evidencia 2026-06-15) |
| `Test_TareasForm_Delegates_FilterPaths` | `tests/tests.vba.seguimiento-tareas-helper.json` | PASS (`TareasForm` 1/1, evidencia 2026-06-15) |

**Nota de recuento**: el filtro fallback ejecutó 4/4; el filtro amplio `TareasHelper_` devolvió esos 4 de nuevo más 4 pruebas helper; `TareasForm` ejecutó 1/1. Procedimientos únicos verdes: 9/9.

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | 2026-06-07 |
| **Commit** | `aa1ef79` |
| **Manifest** | `tests/tests.vba.seguimiento-tareas-helper.json` |
| **Result** | 9/9 |

## Integration Commits

| SHA | Message | Ancestor of staging |
|-----|---------|---------------------|
| `aa1ef79` | `feat(issue-55): add project seguimiento tareas helper` | Yes — verified 2026-06-14 |

## Access Sync Status

- **Import method**: Dysflow `import_modules` (per archive evidence)
- **Manual compile**: confirmed 2026-06-07 (per archive evidence)
- **verify_binary**: not run

## Rollback Anchor

Revert to commit before `aa1ef79` to restore pre-seguimiento state.

## Business Rules

- Tracking indicators must correctly reflect deferred project task status
- Helper must provide UI-free seams for testability
- Form integration must preserve tracking indicator display

## Legacy Not to Copy

- `Screen.ActiveForm` coupling for form state detection
- Direct DAO access from form code-behind

## Migration Notes

_Web migration considerations — to be populated when migration work begins._

## Open Decisions

1. **Review-size exception**: SDD review budget was exceeded and explicitly accepted as `size:exception`.
2. **Manual UI validation**: Final Access UI validation remains manual by user boundary; automated verification covers helper/form-called logic through UI-free seams only.

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-07-ncproyecto-seguimiento-tareas-helper/archive-report.md)
- [Test manifest: seguimiento-tareas-helper](../../../tests/tests.vba.seguimiento-tareas-helper.json)
- [Spec](../../../openspec/specs/seguimiento-tareas-helper/spec.md)

## Post-Test Documentation Gate

> **Rule**: Integration is not done until this section is updated. After staging integration and passing tests, update the Status section fields before declaring the work complete.

| Step | Action | Done |
|------|--------|------|
| 1 | Tests pass against staging HEAD | [x] (9/9 at `aa1ef79`) |
| 2 | `last_verified_commit` updated with SHA | [x] |
| 3 | `last_verified_at` updated with ISO datetime | [x] |
| 4 | `test_evidence` updated with manifest + pass/total | [x] |
| 5 | `staging_integration_commit` updated with merge SHA | [x] |
| 6 | `evidence_updated_at` updated with current datetime | [x] |
| 7 | Feature status reflects current state | [x] (`passing`) |
