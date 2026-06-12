# Design: indicator-issues-cleanup

## Technical approach

Implement issue #18 as a shared backend materialized indicator cache for both No Conformidades de Proyecto and No Conformidades de Auditorías. The frontend keeps local routing/configuration (`TbConfiguracionBackends`, active backend, sandbox flags) unchanged, while backend cache tables hold global config/header/detail rows. Runtime reads cache detail rows and filters by `m_ObjUsuarioConectado`/responsible/domain; mutations synchronize incrementally for the affected `IDNoConformidad` immediately after successful NC/AC/AR/tarea writes. Full rebuild is reserved for bootstrap, repair, and global indicator rule/configuration changes.

## Architecture decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Cache ownership | Shared backend tables | Frontend/local cache | All users must share one current cache. |
| Routing ownership | Keep `TbConfiguracionBackends` frontend/local | Move routing to backend | Routing is environment-local and drives sandbox/prod selection. |
| Domain scope | Proyecto and Auditoría buckets/details | Proyecto-only cache | User clarified both task domains are in scope. |
| Cache shape | Detail-complete rows plus header/config/domain markers | Counts-only | UI must show/filter both domains without live queries. |
| Freshness | Immediate incremental sync after successful writes | Lazy invalidation or full rebuild per write | User clarified no stale/lazy semantics and no expensive global rebuild per change. |
| User scope | Filter shared rows at read time | Per-user snapshots | Avoid duplicate cache snapshots and keep one global source. |

## Data flow

    NC write succeeds
        -> commit/controlled success boundary
        -> CacheIndicadores.SyncNC(IDNoConformidad)
        -> form open/read API filters shared detail by connected user/domain
        -> indicator UI renders buckets/details from cache

    AC write succeeds
        -> resolve AC -> IDNoConformidad
        -> CacheIndicadores.SyncNC(IDNoConformidad)

    AR/task write succeeds
        -> resolve AR/task -> AC -> IDNoConformidad
        -> CacheIndicadores.SyncNC(IDNoConformidad)

    bootstrap/repair/global rule or config change
        -> CacheIndicadores.RebuildAll()

## Planned file changes

| File | Action | Description |
|---|---|---|
| `database/issue18_backend_indicator_cache.sql` | Modify | Backend DDL for cache config/header/detail; verify fields/indexes cover Proyecto and Auditoría bucket details, domain markers, affected-NC refresh, and filtering. |
| `src/modules/ModuloCacheIndicadores.bas` | Rework | Incremental per-NC sync service, bootstrap/repair full rebuild service, and read/filter API over backend tables. |
| `src/modules/Funciones Generales.bas` | Rework | Runtime Proyecto and Auditoría indicator paths read cache tables and avoid live queries on cache path. |
| `src/modules/CacheNCProyecto.bas` and write services for NC/AC/AR/tareas | Rework | Call immediate per-NC sync hooks after successful relevant mutations, resolving AC -> NC and AR/task -> AC -> NC as needed. |
| `src/modules/Test_IndicadoresCaracterizacion.bas` | Rework/Add | Strict fixture-first tests for schema, incremental sync, bootstrap rebuild, filtering, Proyecto scenarios, Auditoría scenarios, and cross-domain regression. |
| `tests/tests.vba.json` | Modify | Add atomic tests only; keep smoke aggregators out of main manifest. |

## Interfaces / contracts

| Contract | Requirement |
|---|---|
| `Cache_Indicadores_SincronizarNC(IDNoConformidad)` | Recalculates only shared backend cache rows related to the affected NC after relevant successful writes. |
| `Cache_Indicadores_SincronizarDesdeAC(IDAccionCorrectora)` | Resolves AC -> parent NC and calls per-NC synchronization only for that NC. |
| `Cache_Indicadores_SincronizarDesdeAROTarea(...)` | Resolves AR/task -> AC -> parent NC and calls per-NC synchronization only for that NC. |
| `Cache_Indicadores_ReconstruirTodo` | Full rebuild for bootstrap, repair, or global indicator rule/configuration changes only. |
| `Cache_Indicadores_CargarBucket/Detalle` | Reads backend cache rows and filters by connected user/responsible/domain without live indicator queries. |
| Cache DDL | Includes backend config/header/detail, domain/bucket key, entity IDs, `IDNoConformidad`, AC/AR/task IDs, responsible, dates/status, and enough display/detail fields for Proyecto and Auditoría. |
| Test harness | Uses `BeginTestSession`/`m_TestingMode`; tests seed sandbox backend rows explicitly. |

## Testing strategy

| Layer | What to test | Approach |
|---|---|---|
| Schema | Backend cache tables/fields/indexes | Inspect real schema before seed; assert required fields. |
| Incremental sync | Affected NC only | Explicit Proyecto and Auditoría NC/AC/AR/tarea sandbox fixtures, mutate one entity, assert only that NC's cache rows refresh. |
| Full rebuild | Bootstrap/repair/global rule/config only | Explicitly invoked global operation, row/cardinality assertions for both domains. |
| Filtering | Connected-user/domain buckets/details | Same shared cache, two responsibles, Proyecto and Auditoría rows, concrete filtered rows. |
| Hooks | Immediate sync after writes | Mutate sandbox NC/AC/AR/tarea fixture, assert cache is current for affected NC before return path is accepted. |
| Regression | Cross-domain isolation | Proyecto sync preserves Auditoría rows; Auditoría sync preserves Proyecto rows. |

## Migration / rollout

Add/adjust backend cache DDL first, then implement incremental per-NC sync/read API and explicit full rebuild operation, then hook mutation paths, then switch Proyecto and Auditoría runtime form-open/filter paths. Access import and test execution are later gated by Dysflow import, user manual VBE compile, then tests.

## Current implementation conflicts to rework later

- `ModuloCacheIndicadores.bas` still describes module-level in-memory cache and current materialized functions are Proyecto/count-oriented instead of Proyecto + Auditoría detail cache.
- `Funciones Generales.bas` currently errors if the Proyecto materialized cache is unavailable; the clarified spec needs an explicit fallback/error contract.
- `CacheNCProyecto.bas` calls sync from one invalidation path, but #18 requires all relevant NC/AC/AR/tarea success paths and incremental affected-NC scope.
- Existing tests cover two materialized-cache cases, but not full schema-first detail cache, immediate per-NC hooks, Proyecto + Auditoría scenarios, cross-domain isolation, or complete row/detail filtering.
