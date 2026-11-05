# Test runs

What `test_vba` and `run_vba` open, how to run a long plan without blocking, and what the compile reminder means.

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

## Long runs: start detached, keep working, fetch the result

A synchronous `test_vba` holds the MCP call until the last test ends. A plan that runs longer than the client's request timeout (often 60 s) needs another shape; an ad-hoc stdio client that keeps the call open is no longer needed (issue #1993).

1. **Start detached.** Call `test_vba({cwd, testsPath, apply:true, detach:true})`. It resolves the plan, applies the plan short-circuit and the allowlist gate exactly like the synchronous call, so a bad manifest still fails at once. It then starts the run in its own process and returns within a second or two:

   ```json
   { "mode": "apply", "detached": true, "operationId": "<id>", "status": "running", "testsPlanned": 12, "fetchWith": { "tool": "get_test_run", "operationId": "<id>" } }
   ```

2. **Keep working.** The run does not depend on the MCP call, the client or the session: a client timeout, a reconnect or a new session does not stop it.
3. **Fetch the result.** Call `get_test_run({cwd, operationId:"<id>", wait:45})`. It returns `status` (`running`, `passed`, `failed`, `cancelled` or `crashed`) and `progress` `{ completed, planned, currentTest, passed, failed }`. `wait` re-reads the run once a second until it ends, for at most 50 s, so repeat the call while `status` is `running`. Once the run ended, `result` is the `structuredContent` the synchronous `test_vba` returns: `passed`, `failed` and `tests[]`, or the `VBA_TESTS_FAILED` envelope with `error.details.failures[]`.

Rules the runtime enforces:

- **One Access per database.** While a detached run holds an `accessPath`, a second detached run or a synchronous `test_vba` apply on that database is refused with `TEST_RUN_ALREADY_ACTIVE`; `error.details.activeOperationId` names the run. Wait for it and read its result. With no detached run active, the synchronous call is unchanged.
- **Crashes are reported, not hidden.** A run whose runner process died without a result reads as `crashed`, with `crash.reason` and `crash.logTail` from `runner.log`. `cancelled` is reserved; stop a detached run through the cleanup tools (`list_access_operations`, then `cleanup_access_operation`), never by killing `MSACCESS.EXE` by name (HR-2 of `dysflow-arnes`).
- **Where it lives.** `<projectRoot>/.dysflow/runtime/test-runs/<operationId>/` holds `request.json` (never a password), `state.json`, `result.json` and `runner.log`. The last 20 runs are kept; `get_test_run` on a pruned run returns `TEST_RUN_NOT_FOUND`.
- **Same sandbox, same compile.** The detached runner calls the same `test_vba`, so everything above about the sandbox copy and its compile holds. HR-1 is unchanged: a RED counts only on the expected assertion.

## `run_vba` opens the real binary

`run_vba` maps to the `Run-Procedure` action, which opens the configured `.accdb` itself (`Invoke-RunProcedureAction`). A green `run_vba` does not reproduce the sandbox condition, so the result of record for a test is the `test_vba` result.

## Compile reminder

`humanCompilePending` is a reminder, not a gate. While it is `true`, successful `import_modules`, `import_all`, `delete_module`, `test_vba` and `run_vba` results carry a `humanCompileReminder` field (`withHumanCompileReminder` in `src/adapters/mcp/result-translation.ts`). No tool refuses a call because of it. `bootstrap-and-capabilities.md` explains when the flag turns on and off.

Compiling is a team convention (HR-1 of `dysflow-arnes`):

1. Import the test and run it RED with no compile. It counts only when it fails on the expected assertion, not on a compile error or a procedure that was not found.
2. Import the implementation.
3. Ask the human to compile in Access once (Debug > Compile) and wait for confirmation.
4. Run the GREEN `test_vba`.
