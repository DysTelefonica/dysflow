# Design: withTimeout Must Kill the Spawned Child Process

## Technical Approach

Tighten the timeout path inside `runCommandWithTimeout` (the inner helper used by both
`runCommand` and `runCommandOutput`) so the spawned child is terminated before the
promise rejects. The fix is local: track an `isTimedOut` flag, branch on `process.platform`,
and let the platform-appropriate kill signal complete before the rejection becomes visible
to callers. The `execFile` callback is short-circuited via the flag so the late
"process exited" event cannot double-settle the promise. No public exports, signatures, or
default timeouts change.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Kill mechanism on Windows | `taskkill /T /F /PID <pid>` via a one-shot `spawn` | `child.kill("SIGKILL")`, `taskkill /F /PID` (no `/T`) | `SIGKILL` is unreliable on Windows for a `cmd.exe` shim and grandchildren (e.g. `pnpm`, `node`, `powershell`) keep file locks. `/T` walks the whole tree; `/F` forces termination. The kill runs in a separate process so it is not subject to the timeout we are reacting to. |
| Kill mechanism on POSIX | `child.kill("SIGKILL")` | `taskkill`, `process.kill(-pid, …)` | `SIGKILL` is the portable, well-understood signal for an ungraceful termination; the existing process tree on POSIX is shallow enough that we do not need a tree walk. |
| Rejection timing on Windows | Reject only after `taskkill` `close`/`error` | Reject synchronously inside the timer | Rejecting before `taskkill` closes lets callers observe "done" while the tree is still alive, which is exactly the bug we are fixing from the caller's perspective. The `close`/`error` handler is the natural fence. |
| Rejection timing on POSIX | Reject synchronously inside the timer | Wait for `child` `exit` event | `SIGKILL` is fire-and-forget on POSIX; the child is effectively gone before the kill returns. We do not need to wait for an exit event, and waiting can hang if the child is in an uninterruptible state. |
| Double-settle guard | Local `isTimedOut` boolean | AbortController, `unref`/`ref` on timer, removing the `execFile` callback | A flag is the smallest change that satisfies the contract: the promise is settled exactly once and the `execFile` callback cannot win the race. AbortController would require broader refactoring and is not justified by this fix. |
| Public surface | No change | Rename helpers, export new symbols | Issue is a focused bug fix; the public API of `command-runner.ts` is preserved so callers (`install.ts`, `uninstall.ts`, `setup.ts`) do not need to move. |
| Test layer | Port-level test against the public `runCommand` function | Unit-test the private `runCommandWithTimeout` helper, mock `child_process` | Per `docs/testing/testing-philosophy.md`, tests must survive internal refactors. A real child process with a real timer proves the observable contract (rejection message, bounded latency) without coupling to `taskkill`/`SIGKILL` call sites. |

## Data Flow

```text
runCommand(cmd, args, cwd, { timeoutMs })
  └─ runCommandWithTimeout(cmd, args, execCmd, execArgs, options, timeoutMs)
        ├─ execFile(execCmd, execArgs, …)  ──► child (PID, stdout, stderr)
        ├─ setTimeout(timeoutMs)
        │     ├─ on win32: spawn taskkill /T /F /PID <child.pid>
        │     │             └─ on close|error: reject(new Error("… timed out …"))
        │     └─ on posix:  child.kill("SIGKILL") ; reject(new Error("… timed out …"))
        └─ execFile callback
              ├─ isTimedOut ?  return        (suppress late settlement)
              └─ else: resolve / reject as before
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/cli/commands/install/command-runner.ts` | Modify | In `runCommandWithTimeout`, on timer fire: set `isTimedOut`; on Windows spawn `taskkill /T /F /PID <child.pid>` and reject on its `close`/`error`; on other platforms `child.kill("SIGKILL")` and reject synchronously. The `execFile` callback short-circuits when `isTimedOut` is true. |
| `test/cli/install-utils.test.ts` | Modify | Add port-level test "runCommand times out and throws an error": spawn a 10 s Node `setTimeout` script with `timeoutMs: 100` and assert the call rejects with the timeout error within 1 s. Cleans up the temp dir. |
| `openspec/changes/438-with-timeout-must-kill-child/specs/install-runtime/spec.md` | Create | Delta spec under a new `install-runtime` capability, with ADDED Requirements describing the kill-on-timeout contract. |

## Interfaces / Contracts

`runCommand` and `runCommandOutput` keep their existing signatures, return types, and
default `timeoutMs`. The error thrown on timeout is still an `Error` whose message ends
with `timed out after <timeoutMs>ms` (the existing `createCommandError` wrapper preserves
that message). No new exports.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Port/unit | Timeout behavior of `runCommand` | Real `node -e` child, 10 s script, 100 ms `timeoutMs`; assert `rejects.toThrow("timed out after 100ms")` and wall-clock under 1 s. No mocks of `child_process`. |
| Port/unit | Successful execution still works (regression) | Existing "runCommand and runCommandOutput run a command" case continues to pass. |
| Manual / future E2E | No lingering process after timeout | Out of scope for this PR; verify with `tasklist` on Windows when integrating. |
| Full suite | Regression after the fix | `pnpm test`; implementation runs focused Vitest file first, then full suite in verify. |

## Migration / Rollout

No data, config, or runtime migration. The fix is contained to `command-runner.ts` and
its companion test. Recommended single PR under the 400-line review budget:

1. Apply the timeout/kill change in `command-runner.ts`.
2. Add the port-level test in `install-utils.test.ts`.
3. Run `pnpm test` and record implementation commits in `tasks.md` per SDD traceability.

## Open Questions

None.
