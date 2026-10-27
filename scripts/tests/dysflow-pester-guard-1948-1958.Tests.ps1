#Requires -Modules Pester
#Requires -Version 5.1
<#
.SYNOPSIS
    Offline Pester guard (#1948, #1958): an offline Pester run can never create a
    real Access.Application nor terminate a real process.

.DESCRIPTION
    The production seams in scripts/lib/dysflow-access-com.ps1 refuse a real side
    effect while the guard is active (Pester loaded, or DYSFLOW_PESTER_GUARD=1) and
    fail loudly with DYSFLOW_PESTER_GUARD. Overrides and mocks keep working: the kill
    guard only refuses when the command that would run is the REAL cmdlet.

    Every test here keeps a safety net in place, so it never launches Access or kills
    anything even against the unguarded library: New-Object is mocked, and the only
    PID that can reach a real Stop-Process/taskkill is 7777 — not a multiple of 4, so
    it can never be a live Windows PID.

    See scripts/tests/README.md for the override-scoping rule.
#>

BeforeAll {
    . (Resolve-Path (Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1")).Path
    # The library loads the mock only when DYSFLOW_MOCK_COM is set at dot-source time.
    . (Resolve-Path (Join-Path $PSScriptRoot ".." "lib" "dysflow-mock-com.ps1")).Path

    $script:SavedMockCom = $env:DYSFLOW_MOCK_COM
    $script:SavedAllowReal = $env:DYSFLOW_PESTER_ALLOW_REAL_ACCESS
    $script:SavedGuard = $env:DYSFLOW_PESTER_GUARD
}

AfterAll {
    $env:DYSFLOW_MOCK_COM = $script:SavedMockCom
    $env:DYSFLOW_PESTER_ALLOW_REAL_ACCESS = $script:SavedAllowReal
    $env:DYSFLOW_PESTER_GUARD = $script:SavedGuard
}

Describe "Pester guard — real Access.Application creation (#1948)" {
    BeforeEach {
        $env:DYSFLOW_MOCK_COM = $null
        $env:DYSFLOW_PESTER_ALLOW_REAL_ACCESS = $null
    }

    It "refuses the default spawn seam instead of creating Access.Application" {
        # Safety net: a recorder stands in for COM creation, so nothing real starts
        # even if the guard is missing.
        Mock New-Object {
            [pscustomobject]@{ AutomationSecurity = 3; UserControl = $true; Visible = $true; hWndAccessApp = 0 }
        }

        { Open-CanonicalAccess -DbPath "C:\guard\never.accdb" -OpenDatabase:$false `
            -WmiSnapshotAction { @() } -HwndToPidAction { 0 } -WarningAction SilentlyContinue } |
            Should -Throw -ExpectedMessage "*DYSFLOW_PESTER_GUARD*Access.Application*"

        Should -Invoke New-Object -Times 0 -Exactly
    }

    It "keeps the DYSFLOW_MOCK_COM spawn path working" {
        $env:DYSFLOW_MOCK_COM = '1'
        Mock New-Object { throw "New-Object must not run on the mock path" } -ParameterFilter { $ComObject }

        $session = Open-CanonicalAccess -DbPath "C:\guard\mock.accdb" -OpenDatabase:$false `
            -WmiSnapshotAction { @() } -HwndToPidAction { 0 }

        $session.AccessApplication | Should -Not -BeNullOrEmpty
    }
}

Describe "Pester guard — real process termination (#1958)" {
    BeforeEach {
        $env:DYSFLOW_PESTER_ALLOW_REAL_ACCESS = $null
    }

    It "refuses a real Stop-Process on a PID" {
        { Stop-AccessPidAndWait -AccessPid 7777 -TimeoutMs 0 -WarningAction SilentlyContinue } |
            Should -Throw -ExpectedMessage "*DYSFLOW_PESTER_GUARD*Stop-Process*7777*"
    }

    It "refuses the real taskkill last resort when only Stop-Process/Get-Process are stubbed" {
        Mock Stop-Process {}
        Mock Get-Process { [pscustomobject]@{ Id = 7777 } }

        { Stop-AccessPidAndWait -AccessPid 7777 -TimeoutMs 0 -WarningAction SilentlyContinue } |
            Should -Throw -ExpectedMessage "*DYSFLOW_PESTER_GUARD*taskkill*7777*"
    }

    It "lets stubbed kills through" {
        Mock Stop-Process {}
        Mock Get-Process { [pscustomobject]@{ Id = 7777 } }
        Mock Start-Process {}

        Stop-AccessPidAndWait -AccessPid 7777 -TimeoutMs 0 | Should -Be $false
        Should -Invoke Start-Process -Times 1 -Exactly -ParameterFilter {
            $FilePath -eq 'taskkill' -and $ArgumentList -contains '/PID' -and $ArgumentList -contains 7777
        }
    }
}

Describe "Pester guard — activation" {
    AfterEach {
        $env:DYSFLOW_PESTER_ALLOW_REAL_ACCESS = $null
    }

    It "is active inside a Pester run" {
        Test-DysflowPesterGuardActive | Should -BeTrue
    }

    It "is disabled by the explicit real-Access opt-in" {
        $env:DYSFLOW_PESTER_ALLOW_REAL_ACCESS = '1'
        Test-DysflowPesterGuardActive | Should -BeFalse
    }
}
