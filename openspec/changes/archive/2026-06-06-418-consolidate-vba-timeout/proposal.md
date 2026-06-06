# Proposal: Consolidate VBA Timeout to Single Authoritative Layer (#418)

## Problem

A single logical VBA manager operation had three overlapping timeout mechanisms:

1. **`executeMappedTool` in `vba-sync-adapter.ts`** (~lines 203–211): Computed a `psTimeoutMs`
   budget (wall-clock capped at 25 seconds) and passed it down.
2. **`executeWithTimeout` in `vba-sync-adapter.ts`** (~lines 445–467): Created an `AbortController`
   and raced the executor promise against a parallel `setTimeout`. If the timer won, it aborted the
   controller AND resolved the `Promise.race` with a synthetic `{ timedOut: true }` result.
3. **`spawnPowerShellProcess` in `powershell-executor.ts`** (~line 115): Had its own `setTimeout`
   that set `timedOut = true`, killed the process tree via `killProcessTree`, and resolved the
   promise.

### Failure modes

- Layer 2 (adapter Promise.race) could resolve first with a synthetic `{ durationMs: request.timeoutMs }` using the configured budget as duration — not the actual elapsed time.
- Both layer 2 and layer 3 fired at nearly the same instant, creating a race between the synthetic result and the real executor result.
- The abort signal from layer 2 triggered the kill path in layer 3 anyway — but the Promise.race could already have settled.
- The `VbaComparisonContext` port (core) exposed `executeWithTimeout` by name, leaking the mechanism name into the interface contract.

## Decision

The **executor-level timeout** (`spawnPowerShellProcess`) is AUTHORITATIVE. It is the only layer
that actually kills the process tree. Layer 2 (`executeWithTimeout`) is entirely redundant.

**Remove `executeWithTimeout`** from `VbaSyncAdapter`. Call `this.executor(request)` directly from
`executeMappedTool`. The `timeoutMs` field in the request already drives the kill inside the executor.

**Rename the core port method** from `executeWithTimeout` → `runVbaManager` in `VbaComparisonContext`
and `VbaModulesOrchestrator`. This removes the mechanism leak from the port name.

## Observable behavior preserved

- A too-long operation still fails with `VBA_MANAGER_TIMEOUT` (error code preserved).
- The timeout duration in the error message is the real elapsed time from the executor (not a
  synthetic constant).
- On timeout the PowerShell process is actually killed (no zombie). This was already true via the
  abort signal → executor kill path; now it is the only path.
- The `retryable: true` flag on the timeout error is preserved.
