# Test runs

What `test_vba` and `run_vba` open, and what the compile reminder means.

## `test_vba` runs on a copy

`test_vba` never opens the frontend in the worktree. For each run the runner copies the `.accdb` byte for byte into a new folder, `%TEMP%\dysflow-test-sandbox-<guid>\<name>-sandbox.accdb`, opens the copy, and deletes it when the run ends, pass or fail. Source: `Get-TestSandboxPath`, `Invoke-RunTestsAction` and `Remove-TestSandbox` in `scripts/dysflow-vba-manager.ps1` (issue #1013).

During a run, `CurrentProject.Path` is the sandbox folder. Paths relative to the `.accdb`, such as `src\`, `tests\` or a fixture next to the frontend, do not exist there. Do not build repository paths from `CurrentProject.Path` inside a test atom.

Changes the run makes to the copy are deleted with it. The copy keeps the frontend's table links, so it does not isolate backend data: HR-3 of `dysflow-arnes` still applies.

## `test_vba` compiles the copy first

Before it runs any test, `test_vba` compiles the sandbox copy: `RunCommand(126)` (`acCmdCompileAndSaveAllModules`), then `Application.IsCompiled`. A copy that is already compiled is not recompiled. This is the only compile Dysflow performs; it never compiles the user's binary (HR-1 of `dysflow-arnes`). Source: `Invoke-TestSandboxCompile` in `scripts/dysflow-vba-manager.ps1` (issue #1911).

- Without it, `Application.Run` compiles on demand, and a compile error opens a modal VBE dialog that the COM call never returns from: the run hangs until it times out.
- When the copy does not compile, the result is `VBA_COMPILE_ERROR` and no test runs. `error.details.firstError.module` names the module when Access reports it.
- `Assert-TestSandboxCompileTarget` refuses to compile anything but a `dysflow-test-sandbox-*` copy directly under the temp directory that differs from the configured `.accdb` and is the database Access has open.
- `run_vba`, imports and exports never compile.

A compile error still fails the RED rule of HR-1: a RED counts only when it fails on the expected assertion.

## `run_vba` opens the real binary

`run_vba` maps to the `Run-Procedure` action, which opens the configured `.accdb` itself (`Invoke-RunProcedureAction`). A green `run_vba` does not reproduce the sandbox condition, so the result of record for a test is the `test_vba` result.

## Compile reminder

`humanCompilePending` is a reminder, not a gate. While it is `true`, successful `import_modules`, `import_all`, `delete_module`, `test_vba` and `run_vba` results carry a `humanCompileReminder` field (`withHumanCompileReminder` in `src/adapters/mcp/result-translation.ts`). No tool refuses a call because of it. `bootstrap-and-capabilities.md` explains when the flag turns on and off.

Compiling is a team convention (HR-1 of `dysflow-arnes`):

1. Import the test and run it RED with no compile. It counts only when it fails on the expected assertion, not on a compile error or a procedure that was not found.
2. Import the implementation.
3. Ask the human to compile in Access once (Debug > Compile) and wait for confirmation.
4. Run the GREEN `test_vba`.
