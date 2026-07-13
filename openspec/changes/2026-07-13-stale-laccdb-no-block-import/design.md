# Design: Stale `.laccdb` no longer blocks `import_modules`

## Chosen mechanism

`Close-TargetAccessDbIfOpen` gains a `File::Open` probe between the existing `Test-Path` check and the `Write-Warning` that today fires unconditionally. The probe uses `FileShare.None` so any live handle (Access engine, SMB lease, antivirus) causes a sharing violation exception — which we map to "real lock, keep current behavior". A successful open means "no live handle, stale lock, clean it up silently and return success".

## File-level change map

### `scripts/lib/dysflow-access-com.ps1`

**Single edit**, inside `Close-TargetAccessDbIfOpen`. Lines 394-421 today look like:

```powershell
if (-not $closedViaRot) {
    $lockPath = Get-AccessLockFilePath -AccessPath $resolved
    if ($lockPath -and (Test-Path -LiteralPath $lockPath)) {
        Write-Warning ("Close-TargetAccessDbIfOpen: active lock detected: {0}" -f $lockPath)

        $cimProcs = @(Get-MsAccessProcessesBounded)

        # ... WMI / Get-Process enumeration for PID attribution ...
        # ... never gated on the warning; purely diagnostic ...
    }
}
```

**After the change**:

```powershell
if (-not $closedViaRot) {
    $lockPath = Get-AccessLockFilePath -AccessPath $resolved
    if ($lockPath -and (Test-Path -LiteralPath $lockPath)) {
        $handle = $null
        try {
            $handle = [System.IO.File]::Open(
                $lockPath,
                [System.IO.FileMode]::Open,
                [System.IO.FileAccess]::Read,
                [System.IO.FileShare]::None
            )
            # Probe succeeded: no live handle — the .laccdb is stale.
            $handle.Dispose()
            $handle = $null
            Remove-Item -LiteralPath $lockPath -Force -ErrorAction Stop
            Write-Status ("LACCDB_STALE_DETECTED: removed stale lock {0}" -f $lockPath)
            # Continue past the "active lock detected" branch — clear success.
        } catch [System.IO.IOException], [System.UnauthorizedAccessException] {
            # Sharing violation: a live handle holds the .laccdb. Fall through
            # to the existing blocking behavior below.
            if ($handle) { $handle.Dispose(); $handle = $null }
            Write-Warning ("Close-TargetAccessDbIfOpen: active lock detected: {0}" -f $lockPath)
            $cimProcs = @(Get-MsAccessProcessesBounded)
            # ... existing diagnostic enumeration ...
            # ... after the existing diagnostic, on the matching-PID branch:
            #   Write-Status ("LIVE_PROCESS_HOLDS_LACCDB: pid={0}" -f $pid)
        } finally {
            if ($handle) { $handle.Dispose() }
        }
    }
}
```

The `LIVE_PROCESS_HOLDS_LACCDB` advisory is appended to the branch that already emits the per-PID warning (line 414), where `$matchingPids` is non-empty. The advisory only fires when attribution is possible.

### `scripts/tests/dysflow-vba-manager.Tests.ps1`

Four new `It` blocks inside the existing "Close-TargetAccessDbIfOpen — ownership-safe blocking behavior" `Describe` (after line 1565). They reuse every existing mock: `BeforeEach` creates `$script:TempAccessPath` and `$script:TempLockPath`; `Get-AccessLockFilePath` is overridden to return `TempLockPath`; `Get-MsAccessProcessesBounded` and `Write-Warning` are overridden per-test.

**Test 1 — stale `.laccdb` is silently cleared and import proceeds (RED-first, per issue #844)**

```powershell
It "stale .laccdb (no live process) is silently cleared and import proceeds" {
    # No override of Get-MsAccessProcessesBounded — defaults to @()
    $script:StopProcessCalls.Clear()
    Mock Stop-Process { $script:StopProcessCalls += $Id } -ModuleName dysflow-access-com

    $result = Close-TargetAccessDbIfOpen -AccessPath $script:TempAccessPath

    $result | Should -Not -BeNullOrEmpty
    # The .laccdb has been removed.
    Test-Path -LiteralPath $script:TempLockPath | Should -BeFalse
    # The "active lock detected" warning is NOT emitted.
    ($script:WarningMessages | Where-Object { $_ -like '*active lock detected*' }).Count | Should -Be 0
    # Stop-Process was NEVER called.
    $script:StopProcessCalls.Count | Should -Be 0
}
```

**Test 2 — stale `.laccdb` cleared emits `LACCDB_STALE_DETECTED` advisory**

```powershell
It "stale .laccdb surfaced as LACCDB_STALE_DETECTED advisory in Write-Status stream" {
    $script:StatusMessages = New-Object 'System.Collections.Generic.List[string]'
    Mock Write-Status { $script:StatusMessages.Add($Message) } -ModuleName dysflow-access-com

    Close-TargetAccessDbIfOpen -AccessPath $script:TempAccessPath | Out-Null

    ($script:StatusMessages | Where-Object { $_ -like 'LACCDB_STALE_DETECTED*' }).Count | Should -BeGreaterOrEqual 1
}
```

**Test 3 — real live `MSACCESS.EXE` holding `.laccdb` still blocks**

```powershell
It "live MSACCESS holding .laccdb still blocks and emits LIVE_PROCESS_HOLDS_LACCDB" {
    Mock Get-MsAccessProcessesBounded {
        [pscustomobject]@{
            ProcessId    = 4242
            CreationDate = Get-Date
            CommandLine  = "MSACCESS.EXE `"$script:TempAccessPath`" /runtime ..."
        }
    } -ModuleName dysflow-access-com

    Close-TargetAccessDbIfOpen -AccessPath $script:TempAccessPath

    ($script:WarningMessages | Where-Object { $_ -like '*active lock detected*' }).Count | Should -Be 1
    ($script:StatusMessages | Where-Object { $_ -like 'LIVE_PROCESS_HOLDS_LACCDB: pid=4242*' }).Count | Should -Be 1
    Test-Path -LiteralPath $script:TempLockPath | Should -BeTrue  # .laccdb preserved
}
```

**Test 4 (regression guard) — different-path MSACCESS does not block**

```powershell
It "does not block when MSACCESS exists but holds a different .accdb (regression)" {
    Mock Get-MsAccessProcessesBounded {
        [pscustomobject]@{
            ProcessId    = 5151
            CreationDate = Get-Date
            CommandLine  = "MSACCESS.EXE `"C:\\some\\other\\file.accdb`" /runtime ..."
        }
    } -ModuleName dysflow-access-com

    Close-TargetAccessDbIfOpen -AccessPath $script:TempAccessPath | Out-Null

    ($script:WarningMessages | Where-Object { $_ -like '*active lock detected*' }).Count | Should -Be 0
    Test-Path -LiteralPath $script:TempLockPath | Should -BeFalse  # cleaned
}
```

## Why this exact mechanism

- **`FileShare.None` shares the least possible access**: a successful open proves no live handle exists; a sharing violation proves the opposite. No heuristic; no race window beyond what the OS handles.
- **`[System.IO.File]::Open` over `Get-Process | Where Modules`**: Access keeps the `.laccdb` via a file handle, not a named module mapping — module enumeration returns false negatives. `File::Open` reads the file-handle state directly through `CreateFile` with `dwShareMode = 0`.
- **`try/finally`**: any thrown non-sharing-violation exception still disposes the handle; the `Remove-Item` runs only on clean probe success.
- **Advisory via `Write-Status` (success stream)**: the existing TS `collectDiagnostics` parse already handles this stream. No new TS diagnostic source required.

## What we do NOT change

- `src/core/runner/cross-process-lock.ts` — Dysflow's `.lock` sidecar; independent mechanism.
- `Get-MsAccessProcessesBounded` — keeps current bounded-WMI semantics; its output is now consumed by both the existing warning and the new advisory.
- The TS adapter envelope — no Zod schema changes; the two new codes fit the existing `Diagnostic` shape `{ code, severity, message, source, laccdbPath?, pid? }` already emitted by `collectDiagnostics`.

## Acceptance runbook

1. `pwsh -Command "Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1"` — RED (tests 1-3 fail on stales without the fix; test 4 already green).
2. Apply the PS1 edit.
3. `pwsh -Command "Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1"` — GREEN.
4. `pnpm test` — full vitest suite still green.
5. `pnpm run lint` — no biome/lint regressions.
6. `git checkout -b fix/stale-laccdb-should-not-block-import`, conventional commit, push, PR.
