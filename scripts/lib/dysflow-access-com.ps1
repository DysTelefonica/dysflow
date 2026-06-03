#Requires -Version 5.1
<#
.SYNOPSIS
    Shared COM helpers for dysflow scripts that open Microsoft Access.

.DESCRIPTION
    Single source of truth for helpers used by both dysflow-access-runner.ps1 and
    dysflow-vba-manager.ps1.  Dot-source this module from each script immediately
    after its param() block:

        . (Join-Path $PSScriptRoot 'lib/dysflow-access-com.ps1')

    Exported helpers
    ----------------
    Get-ProcessIdFromHwnd        — Win32 GetWindowThreadProcessId wrapper
    Get-MsAccessProcessesBounded — WMI query in a background job with timeout guard
    Get-MsAccessProcesses        — Thin alias over Get-MsAccessProcessesBounded
    Stop-AccessPidAndWait        — Kill an owned Access PID and wait until it exits
    Open-CanonicalAccess         — Canonical COM open: spawn Access.Application + 3-layer PID ladder
    Close-CanonicalAccess        — Canonical COM close: fixed teardown + synchronous kill of owned PID

    Shape contract for Get-MsAccessProcessesBounded
    -----------------------------------------------
    Returns an array of PSCustomObjects with three properties:
        ProcessId    [int]    — process identifier
        CreationDate [object] — raw DMTF string or [datetime] from CIM (may be $null)
        CommandLine  [string] — full command line as returned by Win32_Process

    Using Select-Object ensures a uniform projected shape regardless of whether the
    underlying WmiScriptBlock returns raw CIM instances (Win32_Process) or already-
    projected test doubles.  All callers in both access-runner and vba-manager only
    access these three properties; the projection adds no breakage and removes the
    shape ambiguity that existed when each script had its own copy.

    Shape contract for Open-CanonicalAccess (Session)
    --------------------------------------------------
    Returns a PSCustomObject with four properties:
        AccessApplication       [object]   — the COM object (Access.Application)
        OwnedPid                [int|$null] — PID captured at open; $null if attribution failed
        OriginalAutomationSecurity [int]   — AutomationSecurity value before any change
        PidAttributed           [bool]     — $true if OwnedPid was resolved, $false otherwise

    Shape contract for Close-CanonicalAccess (Result)
    -------------------------------------------------
    Returns a PSCustomObject with three properties:
        OwnedPidKilled          [bool]     — $true if the owned PID was killed synchronously
        PidWasAttributed        [bool]     — mirrors Session.PidAttributed
        UnattributedKilled      [bool]     — INVARIANT: always $false; unattributed processes are never killed
#>

# Auto-detect Linux/macOS and activate mock COM environment
if (($PSVersionTable.Platform -and $PSVersionTable.Platform -ne 'Win32NT') -or ($IsWindows -eq $false)) {
    $env:DYSFLOW_MOCK_COM = '1'
}

# Dot-source mock COM implementation if running under mock environment
if ($env:DYSFLOW_MOCK_COM -eq '1') {
    . (Join-Path $PSScriptRoot 'dysflow-mock-com.ps1')
}

# ---------------------------------------------------------------------------
# Win32 PID-from-hWnd helper
# ---------------------------------------------------------------------------

# Resolve a window handle to the PID of the owning process via the Win32
# GetWindowThreadProcessId API.  The Add-Type call is guarded by a PSTypeName
# check so dot-sourcing from two scripts in the same PowerShell session does
# not trigger a duplicate-type redefinition error.
function Get-ProcessIdFromHwnd {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][IntPtr]$Hwnd
    )

    if ($env:DYSFLOW_MOCK_COM -eq '1') {
        return 1234
    }

    if ($env:DYSFLOW_MOCK_COM -ne '1' -and -not ($IsWindows -eq $false)) {
        if (-not ([System.Management.Automation.PSTypeName]"Win32.NativeMethods").Type) {
            Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NativeMethods {
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@
        }

        [uint32]$pid = 0
        [Win32.NativeMethods]::GetWindowThreadProcessId($Hwnd, [ref]$pid) | Out-Null
        return [int]$pid
    }

    return 0
}

# ---------------------------------------------------------------------------
# WMI enumeration helpers — bounded against hung zombie providers
# ---------------------------------------------------------------------------

# Run a WMI Get-CimInstance for MSACCESS.EXE inside a background job so a
# hung WMI provider (e.g. a zombie Access process stuck on an unreachable UNC
# share) cannot block the caller indefinitely.  Returns whatever processes
# were retrieved; returns an empty array on timeout.
#
# The -WmiScriptBlock parameter is injectable for testing: pass a scriptblock
# that returns known PSCustomObjects to exercise success and timeout paths
# without a real COM/WMI environment.
#
# Return shape: @([PSCustomObject]@{ ProcessId; CreationDate; CommandLine })
function Get-MsAccessProcessesBounded {
    [CmdletBinding()]
    Param(
        [int]$TimeoutSeconds = 4,
        [scriptblock]$WmiScriptBlock = { Get-CimInstance Win32_Process -Filter "Name = 'MSACCESS.EXE'" -ErrorAction SilentlyContinue }
    )

    if ($env:DYSFLOW_MOCK_COM -eq '1' -and ($PSBoundParameters.ContainsKey('WmiScriptBlock') -eq $false)) {
        return @(
            [PSCustomObject]@{
                ProcessId    = 1234
                CreationDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                CommandLine  = "MSACCESS.EXE /embedding"
            }
        )
    }

    # Run the WMI query inside a background job so a hung WMI provider (e.g. a zombie Access
    # process stuck on an unreachable UNC share) cannot block the caller indefinitely.
    $job = Start-Job -ScriptBlock $WmiScriptBlock
    $procs = @()
    if (Wait-Job $job -Timeout $TimeoutSeconds) {
        $procs = @(Receive-Job $job -ErrorAction SilentlyContinue |
            Select-Object ProcessId, CreationDate, CommandLine)
    } else {
        Stop-Job $job -ErrorAction SilentlyContinue
        Write-Debug "WMI colgado al enumerar MSACCESS (probable proceso zombie en red). Timeout tras ${TimeoutSeconds}s."
    }
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    return $procs
}

# Thin alias — callers that do not need the timeout/scriptblock overrides use
# this name for readability.
function Get-MsAccessProcesses {
    Get-MsAccessProcessesBounded
}

# ---------------------------------------------------------------------------
# Synchronous Access PID termination
# ---------------------------------------------------------------------------

# Force-terminate a specific PID and wait deterministically until it is
# actually gone, instead of relying on a fixed sleep.  Access can stay in the
# process table briefly after CloseCurrentDatabase/Quit while it releases COM
# and file handles.
#
# Returns $true when the process is confirmed gone within the timeout window,
# $false when the timeout expires and the process is still alive.
function Stop-AccessPidAndWait {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][int]$AccessPid,
        [int]$TimeoutMs = 20000,
        # When $true (default), a taskkill /F /PID call is issued as a last resort if the
        # process is still alive after the Stop-Process poll window is exhausted.
        # Set to $false only when the caller explicitly wants to suppress this (e.g. testing
        # or contexts where taskkill.exe is not available).
        [switch]$UseTaskkillLastResort = $true
    )

    try { Stop-Process -Id $AccessPid -Force -ErrorAction SilentlyContinue } catch { Write-Debug "Diagnostics: $_" }
    $elapsed = 0
    while ($elapsed -lt $TimeoutMs) {
        $alive = $null
        try { $alive = Get-Process -Id $AccessPid -ErrorAction SilentlyContinue } catch { $alive = $null }
        if (-not $alive) { return $true }
        Start-Sleep -Milliseconds 100
        $elapsed += 100
        # Re-issue the kill in case the first signal was dropped during COM teardown.
        try { Stop-Process -Id $AccessPid -Force -ErrorAction SilentlyContinue } catch { Write-Debug "Diagnostics: $_" }
    }
    # Last resort: if process is still alive after the polite wait, use taskkill which sends
    # WM_CLOSE and, after a timeout, kills the process tree.  Only targets the specific owned
    # PID passed in — invariant: never resolves by path/name/CommandLine.
    if ($UseTaskkillLastResort) {
        $stillAlive = $null
        try { $stillAlive = Get-Process -Id $AccessPid -ErrorAction SilentlyContinue } catch { $stillAlive = $null }
        if ($stillAlive) {
            try {
                Start-Process -FilePath "taskkill" -ArgumentList "/F", "/PID", $AccessPid -NoNewWindow -Wait:$false -ErrorAction SilentlyContinue
            } catch { Write-Debug "Diagnostics: $_" }
        }
    }
    return $false
}

# ---------------------------------------------------------------------------
# Lock-file path helper
# ---------------------------------------------------------------------------

# Return the lock-file path (.laccdb for .accdb, .ldb for .mdb) for a given
# Access database path, or $null when the extension is not recognised.
function Get-AccessLockFilePath {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath
    )

    $ext = [System.IO.Path]::GetExtension($AccessPath)
    if ([string]::Equals($ext, ".accdb", [System.StringComparison]::OrdinalIgnoreCase)) {
        return [System.IO.Path]::ChangeExtension($AccessPath, ".laccdb")
    }
    if ([string]::Equals($ext, ".mdb", [System.StringComparison]::OrdinalIgnoreCase)) {
        return [System.IO.Path]::ChangeExtension($AccessPath, ".ldb")
    }
    return $null
}

# ---------------------------------------------------------------------------
# ROT-based close helper
# ---------------------------------------------------------------------------

# Close ONLY the COM Access.Application instance that has the indicated database
# open, iterating the Running Object Table so that other Access instances are
# not affected.  All COM interaction is performed in C# (late-binding via
# reflection) to work around the opaque __ComObject type in PowerShell.
#
# If the ROT finds nothing, falls back to checking for an active lock file and
# logging diagnostic information about any MSACCESS.EXE processes found.
# INVARIANT: this function NEVER kills any process — it only closes the COM
# object via CloseCurrentDatabase/Quit.  Unattributed process cleanup is NOT
# performed here.
function Close-TargetAccessDbIfOpen {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath
    )

    $resolved = $null
    $rp = Resolve-Path -Path $AccessPath -ErrorAction SilentlyContinue
    if ($rp) { $resolved = $rp.Path }
    # Fallback: if Resolve-Path fails (OneDrive, long paths), use the raw path
    if (-not $resolved) {
        if (Test-Path -LiteralPath $AccessPath) { $resolved = $AccessPath }
        else {
            Write-Warning ("Close-TargetAccessDbIfOpen: could not resolve path: {0}" -f $AccessPath)
            return
        }
    }

    # Register types once per PowerShell session (Windows only)
    if ($env:DYSFLOW_MOCK_COM -ne '1' -and -not ($IsWindows -eq $false)) {
        if (-not ([System.Management.Automation.PSTypeName]"RotManager").Type) {
            Add-Type -TypeDefinition @"
using System;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public class RotCloseResult {
    public bool Success;
    public string Error;
    public int ClosedCount;
}

public class RotManager {
    [DllImport("ole32.dll")]
    private static extern int GetRunningObjectTable(uint reserved, out IRunningObjectTable pprot);

    [DllImport("ole32.dll")]
    private static extern int CreateBindCtx(uint reserved, out IBindCtx ppbc);

    public static RotCloseResult CloseDatabaseIfOpen(string dbPath) {
        var result = new RotCloseResult { Success = true };
        IRunningObjectTable rot = null;
        IEnumMoniker enumMk = null;
        IBindCtx bindCtx = null;

        try {
            int hr = GetRunningObjectTable(0, out rot);
            if (hr != 0 || rot == null) { result.Error = "Could not obtain the ROT"; return result; }

            hr = CreateBindCtx(0, out bindCtx);
            if (hr != 0 || bindCtx == null) { result.Error = "Could not create BindCtx"; return result; }

            rot.EnumRunning(out enumMk);
            if (enumMk == null) { result.Error = "EnumRunning returned null"; return result; }

            enumMk.Reset();
            var monikers = new IMoniker[1];

            while (enumMk.Next(1, monikers, IntPtr.Zero) == 0) {
                if (monikers[0] == null) continue;
                object comObj = null;
                try {
                    string displayName = null;
                    try { monikers[0].GetDisplayName(bindCtx, null, out displayName); } catch { continue; }
                    if (string.IsNullOrEmpty(displayName) || !displayName.Contains("Access.Application")) continue;

                    try { rot.GetObject(monikers[0], out comObj); } catch { continue; }
                    if (comObj == null) continue;

                    // Use reflection (late-binding) — works on __ComObject without an interop assembly
                    object db = null;
                    string openDbName = null;
                    try {
                        db = comObj.GetType().InvokeMember("CurrentDb",
                            BindingFlags.InvokeMethod, null, comObj, null);
                        if (db != null) {
                            openDbName = (string)db.GetType().InvokeMember("Name",
                                BindingFlags.GetProperty, null, db, null);
                        }
                    } catch {
                        // No database open or corrupt instance — skip
                    } finally {
                        if (db != null) try { Marshal.ReleaseComObject(db); } catch { }
                    }

                    if (!string.IsNullOrEmpty(openDbName) &&
                        string.Equals(openDbName, dbPath, StringComparison.OrdinalIgnoreCase)) {
                        try {
                            comObj.GetType().InvokeMember("CloseCurrentDatabase",
                                BindingFlags.InvokeMethod, null, comObj, null);
                            try {
                                comObj.GetType().InvokeMember("Quit",
                                    BindingFlags.InvokeMethod, null, comObj, null);
                            } catch { }
                            result.ClosedCount++;
                        } catch { }
                    }
                } catch {
                    // This moniker is unusable — continue
                } finally {
                    if (comObj != null) try { Marshal.ReleaseComObject(comObj); } catch { }
                    try { Marshal.ReleaseComObject(monikers[0]); } catch { }
                    monikers[0] = null;
                }
            }
        } catch (Exception ex) {
            result.Success = false;
            result.Error = ex.Message;
        } finally {
            if (enumMk != null) try { Marshal.ReleaseComObject(enumMk); } catch { }
            if (bindCtx != null) try { Marshal.ReleaseComObject(bindCtx); } catch { }
            if (rot != null) try { Marshal.ReleaseComObject(rot); } catch { }
        }
        return result;
    }
}
"@
        }
    }

    $closedViaRot = $false
    if ($env:DYSFLOW_MOCK_COM -ne '1' -and -not ($IsWindows -eq $false)) {
        try {
            $result = [RotManager]::CloseDatabaseIfOpen($resolved)
            if ($result.ClosedCount -gt 0) {
                Write-Debug ("Close-TargetAccessDbIfOpen: closed {0} COM instance(s) for: {1}" -f $result.ClosedCount, $resolved)
                $closedViaRot = $true
            }
            if ($result.Error) {
                Write-Debug ("Close-TargetAccessDbIfOpen: ROT warning: {0}" -f $result.Error)
            }
        } catch { Write-Debug "Diagnostics: $_" }
    }

    # Fallback: if ROT closed nothing, check for an active lock file and log diagnostics
    if (-not $closedViaRot) {
        $lockPath = Get-AccessLockFilePath -AccessPath $resolved
        if ($lockPath -and (Test-Path -LiteralPath $lockPath)) {
            Write-Warning ("Close-TargetAccessDbIfOpen: active lock detected: {0}" -f $lockPath)

            # Search MSACCESS.EXE by CommandLine for diagnostic purposes only.  A path match
            # does NOT prove ownership — another session/agent may be using the same database.
            # In that case we report and block; we never kill any unattributed process.
            # Get-CimInstance can deadlock if there are zombie processes stuck on network I/O
            # (e.g. unreachable UNC share); use the bounded helper that wraps the call in a Job.
            $cimProcs = @(Get-MsAccessProcessesBounded)

            if ($cimProcs.Count -gt 0) {
                $matchingPids = [System.Collections.Generic.List[int]]::new()
                foreach ($cim in $cimProcs) {
                    if ($cim.CommandLine -and $cim.CommandLine -match [regex]::Escape($resolved)) {
                        $matchingPids.Add([int]$cim.ProcessId)
                    }
                }
                if ($matchingPids.Count -gt 0) {
                    Write-Warning ("Close-TargetAccessDbIfOpen: unattributed MSACCESS blocking '{0}' (PIDs: {1}); no process will be closed without an owned OperationId/PID." -f $resolved, ($matchingPids -join ', '))
                } else {
                    Write-Debug ("Close-TargetAccessDbIfOpen: no MSACCESS contains '{0}' in CommandLine. Active PIDs: {1}" -f $resolved, (($cimProcs | ForEach-Object { $_.ProcessId }) -join ', '))
                }
            } else {
                Write-Warning "Close-TargetAccessDbIfOpen: could not enumerate MSACCESS by CommandLine; no unattributed process will be closed."
            }
        }
    }
}

# ---------------------------------------------------------------------------
# Canonical Access COM open/close — single entry and exit point for all paths
# that spawn Access.Application (used by dysflow-access-runner.ps1 and
# dysflow-vba-manager.ps1).  DAO in-process paths (New-DaoDbEngine) do NOT
# go through here — they do not spawn MSACCESS.EXE.
# ---------------------------------------------------------------------------

<#
.SYNOPSIS
    Spawn Access.Application and capture the owned PID via a 3-layer ladder.

.DESCRIPTION
    Layer 1: hWndAccessApp before OpenCurrentDatabase.
    Layer 2: hWndAccessApp retry after OpenCurrentDatabase (if layer 1 empty).
    Layer 3: bounded WMI diff of pre/post MSACCESS processes (only if layers 1+2 empty;
             if >1 new processes appear the diff is ambiguous → OwnedPid=$null, never guesses).

    A stronger layer's result is never overwritten by a weaker one.

    If -SetAutomationSecurityLow is $true (default), AutomationSecurity is set to 1
    (msoAutomationSecurityLow) and the original value is captured for restoration in
    Close-CanonicalAccess.

    If -OpenDatabase is $false, OpenCurrentDatabase is skipped (used for direct-target
    query operations that spawn COM but don't need to open a specific database).

    Injectable seams (for testing):
    -ComSpawnAction      — creates and returns the COM object (default: New-Object -ComObject Access.Application)
    -HwndToPidAction     — resolves an hWnd to a PID (default: Get-ProcessIdFromHwnd)
    -WmiSnapshotAction   — returns the current list of MSACCESS processes (default: Get-MsAccessProcessesBounded)

    These seams are intended for testing only.  Production callers omit them and receive the defaults.

.OUTPUTS
    PSCustomObject { AccessApplication, OwnedPid([int]|$null), OriginalAutomationSecurity([int]), PidAttributed([bool]) }
#>
function Open-CanonicalAccess {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$DbPath,
        [string]$Password = "",
        # When $true (default), OpenCurrentDatabase is called after spawning the COM object.
        # Set to $false for direct-target query operations (isDirectTargetQuery) that spawn
        # Access.Application but don't need to open a specific .accdb/.mdb.
        [bool]$OpenDatabase = $true,
        # When $true (default), AutomationSecurity is set to 1 (Low) before opening, and the
        # original value is saved in the Session so Close-CanonicalAccess can restore it.
        [bool]$SetAutomationSecurityLow = $true,
        # --- Injectable seams (testing only; production callers omit these) ---
        # Spawns the COM object.  Default: New-Object -ComObject Access.Application
        [scriptblock]$ComSpawnAction    = { if ($env:DYSFLOW_MOCK_COM -eq '1') { Get-MockAccessApplication } else { New-Object -ComObject "Access.Application" } },
        # Resolves an hWnd ([IntPtr]) to a PID ([int]).  Default: Get-ProcessIdFromHwnd
        [scriptblock]$HwndToPidAction   = { param([IntPtr]$Hwnd) Get-ProcessIdFromHwnd -Hwnd $Hwnd },
        # Returns the current list of MSACCESS processes.  Default: Get-MsAccessProcessesBounded
        [scriptblock]$WmiSnapshotAction = { Get-MsAccessProcessesBounded }
    )

    # --- layer 3 pre-open snapshot (only used if layers 1+2 both fail) ----
    $preOpenProcs = @(& $WmiSnapshotAction)
    $preOpenPids  = @($preOpenProcs | ForEach-Object { $_.ProcessId })

    # --- spawn the COM object ---------------------------------------------
    $access = & $ComSpawnAction

    # --- capture OriginalAutomationSecurity and optionally set to Low -----
    $originalAutomationSecurity = [int]$access.AutomationSecurity
    if ($SetAutomationSecurityLow) {
        $access.AutomationSecurity = 1  # msoAutomationSecurityLow
    }

    # --- layer 1: hWnd before OpenCurrentDatabase -------------------------
    $ownedPid = $null
    $hwnd1 = [IntPtr]0
    try { $hwnd1 = [IntPtr]$access.hWndAccessApp } catch {}
    if ($hwnd1 -ne [IntPtr]0) {
        $pid1 = & $HwndToPidAction $hwnd1
        if ($pid1 -gt 0) { $ownedPid = $pid1 }
    }

    # --- open database (unless caller skips it) ---------------------------
    if ($OpenDatabase) {
        try {
            $access.OpenCurrentDatabase($DbPath, $false, $Password)
        } catch {
            Write-Debug "Open-CanonicalAccess: OpenCurrentDatabase threw: $_"
        }

        # --- layer 2: hWnd retry after open (only if layer 1 was empty) ----
        if ($null -eq $ownedPid) {
            $hwnd2 = [IntPtr]0
            try { $hwnd2 = [IntPtr]$access.hWndAccessApp } catch {}
            if ($hwnd2 -ne [IntPtr]0) {
                $pid2 = & $HwndToPidAction $hwnd2
                if ($pid2 -gt 0) { $ownedPid = $pid2 }
            }
        }
    }

    # --- layer 3: bounded WMI diff (only if layers 1+2 both empty) -------
    if ($null -eq $ownedPid) {
        $postOpenProcs = @(& $WmiSnapshotAction)
        $newPids = @($postOpenProcs |
            Where-Object { $_.ProcessId -notin $preOpenPids } |
            Select-Object -ExpandProperty ProcessId)

        if ($newPids.Count -eq 1) {
            $ownedPid = $newPids[0]
        } elseif ($newPids.Count -gt 1) {
            # Ambiguous: >1 new processes appeared — do not guess.
            Write-Warning ("Open-CanonicalAccess: diff found {0} new MSACCESS processes; attribution ambiguous. OwnedPid=$null." -f $newPids.Count)
        }
        # Count -eq 0: no new processes found, OwnedPid stays $null.
    }

    $pidAttributed = ($null -ne $ownedPid)

    return [PSCustomObject]@{
        AccessApplication          = $access
        OwnedPid                   = $ownedPid
        OriginalAutomationSecurity = $originalAutomationSecurity
        PidAttributed              = $pidAttributed
    }
}

<#
.SYNOPSIS
    Tear down an Access.Application session opened by Open-CanonicalAccess.

.DESCRIPTION
    Fixed COM teardown sequence:
        1. Release any secondary COM references held by the caller (not done here —
           each caller is responsible for its own secondary objects before calling Close).
        2. CloseCurrentDatabase (if a database was opened).
        3. Quit.
        4. [Runtime.InteropServices.Marshal]::FinalReleaseComObject.
        5. [GC]::Collect + WaitForPendingFinalizers (BEFORE kill so RCWs are released).

    Then kill logic:
        - If Session.OwnedPid != $null → Stop-AccessPidAndWait (synchronous; includes
          taskkill last-resort from Slice 2).
        - If Session.OwnedPid == $null → NEVER kill by path/name/CommandLine.
          Emits a WARN, calls -RotCloseAction if provided, verifies the lock file.
          UnattributedKilled is ALWAYS $false (invariant).

    AutomationSecurity is always restored to Session.OriginalAutomationSecurity before
    returning (even if Quit throws).

    Injectable seams (for testing):
    -KillPidAction   — kills the owned PID and returns bool (default: Stop-AccessPidAndWait)
    -LockFileAction  — checks whether the lock file exists (default: Test-Path)

.PARAMETER Session
    The PSCustomObject returned by Open-CanonicalAccess.

.PARAMETER DbPath
    Path to the .accdb / .mdb that was opened (used for lock-file verification in the
    null-PID fallback path).

.PARAMETER RotCloseAction
    Optional scriptblock injected by the caller to perform a ROT-based close when OwnedPid
    is $null (e.g. Close-TargetAccessDbIfOpen in vba-manager).  Signature: { param($DbPath) }.
    If not provided, the fallback only emits a WARN and checks the lock file.

.OUTPUTS
    PSCustomObject { OwnedPidKilled([bool]), PidWasAttributed([bool]), UnattributedKilled([bool]=always $false) }
#>
function Close-CanonicalAccess {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][PSCustomObject]$Session,
        [string]$DbPath = "",
        # Optional ROT-based close action for the null-PID fallback path.
        # Signature: { param($DbPath) }
        [scriptblock]$RotCloseAction = $null,
        # --- Injectable seams (testing only; production callers omit these) ---
        # Kills the owned PID and returns $true/$false.  Default: Stop-AccessPidAndWait
        [scriptblock]$KillPidAction  = { param([int]$AccessPid) Stop-AccessPidAndWait -AccessPid $AccessPid -TimeoutMs 20000 },
        # Checks whether a path exists (for lock-file verification).  Default: Test-Path
        [scriptblock]$LockFileAction = { param([string]$LockPath) Test-Path -LiteralPath $LockPath -ErrorAction SilentlyContinue }
    )

    $access        = $Session.AccessApplication
    $ownedPid      = $Session.OwnedPid
    $pidAttributed = $Session.PidAttributed

    $ownedPidKilled = $false

    try {
        # Step 2: close the database (ignore if no db was opened or already closed)
        try { $access.CloseCurrentDatabase() } catch { Write-Debug "Close-CanonicalAccess: CloseCurrentDatabase threw: $_" }

        # Step 3: quit the application
        try { $access.Quit(2) } catch { Write-Debug "Close-CanonicalAccess: Quit threw: $_" }
    } finally {
        # Restore AutomationSecurity regardless of Quit outcome
        try {
            if ($null -ne $access -and $null -ne $Session.OriginalAutomationSecurity) {
                $access.AutomationSecurity = $Session.OriginalAutomationSecurity
            }
        } catch { Write-Debug "Close-CanonicalAccess: AutomationSecurity restore threw: $_" }

        # Step 4: release the COM callable wrapper
        try {
            if ($null -ne $access -and $env:DYSFLOW_MOCK_COM -ne '1') {
                [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($access) | Out-Null
            }
        } catch { Write-Debug "Close-CanonicalAccess: FinalReleaseComObject threw: $_" }

        # Step 5: GC BEFORE kill — release RCWs so Quit can complete and file handles free
        try {
            [GC]::Collect()
            [GC]::WaitForPendingFinalizers()
        } catch { Write-Debug "Close-CanonicalAccess: GC threw: $_" }

        # --- Kill logic ---------------------------------------------------
        if ($null -ne $ownedPid) {
            # Owned PID: kill synchronously (Stop-AccessPidAndWait has taskkill last-resort).
            $killed = & $KillPidAction $ownedPid
            $ownedPidKilled = [bool]$killed
        } else {
            # No attributed PID: NEVER kill by path/name/CommandLine.
            # UnattributedKilled is an INVARIANT $false.
            [Console]::Error.WriteLine(
                "WARN: Close-CanonicalAccess: OwnedPid is null; cannot kill by path/CommandLine. " +
                "Running ROT/lock fallback only.")

            # Optional ROT close injected by the caller
            if ($null -ne $RotCloseAction -and $DbPath) {
                try { & $RotCloseAction $DbPath } catch { Write-Debug "Close-CanonicalAccess: RotCloseAction threw: $_" }
            }

            # Lock-file verification: report if .laccdb still exists
            if ($DbPath) {
                $lockPath = [System.IO.Path]::ChangeExtension($DbPath, ".laccdb")
                $lockExists = & $LockFileAction $lockPath
                if ($lockExists) {
                    Write-Warning ("Close-CanonicalAccess: lock file still present after null-PID close: {0}" -f $lockPath)
                }
            }
        }
    }

    return [PSCustomObject]@{
        OwnedPidKilled     = $ownedPidKilled
        PidWasAttributed   = $pidAttributed
        UnattributedKilled = $false   # INVARIANT: never $true
    }
}
