Closes #844.

**Problem**: `import_modules` of an `.accdb` whose `.laccdb` exists but no live process holds the file fails with `VBA_IMPORT_FAILED` and the "lock still present" warning. The consumer-side workaround (`Remove-Item <binary>.laccdb -Force`) is undocumented.

**Change summary**:
- `Close-TargetAccessDbIfOpen` now probes live-handle ownership via `[System.IO.File]::Open($lockPath, Open, Read, None)` between `Test-Path` and the existing `Write-Warning`.
- A successful exclusive open proves no live handle — the stale `.laccdb` is silently removed and the `LACCDB_STALE_DETECTED` advisory is emitted via `Write-Status` (returns `$true`).
- A sharing-violation (`IOException` / `UnauthorizedAccessException`) proves a live handle — the existing blocking behavior runs and additionally emits `LIVE_PROCESS_HOLDS_LACCDB: pid=<n>` per attributed PID (one advisory per matching PID).
- `Stop-Process` is never called (existing no-kill invariant preserved; verified by the 2 pre-existing tests in the same describe block).

**New tests** (4 Pester tests, RED-first, in `scripts/tests/dysflow-vba-manager.Tests.ps1`):
- `stale .laccdb (no live process) is silently cleared and import proceeds`
- `stale .laccdb cleanup removes the lock even when Write-Status is a no-op`
- `live MSACCESS holding .laccdb still blocks (lock preserved) and does not auto-clean`
- `does not block when MSACCESS exists but holds a different .accdb (regression)`

**Acceptance checklist** (from `openspec/changes/2026-07-13-stale-laccdb-no-block-import/proposal.md`):
- [x] Pester proves: stale `.laccdb` (no live process) → silently cleared, import succeeds, `Write-Status` carries `LACCDB_STALE_DETECTED`, `Write-Warning "active lock detected"` is NOT called.
- [x] Pester proves: live `MSACCESS.EXE` (mocked via `Get-MsAccessProcessesBounded`) holding `.laccdb` → still blocks, `LIVE_PROCESS_HOLDS_LACCDB` advisory includes `pid=<n>`, `Write-Warning "active lock detected"` IS called.
- [x] Regression: a process with `CommandLine` referencing a *different* `.accdb` does NOT block imports of `<binary>`.
- [x] Regression: existing `Stop-Process` is never called when the same-path MSACCESS test runs (already green; remains green).
- [x] Full Pester + Vitest suites green (Pester: 192/192; Vitest: 3 pre-existing failures in `test/core/config/dysflow-config.test.ts` unrelated to this PS1 change).
- [x] CHANGELOG bullet present; `package.json` at `2.9.1`.
- [x] Conventional commit on branch `fix/stale-laccdb-should-not-block-import`; PR opened with the bullet referencing the new advisory codes.

**Notes**:
- `src/core/runner/cross-process-lock.ts` (Dysflow's own `.lock` sidecar) is NOT touched — this change is exclusively about the Microsoft Access/DAO `.laccdb` lock.
- No `compile_vba` reintroduction; adapter stays save-only (RunCommand 280); humans compile in Access.
- No `Stop-Process` / `taskkill` instructions; PID is surfaced via the new `LIVE_PROCESS_HOLDS_LACCDB: pid=<n>` advisory for consumer-driven action.
- Test infrastructure note: Pester's `function script:` overrides are not visible to functions loaded via `Invoke-Expression` in the BeforeAll scope. The tests use `function global:` and `function` (BeforeAll-scope) overrides to work around this. The production code is unaffected — verified by a direct call outside Pester.
