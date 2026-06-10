#Requires -Modules Pester
#Requires -Version 5.1
<#
.SYNOPSIS
    Pester tests for Set-DysflowThreadCulture in scripts/lib/dysflow-access-com.ps1.

.DESCRIPTION
    Microsoft Access / DAO / COM is locale-sensitive (SQL date literals, decimal
    and list separators). The runner pins the executing thread's CurrentCulture
    to a deterministic culture so behaviour is independent of the Windows
    regional settings. CurrentUICulture is deliberately left untouched so
    COM/Access error messages remain in the OS UI language (the E2E suite asserts
    on Spanish error text).

.NOTES
    Run with: pwsh -Command "Invoke-Pester scripts/tests/ -CI"
#>

Describe "Set-DysflowThreadCulture" {
    BeforeAll {
        $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
        . $script:ModulePath
    }

    BeforeEach {
        $script:originalCulture = [System.Threading.Thread]::CurrentThread.CurrentCulture
        $script:originalUICulture = [System.Threading.Thread]::CurrentThread.CurrentUICulture
        # Start from a non-en-US culture so a passing test must prove the change.
        [System.Threading.Thread]::CurrentThread.CurrentCulture =
            [System.Globalization.CultureInfo]::GetCultureInfo('es-ES')
    }

    AfterEach {
        [System.Threading.Thread]::CurrentThread.CurrentCulture = $script:originalCulture
        [System.Threading.Thread]::CurrentThread.CurrentUICulture = $script:originalUICulture
    }

    It "pins CurrentCulture to en-US by default" {
        Set-DysflowThreadCulture | Out-Null
        [System.Threading.Thread]::CurrentThread.CurrentCulture.Name | Should -Be 'en-US'
    }

    It "leaves CurrentUICulture untouched so Access/COM messages keep the OS language" {
        $uiBefore = [System.Threading.Thread]::CurrentThread.CurrentUICulture.Name
        Set-DysflowThreadCulture | Out-Null
        [System.Threading.Thread]::CurrentThread.CurrentUICulture.Name | Should -Be $uiBefore
    }

    It "applies an explicit -Culture argument" {
        Set-DysflowThreadCulture -Culture 'en-GB' | Out-Null
        [System.Threading.Thread]::CurrentThread.CurrentCulture.Name | Should -Be 'en-GB'
    }

    It "yields a deterministic '.' decimal separator regardless of the prior locale" {
        Set-DysflowThreadCulture | Out-Null
        (1.5).ToString([System.Threading.Thread]::CurrentThread.CurrentCulture) | Should -Be '1.5'
    }
}
