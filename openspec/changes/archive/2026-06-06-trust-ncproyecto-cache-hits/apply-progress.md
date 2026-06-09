# Apply Progress: Trust NCProyecto Cache Hits

## Implementation Commit

| Commit | Work Unit | SDD Tasks | Verification |
|-------|-----------|-----------|-------------|
| `23af345` | Cache-first NCProyecto read properties | T1-T8 | 3/3 cache-trust diagnostics green |

## Source Changes

### Files Modified

- `AGENTS.md`: +16 lines (VBA rule 2 documentation)
- `src/classes/NCProyecto.cls`: +160/-18 lines (cache-first properties)
- `src/modules/CacheNCProyecto.bas`: +4 lines (`Set AR.AC = AC`)

### Key Changes

1. **Cache-first state reads**: `EstadoCalculado`, `ACsSinAR`, `TieneAccionesPorReplanificar`, `TodasLasArsFinalizadas`, `TodasLasACsSinFechas` now check `If Not Me.ACs Is Nothing` before calling DAO constructors
2. **Cache-first risks**: `CodRiesgosAsociados` reads from `Me.Riesgos` when hydrated
3. **VBA rule 2 compliance**: All cache-first properties separate `Nothing` check from `.Count` access
4. **AR.AC linkage**: `ParseJSONToARsEnACs` now links `AR.AC = AC` to prevent reentrada

## Test Evidence

Commit message states: "Tests: 3/3 cache-trust diagnostics green"

## Notes

- This is a retroactive SDD — the implementation was merged before formalization
- GitHub issue #39 is closed by this commit
- Commit is reachable from staging branch