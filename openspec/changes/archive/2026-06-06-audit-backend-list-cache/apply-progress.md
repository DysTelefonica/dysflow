# Apply Progress: audit-backend-list-cache

## Slice 1 — Backend schema contract

Completed Phase 1 tasks 1.1-1.5 only. See repo-local mirror for the same status.

### Evidence

- Dysflow backend schema inspection completed for audit parent/child/cache/log tables and relationships.
- Guarded backend DDL dry-run/apply completed for `TbCacheListadoNCAuditoria`; frontend was not used as the write target.
- Commit `e119189` records the schema slice.
- Changed modules imported with `compile=false`; user manually compiled in Access VBE; schema tests passed.

### TDD Cycle Evidence

| Task | Test File | RED | GREEN |
|---|---|---|---|
| 1.1-1.3 | `src/modules/Test_NCAuditoriaGestionListadoHelper.bas`, `tests/tests.vba.audit-gestion-helper.json` | Schema contract tests/procedures added first | PASS after manual compile |
| 1.4 | `database/audit_backend_list_cache_schema.sql` | DDL manifest dry-run first | Backend apply + schema read confirmed |
| 1.5 | `src/modules/NCAuditoriaListadoCache.bas` | Tests referenced missing `EnsureNCAuditoriaListadoCacheSchema` first | Imported, manual compile confirmed, tests passed |

## Slice 2 — Cache reader and fallback telemetry

Completed Phase 2 tasks 2.1-2.4 only. See repo-local mirror for the same detailed status.

### Evidence

- Baseline safety net before edits: focused Dysflow test filter `audit-backend-list-cache` PASS 2/2 for existing schema contract procedures.
- Added fixture-first Phase 2 tests for valid cache hit, `CacheValida=False` exclusion, no-valid-cache fallback, concrete cardinality, and exactly one `FormAuditCacheFallback` telemetry row.
- Implemented backend-only `TryReadNCAuditoriaListadoCache(...) As Collection` in `NCAuditoriaListadoCache.bas` and wired `NCAuditoriaGestionListadoHelper.bas` to use it before fallback.
- Reviewed `Form_FormNCAuditoriaGestion.cls`; no form source change was needed and no SQL/schema/cache decision was added to the form.
- Commit `31977af` records the cache reader/fallback slice.

### TDD Cycle Evidence

| Task | Test File | RED | GREEN |
|---|---|---|---|
| 2.1 | `src/modules/Test_NCAuditoriaGestionListadoHelper.bas`, `tests/tests.vba.audit-gestion-helper.json` | Phase 2 fixture-first tests added before reader/helper code | PASS 9/9 after manual compile |
| 2.2 | `src/modules/NCAuditoriaListadoCache.bas` | Tests referenced missing positive reader behavior first | Imported, manual compile confirmed, tests passed |
| 2.3 | `src/modules/NCAuditoriaGestionListadoHelper.bas` | Helper tests expected cache-first and observable fallback | Imported, manual compile confirmed, tests passed |
| 2.4 | `src/forms/Form_FormNCAuditoriaGestion.cls` | Source review confirmed no form change needed | N/A: no form import |

### Status

Changed modules imported with `compile=false`; user manually compiled in Access VBE; focused audit helper manifest passed 9/9.

## Slice 3 — Rebuild, parity, and invalidation seams

Completed Phase 3 tasks 3.1-3.4 only. See repo-local mirror for the same detailed status.

### Evidence

- Baseline safety net before edits: focused Dysflow test filter `audit-backend-list-cache` PASS 4/4 for existing Slice 1-2 audit backend cache procedures.
- Added fixture-first Phase 3 tests with deterministic FK order: `TbAuditorias` -> `TbNoConformidadesAuditoria` -> audit AC -> audit AR -> cache rows; teardown deletes only deterministic test IDs in reverse order.
- Added keyword parity coverage over `Descripcion`, `CAUSARAIZ`, `AccionesCorrectivasConcatenadas`, and `AccionesRealizadasConcatenadas`.
- Implemented DAO/getdb() rebuild, upsert, item invalidation, and audit/all invalidation seams in `NCAuditoriaListadoCache.bas`.
- Wired only the existing helper refresh seam; no form source change was needed.
- Fresh review initially failed on partial shared-cache rebuild risk and zero-length LongText writes; fixed with transactional rebuild and `NullIfEmptyText` normalization.
- Commit `7e27db8` records the rebuild/invalidation slice.
- Manual VBE compile then caught that DAO transactions must use `Workspace`, not `Database`; commit `3c4692f` changed the rebuild transaction to `DBEngine.Workspaces(0).BeginTrans/CommitTrans/Rollback`.
- Changed modules imported with `compile=false`; user manually compiled in Access VBE; focused audit helper manifest passed 11/11.

### TDD Cycle Evidence

| Task | Test File | RED | GREEN |
|---|---|---|---|
| 3.1-3.2 | `src/modules/Test_NCAuditoriaGestionListadoHelper.bas`, `tests/tests.vba.audit-gestion-helper.json` | Phase 3 fixture-first parity tests added before rebuild/upsert code | PASS 11/11 after manual compile |
| 3.3 | `src/modules/NCAuditoriaListadoCache.bas` | Tests referenced missing rebuild/upsert/invalidation functions first | Transactional rebuild + Null normalization implemented; tests passed |
| 3.4 | `src/modules/NCAuditoriaGestionListadoHelper.bas` | Refresh seam behavior kept in helper, form unchanged | Imported earlier; no form change; tests passed |

### Compile Correction Evidence

- User manual Access VBE compile failed on `db.BeginTrans` because DAO transactions are exposed on `Workspace`.
- Fixed in `3c4692f`; re-imported `NCAuditoriaListadoCache`; user manually compiled successfully; `tests/tests.vba.audit-gestion-helper.json` passed 11/11.

### Review Evidence

- Fresh review `old-pink-blackbird`: FAIL; blockers were non-transactional shared cache rebuild and inconsistent empty text/memo writes.
- Fresh review `scientific-blue-antlion`: PASS_WITH_WARNINGS; no blockers after transaction and Null normalization fixes. Non-blocking warning: `IIf` style for `Cerrada` is not the unsafe `Nothing`/property-access case.
