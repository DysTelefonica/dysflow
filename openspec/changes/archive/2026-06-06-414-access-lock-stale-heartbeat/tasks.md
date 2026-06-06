# Tasks: Cross-Process Lock Heartbeat (issue #414)

TDD checklist — items are checked off as completed.

## Setup

- [x] Create branch `fix/414-access-lock-stale-heartbeat`

## RED phase

- [x] Write failing test: "heartbeat refreshes lock dir mtime so a second acquirer cannot
      steal a live lock" in `test/core/runner/access-runner-lock-heartbeat.test.ts`
- [x] Confirm test FAILS against unmodified code (AssertionError: expected 50000 to be less than 30000)

## Implementation

- [x] Add `utimes` to `node:fs/promises` import in `access-runner.ts`
- [x] Change `owner` file to `owner.json` with `{ pid, startedAt }` JSON payload
- [x] Implement `startLockHeartbeat(lockPath)` — returns `() => void` cleanup
  - [x] Interval = `CROSS_PROCESS_LOCK_STALE_MS / 2`
  - [x] Swallow `utimes` errors
  - [x] `unref()` the timer handle
- [x] In `runWithAccessExecutionLock`: call `startLockHeartbeat` after acquire
- [x] In `finally`: call `stopHeartbeat()` as first statement

## GREEN phase

- [x] Test "heartbeat refreshes lock dir mtime..." passes
- [x] Test "heartbeat timer is cleared after the operation completes..." passes
- [x] All 860 existing tests still pass (3 skipped, 0 failures)

## Static analysis

- [x] `pnpm exec tsc --noEmit` — clean
- [x] `pnpm exec biome check` — no NEW issues introduced (pre-existing CRLF format issues
      in the repo are unchanged; verified by counting before/after with stash)

## SDD artifacts

- [x] `openspec/changes/414-access-lock-stale-heartbeat/proposal.md`
- [x] `openspec/changes/414-access-lock-stale-heartbeat/design.md`
- [x] `openspec/changes/414-access-lock-stale-heartbeat/tasks.md`
- [x] Engram apply-progress saved

## Notes / deviations from design spec

- `accessExecutionLocks` injectable-Map refactor (D4) skipped as instructed — out of scope.
- `owner` file renamed to `owner.json` (design spec said "e.g. owner.json"); the plain-text
  `owner` file written by `acquireCrossProcessAccessLock` is different from the `owner` file
  used by `FileAccessOperationRegistry` (a separate lock mechanism) — no conflict.
