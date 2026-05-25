# Archive Report: Extract VbaSyncLegacyService to the adapters layer

| Field | Value |
|-------|-------|
| Change Name | `vba-sync-legacy-service-to-adapter` |
| Status | CLOSED |
| Archive Date | 2026-05-25 |
| Delivery | 3 PRs (stacked-to-main) |

## Summary

Relocated the process-spawning `VbaSyncLegacyService` out of the core boundary into the adapters layer as `VbaSyncLegacyAdapter`. Introduced `LegacyVbaSyncPort` in core contracts to maintain architectural clean separation.

## PRs

| PR | Title | Status |
|----|-------|--------|
| PR1 | Introduce `LegacyVbaSyncPort` in core contracts | Merged |
| PR2 | Move the adapter to `src/adapters/vba-sync/` + rewire composition root | Merged |
| PR3 | Relocate remaining pure exports + delete the core shim | Merged |

## Key Artifacts

- `src/core/contracts/index.ts` — contains the `LegacyVbaSyncPort` definition
- `src/adapters/vba-sync/vba-sync-legacy-adapter.ts` — new location of the legacy sync adapter
- `test/adapters/vba-sync/vba-sync-legacy-adapter.test.ts` — legacy adapter test suite
- `src/core/services/vba-import-plan.ts` — pure plan helper extraction location
