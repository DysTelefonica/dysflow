# Tasks: 406-remove-duplicate-vba-comparison-types

**No spec delta — pure type move.**
**Review Workload Forecast**: 400-line budget risk: Low | Chained PRs recommended: No | Decision needed before apply: No

## Phase 1: Type consolidation

- [x] 1.1 Verify the two type definitions are structurally identical (field-by-field comparison).
- [x] 1.2 Delete the five duplicate `export type` declarations from `src/adapters/vba-sync/vba-sync-adapter.ts` (lines 30-65).
- [x] 1.3 Add `export type { VbaReconcilePlanResult, VbaSourceComparisonEntry, VbaSourceComparisonFile, VbaSourceDiffEntry, VbaVerifyResult } from "../../core/services/vba-source-comparison.js"` in the adapter to maintain the public re-export surface.

## Phase 2: Verification

- [x] 2.1 `pnpm exec tsc --noEmit` — clean (no output).
- [x] 2.2 `pnpm test` — 61 test files, 847 passed, 3 skipped, 0 failures.
- [x] 2.3 `pnpm exec biome check src/adapters/vba-sync/vba-sync-adapter.ts` — clean.
- [x] 2.4 `test/architecture/core-boundary.test.ts` — 3/3 tests passed.
- [x] 2.5 Confirmed biome failures in `src/` and `test/` scans are pre-existing (stash-verified), not introduced by this change.
