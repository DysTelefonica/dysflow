# Proposal: Fix MSACCESS.EXE Zombie Processes

## Intent
Eliminate lingering `MSACCESS.EXE` processes orphaned by dysflow operations and E2E test runs, resolving database lockups and resource leaks.

## Scope

### In Scope
- Replace early `exit` calls in `dysflow-access-runner.ps1` with return/error variables to guarantee execution of the global `finally` block.
- Capture the `MSACCESS.EXE` process PID during COM startup in `dysflow-access-runner.ps1`.
- Add forced process termination (`Stop-Process -Id $accessPid -Force`) in the script's global `finally` block.
- Release secondary COM objects (databases, tables, engines) using `FinalReleaseComObject`.
- Add E2E tests validating that no `MSACCESS.EXE` processes remain running post-execution.
- Use a temporary isolated runtime path (`C:\Proyectos\dysflow\temp-runtime`) during verification.

### Out of Scope
- Modifying Access database query behavior or query engine configuration.
- Terminating unrelated user-launched `MSACCESS.EXE` processes.

## Capabilities

### New Capabilities
None

### Modified Capabilities
None

## Approach
- **Structured Exit Pattern**: Refactor the main execution path to store the exit code/payload and complete naturally, allowing the script-level `finally` block to run.
- **Process ID Tracking**: Track the process ID at instance creation to target the exact subprocess.
- **Hard-Kill Fallback**: If the process is still running after natural cleanup/quit, force kill it using the tracked PID.
- **COM Release**: Implement `FinalReleaseComObject` cleanup on all secondary database objects.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/dysflow-access-runner.ps1` | Modified | Replace early exits, track PID, add force-stop fallback in `finally`, release COM objects. |
| `test/e2e/access-fixture.e2e.test.ts` | Modified | Add E2E assertions for lingering Access processes. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Force terminating active user Access processes | Low | Targeted termination using specific captured PID. |
| Execution bypassed on critical exceptions | Low | Wrap core logic in robust try-finally block. |

## Rollback Plan
Revert runner script changes using `git checkout scripts/dysflow-access-runner.ps1` and test files.

## Dependencies
- MS Access COM / Runtime available on verification environments.

## Success Criteria
- [ ] E2E and unit test suites execute and pass successfully.
- [ ] Verify zero lingering `MSACCESS.EXE` processes remain after E2E runs.
