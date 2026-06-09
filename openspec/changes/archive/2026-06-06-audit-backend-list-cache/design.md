# Design: Audit Backend List Cache

## Technical Approach

Add `TbCacheListadoNCAuditoria` as a shared backend list-cache, not a frontend table. The implementation follows the existing `TbCacheListadoNC` list-cache pattern while keeping audit-specific fields and types from `TbNoConformidadesAuditoria`. `Form_FormNCAuditoriaGestion.cls` remains a UI adapter; `NCAuditoriaGestionListadoHelper.bas` chooses cache-first vs fallback; a dedicated audit cache module owns schema readiness, read, rebuild, upsert, and invalidation seams.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Cache location | Create/ensure table only in `NoConformidades_Datos.accdb`/sandbox via `getdb()` and Dysflow guarded backend writes | Frontend local table; linked-table-only probe | The cache is shared data and issue #57 is specifically backend readiness. Frontend existence would be a false positive. |
| Module boundary | New `src/modules/NCAuditoriaListadoCache.bas`; helper delegates to it; form unchanged/minimal | Extend `CacheNCProyecto.bas`; put SQL in form/helper | Project cache naming is already large and project-specific. A narrow audit module reduces coupling and protects the form boundary. |
| Cache shape | List-cache rows, not detail JSON | Mirror `TbCacheNCProyecto` detail JSON | The form needs filtered list rows and keyword parity, not hydrated detail payloads. |
| Fallback | Cache read returns `Nothing`/reason; helper logs `FormAuditCacheFallback` and calls existing constructor path | Silent fallback or fatal cache errors | Current behavior is observable and safe; cache failure must not block users. |

## Data Flow

```text
Form_FormNCAuditoriaGestion
  -> NCAuditoriaGestionListadoHelper.GetNCAuditoriaGestionFiltradas
      -> NCAuditoriaListadoCache.TryReadListado(criteria)
          -> TbCacheListadoNCAuditoria (backend, CacheValida=True)
      -> fallback: constructor/getNCsAuditoria* + TbLogCache

Refresh button / audit NC-AC-AR mutations
  -> NCAuditoriaListadoCache.Rebuild/Invalidate seams
  -> backend cache rows marked invalid or upserted
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/modules/NCAuditoriaListadoCache.bas` | Create | `EnsureSchema`, `TryReadListado`, `UpsertListadoItem`, `RebuildListado`, `InvalidateListadoItem/All`; DAO only, `getdb()` only. |
| `src/modules/NCAuditoriaGestionListadoHelper.bas` | Modify | Replace the current “table exists but no reader” branch with positive cache read; keep logged fallback. |
| `src/forms/Form_FormNCAuditoriaGestion.cls` | Minimal modify | Keep existing `RefreshNCAuditoriaGestionCaches` call; no SQL, schema, cache, or business decisions. |
| `src/modules/Test_NCAuditoriaGestionListadoHelper.bas` | Modify | Add schema/backend/cache-hit/fallback/search parity tests with explicit fixtures. |
| `tests/tests.vba.audit-gestion-helper.json` | Modify | Add focused procedures for issue #57 slices. |

## Interfaces / Contracts

`TbCacheListadoNCAuditoria` columns: `ID` Long unique, `IDAuditoria` Long, `Tipo` Text(255), `Numero` Text(255), `Descripcion` LongText, `CAUSARAIZ` LongText, `RESPONSABLEIMPLANTACION` Text(255), `Estado` Text(255), `FechaApertura` DateTime, `FECHACIERRE` DateTime, `RequiereControlEficacia` Text(25), `ControlEficacia` LongText, `Notas` LongText, `Cerrada` Text(2/10), `Borrado` Yes/No, `AccionesCorrectivasConcatenadas` LongText, `AccionesRealizadasConcatenadas` LongText, `FechaCache` DateTime, `CacheValida` Yes/No, `Version` Long. Indexes: unique `PK_TbCacheListadoNCAuditoria(ID)`, plus non-unique `IX_TbCacheListadoNCAuditoria_AuditoriaValida(IDAuditoria, CacheValida)` and `IX_TbCacheListadoNCAuditoria_EstadoValida(Estado, CacheValida)`. Do not index LongText keyword columns.

Public module seam: `EnsureNCAuditoriaListadoCacheSchema`, `TryReadNCAuditoriaListadoCache(...) As Collection`, `RebuildNCAuditoriaListadoCache`, `InvalidateNCAuditoriaListadoCacheItem`, `InvalidateNCAuditoriaListadoCacheAll`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Schema | Backend-only table, idempotence, columns/types/indexes | Dysflow read checks + VBA tests through `getdb()`; assert frontend local table is not the satisfying source. |
| Integration | Cache hit, no rows, disabled cache, read error fallback | `BeginTestSession` sandbox; seed exact rows and assert cardinality/IDs/logs. |
| Parity | Filters and keyword search over NC, CAUSARAIZ, AC, AR text | Seed FK graph: `TbAuditorias` -> `TbNoConformidadesAuditoria` -> `TbNCAuditoriaAccionCorrectivas` -> `TbNCAuditoriaAccionesRealizadas` -> cache; teardown reverse. |

## Migration / Rollout

Schema migration must use Dysflow MCP guarded backend writes only: dry-run first, then apply to `backendPath=NoConformidades_Datos.accdb`/sandbox with `allowTable=TbCacheListadoNCAuditoria`; never run DDL against the frontend. Runtime ensure is idempotent and additive (`CREATE TABLE` with `ID`, then `ALTER TABLE ADD COLUMN`, then indexes). Roll out as chained slices under 400 changed lines: schema, reader, rebuild/invalidation, verification. Rollback reverts VBA and drops/ignores the backend table with guarded Dysflow write.

## Open Questions

None.
