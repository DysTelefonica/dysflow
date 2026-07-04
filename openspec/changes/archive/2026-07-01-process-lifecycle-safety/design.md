# Design: Process Lifecycle Safety — Audit-Driven Hardening

**Change**: `process-lifecycle-safety` (issue #620)
**Chain**: 3 PRs, force-chained, 400-line review budget each, target `main`
**Mode**: SDD + strict TDD, no E2E

## Technical Approach

Three port-level fixes harden dysflow's MSACCESS kill contract on the
existing `processScanner` / `processInspector` / `processKiller` ports.
No new adapters, no new ports, no schema change. Capability is new
(`process-lifecycle-safety`); requirements slot into the same surface
already used by `access-orphan-cleanup.ts` (F1 reference) and the
runner heartbeat (F3b reference plumbing).

## Architecture Decisions

| # | Choice | Alternative | Rationale |
|---|--------|-------------|-----------|
| D1 | F1: `mainWindowHandle === 0`; undefined refuses | Substring `-Embedding` scan | The orphan-list filter at `access-orphan-cleanup.ts:95` already uses this gate; substring scan was the bug. |
| D2 | F2: `force:true` refuses `running` records → `CLEANUP_RUNNING_FORCE_REFUSED` | Kill mid-flight on `force:true`; rename to `hardKill` | Proposal/spec encode interpretation #1; the audit complaint IS the bypass. Hard-kill lives in a follow-up if ever needed. |
| D3 | F3a: `processInspector.getProcess(pid)` immediately before kill, bounded by `operationTimeoutMs` | Scan-then-kill, accept race | Port already injected. One extra round-trip per kill, bounded by existing 3 s timeout. |
| D4 | F3a race code: embed `CLEANUP_RACE_PID_REUSED` in `result.errors[].message`; no shape change | Add typed `code?` field | Size budget. Extending type cascades to `diagnosticsFromPreflightCleanup` and every adapter. Grep-able message is sufficient. |
| D5 | F3b default: `() => undefined` (no-op) when caller omits; production supplies explicit sink | Keep `logSwallowedIoError` as default | Current default is a debug-only log nobody reads. Production must wire; tests must prove silent default. |
| D6 | F3b sink shape: closure-pushed array the runner drains at `runLockedOperation` end | Pass the runner down; refactor API | Keeps `cross-process-lock.ts` pure (no diagnostic type leak). |

## Data Flow

```
F1+F3a — preflight orphan kill (scanAndCleanOrphans / retireUnownedRecord)
  match MSACCESS + path
    → mainWindowHandle === 0 ?           [F1]   undefined|non-zero → refuse
    → processInspector.getProcess(pid)   [F3a]  undefined|recycled → suppress
    → processKiller.kill(pid)            [only if all gates pass]

F2 — cleanup force gate (new branch BEFORE existing line 138)
  cleanup({force:true})
    → record.status === "running"
        process alive + same name + same startTime → CLEANUP_RUNNING_FORCE_REFUSED
        process gone                                → existing dead-PID path (preserves L137)

F3b — heartbeat propagation
  runWithAccessExecutionLock(key, work, ..., onHeartbeatError?)
    → startLockHeartbeat(path, fs, undefined, onHeartbeatError ?? noop)
        fileSystem.utimes().catch(err)
          ENOENT → swallowed
          other  → onHeartbeatError(err)  [silent default; runner collects]
  AccessPowerShellRunner.run
    collects heartbeat errors in closure array, appends
    {level:"warning", source:"access.heartbeat"} to diagnostics
```

## File Changes

| File | Action | PR | Purpose |
|------|--------|----|---------|
| `src/core/operations/access-operation-preflight.ts` | Modify | 1, 3 | F1: drop substring at L272, L372. F3a: insert revalidation in both. |
| `src/core/operations/access-operation-cleanup.ts` | Modify | 2 | F2: insert liveness+status guard BEFORE existing force-bypass at L138. |
| `src/core/runner/cross-process-lock.ts` | Modify | 3 | F3b: 6th `onHeartbeatError?` param on `runWithAccessExecutionLock`; default `() => undefined` in `startLockHeartbeat`; drop `logSwallowedIoError` import. |
| `src/core/runner/access-runner.ts` | Modify | 3 | F3b: closure-pushed `heartbeatErrors` drained into `diagnostics` in `runLockedOperation` (after L347). |
| `test/core/operations/access-operation-preflight.test.ts` | Modify | 1, 3 | F1: flip 2 + add 6. F3a: add 3. |
| `test/core/operations/access-operation-cleanup.test.ts` | Modify | 2 | F2: add 2 matrix tests; keep L137 green. |
| `test/core/runner/cross-process-lock.test.ts` | Modify | 3 | F3b: add 2 (default no-op, param pass-through). |
| `test/core/runner/access-runner-lock-heartbeat.test.ts` | Modify | 3 | F3b: add 1 (EPERM → warning diagnostic). |

## Insertion Points

| ID | File:line | Change (gist) |
|----|-----------|---------------|
| F1a | `access-operation-preflight.ts:272` | Replace `const isHeadless = process.commandLine.toLowerCase().includes("-embedding")` with two guards: `if (mainWindowHandle === undefined) { push error; continue; }` and `if (mainWindowHandle !== 0) { push error; continue; }`. The `try { await processKiller.kill ... }` block stays; only the conditional gate changes. |
| F1b | `access-operation-preflight.ts:372` | Same shape on `matchingProcess`. |
| F3a-a | `access-operation-preflight.ts:272-293` | After F1's headless gate, before `try { await processKiller.kill ... }`: call `processInspector.getProcess(process.pid)` (wrapped in `withTimeout`); if `undefined` push warning+continue; if `name` differs OR `sameProcessStartTime` fails push error containing `CLEANUP_RACE_PID_REUSED` and continue. |
| F3a-b | `access-operation-preflight.ts:364-394` | Mirror of F3a-a in `retireUnownedRecord`, using `matchingProcess.pid` / `matchingProcess.startTime`. |
| F2 | `access-operation-cleanup.ts:138` | Insert BEFORE the existing `if (!request.force && !ELIGIBLE_STATUSES.has(...))` block: when `record.status === "running"`, do `processInspector.getProcess(record.accessPid)`; if it returns a live `MSACCESS.EXE` whose `startTime` matches the registry, return `failureResult(createDysflowError("CLEANUP_RUNNING_FORCE_REFUSED", "Cleanup refused: operation ${id} is running and PID ${pid} is still alive."))`. Dead-PID case falls through to the existing L148 happy path. |
| F3b-a | `cross-process-lock.ts:138` | Change default `onHeartbeatError` from `logSwallowedIoError` to `() => undefined`. |
| F3b-b | `cross-process-lock.ts:193-199` | Add 6th param `onHeartbeatError?: (error: unknown) => void` to `runWithAccessExecutionLock`. At L226, pass it as the 4th arg to `startLockHeartbeat`. |
| F3b-c | `access-runner.ts:180-194` | In the `try` of `run`, declare `const heartbeatErrors: unknown[] = [];` and pass `(error) => { heartbeatErrors.push(error); }` as the new 6th arg. |
| F3b-d | `access-runner.ts:347` | In `runLockedOperation`, after `const diagnostics = [...collectDiagnostics(execution, secrets), ...captureDiagnostics];` (L347), append `heartbeatDiagnostics` mapped from the closure's `heartbeatErrors` to `{level:"warning", source:"access.heartbeat"}`. Promote `heartbeatErrors` from `run` closure to `runLockedOperation` closure (pass via the inner `async () => { ... }` body). |

## Test Changes (port surface only)

| PR | Test file | Cases |
|----|-----------|-------|
| 1 | `access-operation-preflight.test.ts` | **FLIP** L707-740 (asserts refusal of unattributed process with `-Embedding` substring, `mainWindowHandle: undefined`); **FLIP** L742-782 (mirror in `retireUnownedRecord`). **Add** 6: `scanAndCleanOrphans refuses when mainWindowHandle is undefined`; `...is non-zero even if commandLine contains -embedding`; `...kills when mainWindowHandle === 0 and accessPath contains -embedding`; same 3 mirrored on `retireUnownedRecord`. Use existing `processScanner` / `processInspector` ports — headless tests set `mainWindowHandle: undefined` or non-zero hex; assert `result.orphanedKilled` empty and `result.errors` carries the refusal. |
| 2 | `access-operation-cleanup.test.ts` | **Add** 2: `cleanup({force:true}) on a running record with alive PID returns CLEANUP_RUNNING_FORCE_REFUSED without invoking the killer`; `cleanup({force:true}) called 100 times on a running record never invokes the killer` (loop, assert `killed.length === 0` AND `registry.get('op-1')` retains `status: 'running'`). **Keep** existing L137 (dead-PID running+force returns `ok: true, status: 'cleaned'`). |
| 3a | `access-operation-preflight.test.ts` | **Add** 3: `scanAndCleanOrphans suppresses kill when revalidation returns undefined`; `...refuses kill with message containing CLEANUP_RACE_PID_REUSED when revalidation shows a different process name`; `retireUnownedRecord suppresses kill when revalidation returns undefined`. |
| 3b | `cross-process-lock.test.ts` | **Add** 2: `runWithAccessExecutionLock passes onHeartbeatError through to startLockHeartbeat` (callback receives synthetic EPERM); `startLockHeartbeat default callback is a no-op` (spy on `console.*` — must not be called). |
| 3b | `access-runner-lock-heartbeat.test.ts` | **Add** 1: `AccessPowerShellRunner.run surfaces non-ENOENT heartbeat errors as warning Diagnostics on OperationResult`. Use the `stubPort` pattern from `cross-process-lock.test.ts:240-248` with `utimes` throwing `EPERM`. Assert returned `OperationResult.diagnostics` contains `{ level: "warning", source: "access.heartbeat" }`. |

Total: **2 flipped + 14 new = 16 test changes** (matches the 16 spec scenarios).

## Error Code Convention

`CLEANUP_RUNNING_FORCE_REFUSED` and `CLEANUP_RACE_PID_REUSED` follow the
`SCOPE_REASON` pattern of existing codes (`CLEANUP_PROCESS_NAME_MISMATCH`,
`CLEANUP_COMMAND_LINE_MISMATCH`, `CLEANUP_PID_UNKNOWN`). F2 returns
`CLEANUP_RUNNING_FORCE_REFUSED` as a typed `error.code`; F3a embeds
`CLEANUP_RACE_PID_REUSED` in the preflight `result.errors[].message`.
Diagnostic source `access.heartbeat` mirrors existing sources
(`access.preflight`, `access.cleanup`, `access.pid`, `powershell.*`).

## Backwards Compatibility

| Surface | Risk | Mitigation |
|---------|------|------------|
| `dysflow_access_force_cleanup_orphaned` (MCP) | F1 stops killing some previously-listed candidates (those with `mainWindowHandle !== 0` and `-embedding` in path) | New contract is stricter; call-site path already uses the same window-handle check. Tool description needs a doc tweak. |
| `dysflow_access_cleanup` (force:true) | F2 returns a new error code; callers that depended on the bypass must now handle refusal | `CLEANUP_RUNNING_FORCE_REFUSED` is typed, MCP layer can map. No silent data loss. |
| `runWithAccessExecutionLock` (API) | F3b adds optional 6th param | Param is `?`. All existing call sites compile unchanged. |
| `startLockHeartbeat` default | F3b default goes from `logSwallowedIoError` to `() => undefined` | Tests pin the no-op default; production wires the runner. |

## PR Commit Plan

| PR | Commits | Justification |
|----|---------|---------------|
| 1 (F1) | 1 commit | Single logical change. Flips + new tests in one commit = atomic GREEN. |
| 2 (F2) | 1 commit | One gate tightening + 2 matrix tests = one logical unit. |
| 3 (F3a + F3b) | **2 commits** | F3a and F3b are independent — different files, different ports, different scenarios. Same PR because filed as one audit finding, but **not squashed**. Commit 1 = F3a (preflight revalidation + tests). Commit 2 = F3b (lock callback + runner sink + tests). If F3b gets pushback, F3a lands independently by reordering. |

## Rollback Plan

Each PR is independently revertable:

- **PR 1**: `git revert <sha>` restores substring scan; flipped tests flip back. Source + tests co-committed → one operation. No orphan tests stay broken.
- **PR 2**: `git revert <sha>` restores `force:true` bypass; new tests fail under old code. Pre-existing L137 stays green either way.
- **PR 3a**: reverts preflight revalidation; F3a tests fail under old code. F3b untouched.
- **PR 3b**: reverts `onHeartbeatError` plumbing; `startLockHeartbeat` default goes back to `logSwallowedIoError`; F3b tests fail under old code. F3a untouched.

The 2-commit split inside PR 3 means a future rebase can drop just F3b
without rebasing the whole chain — the reason NOT to squash.

## Migration / Config Impact

- **F1**: a process with `-embedding` in its project path AND
  `mainWindowHandle === 0` is STILL killed. Only previously-killed
  candidates with `mainWindowHandle !== 0` or `undefined` stop being
  killed. Operators with `-embedding` in legitimate paths see no change.
- **F2**: scripts that used `force:true` to break a stuck running op
  now receive `CLEANUP_RUNNING_FORCE_REFUSED` and must wait or update
  the registry record to a terminal status. This IS the bug fix.
- **F3a**: one extra `getProcess` round-trip per orphan kill; bounded
  by `operationTimeoutMs` (default 3000 ms).
- **F3b**: new `access.heartbeat` warnings on transient `EPERM` during
  teardown. ENOENT stays silent.

## Documentation Updates

- `AGENTS.md`: append a paragraph to the process-safety section pointing
  to `openspec/specs/process-lifecycle-safety/spec.md`.
- `docs/mcp-examples.md`: amend the `dysflow_access_cleanup` payload to
  include the new `CLEANUP_RUNNING_FORCE_REFUSED` example.
- `dysflow_access_force_cleanup_orphaned` tool description: tighten
  "headless MSACCESS" to "headless (`mainWindowHandle === 0`) MSACCESS".

## Open Questions

- **None blocking.** D4 (message-embed `CLEANUP_RACE_PID_REUSED`) is a
  size-budget compromise. A typed `code?` field on
  `AccessOperationPreflightCleanupError` (propagating to adapters) is a
  follow-up. F3b's closure-based `heartbeatErrors` (~4 lines) beats the
  field-based alternative (~10 lines) on size; runner is single-threaded
  per `run`, so concurrency is not a concern.
