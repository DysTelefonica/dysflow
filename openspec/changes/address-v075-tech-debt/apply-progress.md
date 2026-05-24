# Apply Progress: Address v0.7.5 Technical Debt (PR3)

> Artifact store: hybrid | Change: address-v075-tech-debt | Date: 2026-05-24
> GitHub issue: #295 | Delivery: auto-chain, stacked-to-main | TDD: RED → GREEN → REFACTOR

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1.1 | `test/core/services/vba-form-service.test.ts` | Unit | N/A (new) | ✅ Written (import failure) | ✅ Passed | ✅ 6 cases | ✅ Clean |
| 3.2.1 | `test/core/services/vba-source-comparison.test.ts` | Unit | N/A (new) | ✅ Written (import failure) | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 3.3.1 | `test/core/services/vba-sync-legacy-service.test.ts` | Integration | ✅ 48/48 passed | ✅ Written (compile/spy failures) | ✅ Passed | ✅ 2 cases | ✅ Clean |

### Test Summary
- **Total tests written**: 11 new tests/assertions verifying extracted service behaviors and delegation.
- **Total tests passing**: 59 service tests / 453 total suite tests.
- **Layers used**: Unit (Vitest), Integration (Vitest).
- **Approval tests** (refactoring): 48 existing VBA legacy service tests serving as approval/characterization tests.
- **Pure functions created**: 10+ (pure functions extracted to `vba-source-comparison.ts` for folder traversals and file comparisons).

## Implementation Summary

We completed the PR3 task unit which splits VBA service responsibilities:
1. **Form Operations Extraction**: Extracted `validateFormSpec`, `generateForm`, `catalogAddControl`, `harvestFormCatalog`, and `resolveFormSpec` from `VbaSyncLegacyService` into a new `VbaFormService` class under `src/core/services/vba-form-service.ts`.
2. **Comparison Operations Extraction**: Extracted `compareSourceAgainstBinary`, `compareVbaSourceTrees`, `collectVbaSourceFiles`, and related tree-diff helpers into `src/core/services/vba-source-comparison.ts` as free exported functions.
3. **Coordinator Delegation & Compatibility**: Refactored `VbaSyncLegacyService` to instantiate `VbaFormService` and import comparison free functions. Updated its `execute()` coordinator method to delegate form and verification branches to the respective services. Added backwards compatibility re-exports of all relocated symbols to prevent downstream breakage.
