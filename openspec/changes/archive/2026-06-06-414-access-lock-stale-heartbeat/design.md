# Design: Cross-Process Lock Heartbeat

## Heartbeat

```
startLockHeartbeat(lockPath: string): () => void
```

- Interval: `CROSS_PROCESS_LOCK_STALE_MS / 2`
- Each tick: `utimes(lockPath, now, now).catch(() => {})` — swallows errors because the dir
  may already be gone during teardown.
- Timer is `unref()`-ed so it does not keep the Node.js event loop alive.
- Returns a cleanup function (`clearInterval(handle)`).

## Timer lifecycle

```
runWithAccessExecutionLock:
  acquire lock
  startHeartbeat        ← start immediately after lock is held
  try {
    await work()
  } finally {
    stopHeartbeat()     ← cleared BEFORE release so no tick can race a new owner
    releaseCurrent()
    delete from Map
    releaseCrossProcessAccessLock()
  }
```

The `stopHeartbeat()` call is the first statement in `finally`, guaranteeing no further
`utimes` calls can race against a new owner who has already acquired the lock dir.

## Stale-decision rule (unchanged)

```
Date.now() - stat(lockPath).mtimeMs > CROSS_PROCESS_LOCK_STALE_MS
```

With the heartbeat active the mtime is at most `CROSS_PROCESS_LOCK_STALE_MS / 2` old when
a concurrent acquirer checks it — so the stale condition is never triggered on a live lock.

## Owner identity

`owner.json` is written immediately after `mkdir` succeeds:

```json
{ "pid": 12345, "startedAt": "2026-06-04T08:00:00.000Z" }
```

Used for diagnostics only; the stale-eviction path does not read this file.

## Alternatives considered

| Option | Why rejected |
|--------|-------------|
| PID liveness check | Windows-only `tasklist` call; TOCTOU window; bloats acquire hot path |
| Shorter STALE_MS | Breaks 25 s+ legitimate operations; not a fix, just a band-aid |
| Heartbeat + PID liveness | More complex; heartbeat alone is sufficient and cross-platform |
