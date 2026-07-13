# Explore: Close-TargetAccessDbIfOpen & stale `.laccdb` blocking

## Surface map

### `Close-TargetAccessDbIfOpen` current flow (shared PS1 helper at `scripts/lib/dysflow-access-com.ps1:258`)

- **Lines 264-274**: Resolve `$AccessPath` to a real path; emit `Write-Warning` and return early if the path cannot be resolved.
- **Lines 277-376**: Register the C# `RotManager` COM types (Win32 `ole32.dll` ROT-based close). Runs once per PowerShell session.
- **Lines 379-391**: Attempt ROT-based close via `[RotManager]::CloseDatabaseIfOpen($resolved)`. If `$result.ClosedCount -gt 0`, set `$closedViaRot = $true` and log debug; on ROT error log debug. If ROT closed anything, skip lock-file logic entirely.
- **Line 394 (pivotal)**: `if (-not $closedViaRot)` — only enters lock-file block if ROT found nothing.
- **Line 395**: `$lockPath = Get-AccessLockFilePath -AccessPath $resolved` — builds `.laccdb` path.
- **Line 396**: `if ($lockPath -and (Test-Path -LiteralPath $lockPath))` — **THIS IS THE BUG**: `.laccdb` presence check is the only evidence used to declare "active lock detected". There is no probe of whether any live process holds the file at this point.
- **Line 397**: `Write-Warning ("Close-TargetAccessDbIfOpen: active lock detected: {0}" -f $lockPath)` — emitted unconditionally upon `.laccdb` presence, before the process enumeration at line 404 even runs.
- **Line 404**: `$cimProcs = @(Get-MsAccessProcessesBounded)` — enumerate MSACCESS via WMI (bounded in a background Job to avoid deadlock on network I/O).
- **Lines 406-417**: Check if any enumerated process has the database path in its `CommandLine`. If yes → warning about "unattributed MSACCESS blocking" with PIDs; if no → debug "no MSACCESS contains".
- **Line 419**: If no processes found at all → "could not enumerate" warning.

**Exact lines where `.laccdb` presence = "active lock"**: lines 396-397 are the unconditional decision point. The process enumeration at lines 404-417 is purely diagnostic (logs PIDs for human consumption); its result is never checked to gate the warning.

### How TS adapter routes the warning back

1. **`Write-Status "WARN: el archivo de lock sigue presente tras cerrar..."`** (`dysflow-vba-manager.ps1:2001`) — emitted from `Close-AccessDatabase` after the second `Close-TargetAccessDbIfOpen` call still finds the lock present. `Write-Status` writes to the **success output stream** (not stderr/warning stream).
2. **`Write-Warning "Close-TargetAccessDbIfOpen: active lock detected: <path>"`** (`dysflow-access-com.ps1:397`) — goes to PowerShell's warning stream (which some executors redirect to `stderr`).
3. The import operation itself fails with `VBA_IMPORT_FAILED` — emitted by `Write-DysflowResult` inside `dysflow-vba-manager.ps1` when `Open-AccessDatabase` throws (Access cannot open a database whose `.laccdb` is present from a prior session). The structured result is on **stdout** as `DYSFLOW_RESULT {"ok":false,"error":{"code":"VBA_IMPORT_FAILED",...}}`.
4. `collectDiagnostics` (`access-runner.ts:878`): `execution.stderr` is pushed as a `Diagnostic` with `level: "error"` and `source: "powershell.stderr"`. If the warning stream was redirected to stderr, it appears there.
5. **`runLockedOperation`** (`access-runner.ts:342`): on non-zero `exitCode`, returns `failureResult(createDysflowError("RUNNER_FAILED", ...))`. But for VBA import, the PowerShell script itself sets `exitCode` via `Write-DysflowResult` and the TS layer extracts the structured JSON via `parseRunnerData` → `extractResultPayload(stdout, ...)`.

### Existing tests for ownership-safe blocking

`scripts/tests/dysflow-vba-manager.Tests.ps1:1468-1565` — "Close-TargetAccessDbIfOpen — ownership-safe blocking behavior":

- **`It "blocks a same-path MSACCESS process without killing it"`** (line 1536): Mocks `Get-MsAccessProcessesBounded` returning a process whose `CommandLine` matches the temp `.accdb` path. Asserts `Stop-Process` is **never called** (zero count). The function must not throw.
- **`It "does not kill when no MSACCESS is attributable to the target path"`** (line 1551): Mocks `Get-MsAccessProcessesBounded` returning a process for a *different* `.accdb`. Asserts `Stop-Process` is **never called**. Confirms the function is safe even when MSACCESS processes exist.

These two tests prove the **no-kill invariant** — they do NOT test what happens when `.laccdb` exists with no process behind it (the bug).

### Existing Pester mocks / fixtures for reuse

- **`Get-MsAccessProcessesBounded`** (line 1537-1543 in test): returns a PSCustomObject with `{ ProcessId, CreationDate, CommandLine }`. Primary mock seam for live processes.
- **`Get-AccessLockFilePath`** (line 1525): overridden via function script to return `$script:TempLockPath` (the temp `.laccdb` created in `BeforeEach`).
- **`Write-Warning`** (line 1527): overridden to capture into `$script:WarningMessages` list for behavioral assertions.
- **`Stop-Process`** (line 1528): overridden to record PIDs attempted to be stopped.
- **`RotManager` / `RotCloseResult` Add-Type stub** (lines 1497-1510): returns `{ Success: true, ClosedCount: 0 }` — makes ROT close "do nothing" so every test lands in the lock-file branch.
- **`New-Item` temp files** (lines 1518-1521): creates both the temp `.accdb` and temp `.laccdb` in `BeforeEach`, removed in `AfterEach`.
- **`DYSFLOW_MOCK_COM`** environment variable (line 277): if set to `'1'`, skips the real ROT and uses a mock implementation.

## Approach option selected

### Option 1 — Probe handle via `[System.IO.File]::Open` exclusive mode

**Mechanism**: Inside the lock-file branch of `Close-TargetAccessDbIfOpen`, after confirming `.laccdb` exists, attempt `[System.IO.File]::Open($lockPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)` with a short guard. If it **succeeds** → no live handle, file is stale → `Remove-Item` it and emit `LACCDB_STALE_DETECTED` advisory via `Write-Status`. If it **throws** `IOException` / `UnauthorizedAccessException` (sharing violation) → a live handle exists → keep the existing warning behavior and emit `LIVE_PROCESS_HOLDS_LACCDB` diagnostic carrying `pid=<n>`.

**Where the change lives**: `dysflow-access-com.ps1`, inside `Close-TargetAccessDbIfOpen`, between lines 396 and 397. New `if/else` branch added around the probe.

**Error envelope impact**:
- New advisory on success-with-stale-cleaned: `LACCDB_STALE_DETECTED` (info-level) emitted via `Write-Status` (already-parsed stream). Idempotent with existing diagnostics path.
- New blocking code on real lock: `LIVE_PROCESS_HOLDS_LACCDB` emitted via the existing `Write-Warning` warning stream. The TS adapter's `collectDiagnostics` reads it as `Diagnostic` with `code`, `severity: warning`, `laccdbPath`, and `pid` (parsed from the message body).
- No TS-layer changes required; the envelope is already accepted by `collectDiagnostics`.

**Tradeoffs**: Minimal surface — one PS helper edit, one diagnostic-format string, one advisory code. No P/Invoke. `File::Open` with `FileShare.None` tests the actual file handle state: if any process (Access, SMB lease, antivirus) has the file open, the exclusive open throws. Edge case: a process that holds shared read (rare; Access uses exclusive) would also cause a sharing violation — acceptable, because any live handle = not safe to delete.

**Why not the alternatives**: Option 2 (`Get-Process` + module scan) is unreliable (Access keeps the lock via a file handle, not a named module mapping). Option 3 (`OpenProcess` + `NtQuerySystemInformation` P/Invoke) gives exact PIDs but is overkill for the precision needed — the existing `Get-MsAccessProcessesBounded` enumeration already attributes PIDs for the live-lock case.

## Open questions (none blocking)

1. `Write-Verbose` does NOT reach TS `collectDiagnostics`; `Write-Warning` and `Write-Status` (success stream via `Write-Output`) do. Confirmed: the chosen approach emits via `Write-Status` and `Write-Warning`, both already routable.
2. SMB behavior of `FileShare.None` on UNC paths: SMB 1/2/3 all return `IOException` on live leases. Acceptable for the consumer's local-disk use case (`expedientes` is local); probe is wrapped in `try/finally` to release any transient handle.
3. `Close-CanonicalAccess` in the runner also calls `Close-TargetAccessDbIfOpen`; it inherits the same fix automatically (same helper).
