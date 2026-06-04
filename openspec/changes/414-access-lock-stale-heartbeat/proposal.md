# Proposal: Cross-Process Lock Heartbeat (issue #414)

## Problem

**File:** `src/core/runner/access-runner.ts`
**Functions:** `acquireCrossProcessAccessLock` (~L347), `runWithAccessExecutionLock` (~L373)
**Constant:** `CROSS_PROCESS_LOCK_STALE_MS = 30_000`

The cross-process lock directory is declared stale when
`Date.now() - lockDir.mtimeMs > CROSS_PROCESS_LOCK_STALE_MS`.
The lock owner never refreshes the mtime while it holds the lock.

**Consequence:** A legitimate Access operation that runs longer than 30 s can have its lock
silently deleted by a second dysflow process that sees the stale mtime, then both processes
run Access on the same database concurrently — violating the mutual-exclusion contract.

## Decided approach

1. **Heartbeat (primary fix):** The owner starts a `setInterval` immediately after acquiring
   the lock. The interval is `CROSS_PROCESS_LOCK_STALE_MS / 2` (15 s), so at least one
   heartbeat always falls well inside any legitimate hold window. Each tick calls
   `fs.utimes(lockPath, now, now)` to update the mtime. The timer is cleared in the `finally`
   block of `runWithAccessExecutionLock` — before `releaseCrossProcessAccessLock` — ensuring
   no timer leaks.

2. **Owner identity (strengthening):** The owner file written on acquisition is changed from
   `owner` (plain pid text) to `owner.json` containing `{ pid, startedAt }`. This enables
   richer diagnostics without changing the stale-detection logic (mtime remains the authority).

## Why this approach

A heartbeat is the minimal, cross-platform, non-racy solution. Alternatives considered:
- **PID liveness check:** Windows-only, adds a process-inspection dependency to lock-acquire
  hot path, and still has a TOCTOU window.
- **Shorter STALE_MS:** Breaks operations that legitimately take, say, 25 s (a non-trivial
  Access import). 30 s is already generous; halving it creates false positives.
- **Heartbeat only (chosen):** Zero platform coupling, testable with fake timers, minimal diff.
