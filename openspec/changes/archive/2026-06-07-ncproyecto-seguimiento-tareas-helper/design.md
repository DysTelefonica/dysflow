# Design: NCProyecto Seguimiento Tareas Helper

## Technical Approach

Add a UI-free helper `NCProyectoSeguimientoTareasListadoHelper` that owns the cache-seam / fallback / observability contract for `Form_FormNCProyectoSeguimientoTareas`. The helper mirrors the skeleton of `NCProyectoGestionListadoHelper` (cache-first, fallback second, log third) but its cache-first function is a no-op seam in this slice: it returns `Nothing`, the helper logs `TareasCacheFallback` with reason `"Cache de tareas no implementada en esta slice"`, and the fallback function reads from `m_ObjEntorno.ColSegsTareasProyecto*` and applies the same predicate as `constructor.getARsDeProyectoBusqueda`. The form refactor is a thin delegation; `m_ColFiltradoTareasNCProyectos` stays as the form-held filtered collection so `ComandoExportarAExcel_Click` and the listbox loop keep reading from the same source.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Helper location | New `src/modules/NCProyectoSeguimientoTareasListadoHelper.bas` UI-free module. | Extend `NCProyectoSeguimientoHelper` (42-line indicators helper) or `constructor.bas`. | A separate module keeps the helper testable without loading the indicators pipeline, and mirrors the `NCProyectoGestionListadoHelper` pattern that closed #50. |
| Cache seam honesty | The cache-first function is called first, returns `Nothing` today, and the helper logs a static `TareasCacheFallback` reason `"Cache de tareas no implementada en esta slice"`. | Skip the seam until the table exists. | The seam is what the issue asks for; the test that asserts the cache-first function was called is what makes it auditable. A later slice plugs the real cache into the same function. |
| Fallback source | `m_ObjEntorno.ColSegsTareasProyecto*` (Activas, PteReplanificar, full) selected by `p_Estado`. | DAO SELECT against `TbNCAccionesRealizadas` joined with `TbNCAccionCorrectivas` and `TbNoConformidades`. | The system already populates these collections from `ModuloCacheIndicadores`; reusing them preserves the current filter behavior and keeps the helper synchronous. |
| Predicate contract | Reuse `constructor.getARsDeProyectoBusqueda` predicates (`RespCalidad`, `Tecnico`, `IDExpediente`). | Re-derive from source dictionary on every call. | The constructor's contract is the legacy contract; the helper must remain compatible. |
| Log operation | `TipoOperacion = "TareasCacheFallback"` in `TbLogCache`. | Reuse `FormCacheFallback`. | A per-helper operation name keeps the log filterable and avoids cross-helper signal collisions. |
| Form code edit | One line per event: every `Filtrar` and `Filtrar m_Error` call delegates to the helper. `m_ColFiltradoTareasNCProyectos` stays. `ComandoExportarAExcel_Click` is untouched. | Bigger refactor that moves the listbox loop into the helper. | Out of scope; budget is tight. The next slice can do that refactor. |
| `constructor.getARsDeProyectoBusqueda` | Keep untouched. | Remove or rename. | Legacy callers and parity tests need it. |
| `.form.txt` | No change. | Edit for UI/event properties. | Out of scope; the form is already wired for the existing filters. |
| Lightweight row contract | The helper returns `SegTareasProyecto` and never calls `.AR` / `.AC` / `.NC`. | Return a recordset or DTO. | Matches the current `Filtrar` loop, which already uses only the lightweight fields. |

## Data Flow

```text
Form_FormNCProyectoSeguimientoTareas.Filtrar
  -> NCProyectoSeguimientoTareasListadoHelper.GetARsProyectoSeguimientoTareasFiltrados(
       p_ResponsableCalidad, p_Responsable, p_Estado, p_IDExpediente, p_Error)
    -> IsCacheEnabled()? (read TbConfiguracion.CacheHabilitada)
    -> TryListadoFiltradoSQL(...): private cache seam
         -> today: returns Nothing, reason "Cache de tareas no implementada en esta slice"
    -> LogFallback(reason)  -- writes TbLogCache row with TipoOperacion="TareasCacheFallback"
    -> GetARsProyectoSeguimientoTareasFallback(...)
         -> select source by Estado: Activas / PteReplanificar / full
         -> apply predicates: RespCalidad, Tecnico, IDExpediente
         -> return Scripting.Dictionary keyed by CStr(IDAccionRealizada) of SegTareasProyecto
  -> m_ColFiltradoTareasNCProyectos = helper result
  -> for each row: read IDAccionRealizada, NAccion, Tarea, Tecnico, Estado, FechaFinPrevista, TipoNC
  -> listbox.AddItem
  -> ComandoExportarAExcel_Click reads m_ColFiltradoTareasNCProyectos and calls TareasAExcel
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/modules/NCProyectoSeguimientoTareasListadoHelper.bas` | New | Public `GetARsProyectoSeguimientoTareasFiltrados`; private `TryListadoFiltradoSQL` (seam), `GetARsProyectoSeguimientoTareasFallback` (in-memory filter), `ResolveEstadoFuente`, `LogFallback`, `SafeFallbackUser`, `SqlLiteral`. Mirror `NCProyectoGestionListadoHelper` skeleton. |
| `src/forms/Form_FormNCProyectoSeguimientoTareas.cls` | Modify | `Filtrar` body replaces the direct `constructor.getARsDeProyectoBusqueda` call with the helper. `Form_Load`, `ESTADO_AfterUpdate`, `RESPONSABLECALIDAD_AfterUpdate`, `Responsable_AfterUpdate`, `ComandoBuscarExpediente_Click`, `m_FormExpedientes_Seleccionado`, and the four `ComandoLimpiar*` keep their shape; the body of `Filtrar` is the only behavioral change. `m_ColFiltradoTareasNCProyectos` stays. `ComandoExportarAExcel_Click` is untouched. |
| `src/modules/constructor.bas` | Untouched | `getARsDeProyectoBusqueda` stays for legacy callers and as the parity oracle for the RED tests. |
| `src/classes/SegTareasProyecto.cls` | Untouched | The class is read-only on the list path. |
| `src/modules/Test_NCProyectoSeguimientoTareasListadoHelper.bas` | New | RED atomic tests: empty-cache-fallback logs, disabled-cache-fallback logs, fallback-no-user safe log, fallback filter parity for `responsable_calidad` / `responsable` / `IDExpediente` / `Estado`, deterministic export order, no `.AR` / `.AC` / `.NC` per-row hydration. |
| `tests/tests.vba.seguimiento-tareas-helper.json` | New | Test manifest for `dysflow.test_vba`. |

## Interfaces / Contracts

```vba
Public Function GetARsProyectoSeguimientoTareasFiltrados( _
    Optional ByVal p_ResponsableCalidad As String = "", _
    Optional ByVal p_Responsable As String = "", _
    Optional ByVal p_Estado As String = "", _
    Optional ByVal p_IDExpediente As String = "", _
    Optional ByRef p_Error As String _
    ) As Scripting.Dictionary
```

Returns a `Scripting.Dictionary` keyed by `CStr(IDAccionRealizada)`, each value a `SegTareasProyecto`. `p_Estado` accepts `"ACTIVA"`, `"PENDIENTE DE REPLANIFICAR"`, or any other value (selects the full collection). `p_Error` is empty on success and a non-empty message on any failure; the form follows the existing pattern `If m_Error <> "" Then Err.Raise 1000`.

Private helpers:

- `IsCacheEnabled() As Boolean` — reads `TbConfiguracion.CacheHabilitada` like the reference helper.
- `TryListadoFiltradoSQL(p_ResponsableCalidad, p_Responsable, p_Estado, p_IDExpediente, ByRef p_Error) As Scripting.Dictionary` — the cache seam. Today it sets `p_Error = ""` and returns `Nothing`. Tomorrow it can call `TryListadoFiltradoSQLFromTbCacheListadoARProyecto(...)` when that table exists.
- `GetARsProyectoSeguimientoTareasFallback(...)` — selects the source collection by `p_Estado`, applies the three predicates, returns the dictionary.
- `ResolveEstadoFuente(p_Estado As String) As Scripting.Dictionary` — picks `m_ObjEntorno.ColSegsTareasProyectoActivas` / `ColSegsTareasProyectoPteReplanificar` / `ColSegsTareasProyecto`.
- `LogFallback(p_Detalle As String)` — INSERT into `TbLogCache` with `TipoOperacion = "TareasCacheFallback"`, `IDNoConformidad = 0`, `Exito = True`, `DuracionMs = 0`, `FechaOperacion = Now()`, `Usuario` from `SafeFallbackUser` or `"Sistema"`.
- `SafeFallbackUser() As String` — returns the connected user's `UsuarioRed` or `Nombre`; defaults to `"Sistema"`.
- `SqlLiteral(p_Value As String) As String` — quote-escape helper.

Cache seam design decision: the `TryListadoFiltradoSQL` private function is the only thing a future slice needs to change to plug in `TbCacheListadoARProyecto`. The function signature is fixed, the return shape is fixed, the fallback path stays unchanged. The next slice needs to add:

1. A `TbCacheListadoARProyecto` table with at least `IDAccionRealizada`, `IdAccionCorrectiva`, `IDNoConformidad`, `Tarea`, `Tecnico`, `Estado`, `FechaInicio`, `FechaFinPrevista`, `FechaFinReal`, `TipoNC`, `RespCalidad`, `IDExpediente`, `NAccion`, `CacheValida`, `FechaCache`, `Version` (mirror of `TbCacheListadoNC`).
2. A warmup path in `ModuloCacheIndicadores` that fills the table.
3. A read path in `TryListadoFiltradoSQL` that builds a `SegTareasProyecto` from each row, keyed by `IDAccionRealizada`, and applies the same predicates.
4. A new `TipoOperacion` value, e.g. `"TareasCacheHit"`, to log successful cache reads.

The first slice is a thin seam. The second slice is the cache. Both slices share the same fallback path.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Object | Empty-cache-fallback logs, disabled-cache-fallback logs, no-user safe log, fallback filter parity for `responsable_calidad` / `responsable` / `IDExpediente` / `Estado`, deterministic export order, no `.AR` / `.AC` / `.NC` per-row access. | `Public Function` atomic tests returning canonical JSON, schema-first fixtures, strong value/cardinality assertions. |
| Integration | `TbLogCache` row count after each fallback path; `SegTareasProyecto.AR` getter counter is zero across the result set. | `dysflow.test_vba` only after user manual compile. |
| UI seam | Form delegation: `Filtrar` call after `Form_Load` returns the helper output. | Out of scope; the form code change is a one-line delegation, the helper unit tests cover the behavior. |

Schema gate (per project rules): before writing any data-touching test, `dysflow.get_schema` is run against `TbNoConformidades`, `TbNCAccionCorrectivas`, `TbNCAccionesRealizadas`, `TbExpedientes`, `TbUsuariosAplicaciones`, and `TbLogCache`. PK, FK, Required, and types are recorded in the apply-phase `apply-progress.md`. The ERD already exists in `openspec/changes/archive/2026-06-06-form-ncproyecto-helper-coverage/erd-backend.md/NoConformidades_Datos.md` and is the authoritative reference for this slice.

Fixture graph: seed NC first, AC second, AR third, in FK order. Deterministic IDs in the `900000+` range. Teardown in reverse FK order (AR, AC, NC, then `TbLogCache` rows for this slice). The fixture must not assume any other row exists; the helper must produce the expected result from these three rows alone.

`VBA` rules: separate `Not Is Nothing` from `.count` / `.Exists` access. Use `parametro:=valor` for any ByRef optional. Treat `m_ObjEntorno` as `Nothing`-safe.

## Migration / Rollout

No data migration. The cache seam is a thin no-op; `TbCacheListadoARProyecto` is a later slice. The form's behavior is byte-identical: same filter, same IDs, same export. Rollback is reverting the single commit on `staging`, dropping the helper module and the test module, and re-importing the previous form. The user compiles manually in Access VBE. No `TbLogCache` rows are deleted.

## Open Questions

- [ ] Should the cache-first function in this slice write any `TbLogCache` row on the success path, or is the seam-only path silent until the table exists? **Decision:** silent in this slice; the `TareasCacheFallback` log is only written on the actual fallback. A future slice adds `TareasCacheHit` for the success path.
- [ ] Should the helper expose a separate "ListRows" function that returns a recordset of `IDAccionRealizada;NºTRA;Tarea;Responsable;Estado;F.prev.cierre;Tipo NC` strings for the listbox loop, or should the form keep the loop and read the lightweight fields directly? **Decision:** the form keeps the loop in this slice to keep the budget small. The next slice can introduce `BuildSeguimientoTareasListRow` if the budget allows.
- [ ] Should the helper's `Estado` filter use the `m_ObjEntorno.ColEstadosARTitulo(CStr(EnumEstadoAR.ACTIVA))` translated string or the raw enum value? **Decision:** raw enum value, matching the constructor's contract (`p_Estado = "ACTIVA"`, `p_Estado = "PENDIENTE DE REPLANIFICAR"`, or anything else for the full collection). The form already passes the raw value via `Nz(Me.Estado.Column(0), "")`.
- [ ] The Dysflow `get_schema` tool returned `RUNNER_INVALID_JSON` in this session. The apply phase must retry with the same `projectId` and record evidence in `apply-progress.md`. If the tool remains broken, the apply phase falls back to the existing ERD and `SELECT TOP 1 * FROM <table>` probes via `dysflow.count_rows` / `dysflow.query_sql` until schema can be confirmed.
