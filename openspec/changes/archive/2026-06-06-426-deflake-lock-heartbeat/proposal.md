# Proposal: De-flake access-runner-lock-heartbeat test (#426)

## Problem

The first test in `test/core/runner/access-runner-lock-heartbeat.test.ts` (introduced by #414) is
intermittently flaky. It uses `vi.useFakeTimers()` to advance fake time, then immediately `stat()`s
the lock dir to assert that the heartbeat refreshed the mtime.

Root cause: `startLockHeartbeat`'s `setInterval` callback is **not async** — it fires a
fire-and-forget `utimes(lockPath, now, now).catch(...)` without returning the promise. Because
`vi.advanceTimersByTimeAsync` can only await promises that timer callbacks explicitly return, the
`utimes` write is not awaited before the test reads the mtime. Roughly 1-in-3 test runs, the stat
happens before the filesystem write completes → `mtimeMs` is still the backdated stale value →
assertion fails.

## Options

1. **Poll until write settles** — After advancing timers, use `vi.waitFor` to poll `stat()` until
   `mtimeMs > staleTime.getTime()`. Deterministic: we set a known stale time and wait until the
   filesystem no longer shows it. No source changes needed.

2. **Behavioral lock contention test** — Assert via `acquireCrossProcessAccessLock` that a second
   acquirer cannot steal the lock. Requires exporting the internal acquire function or restructuring
   the test significantly.

3. **Inject touch function** — Add an optional `touchFn` parameter to `startLockHeartbeat` so the
   test can await it. Widens the production API unnecessarily.

## Decision

**Option 1** — polling via `vi.waitFor` after advancing timers. This is:
- The smallest change (test-only, no production code touched)
- Deterministic: polls real filesystem with a bounded 5 s timeout until the write lands
- Preserves the full behavioral guarantee from #414
- Does not export internals or widen the production API

The behavioral assertion is unchanged: after a heartbeat interval, the lock dir mtime must be
fresh so a second acquirer cannot steal the lock. We just wait for the write to settle before
reading.
