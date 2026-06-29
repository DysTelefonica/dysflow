# Tasks: withTimeout Must Kill the Spawned Child Process

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~40 production + ~15 test (well under 400) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | Single PR |
| Chain strategy | n/a |
| 400-line budget risk | Low |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Kill the child on timeout and add the port-level test | PR 1 | base `staging`; single behavioral slice |

## Phase 1: RED Port Coverage

- [x] 1.1 In `test/cli/install-utils.test.ts`, add a port-level test "runCommand times out
      and throws an error" that runs a 10 s Node `setTimeout` script with
      `timeoutMs: 100` and asserts the call rejects with `"timed out after 100ms"` within
      1 s of wall-clock time. Cleanup the temp dir in a `finally` block. No mocks of
      `child_process`.

## Phase 2: Production Fix

- [x] 2.1 In `src/cli/commands/install/command-runner.ts`, inside
      `runCommandWithTimeout`, add an `isTimedOut` flag and, on the timer fire, dispatch
      the platform-appropriate kill before rejecting:
      - On `process.platform === "win32"`: spawn `taskkill /T /F /PID <child.pid>` with
        `stdio: "ignore"` and `windowsHide: true`; reject only on the spawned taskkill's
        `close` or `error` event.
      - On other platforms: call `child.kill("SIGKILL")` (wrapped in `try`/`catch` to
        ignore kill errors) and reject synchronously.
      The `execFile` callback MUST short-circuit (return without resolving or rejecting)
      when `isTimedOut` is true so the promise is settled exactly once.

## Phase 3: Verification

- [x] 3.1 Run the focused Vitest file `test/cli/install-utils.test.ts`; both the existing
      success cases and the new timeout case pass.
- [x] 3.2 Run the full unit suite `pnpm test`; record implementation commits in this
      file during apply per SDD traceability.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `<sha>` | `withTimeout kills spawned child` (timeout kill + guard + test) | 1.1, 2.1, 3.1, 3.2 | `pnpm test` (focused + full suite) | n/a — install-runtime CLI module, no Access/VBA binary |
