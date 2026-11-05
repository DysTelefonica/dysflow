#Requires -Modules Pester
<#
.SYNOPSIS
    Owned-PID attribution of Open-CanonicalAccess and cleanup of a half-open Access.
.DESCRIPTION
    A real Access.Application exposes hWndAccessApp as a METHOD, not a property. Reading it as
    a property threw, the error was swallowed, and the owned PID was never attributed through
    the window handle. Close-CanonicalAccess then only called Quit, and a headless Access that
    did not quit stayed orphaned. These tests also check that a throw after a successful spawn
    quits Access and stops the attributed PID before the original error reaches the caller.
.NOTES
    Offline: the fake Access.Application stands in for COM, and Get-Process / Stop-Process are
    Pester mocks. No Access is started and no real process is signalled.
#>

BeforeAll {
    $script:PreviousMockCom = $env:DYSFLOW_MOCK_COM
    # Safety net: a path that fell through to the default COM spawn gets the module mock.
    $env:DYSFLOW_MOCK_COM = '1'
    . (Resolve-Path (Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1")).Path

    # Shaped like the real COM object: hWndAccessApp is a method that returns the window handle.
    function script:New-PidAttributionFakeAccessApp {
        param(
            [int]$Hwnd = 0,
            [scriptblock]$OnOpen = {},
            [switch]$HeadlessAssignmentFails
        )
        $app = [pscustomobject]@{
            AutomationSecurity = 3
            UserControl        = $true
            QuitCalls          = [System.Collections.Generic.List[object]]::new()
            HwndValue          = $Hwnd
            OnOpen             = $OnOpen
        }
        if ($HeadlessAssignmentFails) {
            $app | Add-Member -MemberType ScriptProperty -Name Visible -Value { $true } -SecondValue {
                param($value) throw "Visible cannot be assigned"
            }
        } else {
            $app | Add-Member -MemberType NoteProperty -Name Visible -Value $true
        }
        $app | Add-Member -MemberType ScriptMethod -Name hWndAccessApp -Value { $this.HwndValue }
        $app | Add-Member -MemberType ScriptMethod -Name OpenCurrentDatabase -Value {
            param($Path, $Exclusive, $Password)
            & $this.OnOpen
        }
        $app | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value {}
        $app | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($SaveOption) $this.QuitCalls.Add($SaveOption) }
        return $app
    }
}

AfterAll {
    $env:DYSFLOW_MOCK_COM = $script:PreviousMockCom
}

Describe "Open-CanonicalAccess attributes the owned PID through hWndAccessApp()" {
    It "returns the PID of the window handle from layer 1 without the WMI diff" {
        $script:SnapshotCalls = 0
        $app = New-PidAttributionFakeAccessApp -Hwnd 5555

        $session = Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
            -ComSpawnAction { $app } `
            -HwndToPidAction { param([IntPtr]$Hwnd) if ($Hwnd -eq [IntPtr]5555) { 31337 } else { 0 } } `
            -WmiSnapshotAction { $script:SnapshotCalls++; @() }

        $session.OwnedPid | Should -Be 31337
        $session.PidAttributed | Should -BeTrue
        # Only the pre-open snapshot is taken; the post-open diff is never consulted.
        $script:SnapshotCalls | Should -Be 1
    }
}

Describe "Open-CanonicalAccess cleans up an Access that fails after the spawn" {
    BeforeEach {
        $script:StoppedPids = [System.Collections.Generic.List[int]]::new()
        # -Id binds as int[] inside a Pester mock.
        Mock Get-Process {
            if ($script:StoppedPids.Contains([int]$Id[0])) { return $null }
            [pscustomobject]@{ Id = [int]$Id[0]; ProcessName = 'MSACCESS'; HasExited = $false }
        }
        Mock Stop-Process { $script:StoppedPids.Add([int]$Id[0]) }
    }

    It "quits Access, stops the attributed PID and rethrows DYSFLOW_HEADLESS_LAUNCH_FAILED" {
        $app = New-PidAttributionFakeAccessApp -Hwnd 6001 -HeadlessAssignmentFails

        { Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
            -ComSpawnAction { $app } `
            -HwndToPidAction { param([IntPtr]$Hwnd) 46001 } `
            -WmiSnapshotAction { @() } } | Should -Throw -ExpectedMessage "DYSFLOW_HEADLESS_LAUNCH_FAILED*"

        $app.QuitCalls | Should -Be @(2)
        $script:StoppedPids | Should -Contain 46001
        $app.AutomationSecurity | Should -Be 3 -Because "the original AutomationSecurity is restored"
    }

    It "stops the attributed PID when OpenCurrentDatabase fails and keeps the typed error id" {
        $app = New-PidAttributionFakeAccessApp -Hwnd 6002 -OnOpen { throw "password rejected" }

        $errorId = $null
        try {
            Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
                -ComSpawnAction { $app } `
                -HwndToPidAction { param([IntPtr]$Hwnd) 46002 } `
                -WmiSnapshotAction { @() } | Out-Null
        } catch {
            $errorId = $_.FullyQualifiedErrorId
        }

        $errorId | Should -Be "DYSFLOW_OPEN_CURRENT_DATABASE_FAILED,Open-CanonicalAccess"
        $app.QuitCalls | Should -Be @(2)
        $script:StoppedPids | Should -Contain 46002
    }

    It "quits Access but stops nothing when no PID was attributed" {
        $app = New-PidAttributionFakeAccessApp -Hwnd 0 -HeadlessAssignmentFails

        { Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
            -ComSpawnAction { $app } `
            -HwndToPidAction { param([IntPtr]$Hwnd) 0 } `
            -WmiSnapshotAction { @() } } | Should -Throw -ExpectedMessage "DYSFLOW_HEADLESS_LAUNCH_FAILED*"

        $app.QuitCalls | Should -Be @(2)
        $script:StoppedPids.Count | Should -Be 0
        Should -Invoke Stop-Process -Times 0 -Exactly
    }

    It "does not stop an attributed PID that exits on its own after Quit" {
        Mock Get-Process { $null }
        $app = New-PidAttributionFakeAccessApp -Hwnd 6003 -HeadlessAssignmentFails

        { Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
            -ComSpawnAction { $app } `
            -HwndToPidAction { param([IntPtr]$Hwnd) 46003 } `
            -WmiSnapshotAction { @() } } | Should -Throw -ExpectedMessage "DYSFLOW_HEADLESS_LAUNCH_FAILED*"

        $app.QuitCalls | Should -Be @(2)
        Should -Invoke Stop-Process -Times 0 -Exactly
    }
}

Describe "Resolve-AccessPidFromHwnd accepts only an MSACCESS owner" {
    It "returns the PID when the window belongs to MSACCESS" {
        Resolve-AccessPidFromHwnd -Hwnd ([IntPtr]7001) `
            -HwndPidLookup { param([IntPtr]$Hwnd) 47001 } `
            -ProcessLookup { param([int]$AccessPid) [pscustomobject]@{ Id = $AccessPid; ProcessName = 'MSACCESS' } } |
            Should -Be 47001
    }

    It "returns 0 when the window belongs to another program, so that PID is never stopped" {
        Resolve-AccessPidFromHwnd -Hwnd ([IntPtr]7002) `
            -HwndPidLookup { param([IntPtr]$Hwnd) 47002 } `
            -ProcessLookup { param([int]$AccessPid) [pscustomobject]@{ Id = $AccessPid; ProcessName = 'explorer' } } |
            Should -Be 0
    }

    It "returns 0 when the owning process is gone" {
        Resolve-AccessPidFromHwnd -Hwnd ([IntPtr]7003) `
            -HwndPidLookup { param([IntPtr]$Hwnd) 47003 } `
            -ProcessLookup { param([int]$AccessPid) $null } |
            Should -Be 0
    }
}

Describe "Get-ProcessIdFromHwnd on a real window handle" {
    BeforeAll {
        $script:OnWindows = -not ($IsWindows -eq $false)
        $script:Window = $null
        if ($script:OnWindows) {
            $script:Window = Get-Process -ErrorAction SilentlyContinue |
                Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
                Select-Object -First 1
        }
    }

    It "compiles its Win32 binding and returns the owning PID without touching `$PID" {
        if (-not $script:OnWindows) { Set-ItResult -Skipped -Because "GetWindowThreadProcessId is Win32-only"; return }
        if ($null -eq $script:Window) { Set-ItResult -Skipped -Because "no process with a main window is running"; return }

        $savedMockCom = $env:DYSFLOW_MOCK_COM
        $env:DYSFLOW_MOCK_COM = $null
        $shellPid = $PID
        try {
            $resolved = Get-ProcessIdFromHwnd -Hwnd $script:Window.MainWindowHandle
        } finally {
            $env:DYSFLOW_MOCK_COM = $savedMockCom
        }

        $resolved | Should -Be $script:Window.Id
        $PID | Should -Be $shellPid
    }
}
