# Proposal: Lock Release Ordering + Hash (#415)

## Problem

Two independent correctness issues in `src/core/runner/access-runner.ts`:

### B2 — Release ordering window

In `runWithAccessExecutionLock`'s `finally` block (line ~424), the original order was:

```
stopHeartbeat()
releaseCurrent()              // ← unblocks next in-process waiter
map delete
await releaseCrossProcessAccessLock()  // ← removes lock dir
```

The next in-process waiter is unblocked by `releaseCurrent()` BEFORE the cross-process lock dir
is removed. That waiter immediately calls `acquireCrossProcessAccessLock` and hits `EEXIST`,
forcing at least one 50 ms retry even though the previous holder is about to remove the dir
milliseconds later. This is a race window, not a theoretical bug.

### D1 — MD5 for filesystem paths

`getCrossProcessLockPath` (line 342) uses `createHash("md5")`, which is a deprecated algorithm
for new use-cases (flagged by some security scanners). The observable contract — same path → same
lock dir, different paths → different lock dirs — is equally satisfied by SHA-256. Truncating to
16 hex chars (64 bits of entropy) keeps filenames short while eliminating any collision risk at
this scale.

## Approach

### B2 fix — file: `src/core/runner/access-runner.ts`, lines 424-429

Reorder the `finally` block so the cross-process filesystem lock is removed BEFORE
`releaseCurrent()` unblocks the next waiter:

```
stopHeartbeat()
await releaseCrossProcessAccessLock()  // remove dir first
releaseCurrent()                       // then unblock next waiter
map delete
```

Error-safety is preserved: `releaseCrossProcessAccessLock` swallows all errors internally via
`.catch(() => {})`, and `releaseCurrent()` is a synchronous no-throw resolve. If
`releaseCrossProcessAccessLock` were to throw (it won't, but defensively), `releaseCurrent()`
would still run because it's in the same `finally` block.

### D1 fix — file: `src/core/runner/access-runner.ts`, line 343

```ts
// Before
const hash = createHash("md5").update(accessPath.toLowerCase()).digest("hex");

// After
const hash = createHash("sha256").update(accessPath.toLowerCase()).digest("hex").slice(0, 16);
```

Pure internal swap. The function signature, exported name, and behavior contract are unchanged.
Existing callers (tests, heartbeat tests, the runner itself) are unaffected.
