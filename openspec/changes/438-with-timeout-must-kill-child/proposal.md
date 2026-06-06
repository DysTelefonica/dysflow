# Proposal: withTimeout Must Kill the Spawned Child Process

## Intent

Issue #438 (audit D3, `docs/AUDIT_2026-06-05.md`) flags that `runCommandWithTimeout` in
`src/cli/commands/install/command-runner.ts` rejects the promise on timeout but never kills
the spawned child process. On Windows the lingering process keeps file locks on the runtime
directory and produces `EBUSY` errors on subsequent operations such as overwriting the
runtime directory during install/uninstall. The change MUST terminate the child before
rejecting so no process outlives the timeout and holds the runtime directory or its files.

## Scope

### In Scope
- In `runCommandWithTimeout`, on timeout, terminate the child process before the promise rejects.
- On Windows, use `taskkill /T /F /PID <pid>` to kill the whole process tree; on other
  platforms send `SIGKILL` to the child.
- Add an `isTimedOut` guard so the original `execFile` callback does not re-resolve/re-reject
  after the timeout rejection.
- Port-level test in `test/cli/install-utils.test.ts` that runs a long-lived command with a
  short timeout and asserts the call rejects within a bounded window (no implementation-coupled
  assertions per `docs/testing/testing-philosophy.md`).

### Out of Scope
- Refactoring `command-runner.ts` or splitting it into modules.
- Changing `runCommand` / `runCommandOutput` public signatures, error messages, or default
  timeouts.
- New subprocess execution strategies (process supervisors, AbortController plumbing, etc.).
- Changes to Access/VBA, MCP, HTTP adapters, or any runtime install payload layout.

## Capabilities

### New Capabilities
- `install-runtime`: covers the CLI install-runtime subprocess boundary, including bounded
  execution and timeout handling for spawned child processes.

### Modified Capabilities
None. No existing capability spec currently describes the install command-runner behavior;
this change introduces a new capability rather than mutating an existing one.

## Approach

`runCommandWithTimeout` already tracks the spawned `child` and a `timer`. The fix is local
to that function: on the timeout fire, set an `isTimedOut` flag, then dispatch the platform
appropriate kill (`taskkill /T /F /PID <pid>` on `win32`, `child.kill("SIGKILL")` elsewhere),
and only then reject the promise. The flag suppresses the late `execFile` callback so we
neither re-resolve nor double-reject. On Windows, the reject is deferred to the
`taskkill` `close`/`error` event so callers do not see a rejection while the child tree is
still being torn down. The port-level test exercises `runCommand` end-to-end with a 10s
Node script and a 100ms timeout, asserting rejection within 1s.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cli/commands/install/command-runner.ts` | Modified | Kill child on timeout (Windows `taskkill` / POSIX `SIGKILL`); add `isTimedOut` guard |
| `test/cli/install-utils.test.ts` | Modified | New port-level test that proves timed-out commands reject quickly |
| `openspec/specs/install-runtime/spec.md` | New | ADDED Requirement: child process killed on timeout, no lingering locks, port-level tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `taskkill` fails to terminate a stubborn process | Low | Surface the timeout error after taskkill closes/errors; future PRs can layer escalation if needed |
| `execFile` callback fires after the timeout rejection and re-rejects | Med | `isTimedOut` flag short-circuits the late callback so the promise is settled exactly once |
| Test becomes implementation-coupled (e.g., asserts on `taskkill` invocation) | Low | Test asserts observable behavior (rejection, bounded latency) and uses a real child process, not mocks of `child_process` |
| Runtime directory still locked on rare edge cases (orphaned grandchildren) | Low | `/T` flag on Windows terminates the whole process tree; coverage of grandchildren is out of scope for this fix |

## Rollback Plan

Revert the change in `command-runner.ts` and the new test in `install-utils.test.ts`. No
schema, config, runtime payload, or public API changes; rollback is a simple git revert of
the behavior change.

## Dependencies

- Node `child_process.execFile` and `child_process.spawn` (already used by the module).
- `process.platform` (already used by the module to switch between `cmd.exe` and direct exec).
- Vitest + `pnpm test` for the port-level test.

## Success Criteria

- [ ] On timeout, the child process (and its tree on Windows) is killed before the promise
      rejects, matching all three acceptance criteria from issue #438.
- [ ] No lingering process holds the runtime directory or its files after a timeout.
- [ ] The new port-level test passes under `pnpm test` and does not assert on internal
      `taskkill`/`SIGKILL` call sites or private helper names.
