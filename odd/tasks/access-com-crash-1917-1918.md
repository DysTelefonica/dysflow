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
