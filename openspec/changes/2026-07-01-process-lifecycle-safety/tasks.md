# Tasks: process-lifecycle-safety — Audit Issue #620

## Review Workload Forecast

| PR  | Estimated changed lines | 400-line budget risk | Files touched | Tests added | Notes |
| --- | ----------------------- | -------------------- | ------------- | ----------- | ----- |
| PR1 | 140–190 | **Medium** | 2 (1 src + 1 test) | 6 new + **2 flips** | Source changes are small; flips add test surface; F3a revalidation sits in PR3 |
| PR2 | 70–110  | **Low**    | 2 (1 src + 1 test) | 2 new | Gate insertion is ~12 lines; test file is compact |
| PR3 | 150–200 | **Medium** | 6 (4 src + 2 test) | 6 new | F3b runner wiring has non-trivial closure refactor; F3a is a side-by-side revalidation |

**Plain-text guard lines:**

```
Decision needed before apply: No
Chained PRs recommended: Yes (3 PRs)
400-line budget risk: Medium (PR3 is the tightest; PR2 is safe)
```

### Suggested work-unit PR split

| Unit | Goal | PR | Base branch | Tests |
|------|------|----|-------------|-------|
| 1 | F1: replace substring headless detection | PR 1 | `main` | 6 new + 2 flips |
| 2 | F2: force:true refuses running records | PR 2 | `main` (after PR 1) | 2 new |
| 3 | F3a: orphan-kill race revalidation | PR 3 (commit 1) | `main` (after PR 2) | 3 new |
| 4 | F3b: heartbeat error propagation | PR 3 (commit 2) | same PR 3 branch | 3 new |

Delivery strategy: `force-chained` — PR 2 lands after PR 1, PR 3 (both commits) lands after PR 2.

---

## PR 1 — F1: Replace Substring Headless Detection

**Goal**: Drop `-embedding` substring scan; classify headless via `mainWindowHandle === 0` only.

### Commit

```
fix(dysflow): F1 — use mainWindowHandle for headless detection

Replaces the command-line substring scan at preflight orphan-kill sites
with the OsProcessInfo.mainWindowHandle === 0 gate already used by
access-orphan-cleanup.ts. Processes with mainWindowHandle === undefined
are refused (treated as "unknown"), not killed.

SDD: process-lifecycle-safety
Issue: #620
```

### Test plan (strict TDD, RED → GREEN)

**Test file**: `test/core/operations/access-operation-preflight.test.ts`

**Step 1 — FLIP 2 existing tests** (assertion inverts: previously expected kill, now expects refusal):

1. `test/core/operations/access-operation-preflight.test.ts` **FLIP L707-740**:
   - Rename test: `"scanAndCleanOrphans: with -Embedding but mainWindowHandle undefined → refuses"`
   - Change `expect(result.orphanedKilled).toEqual([5555])` → `expect(result.orphanedKilled).toEqual([])`
   - Change `expect(result.errors).toEqual([])` → `expect(result.errors).not.toEqual([])` (refusal)
   - Assert `killed` is empty

2. `test/core/operations/access-operation-preflight.test.ts` **FLIP L742-782**:
   - Rename test: `"retireUnownedRecord: with -Embedding but mainWindowHandle undefined → refuses"`
   - Change `expect(result.cleaned).toContain("op-unowned")` → `expect(result.cleaned).not.toContain("op-unowned")`
   - Change `expect(result.killed).toEqual([6666])` → `expect(result.killed).toEqual([])`
   - Assert `killed` is empty

**Step 2 — Add 6 new tests**:

3. `"scanAndCleanOrphans refuses when mainWindowHandle is undefined even if commandLine matches (#620)"`:
   - `process.mainWindowHandle = undefined`, `commandLine` matches `accessPath`
   - Assert `orphanedKilled` empty, `errors` has refusal entry

4. `"scanAndCleanOrphans refuses when mainWindowHandle is non-zero even if commandLine contains -embedding (#620)"`:
   - `process.mainWindowHandle = 0xBEEF`, `commandLine` has `-embedding`
   - Assert `orphanedKilled` empty, `errors` has refusal entry

5. `"scanAndCleanOrphans kills when mainWindowHandle === 0 and accessPath contains -embedding (#620)"`:
   - `process.mainWindowHandle = 0`, `commandLine` matches `accessPath` (path has `-embedding` in it)
   - Assert `orphanedKilled` includes the PID, `killed` called

6. `"retireUnownedRecord refuses when mainWindowHandle is undefined (#620)"`:
   - Mirror of #3 for `retireUnownedRecord` path

7. `"retireUnownedRecord refuses when mainWindowHandle is non-zero even if commandLine contains -embedding (#620)"`:
   - Mirror of #4 for `retireUnownedRecord` path

8. `"retireUnownedRecord kills when mainWindowHandle === 0 and accessPath contains -embedding (#620)"`:
   - Mirror of #5 for `retireUnownedRecord` path

**Step 3 — Verify RED**: Run `pnpm test -- --testPathPattern="access-operation-preflight"` — all 6 new tests fail; the 2 flipped tests now pass (they test the stricter gate).

### Implementation steps

**File**: `src/core/operations/access-operation-preflight.ts`

**Step 4 — Source change at `scanAndCleanOrphans` (~line 272)**:

```
// REPLACE (F1):
const isHeadless = process.commandLine.toLowerCase().includes("-embedding");

// WITH (F1):
if (process.mainWindowHandle === undefined) {
  result.errors.push({
    operationId: "orphan",
    message: `Blocked cleanup because PID ${process.pid} has mainWindowHandle undefined (unknown state).`,
  });
  continue;
}
if (process.mainWindowHandle !== 0) {
  result.errors.push({
    operationId: "orphan",
    message: `Blocked cleanup because PID ${process.pid} has a visible window (mainWindowHandle !== 0).`,
  });
  continue;
}
```

**Step 5 — Source change at `retireUnownedRecord` (~line 372)**:

Mirror of Step 4 — replace the `isHeadless` assignment with the same two guards, using `matchingProcess.pid`.

**Step 6 — Verify GREEN**: Run `pnpm test -- --testPathPattern="access-operation-preflight"` — all 8 tests pass (2 flipped + 6 new).

### Verification

- Existing tests outside the 2 flipped regions remain unaffected
- `pnpm test -- --testPathPattern="access-orphan-cleanup"` passes (F1 is a strict subset of existing orphan-list gate)
- `pnpm build` passes

### Rollback

```bash
git revert <PR1-sha>
```
Reverts source AND test flips together (co-committed). The 2 previously-passing tests restore their original assertions; no orphan tests break independently.

---

## PR 2 — F2: force:true Refuses Running Records

**Goal**: `force: true` must not bypass the running-gate. Add `CLEANUP_RUNNING_FORCE_REFUSED`.

### Commit

```
fix(dysflow): F2 — refuse force-cleanup of running operations

AccessOperationCleanupService.cleanup({ force: true }) now refuses
to kill when record.status === "running" and the owned PID is still
alive. Returns CLEANUP_RUNNING_FORCE_REFUSED without calling the killer.
Dead-PID running records (PID already gone) remain cleanable.

SDD: process-lifecycle-safety
Issue: #620
```

### Test plan (strict TDD, RED → GREEN)

**Test file**: `test/core/operations/access-operation-cleanup.test.ts`

**Step 1 — Write 2 failing tests**:

1. `"cleanup({force:true}) on a running record with alive PID returns CLEANUP_RUNNING_FORCE_REFUSED without invoking the killer (#620)"`:
   - Registry has record `status: "running"`, `accessPid: 999`, `processStartTime: "2026-05-28T10:00:00.000Z"`
   - `processInspector.getProcess(999)` returns `{ pid: 999, name: "MSACCESS.EXE", startTime: "2026-05-28T10:00:00.000Z" }`
   - `cleanup({ force: true })`
   - Assert `result.ok === false`, `result.error.code === "CLEANUP_RUNNING_FORCE_REFUSED"`
   - Assert `killed` is empty

2. `"cleanup({force:true}) called 100 times on a running record never invokes the killer (#620)"`:
   - Same setup as above; loop `cleanup()` 100 times
   - Assert every call returns `CLEANUP_RUNNING_FORCE_REFUSED`
   - Assert `killed.length === 0` throughout
   - Assert registry record still has `status: "running"` (no transition)

**Step 2 — Verify RED**: Run the 2 tests — both fail (F2 not yet implemented).

### Implementation steps

**File**: `src/core/operations/access-operation-cleanup.ts`

**Step 3 — Insert new gate BEFORE the existing `force` bypass at line 138**:

Locate the existing block:
```typescript
if (!request.force && !ELIGIBLE_STATUSES.has(record.status)) {
  return failureResult(...);
}
```

Insert immediately before it (around line 137, keeping existing code as-is after):

```typescript
// F2: Even with force:true, refuse to kill a running operation whose PID is alive.
// A running record means an automation owns that PID; the operator must either wait
// or update the record to a terminal status first.
if (record.status === "running" && record.accessPid !== null) {
  const liveProcess = await this.options.processInspector.getProcess(record.accessPid);
  if (liveProcess !== undefined) {
    const sameProcess =
      liveProcess.name.toUpperCase() === "MSACCESS.EXE" &&
      sameProcessStartTime(liveProcess.startTime, record.processStartTime);
    if (sameProcess) {
      return failureResult(
        createDysflowError(
          "CLEANUP_RUNNING_FORCE_REFUSED",
          `Cleanup refused: operation ${record.operationId} is running and PID ${record.accessPid} is still alive.`,
        ),
      );
    }
  }
}
```

This falls through naturally: if the PID is dead (`liveProcess === undefined`) OR the process doesn't match, the existing flow at line 147 (which calls `getProcess` again and marks `cleaned`) handles it — keeping the existing L137 test green.

**Step 4 — Verify GREEN**: `pnpm test -- --testPathPattern="access-operation-cleanup"` — all tests pass.

### CHANGELOG task

Add entry to `CHANGELOG.md` (or `CHANGELOG-unreleased.md`):

```markdown
### Changed

- `dysflow_access_cleanup(force: true)` now refuses to kill a `running` operation
  whose owned PID is still alive (`CLEANUP_RUNNING_FORCE_REFUSED`). Previously,
  `force: true` bypassed the running gate. Callers that relied on the old bypass
  must update the record to a terminal status first or wait for natural completion.
```

### Verification

- `pnpm test -- --testPathPattern="access-operation-cleanup"` passes
- `pnpm build` passes
- Existing test at `access-operation-cleanup.test.ts:137` (dead-PID running+force) stays green

### Rollback

```bash
git revert <PR2-sha>
```
Reverts the new gate. The existing L137 test remains green; the 2 new tests fail under old code.

---

## PR 3 — F3a + F3b: Orphan-Kill Race + Heartbeat Propagation

**Goal**: F3a adds PID revalidation before orphan kill. F3b wires `onHeartbeatError` from lock to runner diagnostics. Two commits inside one PR (independent, not squashed).

### Commit 1 of 2 (F3a)

```
fix(dysflow): F3a — revalidate PID before orphan kill (TOCTOU close)

Before calling processKiller.kill on an orphan candidate, both preflight
orphan-kill sites now call processInspector.getProcess(pid) to revalidate
the PID is still alive and still the same process. If the PID is gone
or recycled, the kill is suppressed and a diagnostic is recorded.

SDD: process-lifecycle-safety
Issue: #620
```

### Commit 2 of 2 (F3b)

```
fix(dysflow): F3b — surface non-ENOENT heartbeat errors as diagnostics

runWithAccessExecutionLock now accepts an onHeartbeatError callback.
AccessPowerShellRunner.run wires an explicit sink that collects heartbeat
errors and attaches them as warning diagnostics (source: access.heartbeat)
on the OperationResult. ENOENT (lock already released) remains suppressed.
Default callback when caller supplies none is a silent no-op.

SDD: process-lifecycle-safety
Issue: #620
```

### Test plan (strict TDD, RED → GREEN)

#### F3a tests — `test/core/operations/access-operation-preflight.test.ts`

**Step 1 — Write 3 failing tests**:

1. `"scanAndCleanOrphans suppresses kill when revalidation returns undefined (#620)"`:
   - `scanner.listProcesses` returns a headless `MSACCESS.EXE` with `mainWindowHandle === 0`
   - `processInspector.getProcess(pid)` returns `undefined` (PID disappeared between scan and kill)
   - Assert `orphanedKilled` is empty, `errors` has a warning entry mentioning the PID

2. `"scanAndCleanOrphans refuses kill with CLEANUP_RACE_PID_REUSED when revalidation shows a different process name (#620)"`:
   - `processInspector.getProcess(pid)` returns a process with `name: "notepad.exe"`
   - Assert kill was NOT called
   - Assert `errors` message contains `"CLEANUP_RACE_PID_REUSED"`

3. `"retireUnownedRecord suppresses kill when revalidation returns undefined (#620)"`:
   - Mirror of #1 for `retireUnownedRecord` path

#### F3b tests — `test/core/runner/cross-process-lock.test.ts`

**Step 2 — Write 2 failing tests**:

4. `"runWithAccessExecutionLock passes onHeartbeatError through to startLockHeartbeat (#620)"`:
   - Spy on `onHeartbeatError`; `utimes` throws `EPERM`
   - Assert the callback was invoked with the error

5. `"startLockHeartbeat default callback is a no-op (#620)"`:
   - Call `startLockHeartbeat` without supplying `onHeartbeatError`
   - Spy on `console.debug`, `console.log`, `console.error`; `utimes` throws `EPERM`
   - Assert none of the spies were called

#### F3b tests — `test/core/runner/access-runner-lock-heartbeat.test.ts`

**Step 3 — Write 1 failing test**:

6. `"AccessPowerShellRunner.run surfaces non-ENOENT heartbeat errors as warning Diagnostics on OperationResult (#620)"`:
   - Use the `stubPort` pattern (stub `lockFileSystem` with `utimes` that throws `EPERM`)
   - Assert returned `OperationResult.diagnostics` contains `{ level: "warning", source: "access.heartbeat" }`

**Step 4 — Verify RED**: Run all 6 new tests — all fail.

### Implementation steps

#### F3a (commit 1)

**File**: `src/core/operations/access-operation-preflight.ts`

**Step 5 — F3a insertion in `scanAndCleanOrphans` (~line 272)**:

After the F1 headless gate (new `if (process.mainWindowHandle !== 0)` block) and before the `try { await processKiller.kill }` block:

```typescript
// F3a: revalidate PID immediately before kill to close TOCTOU race
let revalidated: OsProcessInfo | undefined;
try {
  revalidated = await withTimeout(
    this.options.processInspector.getProcess(process.pid),
    this.options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
  );
} catch {
  // Timeout — treat as "cannot prove" → suppress kill
  result.errors.push({
    operationId: "orphan",
    message: `Preflight kill suppressed for PID ${process.pid}: revalidation timed out.`,
  });
  continue;
}
if (revalidated === undefined) {
  result.errors.push({
    operationId: "orphan",
    message: `Preflight kill suppressed for PID ${process.pid}: process no longer exists.`,
  });
  continue;
}
if (
  revalidated.name.toUpperCase() !== "MSACCESS.EXE" ||
  !sameProcessStartTime(revalidated.startTime, process.startTime)
) {
  result.errors.push({
    operationId: "orphan",
    message: `CLEANUP_RACE_PID_REUSED: PID ${process.pid} is no longer the scanned MSACCESS.EXE (revalidation mismatch).`,
  });
  continue;
}
```

**Step 6 — F3a insertion in `retireUnownedRecord` (~line 370)**:

Mirror of Step 5 using `matchingProcess.pid` and `matchingProcess.startTime`.

#### F3b (commit 2)

**File**: `src/core/runner/cross-process-lock.ts`

**Step 7 — F3b-a: Change default `onHeartbeatError` (~line 138)**:

```typescript
// REPLACE default:
onHeartbeatError: (error: unknown) => logSwallowedIoError("cross-process-lock:heartbeat", error),

// WITH:
onHeartbeatError: (error: unknown) => { /* F3b: default is silent no-op; runner supplies explicit sink */ },
```

Also drop the `logSwallowedIoError` import if it becomes unused.

**Step 8 — F3b-b: Add 6th param to `runWithAccessExecutionLock` (~line 193)**:

```typescript
export async function runWithAccessExecutionLock<T>(
  key: string,
  work: () => T | Promise<T>,
  timeoutMs: number,
  fileSystem: LockFileSystemPort,
  lockState: Map<string, Promise<void>> = defaultAccessExecutionLocks,
  onHeartbeatError: (error: unknown) => void = () => {}, // F3b: silent default
): Promise<T> {
```

**Step 9 — Pass `onHeartbeatError` to `startLockHeartbeat` (~line 226)**:

```typescript
// REPLACE:
const stopHeartbeat = startLockHeartbeat(lockPath, fileSystem);

// WITH:
const stopHeartbeat = startLockHeartbeat(lockPath, fileSystem, undefined, onHeartbeatError);
```

**File**: `src/core/runner/access-runner.ts`

**Step 10 — F3b-c + F3b-d: Collect heartbeat errors in runner (~L180-194 and L347)**:

Around L180 (in the `run` method, inside the `runWithAccessExecutionLock` call):

```typescript
// F3b: collect non-ENOENT heartbeat errors for diagnostics
const heartbeatErrors: unknown[] = [];
const heartbeatSink = (error: unknown) => { heartbeatErrors.push(error); };

return await runWithAccessExecutionLock(
  config.accessDbPath,
  async () => {
    return await this.runLockedOperation<TData>(operation, config, options, heartbeatSink);
  },
  this.lockAcquireTimeoutMs,
  this.lockFileSystem,
);
```

Update `runLockedOperation` signature to accept `heartbeatSink`:

```typescript
private async runLockedOperation<TData = unknown>(
  operation: AccessRunnerOperation,
  config: DysflowConfig,
  options: AccessRunnerRunOptions,
  heartbeatSink?: (error: unknown) => void,
): Promise<OperationResult<TData>> {
```

Around L347 (after `const diagnostics = [...collectDiagnostics(...)]`):

```typescript
// F3b: append heartbeat errors as warning diagnostics
if (heartbeatSink && heartbeatErrors.length > 0) {
  for (const err of heartbeatErrors) {
    diagnostics.push(
      createDiagnostic(
        "warning",
        "access.heartbeat",
        `Heartbeat refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}
```

**Step 11 — Verify GREEN**: Run `pnpm test -- --testPathPattern="access-operation-preflight|access-runner-lock-heartbeat|cross-process-lock"` — all F3a + F3b tests pass.

### CHANGELOG task

Add entry to `CHANGELOG.md`:

```markdown
### Changed

- Orphan kill at preflight sites (`scanAndCleanOrphans`, `retireUnownedRecord`) now
  revalidates the PID with `processInspector.getProcess(pid)` immediately before
  calling `processKiller.kill`. If the PID is gone or recycled, the kill is
  suppressed and a diagnostic is recorded (`CLEANUP_RACE_PID_REUSED`).
- `runWithAccessExecutionLock` accepts an optional `onHeartbeatError` callback.
  Non-ENOENT heartbeat failures now surface as warning diagnostics
  (`source: "access.heartbeat"`) on the `OperationResult` instead of being
  silently swallowed by `console.debug`. ENOENT (lock already released) remains
  suppressed.
```

### Verification

- `pnpm test` passes
- `pnpm build` passes
- Existing `cross-process-lock.test.ts` tests (not F3b-flavored) remain unaffected
- `access-runner-lock-heartbeat.test.ts` existing tests pass

### Rollback

- **PR 3a (F3a commit)**: `git revert <F3a-sha>` — F3a tests fail; F3b untouched
- **PR 3b (F3b commit)**: `git revert <F3b-sha>` — `startLockHeartbeat` default reverts to `logSwallowedIoError`; F3b tests fail; F3a untouched

The 2-commit split inside PR 3 means a future rebase can drop just F3b without rebasing the whole chain.

---

## Phase summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| PR 1 | 8 test changes + 2 source edits | Headless detection gate |
| PR 2 | 2 test changes + 1 source gate | Force-vs-running contract |
| PR 3 (F3a) | 3 test changes + 1 source revalidation | Orphan-kill race |
| PR 3 (F3b) | 3 test changes + 3 source edits | Heartbeat propagation |
| **Total** | **18 test changes + 5 source files modified** | |

---

## Cross-cutting concerns

### New error codes introduced

| Code | PR | Context |
|------|----|---------|
| `CLEANUP_RUNNING_FORCE_REFUSED` | PR 2 | F2 — typed error code returned from `cleanup({force:true})` on running records |
| `CLEANUP_RACE_PID_REUSED` | PR 3 | F3a — embedded in preflight `errors[].message` (not a typed field; see design D4) |

### New diagnostic source introduced

| Source | PR | Context |
|--------|----|---------|
| `access.heartbeat` | PR 3 | F3b — non-ENOENT heartbeat failures surfaced as warning diagnostics |

### Doc updates (design §Documentation Updates)

| File | Change |
|------|--------|
| `AGENTS.md` | Append paragraph to process-safety section pointing to `openspec/specs/process-lifecycle-safety/spec.md` |
| `docs/mcp-examples.md` | Amend `dysflow_access_cleanup` example to show `CLEANUP_RUNNING_FORCE_REFUSED` |
| `src/core/adapters/mcp/*` (or relevant tool desc) | Tighten `dysflow_access_force_cleanup_orphaned` description: "headless (`mainWindowHandle === 0`) MSACCESS" |
