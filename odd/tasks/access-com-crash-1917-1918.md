# Access COM teardown crash — #1918 (diagnose), #1917 (resilience), release v4.5.2

Branches: `diag/1918-com-close-trace`, then `fix/1917-*` from `origin/main`. Delivery: PR + merge on green CI and approved review; release v4.5.2 after the full Access E2E battery on main passes.
Runner: `pnpm exec vitest run` (focused), `pnpm test`, Pester via `Invoke-Pester -Path scripts/tests`; battery `pnpm test:e2e:mcp:release` (never as a local pre-tag gate — the tag workflow is the authority).

## Specs

S1: "You are dysfix. The previous dysfix session was lost when Herdr restarted; you resume its work on DysTelefonica/dysflow (local checkout C:\00repos\codigo\dysflow, currently on branch diag/1918-com-close-trace)."

S2: "The user explicitly authorized: implementing, opening PRs, merging your own PRs on green CI and approved review, and cutting release v4.5.2 once the full Access E2E battery on main passes."

S3: "Current state (verify with gh before acting):
- #1899 zombie: fixed by #1910 and #1916 (merged). Battery run 40309349235 on main 87b7e070: 164 PASS, no zombie, aborted in the issue-1817 scenario with VBA_MANAGER_TIMEOUT (verify_code export timed out after 88290 ms).
- Root cause (coordinator analysis, Windows Application log event 1000): MSACCESS.EXE crashes with 0xc0000005 in combase.dll at fixed offsets 0x19e515/0x19e518, ~5 s after launch, i.e. on COM session teardown. 538 crashes in 12 days, since August, across all Office and combase builds. Symptoms: 0x80080005 when launching right after a crash, 0x800706BA on Quit of an already dead Access, and export hangs until timeout.
- #1918 (investigate which COM shutdown sequence triggers the crash): PR #1919 open (trace of the close sequence, inert by default, enabled only in the battery). The user granted its review earlier; check its review and CI state, finish it and merge it on green.
- #1917 (resilience): retry launch on 0x80080005 after the previous instance exited; tolerate 0x800706BA on Quit only after the edit was saved, keeping the original exception; make a session whose Access died fail fast instead of waiting for the timeout.
- #1908: import_all 61 s timeout and surviving Access after it. #1911: test_vba orphans. Lower priority."

S4: "Plan (agreed with the coordinator):
1. Merge #1919, run the battery with the trace on, and correlate the close sequence with event 1000 of the same PIDs. At most two battery runs for #1918; if no clear sequence appears, record the findings in #1918 and move on.
2. Then #1917, test first for each point (observe RED, then GREEN).
3. When the full battery on main passes, release v4.5.2. Tags v4.5.0 and v4.5.1 exist unpublished: do not touch them."

S5: "Rules:
- Do not create new worktrees (the user does not want them): work in the existing checkout with feature branches from the current origin/main.
- Conventional commits. Never add Co-Authored-By or any AI attribution.
- Never kill MSACCESS processes you did not start, and never touch Office. Do not touch files managed by gentle-ai.
- Review consent (RDD granted/declined) is the user's decision: show the full envelope and wait; the coordinator relays the answer.
- Keep shell output bounded. Ask only if truly blocked, and say exactly what you need.
- Report: PR numbers, merge status, issues closed, battery run ids and results, release tag, and any failed or skipped check."

## Tasks

- [x] T1 — S3,S4 — inline: fixed the #1919 regression (piecewise loader list in `dysflow-vba-manager.Tests.ps1` missed `Write-ComCloseTrace`); added the teardown-entry marker and the failed-open Quit trace; Pester RED observed then GREEN.
- [x] T2 — S3,S4 — inline: added the Application-event-log crash collector and uploaded the trace + crash events as workflow artifacts, so the close sequence can be correlated with event 1000 of the same PIDs.
- [ ] T3 — S3,S4 — inline: push the branch, obtain the native review, merge PR #1919 on green CI.
- [ ] T4 — S4 — inline: dispatch the battery on main with the trace on, correlate the trace PIDs with event 1000, record the findings in #1918.
- [ ] T5 — S3,S4 — inline: #1917 point 1, retry launch on 0x80080005 after the previous instance exited (RED then GREEN).
- [ ] T6 — S3,S4 — inline: #1917 point 2, tolerate 0x800706BA on Quit only after the edit was saved, keeping the original exception (RED then GREEN).
- [ ] T7 — S3,S4 — inline: #1917 point 3, make a session whose Access died fail fast instead of waiting for the timeout (RED then GREEN).
- [ ] T8 — S3,S4 — inline: PR for #1917, review, merge on green CI.
- [ ] T9 — S4 — inline: release v4.5.2 through the canonical release flow once the full battery on main passes. Do not touch tags v4.5.0 / v4.5.1.

## #1917 implementation spec

Route: ONE writer. The three points share `scripts/lib/dysflow-access-com.ps1` and
`scripts/dysflow-vba-manager.ps1`, so they are not independent units and cannot run in
parallel. Test-first: for each point, write the RED test, observe it failing for the
RIGHT reason (a missing behaviour, never a compile or syntax error), then make it GREEN.

### Facts already established (do not re-derive)

- A COM failure surfaces `$_.Exception.HResult` as a SIGNED Int32: 0x80080005 is
  -2146959355 and 0x800706BA is -2147023174. The unsigned form is
  `([int64]$h) -band 0xFFFFFFFFL`. The `L` suffix matters: without it PowerShell
  parses the mask as Int32 -1 and the band is a no-op.
- `Open-CanonicalAccess` (scripts/lib/dysflow-access-com.ps1) takes the injectable seams
  `-ComSpawnAction`, `-HwndToPidAction` and `-WmiSnapshotAction`. The spawn is the line
  `$access = & $ComSpawnAction` (today ~line 527) and is currently unguarded.
- `Close-CanonicalAccess` (same file, today ~line 703) reads only `AccessApplication`,
  `OwnedPid`, `PidAttributed` and `OriginalAutomationSecurity` from the session, and
  returns `{OwnedPidKilled, PidWasAttributed, UnattributedKilled}`. `Quit(2)` is today
  ~line 736 and its exception is swallowed into `Write-Debug`.
- `scripts/dysflow-vba-manager.ps1`: `Open-AccessDatabase` (~line 2382) returns a
  PSCustomObject with `CanonicalSession`; `Close-AccessDatabase` (~line 2443) is the
  ONLY caller of `Close-CanonicalAccess` from the manager, and the manager has exactly
  ONE call site of `Close-AccessDatabase`: the top-level `finally` (~line 6061), whose
  errors are swallowed. The top-level `catch` (~line 6020) emits `VBA_MANAGER_FAILED`.
- The save happens in the `$save` scriptblock inside `Invoke-ImportAction` (~line 5888);
  it returns `$null` on success and an error STRING otherwise, and `$Session` is in scope.
- `Invoke-ExportAction` (~line 5141) receives `-Session`, so the owned Access PID is
  reachable as `$Session.CanonicalSession.OwnedPid` (fallback `$Session.ProcessId`).
  The risky COM calls are `SaveAsText` (~line 2646) and `component.Export` (~line 2680).
- There is NO reusable "is this PID alive" helper anywhere in `scripts/`.

### P1 — retry the launch once on 0x80080005, after the previous instance exited

- When the spawn fails with HRESULT 0x80080005 (CO_E_SERVER_EXEC_FAILURE), wait
  (bounded) until no MSACCESS.EXE process exists beyond the PRE-OPEN snapshot — the
  previous instance has finished exiting — then retry the spawn EXACTLY ONCE.
- Any other error is rethrown unchanged, with no retry.
- If the retry fails too, rethrow the ORIGINAL (first) exception, so the diagnostic does
  not change shape between runs. Mention the retry in its message.
- Nothing is ever killed. The wait only READS the process table.
- New injectable seams on `Open-CanonicalAccess`: `-SpawnRetryTimeoutMs` (default 5000)
  and `-SpawnRetryPollMs` (default 250). The wait reuses the existing
  `-WmiSnapshotAction` seam, so a test drives it without WMI.
- New helper in the same file: `Test-ComHResult -ErrorRecord <err> -HResult <int64>`,
  true when the unsigned forms match.

### P2 — tolerate 0x800706BA on Quit only after the edit was saved, keeping the original exception

- The session object carries an optional boolean `EditSaved` (absent means $false).
- A Quit failure whose HRESULT is 0x800706BA (RPC_S_SERVER_UNAVAILABLE):
  - `EditSaved` = $true -> TOLERATE: the Access process is already dead and the edit is
    persisted, so the operation is not failed by it.
  - `EditSaved` = $false -> NOT tolerated: the caller must learn the edit may be lost.
- A Quit failure with any other HRESULT is reported the same way as the not-saved case.
- `Close-CanonicalAccess` NEVER throws for a Quit failure (it runs inside a `finally`).
  It REPORTS it in its result instead: the result gains `QuitFailed` (bool),
  `QuitErrorCode` (the HRESULT in hex) and `QuitErrorMessage`.
- The ORIGINAL exception is always kept: when the operation had already failed, the close
  failure is appended to that failure, never substituted for it.

Caller side, `scripts/dysflow-vba-manager.ps1`:
- Extend the canonical session returned by `Open-AccessDatabase` with an `EditSaved`
  NoteProperty, default $false.
- On the success path of the `$save` scriptblock (it returns `$null`), set the canonical
  session's `EditSaved` to $true.
- `Close-AccessDatabase` must RETURN the close result so the caller can act on it.
- The top-level `finally` must:
  - keep the ORIGINAL error when the operation already failed, appending the close
    failure to its message;
  - fail the operation with the typed code `ACCESS_QUIT_FAILED_EDIT_NOT_SAVED` when the
    operation succeeded, the close failed, and the edit was NOT saved.

### P3 — fail fast when the session's Access died

- New helper in `scripts/lib/dysflow-access-com.ps1`:
  `Test-AccessProcessAlive -AccessPid <int> [-ProcessProbeAction <scriptblock>]`,
  true while the process is running. The probe is an injectable seam so a test drives
  it without a real process.
- `Invoke-ExportAction` checks the owned Access PID before the first VBComponents access
  and before each per-module export in the loop. When the PID is gone it fails
  IMMEDIATELY with the typed code `ACCESS_SESSION_DIED` instead of waiting for the
  PowerShell timeout.
- A COM call that fails with HRESULT 0x800706BA inside the export path is reported with
  the same typed code `ACCESS_SESSION_DIED`.

### Tests (Pester, under `scripts/tests/`)

- `scripts/tests/dysflow-access-com-spawn-retry-1917.Tests.ps1`
  1. a spawn that fails once with 0x80080005 and succeeds on the retry is called twice
     and returns the COM object;
  2. a spawn that fails with 0x80080005 twice throws the ORIGINAL error;
  3. a spawn that fails with any other HRESULT is called once and the error propagates;
  4. the wait ends once no MSACCESS exists beyond the pre-open snapshot, and the wait is
     BOUNDED (a snapshot that never settles does not retry forever).
- `scripts/tests/dysflow-access-com-quit-1917.Tests.ps1`
  1. a Quit that fails with 0x800706BA and `EditSaved = $true` is tolerated (the result
     reports the quit failure, the operation is not failed);
  2. the same failure with `EditSaved = $false` (or absent) is reported;
  3. a Quit failure with another HRESULT is reported even when `EditSaved = $true`;
  4. a Quit failure never throws out of `Close-CanonicalAccess`.
- `scripts/tests/dysflow-vba-manager-close-1917.Tests.ps1`
  1. an operation that already failed keeps ITS error, with the close failure appended;
  2. an operation that succeeded with a not-saved close failure ends as
     `ACCESS_QUIT_FAILED_EDIT_NOT_SAVED`;
  3. an operation that succeeded with a saved close failure still succeeds.
- `scripts/tests/dysflow-vba-manager-export-liveness-1917.Tests.ps1`
  1. an export whose Access PID is gone fails with `ACCESS_SESSION_DIED` and does not
     reach the per-module export;
  2. an export whose Access PID is alive proceeds.

Every test asserts the observable effect through the public function surface (what it
returns, what it throws, which code it reports) and never internal call order.

### Verification

- `pwsh -NoProfile -NonInteractive -Command "Invoke-Pester -Path scripts/tests -PassThru -Output Minimal"`
- `pnpm exec biome check src/ test/` only if TypeScript is touched.
- The whole `scripts/tests` suite must be green, not just the new files.

### Constraints

- Conventional commit, no AI attribution, no Co-Authored-By.
- Do NOT kill any MSACCESS process, and do NOT touch Office.
- Do NOT weaken the existing safety invariants: never terminate Access by path, name or
  CommandLine; the null-PID close stays a no-kill path.
- Keep the changes INSIDE the two PowerShell files and the new Pester test files. Do not
  change the TypeScript side, the workflows, or the docs in this unit.

## Log

L1: "You are dysfix. The previous dysfix session was lost when Herdr restarted; you resume its work on DysTelefonica/dysflow (local checkout C:\00repos\codigo\dysflow, currently on branch diag/1918-com-close-trace)."
L2: "The user explicitly authorized: implementing, opening PRs, merging your own PRs on green CI and approved review, and cutting release v4.5.2 once the full Access E2E battery on main passes."
L3: "Plan (agreed with the coordinator):
1. Merge #1919, run the battery with the trace on, and correlate the close sequence with event 1000 of the same PIDs. At most two battery runs for #1918; if no clear sequence appears, record the findings in #1918 and move on.
2. Then #1917, test first for each point (observe RED, then GREEN).
3. When the full battery on main passes, release v4.5.2. Tags v4.5.0 and v4.5.1 exist unpublished: do not touch them."
L4: Evidence — PR #1919 is open at 20004d82; CI run 40312500046 had `Windows PowerShell/Access smoke` FAILURE and `Quality gates (26)` still running; no review recorded on the PR. RDD is `on` (decided by global).
L5: Evidence — RED reproduced locally, and it is caused by this branch, not pre-existing: `Invoke-Pester -Path scripts/tests` on the branch gives 690 passed / 3 failed, the three failures all in `dysflow-vba-manager.Tests.ps1` ("Close-AccessDatabase - owned Access PID cleanup"). The same file on `origin/main` gives 246 passed / 0 failed. Cause: `Close-CanonicalAccess` now calls `Write-ComCloseTrace`, and that test file loads the shared module function-by-function (`Stop-AccessPidAndWait`, `Close-CanonicalAccess`, `Get-NullPidCloseNotice`), so the helper is undefined and the call throws.
L6: Evidence — the E2E runner `ardelperal-per-windows-2026` (label `dysflow-e2e`) IS this machine: local time is UTC+1 and the crash cluster 11:51-12:09 local matches battery run 40309349235 (10:41Z-11:00Z = 11:41-12:00 local) exactly. Local Application log holds 564 MSACCESS event-1000 entries, exception 0xc0000005 in combase.dll at offset 0x19e515. The correlation for #1918 is therefore possible locally, and the trace file lands in `runner.temp` on this machine.
L7: Decision — the collector parses the event XML by `EventData` name, not by the rendered message, because the message is localized (Spanish on this machine) and a message-text parser would break on any locale.
L8: Evidence — the COM close trace of #1919 never reached the scripts: `src/adapters/powershell/default-executor.ts` builds the child environment from an explicit allowlist (`POWERSHELL_SYSTEM_ENV_KEYS`), and the two spawn sites pass only the password keys. `DYSFLOW_TRACE_COM_CLOSE` was therefore dropped before `dysflow-vba-manager.ps1` / `dysflow-access-runner.ps1` ran, and the trace file stayed empty: the whole #1918 diagnosis would have been blind. Fixed by allowlisting the variable (absent by default) and pinned by two tests (RED observed without the allowlist entry, GREEN with it).
L9: Evidence — the collector exported 0 lines against the REAL Application log even though it read 282 events. Cause: `Set-StrictMode -Version Latest` plus `$data.'#text'` — a real Application Error event ends with two EMPTY `<Data />` elements, which have no text node at all, so reading `'#text'` threw and the event was dropped. Fixed by reading the DOM (`GetAttribute("Name")` + `InnerText`), pinned by a test with empty Data elements, and re-verified against the real log (120 crash lines exported for 2026-10-26).
L10: Evidence — two PowerShell traps found by the tests, both now avoided: (a) `$pid` is a read-only automatic variable (`$PID`), so the decoded process id uses `$processId`; (b) a local named `$sinceUtc` IS the typed `[string]` parameter `$SinceUtc` (PowerShell names are case insensitive), so assigning a DateTime to it coerced it back to a string and `ToString("o")` then had no overload. The local is now `$sinceInstant`.
L11: Evidence — Pester RED before the fix: 690 passed / 3 failed, the three failures all in `dysflow-vba-manager.Tests.ps1` ("Close-AccessDatabase - owned Access PID cleanup"), because that file loads the shared COM module function by function and did not load the new `Write-ComCloseTrace`. Same file on `origin/main`: 246 passed / 0 failed. After the fix: the whole `scripts/tests` suite is 699 passed / 0 failed / 4 skipped.
L12: Evidence — the trace chain is now complete end to end: GitHub Actions sets `DYSFLOW_TRACE_COM_CLOSE` on the battery step, `E2E_testing/mcp-e2e.mjs` spawns the MCP server with `{ ...process.env }` (line 451), the MCP server forwards the variable to the child PowerShell through the allowlist, and `Write-ComCloseTrace` appends the step order and the owned PID.
L13: Evidence — full local `pnpm test`: 6311 passed, 5 failed in 3 files. One failure was MINE and is fixed: `test/quality-gates/ci-workflow.test.ts` asserts the battery step's `run:` is the literal `pnpm test:e2e:mcp:release`, and the helper `workflowRunCommands` reads only single-line `run:` values, so the marker was moved into its own step instead of a block scalar. The other four failures (`skills-installer.test.ts`, `pointer-rollout-1530.test.ts`) are PRE-EXISTING on this machine: with the whole change set stashed they still fail (2 files / 4 tests), because the real `C:\Users\adm1\.gentle-shell\agent\skills` leaks into the adapter discovery. Not caused by this work and not fixed by it.
L14: Evidence — `test/quality-gates/**` plus `test/adapters/powershell/**`: 62 files / 425 tests pass. Pester `scripts/tests`: 699 passed / 0 failed / 4 skipped.
L15: Evidence — #1917 P1 RED (`dysflow-access-com-spawn-retry-1917.Tests.ps1`), with no implementation: 1 passed / 4 failed. The single-failure retry rethrew "Server execution failed" (no retry). The double-failure and bounded-wait cases saw `Expected 2, but got 1` spawn calls. The wait-for-exit case also rethrew. The non-0x80080005 case already passed and stays as a guard. GREEN after `Test-ComHResult`, `Wait-AccessInstancesBeyondSnapshotExit` and the guarded spawn in `Open-CanonicalAccess`: 5/5. When the retry fails too, the error is a `COMException` with the FIRST attempt's HRESULT and message plus a retry note. A COMException's HResult cannot be reassigned, so the error is rebuilt with that HResult rather than rethrown as the same object.
L16: Evidence — #1917 P2 RED (`dysflow-access-com-quit-1917.Tests.ps1`): 2 passed / 4 failed, every failure `Expected $true, but got $null` on `QuitFailed`, because Quit errors were swallowed into `Write-Debug`. GREEN 6/6 after the result gained `QuitFailed`, `QuitErrorCode`, `QuitErrorMessage` and `QuitFailureTolerated`; the last one is the single place that decides tolerance. A ScriptMethod's throw arrives wrapped in `MethodInvocationException`, so `Test-ComHResult` walks `InnerException`.
L17: Decision — the result channel accepts exactly ONE `DYSFLOW_RESULT` line (`src/core/runner/ps-result-channel.ts:38`), and the action emits its result before the top-level `finally` closes Access. The manager therefore HOLDS the result (`$script:DeferDysflowResult` in `Write-DysflowResult`) until `Complete-AccessSessionClose` knows the Quit outcome, then emits once. `exit` inside `finally` overrides the exit code, which was verified in pwsh. The trap flushes a held result. Manager RED (`dysflow-vba-manager-close-1917.Tests.ps1`) was taken after a behaviour-preserving extraction of the `finally` into `Complete-AccessSessionClose`: 2 passed / 4 failed. The failures were a missing close result (`$null`), no close failure appended to the original error, and a not-saved close failure still reported `ok:true`. GREEN 6/6.
L18: Evidence — #1917 P3 RED (`dysflow-vba-manager-export-liveness-1917.Tests.ps1`): 1 passed / 2 failed. With a dead PID the export reached the per-module export (`Expected 0, but got 1`). A 0x800706BA from the export became a warning (`ok:true`). GREEN 3/3. The liveness test uses REAL pids: `$PID` is alive, and an exited `cmd /c exit` child is gone.
L19: Decision — the P3 check lives INSIDE `Invoke-ExportAction` as a local scriptblock, with an inline 0x800706BA match. A first version used new manager helpers and broke 17 existing tests: `dysflow-vba-manager.Tests.ps1`, `-issue1443` and `-import-lists` load `Invoke-ExportAction` alone from the AST, without the shared module. `Test-AccessProcessAlive` is called only when the session has an owned PID, which those fixtures never set. The structural guards also constrain the `trap`: no call before `Write-DysflowResult`'s definition, and the marker must stay at or before line 220. Full Pester `scripts/tests`: 719 passed / 0 failed / 4 skipped (baseline 699).
L20: Evidence — #1918 CORRELATION, battery run 40321714759 on main 437820ae, artefact `access-com-crash-evidence-40321714759`. The trace worked: 48 teardown sequences, 294 lines, 49 distinct PIDs. 23 crash events were collected. THE CRASHED PIDS AND THE TORN-DOWN PIDS ARE COMPLETELY DISJOINT: 0 of 23 overlap. Using the `ProcessCreationTime` that event 1000 already carries: 22 of the 23 crashed processes were only 3,0-3,4 s old when they died. Over the whole history (1300 MSACCESS event-1000 entries) 1151 (88,5 %) died within 10 s of their creation and 1207 (92,8 %) within 20 s; only 5 lived over 120 s. So the crash lands ~3,4 s AFTER THE ACCESS INSTANCE STARTS, not during its teardown, and the instance that crashes is never one dysflow closed. The earlier "crash on COM session teardown" reading is wrong.
L21: Evidence — what precedes it, from the trace: `Quit` to `KillOwnedPid` is 306-3220 ms (mean 965 ms) in all 48 sequences, and `Stop-AccessPidAndWait` issues `Stop-Process -Force` WITHOUT first checking whether the process already exited. So Access is force-killed while it is still releasing its own COM references. The hypothesis is that this leaves the COM class-factory state dirty, and the NEXT `New-Object -ComObject Access.Application` then either fails with 0x80080005 or starts an MSACCESS.EXE that dies 3,4 s later in combase.dll. The cascade is visible: two instances created 7 s apart (12:32:17 and 12:32:24) both died ~3,5 s after creation with no teardown in between. The hypothesis is NOT yet proven causally: the proving experiment is to stop killing a PID that exits on its own after `Quit(2)` and re-run the battery, which is a teardown behaviour change with a zombie risk and belongs in its own issue with its own test. Findings recorded in #1918 (comment 6416397779).
L22: Evidence — the battery abort of run 40321714759 (`Error al crear la canalizacion`) is NOT the COM bug: it is virtual-memory exhaustion on this machine (Resource-Exhaustion-Detector event 2004; commit limit 39,7 GB with 1,3 GB free; 48 event-2004 entries in 5 days, 12 today). Segments of the trace that coincide with an event 2004 must be discarded before attributing anything to the close sequence. No system setting was changed: the pagefile is the user's decision.
L23: Decision — REBOOT POINT. The #1917 work is committed on `fix/1917-access-crash-resilience` (WIP: not reviewed, not merged, no PR yet) and pushed to that branch, so nothing is lost across the reboot. No new battery run is started until the machine is back with the new pagefile.
L24: NEXT STEP (after the reboot): (1) re-run the nightly battery on main with `gh workflow run nightly-access-e2e.yml --ref main` and confirm it gets past the issue-1817 scenario with the new pagefile, because the release of v4.5.2 requires the full battery on main to pass; (2) open the PR for #1917 and get the native review, splitting the unit if the review workload demands it (973 authored lines is over the ~400 slice); (3) if the battery still fails, the remaining candidate is the #1918 proving experiment (stop killing a PID that exits on its own), which needs its own issue and its own test; (4) cut v4.5.2 only after the battery is green. Tags v4.5.0 and v4.5.1 stay untouched.

