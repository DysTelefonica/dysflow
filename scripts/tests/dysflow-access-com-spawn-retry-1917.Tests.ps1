#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1917 (P1): Open-CanonicalAccess retries the COM launch exactly once when it fails with
    0x80080005 (CO_E_SERVER_EXEC_FAILURE), after the previous Access instance has exited.
.NOTES
    Pure PowerShell. Drives the function through its own injectable seams; no Access is started
    and no process is killed.
#>

BeforeAll {
    $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
    . (Resolve-Path $script:ModulePath).Path

    # 0x80080005 and 0x800706BA as the signed Int32 a COM failure surfaces.
    $script:ServerExecFailure = -2146959355
    $script:RpcUnavailable    = -2147023174

    function New-TestComError {
        param([int]$HResult, [string]$Message)
        [System.Runtime.InteropServices.COMException]::new($Message, $HResult)
    }

    function New-TestAccessApplication {
        $app = [pscustomobject]@{
            AutomationSecurity = 3
            Visible            = $true
            UserControl        = $true
            hWndAccessApp      = [IntPtr]::new(1234)
        }
        $app | Add-Member -MemberType ScriptMethod -Name OpenCurrentDatabase -Value { param($Path, $Exclusive, $Password) }
        $app | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($opt) }
        return $app
    }

    function New-ProcessRow {
        param([int]$ProcessId)
        [pscustomobject]@{ ProcessId = $ProcessId; CreationDate = $null; CommandLine = "MSACCESS.EXE /embedding" }
    }
}

Describe "Open-CanonicalAccess spawn retry on 0x80080005 (#1917)" {
    BeforeEach {
        $script:SpawnCalls = 0
        $script:SnapshotCalls = 0
        $script:App = New-TestAccessApplication
    }

    It "retries a launch that fails once with 0x80080005 and returns the COM object of the retry" {
        $session = Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
            -ComSpawnAction {
                $script:SpawnCalls++
                if ($script:SpawnCalls -eq 1) { throw (New-TestComError -HResult $script:ServerExecFailure -Message "Server execution failed") }
                $script:App
            } `
            -HwndToPidAction { param([IntPtr]$Hwnd) 4242 } `
            -WmiSnapshotAction { @() }

        $script:SpawnCalls | Should -Be 2
        $session.AccessApplication | Should -Be $script:App
        $session.OwnedPid | Should -Be 4242
    }

    It "throws the ORIGINAL error, naming the retry, when the retry fails with 0x80080005 too" {
        $thrown = $null
        try {
            Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
                -ComSpawnAction {
                    $script:SpawnCalls++
                    throw (New-TestComError -HResult $script:ServerExecFailure -Message "launch attempt $($script:SpawnCalls) failed")
                } `
                -HwndToPidAction { param([IntPtr]$Hwnd) 4242 } `
                -WmiSnapshotAction { @() } | Out-Null
        } catch { $thrown = $_ }

        $thrown | Should -Not -BeNullOrEmpty
        $script:SpawnCalls | Should -Be 2
        $thrown.Exception.HResult | Should -Be $script:ServerExecFailure
        $thrown.Exception.Message | Should -Match "launch attempt 1 failed"
        $thrown.Exception.Message | Should -Not -Match "launch attempt 2 failed"
        $thrown.Exception.Message | Should -Match "retr"
    }

    It "does not retry a launch that fails with any other HRESULT, and the error propagates" {
        $thrown = $null
        try {
            Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
                -ComSpawnAction {
                    $script:SpawnCalls++
                    throw (New-TestComError -HResult $script:RpcUnavailable -Message "RPC server unavailable")
                } `
                -HwndToPidAction { param([IntPtr]$Hwnd) 4242 } `
                -WmiSnapshotAction { @() } | Out-Null
        } catch { $thrown = $_ }

        $thrown | Should -Not -BeNullOrEmpty
        $script:SpawnCalls | Should -Be 1
        $thrown.Exception.Message | Should -Match "RPC server unavailable"
    }

    It "retries only once the previous instance has left the process table beyond the pre-open snapshot" {
        # Pre-open snapshot: PID 100 belongs to someone else. The crashed instance (PID 999)
        # is still in the table for the first three polls after the failed launch.
        $script:SawDyingInstanceAtRetry = $null
        $session = Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
            -ComSpawnAction {
                $script:SpawnCalls++
                if ($script:SpawnCalls -eq 1) { throw (New-TestComError -HResult $script:ServerExecFailure -Message "Server execution failed") }
                $script:SawDyingInstanceAtRetry = ($script:SnapshotCalls -le 4)
                $script:App
            } `
            -HwndToPidAction { param([IntPtr]$Hwnd) 4242 } `
            -WmiSnapshotAction {
                $script:SnapshotCalls++
                if ($script:SnapshotCalls -ge 2 -and $script:SnapshotCalls -le 4) { @((New-ProcessRow 100), (New-ProcessRow 999)) }
                else { @(New-ProcessRow 100) }
            }

        $session.AccessApplication | Should -Be $script:App
        $script:SpawnCalls | Should -Be 2
        $script:SawDyingInstanceAtRetry | Should -BeFalse
    }

    It "bounds the wait: a process table that never settles does not retry forever" {
        # Runs on the production bound (5000 ms by default), so the assertion proves the
        # default itself is finite rather than a test-only override.
        $thrown = $null
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
                -ComSpawnAction {
                    $script:SpawnCalls++
                    throw (New-TestComError -HResult $script:ServerExecFailure -Message "launch attempt $($script:SpawnCalls) failed")
                } `
                -HwndToPidAction { param([IntPtr]$Hwnd) 4242 } `
                -WmiSnapshotAction {
                    $script:SnapshotCalls++
                    if ($script:SnapshotCalls -eq 1) { @(New-ProcessRow 100) } else { @((New-ProcessRow 100), (New-ProcessRow 999)) }
                } | Out-Null
        } catch { $thrown = $_ }
        $watch.Stop()

        $thrown | Should -Not -BeNullOrEmpty
        $thrown.Exception.Message | Should -Match "launch attempt 1 failed"
        $script:SpawnCalls | Should -Be 2
        $watch.ElapsedMilliseconds | Should -BeLessThan 12000
    }
}
