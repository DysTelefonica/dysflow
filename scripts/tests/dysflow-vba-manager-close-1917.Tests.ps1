#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1917 (P2, caller side): the vba-manager's top-level close decides the operation's
    single DYSFLOW_RESULT line from the operation outcome and the Quit outcome.
      - an operation that already failed keeps ITS error, with the close failure appended;
      - a successful operation whose Quit failed with the edit NOT saved ends as
        ACCESS_QUIT_FAILED_EDIT_NOT_SAVED;
      - a successful operation whose Quit failed with 0x800706BA after the edit was saved
        still succeeds.
.NOTES
    Pure PowerShell. Loads the manager's close functions from the script AST (loader only) and
    the shared COM module; Quit is a test double that throws a COMException. No Access is
    started and no process is killed.
#>

BeforeAll {
    $script:VbaManagerPath   = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    $script:SharedModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"

    . (Resolve-Path $script:SharedModulePath).Path

    $managerAst = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
    foreach ($fnName in @('Write-DysflowResult', 'Close-AccessDatabase', 'Complete-AccessSessionClose')) {
        $fnAst = $managerAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $fnName },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "$fnName not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    # 0x800706BA and 0x80004005 (E_FAIL) as the signed Int32 a COM failure surfaces.
    $script:RpcUnavailable = -2147023174
    $script:GenericFailure = -2147467259

    function New-ManagerSession {
        param($QuitHResult, [bool]$EditSaved)
        $access = [pscustomobject]@{ AutomationSecurity = 1; QuitHResult = $QuitHResult }
        $access | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value { }
        $access | Add-Member -MemberType ScriptMethod -Name Quit -Value {
            param($opt)
            if ($null -ne $this.QuitHResult) {
                throw [System.Runtime.InteropServices.COMException]::new("The RPC server is unavailable.", [int]$this.QuitHResult)
            }
        }
        $canonical = [pscustomobject]@{
            AccessApplication          = $access
            OwnedPid                   = 4242
            PidAttributed              = $true
            OriginalAutomationSecurity = 1
            EditSaved                  = $EditSaved
        }
        return [pscustomobject]@{
            AccessApplication = $access
            Vbe               = $null
            VbProject         = $null
            OriginalBypass    = $null
            StartupInfo       = $null
            ProcessId         = 4242
            CanonicalSession  = $canonical
        }
    }

    # Runs "operation emits its result, then the top-level close runs" and returns the
    # DYSFLOW_RESULT lines written to stdout plus the exit code the close decided.
    function Invoke-OperationThenClose {
        param($OperationResult, $Session)
        $writer = [System.IO.StringWriter]::new()
        $previous = [Console]::Out
        [Console]::SetOut($writer)
        try {
            $script:DeferDysflowResult = $true
            $script:PendingDysflowResult = $null
            Write-DysflowResult -Result $OperationResult -Depth 6
            $exitCode = Complete-AccessSessionClose -Session $Session -AccessPath "C:\data\front.accdb" -Password "" `
                -KillPidAction { param([int]$AccessPid) $true } -LockFileAction { param([string]$LockPath) $false }
        } finally {
            [Console]::SetOut($previous)
        }
        $lines = @($writer.ToString() -split "\r?\n" | Where-Object { $_.StartsWith("DYSFLOW_RESULT ") })
        return [pscustomobject]@{
            Lines    = $lines
            Payloads = @($lines | ForEach-Object { $_.Substring("DYSFLOW_RESULT ".Length) | ConvertFrom-Json })
            ExitCode = $exitCode
        }
    }
}

Describe "vba-manager top-level close outcome (#1917)" {
    BeforeEach {
        function script:Write-Status { param([string]$Message, $Color) }
        function script:Close-TargetAccessDbIfOpen { param([string]$AccessPath) }
        function script:Restore-AllowBypassKey { param([string]$AccessPath, [string]$Password, $OriginalState) }
        function script:Restore-StartupFeatures { param([string]$AccessPath, [string]$Password, $RestoreInfo) }
        function script:Get-AccessLockFilePath { param([string]$AccessPath) return $null }
    }

    AfterEach {
        $script:DeferDysflowResult = $false
        $script:PendingDysflowResult = $null
    }

    It "Close-AccessDatabase returns the close result, reporting the Quit failure" {
        $session = New-ManagerSession -QuitHResult $script:RpcUnavailable -EditSaved $false

        $result = Close-AccessDatabase -Session $session -AccessPath "C:\data\front.accdb" -Password "" `
            -KillPidAction { param([int]$AccessPid) $true } -LockFileAction { param([string]$LockPath) $false }

        $result.QuitFailed | Should -BeTrue
        $result.QuitErrorCode | Should -Be "0x800706BA"
    }

    It "keeps the ORIGINAL error of a failed operation, with the close failure appended" {
        $session = New-ManagerSession -QuitHResult $script:RpcUnavailable -EditSaved $false
        $failed = [ordered]@{ ok = $false; error = [ordered]@{ code = "VBA_MANAGER_FAILED"; message = "SaveAsText failed for Form_Main" } }

        $run = Invoke-OperationThenClose -OperationResult $failed -Session $session

        $run.Lines.Count | Should -Be 1
        $run.Payloads[0].ok | Should -BeFalse
        $run.Payloads[0].error.code | Should -Be "VBA_MANAGER_FAILED"
        $run.Payloads[0].error.message | Should -Match "^SaveAsText failed for Form_Main"
        $run.Payloads[0].error.message | Should -Match "0x800706BA"
    }

    It "fails a successful operation as ACCESS_QUIT_FAILED_EDIT_NOT_SAVED when Quit failed and the edit was not saved" {
        $session = New-ManagerSession -QuitHResult $script:RpcUnavailable -EditSaved $false
        $succeeded = [ordered]@{ ok = $true; data = [ordered]@{ imported = @("ModA") } }

        $run = Invoke-OperationThenClose -OperationResult $succeeded -Session $session

        $run.Lines.Count | Should -Be 1
        $run.Payloads[0].ok | Should -BeFalse
        $run.Payloads[0].error.code | Should -Be "ACCESS_QUIT_FAILED_EDIT_NOT_SAVED"
        $run.Payloads[0].error.message | Should -Match "0x800706BA"
        $run.ExitCode | Should -Be 1
    }

    It "fails a successful operation as ACCESS_QUIT_FAILED_EDIT_NOT_SAVED when Quit failed with another HRESULT after a save" {
        $session = New-ManagerSession -QuitHResult $script:GenericFailure -EditSaved $true
        $succeeded = [ordered]@{ ok = $true; data = [ordered]@{ imported = @("ModA") } }

        $run = Invoke-OperationThenClose -OperationResult $succeeded -Session $session

        $run.Payloads[0].ok | Should -BeFalse
        $run.Payloads[0].error.code | Should -Be "ACCESS_QUIT_FAILED_EDIT_NOT_SAVED"
        $run.Payloads[0].error.message | Should -Match "0x80004005"
    }

    It "keeps a successful operation successful when Quit failed with 0x800706BA after the edit was saved" {
        $session = New-ManagerSession -QuitHResult $script:RpcUnavailable -EditSaved $true
        $succeeded = [ordered]@{ ok = $true; data = [ordered]@{ imported = @("ModA") } }

        $run = Invoke-OperationThenClose -OperationResult $succeeded -Session $session

        $run.Lines.Count | Should -Be 1
        $run.Payloads[0].ok | Should -BeTrue
        $run.Payloads[0].data.imported | Should -Be @("ModA")
        $run.ExitCode | Should -BeNullOrEmpty
    }

    It "emits a successful operation unchanged when Quit succeeds" {
        $session = New-ManagerSession -QuitHResult $null -EditSaved $false
        $succeeded = [ordered]@{ ok = $true; data = [ordered]@{ exported = 3 } }

        $run = Invoke-OperationThenClose -OperationResult $succeeded -Session $session

        $run.Lines.Count | Should -Be 1
        $run.Payloads[0].ok | Should -BeTrue
        $run.Payloads[0].data.exported | Should -Be 3
        $run.ExitCode | Should -BeNullOrEmpty
    }
}
