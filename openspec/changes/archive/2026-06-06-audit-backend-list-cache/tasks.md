# Tasks: Audit Backend List Cache

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650-900 total; each slice 150-300 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 schema/tests -> PR2 reader/fallback -> PR3 rebuild/invalidation -> PR4 verification/trace |
| Delivery strategy | force-chained |
| Chain strategy | feature-branch-chain / stacked-to-staging |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend schema contract and RED tests | PR1 base = feature/tracker branch from `staging` | Dysflow DDL targets `NoConformidades_Datos.accdb` only. |
| 2 | Positive cache reader and fallback telemetry | PR2 base = PR1 branch | Helper owns cache decision; form remains adapter. |
| 3 | Rebuild/upsert/invalidation seams | PR3 base = PR2 branch | Fixture graph in FK order; teardown reverse. |
| 4 | Focused verification and traceability | PR4 base = PR3 branch | Import, user manual compile, tests, commit table. |

Exact verification commands/manifests: `dysflow_doctor(projectId="00-no-conformidades-staging-clean")`; guarded DDL dry-run/apply with `dysflow_exec_sql(projectId="00-no-conformidades-staging-clean", backendPath="NoConformidades_Datos.accdb", allowTable="TbCacheListadoNCAuditoria", dryRun=true/false)`; schema read `dysflow_get_schema(..., backendPath="NoConformidades_Datos.accdb", table="TbCacheListadoNCAuditoria")`; import only changed modules with `dysflow_import_modules(projectId="00-no-conformidades-staging-clean", moduleNames=[...], compile=false)`, then STOP for manual VBE Debug -> Compile; after user confirmation run `dysflow_test_vba(projectId="00-no-conformidades-staging-clean", testsPath="tests/tests.vba.audit-gestion-helper.json", filter="audit-backend-list-cache")`. Never call `compile_vba`.

## Phase 1: Schema-first RED slice

- [x] 1.1 Inspect real backend schemas/relationships for `TbAuditorias`, `TbNoConformidadesAuditoria`, audit AC/AR, `TbLogCache`, and `TbCacheListadoNC`; record required fields/types in test comments.
- [x] 1.2 Add failing tests in `src/modules/Test_NCAuditoriaGestionListadoHelper.bas` for backend-only table existence, idempotence, required columns, Text(25), LongText, and unique `ID` index.
- [x] 1.3 Add focused procedures to `tests/tests.vba.audit-gestion-helper.json` for the schema/backend contract.
- [x] 1.4 Create guarded backend DDL migration/manifest for `TbCacheListadoNCAuditoria`; dry-run first, apply only to backend/sandbox, never frontend.
- [x] 1.5 Create `src/modules/NCAuditoriaListadoCache.bas` with `EnsureNCAuditoriaListadoCacheSchema` using DAO/getdb(), additive columns, and non-destructive indexes.

## Phase 2: Cache reader GREEN slice

- [x] 2.1 Add fixture-first RED tests for valid cache hit, disabled/no-row fallback, concrete cardinality, and `FormAuditCacheFallback` telemetry.
- [x] 2.2 Implement `TryReadNCAuditoriaListadoCache(...) As Collection` in `src/modules/NCAuditoriaListadoCache.bas` filtering only `CacheValida=True` rows.
- [x] 2.3 Modify `src/modules/NCAuditoriaGestionListadoHelper.bas` to call the cache reader before the existing fallback path and preserve current row contract.
- [x] 2.4 Review `src/forms/Form_FormNCAuditoriaGestion.cls`; keep changes minimal and ensure no SQL/schema/cache decisions enter the form.

## Phase 3: Rebuild, parity, and invalidation slice

- [x] 3.1 Add deterministic sandbox fixtures in FK order: `TbAuditorias` -> `TbNoConformidadesAuditoria` -> audit AC -> audit AR -> cache rows; teardown reverse by test markers only.
- [x] 3.2 Add tests proving keyword parity over `Descripcion`, `CAUSARAIZ`, `AccionesCorrectivasConcatenadas`, and `AccionesRealizadasConcatenadas`.
- [x] 3.3 Implement `UpsertListadoItem`, `RebuildNCAuditoriaListadoCache`, `InvalidateNCAuditoriaListadoCacheItem`, and `InvalidateNCAuditoriaListadoCacheAll` in the audit cache module.
- [x] 3.4 Wire only narrow refresh/mutation seams needed by existing audit NC/AC/AR flows; avoid broad form rewrites.

## Phase 4: Sync, verification, and traceability

- [x] 4.1 Import changed VBA modules via Dysflow, notify user to compile manually in Access VBE, and wait before running tests.
- [x] 4.2 Run focused audit helper manifest after compile confirmation; capture schema reads, fallback logs, and test JSON results.
- [x] 4.3 Update this file with completed task checks and implementation commits.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `e119189` | `feat(cache): add audit backend list cache schema` | 1.1-1.5 | Backend schema inspection; guarded DDL dry-run/apply; schema contract tests PASS 7/7 after manual compile | Imported `Test_NCAuditoriaGestionListadoHelper`, `NCAuditoriaListadoCache`; manual compile confirmed |
| `31977af` | `feat(cache): read valid audit list cache` | 2.1-2.4 | Focused audit helper manifest PASS 9/9 after manual compile; fresh review PASS after `Estado='Abiertas'` fix | Imported `Test_NCAuditoriaGestionListadoHelper`, `NCAuditoriaListadoCache`, `NCAuditoriaGestionListadoHelper`; manual compile confirmed |
| `7e27db8` | `feat(cache): rebuild audit list cache` | 3.1-3.4, 4.1-4.3 | `tests/tests.vba.audit-gestion-helper.json` PASS 11/11 after manual compile; fresh review PASS_WITH_WARNINGS with no blockers | Imported `NCAuditoriaListadoCache`; manual compile confirmed |
| `3c4692f` | `fix(cache): use workspace transaction for audit rebuild` | 3.3, 4.1-4.2 | Manual VBE compile caught `db.BeginTrans`; fixed to `DBEngine.Workspaces(0)` transactions; manifest PASS 11/11 after manual compile | Imported `NCAuditoriaListadoCache`; manual compile confirmed |
