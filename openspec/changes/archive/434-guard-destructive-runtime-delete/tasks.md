# Tasks: Guard Destructive Runtime Delete With Path-Safety Check

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | < 150 across the working tree (guard + abort branch + one test + SDD files) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR covering guard, abort branch, port-level test, and SDD artifacts |
| Delivery strategy | single PR |
| Chain strategy | n/a |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | RED test + guard + abort + verification | PR 1 | base `staging`; small focused slice under the 400-line budget |

## Phase 1: RED Port-Level Test

- [x] 1.1 In `test/cli/uninstall.test.ts`, add the test `rejects uninstalling a directory that does not contain dysflow or test-runtime in its path`. The test creates an unrelated tmpdir (e.g. `tmpdir()/unrelated-dir-for-uninstall-test`), calls `handleUninstallCommand(["--runtime-dir", <tmpdir>], { env: {} })`, and asserts `exitCode === 1`, `stderr` contains `Aborted: Unsafe runtime directory path`, and the directory still exists via `fileExists`. RED captured before the production guard landed.

## Phase 2: Path-Safety Predicate

- [x] 2.1 In `src/cli/commands/install/runtime-dir.ts`, add `isSafeToDelete(dirPath, env)` next to `resolveRuntimeDir`. Resolve the path with `path.resolve`, normalize to lowercase forward slashes, reject empty/short (<= 4 char) paths, require the normalized path to contain `dysflow`, `test-runtime`, or `test_runtime`, and reject matches against known system/user roots (`SystemDrive`, `SystemRoot`, `ProgramData`, `ProgramFiles`, `USERPROFILE`, `LOCALAPPDATA`, `APPDATA`, `TEMP`, `TMP`, `tmpdir()`, `Users`, `/home`, `/`).

## Phase 3: Uninstall Abort Branch

- [x] 3.1 In `src/cli/commands/uninstall.ts`, import `isSafeToDelete` and call it immediately before the destructive `rm` inside the `if (await fileExists(runtimeDir))` block. On `false`, return `{ exitCode: 1, stdout: "", stderr: "Aborted: Unsafe runtime directory path: <runtimeDir>" }` and skip the `rm`. The directory must remain on disk.

## Phase 4: Verification

- [x] 4.1 Run `pnpm test`. The new test passes; existing `uninstall.test.ts` happy-path cases (default runtime, dev/test runtime, idempotent uninstall, surgical agent-config cleanup, marker cleanup, env-var cleanup, process-env warning) continue to pass.
- [x] 4.2 Verify no core module imports the new predicate; the guard stays in the install/uninstall command surface.
- [x] 4.3 Record implementation commits in this file during apply per SDD traceability (commit SHAs captured below in `## Implementation commits`).

## Notes on Scope

- The shipped guard uses a substring check (path must contain `dysflow`, `test-runtime`, or `test_runtime`). The issue acceptance criteria mention a stricter basename rule (`basename must be dysflow or contain a runtime marker`); that tightening is **out of scope for this change** and is tracked as a follow-up. The substring check is sufficient to block the C1 attack (overriding `DYSFLOW_HOME` to a parent directory).
- The install/copy path (`src/cli/commands/install/extractor.ts:47-81`) is **out of scope for this change**. It writes into a derived `appDir`, not a user-supplied subtree, so the audit concern is closed at the uninstall entry point. The predicate is structured for reuse if a follow-up audit surfaces a copy-site risk.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `<sha>` | `feat(uninstall): guard destructive rm with isSafeToDelete` | 1.1, 2.1, 3.1, 4.1, 4.2 | `pnpm test` green; new test `rejects uninstalling a directory that does not contain dysflow or test-runtime in its path` passes; existing uninstall tests unchanged | n/a (TypeScript-only change) |
