# Delta for install-runtime

## ADDED Requirements

### Requirement: Child Process Killed on Timeout

When `runCommand` or `runCommandOutput` is invoked with a `timeoutMs` option and the
spawned child process has not completed within that window, the install runtime MUST
terminate the child process (and any descendants it spawned) before the returned promise
rejects with a timeout error. The rejection SHALL NOT become visible to callers while a
process that was started by the call still holds the runtime directory or any of its
files.

#### Scenario: Timeout terminates the child on Windows
- GIVEN `runCommand` is called on Windows with a `timeoutMs` that elapses before the
  child exits
- WHEN the timer fires
- THEN the install runtime MUST terminate the child process tree using a forced process
  tree kill for the spawned child PID
- AND the promise MUST reject with a timeout error only after the kill process has closed
  or errored
- AND no descendant of the spawned child SHALL keep a handle on the runtime directory or
  any of its files at the time the rejection is observed

#### Scenario: Timeout terminates the child on non-Windows platforms
- GIVEN `runCommand` is called on a non-Windows platform with a `timeoutMs` that elapses
  before the child exits
- WHEN the timer fires
- THEN the install runtime MUST send an ungraceful termination signal to the spawned
  child
- AND the promise MUST reject with a timeout error

#### Scenario: Promise is settled exactly once
- GIVEN a child process is terminated because the timeout elapsed
- WHEN the underlying `execFile` callback eventually fires for the same child
- THEN the install runtime MUST NOT re-resolve or re-reject the already-settled promise

### Requirement: Timeout Tests Are Port-Level

Strict TDD MUST characterize the timeout-kill behavior through the public
`runCommand` / `runCommandOutput` port, not through private helpers, mocks of
`child_process`, or assertions on the specific kill mechanism used. Tests SHALL assert
observable behavior (rejection message, bounded wall-clock latency) and SHALL survive any
internal refactor that preserves that behavior, per `docs/testing/testing-philosophy.md`.

#### Scenario: Timed-out command rejects with a timeout error within a bounded window
- GIVEN a command that runs for longer than the configured `timeoutMs`
- WHEN `runCommand` is called with that `timeoutMs`
- THEN the returned promise MUST reject with an error whose message reports the timeout
- AND the rejection MUST become observable well before the child would have completed on
  its own

#### Scenario: Successful command is unaffected
- GIVEN a command that completes before `timeoutMs` elapses
- WHEN `runCommand` is called
- THEN the promise MUST resolve normally and the kill-on-timeout path MUST NOT run
