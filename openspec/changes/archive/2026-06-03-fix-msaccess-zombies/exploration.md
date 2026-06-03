## Exploration: fix-msaccess-zombies

### Current State
Currently, `dysflow-access-runner.ps1` and `dysflow-vba-manager.ps1` open MSACCESS.EXE to perform operations (such as query execution, VBA macro running, list tables, etc.). However, MSACCESS.EXE processes frequently remain open in the background (zombies) after operations finish.
The research shows that:
1. In `dysflow-access-runner.ps1`, multiple execution paths inside the main `try` block call `exit 0` directly. In PowerShell, calling `exit` immediately terminates the script and process execution, bypassing the `finally` block of any surrounding try/finally. Therefore, the COM application cleanup (`$access.Quit()`, `FinalReleaseComObject($access)`, and GC collect) never runs when an operation succeeds, leaving the MSACCESS.EXE process alive as a zombie.
2. In `dysflow-access-runner.ps1`, Process ID (PID) tracking is performed during startup via process list delta (`Write-AccessProcessMarker`), but the resulting PID is only printed to stderr and is not saved to a variable or used to kill the process if it hangs or fails to close.
3. Multiple COM references (such as `$db = $access.CurrentDb()`, `$readDb.Database`, `$writeDb.Database`, `$dbEngine` in `Compare-BackendTables`) are not explicitly released using `FinalReleaseComObject` in several success/error paths, causing the CLR COM Runtime Callable Wrappers (RCW) to keep references alive.
4. There is no isolated, temporary runtime directory option utilized in testing, meaning running E2E tests can mutate or use the active/production runtime.

### Affected Areas
- `scripts/dysflow-access-runner.ps1`
  - Remove all early `exit 0` / `exit 1` calls inside the main `try-finally` block. Instead, assign to an exit code variable `$script:exitCode` and use `return` to exit early (which allows the `finally` block to execute). Call `exit $script:exitCode` at the absolute bottom of the script.
  - Save the tracked process ID inside `Write-AccessProcessMarker` to a script-scoped variable `$script:accessPid`.
  - Add a hard-kill fallback (`Stop-Process -Id $script:accessPid -Force`) in the `finally` block, executed *before* DAO restore operations to guarantee file locks are released.
  - Explicitly close and release `$db` and other transient database objects using `FinalReleaseComObject` in `finally` and error paths.
- `E2E_testing/mcp-e2e.mjs`
  - Add explicit assertions at the end of the test suite run to verify that no `MSACCESS.EXE` processes referencing the E2E databases (`NoConformidades.accdb` or `NoConformidades_Datos.accdb`) remain running.
- `scripts/tests/dysflow-access-runner.Tests.ps1`
  - Update and verify that Pester unit tests pass under the new return-based execution flow.

### Approaches

| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| **Approach 1: Safe Return Flow & PID Hard-Kill Fallback** | - Solves root cause of bypassed `finally` blocks.<br>- Releases file locks before restoring features.<br>- Ensures robust clean-up of COM references. | - Requires replacing all `exit` calls and testing all paths. | Low |
| **Approach 2: Global Process Sweep (`Stop-Process -Name MSACCESS -Force`)** | - Simple one-liner. | - Violates project contract (Test 12: never kill by name).<br>- Can kill unrelated user instances of Access. | High (Risk) |

### Recommendation
Implement **Approach 1**. This directly addresses the architecture of the script, fixing the bypassed `finally` block root cause, adding a safe PID-based hard-kill fallback before database restore, and cleaning up COM wrappers. It fully aligns with how `dysflow-vba-manager.ps1` ensures clean termination.

### Risks
- If a background `MSACCESS.EXE` process is killed too aggressively, it could corrupt the database. However, since the hard-kill is only a fallback after `$access.Quit()` and `FinalReleaseComObject` have had a chance to run and flush changes, this risk is extremely low.
- Moving the `exit` command to the bottom of the script might affect how PowerShell reports errors if an unhandled script error happens outside the try block, but `$ErrorActionPreference = 'Stop'` and the global try-catch block mitigate this.

### Ready for Proposal
Yes — the exploration is complete, the root cause has been verified via code analysis, and the E2E test verification strategy is established.
