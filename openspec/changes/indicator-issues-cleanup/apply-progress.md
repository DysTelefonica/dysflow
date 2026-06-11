# Apply Progress: indicator-issues-cleanup

**Mode**: Strict TDD
**Artifact store**: OpenSpec + Engram
**Delivery**: force-chained / staging-targeted work-unit slices
**Current slice**: Phase 2 implementation evidence refresh; Phase 3/runtime hooks still pending
**Status**: apply_in_progress; archive_blocked_pending_tasks_and_verify_report

## Previously completed progress preserved

- Earlier issue #18 cache evidence work existed in Engram for an obsolete/session-memory interpretation: telemetry helper, Proyecto startup/cache evidence, fast Proyecto summary counts, and issue #16 UI progress work.
- The current clarified SDD supersedes the session-memory/counts-only interpretation with a shared backend materialized cache covering Proyecto and Auditoria detail rows.

## Schema evidence

- Dysflow doctor passed for `projectId=00-no-conformidades-staging-clean`: `access-db-path` and `access-open` OK.
- Backend tables inspected in `NoConformidades_Datos.accdb`: `TbCacheIndicadoresProyectoHeader`, `TbCacheIndicadoresProyectoDetalle`, `TbNoConformidades`, `TbNCAccionCorrectivas`, `TbNCAccionesRealizadas`, `TbReplanificacionesProyecto`, `TbAuditorias`, `TbNoConformidadesAuditoria`, `TbNCAuditoriaAccionCorrectivas`, `TbNCAuditoriaAccionesRealizadas`, `TbReplanificacionesAuditoria`.
- Relationships inspected: Proyecto `TbNoConformidades -> TbNCAccionCorrectivas -> TbNCAccionesRealizadas -> TbReplanificacionesProyecto`; Auditoria `TbAuditorias -> TbNoConformidadesAuditoria -> TbNCAuditoriaAccionCorrectivas -> TbNCAuditoriaAccionesRealizadas` plus `TbReplanificacionesAuditoria` task/replanification source.
- Existing cache tables are present but insufficient for the clarified contract: no dedicated `TbCacheIndicadoresConfig`, no explicit `Dominio` marker, no `IDCacheConfig`, no `IDTarea`, no `ClaveEntidad`, no `ResponsableUsuarioRed`, no detail display fields, no per-NC sync metadata, and no domain-first indexes.

## Work completed in this batch

- Updated `database/issue18_backend_indicator_cache.sql` to define `TbCacheIndicadoresConfig`, explicit domain/config/header/detail fields, affected `IDNoConformidad`, AC/AR/task entity IDs, display/detail fields, sync metadata, and domain-first indexes.
- Added RED schema tests in `src/modules/Test_IndicadoresCaracterizacion.bas`:
  - `Test_Issue18_BackendCacheSchema_DomainFields_Atomic`
  - `Test_Issue18_BackendCacheSchema_Indexes_Atomic`
- Added RED fixture tests in `src/modules/Test_IndicadoresCaracterizacion.bas` using `TestHelper.BeginTestSession`, sandbox `getdb()`, deterministic IDs, exact row cardinality, and existing teardown helpers:
  - `Test_Issue18_ProyectoFixture_SeedsSandboxSourceRows_Atomic`
  - `Test_Issue18_AuditoriaFixture_SeedsSandboxSourceRows_Atomic`
- Registered the four RED atomic tests in `tests/tests.vba.json` with tags `indicator-cache`, `issue-18`, `red`, and `wu1`.
- Updated `openspec/config.yaml` main manifest count from 66 to 70.
- Marked tasks 1.1-1.4 complete in `tasks.md`.

## RED intent

- The schema tests are expected to fail until the backend DDL/migration is applied because the current backend lacks the new config table, domain fields, and domain-first indexes.
- The fixture tests prove deterministic Proyecto and Auditoria source rows can be seeded in the sandbox, then intentionally fail on the missing shared backend cache DDL required before later sync/read tests can be trusted.
- No UI/form automation was added.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 Schema inspection | `src/modules/Test_IndicadoresCaracterizacion.bas` | Integration / Access schema | Dysflow doctor OK; existing tests not run because this slice stops at manual compile gate | Source/cache schema inspected before fixture design | N/A - inspection task | Proyecto and Auditoria source schemas inspected | Evidence recorded in this artifact |
| 1.2 DDL update | `database/issue18_backend_indicator_cache.sql` | Schema artifact | `git diff --check` OK | DDL expectations captured by RED schema tests before migration | Pending later backend migration | Config/header/detail/index coverage added | Kept legacy table names to reduce churn |
| 1.3 RED schema tests | `src/modules/Test_IndicadoresCaracterizacion.bas` | Integration / Access schema | Not executed after import by policy | Two JSON-returning tests assert required tables/fields/indexes | Pending user manual compile and RED run | Field test plus index test cover separate failure modes | DAO `TableDef`/`Index` inspection avoids `MSys*` query fragility |
| 1.4 RED fixture tests | `src/modules/Test_IndicadoresCaracterizacion.bas` | Integration / Access sandbox | Not executed after import by policy | Two JSON-returning tests seed Proyecto/Auditoria source rows deterministically and then require missing cache DDL | Pending user manual compile and RED run | Proyecto and Auditoria fixture shapes are separate | Reused existing deterministic cleanup/seed helpers |

## Verification performed before import

- `dysflow.doctor` with `projectId=00-no-conformidades-staging-clean`: OK.
- `tests/tests.vba.json` parsed successfully: 70 tests.
- `git diff --check`: no whitespace errors; Git emitted CRLF normalization warnings only.
- No `dysflow.compile_vba` was called.
- No tests were run after import; final RED execution is pending user manual compile.

## RED execution evidence (post manual compile)

- User confirmed manual compile in Access VBE was completed.
- `dysflow.test_vba` with `projectId=00-no-conformidades-staging-clean`, `testsPath=tests/tests.vba.json`, `filter=issue-18` executed on 2026-06-07 after the manual compile gate.
- Result: 4/4 RED tests failed for the right reason; 4 pre-existing `cache-sync` tests for issue #18 remained GREEN (no regression on existing cache behavior).
  - `Test_Issue18_BackendCacheSchema_DomainFields_Atomic` -> FAIL: `Missing required schema for issue #18: TbCacheIndicadoresConfig.IDCacheConfig - No se encontr\u00F3 el elemento en esta colecci\u00F3n.` (2703 ms)
  - `Test_Issue18_BackendCacheSchema_Indexes_Atomic` -> FAIL: `Missing required index for issue #18: TbCacheIndicadoresConfig.UX_TbCacheIndicadoresConfig_Dominio - No se encontr\u00F3 el elemento en esta colecci\u00F3n.` (2450 ms)
  - `Test_Issue18_ProyectoFixture_SeedsSandboxSourceRows_Atomic` -> FAIL: `RED: Proyecto cache fixture requires issue #18 cache DDL before sync/read tests` after seeding NC=992001, AC=992011, AR=992021 and FK-clean teardown (2912 ms)
  - `Test_Issue18_AuditoriaFixture_SeedsSandboxSourceRows_Atomic` -> FAIL: `RED: Auditoria cache fixture requires issue #18 cache DDL before sync/read tests` after seeding Auditoria=992201, NC=992202, AC=992211, AR=992221 and FK-clean teardown (2497 ms)
- All four tests reported the same root cause: backend lacks `TbCacheIndicadoresConfig` and the domain-first index. Fixture Arrange/Act reached the schema assertion exactly as designed, then Teardown deleted seeded rows in reverse FK order.
- Pre-existing cache-sync issue #18 tests remained GREEN: `Test_Cache_Proyecto_Delegacion_Y_Reset_Atomic`, `Test_Cache_InvalidarTodo_SeparaProyectosYAuditorias_Atomic`, `Test_Cache_InvalidacionSelectiva_Atomic`, `Test_Cache_ConsistenciaConEntorno_Atomic`.
- Strict TDD RED phase is now closed: the failing tests are the safety net that will validate Phase 2 backend DDL/migration and the downstream sync/read API work.

## Phase 2 partial attempt and recovery

- `database/issue18_migration_v1.sql` was prepared as the reference migration script (CREATE new Config table + CREATE UNIQUE INDEX + 17 ALTER TABLE ADD COLUMN).
- `dysflow.run_script` with `apply=true` on `C:\00repos\datos\NoConformidades_Datos.accdb` (sandbox) was attempted; the Dysflow runner only executed the first statement and silently dropped the rest.
- Result of partial apply: `TbCacheIndicadoresConfig` was created correctly (NOT NULL -> Required=true), but the `UX_TbCacheIndicadoresConfig_Dominio` index and 7 additional indexes were NOT created.
- Recovery step: each of the 17 ALTER TABLE statements was re-issued individually via `dysflow.exec_sql` `apply=true`. Columns were added with the default `Required=false` (Access ACE DDL for ADD COLUMN has no NOT NULL clause honoring without DEFAULT for non-empty tables).
- Re-running the 4 RED tests after the partial apply still FAILED, but with a tighter error contract:
  - Schema tests: `Expected required field: TbCacheIndicadoresProyectoHeader.IDCacheConfig` (and `Dominio`).
  - Index test: `Missing required index for issue #18: TbCacheIndicadoresConfig.UX_TbCacheIndicadoresConfig_Dominio`.
  - Fixture tests: same required-field error after passing the schema inspection step.
- Root cause: `ALTER TABLE ... ADD COLUMN` in Access ACE DDL cannot set `Required=true` on a column in an existing table without going through DAO. A VBA migration helper is required to:
  1. Set `Required=true` on the already-added `IDCacheConfig` and `Dominio` columns.
  2. Create the 8 indexes the test contract demands (1 UX on Config, 1 UX on Header, 6 IX on Detalle).
  3. Be reusable for production backends (the user explicitly requested this).

## Phase 2 migration helper

- New module: `src/modules/ModuloMigracionIssue18.bas` (created 2026-06-07, imported via Dysflow MCP with `projectId=00-no-conformidades-staging-clean`, `compile=false`).
- Public surface:
  - `MigracionIssue18_DryRun([backendPath], [backendPassword])` -> JSON describing pending changes without applying.
  - `MigracionIssue18_Aplicar([backendPath], [backendPassword])` -> JSON with applied changes (idempotent).
  - `MigracionIssue18_Estado([backendPath], [backendPassword])` -> JSON status only.
- Modes: sandbox (default via `TestHelper.BeginTestSession` and `m_TestingMode`) or production (explicit path/password with `\\datoste\` guard).
- Steps: ensure `TbCacheIndicadoresConfig` table + PK, add 4 Config fields, fix/add 7 Header fields, fix/add 10 Detalle fields, create 8 indexes.
- Returns JSON with `mode`, `migration`, `version`, `changeCount`, `changes[]` (kind/table/object/detail), `logs[]`, `value`.
- Hard rules: idempotent, non-destructive, preserves PKs and data, validates index field list + unique flag, drops+recreates indexes whose field list does not match the contract.
- Manual compile gate pending: user must compile in Access VBE -> Debug -> Compile before any `dysflow.run_vba` invocation.

## Phase 2 GREEN transition

- After user manual compile of `ModuloMigracionIssue18`, the helper was imported twice (initial + index-validation update). No `dysflow.compile_vba` was called.
- `MigracionIssue18_DryRun()` -> changeCount=9 (4 field_required_fixed + 5 index_created).
- `MigracionIssue18_Aplicar()` (first run) -> changeCount=9, all changes applied. Re-run of RED tests: 3/4 NEW tests GREEN; 1 FAIL with `Index IX_TbCacheIndicadoresProyectoDetalle_CacheBucketResponsable expected field 1=Dominio; actual=IDCacheIndicadorProyecto`.
- Root cause for residual failure: pre-existing index `IX_TbCacheIndicadoresProyectoDetalle_CacheBucketResponsable` had a legacy field list (added before `Dominio` was in the table). The first helper version accepted "exists" as "ok" without validating the field list.
- Helper v1.1 fix: `EnsureIndexSafe` now calls `IndexFieldsMatch(p_Idx, p_Fields, p_Unique)` to compare the field list (case-insensitive) and Unique flag. If they do not match, the index is dropped and recreated.
- Helper v1.1 imported; user manually compiled; `MigracionIssue18_Aplicar()` -> changeCount=3 (all `index_recreated` for the legacy-field-list indexes).
- Re-run of RED tests: **8/8 GREEN**. 4 NEW RED tests transitioned to GREEN; 4 pre-existing `cache-sync` tests remained GREEN (no regression).
- `MigracionIssue18_Estado()` post-migration -> changeCount=0, value=no_changes_needed (helper is fully idempotent; re-running it is a no-op).

## TDD Cycle Evidence (final)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 Schema inspection | `src/modules/Test_IndicadoresCaracterizacion.bas` | Integration / Access schema | Dysflow doctor OK | Source/cache schema inspected before fixture design | N/A - inspection task | Proyecto and Auditoria source schemas inspected | Evidence recorded in this artifact |
| 1.2 DDL update | `database/issue18_backend_indicator_cache.sql` | Schema artifact | `git diff --check` OK | DDL expectations captured by RED schema tests before migration | Confirmed by migration helper | Config/header/detail/index coverage added | Kept legacy table names to reduce churn |
| 1.3 RED schema tests | `src/modules/Test_IndicadoresCaracterizacion.bas` | Integration / Access schema | Run post manual compile | 2 JSON-returning tests assert required tables/fields/indexes | 2/2 GREEN after Phase 2 | Field test + index test cover separate failure modes | DAO `TableDef`/`Index` inspection avoids `MSys*` query fragility |
| 1.4 RED fixture tests | `src/modules/Test_IndicadoresCaracterizacion.bas` | Integration / Access sandbox | Run post manual compile | 2 JSON-returning tests seed Proyecto/Auditoria source rows deterministically and then require missing cache DDL | 2/2 GREEN after Phase 2 | Proyecto and Auditoria fixture shapes are separate | Reused existing deterministic cleanup/seed helpers |
| 2.0 Migration helper | `src/modules/ModuloMigracionIssue18.bas` | VBA / DAO | Manual compile + DryRun preview | Helper designed with `DryRun` / `Aplicar` / `Estado` entry points, sandbox-by-default, explicit production path with guard | Helper executed twice on sandbox; idempotent | Sandbox + production modes separated; sandbox tested first, production path declared for later use | Field list validation added in v1.1 to catch legacy field lists |
| 2.0.1 Backend DDL partial apply | `database/issue18_migration_v1.sql` + `dysflow.exec_sql` x17 | Schema migration | `dysflow.get_schema` after each batch | Created `TbCacheIndicadoresConfig` + added 17 columns | Migration helper finished the DDL | Partial apply + recovery via exec_sql + helper completion | Switched to helper for indexes + Required fix |

## Access sync

- Modules imported via Dysflow MCP with `projectId=00-no-conformidades-staging-clean` (compile=false): `Test_IndicadoresCaracterizacion` (Phase 1), `ModuloMigracionIssue18` (Phase 2 helper, v1 and v1.1).
- User manually compiled after each import. No `dysflow.compile_vba` was called.
- Final state of `C:\00repos\datos\NoConformidades_Datos.accdb` matches the issue #18 contract: 1 new table (`TbCacheIndicadoresConfig`), 4 fields added to Header + 10 to Detalle, 8 indexes with correct field lists.

## Remaining / next slice

- wu1 (Phase 1 + Phase 2 DDL + helper) is COMPLETE and verified GREEN. Ready to commit to `staging` with traceability.
- Issue #18 stays OPEN until the full SDD is delivered: explicit unrelated-NC preservation evidence, immediate per-NC sync hooks, runtime cache-read paths, cross-domain non-regression, and archive traceability.
- Phase 2 remaining: task 2.7 needs an explicit assertion that incremental sync refreshes only the affected NC and preserves unrelated NC rows.
- Phase 3 remaining: immediate sync hooks after NC/AC/AR/tarea writes and runtime form/cache-read paths.
- Phase 4 remaining: full Proyecto/Auditoría runtime scenarios and cross-domain non-regression; Access manual compile/test evidence for current 2.x/4.x work is already recorded below.
- The migration helper is the production deliverable for issue #18; production backends will use `MigracionIssue18_Aplicar(<prodPath>, <prodPwd>)` with the explicit path and password.

## Artifact-only refresh on 2026-06-11

No VBA/source code was edited for this refresh. No Access operations, imports, compiles, or tests were run during this artifact-only update.

### Current task progress

- Before this artifact refresh: 31 total tasks, 10 complete, 21 pending.
- After this artifact refresh: 31 total tasks, 19 complete, 12 pending.
- Newly marked complete from existing implementation and recent verification evidence: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.4, 4.5, 4.6.
- Explicitly left pending because current evidence does not fully close the original scope: 2.7, 3.1-3.6, 4.1-4.3, 5.1-5.2.

### Recent verification evidence now attached to this SDD

- Focused Issue18 tests: 14/14 pass.
- `tests/tests.vba.indicadores-caracterizacion.json`: 46/46 pass.
- Full `tests/tests.vba.json`: 80/80 pass.
- User manually compiled after Dysflow imports; no `compile_vba` was used.

### Implementation commits and reachability

| Commit | Work unit | SDD tasks | Verification | Access sync | Reachable from `staging` |
|---|---|---|---|---|---|
| `b7eaa86` | `feat(issue-18): add shared cache config table and idempotent migration helper` | 1.1-1.5, 2.0-2.0.4 | Issue #18 RED-to-GREEN schema/migration evidence; helper idempotency verified. | Dysflow imports recorded; user manually compiled; no `compile_vba`. | Yes |
| `7f7d15f` | `docs(issue-18): document wu1 migration helper and pending phases` | 2.0-2.0.4 documentation/evidence | Documentation-only trace of wu1 migration/helper state. | N/A. | Yes |
| `276e2bc` | `feat(issue-18): ModuloCacheIndicadoresIssue18 — per-NC sync, AC/AR resolvers, full rebuild, read/filter API` | 2.1-2.4 | Focused Issue18 14/14, indicadores-caracterizacion 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | No - branch-only/current branch, not in `staging`. |
| `c80f7bb` | `fix(issue-18): test helpers InsertHeaderEstado and InsertFixtureRow set required IDCacheConfig and Dominio` | 2.1, 2.5, 2.6 test support | Focused Issue18 14/14, indicadores-caracterizacion 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | No - branch-only/current branch, not in `staging`. |
| `457eae1` | `test(issue-18): add indicadores-caracterizacion test plan` | 4.4 | `tests/tests.vba.indicadores-caracterizacion.json`: 46/46 pass. | N/A for artifact itself; source tests imported before execution; user manually compiled. | No - branch-only/current branch, not in `staging`. |
| `53a0e03` | `feat(issue-18): add PHASE 2.1-2.7 tests + extend main test plan` | 2.1-2.6, 4.4, 4.6 | Focused Issue18 14/14, indicadores-caracterizacion 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | No - branch-only/current branch, not in `staging`. |
| `caac121` | Remote duplicate `test(issue-18): add indicadores-caracterizacion test plan` | Superseded duplicate manifest addition | Not used as closure evidence: it added `Issue18_IncrementalSync_PreservaNCNoAfinidad`, but that procedure is not implemented in source. | N/A. | No - merged into current branch by `ff0eae8`, not in `staging`. |
| `ff0eae8` | `merge(issue-18): reconcile remote manifest duplicate` | Traceability/merge resolution | Conflict-only resolution kept the local 46-test manifest to avoid referencing the unimplemented remote-only procedure. Previous green evidence remains: focused Issue18 14/14, indicadores 46/46, full manifest 80/80. | No Access sync needed for conflict-only manifest resolution. | No - branch-only/current branch, not in `staging`. |
| `5db9ba3` | `fix(issue-45): NCAuditoria.DatosGeneralesOK supports p_MenosCef bypass` | External Issue #45 follow-up, not an `indicator-issues-cleanup` SDD task | Full manifest 80/80 pass. | Imported before verification; user manually compiled; no `compile_vba`. | No - branch-only/current branch, not in `staging`. |
| `834d0de` | `fix(issue-18): persist cache metadata in indicators` | 2.1-2.6, 4.4-4.6 support | Focused Issue18 14/14, indicadores-caracterizacion 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | No - branch-only/current branch, not in `staging`. |

### Archive readiness

Archive remains blocked. Reasons:

1. `verify-report` is still missing for `openspec/changes/indicator-issues-cleanup`.
2. Not every task checkbox is complete: 12 tasks remain pending.
3. Several implementation commits and the current local fixes are not reachable from `staging`; only `b7eaa86` and `7f7d15f` are currently reachable from `staging`.
4. Runtime hook/form-read scope remains pending: Phase 3 tasks are not proven by the current focused Issue18/API evidence.

Next recommended SDD phase: continue `apply` for the remaining scoped tasks, then create `verify-report` only after the pending tasks are genuinely implemented and tested.
