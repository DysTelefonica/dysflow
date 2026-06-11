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
Chain strategy: staging-targeted work-unit slices
400-line budget risk: High

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync | Reachable from `staging` |
|---|---|---|---|---|---|
| `b7eaa86` | `feat(issue-18): add shared cache config table and idempotent migration helper` | 1.1-1.5, 2.0-2.0.4 | Issue #18 RED-to-GREEN schema/migration evidence; helper idempotency verified. | Dysflow imports recorded; user manually compiled; no `compile_vba`. | Yes |
| `7f7d15f` | `docs(issue-18): document wu1 migration helper and pending phases` | 2.0-2.0.4 documentation/evidence | Documentation-only trace of wu1 migration/helper state. | N/A. | Yes |
| `276e2bc` | `feat(issue-18): ModuloCacheIndicadoresIssue18 — per-NC sync, AC/AR resolvers, full rebuild, read/filter API` | 2.1-2.4 | Recent evidence: focused Issue18 tests 14/14, indicadores-caracterizacion manifest 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | No - branch-only/current branch, not in `staging`. |
| `c80f7bb` | `fix(issue-18): test helpers InsertHeaderEstado and InsertFixtureRow set required IDCacheConfig and Dominio` | 2.1, 2.5, 2.6 test support | Recent evidence: focused Issue18 tests 14/14, indicadores-caracterizacion manifest 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | No - branch-only/current branch, not in `staging`. |
| `457eae1` | `test(issue-18): add indicadores-caracterizacion test plan` | 4.4 | `tests/tests.vba.indicadores-caracterizacion.json`: 46/46 pass. | N/A for artifact itself; source tests imported before execution; user manually compiled. | No - branch-only/current branch, not in `staging`. |
| `53a0e03` | `feat(issue-18): add PHASE 2.1-2.7 tests + extend main test plan` | 2.1-2.6, 4.4, 4.6 | Recent evidence: focused Issue18 tests 14/14, indicadores-caracterizacion manifest 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | No - branch-only/current branch, not in `staging`. |
| `5db9ba3` | `fix(issue-45): NCAuditoria.DatosGeneralesOK supports p_MenosCef bypass` | External Issue #45 follow-up, not an `indicator-issues-cleanup` SDD task | Covered by full manifest evidence: 80/80 pass. | Imported before verification; user manually compiled; no `compile_vba`. | No - branch-only/current branch, not in `staging`. |
| `834d0de` | `fix(issue-18): persist cache metadata in indicators` | 2.1-2.6, 4.4-4.6 support | Recent evidence: focused Issue18 tests 14/14, indicadores-caracterizacion manifest 46/46, full manifest 80/80. | Imported before verification; user manually compiled; no `compile_vba`. | No - branch-only/current branch, not in `staging`. |

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
- [ ] 2.7 Test incremental sync refreshes only the affected NC and preserves unrelated NC rows.
  - Pending scope: current green tests prove per-NC insert/header behavior and shared-domain filtering, but this task still needs an explicit unrelated-NC preservation assertion before archive.

## Phase 3: Immediate Sync Hooks and Runtime Path

- [ ] 3.1 Add sync hooks after successful relevant Proyecto and Auditoría NC changes in the owning modules/classes discovered during schema/code inspection.
- [ ] 3.2 Add sync hooks after successful AC writes; each hook resolves AC -> parent NC and synchronizes only that NC.
- [ ] 3.3 Add sync hooks after successful AR/tarea writes; each hook resolves AR/task -> AC -> parent NC and synchronizes only that NC.
- [ ] 3.4 Rework runtime Proyecto and Auditoría indicator paths so form-open/filtering reads cache tables and avoids live queries on cache path.
- [ ] 3.5 Test immediate synchronization after representative NC/AC/AR/tarea mutations and assert no success is claimed on failed sync.
- [ ] 3.6 Test runtime reads/filtering for Proyecto and Auditoría flows use cached rows only on the cache path.

## Phase 4: Regression and Access Gate

- [ ] 4.1 Add Proyecto scenarios covering NC/AC/AR/tarea incremental sync, bucket reads, detail reads, and runtime filtering.
- [ ] 4.2 Add Auditoría scenarios covering NC/AC/AR/tarea incremental sync, bucket reads, detail reads, and runtime filtering.
- [ ] 4.3 Add cross-domain non-regression tests: Proyecto sync preserves Auditoría rows/filters, and Auditoría sync preserves Proyecto rows/filters.
- [x] 4.4 Update `tests/tests.vba.json` with atomic tests only; keep aggregators out of the main manifest.
- [x] 4.5 Import later with Dysflow MCP only, then stop: user manually compiles in Access VBE -> Debug -> Compile.
- [x] 4.6 After user compile, run strict VBA tests and attach evidence before closing issue #18 or related PRs (focused Issue18 14/14, indicadores-caracterizacion 46/46, full manifest 80/80).

## Cleanup Policy

- [ ] 5.1 Close issue #18 only after merged PR evidence proves shared backend cache, immediate incremental per-NC sync, both-domain coverage, and runtime cache-read behavior.
- [ ] 5.2 Rework/revert any current source implementation that remains counts-only, Proyecto-only, lazy/session-memory, full-rebuild-per-write, or incomplete-hook based.
