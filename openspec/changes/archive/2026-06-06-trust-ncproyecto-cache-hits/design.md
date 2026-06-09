# Design: Trust NCProyecto Cache Hits

## Technical Approach

Make `TbCacheNCProyecto` hydration produce an explicit, trusted read graph for cache hits. `CacheNCProyecto.ObtenerNCDesdeCache` validates every required JSON section, hydrates `NCProyecto -> ACProyecto -> ARProyecto`, risks, and replanifications, links parents, and marks collections as loaded even when empty. If any section is missing, malformed, or structurally inconsistent, the cache row is invalidated/missed and no partial graph is exposed. DAO constructor helpers remain valid only for non-cache objects and explicit cache misses.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Loaded state | Add explicit loaded/cache flags on `NCProyecto` (`CacheHydrated`, `ACsLoaded`, `RiesgosLoaded`, `ReplanificacionesLoaded`) and `ACProyecto` (`ARsLoaded`). | Continue using `Nothing` for both empty and unloaded. | The current bug comes from conflating loaded-empty with not-loaded, which reopens hidden DAO paths. |
| State calculations | Route cache-hydrated `EstadoCalculado` and helper equivalents through in-memory `ACs`/`AC.ARs`. | Centralize global cache reuse in `constructor`. | Keeps cache-hit trust local and makes fallback boundaries auditable. |
| Corrupt cache | Treat missing JSON, parse failure, or orphan AR/AC links as invalidation/miss. | Ignore bad sections and lazily query DAO. | A cache hit must be source of truth or not a hit at all. |
| Diagnostics | Add minimal test seam counters around cache-hit fallback boundaries. | Instrument every DAO call. | Small enough for legacy VBA and sufficient to prove no constructor fallback during cache-hit reads. |

## Data Flow

```text
constructor.getNCProyecto
  -> CacheNCProyecto.ObtenerNCConCache
    -> ObtenerNCDesdeCache
      -> validate DatosNC/DatosACs/DatosARs/DatosReplanificaciones/DatosRiesgos
      -> parse NC, ACs, ARs, risks, replans
      -> link AC.NC and AR.AC
      -> mark loaded / loaded-empty
      -> return trusted graph

invalid/corrupt payload -> InvalidarCache + log -> explicit miss -> DAO path may run only as miss
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/classes/NCProyecto.cls` | Modify | Add loaded/cache flags. `ACs`, `Riesgos`, and `Replanificaciones` setters treat empty dictionaries as loaded-empty; `Nothing` resets. `EstadoCalculado`, `ACsSinAR`, `AlgunaACSinAR`, `TodasLasACsSinFechas`, `TodasLasArsFinalizadas`, `TieneAccionesPorReplanificar`, and `CodRiesgosAsociados` use cached dictionaries when loaded. |
| `src/classes/ACProyecto.cls` | Modify | Remove `Set Me.ARs = Nothing` from `EstadoCalculado`; add parent `NC` setter/link helper and `ARsLoaded`; derive AC state helpers from cached ARs when loaded. |
| `src/classes/ARProyecto.cls` | Modify | Preserve `AR.AC` links from cache and avoid parent lazy lookup in cached calculations. |
| `src/modules/CacheNCProyecto.bas` | Modify | Require all cache JSON sections; parse `{}`/empty arrays as loaded-empty; link `ACProyecto` to parent NC in `ParseJSONToACs`; fail on AR groups without parent AC; link each AR to its AC. |
| `src/forms/Form_FormNCProyectoAcciones.cls` | Modify | Populate AC/AR lists and resolve selections from `m_NC.ACs` / `m_ACSeleccionada.ARs` when loaded, with deterministic ordering; fallback only when not loaded. No `.form.txt` change planned. |
| `src/modules/CacheTrustDiagnostics.bas` | Create | Test-only guard/counters to assert cache-hit getters/list paths did not call constructor fallback. |
| `src/modules/Test_E2E_BateriaNC.bas`, `tests/tests.vba.cache-e2e.json` | Modify | Add strict cache-hit, loaded-empty, corrupt-cache, and no-fallback tests. |

## Interfaces / Contracts

Loaded flags are read-only outside the owning object except explicit marker methods used by cache hydration. Assigning an empty dictionary means authoritative loaded-empty. Assigning `Nothing` means unloaded/reset and may allow legacy DAO fallback outside a trusted cache-hit path.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Object | AC/NC calculated states, empty AC/AR/risk semantics, `CodRiesgosAsociados`. | `Public Function` tests returning canonical JSON, in-memory dictionaries, strong value assertions, zero fallback counter. |
| Integration | Valid cache hit and corrupt/incomplete invalidation. | `dysflow.test_vba` only after user manual compile. Schema-first fixtures for `TbNoConformidades`, `TbNCAccionCorrectivas`, `TbNCAccionesRealizadas`, `TbReplanificacionesProyecto`, `TbCacheNCProyecto`, `TbRiesgos`, `TbRiesgosNC`; deterministic IDs >= 900000; seed parents first, teardown reverse FK order. |
| UI seam | Action list/selection uses cached objects. | Extracted helper or focused form smoke; no dependency on existing user data. |

## Migration / Rollout

No data migration required. Existing invalid cache rows become explicit misses and regenerate through the existing DAO path. Rollback is reverting/importing changed modules; user compiles manually in Access VBE.

## Open Questions

- [ ] Confirm exact PK/FK/required fields and domain values with Dysflow schema before writing any data-touching fixture.
