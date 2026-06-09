# Exploration: trust-ncproyecto-cache-hits

## Current State

GitHub issue #39 (`fix(cache): make NCProyecto cache hits fully in-memory`) is open and defines the architecture decision: a valid `TbCacheNCProyecto` hit must be trusted for read/open paths. If cache data is incomplete or corrupt, the system should expose an explicit miss/invalidation instead of silently falling back to DAO from lazy getters.

`constructor.getNCProyecto` already attempts `CacheNCProyecto.ObtenerNCConCache` when cache is enabled and falls back to DAO only when no object is returned. Partial hotfixes are present: `CacheNCProyecto.ObtenerNCDesdeCache` now keeps an explicit `ACs` dictionary, `ParseJSONToARsEnACs` receives parsed ACs without invoking `NCProyecto.ACs`, `NCProyecto.EstadoCalculado` no longer clears `.ACs`, and `Form_FormNCProyectoGeneral.EstablecerDatos` no longer persists calculated state/dates during visual load.

The remaining blockers are read-path fallbacks after a cache hit. `ACProyecto.EstadoCalculado` still clears `ARs`, `NCProyecto.EstadoCalculado` still calls DAO-backed helper properties, `NCProyecto.Riesgos` treats an empty dictionary as unloaded, `CodRiesgosAsociados` ignores cached risks, parsed `ACProyecto` objects do not have their parent `NCProyecto` linked, and `Form_FormNCProyectoAcciones` list/selection paths still rebuild AC/AR objects through `constructor`.

## Affected Areas

- `src/classes/NCProyecto.cls` — owns cache-sensitive read properties: `EstadoCalculado`, `ACsSinAR`, `TodasLasACsSinFechas`, `TodasLasArsFinalizadas`, `TieneAccionesPorReplanificar`, `Riesgos`, and `CodRiesgosAsociados`.
- `src/classes/ACProyecto.cls` — `EstadoCalculado` currently destroys cached `ARs`; `ARs` and `nc` getters can requery through `constructor` if object graph is incomplete.
- `src/classes/ARProyecto.cls` — relevant for parent-link integrity through `AR.AC = AC` and for in-memory state calculations over cached ARs.
- `src/modules/CacheNCProyecto.bas` — hydrates `NCProyecto`, `ACProyecto`, `ARProyecto`, `Replanificaciones`, and `Riesgos` from JSON; should validate required cache sections and build a complete object graph.
- `src/modules/constructor.bas` — current DAO fallback entry point for `getNCProyecto`, `getACsProyecto`, `getARsDeACProyecto`, `getACsProyectosSinAR`, and `getCodRiesgosAsociados`; useful for miss paths but not for trusted cache-hit reads.
- `src/forms/Form_FormNCProyectoGeneral.cls` — reads calculated state and risk labels during opening; currently benefits from partial load-write hotfix.
- `src/forms/Form_FormNCProyectoAcciones.cls` — `EstablecerListaAC`, `EstablecerListaAR`, `ListaAC_Click`, and `ListaAR_Click` call constructors even when active NC/AC collections may already be hydrated.
- `src/modules/Test_E2E_BateriaNC.bas` and `tests/tests.vba.cache-e2e.json` — existing cache E2E harness and schema-readiness helpers are the natural place for strict TDD coverage, but new tests must seed explicit sandbox rows and must not depend on NC0260 existing data.

## Approaches

1. **Cache-aware in-memory read path** — Add explicit cache-hydrated state to `NCProyecto`/`ACProyecto` and route read-only calculations/lists through already hydrated dictionaries when present.
   - Pros: Matches the architecture decision directly; preserves DAO behavior for non-cache objects; allows explicit cache miss/invalidation when required sections are absent.
   - Cons: Requires careful distinction between “loaded empty” and “not loaded”; needs small helper methods to avoid duplicating calculation loops.
   - Effort: Medium.

2. **Constructor-level global cache lookup** — Teach `constructor.getACsProyecto`, `getARsDeACProyecto`, and related helpers to discover and reuse cached objects globally.
   - Pros: Centralizes fallback behavior in existing DAO gateway.
   - Cons: Blurs ownership of object graphs, risks hidden fallbacks staying hidden, and makes “explicit miss” harder to reason about.
   - Effort: Medium/High.

3. **Fail-fast cache-only mode for openings** — Mark objects returned from cache as cache-only and raise/invalidate on any getter that would use DAO.
   - Pros: Strong diagnostic guarantee; quickly exposes remaining hidden fallbacks.
   - Cons: Higher regression risk in legacy UI paths that still expect lazy DAO; probably too disruptive as a first implementation slice.
   - Effort: High.

## Recommendation

Use approach 1, with a limited diagnostic guard from approach 3. The proposal should define a cache-hit contract where `CacheNCProyecto.ObtenerNCDesdeCache` builds a complete in-memory object graph (`NC -> ACs -> ARs`, risks, replanifications), marks empty dictionaries as loaded, and invalidates/misses explicitly when required JSON sections cannot be parsed. `NCProyecto` and `ACProyecto` should then prefer in-memory calculations for cache-hydrated objects, while legacy DAO helpers remain available for non-cache objects or explicit miss paths.

Strict TDD should start with small object-level tests that do not need DAO, then add write-controlled sandbox E2E tests only after schema inspection. For data-touching tests, seed deterministic NC/AC/AR/risk/cache rows in the local backend, assert exact cardinality, and teardown in reverse FK order. NC0260/ID 434 can be used as manual validation evidence only, not as a test fixture.

## Risks

- Distinguishing “loaded empty” from “not loaded” is the core correctness risk; using `Nothing` for both caused the current bug.
- Some calculated states currently use SQL semantics over linked tables; in-memory equivalents must match edge cases for empty ACs, ACs without ARs, unfinished ARs, overdue ARs, and control-efficacy states.
- UI list ordering currently comes from `constructor` order maps; cached dictionary enumeration may need deterministic sorting before populating listboxes.
- Parent-link fixes need a setter on `ACProyecto.nc` or another safe linking method; adding it is small but touches a core class.
- Diagnostic telemetry for `CacheFallbackDAO` must not become noisy for intentional write paths, explicit invalidations, or non-cache objects.
- Review budget risk is medium: affected areas span multiple classes/modules/forms and tests; task planning should consider chained slices if implementation exceeds 400 changed lines.

## Ready for Proposal

Yes. The change is concrete enough for `sdd-propose`: scope should be limited to trusted cache-hit read/open behavior for `NCProyecto`, with explicit miss/invalidation on corrupt cache, strict Access/VBA fixture-first tests, manual compile by the user after imports, and no production-source changes during exploration.
