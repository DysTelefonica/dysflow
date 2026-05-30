# Design: Fix MS Access Zombie Processes

## Technical Approach

Refactor `dysflow-access-runner.ps1` to use a structured exit pattern (returning to script root instead of using inline `exit` statements) to ensure that the global `finally` block always executes. Capture the specific `MSACCESS.EXE` process PID during startup via WMI delta, and re-resolve it at cleanup time by matching the database path in the process command line (handling WMI timing races and COM singleton reuse). Implement a deterministic wait-and-kill sequence in the global `finally` block: first try polite `Stop-Process`, then poll up to 20 seconds for actual process exit, then escalate to `taskkill /F /PID` if the process survives. Ensure all database COM objects (`$db`, `$readDb`, `$writeDb`, `$directDb`, `$directDbEngine`) are cleanly released via `FinalReleaseComObject` before terminating the Access process. Apply the same kill-and-wait pattern to `dysflow-vba-manager.ps1` via `Find-AccessPidByDatabase` and `Stop-AccessPidAndWait` helper functions.
In `E2E_testing/mcp-e2e.mjs`, add per-call zombie verification that polls for MSACCESS.EXE exit after every MCP tool invocation, excluding baseline PIDs captured at suite start.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Return-based Script Exit | Requires rewriting all inline `exit` calls to `return`, but ensures global `finally` execution. | Refactor script-scoped exits to `$script:exitCode = X; return`. |
| Targeted Process PID Force-Kill | Requires active PID mapping (delta process listing / HWND match) but prevents killing unrelated user-launched Access instances. | Capture specific `MSACCESS.EXE` PID during startup via WMI delta, re-resolve by database path in command line at cleanup time, issue `Stop-Process -Id $pid -Force` in `finally`. |
| COM RCW Release | Adds overhead of explicit COM object tracking/release, but eliminates background handles and file locks. | Wrap `$db`, `$readDb`, `$writeDb`, `$directDb` and `$directDbEngine` in `finally` blocks with `FinalReleaseComObject`, releasing secondary objects before the primary `$access` object. |
| Fixed Sleep vs Deterministic Wait | Fixed sleeps are simpler but can be insufficient for slow Access shutdown or too long for fast exits. | Replace fixed sleep with a polling loop that waits up to 20s for the specific PID to exit, then escalates to `taskkill /F /PID`. |
| Per-call vs End-of-suite Zombie Check | End-of-suite only tells if zombies exist, not which operation leaked. | Per-call zombie check after every MCP tool invocation, excluding pre-existing baseline PIDs. |

## Data Flow

```
    Node.js (AccessRunner) ────→ spawns powershell.exe ────→ dysflow-access-runner.ps1
                                                                  │
                                                        Creates Access COM Object
                                                      (Capture PID via WMI delta + HWND match)
                                                     If WMI missed PID → re-resolve by command line
                                                                  │
                                                        Executes Operation (VBA/Query)
                                                                  │
                                                      Replaces inline exits with return
                                                                  │
                                                    finally {
                                                      # Release secondary COM first
                                                      FinalReleaseComObject($db)
                                                      FinalReleaseComObject($directDb)
                                                      # Quit Access gracefully
                                                      $access.Quit()
                                                      FinalReleaseComObject($access)
                                                      # Kill PID — wait up to 20s deterministically
                                                      Stop-Process -Id $pidToKill -Force
                                                      while (not dead and $waited < 20s) {
                                                        Start-Sleep 100ms
                                                        Stop-Process -Id $pidToKill -Force
                                                      }
                                                      # Escalate if still alive
                                                      if (still alive) { taskkill /F /PID $pidToKill }
                                                      GC.Collect(); GC.WaitForPendingFinalizers()
                                                    }
                                                                  │
                                                      exit $script:exitCode
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/dysflow-access-runner.ps1` | Modify | Implement return-based exits, track Access PID with WMI delta + command-line fallback, deterministic 20s polling kill in `finally`, release all COM objects. |
| `scripts/dysflow-vba-manager.ps1` | Modify | Add `Find-AccessPidByDatabase` and `Stop-AccessPidAndWait` helpers; `Close-AccessDatabase` uses the same kill-and-wait pattern. |
| `E2E_testing/mcp-e2e.mjs` | Modify | Per-call zombie check after every MCP tool invocation via `waitForNoZombies()`, baseline PID filtering. |
| `test/core/runner/access-runner.test.ts` | Add | 24 unit/integration tests covering PID capture, `finally` block guarantees, lock acquisition, and process lifecycle cleanup. |

## Interfaces / Contracts

```powershell
# Initialized at script startup
$script:exitCode = 0
$script:accessPid = $null

# Delta process listing matching during startup:
$before = Get-MsAccessProcesses
$access = New-Object -ComObject Access.Application
# ... HWND/delta matching logic ...
$script:accessPid = $capturedPid

# At the absolute bottom of scripts/dysflow-access-runner.ps1 (outside try-catch-finally):
exit $script:exitCode
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | PowerShell Runner Execution | Verify script execution returns correct exit codes and releases COM handles under `scripts/tests/dysflow-access-runner.Tests.ps1`. |
| E2E | Zombie Process Verification | In `E2E_testing/mcp-e2e.mjs`, run all MCP commands using isolated runtime at `C:\Proyectos\dysflow\temp-runtime`, and check for lingering `MSACCESS.EXE` processes via `tasklist`. |

## Migration / Rollout

No migration required. Isolated runtime (`temp-runtime`) ensures zero impact on production runtime during build/tests.

## Open Questions

None.
