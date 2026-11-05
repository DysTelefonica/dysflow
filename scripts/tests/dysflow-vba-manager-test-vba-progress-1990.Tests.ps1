#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1990: Run-Tests publishes per-test progress to its operation marker while the batch
    runs, so the TS side can show it in list_access_operations and send MCP progress.
      - before the first test the marker reports completed 0 and the first test as current;
      - after each test it reports completed/total, passed/failed so far, the test running now
        and a compact result for every finished test;
      - every progress write keeps the Access PID an earlier write recorded.
.NOTES
    Pure PowerShell. Loads Invoke-RunTestsAction, the real batch loop and the marker writer
    from the script AST; Open-AccessDatabase, the sandbox helpers and Invoke-AccessProcedure
    are test doubles. No Access is started and no process is killed.
#>

BeforeAll {
    $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
    foreach ($fnName in @('Invoke-RunTestsAction', 'Invoke-AccessProcedureBatch',
                          'Write-DysflowOperationMarker', 'New-TestRunProgress')) {
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $fnName },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "$fnName not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    function Write-Status { param([string]$Message, $Color) }
    function Write-DysflowResult { param($Result, $Depth) }
    function Get-TestSandboxPath { param([string]$AccessPath) return $script:SandboxPath }
    function Remove-TestSandbox { param([string]$SandboxPath) }
    function Invoke-TestSandboxCompile {
        param($AccessApplication, [string]$SandboxPath, [string]$AccessPath)
        return [pscustomobject]@{ ok = $true }
    }
    function Open-AccessDatabase {
        param($AccessPath, $Password, [switch]$AllowStartupExecution)
        # The open records the owned PID the way Open-CanonicalAccess's OwnedPidAction does.
        Write-DysflowOperationMarker -Status "running" -AccessPid $script:OwnPid
        return [pscustomobject]@{
            AccessApplication = [pscustomobject]@{ Id = "app" }
            VbProject = [pscustomobject]@{ Id = "vbe" }
        }
    }
    function Invoke-AccessProcedure {
        param($AccessApplication, $VbProject, [string]$ProcedureName, $ProcedureArgs)
        # Snapshot what a reader sees while this test runs.
        $script:MarkersSeen += , (Get-Content -LiteralPath $script:OperationFile -Raw | ConvertFrom-Json)
        $ok = $ProcedureName -ne "Test_Two"
        return [pscustomobject]@{
            ok = $ok
            procedure = $ProcedureName
            returnValue = $ok
            error = if ($ok) { $null } else { "assertion failed" }
        }
    }
}

Describe "Run-Tests per-test progress in the operation marker (#1990)" {
    BeforeEach {
        $script:Root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1990-progress-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($script:Root) | Out-Null
        # Script-level parameters Write-DysflowOperationMarker reads.
        $script:OperationFile = Join-Path $script:Root "markers\op.json"
        $script:OperationId = "dysflow-test-op"
        $script:Action = "Run-Tests"
        $script:AccessPath = Join-Path $script:Root "front.accdb"
        $script:DestinationRoot = $script:Root
        $script:SandboxPath = Join-Path $script:Root "sandbox.accdb"
        $script:DysflowMarkerAccessPid = $null
        $script:DysflowMarkerProcessStartTime = $null
        $script:DysflowMarkerProgress = $null
        $script:MarkersSeen = @()
        # The test process's own PID: a live process whose start time can be read.
        $script:OwnPid = $PID
    }

    AfterEach {
        if (Test-Path -LiteralPath $script:Root) { [System.IO.Directory]::Delete($script:Root, $true) }
    }

    It "reports completed/total, pass/fail counts and the current test after each test" {
        $session = $null
        Invoke-RunTestsAction -Session ([ref]$session) -AccessPath $script:AccessPath -Json `
            -ProceduresJson '[{"procedure":"Test_One"},{"procedure":"Test_Two"},{"procedure":"Test_Three"}]'

        $final = Get-Content -LiteralPath $script:OperationFile -Raw | ConvertFrom-Json
        $seen = @($script:MarkersSeen) + , $final

        @($seen | ForEach-Object { $_.progress.completed }) | Should -Be @(0, 1, 2, 3)
        @($seen | ForEach-Object { $_.progress.total }) | Should -Be @(3, 3, 3, 3)
        @($seen | ForEach-Object { $_.progress.passed }) | Should -Be @(0, 1, 1, 2)
        @($seen | ForEach-Object { $_.progress.failed }) | Should -Be @(0, 0, 1, 1)
        @($seen[0..2] | ForEach-Object { $_.progress.currentTest }) | Should -Be @("Test_One", "Test_Two", "Test_Three")
        $final.progress.currentTest | Should -BeNullOrEmpty

        @($final.progress.results | ForEach-Object { $_.procedure }) | Should -Be @("Test_One", "Test_Two", "Test_Three")
        @($final.progress.results | ForEach-Object { $_.ok }) | Should -Be @($true, $false, $true)
        $final.progress.results[1].error | Should -Be "assertion failed"
        $final.progress.results[0].PSObject.Properties.Name | Should -Contain "durationMs"
    }

    It "keeps the Access PID recorded at open on every progress write" {
        $session = $null
        Invoke-RunTestsAction -Session ([ref]$session) -AccessPath $script:AccessPath -Json `
            -ProceduresJson '[{"procedure":"Test_One"},{"procedure":"Test_Three"}]'

        $final = Get-Content -LiteralPath $script:OperationFile -Raw | ConvertFrom-Json
        foreach ($marker in @($script:MarkersSeen) + , $final) {
            $marker.accessPid | Should -Be $script:OwnPid
            $marker.processStartTime | Should -Not -BeNullOrEmpty
            $marker.status | Should -Be "running"
        }
    }
}
