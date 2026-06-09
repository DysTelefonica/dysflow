# Seguimiento Tareas Helper Specification

## Purpose

Define the behavior for GitHub issue #55: `Form_FormNCProyectoSeguimientoTareas` must delegate the task filter to a UI-free helper that prefers a cache/materialized source, falls back to the in-memory `m_ObjEntorno.ColSegsTareasProyecto*` collections when the cache is OFF / empty / errored, logs every fallback as a `TareasCacheFallback` row in `TbLogCache`, and preserves the legacy filter contract for `responsable_calidad`, `responsable`, `IDExpediente`, and `Estado`.

This is the first slice of #55. The slice plants the cache seam honestly. No `TbCacheListadoARProyecto` table is created; the seam is a thin cache-first function that today always falls back. The seam is what the next slice will plug into.

## Requirements

### Requirement: Helper exposes the project task filter

The system MUST provide a UI-free helper `NCProyectoSeguimientoTareasListadoHelper` exposing `GetARsProyectoSeguimientoTareasFiltrados(p_ResponsableCalidad, p_Responsable, p_Estado, p_IDExpediente, ByRef p_Error) As Scripting.Dictionary`. The helper MUST return a `Scripting.Dictionary` keyed by `CStr(IDAccionRealizada)` whose values are `SegTareasProyecto` instances whose listbox fields (`IDAccionRealizada`, `NAccion`, `Tarea`, `Tecnico`, `Estado`, `FechaFinPrevista`, `TipoNC`) are populated. The helper MUST NOT call `SegTareasProyecto.AR`, `.AC`, or `.NC` for any row in the result set.

#### Scenario: Helper returns dictionary keyed by IDAccionRealizada

- GIVEN a seeded in-memory `ColSegsTareasProyecto` containing three tasks with `IDAccionRealizada` `900001`, `900002`, `900003`
- WHEN the helper is called with empty filters
- THEN the returned dictionary has exactly three keys
- AND each value is the original `SegTareasProyecto` instance
- AND the helper did not call `.AR` / `.AC` / `.NC` on any of them

#### Scenario: Helper preserves responsable_calidad filter

- GIVEN a seeded `ColSegsTareasProyecto` with three tasks, one with `RespCalidad = "QA Alpha"` and two with `RespCalidad = "QA Beta"`
- WHEN the helper is called with `p_ResponsableCalidad = "QA Beta"`
- THEN the returned dictionary contains exactly the two `QA Beta` task IDs
- AND no other task ID is present

#### Scenario: Helper preserves responsable filter

- GIVEN a seeded `ColSegsTareasProyecto` with three tasks, one with `Tecnico = "Tech Alpha"` and two with `Tecnico = "Tech Beta"`
- WHEN the helper is called with `p_Responsable = "Tech Beta"`
- THEN the returned dictionary contains exactly the two `Tech Beta` task IDs

#### Scenario: Helper preserves IDExpediente filter

- GIVEN a seeded `ColSegsTareasProyecto` with three tasks, one with `IDExpediente = "500001"` and two with `IDExpediente = "500002"`
- WHEN the helper is called with `p_IDExpediente = "500002"`
- THEN the returned dictionary contains exactly the two `500002` task IDs

#### Scenario: Helper preserves Estado filter — ACTIVA

- GIVEN the environment has `ColSegsTareasProyectoActivas` with two tasks and the full `ColSegsTareasProyecto` with four tasks
- WHEN the helper is called with `p_Estado = "ACTIVA"`
- THEN the returned dictionary contains exactly the two `Activas` task IDs
- AND the helper did not iterate the full collection

#### Scenario: Helper preserves Estado filter — PENDIENTE DE REPLANIFICAR

- GIVEN the environment has `ColSegsTareasProyectoPteReplanificar` with one task and the full `ColSegsTareasProyecto` with four tasks
- WHEN the helper is called with `p_Estado = "PENDIENTE DE REPLANIFICAR"`
- THEN the returned dictionary contains exactly the one `PteReplanificar` task ID

#### Scenario: Helper default Estado selects full collection

- GIVEN the environment has `ColSegsTareasProyecto` with four tasks
- WHEN the helper is called with `p_Estado = ""` or any value other than `"ACTIVA"` / `"PENDIENTE DE REPLANIFICAR"`
- THEN the returned dictionary contains all four task IDs

### Requirement: Cache seam is present and called first

The helper MUST attempt a cache-first read before the fallback. The cache-first function `TryListadoFiltradoSQL` is the seam for a future `TbCacheListadoARProyecto` table. In this slice, the cache-first function returns `Nothing` and the helper logs `TareasCacheFallback` with reason `"Cache de tareas no implementada en esta slice"`. The seam MUST be the first branch the helper takes after the cache-enabled check.

#### Scenario: Cache seam is invoked first

- GIVEN the cache is enabled and a seeded `ColSegsTareasProyecto`
- WHEN the helper is called
- THEN the cache-first function is called before the fallback
- AND the helper logs exactly one `TareasCacheFallback` row with reason `"Cache de tareas no implementada en esta slice"`

### Requirement: Cache OFF / empty / error fallback is observable

The helper MUST log a `TareasCacheFallback` row in `TbLogCache` for every fallback path: cache disabled, cache empty, or cache errored. The reason text MUST be distinct per path so the signal is filterable. The log row MUST include `IDNoConformidad = 0`, `TipoOperacion = "TareasCacheFallback"`, `Exito = True`, `DuracionMs = 0`, `FechaOperacion = Now()`, and `Usuario` from `SafeFallbackUser` or `"Sistema"`.

#### Scenario: Cache OFF logs fallback

- GIVEN `TbConfiguracion.CacheHabilitada = False`
- WHEN the helper is called
- THEN exactly one `TbLogCache` row is written with `TipoOperacion = "TareasCacheFallback"` and `Detalles` containing `"deshabilitada"`

#### Scenario: Cache empty logs fallback

- GIVEN `TbConfiguracion.CacheHabilitada = True` and the cache-first function returns `Nothing`
- WHEN the helper is called
- THEN exactly one `TbLogCache` row is written with `TipoOperacion = "TareasCacheFallback"` and `Detalles` containing `"no implementada"`

#### Scenario: Cache errored logs fallback

- GIVEN `TbConfiguracion.CacheHabilitada = True` and the cache-first function returns a non-empty `p_Error`
- WHEN the helper is called
- THEN exactly one `TbLogCache` row is written with `TipoOperacion = "TareasCacheFallback"` and `Detalles` containing the error text

#### Scenario: Fallback log is safe when no user is connected

- GIVEN `m_ObjUsuarioConectado` is `Nothing`
- WHEN the helper logs a fallback
- THEN the `Usuario` column in the `TbLogCache` row is `"Sistema"`
- AND no error is raised

### Requirement: List rendering does not hydrate full ARProyecto

The helper MUST NOT call `SegTareasProyecto.AR`, `SegTareasProyecto.AC`, or `SegTareasProyecto.NC` for any row in the result set. The fallback function iterates the source collection, applies the predicates, and returns the `SegTareasProyecto` instances directly. The form's listbox loop continues to read only the lightweight fields (`IDAccionRealizada`, `NAccion`, `Tarea`, `Tecnico`, `Estado`, `FechaFinPrevista`, `TipoNC`).

#### Scenario: Helper does not touch AR/AC/NC getters

- GIVEN a seeded `ColSegsTareasProyecto` with three tasks whose `.AR` / `.AC` / `.NC` getters are instrumented with a counter seam
- WHEN the helper is called
- THEN the counter for `.AR` is zero
- AND the counter for `.AC` is zero
- AND the counter for `.NC` is zero

### Requirement: Export receives deterministic helper output

The helper MUST return the same dictionary (same keys, same order of enumeration, same `SegTareasProyecto` instances) for the same input on repeated calls. The order MUST be stable for the export path: `ComandoExportarAExcel_Click` reads `m_ColFiltradoTareasNCProyectos` and passes it to `TareasAExcel`; the export shape is unchanged.

#### Scenario: Repeated calls return the same enumeration order

- GIVEN a seeded `ColSegsTareasProyecto` with four tasks
- WHEN the helper is called twice with the same filters
- THEN both calls return dictionaries with the same keys in the same enumeration order

#### Scenario: Export input is stable

- GIVEN `Form_FormNCProyectoSeguimientoTareas.ComandoExportarAExcel_Click`
- WHEN `Filtrar` populates `m_ColFiltradoTareasNCProyectos`
- THEN the dictionary passed to `TareasAExcel` has the same keys in the same order as the helper's return value

### Requirement: Form code delegates to the helper

`Form_FormNCProyectoSeguimientoTareas.Filtrar` MUST call the helper and store the result in `m_ColFiltradoTareasNCProyectos`. `Form_Load`, `ESTADO_AfterUpdate`, `RESPONSABLECALIDAD_AfterUpdate`, `Responsable_AfterUpdate`, `ComandoBuscarExpediente_Click`, `m_FormExpedientes_Seleccionado`, and the four `ComandoLimpiar*` commands MUST keep their existing `Filtrar` calls. `ComandoExportarAExcel_Click` MUST remain unchanged. The `.form.txt` MUST NOT be modified.

#### Scenario: Filtrar delegates to the helper

- GIVEN the form is loaded with the default filters
- WHEN `Filtrar` runs
- THEN the result of `GetARsProyectoSeguimientoTareasFiltrados` is assigned to `m_ColFiltradoTareasNCProyectos`
- AND the listbox loop iterates the helper output

#### Scenario: Form_Load uses the helper

- GIVEN `Form_Load` sets `Me.Estado = m_ObjEntorno.ColEstadosARTitulo(CStr(EnumEstadoAR.ACTIVA))`
- WHEN the form finishes loading
- THEN `m_ColFiltradoTareasNCProyectos` is the helper's return value
- AND the listbox is populated with rows from the helper

#### Scenario: Limpiar commands re-delegate to the helper

- GIVEN the user clicks `ComandoLimpiarEstado`
- WHEN `Filtrar` runs after `Me.Estado = Null`
- THEN the helper is called with `p_Estado = ""`
- AND `m_ColFiltradoTareasNCProyectos` is refreshed from the helper

### Requirement: Strict TDD verification contract for #55

Verification for this capability MUST follow strict Access/VBA TDD discipline: schema-first inspection with `dysflow.get_schema`, fixture-first sandbox seeding in FK order (NC first, AC second, AR third), deterministic IDs in the `900000+` range, defensive teardown in reverse FK order, strong value/cardinality assertions, and zero reliance on pre-existing data. Tests MUST run with `dysflow.test_vba` only after the user compiles manually in Access VBE. The `compile_vba` tool MUST NOT be called by automation.

#### Scenario: Schema-first inspection before fixtures

- GIVEN the apply phase begins
- WHEN the RED tests are written
- THEN the ERD evidence is recorded in `apply-progress.md` for `TbNoConformidades`, `TbNCAccionCorrectivas`, `TbNCAccionesRealizadas`, `TbExpedientes`, `TbUsuariosAplicaciones`, and `TbLogCache`
- AND the fixtures only use columns confirmed by that inspection

#### Scenario: Fixture-first RED tests

- GIVEN the schema gate is passed
- WHEN the RED tests run
- THEN the test setup inserts NC + AC + AR rows in FK order with deterministic IDs
- AND the assertions check the helper return value, the `TbLogCache` row count, and the `.AR` / `.AC` / `.NC` counter seam
- AND the teardown deletes in reverse FK order, only the test markers

#### Scenario: Test manifest runs after manual compile

- GIVEN `tests/tests.vba.seguimiento-tareas-helper.json` lists the new RED tests
- WHEN the user runs `dysflow.test_vba` with `projectId = "00-no-conformidades-staging-clean"` and `testsPath = "tests/tests.vba.seguimiento-tareas-helper.json"`
- THEN the runner reports the RED state (failing) before the GREEN implementation
- AND reports the GREEN state (passing) after the implementation lands and the user re-imports + re-compiles
