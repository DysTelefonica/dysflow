# Proposal: Trust NCProyecto Cache Hits

## Intent

Implement GitHub issue #39: a valid `TbCacheNCProyecto` hit must be trusted as a fully in-memory read/open path. Incomplete or corrupt cache data must become an explicit miss/invalidation, not a silent DAO fallback from lazy getters.

## Scope

### In Scope
- Hydrate a complete cached object graph: `NCProyecto -> ACProyecto -> ARProyecto`, risks, and replanifications.
- Distinguish “loaded empty” from “not loaded” for cached dictionaries/collections.
- Route cache-hit read calculations and UI list population through hydrated in-memory objects.
- Add strict TDD coverage: object-level tests first; data-touching tests only after schema inspection with explicit sandbox fixtures.

### Out of Scope
- Changing write/save workflows or cache generation semantics beyond invalidating corrupt reads.
- Replacing DAO fallback for non-cache objects or explicit cache misses.
- Manual validation with NC0260 as an automated fixture.

## Capabilities

### New Capabilities
- `ncproyecto-cache-trust`: Defines trusted cache-hit behavior, explicit miss/invalidation, and no hidden DAO fallback for cached read/open paths.

### Modified Capabilities
- None. `openspec/specs/` has no existing capability specs to modify.

## Approach

Use the exploration’s cache-aware in-memory read path. `CacheNCProyecto.ObtenerNCDesdeCache` should validate required JSON sections, build parent links, mark empty collections as loaded, and return `Nothing`/invalidate explicitly on corrupt cache. `NCProyecto` and `ACProyecto` should prefer hydrated collections for calculated state, risks, codes, and AC/AR lists when the object came from cache. Keep legacy `constructor` DAO helpers for non-cache objects and explicit miss paths only. Add a limited diagnostic guard for accidental DAO fallback from cache-hit reads.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/modules/CacheNCProyecto.bas` | Modified | Cache validation and complete object graph hydration. |
| `src/classes/NCProyecto.cls` | Modified | In-memory cached calculations, risks, and risk-code reads. |
| `src/classes/ACProyecto.cls` | Modified | Preserve cached ARs and parent NC link. |
| `src/classes/ARProyecto.cls` | Modified | Parent-link integrity for cached ARs. |
| `src/forms/Form_FormNCProyectoAcciones.cls` | Modified | Use cached AC/AR collections for lists/selections. |
| `src/modules/Test_E2E_BateriaNC.bas`, `tests/tests.vba.cache-e2e.json` | Modified | Strict fixture-first cache-hit regression coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Empty vs unloaded collections regress behavior | High | Add explicit loaded flags/sentinels and tests for empty AC/AR/risk shapes. |
| In-memory state differs from SQL semantics | Medium | Cover AC without AR, unfinished AR, overdue AR, and finalised AR scenarios. |
| Cached dictionary order changes UI | Medium | Sort deterministically before listbox population. |
| Change exceeds review budget | Medium | Split implementation into chained slices during tasks if forecast exceeds 400 changed lines. |

## Rollback Plan

Revert changed VBA modules/forms and test manifests, re-import affected modules with Dysflow, then the user manually compiles in Access VBE. Existing DAO miss behavior remains available because non-cache and explicit miss paths are preserved.

## Dependencies

- Dysflow MCP projectId `00-no-conformidades-staging-clean` for future imports/tests.
- User manual compile after any import.
- Schema inspection before any data-touching test fixture.

## Success Criteria

- [ ] Valid cache-hit open/read paths do not call DAO-backed constructor helpers.
- [ ] Corrupt or incomplete cache is an explicit miss/invalidation.
- [ ] Cached empty collections stay loaded-empty, not fallback-unloaded.
- [ ] Strict TDD tests use explicit sandbox fixtures and strong cardinality/value assertions.
