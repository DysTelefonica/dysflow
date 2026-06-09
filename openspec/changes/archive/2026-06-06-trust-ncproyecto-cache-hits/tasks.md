# Tasks: Trust NCProyecto Cache Hits

## Implementation Tasks

All tasks satisfied by single commit `23af345`.

- [x] T1: Implement cache-first `EstadoCalculado` — Route state calculation through `Me.ACs` when hydrated from cache, skip DAO fallback
- [x] T2: Implement cache-first `ACsSinAR` — Compute from in-memory ACs/ARs when hydrated, skip DAO fallback
- [x] T3: Implement cache-first `TieneAccionesPorReplanificar` — Check in-memory ARs when hydrated, skip DAO fallback
- [x] T4: Implement cache-first `TodasLasArsFinalizadas` — Evaluate from in-memory ACs/ARs when hydrated, skip DAO fallback
- [x] T5: Implement cache-first `TodasLasACsSinFechas` — Evaluate from in-memory ACs/ARs when hydrated, skip DAO fallback
- [x] T6: Implement cache-first `CodRiesgosAsociados` — Build from in-memory Riesgos when hydrated, skip DAO fallback
- [x] T7: Fix VBA rule 2 violation — Separate `Nothing` / `Count` checks in all cache-first properties
- [x] T8: Fix AR.AC linkage in `ParseJSONToARsEnACs` — Add `Set AR.AC = AC` to prevent reentrada DAO

## Verification Tasks

- [x] V1: Cache-trust diagnostics tests pass (3/3 green per commit message)
- [x] V2: Code compiles in Access VBE after import
- [x] V3: No constructor fallback on cache-hit read paths

## Task-to-Code Mapping

| Task | Code Location | Spec Requirement |
|------|--------------|-----------------|
| T1 | `NCProyecto.cls:541-632` (EstadoCalculado) | Req: Trusted cache-hit in-memory graph |
| T2 | `NCProyecto.cls:197-240` (ACsSinAR) | Req: Trusted cache-hit in-memory graph |
| T3 | `NCProyecto.cls:472-538` (TieneAccionesPorReplanificar) | Req: Trusted cache-hit in-memory graph |
| T4 | `NCProyecto.cls:1658-1714` (TodasLasArsFinalizadas) | Req: Trusted cache-hit in-memory graph |
| T5 | `NCProyecto.cls:1715-1771` (TodasLasACsSinFechas) | Req: Trusted cache-hit in-memory graph |
| T6 | `NCProyecto.cls:153-192` (CodRiesgosAsociados) | Req: Trusted cache-hit in-memory graph |
| T7 | All cache-first properties | VBA rule 2 compliance |
| T8 | `CacheNCProyecto.bas:1535` | Req: Parent-link integrity |