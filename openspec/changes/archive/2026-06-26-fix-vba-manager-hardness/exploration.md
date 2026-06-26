# Exploration: fix-vba-manager-hardness

> Materialized from Engram topic `sdd/fix-vba-manager-hardness/explore` (the explore phase ran read-only).

This exploration covers 7 key issues identified in the VBA manager integration, execution adapter, and preflight cleanup pipeline. These issues impact execution robustness, stability, resource usage, and diagnostics.

---

## 1. Issue Analysis & Proposed Solutions

### [Issue #1] B2: `delete_module` with `force=true` returns false success in active-lock

#### Affected Code
* PowerShell Script: [scripts/dysflow-vba-manager.ps1](file:///C:/Proyectos/dysflow/worktrees/bugfix/scripts/dysflow-vba-manager.ps1#L1583) inside function `Remove-AccessObjectOrComponent`.

#### Root Cause
Under active-lock conditions (e.g. database opened in MS Access, `.laccdb` active), calling `$AccessApplication.DoCmd.DeleteObject` or `$components.Remove` might fail silently or not actually remove the module from the VbProject, yet return without throwing a COM exception. A COM error only manifests on a subsequent action.

#### Technical Remedy
Perform an explicit post-deletion existence check inside both the normal and force-cleanup paths:
1. For Access Objects (Forms/Reports): check `$checkInfo = Resolve-AccessObjectInfo -AccessApplication $AccessApplication -ModuleName $ModuleName`. If `$checkInfo.Exists` is still true, throw a friction error: `throw "Error -2146771271: object still exists after DeleteObject (active-lock)"`.
2. For VBComponents: check `$checkComponent = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName`. If it is still present, throw a friction error: `throw "Error -2146771271: component still exists after Remove (active-lock)"`.
3. In both cases, this will force the handler to bubble up, trigger the `Force` or `Compact` remediation flow, and if that still fails, throw a clear exception explaining the lock instead of returning `status: "ok"`.

---

### [Issue #2] B4: `run_vba` on parameterless function requires `[ref]`

#### Affected Code
* PowerShell Script: [scripts/dysflow-vba-manager.ps1](file:///C:/Proyectos/dysflow/worktrees/bugfix/scripts/dysflow-vba-manager.ps1#L2882) inside function `Invoke-AccessProcedure`.

#### Root Cause
When executing a function without parameters (`argsJson="[]"`), the call `$AccessApplication.Run($ProcedureName)` is executed. If it fails for any reason, the `catch` block intercepts the error, parses it via `Get-PSReferenceArgumentIndexFromError` (which looks for `"PSReference"` / `"Use [ref]"` in the message). If it matches, it attempts to pad the argument list with `[System.Reflection.Missing]::Value` and retry. For a parameterless function, this retry loop is invalid and corrupts the execution context.

#### Technical Remedy
Add a short-circuit guard at the top of the execution block:
* If `$ProcedureArgs.Count -eq 0`, execute the call directly: `$result = $AccessApplication.Run($ProcedureName)` and set `$ran = $true`.
* Bypass the `ByRef` retry/padding loop entirely since there are no arguments to pass or reference.

---

### [Issue #3] B1: `vba_inline_execution` does not register `ExecuteInline` for COM

#### Affected Code
* TypeScript Adapter: [src/adapters/vba-sync/vba-execution-adapter.ts](file:///C:/Proyectos/dysflow/worktrees/bugfix/src/adapters/vba-sync/vba-execution-adapter.ts#L121) inside method `executeInline`.

#### Root Cause
The inline execution generates a random wrapper module name (e.g. `_inline_<uuid>`). Once imported, the code is invoked without compiling the VBA project first, causing COM to fail to locate the procedure within the Access context. Furthermore, failures during execution leak orphan modules in the database binary.

#### Technical Remedy
1. Standardize the temporary module name to a stable wrapper: `__dysflow_inline__`.
2. Before importing, proactively invoke the `delete_module` tool with `force: true` on `__dysflow_inline__` to clean up any leftover from previous failed runs.
3. After `import_modules` returns successfully, execute `compile_vba` tool to ensure the procedure is registered in the COM context.
4. Run the code using `run_vba` targeting `__dysflow_inline__.ExecuteInline`.
5. In the `finally` block, run `delete_module` with `force: true` for `__dysflow_inline__` and delete the local physical `.bas` file.

---

### [Issue #4] B3: `test_vba` hangs and leaves zombie `MSACCESS.EXE -Embedding`

#### Affected Code
* TypeScript Adapter: [src/adapters/vba-sync/vba-sync-adapter.ts](file:///C:/Proyectos/dysflow/worktrees/bugfix/src/adapters/vba-sync/vba-sync-adapter.ts#L220) inside method `executeMappedTool`.

#### Root Cause
If a test or procedure hangs, Node.js terminates the PowerShell process. However, because `MSACCESS.EXE` was spawned as an out-of-process COM server (`-Embedding`), it continues to run in the background. The `catch` block on the executor doesn't trigger the immediate cleanup, leaving a zombie process locking the database.

#### Technical Remedy
Update the `catch` block of `executeMappedTool` so that if the execution fails or throws:
1. Finish the tracked operation as `"failed"`.
2. Invoke `reapOrphanedAccessOnTimeout(() => this.runPreflightCleanup(target.data))` immediately to kill any orphaned/zombie process associated with the current database path.
3. Propagate the original error.

---

### [Issue #5] B5: `compile_vba` does not identify the component that fails (component=null)

#### Affected Code
* PowerShell Script: [scripts/dysflow-vba-manager.ps1](file:///C:/Proyectos/dysflow/worktrees/bugfix/scripts/dysflow-vba-manager.ps1#L2024) inside function `Get-ActiveVbeLocation`.

#### Root Cause
When Access is run in headless COM mode, the VBA editor (VBE) is not initialized or visible, resulting in `$vbe.ActiveCodePane` returning `$null`. Consequently, the compiler error location (module, line, column) cannot be extracted.

#### Technical Remedy
1. If `$vbe.ActiveCodePane` is `$null`, toggle the VBE visibility to force it to render and load the error pane:
   ```powershell
   $vbe.MainWindow.Visible = $true
   $vbe.MainWindow.Visible = $false
   ```
   Re-query `$vbe.ActiveCodePane`. If a compilation error occurred, Access focuses the cursor on the erroneous line in VBE, making `ActiveCodePane` non-null.
2. Implement a robust fallback parser in PowerShell to inspect VBComponents for simple syntax issues (like unclosed string literals on a line) if `ActiveCodePane` remains null. We can loop over each character of a line, ignore comments (by breaking on `'` when not inside a double-quoted string), and check if `$inString` remains `$true` at the end of the line.

---

### [Issue #6] B6: The JSON parser of `proceduresJson` is intolerant to extra characters

#### Affected Code
* TypeScript Adapter: [src/adapters/vba-sync/vba-execution-adapter.ts](file:///C:/Proyectos/dysflow/worktrees/bugfix/src/adapters/vba-sync/vba-execution-adapter.ts#L392) inside function `validateTestProceduresJson`.

#### Root Cause
If the MCP client appends trailing whitespace, control characters, or markdown fences (e.g. ` ```json ` blocks) to the `proceduresJson` string, `JSON.parse` fails with `SyntaxError: Unexpected non-whitespace character after JSON`.

#### Technical Remedy
Sanitize `proceduresJson` before passing it to `JSON.parse`:
1. Apply `.trim()` to remove leading/trailing whitespace.
2. Strip BOM character (`\uFEFF`, etc.) if present.
3. Detect and remove markdown code fences (` ```json ` and ` ``` `) from the payload.

---

### [Issue #7] B7: Accumulation of zombie `MSACCESS.EXE` processes not registered

#### Affected Code
* TypeScript Adapter/Core: [src/core/operations/access-operation-preflight.ts](file:///C:/Proyectos/dysflow/worktrees/bugfix/src/core/operations/access-operation-preflight.ts) in functions `retireUnownedRecord`, `scanAndCleanOrphans`, and `reconcileRunningRecord`.

#### Root Cause
1. `reconcileRunningRecord` does not register running PIDs into `handledPids`. As a result, subsequent scan operations treat running processes as orphans.
2. `retireUnownedRecord` logs a warning about unowned Access processes blocking the path but does not actually terminate them.
3. `scanAndCleanOrphans` blocks cleanup on unowned processes instead of purging them, even if they are headless (`-Embedding`).

#### Technical Remedy
1. In `reconcileRunningRecord`: add the active process PID to `handledPids` once verified alive and owned by a running operation.
2. In `retireUnownedRecord`: if a matching process is found for the path and it is headless (command line contains `-Embedding` case-insensitively), call `this.options.processKiller.kill(matchingProcess.pid)` to purge it, add it to `handledPids`, and proceed to mark the record as cleaned.
3. In `scanAndCleanOrphans`: if a process matches the database path, is headless (`-Embedding`), and is not in `handledPids` (meaning it is not owned by any active operation), kill it immediately and add to `orphanedKilled`. If it is NOT headless (i.e. user's interactive session), log a warning as before.

---

## 2. Verification Strategy

We will write unit and integration tests covering:
- Correct execution of inline VBA with compilation.
- Sanitation of test plan payloads containing code blocks or whitespace.
- Verification of cleanup logic by mocking process listings and checking that headless unowned processes are targeted for killing, while active processes are spared.
- Verifying parameterless functions compile and run successfully via `run_vba`.
