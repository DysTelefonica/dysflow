#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1918: after Quit(2), Close-CanonicalAccess waits (bounded) for the owned Access to exit
    on its own before it force-kills it. Killing an Access still tearing down its COM session is the
    suspected cause of the combase.dll crashes of the NEXT instance.
.NOTES
    Pure PowerShell through the function's injectable seams. DYSFLOW_MOCK_COM is set so no code
    path can reach a real Access.Application; no process is started or killed.
#>

BeforeAll {
    $script:PreviousMockCom = $env:DYSFLOW_MOCK_COM
    $env:DYSFLOW_MOCK_COM = '1'
    $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
    . (Resolve-Path $script:ModulePath).Path
}

AfterAll {
    $env:DYSFLOW_MOCK_COM = $script:PreviousMockCom
}

Describe "Close-CanonicalAccess waits for the owned Access to exit before killing it (#1918)" {
    BeforeEach {
        $script:Calls = [System.Collections.Generic.List[string]]::new()
        $access = [pscustomobject]@{}
        $access | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value { }
        $access | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($opt) $script:Calls.Add("Quit") }
        $script:Session = [pscustomobject]@{
            AccessApplication          = $access
            OwnedPid                   = 4242
            PidAttributed              = $true
            OriginalAutomationSecurity = $null
        }
        $script:Kill = { param([int]$AccessPid) $script:Calls.Add("Kill:$AccessPid"); $true }
    }

    It "does not kill an Access that exits on its own after Quit, and reports it gone" {
        $wait = { param([int]$AccessPid, [int]$TimeoutMs) $script:Calls.Add("Wait:$AccessPid"); $true }

        $result = Close-CanonicalAccess -Session $script:Session -KillPidAction $script:Kill -ExitWaitAction $wait

        $script:Calls | Should -Be @("Quit", "Wait:4242")
        $result.OwnedPidKilled | Should -BeTrue
    }

    It "kills the owned Access through the existing path when it outlives the wait" {
        $wait = { param([int]$AccessPid, [int]$TimeoutMs) $script:Calls.Add("Wait:$AccessPid"); $false }

        $result = Close-CanonicalAccess -Session $script:Session -KillPidAction $script:Kill -ExitWaitAction $wait

        $script:Calls | Should -Be @("Quit", "Wait:4242", "Kill:4242")
        $result.OwnedPidKilled | Should -BeTrue
    }

    It "bounds the wait" {
        $script:WaitBudget = $null
        $wait = { param([int]$AccessPid, [int]$TimeoutMs) $script:WaitBudget = $TimeoutMs; $false }

        Close-CanonicalAccess -Session $script:Session -KillPidAction $script:Kill -ExitWaitAction $wait | Out-Null

        $script:WaitBudget | Should -BeGreaterThan 0
        $script:WaitBudget | Should -BeLessOrEqual 5000
    }

    It "neither waits nor kills when no PID was attributed" {
        $script:Session.OwnedPid = $null
        $script:Session.PidAttributed = $false
        $wait = { param([int]$AccessPid, [int]$TimeoutMs) $script:Calls.Add("Wait"); $true }

        $result = Close-CanonicalAccess -Session $script:Session -KillPidAction $script:Kill -ExitWaitAction $wait 2>$null

        $script:Calls | Should -Be @("Quit")
        $result.OwnedPidKilled | Should -BeFalse
        $result.UnattributedKilled | Should -BeFalse
    }
}

Describe "Wait-AccessPidExit treats only a live MSACCESS as the owned Access (#1918)" {
    It "reports exited when the PID is gone" {
        Wait-AccessPidExit -AccessPid 4242 -TimeoutMs 300 -ProcessLookup { param([int]$AccessPid) $null } | Should -BeTrue
    }

    It "reports exited when the PID now belongs to another program" {
        $other = [pscustomobject]@{ ProcessName = "notepad" }
        Wait-AccessPidExit -AccessPid 4242 -TimeoutMs 300 -ProcessLookup { param([int]$AccessPid) $other } | Should -BeTrue
    }

    It "reports still alive when MSACCESS holds the PID for the whole wait" {
        $access = [pscustomobject]@{ ProcessName = "MSACCESS" }
        Wait-AccessPidExit -AccessPid 4242 -TimeoutMs 300 -ProcessLookup { param([int]$AccessPid) $access } | Should -BeFalse
    }

    It "reports exited as soon as MSACCESS goes away during the wait" {
        $script:Lookups = 0
        $lookup = {
            param([int]$AccessPid)
            $script:Lookups++
            if ($script:Lookups -lt 3) { [pscustomobject]@{ ProcessName = "MSACCESS" } } else { $null }
        }
        Wait-AccessPidExit -AccessPid 4242 -TimeoutMs 5000 -ProcessLookup $lookup | Should -BeTrue
        $script:Lookups | Should -Be 3
    }
}
