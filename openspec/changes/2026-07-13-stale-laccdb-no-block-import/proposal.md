# Proposal: Stale `.laccdb` no longer blocks `import_modules`

## Intent

Issue #844 (bug, medium-high): `import_modules` of an `.accdb` whose `.laccdb` exists but **no live process** holds the file fails with `VBA_IMPORT_FAILED` and `WARN: el archivo de lock sigue presente tras cerrar '<path>'`. The consumer-side workaround (`Remove-Item <binary>.laccdb -Force`) is undocumented. Discovered on 2026-07-13 when the consumer `expedientes` lost 5–15 minutes per incident across 6 consecutive imports (30+ minutes in the worst worktree-isolated session).

**Root cause**: `Close-TargetAccessDbIfOpen` in `scripts/lib/dysflow-access-com.ps1:258` treats **presence of `.laccdb`** (line 396: `Test-Path`) as sufficient evidence of "active lock detected" (line 397: `Write-Warning`). No probe of whether a live process holds the file handle. The subsequent `Get-MsAccessProcessesBounded` enumeration (line 404) is purely decorative — its result never gates the warning.

## Scope

### In Scope

- **PS1 fix** (`scripts/lib/dysflow-access-com.ps1:394-421`): Inside `Close-TargetAccessDbIfOpen`, after `Test-Path` returns `$true` for the `.laccdb`, probe live-handle ownership with `[System.IO.File]::Open($lockPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)`. Branch:
  - Probe **succeeds** → no live handle → `Remove-Item -LiteralPath $lockPath -Force`, emit `LACCDB_STALE_DETECTED` advisory via `Write-Status`, return `$true` silently (no warning).
  - Probe **throws** `IOException` / `UnauthorizedAccessException` → live handle → keep existing `Write-Warning "active lock detected: <path>"` behavior, additionally emit `LIVE_PROCESS_HOLDS_LACCDB` diagnostic with `pid=<n>` (parsed from the existing `Get-MsAccessProcessesBounded` result).
- **New advisory code**: `LACCDB_STALE_DETECTED` (info severity) — emitted on success when a stale `.laccdb` is silently cleaned.
- **New blocking code**: `LIVE_PROCESS_HOLDS_LACCDB` (warning severity) — emitted alongside existing warning when a real live process holds the `.laccdb`.
- **Tests (RED first, TDD strict)**: 3 RED tests prescribed in issue #844 plus 1 regression guard added to `scripts/tests/dysflow-vba-manager.Tests.ps1` inside the "ownership-safe blocking behavior" describe block.
- **CHANGELOG.md**: bugfix bullet under the unreleased section.
- **package.json**: version bump `2.9.0` → `2.9.1` (patch — surface unchanged; behavior refinement only).
- **openspec/specs/vba-manager-actions.md**: delta noting the new advisory + blocking codes.

### Out of Scope

- `src/core/runner/cross-process-lock.ts` — Dysflow's own `.lock` sidecar mechanism is unrelated; do NOT touch. The issue is specifically about `.laccdb`, which is Microsoft Access/DAO state.
- `Get-MsAccessProcessesBounded` enumeration logic — keep as diagnostic; only its OUTPUT is now used for the new `LIVE_PROCESS_HOLDS_LACCDB` payload.
- `Write-Status "WARN: el archivo de lock sigue presente..."` in `dysflow-vba-manager.ps1:2001` — derives from the same root cause; will naturally stop firing once stale locks are auto-cleaned. Left untouched.
- Reintroduction of `compile_vba` — humans compile in Access (existing rule).
- Consumer-facing kill instructions — surface PID via `error.code` / `error.data.pid`, never suggest `Stop-Process` / `taskkill` (cross-project AGENTS.md invariant).

## Capabilities

### Modified Capabilities

- **vba-manager-actions — close-if-open**: `Close-TargetAccessDbIfOpen` MUST distinguish a stale `.laccdb` (no live handle → silently remove and return `$true` with `LACCDB_STALE_DETECTED` advisory) from a live-lock `.laccdb` (live handle → keep existing blocking behavior with `LIVE_PROCESS_HOLDS_LACCDB` diagnostic carrying `pid`). The TS adapter envelope already accepts both codes via `collectDiagnostics`; no TS-side changes required.
- **access-runner-diagnostics**: PS-to-TS `collectDiagnostics` MUST parse `LACCDB_STALE_DETECTED` as `severity: info`, `code`, `laccdbPath` — surfaced even on `ok: true` results.

## Approach

Single PowerShell helper edit (≤30 net new lines), one new diagnostic-format constant, one advisory code, one blocking-code constant. Strict TDD: 3 RED tests + 1 regression in `scripts/tests/dysflow-vba-manager.Tests.ps1` BEFORE the production code change.

`FileShare.None` is the right probe because:
- Any process (Access, SMB lease, antivirus) holding the file makes the exclusive open throw `IOException` / `UnauthorizedAccessException`.
- No P/Invoke required; pure BCL.
- SMB 1/2/3 all return the same sharing-violation semantics on live leases.
- The probe is wrapped in `try { ... } finally { if ($handle) { $handle.Dispose() } }`; the handle is closed in <1 ms.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/dysflow-access-com.ps1` | Modified | Handle-probe branch inside `Close-TargetAccessDbIfOpen` (lines 394-421) |
| `scripts/tests/dysflow-vba-manager.Tests.ps1` | Modified | 3 RED tests + 1 regression appended to "ownership-safe blocking behavior" suite (after line 1565) |
| `openspec/specs/vba-manager-actions.md` | Modified | Delta: new `LACCDB_STALE_DETECTED` advisory + `LIVE_PROCESS_HOLDS_LACCDB` blocking code |
| `CHANGELOG.md` | Modified | Bugfix bullet under current unreleased section |
| `package.json` | Modified | Version `2.9.0` → `2.9.1` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `File::Open FileShare.None` on SMB-held `.laccdb` consumes an extra transient handle that antivirus locks differently | Low | Probe wrapped in `try/finally`; opens <1 ms; falls back to existing warning on any exception other than `IOException`/`UnauthorizedAccessException` |
| Removing an actually-in-use `.laccdb` (e.g., a process holding share-read) | Low | The probe only deletes when the open SUCCESSES, which by definition means no live handle. Conservative ordering: probe first, delete only on probe success. |
| `File::Open` on UNC paths differs across SMB versions | Low | SMB 1/2/3 all return `IOException` on live leases. The probe is local-disk-tested in RED tests. |
| Existing tests assume `Write-Warning "active lock detected"` is the only blocking signal | Med | New semantics: stale → no warning; live → same warning + new `LIVE_PROCESS_HOLDS_LACCDB` advisory. Update the existing "ownership-safe" describe if any test implicitly required the warning for the stale case (none found in the explore report). |

## Rollback Plan

Single commit revert. Pester tests are the only behavioral guarantee; once reverted, both RED tests turn RED again, immediately surfacing the regression.

## Review Workload

Estimate ~80-120 changed lines (PS1 helper ~30 net lines, 4 Pester tests ~80 lines including setup, CHANGELOG + package.json ~5 lines, spec delta ~10 lines). Well under the 400-line budget. `Chained PRs recommended: No`. `Decision needed before apply: No`. Single PR shape.

## Success Criteria

- [ ] Pester proves: stale `.laccdb` (no live process) → silently cleared, import succeeds, `Write-Status` carries `LACCDB_STALE_DETECTED`, `Write-Warning "active lock detected"` is NOT called.
- [ ] Pester proves: live `MSACCESS.EXE` (mocked via `Get-MsAccessProcessesBounded`) holding `.laccdb` → still blocks, `LIVE_PROCESS_HOLDS_LACCDB` advisory includes `pid=<n>`, `Write-Warning "active lock detected"` IS called.
- [ ] Regression: a process with `CommandLine` referencing a *different* `.accdb` does NOT block imports of `<binary>` (extends existing suite).
- [ ] Regression: existing `Stop-Process` is never called when the same-path MSACCESS test runs (already green; remains green).
- [ ] Full Pester + Vitest suites green.
- [ ] CHANGELOG bullet present; `package.json` at `2.9.1`.
- [ ] Conventional commit on branch `fix/stale-laccdb-should-not-block-import`; PR opened with the bullet referencing the new advisory codes.
