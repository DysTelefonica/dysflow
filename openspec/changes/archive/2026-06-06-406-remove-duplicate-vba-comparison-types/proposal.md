# Proposal: 406-remove-duplicate-vba-comparison-types

**Issue**: #406
**Type**: Pure type move — no spec delta, no behavior change.

## Problem

Five domain types are defined twice in the codebase:

- `VbaSourceComparisonFile`
- `VbaSourceComparisonEntry`
- `VbaSourceDiffEntry`
- `VbaVerifyResult`
- `VbaReconcilePlanResult`

**Canonical location** (source of truth): `src/core/services/vba-source-comparison.ts` lines 16-51.
**Duplicate location** (to delete): `src/adapters/vba-sync/vba-sync-adapter.ts` lines 30-65.

Both definitions were structurally identical at the time of this change (verified field-by-field).

## Approach

1. Delete the duplicate type declarations from the adapter file.
2. Add `export type { ... } from "../../core/services/vba-source-comparison.js"` in the adapter so any
   existing or future code that imports these types from the adapter continues to work unchanged.
3. The existing `export { collectVbaSourceFiles, compareSourceAgainstBinary, compareVbaSourceTrees,
   planReconcileBinary } from "../../core/services/vba-source-comparison.js"` at the bottom of the
   adapter is left intact — it already re-exported the function surface; only types were missing.

## Why This Is Safe

- The adapter already re-exports symbols from core (e.g. `VbaFormService`), confirming the pattern is
  established and intentional.
- No file in `src/` or `test/` currently imports the five types directly from the adapter — they either
  consume them from core directly, or do not use them at all.
- `tsc --noEmit` is the proof of type unification soundness. It passed clean.
- The architecture boundary test (`test/architecture/core-boundary.test.ts`) enforces that adapters may
  import core but not vice versa. An adapter importing types from core is correct by design.

## No Rollback Risk

This is a pure type move. Compiled JavaScript output is unaffected (type-only declarations and
`export type` produce no runtime code). Zero behavior change.
