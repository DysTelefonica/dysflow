# Tasks: indicator-issues-cleanup

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,100-1,800 total implementation forecast |
| 400-line budget risk | High if single PR; Medium with slices |
| Chained PRs recommended | Yes |
| Suggested split | PR1 schema/domain tests -> PR2 incremental sync/read API -> PR3 immediate hooks/runtime for both domains -> PR4 evidence/cleanup |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

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
- [ ] 2.1 Rework `src/modules/ModuloCacheIndicadores.bas` to synchronize shared backend cache rows transactionally for one affected `IDNoConformidad`.
- [ ] 2.2 Add AC -> NC and AR/task -> AC -> NC resolution helpers so downstream mutations synchronize only the affected NC.
- [ ] 2.3 Add explicit full rebuild operation for bootstrap, repair, and global indicator rule/configuration changes only.
- [ ] 2.4 Add read/filter API returning bucket counts and detail rows from cache tables filtered by connected user/responsible/domain.
- [ ] 2.5 Test global shared cache with two responsibles and both domains: one cache dataset, filtered user views, exact row/cardinality assertions.
- [ ] 2.6 Test cache is detail-complete for required Proyecto and Auditoría bucket UI fields, not counts-only.
- [ ] 2.7 Test incremental sync refreshes only the affected NC and preserves unrelated NC rows.

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
- [ ] 4.4 Update `tests/tests.vba.json` with atomic tests only; keep aggregators out of the main manifest.
- [ ] 4.5 Import later with Dysflow MCP only, then stop: user manually compiles in Access VBE -> Debug -> Compile.
- [ ] 4.6 After user compile, run strict VBA tests and attach evidence before closing issue #18 or related PRs.

## Cleanup Policy

- [ ] 5.1 Close issue #18 only after merged PR evidence proves shared backend cache, immediate incremental per-NC sync, both-domain coverage, and runtime cache-read behavior.
- [ ] 5.2 Rework/revert any current source implementation that remains counts-only, Proyecto-only, lazy/session-memory, full-rebuild-per-write, or incomplete-hook based.
