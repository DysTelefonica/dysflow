#Requires -Modules Pester
#Requires -Version 5.1
<#
.SYNOPSIS
    Pester tests for scripts/lib/dysflow-access-com.ps1 — the shared COM helper module.

.DESCRIPTION
    All tests run against the production source via dot-source.  COM/WMI seams are
    injected via the injectable -WmiScriptBlock parameter and Stop-Process/Get-Process
    overrides; no real Access COM or WMI is required.

.NOTES
    Run with: pwsh -Command "Invoke-Pester scripts/tests/ -CI"
#>

Describe "dysflow-access-com.ps1 — module structure" {
    BeforeAll {
        $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
    }

    Context "File presence and parseability" {
        It "module file exists" {
            Test-Path $script:ModulePath | Should -Be $true
        }

        It "module parses without syntax errors" {
            $errors = $null
            $null = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $script:ModulePath).Path,
                [ref]$null,
                [ref]$errors
            )
            $errors | Should -BeNullOrEmpty
        }
    }

    Context "Exported function definitions" {
        BeforeAll {
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $script:ModulePath).Path,
                [ref]$null,
                [ref]$null
            )
            $script:FunctionNames = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] },
                $true
            ) | Select-Object -ExpandProperty Name
        }

        It "defines Get-ProcessIdFromHwnd" {
            $script:FunctionNames | Should -Contain "Get-ProcessIdFromHwnd"
        }

        It "defines Get-MsAccessProcessesBounded" {
            $script:FunctionNames | Should -Contain "Get-MsAccessProcessesBounded"
        }

        It "defines Get-MsAccessProcesses" {
            $script:FunctionNames | Should -Contain "Get-MsAccessProcesses"
        }

        It "defines Stop-AccessPidAndWait" {
            $script:FunctionNames | Should -Contain "Stop-AccessPidAndWait"
        }

        It "defines Get-AccessLockFilePath (moved from vba-manager in Slice 5)" {
            $script:FunctionNames | Should -Contain "Get-AccessLockFilePath"
        }

        It "defines Close-TargetAccessDbIfOpen (moved from vba-manager in Slice 5)" {
            $script:FunctionNames | Should -Contain "Close-TargetAccessDbIfOpen"
        }
    }
}

# ---------------------------------------------------------------------------
# Get-MsAccessProcessesBounded — characterization tests
# ---------------------------------------------------------------------------

Describe "Get-MsAccessProcessesBounded (shared module) — behavioral" {
    BeforeAll {
        $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
        . (Resolve-Path $script:ModulePath).Path
    }

    Context "hang guard — injected slow scriptblock times out fast" {
        It "returns empty result and completes well under the sleep duration" {
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            $result = @(Get-MsAccessProcessesBounded `
                -WmiScriptBlock { Start-Sleep -Seconds 30 } `
                -TimeoutSeconds 1)
            $sw.Stop()

            $result.Count | Should -Be 0
            $sw.Elapsed.TotalSeconds | Should -BeLessThan 10
            # Proves Wait-Job timeout actually elapsed (not an instant bypass).
            $sw.Elapsed.TotalSeconds | Should -BeGreaterThan 0.9
        }
    }

    Context "success path — projected shape contains the required three fields" {
        It "returns a PSCustomObject with ProcessId, CreationDate, CommandLine from the injected scriptblock" {
            $result = @(Get-MsAccessProcessesBounded `
                -WmiScriptBlock {
                    [PSCustomObject]@{
                        ProcessId    = 9876
                        CreationDate = $null
                        CommandLine  = 'MSACCESS.EXE "C:\fake.accdb"'
                    }
                } `
                -TimeoutSeconds 5)

            $result.Count | Should -BeGreaterOrEqual 1
            $result[0].ProcessId | Should -Be 9876
            $result[0].CommandLine | Should -Be 'MSACCESS.EXE "C:\fake.accdb"'
        }

        It "always returns projected PSCustomObject shape (not raw CIM instance)" {
            $result = @(Get-MsAccessProcessesBounded `
                -WmiScriptBlock {
                    [PSCustomObject]@{
                        ProcessId    = 1111
                        CreationDate = $null
                        CommandLine  = 'MSACCESS.EXE "C:\data.accdb"'
                        ExtraField   = 'should be stripped by Select-Object'
                    }
                } `
                -TimeoutSeconds 5)

            $result.Count | Should -Be 1
            # ExtraField must NOT be present — the projected shape has exactly 3 properties.
            ($result[0].PSObject.Properties.Name -contains 'ExtraField') | Should -Be $false
        }
    }
}

# ---------------------------------------------------------------------------
# Get-MsAccessProcesses — thin alias
# ---------------------------------------------------------------------------

Describe "Get-MsAccessProcesses (shared module) — thin alias over bounded variant" {
    BeforeAll {
        $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
        . (Resolve-Path $script:ModulePath).Path
    }

    It "is defined and callable (confirms function exists in module)" {
        # Get-MsAccessProcesses delegates to Get-MsAccessProcessesBounded with no arguments.
        # We can only assert it exists and is callable without error; we cannot inject the
        # WmiScriptBlock through this wrapper, so we do not assert the returned count here
        # (a real WMI call may or may not find MSACCESS.EXE on any given machine).
        $result = $null
        { $result = @(Get-MsAccessProcesses) } | Should -Not -Throw
    }
}

# ---------------------------------------------------------------------------
# Stop-AccessPidAndWait — characterization tests
# ---------------------------------------------------------------------------
#
# Observable behavior at the port (per testing-philosophy.md):
#   1. Returns $true when the process is gone within the wait window.
#   2. Returns $false when the timeout elapses and the process is still alive.
#   3. Never throws — callers rely on a boolean result, not exception propagation.
#   4. Retries Stop-Process on each poll cycle (signal may be dropped during teardown).
#
# We mock Get-Process / Stop-Process to avoid needing a real process under test.
# ---------------------------------------------------------------------------

Describe "Stop-AccessPidAndWait (shared module) — behavioral" {
    BeforeAll {
        $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
        . (Resolve-Path $script:ModulePath).Path
    }

    BeforeEach {
        $script:StopProcessCalls = [System.Collections.Generic.List[int]]::new()
        $script:GetProcessAliveCount = 0  # how many Get-Process calls return "alive" before returning gone
    }

    Context "process exits quickly (first poll sees it gone)" {
        It "returns true when Get-Process returns nothing on the first poll" {
            function script:Stop-Process {
                param($Id, [switch]$Force, $ErrorAction)
                $script:StopProcessCalls.Add($Id)
            }
            function script:Get-Process {
                param($Id, $ErrorAction)
                return $null  # gone immediately
            }

            $result = Stop-AccessPidAndWait -AccessPid 5555 -TimeoutMs 5000
            $result | Should -Be $true
        }

        It "calls Stop-Process at least once before returning" {
            function script:Stop-Process {
                param($Id, [switch]$Force, $ErrorAction)
                $script:StopProcessCalls.Add($Id)
            }
            function script:Get-Process {
                param($Id, $ErrorAction)
                return $null
            }

            Stop-AccessPidAndWait -AccessPid 6666 -TimeoutMs 5000 | Out-Null
            $script:StopProcessCalls.Count | Should -BeGreaterOrEqual 1
        }
    }

    Context "process is still alive when timeout expires" {
        It "returns false when the process never exits within the timeout" {
            function script:Stop-Process {
                param($Id, [switch]$Force, $ErrorAction)
                $script:StopProcessCalls.Add($Id)
            }
            # Always returns an alive process object
            function script:Get-Process {
                param($Id, $ErrorAction)
                return [PSCustomObject]@{ Id = $Id }
            }
            # Use a very short timeout to keep the test fast.
            $result = Stop-AccessPidAndWait -AccessPid 7777 -TimeoutMs 300
            $result | Should -Be $false
        }
    }

    Context "exception safety" {
        It "does not throw when Stop-Process throws (e.g. process already gone)" {
            function script:Stop-Process {
                param($Id, [switch]$Force, $ErrorAction)
                throw "Access denied"
            }
            function script:Get-Process {
                param($Id, $ErrorAction)
                return $null
            }

            { Stop-AccessPidAndWait -AccessPid 8888 -TimeoutMs 1000 } | Should -Not -Throw
        }
    }

    Context "taskkill last-resort — observable post-condition (Slice 2 behavior change)" {
        # Port-level test: when the Stop-Process poll is exhausted and the process is
        # still alive, the taskkill last-resort seam (Start-Process) MUST be invoked
        # against the SAME owned PID that was passed in.
        #
        # Seam: Start-Process is overridden at script scope to capture calls instead of
        # actually invoking an executable.  Only the post-condition is asserted
        # (that the seam was invoked for the owned PID); internal call ordering is not
        # asserted (per testing-philosophy.md — behavior vs implementation).
        It "invokes the taskkill last-resort seam against the owned PID when poll is exhausted and process is still alive" {
            # Capture: record every Start-Process call's arguments.
            $script:StartProcessCalls = [System.Collections.Generic.List[hashtable]]::new()
            function script:Start-Process {
                param($FilePath, $ArgumentList, [switch]$NoNewWindow, $Wait, $ErrorAction)
                $script:StartProcessCalls.Add(@{
                    FilePath     = $FilePath
                    ArgumentList = $ArgumentList
                })
            }
            # Process never dies — poll always sees it alive.
            function script:Stop-Process {
                param($Id, [switch]$Force, $ErrorAction)
            }
            function script:Get-Process {
                param($Id, $ErrorAction)
                return [PSCustomObject]@{ Id = $Id }
            }

            $ownedPid = 9111
            # Very short timeout so the poll exhausts in <1 s.
            Stop-AccessPidAndWait -AccessPid $ownedPid -TimeoutMs 300 | Out-Null

            # Post-condition: at least one Start-Process call targeted taskkill with the exact owned PID.
            $taskkillCalls = @($script:StartProcessCalls | Where-Object {
                $_.FilePath -eq "taskkill" -and $_.ArgumentList -contains "/PID" -and
                $_.ArgumentList -contains $ownedPid
            })
            $taskkillCalls.Count | Should -BeGreaterOrEqual 1 -Because "taskkill last-resort must fire against the owned PID when the poll is exhausted"
        }

        It "does NOT invoke taskkill when process exits before poll is exhausted" {
            $script:StartProcessCalls = [System.Collections.Generic.List[hashtable]]::new()
            function script:Start-Process {
                param($FilePath, $ArgumentList, [switch]$NoNewWindow, $Wait, $ErrorAction)
                $script:StartProcessCalls.Add(@{
                    FilePath     = $FilePath
                    ArgumentList = $ArgumentList
                })
            }
            function script:Stop-Process {
                param($Id, [switch]$Force, $ErrorAction)
            }
            # Process exits on the very first poll.
            function script:Get-Process {
                param($Id, $ErrorAction)
                return $null
            }

            Stop-AccessPidAndWait -AccessPid 9222 -TimeoutMs 5000 | Out-Null

            # No taskkill invocation expected — process already gone.
            $taskkillCalls = @($script:StartProcessCalls | Where-Object { $_.FilePath -eq "taskkill" })
            $taskkillCalls.Count | Should -Be 0 -Because "taskkill must NOT fire when the process exited within the poll window"
        }

        It "does NOT invoke taskkill when -UseTaskkillLastResort is false" {
            $script:StartProcessCalls = [System.Collections.Generic.List[hashtable]]::new()
            function script:Start-Process {
                param($FilePath, $ArgumentList, [switch]$NoNewWindow, $Wait, $ErrorAction)
                $script:StartProcessCalls.Add(@{
                    FilePath     = $FilePath
                    ArgumentList = $ArgumentList
                })
            }
            function script:Stop-Process {
                param($Id, [switch]$Force, $ErrorAction)
            }
            # Process never dies — poll exhausted.
            function script:Get-Process {
                param($Id, $ErrorAction)
                return [PSCustomObject]@{ Id = $Id }
            }

            Stop-AccessPidAndWait -AccessPid 9333 -TimeoutMs 300 -UseTaskkillLastResort:$false | Out-Null

            $taskkillCalls = @($script:StartProcessCalls | Where-Object { $_.FilePath -eq "taskkill" })
            $taskkillCalls.Count | Should -Be 0 -Because "opt-out switch must suppress taskkill"
        }
    }
}

# ===========================================================================
# Slice 3 — Open-CanonicalAccess / Close-CanonicalAccess port tests
# ===========================================================================
#
# Seam design (per testing-philosophy.md — test at the ports, mock ONLY the seam):
#
#   Fake Access.Application: a PSCustomObject with configurable hWndAccessApp,
#   OpenCurrentDatabase (ScriptMethod), Quit (ScriptMethod), CloseCurrentDatabase.
#
#   Process-control seams: Open-CanonicalAccess exposes injectable scriptblock
#   parameters (-ComSpawnAction, -HwndToPidAction, -WmiSnapshotAction) and
#   Close-CanonicalAccess exposes (-KillPidAction, -LockFileAction).
#   Tests inject fakes through those parameters — no script-scope overrides needed.
#
#   We assert ONLY observable post-conditions (return fields, seam invocation
#   counts) — never internal call order or private collaborators.
# ===========================================================================

Describe "Open-CanonicalAccess / Close-CanonicalAccess (Slice 3) — port tests" {
    BeforeAll {
        $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
        . (Resolve-Path $script:ModulePath).Path
    }

    # -----------------------------------------------------------------------
    # Helper: build a fake Access.Application COM double
    # -----------------------------------------------------------------------
    # hWndAccessApp : value returned from .hWndAccessApp
    # openDbCalled  : reference array — element 0 set to $true when OpenCurrentDatabase is called
    function script:New-FakeAccessApp {
        param(
            [int]$hWndAccessApp     = 0,
            [ref]$openDbCalledRef   = ([ref]$null)
        )
        $fake = [PSCustomObject]@{
            hWndAccessApp      = $hWndAccessApp
            AutomationSecurity = 3   # msoAutomationSecurityByUI
            _openDbCalledRef   = $openDbCalledRef
        }
        $fake | Add-Member -MemberType ScriptMethod -Name OpenCurrentDatabase -Value {
            param($Path, $Exclusive, $Password)
            if ($null -ne $this._openDbCalledRef -and $null -ne $this._openDbCalledRef.Value) {
                $this._openDbCalledRef.Value = $true
            }
        }
        $fake | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($SaveOption) }
        $fake | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value {}
        return $fake
    }

    # -----------------------------------------------------------------------
    # (a) Owned PID is killed synchronously before Close-CanonicalAccess returns
    # -----------------------------------------------------------------------
    Context "(a) owned PID killed synchronously before Close returns" {
        It "KillPidAction is called with the owned PID and OwnedPidKilled is true" {
            # Use a constant return in the scriptblock to avoid variable-name collision
            # with $ownedPid inside Open-CanonicalAccess.  We assert the correct PID
            # was passed to KillPidAction.
            $killPidCalls = [System.Collections.Generic.List[int]]::new()
            $fakeApp      = New-FakeAccessApp -hWndAccessApp 1234

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 42000 } `
                -WmiSnapshotAction { @() }

            $session.OwnedPid | Should -Be 42000

            $result = Close-CanonicalAccess `
                -Session        $session `
                -DbPath         "C:\fake.accdb" `
                -KillPidAction  { param([int]$AccessPid) $killPidCalls.Add($AccessPid); $true } `
                -LockFileAction { $false }

            ($killPidCalls | Where-Object { $_ -eq 42000 }).Count | Should -BeGreaterOrEqual 1 `
                -Because "owned PID must be killed synchronously inside Close"
            $result.OwnedPidKilled | Should -Be $true
        }
    }

    # -----------------------------------------------------------------------
    # (b) Unattributed MSACCESS NEVER killed — UnattributedKilled is $false (invariant)
    # -----------------------------------------------------------------------
    Context "(b) UnattributedKilled is always false" {
        It "Close returns UnattributedKilled=false even when OwnedPid is null" {
            $fakeApp = New-FakeAccessApp -hWndAccessApp 0

            # All PID-resolution seams return nothing → OwnedPid will be null
            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 0 } `
                -WmiSnapshotAction { @() }

            $session.OwnedPid | Should -BeNullOrEmpty

            $result = Close-CanonicalAccess `
                -Session        $session `
                -DbPath         "C:\fake.accdb" `
                -KillPidAction  { param([int]$AccessPid) $true } `
                -LockFileAction { $false }

            $result.UnattributedKilled | Should -Be $false `
                -Because "invariant: unattributed processes are NEVER killed"
        }
    }

    # -----------------------------------------------------------------------
    # (c) hWnd success ⇒ WMI/diff seam NOT invoked
    # -----------------------------------------------------------------------
    Context "(c) hWnd success means WMI/diff seam is not invoked" {
        It "WmiSnapshotAction is NOT called when hWnd resolves the PID" {
            # Use a .NET list to track calls — a list is passed by reference so the
            # scriptblock closure can add to it without triggering PowerShell's copy-on-write.
            $wmiCalls = [System.Collections.Generic.List[int]]::new()
            $fakeApp  = New-FakeAccessApp -hWndAccessApp 9999

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 43000 } `
                -WmiSnapshotAction { $wmiCalls.Add(1); @() }

            Close-CanonicalAccess `
                -Session        $session `
                -DbPath         "C:\fake.accdb" `
                -KillPidAction  { param([int]$AccessPid) $true } `
                -LockFileAction { $false } | Out-Null

            # Pre-open snapshot (layer 3 init) is always taken.  After hWnd succeeds (layer 1),
            # the post-open diff snapshot must NOT run.  So at most 1 call total.
            $wmiCalls.Count | Should -BeLessOrEqual 1 `
                -Because "post-open WMI diff must not be invoked when hWnd already resolved the PID"
        }
    }

    # -----------------------------------------------------------------------
    # (d) Ambiguous diff (>1 new process) ⇒ OwnedPid=$null, no-kill fallback
    # -----------------------------------------------------------------------
    Context "(d) ambiguous diff leaves OwnedPid null and triggers no-kill fallback" {
        It "OwnedPid is null and KillPidAction is NOT called when diff finds >1 new processes" {
            $killPidCalls = [System.Collections.Generic.List[int]]::new()
            $fakeApp      = New-FakeAccessApp -hWndAccessApp 0  # hWnd never resolves

            # Use a .NET list to count WMI calls (reference semantics — scriptblock closure safe).
            $wmiCallLog = [System.Collections.Generic.List[int]]::new()
            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 0 } `
                -WmiSnapshotAction {
                    $wmiCallLog.Add(1)
                    if ($wmiCallLog.Count -eq 1) {
                        @()  # pre-open: no existing MSACCESS processes
                    } else {
                        # post-open: two new processes — ambiguous
                        @(
                            [PSCustomObject]@{ ProcessId = 51000; CreationDate = $null; CommandLine = "MSACCESS.EXE" },
                            [PSCustomObject]@{ ProcessId = 51001; CreationDate = $null; CommandLine = "MSACCESS.EXE" }
                        )
                    }
                }

            $session.OwnedPid      | Should -BeNullOrEmpty -Because "ambiguous diff (>1 new) must not guess the PID"
            $session.PidAttributed | Should -Be $false

            $result = Close-CanonicalAccess `
                -Session        $session `
                -DbPath         "C:\fake.accdb" `
                -KillPidAction  { param([int]$AccessPid) $killPidCalls.Add($AccessPid); $true } `
                -LockFileAction { $false }

            $killPidCalls.Count    | Should -Be 0 `
                -Because "KillPidAction must NOT be called when OwnedPid is null"
            $result.OwnedPidKilled | Should -Be $false
        }
    }

    # -----------------------------------------------------------------------
    # (e) Close with null PID does NOT throw, no force-kill, OwnedPidKilled=$false
    # -----------------------------------------------------------------------
    Context "(e) Close with null PID is safe" {
        It "does not throw and returns OwnedPidKilled=false when Session.OwnedPid is null" {
            $killPidCalls = [System.Collections.Generic.List[int]]::new()
            $fakeApp      = New-FakeAccessApp -hWndAccessApp 0

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 0 } `
                -WmiSnapshotAction { @() }

            $session.OwnedPid | Should -BeNullOrEmpty

            # Verify no throw (call first, then assert result)
            $threw = $false
            $result = $null
            try {
                $result = Close-CanonicalAccess `
                    -Session        $session `
                    -DbPath         "C:\fake.accdb" `
                    -KillPidAction  { param([int]$AccessPid) $killPidCalls.Add($AccessPid); $true } `
                    -LockFileAction { $false }
            } catch {
                $threw = $true
            }
            $threw | Should -Be $false -Because "Close with null PID must not throw"

            $result.OwnedPidKilled | Should -Be $false
            $killPidCalls.Count    | Should -Be 0 -Because "no force-kill when OwnedPid is null"
        }
    }

    # -----------------------------------------------------------------------
    # (f) -OpenDatabase:$false does NOT call OpenCurrentDatabase but still captures/kills PID
    # -----------------------------------------------------------------------
    Context "(f) -OpenDatabase:false skips OpenCurrentDatabase but captures and kills PID" {
        It "OpenCurrentDatabase is not called but PID is still captured and killed" {
            $killPidCalls = [System.Collections.Generic.List[int]]::new()
            $openDbCalled = $false
            $fakeApp      = New-FakeAccessApp -hWndAccessApp 7777 -openDbCalledRef ([ref]$openDbCalled)

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -OpenDatabase      $false `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 44000 } `
                -WmiSnapshotAction { @() }

            $openDbCalled        | Should -Be $false -Because "-OpenDatabase:false must skip OpenCurrentDatabase"
            $session.OwnedPid    | Should -Be 44000

            $result = Close-CanonicalAccess `
                -Session        $session `
                -DbPath         "C:\fake.accdb" `
                -KillPidAction  { param([int]$AccessPid) $killPidCalls.Add($AccessPid); $true } `
                -LockFileAction { $false }

            ($killPidCalls | Where-Object { $_ -eq 44000 }).Count | Should -BeGreaterOrEqual 1 `
                -Because "owned PID must be killed even when -OpenDatabase was false"
            $result.OwnedPidKilled | Should -Be $true
        }
    }

    # -----------------------------------------------------------------------
    # Session shape — Open-CanonicalAccess returns required fields
    # -----------------------------------------------------------------------
    Context "Session shape returned by Open-CanonicalAccess" {
        It "Session has AccessApplication, OwnedPid, OriginalAutomationSecurity, PidAttributed" {
            $fakeApp = New-FakeAccessApp -hWndAccessApp 8888

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 45000 } `
                -WmiSnapshotAction { @() }

            $session | Should -Not -BeNullOrEmpty
            ($session.PSObject.Properties.Name -contains 'AccessApplication')          | Should -Be $true
            ($session.PSObject.Properties.Name -contains 'OwnedPid')                   | Should -Be $true
            ($session.PSObject.Properties.Name -contains 'OriginalAutomationSecurity') | Should -Be $true
            ($session.PSObject.Properties.Name -contains 'PidAttributed')              | Should -Be $true
        }
    }

    # -----------------------------------------------------------------------
    # Close shape — Close-CanonicalAccess returns required fields
    # -----------------------------------------------------------------------
    Context "Result shape returned by Close-CanonicalAccess" {
        It "Result has OwnedPidKilled, PidWasAttributed, UnattributedKilled" {
            $fakeApp = New-FakeAccessApp -hWndAccessApp 9991

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 46000 } `
                -WmiSnapshotAction { @() }

            $result = Close-CanonicalAccess `
                -Session        $session `
                -DbPath         "C:\fake.accdb" `
                -KillPidAction  { param([int]$AccessPid) $true } `
                -LockFileAction { $false }

            $result | Should -Not -BeNullOrEmpty
            ($result.PSObject.Properties.Name -contains 'OwnedPidKilled')     | Should -Be $true
            ($result.PSObject.Properties.Name -contains 'PidWasAttributed')   | Should -Be $true
            ($result.PSObject.Properties.Name -contains 'UnattributedKilled') | Should -Be $true
        }
    }

    # -----------------------------------------------------------------------
    # Exported function names — module defines Open/Close canonical functions
    # -----------------------------------------------------------------------
    Context "Exported function definitions include canonical open/close" {
        BeforeAll {
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $script:ModulePath).Path,
                [ref]$null,
                [ref]$null
            )
            $script:Slice3FunctionNames = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] },
                $true
            ) | Select-Object -ExpandProperty Name
        }

        It "defines Open-CanonicalAccess" {
            $script:Slice3FunctionNames | Should -Contain "Open-CanonicalAccess"
        }

        It "defines Close-CanonicalAccess" {
            $script:Slice3FunctionNames | Should -Contain "Close-CanonicalAccess"
        }
    }
}
