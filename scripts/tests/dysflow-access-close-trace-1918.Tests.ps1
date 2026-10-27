#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1918: Close-CanonicalAccess records its shutdown steps, in order, to the file named by
    DYSFLOW_TRACE_COM_CLOSE. The trace is off unless that variable is set; it changes no behaviour.
.NOTES
    Pure PowerShell. Uses the function's own injectable seams; no Access is started.
#>

BeforeAll {
    $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
    . (Resolve-Path $script:ModulePath).Path
    $script:TracePath = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1918-" + [guid]::NewGuid().ToString("N") + ".log")
}

AfterAll {
    if ($script:TracePath -and (Test-Path -LiteralPath $script:TracePath)) {
        Remove-Item -LiteralPath $script:TracePath -Force
    }
}

Describe "Close-CanonicalAccess shutdown trace (#1918)" {
    BeforeEach {
        if (Test-Path -LiteralPath $script:TracePath) { Remove-Item -LiteralPath $script:TracePath -Force }
        $env:DYSFLOW_TRACE_COM_CLOSE = $script:TracePath
        $access = [pscustomobject]@{}
        $access | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value { }
        $access | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($opt) }
        $script:Session = [pscustomobject]@{
            AccessApplication = $access
            OwnedPid          = 4242
            PidAttributed     = $true
            OriginalAutomationSecurity = $null
        }
    }

    AfterEach {
        Remove-Item Env:\DYSFLOW_TRACE_COM_CLOSE -ErrorAction SilentlyContinue
    }

    It "writes one line per shutdown step, in order, tagged with the owned PID" {
        Close-CanonicalAccess -Session $script:Session -KillPidAction { param([int]$AccessPid) $true } -ExitWaitAction { param([int]$AccessPid, [int]$TimeoutMs) $false } | Out-Null

        Test-Path -LiteralPath $script:TracePath | Should -BeTrue
        $steps = @(Get-Content -LiteralPath $script:TracePath | ForEach-Object { ($_ -split ' step=')[1] })
        $steps | Should -Be @("Begin", "CloseCurrentDatabase", "Quit", "FinalReleaseComObject", "GC", "WaitOwnedPidExit", "KillOwnedPid")
        @(Get-Content -LiteralPath $script:TracePath | Where-Object { $_ -notmatch ' pid=4242 ' }).Count | Should -Be 0
    }

    It "writes nothing when DYSFLOW_TRACE_COM_CLOSE is unset" {
        Remove-Item Env:\DYSFLOW_TRACE_COM_CLOSE -ErrorAction SilentlyContinue
        Close-CanonicalAccess -Session $script:Session -KillPidAction { param([int]$AccessPid) $true } -ExitWaitAction { param([int]$AccessPid, [int]$TimeoutMs) $false } | Out-Null

        Test-Path -LiteralPath $script:TracePath | Should -BeFalse
    }
}

Describe "Open-CanonicalAccess failed-open trace (#1918)" {
    BeforeEach {
        if (Test-Path -LiteralPath $script:TracePath) { Remove-Item -LiteralPath $script:TracePath -Force }
        $env:DYSFLOW_TRACE_COM_CLOSE = $script:TracePath
        $env:DYSFLOW_MOCK_COM = '1'

        $failed = [pscustomobject]@{
            AutomationSecurity = 3
            Visible            = $true
            UserControl        = $true
            hWndAccessApp      = [IntPtr]::new(1234)
        }
        $failed | Add-Member -MemberType ScriptMethod -Name OpenCurrentDatabase -Value {
            param($Path, $Exclusive, $Password) throw "DYSFLOW_TEST_OPEN_FAILURE"
        }
        $failed | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($opt) }
        $script:FailedAccess = $failed
    }

    AfterEach {
        Remove-Item Env:\DYSFLOW_TRACE_COM_CLOSE -ErrorAction SilentlyContinue
        Remove-Item Env:\DYSFLOW_MOCK_COM -ErrorAction SilentlyContinue
    }

    It "records the failed-open Quit with the owned PID, so a crash on that path is distinguishable" {
        {
            Open-CanonicalAccess -DbPath "C:\data\does-not-exist.accdb" `
                -ComSpawnAction { $script:FailedAccess } `
                -HwndToPidAction { param([IntPtr]$Hwnd) 777 } `
                -WmiSnapshotAction { @() }
        } | Should -Throw

        Test-Path -LiteralPath $script:TracePath | Should -BeTrue
        $lines = @(Get-Content -LiteralPath $script:TracePath)
        $lines.Count | Should -Be 1
        $lines[0] | Should -Match ' pid=777 '
        ($lines[0] -split ' step=')[1] | Should -Be "OpenFailedQuit"
    }
}
