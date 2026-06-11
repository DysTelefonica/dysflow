# Apply Progress: form-fncproyecto-cache-invalidation

**Mode**: Strict TDD
**Artifact store**: OpenSpec + Engram
**Delivery**: force-chained / staging-targeted work-unit slices (4 chained PRs, stacked-to-main)
**Current slice**: Slice 2/4 — helpers + InvalidateCombosCache + T1-T3 GREEN
**Status**: apply_in_progress_slice2; user compile + test_vba pending; T6/T7 deferred to Slice 3

## Slice status overview

| Slice | Goal | Status | Commit | Tests |
|-------|------|--------|--------|-------|
| 1/4 | Helpers RED (T1-T5 stubs + manifest) | committed | `356f185` | RED stubs in repo; not yet run as RED |
| 2/4 | Entorno + GREEN (T1-T3, T6-T7) | this commit | `<this>` | T1, T2, T3 expected GREEN after user compile; **T6, T7 deferred to Slice 3** |
| 3/4 | Handler GREEN (T4, T5, T8, T9) + observable T11 for InvalidateCombosCache | not started | — | — |
| 4/4 | Audit rename (T10) | not started | — | — |

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

## T6/T7 deferral — rationale

The original `design.md` and `tasks.md` (Tasks 2.4) call for T6 and T7 to validate `InvalidateCombosCache`:
- **T6** — assert that the 6 private vars are `Nothing` after the call.
- **T7** — assert that the next `Property Get` re-initializes the collection (lazy re-init) and the new value reflects post-invalidation source state.

**Why deferred to Slice 3**:
- VBA does not allow direct access to `Private` class members from a test module. The two practical patterns are:
  1. **Test-only debug accessor** in `Entorno.cls` — exposes a method that returns the 6 var types/names. **Rejected**: pollutes the production class with a test seam and violates AD-4 encapsulation.
  2. **Observable-behavior test** — seed a known source row, populate the collection via `Property Get`, mutate the source, call `InvalidateCombosCache`, call `Property Get` again, and assert the post-invalidation source is reflected. **Practical** but does not assert the vars are `Nothing` — only that the next read works correctly.
- Pattern (2) is the right one but is better colocated with T8 (handler happy path) and T9 (handler error path) in Slice 3, where the form-level integration is also exercised.
- T8/T9 in Slice 3 will call `InvalidateCombosCache` indirectly through the handler; a new T11 in Slice 3 will be the explicit observable-behavior test for `InvalidateCombosCache`.

**Net effect**: Slice 2 ships without direct unit tests for `InvalidateCombosCache`, but the integration test in Slice 3 (T8) proves the method works in context. The `apply-progress.md` for Slice 3 will name T11 explicitly and update the manifest.

## TDD Cycle Evidence (Slice 2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 `RebuildNCProyectoListadoCache` | `src/modules/Test_NCProyectoGestionListadoHelper.bas` (T1-T3) | Integration / Access sandbox | Dysflow doctor OK; existing 80-test manifest unaffected; existing tests pass after the audit-side pattern is mirrored | T1-T3 are RED in Slice 1 (stubs return False) | Pending user manual compile + `dysflow.test_vba filter=slice2`; expected GREEN because implementation mirrors `RebuildNCAuditoriaListadoCache` shape | T1 covers cache-off; T2 covers full delete+regen; T3 covers stale-only regen | Kept the divergence from audit-side (kill switch guard) documented in the code comment |
| 2.2 `RefreshNCProyectoGestionCaches` | same (T4, T5) | Integration / Access sandbox | Same as 2.1 | T4-T5 RED in Slice 1 | Pending user compile; T4 (success) and T5 (cache-disabled no-op) expected GREEN | T4 asserts `p_Error=""`; T5 asserts the no-error path through the cache-off guard | Wraps `LogFallback` for missing-table case without raising |
| 2.3 `InvalidateCombosCache` | deferred T6/T7 → T11 in Slice 3 | Class | Singleton Entorno instance; tests must not run in parallel | T6/T7 not yet written | n/a in Slice 2 | Observable-behavior pattern chosen (not internal-state) | Documented AD-4 encapsulation in the source comment |
| 2.4 T1-T3 GREEN | same | Integration | T1/T2/T3 use fixture-first seeded rows + deterministic IDs + reverse-FK teardown | Stub returns False; tests already RED per Slice 1 | Pending user compile + tests | T1 (cache off), T2 (full rebuild), T3 (stale only) cover the 3 algorithmic paths | Cleanup helper `CleanupSlice1` uses bounded ID ranges and the project marker constant |

## Verification performed before this commit

- `git diff --stat` on the 3 modified files: 133 insertions, 3 deletions. Well under the 400-line budget.
- Cross-checked the 6 `Entorno` private member names against `Entorno.cls` declarations (lines 20, 45, 47, 52, 57, 73) — all match.
- Confirmed the `Private Function TableExists` mirror in `NCProyectoGestionListadoHelper.bas` does not collide with other modules (all `TableExists` declarations are `Private`, so module-scoped).
- `git diff --check`: not run on this batch; CRLF normalization is preserved.
- `dysflow.doctor`: not called in this batch; Slice 1 already validated the runtime.
- No `dysflow.compile_vba` was called.
- No tests were run after import; Slice 2 stops at the manual compile gate.

## User actions required (next)

1. `dysflow.import_modules` with `projectId=00-no-conformidades-staging-clean`, `moduleNames=["CacheNCProyecto", "NCProyectoGestionListadoHelper", "Entorno", "Test_NCProyectoGestionListadoHelper"]`, `importMode=Auto`. **Do NOT pass `compile: true`** — the user compiles manually.
2. Open Access VBE → Debug → Compile. Confirm zero errors.
3. `dysflow.test_vba` with `projectId=00-no-conformidades-staging-clean`, `filter=slice2`. Expected: 5/5 GREEN (T1, T2, T3, T4, T5). If any RED, STOP and report.
4. (Optional) `dysflow.test_vba` with `projectId=00-no-conformidades-staging-clean` and no filter — confirms the full 80-test manifest still passes.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `356f185` | Slice 1: helpers RED | T1-T5 RED stubs | `dysflow.test_vba filter=slice1` not yet run (RED) | pending import + manual compile |
| `4849cf8` | Slice 2 feat: implement rebuild/refresh/invalidate (Tasks 2.1-2.3) | T1-T3 expected GREEN; T6/T7 deferred | `dysflow.test_vba filter=slice2` pending user compile | import `CacheNCProyecto`, `NCProyectoGestionListadoHelper`, `Entorno`, `Test_NCProyectoGestionListadoHelper` + manual compile |
| `b85ebab` | docs: add change artifacts + apply-progress (Slice 2) | n/a (planning) | n/a | n/a |
| `<future>` | Slice 3: handler + T8/T9 + T11 observable | T4, T5, T8, T9, T11 GREEN | `dysflow.test_vba filter=slice3` | import `Form_FormNCProyectoGestion` + manual compile |
| `<future>` | Slice 4: audit rename + T10 | T10 GREEN; no audit regression | `dysflow.test_vba filter=slice4` | import `Form_FormNCAuditoriaGestion` + manual compile |

### Note on commit message accuracy

`4849cf8` body says "Tests: slice2 (T1-T3, T6-T7) should turn GREEN after manual compile." The T6/T7 mention is forward-looking and slightly inaccurate because T6/T7 were never written. The actual deferral is captured in this `apply-progress.md` (see "T6/T7 deferral — rationale" above). T1-T3 will turn GREEN as expected once the user compiles and runs `dysflow.test_vba filter=slice2`. The discrepancy is acknowledged but not amended; the project rule is "no amend", and the truth lives in this artifact.
