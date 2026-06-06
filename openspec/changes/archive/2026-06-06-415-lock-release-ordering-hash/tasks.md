# Tasks: Lock Release Ordering + Hash (#415)

## Checklist

- [x] **D1**: In `getCrossProcessLockPath` (line 343), change `createHash("md5")` to
  `createHash("sha256")` and truncate digest to 16 hex chars via `.slice(0, 16)`.

- [x] **B2**: In `runWithAccessExecutionLock` `finally` block (lines 424-429), reorder so
  `await releaseCrossProcessAccessLock(lockPath)` runs BEFORE `releaseCurrent()` and the
  map delete. `stopHeartbeat()` stays first.

- [x] **Tests**: Verify full unit suite (`pnpm test`) stays green. No new tests required
  unless a cheap observable invariant exists for B2 (lock dir absent + subsequent acquire
  succeeds without EEXIST retry) — assessed and deferred since the heartbeat tests already
  cover the observable post-release state.

- [x] **tsc**: `pnpm exec tsc --noEmit` passes with zero errors.

- [x] **Commit**: Conventional commit on branch `refactor/415-lock-release-ordering-hash`.
  No AI attribution lines.
