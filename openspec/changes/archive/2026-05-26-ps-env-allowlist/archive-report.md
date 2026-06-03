# Archive Report: ps-env-allowlist

**Change**: ps-env-allowlist  
**Status**: ARCHIVED — Verified PASS, PR #359 merged, issue #350 closed  
**Archived**: 2026-05-26  
**Artifact Store Mode**: Engram

## SDD Cycle Completion

This change completes the full SDD lifecycle: proposal → spec → design → tasks → apply → verify → archive.

### Artifact Chain (Engram Topic Keys)

| Artifact | ID | Topic Key |
|----------|----|-----------| 
| Proposal | #9388 | `sdd/ps-env-allowlist/proposal` |
| Spec (Delta) | #9389 | `sdd/ps-env-allowlist/spec` |
| Design | #9390 | `sdd/ps-env-allowlist/design` |
| Tasks | #9391 | `sdd/ps-env-allowlist/tasks` |
| Verify Report | #9398 | `sdd/ps-env-allowlist/verify-report` |
| Archive Report | (this) | `sdd/ps-env-allowlist/archive-report` |

All observation IDs are persisted above for full traceability across sessions.

## Implementation Summary

### Scope Delivered

**Proposal Intent**: Close the host environment variable leak in `spawnPowerShellProcess` (src/core/runner/powershell-executor.ts:33) by filtering the child process environment to an explicit allowlist of Windows system variables, then overlaying caller-supplied overrides.

**Execution**:
- Exported `POWERSHELL_SYSTEM_ENV_KEYS` as a readonly const array with 13 system variables (SystemRoot, windir, PATH, PATHEXT, TEMP, TMP, USERPROFILE, USERNAME, COMPUTERNAME, LOCALAPPDATA, APPDATA, HOMEDRIVE, HOMEPATH)
- Implemented `buildChildEnv(override?)` internal helper to filter process.env by allowlist, then overlay overrides
- Replaced the leaking spread `{ ...process.env, ...options.env }` at line 33 with `buildChildEnv(options.env)`
- Created comprehensive test suite (`test/core/runner/powershell-executor.test.ts`) with 6 passing tests covering all spec scenarios

### Changed Files

| File | Delta | Status |
|------|-------|--------|
| src/core/runner/powershell-executor.ts | +29/-1 = +28 net | Merged |
| test/core/runner/powershell-executor.test.ts | +80/-0 = +80 | Merged |
| src/core/runner/access-runner.ts | — | Unchanged (zero call-site changes) |
| src/adapters/vba-sync/vba-sync-legacy-adapter.ts | — | Unchanged (zero call-site changes) |

**Total Changed Lines**: ~108 (35 prod + 80 test = well under 400-line review budget)

### Verification Evidence

**Test Results**:
- `vitest run test/core/runner/powershell-executor.test.ts` → 6/6 PASS
- `vitest run` (full suite) → 590 passed, 3 skipped, 0 failures
- `pnpm exec tsc --noEmit` → zero type errors

**Spec Coverage**:
- Host secret (SECRET_TOKEN) filtered from child env
- Allowlisted system vars (SystemRoot) forwarded when present
- Caller overrides (options.env) always forwarded
- Allowlisted var absent from host omitted from child (no undefined injections)
- Override vars outside allowlist supported
- POWERSHELL_SYSTEM_ENV_KEYS exported and testable

**Constraints Honored**:
- No new npm dependencies
- Existing call sites required zero changes
- stdio.test.ts constraint preserved (30/30 tests still pass)
- Regression free: all 590 suite tests pass

### Delivery

- **PR**: #359 merged to main
- **Issue**: #350 closed
- **Rollback**: Single-function revert (restore original spread at line 33, remove constant/helper/test)

## Archive Notes

**Why Engram Mode**: All artifacts stored in persistent Engram memory for cross-session recovery and audit trail. No openspec filesystem sync needed; observation IDs provide full traceability.

**Closed Issues**:
- Issue #350: "Close env leak in spawnPowerShellProcess"
- All tasks complete, verification PASS, ready for archival.

## Next Steps

The change is complete and archived. The codebase now enforces strict environment isolation for PowerShell child processes, meeting security requirement and satisfying the modified `access-core-runner` capability contract.

Ready for the next change.
