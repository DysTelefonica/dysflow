# process-lifecycle-safety Specification

## Purpose

Defines the safety contract for MSACCESS.EXE kill decisions inside dysflow:
headless detection, the "running operation cannot be force-killed" rule,
the orphan-kill race window, and the heartbeat-propagation contract
between the cross-process lock and the runner. These gates exist because
the project's process-safety contract (AGENTS.md; observation #15169)
forbids killing an `MSACCESS.EXE` that is not ours, not terminal, or not
provably headless.

The contract is protocol-neutral and runner-internal: it governs decisions
made inside `AccessOperationPreflightCleanupService`,
`AccessOperationCleanupService`, `AccessOrphanCleanupService`, and
`runWithAccessExecutionLock`. Adapters that surface the resulting
diagnostics to the MCP layer or HTTP layer MUST map the typed error
codes described here without renaming or absorbing them.

## Requirements

### Requirement: Headless Detection by Window Handle

The system MUST classify a process as headless iff
`OsProcessInfo.mainWindowHandle === 0`. The system MUST NOT derive
headlessness from a substring scan of the command line. When
`mainWindowHandle === undefined`, the system MUST refuse to kill the
process (treat as "unknown", not as "headless").

This rule applies to every site that decides whether a kill is safe,
including `AccessOperationPreflightCleanupService.scanAndCleanOrphans`
and `.retireUnownedRecord` in `access-operation-preflight.ts`. The
canonical reference implementation lives at
`access-orphan-cleanup.ts:91-108` (list filter) and
`access-orphan-cleanup.ts:151-161` (refusal when undefined or
non-zero).

#### Scenario: Headless detected by zero window handle — kill proceeds

- GIVEN an `OsProcessInfo` with `mainWindowHandle === 0`
- AND a `commandLine` that matches the registered accessPath
- WHEN the orphan-kill sites evaluate the candidate
- THEN the system MUST allow the kill

#### Scenario: Undefined window handle is refused (Get-Process fallback)

- GIVEN an `OsProcessInfo` with `mainWindowHandle === undefined`
- WHEN the orphan-kill sites evaluate the candidate
- THEN the system MUST refuse the kill
- AND the refusal MUST distinguish the "unknown" case from the
  "visible window" case so the operator can audit

#### Scenario: `-embedding` substring is irrelevant when window handle proves otherwise

- GIVEN an `OsProcessInfo` with `mainWindowHandle === 0xbeef` (visible window)
- AND a `commandLine` containing the substring `-embedding`
- WHEN the orphan-kill sites evaluate the candidate
- THEN the system MUST refuse the kill (substring is not a headless signal)

#### Scenario: Project path containing `-embedding` is killed when window handle proves headless

- GIVEN an `OsProcessInfo` with `mainWindowHandle === 0`
- AND a `commandLine` whose accessPath is `C:/data/my-embedding-app.accdb`
- WHEN the orphan-kill sites evaluate the candidate
- THEN the system MUST allow the kill (path substring is not a refusal signal)

### Requirement: Force-Cleanup Refused for Running Records

`AccessOperationCleanupService.cleanup({ force: true })` MUST refuse to
call `processKiller.kill` when `record.status === "running"`. The refusal
MUST surface a typed error code distinct from `CLEANUP_STATUS_NOT_ELIGIBLE`
so the MCP layer can disambiguate "running under force" from any other
ineligible status. A `running` record whose PID is verifiably gone at the
inspection step MUST remain cleanable (the kill becomes a no-op and the
record is marked `cleaned`).

**Design decision (F2, 2026-07-01):** `force: true` is the fail-safe for
**terminal** status records (e.g. `timed_out`, `failed`, `pid_unknown`,
retired PIDs) — it MUST NOT bypass the running gate. A still-running
operation owns the PID; the operator must transition the record (await
natural completion or call the registry update to a terminal status)
before force-cleanup can proceed. If a later change requires
"kill mid-flight at all costs", introduce a separate `hardKill: true`
flag rather than reusing `force`.

#### Scenario: Running + force + alive PID is refused with `CLEANUP_RUNNING_FORCE_REFUSED`

- GIVEN a registry record with `status === "running"`, valid `accessPid`, matching processStartTime
- AND `processInspector.getProcess(pid)` returns a live MSACCESS.EXE matching startTime
- WHEN `cleanup({ force: true })` runs
- THEN the result MUST carry `error.code === "CLEANUP_RUNNING_FORCE_REFUSED"`
- AND `processKiller.kill` MUST NOT be invoked
- AND the registry record MUST retain its `running` status

#### Scenario: Running + force + dead PID is cleaned without invoking the killer

- GIVEN a registry record with `status === "running"` and a registered `accessPid`
- AND `processInspector.getProcess(pid)` returns `undefined` at inspection time
- WHEN `cleanup({ force: true })` runs
- THEN the result MUST be `ok: true` with `status === "cleaned"`
- AND `processKiller.kill` MUST NOT be invoked
- AND this MUST remain the happy path the prior test at
      `access-operation-cleanup.test.ts:137` pins

#### Scenario: Running + force:false still uses `CLEANUP_STATUS_NOT_ELIGIBLE`

- GIVEN a record with `status === "running"`
- WHEN `cleanup({ force: false })` runs
- THEN the result MUST carry `error.code === "CLEANUP_STATUS_NOT_ELIGIBLE"`
- AND the rejection MUST come from the existing pre-inspection gate

#### Scenario: Bypass attempt: repeated `force:true` cannot transition running to terminal

- GIVEN a record with `status === "running"` and an alive owned PID
- WHEN `cleanup({ force: true })` is called 100 times in a row
- THEN every call MUST return `CLEANUP_RUNNING_FORCE_REFUSED`
- AND `processKiller.kill` MUST NOT be invoked even once
- AND no registry update MUST change the record's status

### Requirement: Orphan-Kill Race Revalidation

Before calling `processKiller.kill(pid)` on an orphan candidate, the
system MUST revalidate the PID via `processInspector.getProcess(pid)`
immediately before the kill. If the revalidation shows the PID is
gone, the kill MUST be suppressed and a warning diagnostic recorded.
If the revalidation shows the PID is now a different process
(different `name` or different `startTime` than was observed at scan
time), the kill MUST be refused with the typed refusal
`CLEANUP_RACE_PID_REUSED`.

This rule applies to the two preflight orphan-kill sites at
`access-operation-preflight.ts:265-293` (`.scanAndCleanOrphans`) and
`:364-394` (`.retireUnownedRecord`).

#### Scenario: PID alive and unchanged at revalidation time

- GIVEN a scan returned PID 5555 alive as MSACCESS.EXE with startTime T0
- WHEN the orphan-kill site revalidates via `processInspector.getProcess(5555)` immediately before the kill
- AND revalidation returns MSACCESS.EXE with the same startTime T0
- THEN the kill MUST proceed

#### Scenario: PID disappears between scan and kill (normal race)

- GIVEN a scan returned PID 5555 alive as MSACCESS.EXE with startTime T0
- WHEN the orphan-kill site revalidates via `processInspector.getProcess(5555)` immediately before the kill
- AND revalidation returns `undefined`
- THEN `processKiller.kill(5555)` MUST NOT be invoked
- AND a warning diagnostic MUST appear in the result's surface
- AND PID 5555 MUST be silently dropped from `orphanedKilled`

#### Scenario: PID recycled to a different process between scan and kill

- GIVEN a scan returned PID 5555 alive as MSACCESS.EXE with startTime T0
- WHEN the orphan-kill site revalidates via `processInspector.getProcess(5555)` immediately before the kill
- AND revalidation returns a process whose name is `notepad.exe`
- THEN `processKiller.kill(5555)` MUST NOT be invoked
- AND the kill MUST be refused with `CLEANUP_RACE_PID_REUSED`

#### Scenario: Revalidation timeout is treated as "cannot prove", not "go ahead"

- GIVEN a scan returned PID 5555 alive as MSACCESS.EXE
- WHEN `processInspector.getProcess(5555)` exceeds the operation timeout
- THEN the kill MUST be suppressed
- AND a warning diagnostic MUST be recorded

### Requirement: Heartbeat-Error Propagation Contract

`runWithAccessExecutionLock` MUST accept an optional `onHeartbeatError`
callback. The production wiring in `AccessPowerShellRunner.run` MUST
supply an explicit sink that surfaces non-ENOENT heartbeat failures as
warning `Diagnostic` entries on the returned `OperationResult`. ENOENT
errors during heartbeat `utimes` (lock already released — normal
teardown) MUST remain suppressed at the heartbeat level. The default
behavior of `startLockHeartbeat` when no callback is supplied MUST be a
silent fallback that does not write to `console`.

#### Scenario: Heartbeat succeeds silently

- GIVEN `fileSystem.utimes` resolves successfully on every interval
- WHEN `runWithAccessExecutionLock` runs `work`
- THEN no `onHeartbeatError` invocation occurs
- AND the returned `OperationResult` carries no heartbeat diagnostic

#### Scenario: Non-ENOENT `utimes` failure surfaces as a warning diagnostic on the production `OperationResult`

- GIVEN the heartbeat `utimes` rejects with `EPERM`
- AND the runner's `AccessPowerShellRunner.run` calls
  `runWithAccessExecutionLock` with an explicit sink that collects errors
- WHEN the lock-held work completes
- THEN a warning `Diagnostic` MUST appear on the returned `OperationResult`
- AND the `Diagnostic` `code` MUST be `access.heartbeat`
- AND the work result MUST still be returned as `ok: true` (diagnostic is informational)

#### Scenario: ENOENT `utimes` failure during teardown is suppressed

- GIVEN the heartbeat `utimes` rejects with `ENOENT` (lock dir removed by release)
- WHEN the lock-held work completes
- THEN no `Diagnostic` MUST be emitted
- AND the suppression MUST happen at the heartbeat level (the callback is not invoked)

#### Scenario: Default callback is a no-op when caller supplies none

- GIVEN a caller of `startLockHeartbeat` does not supply `onHeartbeatError`
- AND a heartbeat `utimes` rejects with `EPERM`
- WHEN `startLockHeartbeat` invokes the default callback
- THEN no `console.debug`, `console.log`, or `console.error` call occurs
- AND the default callback MUST return `undefined`
- AND production (`AccessPowerShellRunner.run`) MUST NOT rely on the default

---

## Test Surface

| Finding | Port (entry) | Existing test file | New test names |
|---------|--------------|--------------------|----------------|
| F1 (headless by window handle) | `AccessOperationPreflightCleanupService.cleanup` → `.scanAndCleanOrphans` and `.retireUnownedRecord` | `test/core/operations/access-operation-preflight.test.ts` | Flip the two `-Embedding`-substring tests at lines 707-740 and 742-782 to assert behavior under the new `mainWindowHandle` gate. Add: `scanAndCleanOrphans refuses when mainWindowHandle is undefined (#620)`; `scanAndCleanOrphans refuses when mainWindowHandle is non-zero even if commandLine contains -embedding (#620)`; `scanAndCleanOrphans kills when mainWindowHandle === 0 and accessPath contains -embedding (#620)`; same three for `retireUnownedRecord`. |
| F2 (force-cleanup running gate) | `AccessOperationCleanupService.cleanup` | `test/core/operations/access-operation-cleanup.test.ts` | `cleanup({force:true}) on a running record with alive PID returns CLEANUP_RUNNING_FORCE_REFUSED without invoking the killer (#620)`; `cleanup({force:true}) called repeatedly on a running record never invokes the killer (#620)`; keep the existing test at line 137 (dead-PID running+force) green. |
| F3a (orphan-kill race) | `AccessOperationPreflightCleanupService.scanAndCleanOrphans` and `.retireUnownedRecord` | `test/core/operations/access-operation-preflight.test.ts` | `scanAndCleanOrphans suppresses kill when revalidation returns undefined (#620)`; `scanAndCleanOrphans refuses kill with CLEANUP_RACE_PID_REUSED when revalidation shows a different process name (#620)`; `retireUnownedRecord suppresses kill when revalidation returns undefined (#620)`. |
| F3b (heartbeat propagation) | `startLockHeartbeat` (callback contract); `runWithAccessExecutionLock` (plumbing); `AccessPowerShellRunner.run` (production sink) | `test/core/runner/cross-process-lock.test.ts` and `test/core/runner/access-runner-lock-heartbeat.test.ts` | `runWithAccessExecutionLock passes onHeartbeatError through to startLockHeartbeat (#620)`; `startLockHeartbeat default callback is a no-op (#620)`; `AccessPowerShellRunner.run surfaces non-ENOENT heartbeat errors as warning Diagnostics on OperationResult (#620)`. |

No E2E scenarios. Unit + port-level tests only; the runner heartbeat
test already uses real filesystem ops against `tmpdir` and fake timers,
which is the right port surface for F3b.
