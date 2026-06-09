# Tasks: NCProyecto Seguimiento Tareas Helper

## Implementation Strategy

All tasks in this slice land in a single direct commit to `staging` (no PR, no chained PR, never `main`). Strict TDD is active: RED tests are written and committed first, the GREEN implementation lands in the same logical change, and `dysflow.test_vba` is invoked only after the user compiles manually in Access VBE. The `compile_vba` tool is never called by automation.

The slice is split into five RED work units and three GREEN work units. Each RED unit maps to one or more scenarios in `specs/seguimiento-tareas-helper/spec.md`. Each GREEN unit is small. The original <=400 changed-line forecast was exceeded; V5 is closed only by explicit maintainer-approved `size:exception`, not by budget compliance.

## RED Tasks (failing tests first)

- [x] R1: Schema-first inspection and apply-progress evidence
  - Run `dysflow.get_schema` (or fall back to `dysflow.count_rows` + `dysflow.query_sql` probes when the runner is broken) against `TbNoConformidades`, `TbNCAccionCorrectivas`, `TbNCAccionesRealizadas`, `TbExpedientes`, `TbUsuariosAplicaciones`, and `TbLogCache`.
  - Record PK, FK, Required, and types in `openspec/changes/ncproyecto-seguimiento-tareas-helper/apply-progress.md`. Authoritative source: `openspec/changes/archive/2026-06-06-form-ncproyecto-helper-coverage/erd-backend.md/NoConformidades_Datos.md` (generated 2026-06-03).
  - Confirm `TbCacheListadoARProyecto` does NOT exist (this slice does not create it).

- [x] R2: Create guarded source-only `Test_NCProyectoSeguimientoTareasListadoHelper` skeleton with `NewLogs`, `BeginTestSession`, `EndTestSession`, `BuildJsonOk`, `BuildJsonFail`, and the fixture helper names `EnsureNCFixture`, `EnsureACFixture`, `EnsureARFixture`, `CleanupW4bFixtures`, `SetCacheHabilitada`, `ReadCacheHabilitada`, `SafeLogCacheRowCount`, `TestUser`, `SchemaGateW4b`. R2 is not a runnable RED-test slice yet; concrete `Public Function Test_*() As String` entries begin in R3+.
  - Fixture graph for later concrete tests: NC first, AC second, AR third. Teardown in reverse FK order. Deterministic IDs in the `900000+` range. The test must not depend on any pre-existing data. In R2, backend-touching helper stubs are guarded/no-op until canonical sandbox setup is used.
  - Schema gate log line: "Schema gate documented: TbNoConformidades IDNoConformidad/CodigoNoConformidad/EXPEDIENTE; TbNCAccionCorrectivas IDAccionCorrectiva/IDNoConformidad; TbNCAccionesRealizadas IDAccionRealizada/IdAccionCorrectiva; TbLogCache IDNoConformidad/TipoOperacion; TbConfiguracion ID/CacheHabilitada/FechaCambioCache/UsuarioCambioCache/MotivoCambioCache. Teardown: AR then AC then NC then log rows; restore config fields for ID=1."

- [x] R3: RED test `Test_TareasHelper_Fallback_EmptyCache_Logs` — cache enabled / empty seam path, uses canonical `TestHelper.BeginTestSession` sandbox routing, snapshots/restores `TbConfiguracion.ID=1` fields (`CacheHabilitada`, `FechaCambioCache`, `UsuarioCambioCache`, `MotivoCambioCache`) via test-local DAO without calling `IsCacheEnabled()` or `CacheConfig_SetEnabled()`, performs scoped cleanup before/after for `TipoOperacion = "TareasCacheFallback"` rows with the cache-not-implemented reason, calls `GetARsProyectoSeguimientoTareasFiltrados` behavior via `Application.Run`, and asserts exactly one scoped `TbLogCache` row with `Detalles` containing `"Cache de tareas no implementada en esta slice"`. Expected RED until production helper exists; no import/compile/test run was performed in this source-only slice.

- [x] R4: RED test `Test_TareasHelper_Fallback_DisabledCache_Logs` — `CacheHabilitada = False`, asserts one `TbLogCache` row with the disabled reason. Maps to the cache OFF scenario. Source-only; no import/compile/test run was performed in this slice.

- [x] R5: RED test `Test_TareasHelper_Fallback_NoUser_SafeLog` — `m_ObjUsuarioConectado = Nothing`, asserts the `Usuario` column is `"Sistema"` and no error is raised. Maps to the no-user safe log scenario. Source-only; no import/compile/test run was performed in this slice.

- [x] R6: RED test `Test_TareasHelper_FilterParity_AllPredicates_Atomic` — seeds one NC, one AC, three ARs, calls the helper with combinations of `responsable_calidad` / `responsable` / `IDExpediente`, asserts the helper returns the same IDs in the same order as the legacy `constructor.getARsDeProyectoBusqueda` contract. Maps to the four `preserves * filter` scenarios. Source-only; no import/compile/test run was performed in this slice.

- [x] R7: RED test `Test_TareasHelper_Estado_SelectsSource` — three scenarios (Activas, PteReplanificar, default full) with separate fixture states, asserts the helper returns the right subset per `p_Estado`. Maps to the three `preserves Estado filter` scenarios. Source-only; no import/compile/test run was performed in this slice.

- [x] R8: RED test `Test_TareasHelper_NoARPerRowHydration` — instruments `SegTareasProyecto.AR` / `.AC` / `.NC` getters with a counter seam, calls the helper, asserts the counters are zero. Maps to the no-hydration scenario.

- [x] R9: RED test `Test_TareasHelper_DeterministicOrder_ExportInput` — calls the helper twice with the same input, asserts the dictionary keys enumerate in the same order; asserts the form's `m_ColFiltradoTareasNCProyectos` is the helper's return value (smoke test on the form path or unit test on the form-held collection shape). Maps to the export determinism scenarios.

- [x] R10: Create `tests/tests.vba.seguimiento-tareas-helper.json` test manifest listing the RED tests in the dysflow manifest format (mirror `tests/tests.vba.listado-helper.json`). Tags: `["atomic", "ncproyecto-seguimiento-tareas-helper", "wu1", "red", "helper", "fallback", "filter-parity", "no-hydration"]`.

## GREEN Tasks (implementation after RED is committed)

- [x] G1: Create `src/modules/NCProyectoSeguimientoTareasListadoHelper.bas` with the cache-first / fallback / log skeleton.
  - `Public Function GetARsProyectoSeguimientoTareasFiltrados(...)` calling `IsCacheEnabled`, then `TryListadoFiltradoSQL` (seam), then `LogFallback(reason)`, then `GetARsProyectoSeguimientoTareasFallback(...)`.
  - `Private Function TryListadoFiltradoSQL(...) As Scripting.Dictionary` — returns `Nothing` and sets `p_Error = ""` in this slice. The function is the seam a future slice will plug into.
  - `Private Function GetARsProyectoSeguimientoTareasFallback(...)` — selects the source by `p_Estado` (`Activas` / `PteReplanificar` / full), applies the three predicates (`RespCalidad`, `Tecnico`, `IDExpediente`), returns a `Scripting.Dictionary` keyed by `CStr(IDAccionRealizada)`.
  - `Private Function ResolveEstadoFuente(...)` — picks the right `m_ObjEntorno.ColSegsTareasProyecto*` collection.
  - `Private Sub LogFallback(p_Detalle As String)` — INSERT into `TbLogCache` with `TipoOperacion = "TareasCacheFallback"`, `IDNoConformidad = 0`, `Exito = True`, `DuracionMs = 0`, `FechaOperacion = Now()`, `Usuario` from `SafeFallbackUser`.
  - `Private Function SafeFallbackUser() As String` — returns connected user's `UsuarioRed` or `Nombre`, default `"Sistema"`.
  - `Private Function SqlLiteral(...)` — quote-escape helper.
  - Mirror the skeleton of `src/modules/NCProyectoGestionListadoHelper.bas`. Honor the project `VBA` rules: separate `Is Nothing` from `.Count` / `.Exists`; use `parametro:=valor` for any ByRef optional; `On Error Resume Next` around the `TbLogCache` write.

- [x] G2: Form refactor in `src/forms/Form_FormNCProyectoSeguimientoTareas.cls`. The body of `Public Function Filtrar(Optional ByRef p_Error As String) As String` is the only behavioral change: replace the `constructor.getARsDeProyectoBusqueda` call with `NCProyectoSeguimientoTareasListadoHelper.GetARsProyectoSeguimientoTareasFiltrados`. Keep the dictionary shape, keep `m_ColFiltradoTareasNCProyectos` assignment, keep the listbox loop, keep `ListaFiltrados_Click` after the loop. `Form_Load`, `ESTADO_AfterUpdate`, `RESPONSABLECALIDAD_AfterUpdate`, `Responsable_AfterUpdate`, `ComandoBuscarExpediente_Click`, `m_FormExpedientes_Seleccionado`, and the four `ComandoLimpiar*` commands keep their existing `Filtrar` calls. `ComandoExportarAExcel_Click` is untouched. `constructor.getARsDeProyectoBusqueda` stays for legacy callers and the parity oracle.

- [x] G3: Re-run the RED tests under `dysflow.test_vba` to confirm the GREEN state. The user compiles manually in Access VBE before the runner is invoked. `compile_vba` is never called. After GREEN, the apply-progress file is updated with the test result summary, the run command, the project id, and the user-compile evidence.

## Verification Tasks

- [x] V1: All RED tests in `tests/tests.vba.seguimiento-tareas-helper.json` are RED before G1 and GREEN after G1/G2/R7 fix.
- [x] V2: Form code change is a one-line body replacement in `Filtrar`. No `.form.txt` change. `m_ColFiltradoTareasNCProyectos` still holds the helper output.
- [x] V3: No `compile_vba` call. `dysflow.import_modules` is called only on user request. `dysflow.test_vba` runs only after user manual compile.
- [x] V4: The cache seam `TryListadoFiltradoSQL` is exercised before the fallback (R3 test asserts the call order through the `TareasCacheFallback` log row).
- [x] V5: Review-budget gate closed by explicit maintainer-approved `size:exception` on 2026-06-07. This is not <=400 compliance: measured evidence was approximately 1447 insertions plus 1 deletion before OpenSpec documentation, with `Test_NCProyectoSeguimientoTareasListadoHelper.bas` alone at 1157 lines. The exception accepts the review-size risk for this SDD change.

## Verification Gap Remediation Tasks

- [x] VG1: Runtime cache-error fallback logging remediation. Closed by final GREEN after user manual compile: `Test_TareasHelper_Fallback_CacheError_Logs` passed in the 9/9 Dysflow MCP run (`projectId: 00-no-conformidades-staging-clean`, `testsPath: tests/tests.vba.seguimiento-tareas-helper.json`, `timeoutMs: 600000`). Automation did not call `compile_vba`; the test forces `TryListadoFiltradoSQL` error through the double-gated testing seam without creating `TbCacheListadoARProyecto`.
- [x] VG2: Runtime form delegation remediation. Closed by final GREEN after user manual compile: `Test_TareasForm_Delegates_FilterPaths` passed in the same 9/9 Dysflow MCP run. Coverage is UI-free and validates helper/form-called logic through the safe module-level hook; no direct form-module public hook, no `DoCmd.OpenForm`, no `.form.txt` edit, and no UI automation. Final UI validation remains manual.

## Task-to-Requirement Mapping

| Task | Spec Requirement | Scenario |
|------|------------------|----------|
| R1 | Strict TDD verification contract | Schema-first inspection before fixtures |
| R2 | Strict TDD verification contract | Fixture-first RED tests |
| R3 | Cache OFF / empty / error fallback is observable | Cache OFF logs fallback; cache empty logs fallback |
| R4 | Cache OFF / empty / error fallback is observable | Cache OFF logs fallback |
| R5 | Cache OFF / empty / error fallback is observable | Fallback log is safe when no user is connected |
| R6 | Helper exposes the project task filter | Helper preserves responsable_calidad / responsable / IDExpediente filter |
| R7 | Helper exposes the project task filter | Helper preserves Estado filter — ACTIVA / PENDIENTE DE REPLANIFICAR / default |
| R8 | List rendering does not hydrate full ARProyecto | Helper does not touch AR/AC/NC getters |
| R9 | Export receives deterministic helper output | Repeated calls return the same enumeration order; export input is stable |
| R10 | Strict TDD verification contract | Test manifest runs after manual compile |
| G1 | Helper exposes the project task filter; cache seam; fallback observability | All helper scenarios |
| G2 | Form code delegates to the helper | Filtrar delegates; Form_Load uses helper; Limpiar commands re-delegate |
| G3 | All requirements | All scenarios verified GREEN after manual compile |

## Out-of-Scope Reminders

- No `TbCacheListadoARProyecto` table in this slice. The seam is a thin function.
- No `compile_vba` call. The user compiles manually in Access VBE.
- No PR, no chained PR, no push. The orchestrator handles commit + push to `staging`.
- No removal or rename of `constructor.getARsDeProyectoBusqueda`. Legacy callers and the parity oracle need it.
- No edit to `.form.txt` for `Form_FormNCProyectoSeguimientoTareas`.
- No edit to `ComandoExportarAExcel_Click` beyond the form-level refactor in G2.
- No edit to `ListaFiltrados_Click` selection path (constructor.getARProyecto).
