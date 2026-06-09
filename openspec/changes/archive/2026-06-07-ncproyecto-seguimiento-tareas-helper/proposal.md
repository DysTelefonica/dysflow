# Proposal: NCProyecto Seguimiento Tareas Helper

## Intent

Implement GitHub issue #55: extract `Form_FormNCProyectoSeguimientoTareas.Filtrar` filter logic out of the form and the legacy `constructor.getARsDeProyectoBusqueda` into a dedicated, UI-free helper `NCProyectoSeguimientoTareasListadoHelper`. The helper exposes one entry point for the task list, prefers a cache/materialized source when one is available, falls back to the in-memory `m_ObjEntorno.ColSegsTareasProyecto*` collections when the cache is OFF / empty / errored, and logs every fallback as an observable `TareasCacheFallback` row in `TbLogCache`.

This is the first slice of the issue. It plants the cache seam honestly: the helper has a cache-first function that today always falls back because no `TbCacheListadoARProyecto` table exists yet. The seam is what a later slice will plug into without touching the form or the constructor.

## Scope

### In Scope

- New `src/modules/NCProyectoSeguimientoTareasListadoHelper.bas` exposing `GetARsProyectoSeguimientoTareasFiltrados(p_ResponsableCalidad, p_Responsable, p_Estado, p_IDExpediente, ByRef p_Error) As Scripting.Dictionary`.
- Cache seam in the helper that calls a private `TryListadoFiltradoSQL(...)` returning the same dictionary shape keyed by `IDAccionRealizada`. In this slice `TryListadoFiltradoSQL` always returns `Nothing` and the helper logs `TareasCacheFallback` with reason `"Cache de tareas no implementada en esta slice"`.
- Fallback path that preserves the current contract from `constructor.getARsDeProyectoBusqueda`: filters by `responsable_calidad` (`RespCalidad`), `responsable` (`Tecnico`), `IDExpediente`, and `Estado` (selects `ColSegsTareasProyectoActivas`, `ColSegsTareasProyectoPteReplanificar`, or `ColSegsTareasProyecto`).
- Lightweight row contract: the returned dictionary holds `SegTareasProyecto` instances whose listbox fields are read directly (`IDAccionRealizada`, `NAccion`, `Tarea`, `Tecnico`, `Estado`, `FechaFinPrevista`, `TipoNC`). The helper does not call `SegTareasProyecto.AR` / `.AC` / `.NC` per row, so list rendering does not hydrate full `ARProyecto` graphs.
- Form refactor: `Filtrar`, `Form_Load`, `ESTADO_AfterUpdate`, `RESPONSABLECALIDAD_AfterUpdate`, `Responsable_AfterUpdate`, `ComandoBuscarExpediente_Click`, `m_FormExpedientes_Seleccionado`, and the four `ComandoLimpiar*` commands delegate to the helper. `m_ColFiltradoTareasNCProyectos` continues to hold the helper output. `ComandoExportarAExcel_Click` keeps reading from `m_ColFiltradoTareasNCProyectos` and passes it to `TareasAExcel` without changing the export.
- Strict TDD: schema-first inspection of `TbNoConformidades`, `TbNCAccionCorrectivas`, `TbNCAccionesRealizadas`, `TbExpedientes`, `TbUsuariosAplicaciones`, and `TbLogCache`; explicit sandbox fixtures seeded in FK order; teardown in reverse FK order; strong value/cardinality assertions; `dysflow.test_vba` only after the user compiles manually in Access VBE.

### Out of Scope

- Creating `TbCacheListadoARProyecto` or any new cache table. The seam is a thin function; the table is a later slice.
- Changing `ComandoExportarAExcel_Click` beyond calling the helper indirectly through `m_ColFiltradoTareasNCProyectos`. Export shape stays identical.
- Modifying `.form.txt` for `Form_FormNCProyectoSeguimientoTareas`. No UI / event-property changes.
- Removing or renaming `constructor.getARsDeProyectoBusqueda`. Legacy constructor stays so other call sites and existing tests are not broken.
- Selection via `constructor.getARProyecto` in `ListaFiltrados_Click`. That path stays in the form and is explicitly excluded from this slice.
- Chained PR strategy and `chained-pr` workflow. This slice targets a single direct commit on `staging`, ≤ 400 changed lines including tests.

## Capabilities

### New Capabilities

- `seguimiento-tareas-helper`: Defines a UI-free helper that exposes the task filter used by `Form_FormNCProyectoSeguimientoTareas`, prefers a cache/materialized source, falls back to the in-memory `SegTareasProyecto` collections with observable logging, and preserves the existing filter contract.

### Modified Capabilities

- None. The change does not modify any existing capability at the spec level. The helper is additive; legacy constructor and form behavior remain reachable.

## Approach

Mirror the shape of `NCProyectoGestionListadoHelper` (the W4a reference for issue #50). The new module follows the same `IsCacheEnabled -> TryListadoFiltradoSQL -> on miss/fallback call GetARsProyectoSeguimientoTareasFallback -> LogFallback(reason)` skeleton, but the cache call is a no-op seam in this slice. The fallback function reuses the same predicate logic as `constructor.getARsDeProyectoBusqueda` (responsable_calidad, responsable, IDExpediente, Estado) so the form sees byte-identical filter behavior. The listbox loop stays in the form but consumes the helper dictionary directly without touching `SegTareasProyecto.AR` / `.AC` / `.NC`.

The form refactor is one line of behavior change per event: every `Filtrar m_Error` and `Filtrar` call stays, the body becomes a delegation to the helper. `m_ColFiltradoTareasNCProyectos` keeps its `Scripting.Dictionary` shape so `ComandoExportarAExcel_Click` and the row loop in `Filtrar` work without further edits.

Fallback logs use a dedicated `TipoOperacion` value `TareasCacheFallback` (not the generic `FormCacheFallback`) so the `TbLogCache` signal is per-helper and can be filtered by operation. The log `Detalles` text is the exact reason string, the first slice uses the static reason `"Cache de tareas no implementada en esta slice"`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/modules/NCProyectoSeguimientoTareasListadoHelper.bas` | New | Cache seam, fallback predicate, `TareasCacheFallback` logging. |
| `src/forms/Form_FormNCProyectoSeguimientoTareas.cls` | Modified | `Filtrar` body delegates to helper; `Form_Load`, four `*_AfterUpdate`, `ComandoBuscarExpediente_Click`, `m_FormExpedientes_Seleccionado`, and the four `ComandoLimpiar*` keep their shape. `m_ColFiltradoTareasNCProyectos` is still the form-held filtered collection. `ComandoExportarAExcel_Click` is untouched. |
| `src/modules/constructor.bas` | Untouched | `getARsDeProyectoBusqueda` stays for legacy callers and as a parity oracle during tests. |
| `src/classes/SegTareasProyecto.cls` | Untouched | The class is read-only on the list path; the helper iterates its public fields without calling `.AR` / `.AC` / `.NC`. |
| `src/modules/Test_NCProyectoSeguimientoTareasListadoHelper.bas` | New | RED atomic tests: empty-cache-fallback logs, disabled-cache-fallback logs, fallback filter parity for `responsable_calidad` / `responsable` / `IDExpediente` / `Estado`, deterministic helper output for export, no `.AR` / `.AC` / `.NC` hydration per row. |
| `tests/tests.vba.seguimiento-tareas-helper.json` | New | Test manifest for `dysflow.test_vba`. |
| `openspec/changes/ncproyecto-seguimiento-tareas-helper/specs/seguimiento-tareas-helper/spec.md` | New | Formal requirements and Given/When/Then scenarios derived from issue #55 acceptance criteria. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Filter parity drift between the helper and the legacy constructor | Medium | The fallback function uses the same predicate as `constructor.getARsDeProyectoBusqueda`. A parity test seeds the same source dictionary and asserts the helper returns the same IDs in the same order. |
| `TbLogCache` write failure or missing log row breaks the fallback observability contract | Low | Wrap the `INSERT` in `On Error Resume Next` like the reference helper. Tests assert the row count after each fallback path; if the count is zero the test fails and the issue is reported. |
| Form accidentally hydrates `ARProyecto` per row through the new code path | Low | Test counts `SegTareasProyecto.AR` getter invocations via a counter seam (or by inspecting the helper code path; AR/AC/NC access is out-of-scope on the list path). The fallback function never touches `.AR`. |
| Implementation exceeds the 400-line single-commit budget | Low | The helper is the only new module, the form edit is small (one line per event replaced), and the test module is schema-light. Tasks.md splits the work into RED and GREEN work units so we can stop at any point without breaking the slice. |
| `dysflow.test_vba` runs before the user compiles manually in Access VBE | Medium | Tasks.md and the apply phase both wait for explicit user confirmation. The `compile_vba` tool is never called. |

## Rollback Plan

Revert the single commit on `staging`, re-import the previous `Form_FormNCProyectoSeguimientoTareas.cls` and skip importing `NCProyectoSeguimientoTareasListadoHelper.bas` and `Test_NCProyectoSeguimientoTareasListadoHelper.bas`, then the user compiles manually. No data migration, no `TbLogCache` rows are removed, and the legacy `constructor.getARsDeProyectoBusqueda` is untouched so the form keeps the previous behavior. The cache seam was never activated, so there is nothing to disable.

## Dependencies

- Dysflow MCP `projectId: "00-no-conformidades-staging-clean"` for future module imports and tests.
- `ACCESS_VBA_PASSWORD` environment variable, never inline.
- User manual compile in Access VBE after any `dysflow.import_modules` call.
- Schema inspection of `TbNoConformidades`, `TbNCAccionCorrectivas`, `TbNCAccionesRealizadas`, `TbExpedientes`, `TbUsuariosAplicaciones`, and `TbLogCache` before any data-touching RED test fixture.
- The `m_ObjEntorno.ColSegsTareasProyecto*` collections, which are populated by `ModuloCacheIndicadores` from `TbCacheIndicadoresProyectoDetalle`. The helper reads them as the fallback source; the slice does not change that pipeline.

## Success Criteria

- [ ] `NCProyectoSeguimientoTareasListadoHelper` exposes `GetARsProyectoSeguimientoTareasFiltrados` and returns a `Scripting.Dictionary` keyed by `IDAccionRealizada` of `SegTareasProyecto` instances, preserving the legacy `responsable_calidad` / `responsable` / `IDExpediente` / `Estado` contract.
- [ ] The cache seam is present and called first; in this slice it always falls back and the helper logs exactly one `TbLogCache` row with `TipoOperacion = "TareasCacheFallback"` and `Detalles = "Cache de tareas no implementada en esta slice"`.
- [ ] Cache OFF and empty cache paths are observable: each path writes its own `TareasCacheFallback` row with a distinct reason.
- [ ] The list rendering path inside the helper does not call `SegTareasProyecto.AR`, `.AC`, or `.NC` for any row. A counter seam in the RED tests proves it.
- [ ] Export receives deterministic helper output: same input, same IDs in the same order, regardless of fallback path.
- [ ] Form code delegates to the helper; `Filtrar` keeps its signature and its `m_ColFiltradoTareasNCProyectos` writes. No `.form.txt` change.
- [ ] `tests/tests.vba.seguimiento-tareas-helper.json` runs the RED tests through `dysflow.test_vba` only after the user compiles in Access VBE.
