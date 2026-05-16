# Proposal: Convert raw throws to OperationResult failures

## Intent

Two functions inside the core layer throw raw `Error` objects on input-validation failures, bypassing the `OperationResult<T>` discriminated union that every service boundary must use. The result: CLI, MCP-stdio and HTTP adapters surface unhandled exceptions instead of typed, retryable-aware failures.

This change converts both throws into `failureResult(createDysflowError(...))` so the entire error path stays within the contract. Closes GitHub issues #61 and #62.

## Scope

### In Scope
- `src/core/config/dysflow-config.ts` — replace the ambiguous-config `throw` in `findWorktreeProjectConfigPath` with a typed failure surfaced by `loadDysflowConfig`.
- `src/core/services/vba-sync-legacy-service.ts` — wrap `normalizeTestPlan` (and the surrounding `readFile`/`JSON.parse` in `resolveTestProceduresJson`) so `executeTestVba` returns `failureResult` for malformed plans.
- New error codes: `CONFIG_AMBIGUOUS_PROJECT_FILE`, `VBA_INVALID_TEST_PLAN`.
- Vitest coverage for both failure paths.

### Out of Scope
- Auditing every other service for raw throws (separate hardening pass).
- Reorganising `vba-sync-legacy-service` parity coverage.
- Schema validation for `tests.vba.json` beyond the existing checks (procedure presence, array shape).
- Behavioural changes to the success path of either function.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `core-configuration`: add `CONFIG_AMBIGUOUS_PROJECT_FILE` as a typed loader failure.
- `access-core-services`: add `VBA_INVALID_TEST_PLAN` as a typed failure for the `test_vba` tool path.

## Approach

**Bug 1 — `findWorktreeProjectConfigPath`**

Keep the helper synchronous and unaware of `OperationResult`. Change its return type to `{ path?: string; ambiguous?: { cwd: string; candidates: string[] } }` (or equivalent discriminated tuple) so it can report "ambiguous" without throwing. `loadDysflowConfig` then converts the ambiguous case into `failureResult(createDysflowError("CONFIG_AMBIGUOUS_PROJECT_FILE", ...))` alongside its existing `CONFIG_MISSING_ACCESS_PATH` / `CONFIG_PROJECT_*` branches. Rationale: keeps the helper pure and mirrors the existing pattern where loader branches own their `OperationResult` construction.

**Bug 2 — `normalizeTestPlan`**

Wrap the failure-prone block inside `resolveTestProceduresJson` (the `readFile`, `JSON.parse`, and `normalizeTestPlan` calls) in a `try/catch`. Convert any caught error into `failureResult(createDysflowError("VBA_INVALID_TEST_PLAN", ...))`. Change `resolveTestProceduresJson`'s signature from `Promise<string>` to `Promise<OperationResult<string>>` so the contract is explicit; `executeTestVba` short-circuits and returns the failure directly. `normalizeTestPlan` itself stays as a pure validator that throws internally — the boundary that converts to `OperationResult` is `resolveTestProceduresJson`.

Both fixes follow the existing `failureResult(createDysflowError(...))` pattern already used across the loader and the legacy service.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/config/dysflow-config.ts` | Modified | `findWorktreeProjectConfigPath` no longer throws; `loadDysflowConfig` adds a new failure branch. |
| `src/core/services/vba-sync-legacy-service.ts` | Modified | `resolveTestProceduresJson` returns `OperationResult<string>`; `executeTestVba` propagates failures. |
| `src/core/contracts/index.ts` (constant catalogue, if any) | Possibly modified | Register the two new error codes if a code catalogue exists. |
| Vitest specs alongside both modules | New tests | Cover ambiguous-config and invalid-test-plan paths. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Adapter callers relied on the implicit throw to short-circuit. | Low | All adapter callers already inspect `result.ok`; the failure path becomes typed and explicit. |
| Changing `resolveTestProceduresJson`'s return type breaks an unseen caller. | Low | Grep confirms `executeTestVba` is the only caller; update it in the same PR. |
| Error messages drift from the originals and break user expectations. | Low | Preserve the existing message text inside the new `DysflowError.message`. |

## Rollback Plan

Single PR, single revert. `git revert <pr-merge-commit>` restores both functions to their throwing behaviour. No data, schema, or configuration migrations involved.

## Dependencies

- None — uses existing `failureResult` / `createDysflowError` helpers and existing test harness (`vitest run`).

## Success Criteria

- [ ] `loadDysflowConfig` with two distinct worktree config files returns `failureResult` with code `CONFIG_AMBIGUOUS_PROJECT_FILE`; no exception escapes.
- [ ] `execute({ tool: "test_vba" })` with a malformed `tests.vba.json` returns `failureResult` with code `VBA_INVALID_TEST_PLAN`; no exception escapes.
- [ ] `grep` on `src/core/{config,services}` finds no remaining `throw new Error` inside the two touched functions.
- [ ] New vitest cases for both failure paths pass; full `vitest run` stays green.
- [ ] GitHub issues #61 and #62 are linked and closed by the merging PR.
