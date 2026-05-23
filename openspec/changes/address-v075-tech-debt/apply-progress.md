# Apply Progress: Address v0.7.5 Technical Debt (PR2)

> Artifact store: hybrid | Change: address-v075-tech-debt | Date: 2026-05-23
> GitHub issue: #295 | Delivery: auto-chain, stacked-to-main | TDD: RED → GREEN → REFACTOR

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1.1 | `test/core/config/dysflow-config.test.ts` | Unit | ✅ 29/29 passed | ✅ Written (import failure) | ✅ Passed | ✅ 6 cases | ✅ Clean |

### Test Summary
- **Total tests written**: 6 (new assertions verifying all routing paths of `loadDysflowConfigShared`)
- **Total tests passing**: 35 (configuration suite) / 442 (total suite)
- **Layers used**: Unit (Vitest)
- **Approval tests** (refactoring): 29 existing config tests serving as approval/characterization tests
- **Pure functions created**: 1 (`loadDysflowConfigShared` is a pure generic router callback wrapper)

## Implementation Summary

We extracted `loadDysflowConfigShared` to encapsulate all configuration routing logic, including checks for:
- Explicit `accessDbPath` (routes directly to `buildExplicitConfig`).
- Ambiguous configuration paths (raises `CONFIG_AMBIGUOUS_PROJECT_FILE` error).
- Deprecated requested project ID with registry fallback (raises `CONFIG_PROJECT_NOT_REGISTERED` error).
- Missing access path (raises `CONFIG_MISSING_ACCESS_PATH` error).
- Standard / legacy configuration loading via a generic `loadFromPath` callback.

Both `loadDysflowConfig` (sync) and `loadDysflowConfigAsync` (async) are now thin wrappers that resolve the repo-level configuration path and delegate config building/validation to `loadDysflowConfigShared` by passing their respective sync/async file loading callbacks.
