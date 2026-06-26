# Proposal: Fix VBA Manager Hardness

## Intent

Address 7 identified issues in VBA manager integration, execution adapter, and preflight cleanup. These bugs cause execution hangs, silent failures under active-locks, orphaned background `MSACCESS.EXE` processes, compilation error reporting deficiencies, and strict JSON parsing failures.

## Scope

### In Scope
- Add post-deletion verification in `Remove-AccessObjectOrComponent`.
- Guard `Invoke-AccessProcedure` parameterless execution from reference retry loops.
- Compile and wrap inline VBA execution in stable `__dysflow_inline__` module and cleanup physical file.
- Reap zombie `MSACCESS.EXE` on execution/timeout errors in `executeMappedTool`.
- Toggle VBE window visibility and check VBComponents as fallback to identify compiler error locations.
- Sanitize whitespace, BOM, and markdown fences in `validateTestProceduresJson`.
- Register running PIDs, terminate unowned headless processes, and purge unowned matching processes.

### Out of Scope
- Non-bugfix refactoring of VBA synchronization logic or rewriting Access runner.
- Upgrading Access COM API models or replacing PowerShell integration.

## Capabilities

### New Capabilities
None

### Modified Capabilities
None

## Approach

Modify the VBA manager PowerShell script and TypeScript adapters:
1. Throw explicit exit code exceptions in PowerShell for post-deletion existence checks and implement VBE toggle.
2. Intercept error bounds in Node.js adapters to invoke process killers and clean target wrapper modules.
3. Clean JSON parser inputs using regex sanitization before parsing.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/dysflow-vba-manager.ps1` | Modified | Add validation, parameterless guard, VBE visibility toggle, and post-deletion checks. |
| `src/adapters/vba-sync/vba-execution-adapter.ts` | Modified | Wrap inline execution in `__dysflow_inline__` with compile; sanitize test procedures JSON. |
| `src/adapters/vba-sync/vba-sync-adapter.ts` | Modified | Trigger process reaping on execution errors in `executeMappedTool`. |
| `src/core/operations/access-operation-preflight.ts` | Modified | Register active PIDs and kill unowned/headless `MSACCESS.EXE` processes. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| VBE toggle flashes main window or causes UI latency | Low | Visibly open and immediately close window within one execution frame. |
| Aggressive process killing terminates user Access sessions | Low | Restrict process killing to headless processes containing `-Embedding`. |

## Rollback Plan

Revert git changes back to current head:
```bash
git checkout HEAD -- scripts/dysflow-vba-manager.ps1 src/adapters/vba-sync/vba-execution-adapter.ts src/adapters/vba-sync/vba-sync-adapter.ts src/core/operations/access-operation-preflight.ts
```

## Dependencies

- None

## Success Criteria

- [ ] VBA inline execution works cleanly and `__dysflow_inline__` is fully compiled and deleted.
- [ ] Headless/unowned `MSACCESS.EXE` zombie processes are killed during preflight cleanup and mapping failures.
- [ ] VBA compilation reports the specific failing component name even in headless COM mode.
- [ ] Procedures JSON containing markdown code blocks and trailing spaces is parsed successfully.
- [ ] Active-lock module deletion fails with explicit exception rather than returning status `ok`.
