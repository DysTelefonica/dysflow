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
        Close-CanonicalAccess -Session $script:Session -KillPidAction { param([int]$AccessPid) $true } | Out-Null

        Test-Path -LiteralPath $script:TracePath | Should -BeTrue
        $steps = @(Get-Content -LiteralPath $script:TracePath | ForEach-Object { ($_ -split ' step=')[1] })
        $steps | Should -Be @("CloseCurrentDatabase", "Quit", "FinalReleaseComObject", "GC", "KillOwnedPid")
        @(Get-Content -LiteralPath $script:TracePath | Where-Object { $_ -notmatch ' pid=4242 ' }).Count | Should -Be 0
    }

    It "writes nothing when DYSFLOW_TRACE_COM_CLOSE is unset" {
        Remove-Item Env:\DYSFLOW_TRACE_COM_CLOSE -ErrorAction SilentlyContinue
        Close-CanonicalAccess -Session $script:Session -KillPidAction { param([int]$AccessPid) $true } | Out-Null

        Test-Path -LiteralPath $script:TracePath | Should -BeFalse
    }
}
