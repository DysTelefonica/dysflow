# Tasks: Unify Path Normalization with Portable isAbsolutePath

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~60 total (well under review budget) |
| 400-line budget risk | Very low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-PR |
| Chain strategy | n/a |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Very low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add `isAbsolutePath`, migrate call sites, fix cleanup asymmetry, add tests | PR 1 | Single small slice |

## Phase 1: Add isAbsolutePath (RED → GREEN)

- [x] 1.1 Create `test/core/utils/path-utils.test.ts` with 13 pure-function tests for `isAbsolutePath` covering Windows drive-letter (forward-slash and backslash), UNC, POSIX, and relative/empty forms. Run `pnpm test` and confirm RED (function not yet exported).
- [x] 1.2 Add `isAbsolutePath(value: string): boolean` to `src/core/utils/path-utils.ts`. It is auto-exported via `src/core/utils/index.ts` (which already does `export * from "./path-utils.js"`). Run `pnpm test` and confirm GREEN (13 tests pass).

## Phase 2: Migrate Call Sites

- [x] 2.1 In `src/core/config/dysflow-config.ts`: remove `isAbsolute` from the `node:path` import; add `isAbsolutePath` to the `../utils/index.js` import; replace both `isAbsolute(...)` calls with `isAbsolutePath(...)`.
- [x] 2.2 In `src/adapters/vba-sync/vba-execution-adapter.ts`: remove `isAbsolute` from the `node:path` import; add `isAbsolutePath` to the `../../core/utils/index.js` import; replace the one `isAbsolute(testsPath)` call with `isAbsolutePath(testsPath)`.
- [x] 2.3 In `src/cli/commands/setup.ts`: remove `isAbsolute` from the `node:path` import; add an import for `isAbsolutePath` from `../../core/utils/index.js`; replace the one `isAbsolute(value)` call with `isAbsolutePath(value)`.

## Phase 3: Fix Cleanup Asymmetry

- [x] 3.1 In `src/core/operations/access-operation-cleanup.ts`: replace `!normalizePathForMatching(commandLine).includes(normalizePathForMatching(record.accessPath))` with `!pathMatchesAccessPath(commandLine, record.accessPath)`. `pathMatchesAccessPath` is already imported; verify `normalizePathForMatching` is still needed elsewhere in the file before removing it from the import.

## Phase 4: Verification

- [x] 4.1 Run `pnpm test` — all 72 test files pass (964 tests, 3 skipped), 0 failed.
- [x] 4.2 Run `pnpm build` — TypeScript compilation produces no errors.
- [x] 4.3 Confirm the previously-failing Linux CI path: `vba-sync-adapter.test.ts` test "resolveExecutionTarget loads config from disk when accessPath is undefined and repo config exists" now succeeds because `isAbsolutePath("C:/db/project.accdb")` returns `true` on POSIX hosts.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification |
|---|---|---|---|
| (pending) | Add `isAbsolutePath`, migrate 4 call sites, fix cleanup asymmetry, add 13 tests | 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 4.1, 4.2, 4.3 | `pnpm test` 72/72 pass, `pnpm build` clean |
