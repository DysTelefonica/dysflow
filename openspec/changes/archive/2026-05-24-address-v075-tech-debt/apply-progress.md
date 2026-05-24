# Apply Progress: Address v0.7.5 Technical Debt (PR4)

> Artifact store: hybrid | Change: address-v075-tech-debt | Date: 2026-05-24
> GitHub issue: #295 | Delivery: auto-chain, stacked-to-main | TDD: RED → GREEN → REFACTOR

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1.1 | `test/core/services/vba-form-service.test.ts` | Unit | N/A (new) | ✅ Written (import failure) | ✅ Passed | ✅ 6 cases | ✅ Clean |
| 3.2.1 | `test/core/services/vba-source-comparison.test.ts` | Unit | N/A (new) | ✅ Written (import failure) | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 3.3.1 | `test/core/services/vba-sync-legacy-service.test.ts` | Integration | ✅ 48/48 passed | ✅ Written (compile/spy failures) | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 4.1.1 | `test/cli/install-utils.test.ts` | Unit | N/A (new) | ✅ Written (import failure) | ✅ Passed | ✅ 4 helper tests | ✅ Clean |
| 4.2.1 | `test/cli/install-utils.test.ts` | Static Analysis | N/A (new) | ✅ Written (graph violation) | ✅ Passed | ✅ 1 tracer | ✅ Clean |

### Test Summary
- **Total tests written**: 5 new tests/assertions verifying CLI helper functions and import isolation.
- **Total tests passing**: 458 total suite tests.
- **Layers used**: Unit (Vitest), Static Analysis (Vitest).

## Implementation Summary

We completed the PR4 task unit which extracts installer utilities and decouples the uninstaller command from the installer command module:
1. **Shared Install Utilities Module**: Created `src/cli/commands/install-utils.ts` and exported helper functions `fileExists`, `readJson`, `writeJson`, `ensureObject`, `runCommand`, and `runCommandOutput`, moving their implementations from `install.ts`.
2. **Decoupled uninstall.ts**: Modified `src/cli/commands/uninstall.ts` to import all its CLI-level and file-system helpers exclusively from `./install-utils.js`, removing any direct or transitive imports of `install.ts` from its dependency tree.
3. **Migrated install.ts**: Updated `src/cli/commands/install.ts` to import its filesystem and execution helpers from `./install-utils.js`. Kept backward-compatibility exports for `fileExists`, `removeDysflowMcpConfig`, `ALL_AGENTS`, `AgentName`, `AgentConfigPaths`, and `MAX_SUBPROCESS_BUFFER_BYTES` so downstream consumers are not broken.
4. **Added Unit & Static Verification**: Created `test/cli/install-utils.test.ts` with unit tests for each utility and a recursive static-analysis test to assert complete import graph isolation.
