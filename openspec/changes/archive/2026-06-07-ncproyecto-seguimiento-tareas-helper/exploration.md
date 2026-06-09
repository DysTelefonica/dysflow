# Exploration: ncproyecto-seguimiento-tareas-helper

## Current State

`Form_FormNCProyectoSeguimientoTareas.cls` (598 lines) renders the project task list for `FormNCProyecto` users. `Form_Load` initializes the controls, sets `Me.Estado = m_ObjEntorno.ColEstadosARTitulo(CStr(EnumEstadoAR.ACTIVA))`, and calls `Filtrar` (line 282–323). `Filtrar` (line 373–427) reads the form filters, calls `constructor.getARsDeProyectoBusqueda` (line 394), stores the result in the form-held `m_ColFiltradoTareasNCProyectos` collection, and populates the `ListaFiltrados` listbox row by row using only the lightweight fields `IDAccionRealizada`, `NAccion`, `Tarea`, `Tecnico`, `Estado`, `FechaFinPrevista`, `TipoNC`. The form never calls `SegTareasProyecto.AR` / `.AC` / `.NC` on the list path, which already satisfies the issue's "no full AR hydration" requirement. `ComandoExportarAExcel_Click` (line 108–153) passes the same form-held collection to `TareasAExcel` and runs the existing export unchanged.

`constructor.getARsDeProyectoBusqueda` (line 2472–2536) reads from `m_ObjEntorno.ColSegsTareasProyectoActivas` when `p_Estado = "ACTIVA"`, `ColSegsTareasProyectoPteReplanificar` when `p_Estado = "PENDIENTE DE REPLANIFICAR"`, and the full `ColSegsTareasProyecto` collection otherwise. It then applies three predicates (`RespCalidad`, `Tecnico`, `IDExpediente`) and returns a `Scripting.Dictionary` keyed by `IDAccionRealizada` of `SegTareasProyecto` objects. The `Entorno` class (lines 86–88, 1930–2016) owns these collections and lazy-loads them from `constructor.getSegsTareasProyecto*` when first read. The `ModuloCacheIndicadores` pipeline (lines 634, 879, 923) populates the collections from `TbCacheIndicadoresProyectoDetalle`, so the in-memory data is already cache-derived; there is no persistent SQL table specifically for task listing rows in the current schema.

`TbLogCache` is the existing cache log table (PK `IDLog`, `IDNoConformidad` Long Required, `TipoOperacion` Text 50, `Detalles` Memo, `Usuario` Text 50, `Exito` Boolean, `DuracionMs` Long, `FechaOperacion` Date/Time). The reference helper `NCProyectoGestionListadoHelper` writes to it with `TipoOperacion = "FormCacheFallback"` and a free-text `Detalles` reason. There is no `TbCacheListadoARProyecto` table; the schema only has `TbCacheListadoNC` and `TbCacheListadoNCAuditoria` for NC-level listing caches.

## Gap

The list path is correct in shape but mixes responsibilities: the form owns the filter call, the form holds the filtered collection, the constructor owns the predicate, the environment owns the source. There is no seam for adding a future persistent cache of task rows without rewriting the form. The constructor's helper returns the right shape but the form has to know to call the constructor; the form cannot be unit-tested without the constructor and the environment. The fallback observability is missing: the form has no way to know whether a result came from cache or from the in-memory path, and there is no `TbLogCache` row documenting the decision.

The issue is also clear about scope: the helper must exist, the cache seam must exist, the fallback must be observable, the list path must stay light, the export must be deterministic, and the form must delegate. None of those goals require a new SQL table today; the seam itself is the deliverable for this slice.

## Approaches

1. **Pure in-memory helper with honest cache seam (recommended)**
   - Add `NCProyectoSeguimientoTareasListadoHelper` mirroring `NCProyectoGestionListadoHelper`. The cache-first function returns `Nothing` today, the helper logs `TareasCacheFallback` with reason `"Cache de tareas no implementada en esta slice"` and falls back to the in-memory `ColSegsTareasProyecto*` path. The fallback function copies the constructor's predicate logic. The form calls the helper and stores the result in `m_ColFiltradoTareasNCProyectos` as before.
   - Pros: matches the issue's cache-seam ask without inventing a table; falls back to the exact current behavior; tests can stub the in-memory collections; the next slice just plugs the cache table into the seam.
   - Cons: today the seam is dead code from a runtime perspective, but the test that asserts the cache call is exercised first is what makes the seam honest.
   - Effort: Small. The helper is ~250 lines, the form edit is small, the test module is ~250 lines.

2. **DAO-only helper**
   - Have the helper run a SQL `SELECT` against `TbNCAccionesRealizadas` joined with `TbNCAccionCorrectivas` and `TbNoConformidades`.
   - Pros: bypasses the in-memory cache entirely.
   - Cons: contradicts the current architecture (the system already has `m_ObjEntorno.ColSegsTareasProyecto*` populated by `ModuloCacheIndicadores`); reintroduces DAO latency on a form that already loads from a derived in-memory source; misses the cache seam requirement; the export path becomes non-deterministic between users that have a warm cache and those that do not.
   - Effort: Medium. Requires writing the SQL, joining, and proving parity with the in-memory result.

3. **Full persistent cache table in this slice**
   - Add `TbCacheListadoARProyecto` (mirroring `TbCacheListadoNC`) populated by `ModuloCacheIndicadores` and consumed by the helper.
   - Pros: closes the cache-seam ask with a real cache.
   - Cons: scope creep. The orchestrator's brief explicitly excludes creating the table; the data-touching test surface grows; the migration / warmup path is its own slice; the review budget for the slice doubles.
   - Effort: High. New table, new warmup path, parity tests against `ColSegsTareasProyecto*`, plus the helper.

## Recommendation

Use approach 1. It matches the issue's acceptance criteria one-to-one, fits the 400-line single-commit budget, and the cache seam is exactly the contract a later slice can plug into without touching the form. The fallback function reuses the constructor's predicate logic so the form's behavior is byte-identical. The form edit is one-line-per-event: every existing call site keeps its shape, the body delegates to the helper, and `m_ColFiltradoTareasNCProyectos` continues to hold the helper output for `ComandoExportarAExcel_Click`.

The strict TDD shape for this slice is:

- Schema-first: inspect `TbNoConformidades`, `TbNCAccionCorrectivas`, `TbNCAccionesRealizadas`, `TbExpedientes`, `TbUsuariosAplicaciones`, and `TbLogCache` with `dysflow.get_schema` before writing any data-touching test. ERD is already available in `openspec/changes/archive/2026-06-06-form-ncproyecto-helper-coverage/erd-backend.md/NoConformidades_Datos.md`; that is the authoritative source for this slice.
- Fixture-first: seed NC + AC + AR rows in FK order (NC first, AC second, AR third) with deterministic IDs in the `900000+` range. Teardown in reverse FK order. The helper test should never rely on whatever rows happen to exist.
- RED before GREEN: write failing tests that assert (a) fallback logs, (b) filter parity with the constructor's contract, (c) no `.AR` / `.AC` / `.NC` per-row access, and (d) deterministic output for export. Implement the helper only after the tests are red.
- The `compile_vba` tool is never called. `dysflow.import_modules` is called only when the user explicitly asks to import, and `dysflow.test_vba` runs only after the user has compiled in Access VBE.

## Risks

- **Predicate drift**: The fallback function's filter contract must match the constructor's contract. Mitigation: a parity test seeds the same in-memory source dictionary and asserts the helper returns the same IDs in the same order. If the constructor changes, the test must be updated in the same change.
- **`TbLogCache` write noise**: Multiple fallback reasons writing one row each is the goal, not noise. The dedicated `TipoOperacion = "TareasCacheFallback"` keeps the signal filterable.
- **Cache seam honesty**: A seam that is never exercised is a lie. The RED test must prove that the cache-first function is called before the fallback, even if it always returns `Nothing` today.
- **Budget overflow**: 400 changed lines is tight if the form edit turns out larger than expected. The form edit is mechanical (every `Filtrar` call site becomes `Filtrar delegating to helper`); if it grows, the next slice picks up the difference.
- **Schema inspection tool failure**: `dysflow.get_schema` is reported as a runner-level failure in this session. Mitigation: the ERD in `openspec/changes/archive/2026-06-06-form-ncproyecto-helper-coverage/erd-backend.md/NoConformidades_Datos.md` is the authoritative source for the touched tables, generated 2026-06-03. The apply phase re-runs the inspection and records evidence in `apply-progress.md`.

## Ready for Proposal

Yes. The change is concrete, the seam is honest, the budget fits, and the strict TDD shape is fully specified. Proceed to `sdd-spec`, `sdd-design`, and `sdd-tasks`.
