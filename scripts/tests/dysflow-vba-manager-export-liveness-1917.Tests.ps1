#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1917 (P3): an export whose Access process died fails fast with ACCESS_SESSION_DIED
    instead of hanging until the PowerShell timeout (VBA_MANAGER_TIMEOUT).
.NOTES
    Pure PowerShell. Loads Invoke-ExportAction from the manager AST (loader only) and the shared
    COM module. The VBProject is a test double; the per-module export is stubbed at its I/O
    boundary. Liveness uses REAL process ids: the test's own process (alive) and a short-lived
    child that already exited (gone). No Access is started and no process is killed.
#>

BeforeAll {
    $script:VbaManagerPath   = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    $script:SharedModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"

    . (Resolve-Path $script:SharedModulePath).Path

    $managerAst = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
    foreach ($fnName in @('Write-DysflowResult', 'Invoke-ExportAction')) {
        $fnAst = $managerAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $fnName },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "$fnName not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    # A process id that is guaranteed gone: a child that already exited.
    $child = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "exit" -PassThru -WindowStyle Hidden
    $child.WaitForExit()
    $script:GonePid  = $child.Id
    $script:AlivePid = $PID

    $script:RpcUnavailable = -2147023174

    function New-ExportSession {
        param([int]$AccessPid)
        $components = [pscustomobject]@{ Count = 1 }
        $components | Add-Member -MemberType ScriptMethod -Name Item -Value {
            param($key)
            [pscustomobject]@{ Name = [string]$key; Type = 1 }
        }
        $vbProject = [pscustomobject]@{ VBComponents = $components }
        $access = [pscustomobject]@{}
        $access | Add-Member -MemberType ScriptMethod -Name CurrentDb -Value { $null }
        return [pscustomobject]@{
            AccessApplication = $access
            VbProject         = $vbProject
            ProcessId         = $AccessPid
            CanonicalSession  = [pscustomobject]@{ OwnedPid = $AccessPid; PidAttributed = $true }
        }
    }

    # Runs the export and returns what it reported on stdout, what it threw, and which
    # modules reached the per-module export.
    function Invoke-ExportCapture {
        param($Session)
        $writer = [System.IO.StringWriter]::new()
        $previous = [Console]::Out
        [Console]::SetOut($writer)
        $thrown = $null
        try {
            Invoke-ExportAction -Session $Session -NormalizedModules @("ModA") -ModulesPath $TestDrive -Json
        } catch {
            $thrown = $_
        } finally {
            [Console]::SetOut($previous)
        }
        $lines = @($writer.ToString() -split "\r?\n" | Where-Object { $_.StartsWith("DYSFLOW_RESULT ") })
        return [pscustomobject]@{
            Payloads = @($lines | ForEach-Object { $_.Substring("DYSFLOW_RESULT ".Length) | ConvertFrom-Json })
            Thrown   = $thrown
        }
    }
}

Describe "Invoke-ExportAction fails fast when the session's Access died (#1917)" {
    BeforeEach {
        $script:ExportedModules = [System.Collections.Generic.List[string]]::new()
        $script:ExportFailure = $null
        $script:DeferDysflowResult = $false
        $script:PendingDysflowResult = $null
        $script:ExportVerbose = $false

        function script:Write-Status { param([string]$Message, $Color) }
        function script:Write-ExportManifest { param($Records, $Root) }
        function script:Resolve-AccessObjectInfo { param($AccessApplication, $ModuleName) [pscustomobject]@{ Exists = $false } }
        function script:Export-VbaModule {
            param($VbProject, $ModuleName, $ModulesPath, $AccessApplication, $AccessObjectName, $VbComponentName)
            if ($null -ne $script:ExportFailure) { throw $script:ExportFailure }
            $script:ExportedModules.Add($ModuleName)
        }
    }

    It "fails with ACCESS_SESSION_DIED and never reaches the per-module export when the Access PID is gone" {
        $run = Invoke-ExportCapture -Session (New-ExportSession -AccessPid $script:GonePid)

        $script:ExportedModules.Count | Should -Be 0
        $run.Thrown | Should -Not -BeNullOrEmpty
        $run.Payloads.Count | Should -Be 1
        $run.Payloads[0].ok | Should -BeFalse
        $run.Payloads[0].error.code | Should -Be "ACCESS_SESSION_DIED"
        $run.Payloads[0].error.message | Should -Match ([string]$script:GonePid)
    }

    It "proceeds with the export when the Access PID is alive" {
        $run = Invoke-ExportCapture -Session (New-ExportSession -AccessPid $script:AlivePid)

        $run.Thrown | Should -BeNullOrEmpty
        $script:ExportedModules | Should -Be @("ModA")
        $run.Payloads.Count | Should -Be 1
        $run.Payloads[0].ok | Should -BeTrue
        @($run.Payloads[0].exported) | Should -Be @("ModA")
    }

    It "reports a 0x800706BA COM failure inside the export as ACCESS_SESSION_DIED, not as a per-module warning" {
        $script:ExportFailure = [System.Runtime.InteropServices.COMException]::new("The RPC server is unavailable.", $script:RpcUnavailable)

        $run = Invoke-ExportCapture -Session (New-ExportSession -AccessPid $script:AlivePid)

        $run.Thrown | Should -Not -BeNullOrEmpty
        $run.Payloads.Count | Should -Be 1
        $run.Payloads[0].ok | Should -BeFalse
        $run.Payloads[0].error.code | Should -Be "ACCESS_SESSION_DIED"
    }
}
