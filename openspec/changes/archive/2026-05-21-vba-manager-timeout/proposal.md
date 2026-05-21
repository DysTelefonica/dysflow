# Proposal: VBA Manager Timeout and Non-Interactive Hardening

## Intent

The `spawnVbaManager` executor in `vba-sync-legacy-service.ts` violates the bounded-runner contract guaranteed by `access-core-services`: it spawns `powershell.exe` with **no timeout** and **without `-NonInteractive`**. If the script blocks on an Access modal dialog, a file lock, a `Read-Host` prompt, or any unhandled error, the MCP server hangs forever — there is no kill timer, no escape, no error code. This contradicts the sibling `spawnPowerShell` runner in `access-runner.ts`, which kills the child after `config.timeoutMs` and returns a `RUNNER_TIMEOUT` failure. Closes GitHub issues #63 and #69 in a single PR because both bugs live in the same six-line `args` block.

## Scope

### In Scope
- Add a kill-timer + `timedOut` flag to `spawnVbaManager`, mirroring `spawnPowerShell`.
- Surface timeout as a typed failure: `createDysflowError("VBA_MANAGER_TIMEOUT", ...)`.
- Inject `-NonInteractive` into the PowerShell args array (right after `-NoProfile`).
- Thread `DysflowConfig.processTimeoutMs` into `VbaSyncLegacyServiceOptions` so the executor receives a real budget.
- Add unit tests: timeout fires, exit-code path unchanged, `-NonInteractive` is present.

### Out of Scope
- Refactoring `spawnVbaManager` and `spawnPowerShell` into a shared helper (tracked as future cleanup).
- Process-tree kill on Windows (current `child.kill()` parity with access-runner is acceptable).
- Changes to the legacy `dysflow-vba-manager.ps1` script itself.
- New config fields — `processTimeoutMs` already exists on `DysflowConfig`.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `access-core-services`: extend the "bounded runner with timeouts" requirement to cover the VBA manager executor (currently only enforced for `AccessPowerShellRunner`).

## Approach

1. Extend `VbaManagerExecutionRequest` with `timeoutMs: number` (required).
2. In `executeMappedTool`, resolve the timeout from `DysflowConfig.processTimeoutMs` (falling back to `timeoutMs`, then `DEFAULT_TIMEOUT_MS = 30_000`) and pass it into the executor request.
3. In `spawnVbaManager`, wrap the spawn in the same `setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs)` + `clearTimeout` pattern used by `spawnPowerShell`. Add `timedOut: boolean` to `VbaManagerExecutionResult`.
4. In `executeMappedTool`, when `result.timedOut === true`, return `failureResult(createDysflowError("VBA_MANAGER_TIMEOUT", \`${toolName} timed out after ${timeoutMs}ms.\`, { retryable: true }))` BEFORE the exit-code branch.
5. Change the args array to `["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ...]` matching `buildPowerShellArguments` in access-runner.

Rationale for `processTimeoutMs` over `timeoutMs`: the config already exposes both and currently sets them to the same value (see `buildExplicitConfig` line 140 and `loadProjectConfigFromPath` line 234). Using `processTimeoutMs` future-proofs the codebase for the day someone wants per-process budgets distinct from query budgets, without a breaking change.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/services/vba-sync-legacy-service.ts` | Modified | Add timeout + `-NonInteractive` to `spawnVbaManager`; thread timeout through service; new error code branch. |
| `test/core/services/vba-sync-legacy-service.test.ts` | Modified/New | Cover timeout firing, non-interactive flag present, success path unchanged. |
| `openspec/specs/access-core-services/spec.md` | Modified | Add scenario requiring VBA manager executor to honor timeouts and non-interactive PowerShell. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Default 30s timeout too short for large `Export` runs | Med | `processTimeoutMs` is user-configurable via `DYSFLOW_TIMEOUT_MS` or project config; document in error message. |
| `child.kill()` leaves orphan PowerShell on Windows | Low | Parity with `spawnPowerShell`; out-of-scope process-tree kill tracked separately. |
| `-NonInteractive` breaks a legitimate prompt in the script | Low | Legacy script is non-interactive by design; any prompt is a bug we WANT to surface as a timeout. |

## Rollback Plan

Single-commit revert of the PR restores prior behavior. No data migration, no config migration, no script changes. Existing callers continue to work because the new `timeoutMs` field in `VbaManagerExecutionRequest` is added with a safe default at the service boundary.

## Dependencies

- None. `DysflowConfig.processTimeoutMs` already exists (`src/core/config/dysflow-config.ts` line 38).

## Success Criteria

- [ ] `spawnVbaManager` kills the child process and resolves with `timedOut: true` when `timeoutMs` elapses.
- [ ] Service maps `timedOut: true` to `createDysflowError("VBA_MANAGER_TIMEOUT", ...)` with `retryable: true`.
- [ ] PowerShell args include `-NonInteractive` immediately after `-NoProfile`.
- [ ] Unit tests cover: timeout fires, non-interactive flag present, success path unchanged.
- [ ] GitHub issues #63 and #69 closed by the merge commit.
