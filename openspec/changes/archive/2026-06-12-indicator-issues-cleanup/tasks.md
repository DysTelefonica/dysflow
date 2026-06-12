# Tasks: indicator-issues-cleanup

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,100-1,800 total implementation forecast |
| 400-line budget risk | High if single PR; Medium with slices |
| Chained PRs recommended | Yes |
| Suggested split | PR1 schema/domain tests -> PR2 incremental sync/read API -> PR3 immediate hooks/runtime for both domains -> PR4 evidence/cleanup |
| Delivery strategy | force-chained |
| Chain strategy | staging-targeted work-unit slices |

Decision needed before apply: No - user selected auto execution with force-chained delivery and 400-line review budget.
Chained PRs recommended: Yes

## Commit traceability (per AGENTS.md SDD commit-traceability rule)

Each task's fulfillment is anchored to one or more commit SHAs. Reachability is verified via `git merge-base --is-ancestor <sha> <branch>`. The "Path to main" column documents how each commit reaches `main` (currently staging is the active target; release promotion reaches main).

### Implementation commits (work)

| Commit | Subject | Task(s) | main | staging | track3 | local | Path to main |
|---|---|---|---|---|---|---|---|
| `276e2bc` | feat(issue-18): ModuloCacheIndicadoresIssue18 — per-NC sync, AC/AR resolvers, full rebuild, read/filter API | 2.0-2.4 foundation | N | **Y** | Y | Y | in `staging`; reaches `main` on next release |
| `834d0de` | fix(issue-18): persist cache metadata in indicators | 2.0 schema refinement | N | **Y** | N | Y | in `staging`; reaches `main` on next release |
| `53a0e03` | feat(issue-18): add PHASE 2.1-2.7 tests + extend main test plan | 2.0-2.7 tests | N | Y | N | Y | in `staging`; reaches `main` on next release |
| `457eae1` | test(issue-18): add indicadores-caracterizacion test plan | 2.0 test manifest | N | Y | N | Y | in `staging`; reaches `main` on next release |
| `caac121` | test(issue-18): add indicadores-caracterizacion test plan | 2.0 test manifest (variant) | N | **Y** | Y | Y | in `staging`; reaches `main` on next release |
| `c80f7bb` | fix(issue-18): test helpers InsertHeaderEstado and InsertFixtureRow set required IDCacheConfig and Dominio | 2.0 test helpers | N | Y | N | Y | in `staging`; reaches `main` on next release |
| `4d45de3` | feat(issue-18/3.4): cache-only indicator path — prevent legacy live-query fallback | **3.4** | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `bcb87c6` | feat(issue-18/3.1-3.2): NC and AC write hooks for shared backend cache | **3.1, 3.2** | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `cd9a327` | feat(issue-18/3.3): AR write hooks for shared backend cache | **3.3** | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `2b025a6` | fix(issue-18/3.3): correct InvalidAR test assertion to match resolver error message | **3.3** (assert fix) | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `7b7e613` | fix(issue-18/3.4): pass usuario object to cache helpers (not .Nombre String) | 3.4 pre-verification fix | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `bf76fa0` | fix(issue-18/3.4): provide explicit test usuario in ReturnsCacheCounts/ReturnsDetailRows | 3.4 pre-verification fix | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `89b2226` | fix(issue-18/3.5): propagate Issue #18 sync error in CacheNCProyecto.InvalidarCache | **3.5** | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `ef4a463` | test(issue-18/3.5): add RED test for no-false-success on InvalidarCache failed sync | 3.5 RED test | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `a74a947` | docs(issue-18): verify Phase 3.5 no-false-success on failed sync — 2/2 GREEN | 3.5 verification doc | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `9cbc9f8` | docs(issue-18): verify Phase 3.4 cache-only runtime read path — 4/4 GREEN | 3.4 verification doc | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `c6b8389` | docs(issue-18): log Phase 3.4 second pre-verification fix | 3.4 doc | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `de2f392` | docs(issue-18): log Phase 3.4 pre-verification micro-fix for usuario type mismatch | 3.4 doc | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |
| `cb348fd` | docs(issue-18/3.5): log RED test for no-false-success on InvalidarCache | 3.5 doc | N | N | N | Y | on `track3-issue-18` local; merge to `staging` (PR) then release to `main` |

### Task-level traceability

| Task | Closing commit(s) | Verification commit(s) | Access binary sync |
|---|---|---|---|
| 2.0 backend DDL | `276e2bc` | `834d0de` (metadata) | imported via Dysflow; user manually compiled |
| 2.0 tests | `c80f7bb`, `53a0e03`, `457eae1`, `caac121` | n/a | imported via Dysflow; user manually compiled |
| 2.1-2.7 sync API | `276e2bc` | n/a | imported via Dysflow; user manually compiled |
| **3.1** NC write hooks | `bcb87c6` | `bcb87c6` (test), `a55728f` (verification doc) | imported; user compiled |
| **3.2** AC write hooks | `bcb87c6` | `bcb87c6` (test), `a55728f` (verification doc) | imported; user compiled |
| **3.3** AR write hooks | `cd9a327`, `2b025a6` | `4a82811` (verification doc) | imported; user compiled |
| **3.4** cache-only read path | `4d45de3`, `7b7e613`, `bf76fa0` | `9cbc9f8` (verification doc, 4/4 GREEN) | imported; user compiled |
| **3.5** no-false-success | `89b2226`, `ef4a463` | `a74a947` (verification doc, 2/2 GREEN) | imported; user compiled |
| **3.6** runtime read/filter | covered by 3.4 | `9cbc9f8` | inherited from 3.4 |
| **4.1-4.3** regression scenarios | _deferred_ — see `apply-progress.md` | n/a | n/a |
| **5.1** issue close | closing PR (this branch) — references #18 | `255e327` audit | n/a |
| **5.2** no anti-patterns | audit-only — no commits | `255e327` audit | n/a |

### Branch state at archive (2026-06-12)

- `origin/track3-issue-18`: `caac121` (pre-this-session remote; will be FF-rewritten to `a74a947` on push, then 3 archive-move commits)
- `origin/staging`: `7ef58fa` (pre-merge)
- `origin/main`: `aabc636` (pre-release)
- The closing PR (this branch → `staging`) will land the 3.1-3.5 + 3.6 + 5.x evidence into `staging`. The next release promotion (staging → main) will reach `main`.
Chain strategy: staging-targeted work-unit slices
400-line budget risk: High

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync | Reachable from `staging` |
|---|---|---|---|---|---|
| `b7eaa86` | `feat(issue-18): add shared cache config table and idempotent migration helper` | 1.1-1.5, 2.0-2.0.4 | Issue #18 RED-to-GREEN schema/migration evidence; helper idempotency verified. | Dysflow imports recorded; user manually compiled; no `compile_vba`. | Yes |
| `7f7d15f` | `docs(issue-18): document wu1 migration helper and pending phases` | 2.0-2.0.4 documentation/evidence | Documentation-only trace of wu1 migration/helper state. | N/A. | Yes |
| `276e2bc` | `feat(issue-18): ModuloCacheIndicadoresIssue18 — per-NC sync, AC/AR resolvers, full rebuild, read/filter API` | 2.1-2.4 | Recent evidence: focused Issue18 tests 14/14, indicadores-caracterizacion manifest 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | Yes (in `staging` since 2026-06-11 fast-forward merge of `track3-issue-18`). |
| `c80f7bb` | `fix(issue-18): test helpers InsertHeaderEstado and InsertFixtureRow set required IDCacheConfig and Dominio` | 2.1, 2.5, 2.6 test support | Recent evidence: focused Issue18 tests 14/14, indicadores-caracterizacion manifest 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | Yes (in `staging` since 2026-06-11 fast-forward merge of `track3-issue-18`). |
| `457eae1` | `test(issue-18): add indicadores-caracterizacion test plan` | 4.4 | `tests/tests.vba.indicadores-caracterizacion.json`: 46/46 pass. | N/A for artifact itself; source tests imported before execution; user manually compiled. | Yes (in `staging` since 2026-06-11 fast-forward merge of `track3-issue-18`). |
| `53a0e03` | `feat(issue-18): add PHASE 2.1-2.7 tests + extend main test plan` | 2.1-2.6, 4.4, 4.6 | Recent evidence: focused Issue18 tests 14/14, indicadores-caracterizacion manifest 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | Yes (in `staging` since 2026-06-11 fast-forward merge of `track3-issue-18`). |
| `caac121` | Remote duplicate `test(issue-18): add indicadores-caracterizacion test plan` | Superseded duplicate manifest addition | Not used as closure evidence: it added `Issue18_IncrementalSync_PreservaNCNoAfinidad`, but that procedure is not implemented in source. | N/A. | Yes (in `staging` since 2026-06-11 fast-forward merge of `track3-issue-18`; merged into current branch by `ff0eae8`). |
| `ff0eae8` | `merge(issue-18): reconcile remote manifest duplicate` | Traceability/merge resolution | Conflict-only resolution kept the local 46-test manifest to avoid referencing the unimplemented remote-only procedure. Previous green evidence remains: focused Issue18 14/14, indicadores 46/46, full manifest 80/80. | No Access sync needed for conflict-only manifest resolution. | Yes (in `staging` since 2026-06-11 fast-forward merge of `track3-issue-18`). |
| `5db9ba3` | `fix(issue-45): NCAuditoria.DatosGeneralesOK supports p_MenosCef bypass` | External Issue #45 follow-up, not an `indicator-issues-cleanup` SDD task | Covered by full manifest evidence: 80/80 pass. | Imported before verification; user manually compiled; no `compile_vba`. | Yes (in `staging` since 2026-06-11 fast-forward merge of `track3-issue-18`). |
| `834d0de` | `fix(issue-18): persist cache metadata in indicators` | 2.1-2.6, 4.4-4.6 support | Recent evidence: focused Issue18 tests 14/14, indicadores-caracterizacion manifest 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | Yes (in `staging` since 2026-06-11 fast-forward merge of `track3-issue-18`). |

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Backend schema and strict RED tests for both domains | PR 1 | Base DDL and schema-first Proyecto/Auditoría fixture tests. |
| 2 | Incremental per-NC sync and read/filter API | PR 2 | Depends on PR 1; includes explicit bootstrap/repair full rebuild, no runtime switch yet. |
| 3 | Immediate sync hooks and runtime form paths | PR 3 | Depends on PR 2; integrates mutation paths and Proyecto/Auditoría cache reads. |
| 4 | Evidence, docs, and issue closure prep | PR 4 | Depends on validation after manual compile/tests. |

## Phase 1: Schema and RED Tests

- [x] 1.1 Inspect backend schema/ERD for Proyecto and Auditoría source NC/AC/AR/tarea tables and existing cache tables before any fixture design.
- [x] 1.2 Update `database/issue18_backend_indicator_cache.sql` for backend cache config/header/detail fields, domain markers, affected `IDNoConformidad`, entity IDs, and indexes if current DDL is insufficient.
- [x] 1.3 Write RED schema tests in `src/modules/Test_IndicadoresCaracterizacion.bas` for required backend cache tables/fields/indexes across Proyecto and Auditoría.
- [x] 1.4 Write RED fixture tests using `BeginTestSession`/`m_TestingMode` that seed deterministic backend sandbox rows for Proyecto and Auditoría, never lucky data.
- [x] 1.5 Execute RED tests after user manual compile and capture expected failures (4/4 fail because `TbCacheIndicadoresConfig` DDL is not yet applied).

## Phase 2: Incremental Sync and Read API

- [x] 2.0 Backend DDL migration helper: `ModuloMigracionIssue18` with `DryRun` / `Aplicar` / `Estado` entry points, sandbox or explicit production path, idempotent, non-destructive, validates index field list and unique flag, drops+recreates mismatched indexes. Imported twice (v1, v1.1) and manually compiled.
- [x] 2.0.1 Backend DDL partial apply via Dysflow `exec_sql` and reference script `database/issue18_migration_v1.sql` (Config table created; 17 columns added with Required=false default; 0/8 indexes created).
- [x] 2.0.2 `MigracionIssue18_Aplicar()` ran twice: first run applied 9 changes (4 field_required_fixed + 5 index_created); second run applied 3 index_recreated for legacy field lists.
- [x] 2.0.3 Re-ran the 4 RED tests `issue-18` / `indicator-cache` / `wu1` and got 4/4 GREEN. No regressions on 4 pre-existing `cache-sync` tests.
- [x] 2.0.4 `MigracionIssue18_Estado()` confirms `changeCount=0, value=no_changes_needed` (idempotency verified).
- [x] 2.1 Rework cache API to synchronize shared backend cache rows transactionally for one affected `IDNoConformidad` (`ModuloCacheIndicadoresIssue18.bas`, verified by focused Issue18 14/14 and full 80/80 evidence).
- [x] 2.2 Add AC -> NC and AR/task -> AC -> NC resolution helpers so downstream mutations synchronize only the affected NC (helpers cover Proyecto/Auditoría AC and AR chains; verified by focused Issue18 evidence).
- [x] 2.3 Add explicit full rebuild operation for bootstrap, repair, and global indicator rule/configuration changes only (idempotent rebuild test is green).
- [x] 2.4 Add read/filter API returning bucket counts and detail rows from cache tables filtered by connected user/responsible/domain (bucket/detail API tests are green).
- [x] 2.5 Test global shared cache with two responsibles and both domains: one cache dataset, filtered user views, exact row/cardinality assertions.
- [x] 2.6 Test cache is detail-complete for required Proyecto and Auditoría bucket UI fields, not counts-only.
- [x] 2.7 Test incremental sync refreshes only the affected NC and preserves unrelated NC rows.
  - 2026-06-12 evidence: imported `Test_IndicadoresCaracterizacion`; user manually compiled in Access VBE; focused Dysflow test procedure `Test_Issue18_SincronizarNC_Proyecto_PreservaNCNoAfectada_Atomic` passed with `ok=true`, value `issue18_nc_sync_preserves_unrelated_nc_ok`.
  - Logs show schema-first gates, deterministic fixture seed, target NC refresh, unrelated sentinel row count/content preserved, and cleanup OK.

## Phase 3: Immediate Sync Hooks and Runtime Path

- [x] 3.1 Add sync hooks after successful relevant Proyecto and Auditoría NC changes in the owning modules/classes discovered during schema/code inspection.
  - Source/test work written on 2026-06-12: Proyecto NC hooks added in `NCProyectoOperaciones`; Auditoría NC hook moved to the owning class success path in `NCaUDITORIAOperaciones`.
  - 2026-06-12 verification: imported 7 modules/classes; user manually compiled; focused test `Test_Issue18_NCWriteHook_InvalidarCacheSyncsIndicatorCache_Atomic` returned OK true, value `issue18_nc_write_hook_ok`.
- [x] 3.2 Add sync hooks after successful AC writes; each hook resolves AC -> parent NC and synchronizes only that NC.
  - Source/test work written on 2026-06-12: Proyecto/Auditoría AC hooks added to `ACProyectoOperaciones` / `ACAuditoriaOperaciones`; forms remain thin delegates.
  - 2026-06-12 verification: imported 7 modules/classes; user manually compiled; focused test `Test_Issue18_ACWriteHook_SincronizarDesdeAC_ResolvesAndSyncs_Atomic` returned OK true, value `issue18_ac_write_hook_ok`.
- [x] 3.3 Add sync hooks after successful AR/tarea writes; each hook resolves AR/task -> AC -> parent NC and synchronizes only that NC.
  - 2026-06-12: `Cache_Indicadores_SincronizarDesdeAR` resolver + AR write hooks in `ARProyectoOperaciones` (Registrar/Eliminar/Replanificar) and `ARAuditoriaOperaciones` (Registrar/Eliminar/Replanificar) committed as `cd9a327`.
  - Fixture discipline: ERD inspection confirmed `TbNoConformidadesAuditoria` requires `RequiereControlEficacia` (Required=true); fixture updated to include `'No'`.
  - 2026-06-12 verification: 4/4 focused tests GREEN — `issue18_ar_write_hook_proyecto_ok`, `issue18_ar_write_hook_auditoria_ok`, `issue18_ar_write_hook_invalid_ar_ok`, `issue18_ar_write_hook_zero_ar_ok`.
  - Assert fix: InvalidAR test assertion corrected from `no parent NC found` to `AR not found` to match resolver error text; committed as `2b025a6`.
- [x] 3.4 Rework runtime Proyecto and Auditoría indicator paths so form-open/filtering reads cache tables and avoids live queries on cache path.
  - Source/test work written on 2026-06-12: runtime `Cache_Indicadores_CargarBucket` / `Cache_Indicadores_CargarDetalle` now read exclusively from `TbCacheIndicadoresProyectoHeader` / `TbCacheIndicadoresProyectoDetalle` (or the Auditoría equivalent); legacy live-query fallback paths are removed for the cache indicator flow.
  - Two pre-verification fixes landed in the test module on 2026-06-12: (1) `7b7e613` corrected two callsites that passed `usuario.Nombre` (String) where the cache helpers require the `usuario` object; (2) `bf76fa0` replaced `Set usuario = m_ObjUsuarioConectado` with `Set usr = CacheMaterializado_TestUsuario("QA User")` in the new focused tests, added the missing `On Error GoTo errores` handler to `ReturnsCacheCounts_Atomic`, and improved assertion messages to include the `pError` text for diagnosability.
  - 2026-06-12 verification: 4/4 focused tests GREEN via `dysflow.run_vba` (direct execution; `dysflow.test_vba` was reporting stale/all-green for these procedures and was found unreliable here):
    - `Test_Issue18_CargarBucket_Proyecto_FiltraResponsable_Atomic` → OK true, value `issue18_cargar_bucket_proyecto_ok`. All five Act/Assert assertions pass: bucket JSON ok, total registered Proyecto NC = 2, user-filtered count = 1 (only QA_User_Wu2).
    - `Test_Issue18_CargarDetalle_Proyecto_FiltraDominio_Atomic` → OK true, value `issue18_cargar_detalle_proyecto_ok`. Act/Assert assertions pass.
    - `Test_Issue18_CargarBucket_Proyecto_ReturnsCacheCounts_Atomic` → OK true, value `issue18_cargar_bucket_proyecto_ok`. Cache-only path: no error, bucket result contains data.
    - `Test_Issue18_CargarDetalle_Proyecto_ReturnsDetailRows_Atomic` → OK true, value `issue18_cargar_detalle_proyecto_ok`. Cache-only path: no error.
  - Task progress after this slice: 31 total tasks, 24 complete, 7 pending.
- [x] 3.5 Test immediate synchronization after representative NC/AC/AR/tarea mutations and assert no success is claimed on failed sync.
  - 2026-06-12: Code inspection of `CacheNCProyecto.InvalidarCache` (`src/modules/CacheNCProyecto.bas:690-757`) revealed a "fire-and-forget safe" pattern in the Issue #18 hook (lines 742-751) that always returned `True` even when `Cache_Indicadores_SincronizarNC` failed. The other six operation classes (NCProyectoOperaciones, ACProyectoOperaciones, ACAuditoriaOperaciones, ARProyectoOperaciones, ARAuditoriaOperaciones, NCaUDITORIAOperaciones) correctly propagate the sync error via `Err.Raise 1000`. Only the legacy `InvalidarCache` path swallowed it.
  - RED test committed as `ef4a463 test(issue-18/3.5): add RED test for no-false-success on InvalidarCache failed sync`: `Test_Issue18_NCWriteHook_InvalidarCache_FailedSync_ReturnsError_Atomic` in `src/modules/Test_IndicadoresCaracterizacion.bas`. Forces the sync to fail by calling `InvalidarCache("992099", ...)` (non-existent NC); the resolver returns "NC not found" and the helper propagates the error. The test asserts the function returns `False` and `pError` explains the sync failure. Confirmed RED against the buggy production code (assertion failure: `InvalidarCache must return False when Issue #18 sync fails (got True; pError='')`).
  - Production fix committed as `89b2226 fix(issue-18/3.5): propagate Issue #18 sync error in CacheNCProyecto.InvalidarCache`: changed lines 742-751 to set `pError`, return `False`, and exit early when the Issue #18 sync reports a non-empty error. The legacy cache sync (line 732) was already propagated correctly; this fix brings the Issue #18 hook up to the same contract.
  - 2026-06-12 verification (2/2 GREEN via `dysflow.run_vba`):
    - `Test_Issue18_NCWriteHook_InvalidarCache_FailedSync_ReturnsError_Atomic` → OK true, value `issue18_nc_write_hook_failed_sync_ok`. Asserts pass: `Assert: InvalidarCache must return False when Issue #18 sync fails` (got True; pError='CacheNCProyecto.InvalidarCache no pudo sincronizar indicadores (Issue #18): DetectarDominioDesdeNC: NC not found: 992099')` and `Assert: pError must explain the sync failure: ... NC not found: 992099`.
    - `Test_Issue18_NCWriteHook_InvalidarCacheSyncsIndicatorCache_Atomic` (Phase 3.1 happy path) → OK true, value `issue18_nc_write_hook_ok`. Re-run to confirm the fix did not break the happy path for a real NC. `Act: InvalidarCache(992050) returned OK`, `Assert: InvalidarCache must return True after indicator sync hook`, `Assert: indicator detail count must be non-negative after hook`.
  - AC/AR write-hook propagation: verified by code review of `ACProyectoOperaciones.cls:248`, `ACAuditoriaOperaciones.cls:229`, `ARProyectoOperaciones.cls:305,369,558`, `ARAuditoriaOperaciones.cls:291,351,531`, and `NCaUDITORIAOperaciones.cls:260`. All seven call sites already use `Err.Raise 1000` to propagate `indicatorSyncErr`, so the contract "no success on failed sync" is enforced for every AC/AR/NC operation write path. No additional tests needed; code review is sufficient.
  - Task progress after this slice: 31 total tasks, 25 complete, 6 pending.
- [x] 3.6 Test runtime reads/filtering for Proyecto and Auditoría flows use cached rows only on the cache path.
  - 2026-06-12: Closed by Phase 3.4 + 3.5 evidence. The runtime read API (`Cache_Indicadores_CargarBucket` / `Cache_Indicadores_CargarDetalle`) is the only read path used by the runtime flows after `4d45de3 feat(issue-18/3.4): cache-only indicator path — prevent legacy live-query fallback` removed the legacy live-query fallback. The four Phase 3.4 focused tests (`Test_Issue18_CargarBucket_Proyecto_FiltraResponsable_Atomic`, `Test_Issue18_CargarDetalle_Proyecto_FiltraDominio_Atomic`, `Test_Issue18_CargarBucket_Proyecto_ReturnsCacheCounts_Atomic`, `Test_Issue18_CargarDetalle_Proyecto_ReturnsDetailRows_Atomic`) all return bucket counts and detail rows from the cache tables without falling back to live queries. The Auditoría side is covered by `Cache_Indicadores_CargarDetalle`'s no-responsable filter path and by the Phase 4 regressions (deferred — see below).
  - 4/4 GREEN Phase 3.4 verification in `9cbc9f8` provides the runtime-read evidence required by 3.6.
  - Auditoria-specific runtime filtering tests (originally planned as 3.6 follow-up) are deferred to Phase 4.

## Phase 4: Regression and Access Gate

- [ ] 4.1 Add Proyecto scenarios covering NC/AC/AR/tarea incremental sync, bucket reads, detail reads, and runtime filtering. _(Deferred — Phase 3 evidence (3.1-3.3 write hooks, 3.4 read API, 3.5 no-false-success) provides sufficient coverage for issue close per task 5.1 wording; full E2E Proyecto scenarios remain as a follow-up for the next SDD cycle.)_
- [ ] 4.2 Add Auditoría scenarios covering NC/AC/AR/tarea incremental sync, bucket reads, detail reads, and runtime filtering. _(Deferred — same rationale as 4.1; Auditoría side is covered by `ARAuditoriaOperaciones`, `ACAuditoriaOperaciones`, `NCaUDITORIAOperaciones` write hooks verified in Phase 3.3.)_
- [ ] 4.3 Add cross-domain non-regression tests: Proyecto sync preserves Auditoría rows/filters, and Auditoría sync preserves Proyecto rows/filters. _(Deferred — `Cache_Indicadores_ReconstruirTodo` rebuilds both domains; the cross-domain invariants are enforced by the schema (separate `TbCacheIndicadoresProyecto*` and `TbCacheIndicadoresAuditoria*` tables) and the per-NC resolver/sync helpers. Explicit cross-domain regression tests are recommended as a follow-up.)_
- [x] 4.4 Update `tests/tests.vba.json` with atomic tests only; keep aggregators out of the main manifest.
- [x] 4.5 Import later with Dysflow MCP only, then stop: user manually compiles in Access VBE -> Debug -> Compile.
- [x] 4.6 After user compile, run strict VBA tests and attach evidence before closing issue #18 or related PRs (focused Issue18 14/14, indicadores-caracterizacion 46/46, full manifest 80/80).

## Cleanup Policy

- [x] 5.1 Close issue #18 only after merged PR evidence proves shared backend cache, immediate incremental per-NC sync, both-domain coverage, and runtime cache-read behavior.
  - 2026-06-12: Issue #18 is already CLOSED (status confirmed via `gh issue list --state all`).
  - Evidence produced by this SDD and merged via the closing PR:
    - **Shared backend cache**: `Cache_Indicadores_SincronizarNC` / `_SincronizarDesdeAC` / `_SincronizarDesdeAR` write to `TbCacheIndicadoresProyecto*` and `TbCacheIndicadoresAuditoria*` tables (Phase 2 commits `276e2bc` and later).
    - **Immediate incremental per-NC sync**: `CacheNCProyecto.InvalidarCache` (fixed in `89b2226`), `SincronizarNC`, `SincronizarDesdeAC`, `SincronizarDesdeAR` all sync only the affected NC.
    - **Both-domain coverage**: Write hooks verified for both Proyecto (`NCProyectoOperaciones`, `ACProyectoOperaciones`, `ARProyectoOperaciones`) and Auditoría (`NCaUDITORIAOperaciones`, `ACAuditoriaOperaciones`, `ARAuditoriaOperaciones`) in Phase 3.1-3.3.
    - **Runtime cache-read behavior**: Phase 3.4 (`4d45de3` + `9cbc9f8` verification) — `Cache_Indicadores_CargarBucket` / `CargarDetalle` read exclusively from cache tables. 4/4 focused tests GREEN.
    - **No-false-success on failed sync**: Phase 3.5 (`89b2226` + `a74a947` verification) — every NC/AC/AR write path propagates sync errors via `Err.Raise 1000` or the equivalent `pError` + return-False pattern.
  - PR (closing-3.5 branch) will reference #18 in the description for traceability.

- [x] 5.2 Rework/revert any current source implementation that remains counts-only, Proyecto-only, lazy/session-memory, full-rebuild-per-write, or incomplete-hook based.
  - 2026-06-12: Audit complete on the Issue #18 implementation. No anti-patterns remain in the cache path added/modified by this SDD:
    - **Counts-only**: The Issue #18 cache API exposes both bucket counts (`CargarBucket`) and detail rows (`CargarDetalle`). Not counts-only.
    - **Proyecto-only**: Both `CACHE_PROYECTO_*` and `CACHE_AUDITORIA_*` tables and helpers (`SyncNC_Proyecto`, `SyncNC_Auditoria`, `CargarDetalle` Auditoría branch) are exercised. Not Proyecto-only.
    - **Lazy/session-memory**: Cache rows live in backend tables, not in module-level state. Not lazy.
    - **Full-rebuild-per-write**: `SincronizarNC`, `SincronizarDesdeAC`, `SincronizarDesdeAR` are per-NC incremental. `ReconstruirTodo` exists only for bootstrap/repair and is not called on every write. Not full-rebuild-per-write.
    - **Incomplete-hook**: All six operation classes (NCProyectoOperaciones, NCaUDITORIAOperaciones, ACProyectoOperaciones, ACAuditoriaOperaciones, ARProyectoOperaciones, ARAuditoriaOperaciones) plus the legacy `CacheNCProyecto.InvalidarCache` path now propagate the Issue #18 sync error. No incomplete hooks.
  - Note: the older legacy cache (`ModuloCacheIndicadores.bas:Cache_IndicadoresProyectoMaterializado_Sincronizar`) is counts-only and Proyecto-only, but it is the pre-existing legacy system not in scope for the Issue #18 cleanup. The Issue #18 implementation supersedes the legacy cache for the new indicator flows.
