# Tasks: De-flake access-runner-lock-heartbeat test (#426)

## Task list

- [x] Confirm root cause: `startLockHeartbeat` uses fire-and-forget `utimes` call; `advanceTimersByTimeAsync` cannot await it.
- [x] Add `vi.waitFor` poll after `advanceTimersByTimeAsync` in the first heartbeat test, waiting until `stat().mtimeMs > staleTime.getTime()`.
- [x] Run full test suite 6+ times and confirm no heartbeat test failures.
- [x] Run heartbeat test file in isolation 6 times.
- [x] Run `pnpm lint` — verify only pre-existing CRLF false-positives on unchanged files.
- [x] Create openspec artifacts.
- [x] Commit on branch `test/426-deflake-lock-heartbeat`.

## Files changed

- `test/core/runner/access-runner-lock-heartbeat.test.ts` — add `vi.waitFor` poll between timer advance and mtime assertion
- `openspec/changes/426-deflake-lock-heartbeat/proposal.md` — this proposal
- `openspec/changes/426-deflake-lock-heartbeat/tasks.md` — this task list
