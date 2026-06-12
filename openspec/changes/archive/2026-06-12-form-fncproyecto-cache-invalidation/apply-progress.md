# Apply Progress: form-fncproyecto-cache-invalidation

**Mode**: Strict TDD
**Artifact store**: OpenSpec + Engram
**Delivery**: force-chained / staging-targeted work-unit slices (4 chained PRs, stacked-to-main)
**Current slice**: Source apply complete — Slice 4 runtime verification refreshed after critical form-artifact fix
**Status**: Implementation task checklist reconciled complete for source edits. Slice 2 T1-T3 and Slice 3 T4/T5/T8/T9 retain prior GREEN evidence. Slice 4 was refreshed after the critical review form-artifact fix: after import and user manual compile, the orchestrator reran `dysflow.test_vba testsPath=tests/tests.vba.proyecto-gestion-helper.json filter=slice4`; T10 was GREEN with value `audit-rename-source-contract` and no UI.

## Artifact blocker resolution

- Added `openspec/changes/form-fncproyecto-cache-invalidation/specs/form-fncproyecto-cache-invalidation/spec.md` so native OpenSpec discovery now finds a concrete `specs/**/spec.md` artifact.
- Added markdown task checkboxes to `tasks.md` while preserving the existing slice tables, task IDs, and Slice 2 deferral notes.
- Preserved the Slice 2 evidence that T1/T2/T3 are GREEN after the user manual compile; reconciled T6/T7 truthfully as superseded by Slice 3 observable no-UI helper coverage, not as direct tests.

## Slice 2 blocker patch — T2 fixture-scope assertion

- After user compile and `dysflow.test_vba filter=slice2`, T1 and T3 passed but T2 failed with `Expected 5 cache rows after full rebuild, got 433`.
- Root cause: T2 asserted `CountCacheRows(db)` against the whole sandbox cache table, but `RebuildNCProyectoListadoCache(0)` intentionally rebuilds every active NC row in the sandbox.
- Patch: T2 now counts only deterministic fixture IDs `TEST_ID_NC_T2_1` through `TEST_ID_NC_T2_5`, asserts the 3 pre-existing fixture cache rows exist before Act, asserts 5 fixture rows after Act, asserts all fixture rows are valid, and asserts the pre-existing stale fixture rows were regenerated via `FechaCache`.
- Next verification is unchanged: import `Test_NCProyectoGestionListadoHelper`, user manual compile, rerun `dysflow.test_vba` with `filter=slice2`.

## Slice status overview

| Slice | Goal | Status | Commit | Tests |
|-------|------|--------|--------|-------|
| 1/4 | Helpers RED (T1-T5 stubs + manifest) | committed | `356f185` | RED stubs in repo; not yet run as RED |
| 2/4 | Entorno + GREEN (T1-T3, T6/T7 intent) | verified | `<this>` | T1, T2, T3 GREEN after user manual compile; direct T6/T7 private-member tests superseded by Slice 3 observable helper-seam coverage |
| 3/4 | Handler GREEN (T4, T5, T8, T9) + observable invalidate coverage through T8 | **4/4 GREEN** | — | `dysflow.test_vba filter=slice3` — 4/4 GREEN after user manual compile |
| 4/4 | Audit rename (T10) | **1/1 GREEN after binding fix** | — | `dysflow.test_vba testsPath=tests/tests.vba.proyecto-gestion-helper.json filter=slice4` after import + user manual compile; T10 value `audit-rename-source-contract`; no UI |

## Schema evidence (re-validated before Slice 2 implementation)

- `.dysflow/project.json`: `projectId=00-no-conformidades-staging-clean`, `allowWrites: true`.
- Cache helpers invoked by `RebuildNCProyectoListadoCache` exist in `src/modules/CacheNCProyecto.bas`:
  - `Public Const NOMBRE_TABLA_LISTADO As String = "TbCacheListadoNC"` (line 34)
  - `Public Function IsCacheEnabled() As Boolean` (line 47)
  - `Public Function EnsureCacheSchemaReadiness(Optional ByRef p_Error As String) As Boolean` (line 122)
  - `Public Function RegenerarRegistro(ByVal p_IDNoConformidad As String, ...)` (line 2094)
- `Entorno.cls` private collection members confirmed: `m_objColNCsProyecto` (line 45), `m_ObjColJuridicasDistintas` (line 47), `m_objColTipos` (line 52), `m_ObjColEstadosNC` (line 57), `m_objColJefesProyecto` (line 73), `m_objColUsuariosCalidad` (line 20).
- `LogFallback` exists as `Private Sub` in `NCProyectoGestionListadoHelper.bas:435` (mirror of the audit module).
- `TableExists` mirror: a `Private Function TableExists(ByVal p_TableName As String) As Boolean` was added in `NCProyectoGestionListadoHelper.bas:477`, mirroring `NCAuditoriaGestionListadoHelper.bas:357`. Each is module-private, no global collision.

## Slice 2 — Implementation summary

### Task 2.1 — `RebuildNCProyectoListadoCache` full
- File: `src/modules/CacheNCProyecto.bas`
- Replaces the Slice 1 stub with the full algorithm per `tasks.md` Task 2.1.
- Adds two early guards before the transaction:
  1. `EnsureCacheSchemaReadiness(ensureErr)` — creates the cache table if missing.
  2. `IsCacheEnabled()` — AD-4 cache-off guard: returns `True` (no-op) when the kill switch disables the cache. Diverge from the audit-side (which has no flag check) by explicit project convention.
- `p_ForceInvalidation = 0` → `DELETE FROM TbCacheListadoNC` + iterate all non-deleted NCs and call `RegenerarRegistro` per ID.
- `p_ForceInvalidation = 1` → mark cache rows with `CacheValida=False` and iterate all non-deleted NCs; `RegenerarRegistro` is responsible for skip-or-rewrite logic per ID.
- Wrapped in `wrk.BeginTrans` / `wrk.CommitTrans` with `wrk.Rollback` on any `RegenerarRegistro` failure or runtime error.
- Error model: `p_Error` carries the detail; `On Error GoTo EH` for unexpected runtime errors; explicit `GoTo RollbackRebuild` for `RegenerarRegistro` failure.

### Task 2.2 — `RefreshNCProyectoGestionCaches` full
- File: `src/modules/NCProyectoGestionListadoHelper.bas`
- Replaces the Slice 1 stub with the full implementation per `tasks.md` Task 2.2.
- `On Error GoTo errores`; calls `TableExists(NOMBRE_TABLA_LISTADO)`; if missing, calls `LogFallback` and exits cleanly (does NOT raise).
- Calls `RebuildNCProyectoListadoCache(0, p_Error)`. If it returns `False`, raises `Err.Raise 1000` so the handler can produce a controlled error.
- `errores:` handler preserves the `p_Error` from the inner call when the inner error was already a `1000` (re-raise); otherwise wraps `Err.Description` into `p_Error`.

### Task 2.3 — `Entorno.InvalidateCombosCache`
- File: `src/classes/Entorno.cls`
- Inserted as `Public Sub InvalidateCombosCache()` after `Public Property Set ColTipos` (line 2589), before `Public Property Get ColAuditorias` (line 2604).
- Nulifies 6 private collection members per AD-4: no new `Property Let/Get/Set` public — the method is the only public way to reset combos.
- Does NOT touch the audit-side collections (`ColAuditorias`, `ColNCsAuditoria`); those remain on the audit handler's responsibility.

## T6/T7 supersession — rationale

The original `design.md` and `tasks.md` (Tasks 2.4) call for T6 and T7 to validate `InvalidateCombosCache`:
- **T6** — assert that the 6 private vars are `Nothing` after the call.
- **T7** — assert that the next `Property Get` re-initializes the collection (lazy re-init) and the new value reflects post-invalidation source state.

**Why superseded by Slice 3 coverage**:
- VBA does not allow direct access to `Private` class members from a test module. The two practical patterns are:
  1. **Test-only debug accessor** in `Entorno.cls` — exposes a method that returns the 6 var types/names. **Rejected**: pollutes the production class with a test seam and violates AD-4 encapsulation.
  2. **Observable-behavior test** — seed a known source row, populate the collection via `Property Get`, mutate the source, call `InvalidateCombosCache`, call `Property Get` again, and assert the post-invalidation source is reflected. **Practical** but does not assert the vars are `Nothing` — only that the next read works correctly.
- Pattern (2) is the right one and was covered through the Slice 3 no-UI helper seam instead of direct private-member T6/T7 tests.
- T8 in Slice 3 calls the helper seam, which calls `InvalidateCombosCache` and returns observable `EntornoInvalidated=True`; T9 covers the failure path without invalidating. No separate T11 was added.

**Net effect**: Direct T6/T7 tests do not exist and are not claimed. The original T6/T7 intent is closed by T1-T3 GREEN plus Slice 3 T8/T9 no-UI helper-seam coverage.

## TDD Cycle Evidence (Slice 2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 `RebuildNCProyectoListadoCache` | `src/modules/Test_NCProyectoGestionListadoHelper.bas` (T1-T3) | Integration / Access sandbox | Dysflow doctor OK; existing 80-test manifest unaffected; existing tests pass after the audit-side pattern is mirrored | T1-T3 are RED in Slice 1 (stubs return False) | Pending user manual compile + `dysflow.test_vba filter=slice2`; expected GREEN because implementation mirrors `RebuildNCAuditoriaListadoCache` shape | T1 covers cache-off; T2 covers full delete+regen; T3 covers stale-only regen | Kept the divergence from audit-side (kill switch guard) documented in the code comment |
| 2.2 `RefreshNCProyectoGestionCaches` | same (T4, T5) | Integration / Access sandbox | Same as 2.1 | T4-T5 RED in Slice 1 | Pending user compile; T4 (success) and T5 (cache-disabled no-op) expected GREEN | T4 asserts `p_Error=""`; T5 asserts the no-error path through the cache-off guard | Wraps `LogFallback` for missing-table case without raising |
| 2.3 `InvalidateCombosCache` | deferred T6/T7 → T11 in Slice 3 | Class | Singleton Entorno instance; tests must not run in parallel | T6/T7 not yet written | n/a in Slice 2 | Observable-behavior pattern chosen (not internal-state) | Documented AD-4 encapsulation in the source comment |
| 2.4 T1-T3 GREEN | same | Integration | T1/T2/T3 use fixture-first seeded rows + deterministic IDs + reverse-FK teardown | Stub returns False; tests already RED per Slice 1 | Pending user compile + tests | T1 (cache off), T2 (full rebuild), T3 (stale only) cover the 3 algorithmic paths | Cleanup helper `CleanupSlice1` uses bounded ID ranges and the project marker constant |

## Slice 3 — Implementation summary

### Task 3.1 — `Form_FormNCProyectoGestion.ComandoActualizarLista_Click`
- File: `src/forms/Form_FormNCProyectoGestion.cls`
- Replaced the legacy `On Error Resume Next` handler with a thin UI adapter sequence: `Hourglass True` → `PrepareNCProyectoGestionRefresh` → `EstablecerCombos` → `lblEstado.Caption = result("FeedbackCaption")` / `Visible=True` → `ActualizarDatosFiltrados` → `ActualizarLista` → `lblEstado.Visible=False` → single cleanup path with `Hourglass False`.
- Error path preserves a controlled `Err.Raise 1000` after cleanup so T9 can assert refresh failure without a blocking `MsgBox`.

### Related helper/test updates for T4/T5/T8/T9
- File: `src/modules/NCProyectoGestionListadoHelper.bas`
  - Missing `TbCacheListadoNC` now logs fallback **and** populates `p_Error = "TbCacheListadoNC not available"` before raising controlled error `1000`, matching R2/R4/T5/T9 instead of silently succeeding.
- File: `src/modules/Test_NCProyectoGestionListadoHelper.bas`
  - T4 now asserts deterministic fixture cache cardinality after `RefreshNCProyectoGestionCaches`.
  - T5 now drops `TbCacheListadoNC` in sandbox, asserts `p_Error` mentions `TbCacheListadoNC`, and restores schema in cleanup.
  - Replaced T8 with a no-UI helper-seam happy path using deterministic IDs `900681`-`900685`; it asserts result flags plus cache refresh cardinality.
  - Replaced T9 with a no-UI helper-seam refresh-error path; it drops the sandbox cache table and asserts failure flags plus `TbCacheListadoNC` error text. Cleanup restores schema.
- File: `tests/tests.vba.proyecto-gestion-helper.json`
  - Added `slice3` tags to T4/T5 and appended T8/T9 manifest entries.

### Slice 3 no-UI correction — T8/T9 helper seam
- Fresh audit found T8/T9 were invalid for this slice because they used `DoCmd.OpenForm`, `Forms(...)`, actual form controls, and `frm.ComandoActualizarLista_Click`, which can surface Access UI/runtime dialogs in the test runner.
- Added `PrepareNCProyectoGestionRefresh(Optional ByVal p_Entorno As Entorno = Nothing, Optional ByRef p_Error As String) As Scripting.Dictionary` in `src/modules/NCProyectoGestionListadoHelper.bas`.
  - It calls `RefreshNCProyectoGestionCaches`.
  - On success it invalidates the supplied `Entorno`, or safely falls back to `m_ObjEntorno` using separate `Is Nothing` guards.
  - It returns observable values: `Success`, `CacheRefreshed`, `EntornoInvalidated`, `FeedbackCaption`, and `FailedStep`.
- Refactored `Form_FormNCProyectoGestion.ComandoActualizarLista_Click` to call the helper seam and keep only UI adapter work: hourglass/doevents, `EstablecerCombos`, `lblEstado`, list refresh, cleanup/re-raise. No `MsgBox` was added.
- Rewrote T8/T9 in `src/modules/Test_NCProyectoGestionListadoHelper.bas` to call `PrepareNCProyectoGestionRefresh` directly. They no longer use `DoCmd.OpenForm`, `Forms(...)`, form controls, or UI dialogs.
- Updated manifest display names/tags to describe the no-UI helper seam while preserving the existing T8/T9 procedure names.

### Form metadata review
- File reviewed: `src/forms/Form_FormNCProyectoGestion.form.txt`.
- No `.form.txt` edit needed: control `Name ="ComandoActualizarLista"` already has `OnClick ="[Event Procedure]"` (lines 536-538), and `lblEstado` already exists (line 4947). Slice 3 changes are code-behind only.

## TDD Cycle Evidence (Slice 3)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 `ComandoActualizarLista_Click` | `src/modules/Test_NCProyectoGestionListadoHelper.bas` (T8, T9) | No-UI helper seam + form adapter source review | Slice 2 focused verification reported GREEN by user: `filter=slice2` T1-T3 3/3 OK | T8/T9 were corrected after audit found invalid UI coverage | **GREEN** — `dysflow.test_vba filter=slice3` 4/4 OK after user manual compile | T8 covers helper happy path + feedback caption + cache refresh; T9 covers refresh failure flags/error text | Handler delegates orchestration to `PrepareNCProyectoGestionRefresh`; no blocking MsgBox in error path |
| 3.2 T4/T5/T8/T9 GREEN | same | Integration / Access sandbox | T4/T5 existed from Slice 1 RED and were not selected by Slice 2 focused verification | T4/T5 strengthened to deterministic success/error assertions; T8/T9 added | **GREEN** — all 4 tests pass | Success path (T4/T8) and error path (T5/T9) are both covered | Cleanup restores dropped cache schema before closing the test session |

### TDD Cycle Evidence update (Slice 3 no-UI correction)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 no-UI helper seam | `src/modules/Test_NCProyectoGestionListadoHelper.bas` (T8, T9) | No-UI helper seam + Access sandbox | Existing fixture-first T4/T5 plus deterministic T8 fixture IDs; no form/UI dependencies | Fresh audit found previous T8/T9 invalid because they exercised UI and caused runtime dialogs | **GREEN** — `dysflow.test_vba filter=slice3` 4/4 OK after user manual compile; T8/T9 no-UI helper seam passes | T8 covers helper success flags/cache rows; T9 covers missing-table failure flags/error text | Handler became a thin UI adapter over `PrepareNCProyectoGestionRefresh` |
| 3.2 T4/T5/T8/T9 GREEN | same | Integration / Access sandbox, no UI for T8/T9 | No Access operations allowed in this writer task | T8/T9 no-UI correction replaces invalid UI tests | **GREEN** — all 4 tests pass | Success path (T4/T8) and error path (T5/T9) remain covered without UI | Manifest names/tags updated to helper-seam wording |

## Verification performed before this commit

- `git diff --stat` on the 3 modified files: 133 insertions, 3 deletions. Well under the 400-line budget.
- Cross-checked the 6 `Entorno` private member names against `Entorno.cls` declarations (lines 20, 45, 47, 52, 57, 73) — all match.
- Confirmed the `Private Function TableExists` mirror in `NCProyectoGestionListadoHelper.bas` does not collide with other modules (all `TableExists` declarations are `Private`, so module-scoped).
- `git diff --check`: not run on this batch; CRLF normalization is preserved.
- `dysflow.doctor`: not called in this batch; Slice 1 already validated the runtime.
- No `dysflow.compile_vba` was called.
- No Access import/export/compile/test operations were run in the no-UI correction writer pass.
- No tests were run after import; Slice 2 stops at the manual compile gate.
- Blocker follow-up: `RebuildNCProyectoListadoCache` now selects `IDNoConformidad` (not missing `ID`), and the manifest tags only T1-T3 with `slice2` so focused verification no longer selects T4/T5.

## Slice 3 verification evidence (2026-06-12)

- User manually compiled after no-UI helper seam import (VBE → Debug → Compile).
- Orchestrator ran `dysflow.test_vba` with `projectId=00-no-conformidades-staging-clean`, `testsPath=tests/tests.vba.proyecto-gestion-helper.json`, `filter=slice3`.
- Result: **4/4 GREEN**:
  - `Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic` OK
  - `Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic` OK
  - `Test_ProyectoGestionForm_ActualizarLista_SequenceHappyPath_Atomic` OK, value `helper-refresh-happy-path`
  - `Test_ProyectoGestionForm_ActualizarLista_RefreshError_RaiseAndCleanup_Atomic` OK, value `helper-refresh-error`
- Tests are no-UI helper seam tests; no `DoCmd.OpenForm`/`Forms(...)` usage in T8/T9 after correction.
- Manual compile evidence: user compiled in Access VBE before test execution.

## Slice 4 — Implementation summary

### Task 4.1 — `Form_FormNCAuditoriaGestion.ComandoActualizarLista_Click`
- File: `src/forms/Form_FormNCAuditoriaGestion.cls`
- Renamed the audit refresh handler signature from `Private Sub ComandoActualizar_Click()` to `Private Sub ComandoActualizarLista_Click()`.
- Updated the controlled error text to name `ComandoActualizarLista_Click`.
- No behavior inside the handler was otherwise changed.

### Critical review correction — Slice 4 audit rename
- Finding: `Form_FormNCAuditoriaGestion.cls` had `Private Sub ComandoActualizarLista_Click()`, but `.form.txt` still had control `Name ="ComandoActualizar"`, generic `OnClick ="[Event Procedure]"`, and embedded old `Private Sub ComandoActualizar_Click()` / old error text. Access resolves `[Event Procedure]` by `<ControlName>_Click`, so the old artifact could break or reintroduce the handler on form import.
- Chosen strategy: preserve the SDD rename by making the form artifact consistent. Rename the control in `.form.txt` to `ComandoActualizarLista` and update embedded code/error text to `ComandoActualizarLista_Click`.

### Task 4.2 — audit `.form.txt` event mapping and embedded code
- File modified: `src/forms/Form_FormNCAuditoriaGestion.form.txt`.
- Updated control `Name ="ComandoActualizar"` to `Name ="ComandoActualizarLista"` while preserving `OnClick ="[Event Procedure]"`.
- Updated embedded form code from `Private Sub ComandoActualizar_Click()` and old error text to `ComandoActualizarLista_Click`.

### Task 4.3 — T10 source-inspection test strengthened
- File: `src/modules/Test_NCProyectoGestionListadoHelper.bas`
- `Test_AuditGestionForm_RenameHandler_NoRegression_Atomic` now reads the exported audit `.cls`/`.form.txt` artifacts from `CurrentProject.Path\src`, asserts the old handler/error string is gone from both artifacts, asserts the renamed handler/error string exists in both artifacts, verifies the `.form.txt` renamed control has nearby `OnClick ="[Event Procedure]"`, and checks that the prior audit regression marker `Test_AuditListadoHelper_CacheOn_SourceContract_RED` still exists in `Test_NCAuditoriaGestionListadoHelper.bas`.
- File: `tests/tests.vba.proyecto-gestion-helper.json`
- No manifest update needed for this correction; existing T10 entry remains the target for `filter=slice4`.
- Runtime verification has been refreshed after this correction; T10 remained no-UI source inspection.

## TDD Cycle Evidence (Slice 4)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 audit handler rename | `src/modules/Test_NCProyectoGestionListadoHelper.bas` (T10) | No-UI source inspection | Source artifacts only; no form open/UI automation; no backend writes | Existing source had `ComandoActualizar_Click`; T10 would fail before rename | **GREEN** — `filter=slice4` 1/1 after import + user manual compile; value `audit-rename-source-contract` | T10 checks old symbol absent and new symbol present in both `.cls` and `.form.txt` | Runtime rerun completed after import + user manual compile |
| 4.2 `.form.txt` mapping | same | Exported form metadata inspection | `Name ="ComandoActualizarLista"` with nearby `OnClick ="[Event Procedure]"` | Prior T10 missed stale embedded form code and control name | **GREEN** — covered by refreshed T10 source-inspection contract | Protects against stale form import reintroducing `ComandoActualizar_Click` | `.form.txt` changed and refreshed focused verification passed |

## Verification performed before this handoff (Slice 4 source-only pass)

- Updated `src/forms/Form_FormNCAuditoriaGestion.form.txt`: control renamed to `Name ="ComandoActualizarLista"`; embedded handler/error text now use `ComandoActualizarLista_Click`; nearby `OnClick ="[Event Procedure]"` preserved.
- No Access import/export/compile/test operations were run, per user instruction.
- No `dysflow.compile_vba` was called.
- No commit was created.

## Slice 4 verification evidence (2026-06-12) — stale after critical review fix

- User manually compiled in Access VBE after Slice 4 import.
- Orchestrator ran `dysflow.test_vba` with `projectId=00-no-conformidades-staging-clean`, `testsPath=tests/tests.vba.proyecto-gestion-helper.json`, `filter=slice4`.
- Prior result before the critical `.form.txt` correction: **1/1 GREEN**:
  - `Test_AuditGestionForm_RenameHandler_NoRegression_Atomic` OK, value `audit-rename-source-contract`.
- Test logs confirm it inspected exported audit form `.cls`/`.form.txt` artifacts without opening UI.
- This evidence is no longer sufficient for closeout because T10 and `.form.txt` changed after the run.

## Slice 4 verification evidence refresh (2026-06-12) — after critical binding fix

- User manually compiled in Access VBE after the critical binding fix import.
- Orchestrator reran `dysflow.test_vba` with `projectId=00-no-conformidades-staging-clean`, `testsPath=tests/tests.vba.proyecto-gestion-helper.json`, `filter=slice4`.
- Result: **1/1 GREEN**:
  - `Test_AuditGestionForm_RenameHandler_NoRegression_Atomic` OK, value `audit-rename-source-contract`.
- No UI was opened by the focused Slice 4 test.
- This artifact-only refresh did not run Access import/export/compile/test operations.

## Artifact status after implementation commit

1. Implementation commit `b2eb8a1` now records the Slice 2 blocker fixes, Slice 3 no-UI helper seam, Slice 4 audit binding fix, focused tests, and Access import/user manual compile evidence.
2. Preserve the note that T6/T7 direct tests were superseded, not implemented as named tests.
3. Do not claim a full manifest run from the focused Slice 4 refresh.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `356f185` | Slice 1: helpers RED | T1-T5 RED stubs | `dysflow.test_vba filter=slice1` not yet run (RED) | pending import + manual compile |
| `4849cf8` | Slice 2 feat: implement rebuild/refresh/invalidate (Tasks 2.1-2.3) | T1-T3 expected GREEN; T6/T7 deferred | `dysflow.test_vba filter=slice2` pending user compile | import `CacheNCProyecto`, `NCProyectoGestionListadoHelper`, `Entorno`, `Test_NCProyectoGestionListadoHelper` + manual compile |
| `b85ebab` | docs: add change artifacts + apply-progress (Slice 2) | n/a (planning) | n/a | n/a |
| `38a8e9b` | docs: anchor apply-progress to real SHAs + T6/T7 deferral note | n/a (documentation) | n/a | n/a |
| `b2eb8a1` | Slice 2 blocker fixes + Slice 3 handler/no-UI helper seam + Slice 4 audit binding fix | T1-T5, T8-T10; T6/T7 intent superseded by observable no-UI coverage | `dysflow.test_vba testsPath=tests/tests.vba.proyecto-gestion-helper.json filter=slice2` — 3/3 GREEN; `filter=slice3` — 4/4 GREEN; `filter=slice4` — T10 GREEN after user manual compiles; no full manifest run claimed | imported `CacheNCProyecto`, `NCProyectoGestionListadoHelper`, `Form_FormNCProyectoGestion`, `Form_FormNCAuditoriaGestion`, `Test_NCProyectoGestionListadoHelper`; user manually compiled in Access VBE |

### Note on commit message accuracy

`4849cf8` body says "Tests: slice2 (T1-T3, T6-T7) should turn GREEN after manual compile." The T6/T7 mention is forward-looking and slightly inaccurate because T6/T7 were never written. The actual deferral is captured in this `apply-progress.md` (see "T6/T7 deferral — rationale" above). T1-T3 will turn GREEN as expected once the user compiles and runs `dysflow.test_vba filter=slice2`. The discrepancy is acknowledged but not amended; the project rule is "no amend", and the truth lives in this artifact.
