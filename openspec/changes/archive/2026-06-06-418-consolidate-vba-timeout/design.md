# Design: Consolidate VBA Timeout (#418)

## Which layer wins and why

`spawnPowerShellProcess` in `src/core/runner/powershell-executor.ts` is the **authoritative
timeout**. It is the only layer that:

1. Actually calls `killProcessTree(child.pid)` (Windows) or `child.kill()` (non-Windows).
2. Awaits the kill to confirm the process has exited before settling the promise.
3. Sets `timedOut: true` in the returned result.
4. Produces a real `durationMs` (actual elapsed milliseconds from spawn to kill completion).

The adapter-level `executeWithTimeout` method in `VbaSyncAdapter` added a parallel `Promise.race`
against a synthetic timer. This was redundant because:

- The same timeout value was already forwarded to the executor via `request.timeoutMs`.
- The abort signal from `executeWithTimeout` triggered the identical kill path inside
  `spawnPowerShellProcess` (via the `options.signal` handler at line ~127).
- The only difference was the race could produce `{ durationMs: request.timeoutMs }` — a constant,
  not actual elapsed time.

## Before/after timeout flow

### Before (three-layer)

```
executeMappedTool
  → computes psTimeoutMs (wall-clock budget)
  → calls executeWithTimeout(timedRequest)
      → creates AbortController
      → Promise.race([
            executor(signal=controller),   // real PowerShell spawn with own timer
            setTimeout(psTimeoutMs, () => {
              controller.abort()           // triggers executor kill path
              resolve({ timedOut: true, durationMs: psTimeoutMs })  // synthetic
            })
        ])
      → whichever settles first wins
         (both fire at ≈ same ms — race condition)
```

### After (single authoritative layer)

```
executeMappedTool
  → computes psTimeoutMs (wall-clock budget)
  → calls executor(timedRequest)            // direct call, no wrapper
      → spawnPowerShellProcess({ timeoutMs: psTimeoutMs })
          → setTimeout(psTimeoutMs, () => {
              killProcessTree(child.pid)    // real kill
              finish(null)                 // resolves with timedOut:true, real durationMs
            })
```

## What was removed

- `executeWithTimeout` method from `VbaSyncAdapter` (adapter layer): ~23 lines of
  `AbortController` + `Promise.race` + synthetic timeout result.
- `executeWithTimeout` field from `VbaModulesOrchestrator` interface.
- `executeWithTimeout` field from `VbaComparisonContext` port (core), replaced by `runVbaManager`.

## What was renamed

`executeWithTimeout` → `runVbaManager` in the `VbaComparisonContext` port
(`src/core/services/vba-source-comparison.ts`). The old name leaked the mechanism into the interface
contract. `runVbaManager` describes the behavior (invoke the VBA manager script) without binding the
interface to a specific timeout implementation.

## Timeout error shape preserved

The observable error contract is unchanged:

```typescript
{
  ok: false,
  error: {
    code: "VBA_MANAGER_TIMEOUT",
    message: "<toolName> timed out after <durationMs>ms",
    retryable: true,
  },
  durationMs: <number>,
}
```

`durationMs` is now the real elapsed time from the executor (was previously the configured timeout
constant in the synthetic path).

## Risk: timeout message stability

The `durationMs` in the error message may now differ from the configured `timeoutMs` by the time
taken for `killProcessTree` to complete (bounded by `KILL_TREE_BOUND_MS = 3_000 ms`). This is more
accurate and was already possible when the executor settled first under the old code.

## Alternatives considered

**Keep `executeWithTimeout` as a pass-through**: Would eliminate the race but add pointless
indirection. Rejected — dead code adds confusion.

**Move kill logic to the adapter**: Would violate the hexagonal constraint (adapter reimplementing
what core already does correctly). Rejected.

**Add a cap check in the adapter without a second timer**: The wall-clock budget computation in
`executeMappedTool` already does this — it is preserved unchanged.

## Hexagonal constraint

The `VbaComparisonContext` port lives in `src/core/services/vba-source-comparison.ts` (core).
`VbaModulesAdapter.getComparisonContext()` satisfies it by binding `this.orchestrator.executor`
directly. No core → adapter import was introduced.
