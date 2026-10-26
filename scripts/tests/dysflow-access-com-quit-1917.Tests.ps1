#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1917 (P2): Close-CanonicalAccess reports a failed Quit instead of swallowing it, and
    tolerates 0x800706BA (RPC_S_SERVER_UNAVAILABLE) ONLY when the session's edit was saved.
.NOTES
    Pure PowerShell. Drives the function through its own injectable seams; no Access is started
    and no process is killed.
#>

BeforeAll {
    $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
    . (Resolve-Path $script:ModulePath).Path

    # 0x800706BA and 0x80004005 (E_FAIL) as the signed Int32 a COM failure surfaces.
    $script:RpcUnavailable = -2147023174
    $script:GenericFailure = -2147467259

    function New-QuitFailingSession {
        param([int]$HResult, [string]$Message, $EditSaved)
        $access = [pscustomobject]@{ HResult = $HResult; Message = $Message }
        $access | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value { }
        $access | Add-Member -MemberType ScriptMethod -Name Quit -Value {
            param($opt)
            throw [System.Runtime.InteropServices.COMException]::new($this.Message, $this.HResult)
        }
        $session = [pscustomobject]@{
            AccessApplication          = $access
            OwnedPid                   = 4242
            PidAttributed              = $true
            OriginalAutomationSecurity = $null
        }
        if ($null -ne $EditSaved) {
            $session | Add-Member -MemberType NoteProperty -Name EditSaved -Value ([bool]$EditSaved)
        }
        return $session
    }

    $script:NoKill = { param([int]$AccessPid) $true }
}

Describe "Close-CanonicalAccess Quit failure reporting (#1917)" {
    It "tolerates a 0x800706BA Quit failure when the edit was saved, and still reports it" {
        $session = New-QuitFailingSession -HResult $script:RpcUnavailable -Message "RPC server unavailable" -EditSaved $true

        $result = Close-CanonicalAccess -Session $session -KillPidAction $script:NoKill

        $result.QuitFailed | Should -BeTrue
        $result.QuitErrorCode | Should -Be "0x800706BA"
        $result.QuitErrorMessage | Should -Match "RPC server unavailable"
        $result.QuitFailureTolerated | Should -BeTrue
    }

    It "does not tolerate a 0x800706BA Quit failure when the edit was not saved" {
        $session = New-QuitFailingSession -HResult $script:RpcUnavailable -Message "RPC server unavailable" -EditSaved $false

        $result = Close-CanonicalAccess -Session $session -KillPidAction $script:NoKill

        $result.QuitFailed | Should -BeTrue
        $result.QuitErrorCode | Should -Be "0x800706BA"
        $result.QuitFailureTolerated | Should -BeFalse
    }

    It "treats a session without EditSaved as not saved" {
        $session = New-QuitFailingSession -HResult $script:RpcUnavailable -Message "RPC server unavailable" -EditSaved $null

        $result = Close-CanonicalAccess -Session $session -KillPidAction $script:NoKill

        $result.QuitFailed | Should -BeTrue
        $result.QuitFailureTolerated | Should -BeFalse
    }

    It "reports a Quit failure with another HRESULT even when the edit was saved" {
        $session = New-QuitFailingSession -HResult $script:GenericFailure -Message "Unspecified error" -EditSaved $true

        $result = Close-CanonicalAccess -Session $session -KillPidAction $script:NoKill

        $result.QuitFailed | Should -BeTrue
        $result.QuitErrorCode | Should -Be "0x80004005"
        $result.QuitFailureTolerated | Should -BeFalse
    }

    It "never throws for a Quit failure, and still finishes the teardown of the owned PID" {
        $session = New-QuitFailingSession -HResult $script:GenericFailure -Message "Unspecified error" -EditSaved $false

        { $script:Result = Close-CanonicalAccess -Session $session -KillPidAction $script:NoKill } | Should -Not -Throw

        $script:Result.OwnedPidKilled | Should -BeTrue
        $script:Result.UnattributedKilled | Should -BeFalse
    }

    It "reports no Quit failure when Quit succeeds" {
        $access = [pscustomobject]@{}
        $access | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value { }
        $access | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($opt) }
        $session = [pscustomobject]@{ AccessApplication = $access; OwnedPid = 4242; PidAttributed = $true; OriginalAutomationSecurity = $null }

        $result = Close-CanonicalAccess -Session $session -KillPidAction $script:NoKill

        $result.QuitFailed | Should -BeFalse
        $result.QuitErrorCode | Should -BeNullOrEmpty
    }
}
