#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1911: test_vba opens a SANDBOX copy of the configured .accdb, so the run's close
    must target that copy, never the source, and the copy must be removed only after Access
    released it.
      - the ROT close, the lock check and the AllowBypassKey / startup restore all target the
        sandbox path; the source .accdb is never touched by the close;
      - the sandbox file still exists while Access is being closed and is gone once the run's
        close finished, on the pass path and on the failure path;
      - Remove-TestSandbox also removes the lock file Access leaves next to the copy, so the
        per-call temp directory does not leak.
.NOTES
    Pure PowerShell. Loads the manager's run/close functions from the script AST and the shared
    COM module; Open-AccessDatabase, the DAO restores and the ROT close are test doubles that
    record the path they receive. No Access is started and no process is killed.
#>

BeforeAll {
    $script:VbaManagerPath   = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    $script:SharedModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"

    . (Resolve-Path $script:SharedModulePath).Path

    $managerAst = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
    foreach ($fnName in @('Write-DysflowResult', 'Close-AccessDatabase', 'Complete-AccessSessionClose',
                          'Invoke-RunTestsAction', 'Get-TestSandboxPath', 'Remove-TestSandbox')) {
        $fnAst = $managerAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $fnName },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "$fnName not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    # Doubles are defined here, after the shared module was dot-sourced, so they replace
    # the real ROT close and DAO restores in the scope the loaded functions resolve from.
    function Write-Status { param([string]$Message, $Color) }
    function Open-AccessDatabase {
        param($AccessPath, $Password, [switch]$AllowStartupExecution)
        $script:Observed.OpenedPath = $AccessPath
        if ($script:OpenThrows) { throw "OpenCurrentDatabase failed" }
        return New-FakeAccessSession -OwnedPid $script:FakeOwnedPid
    }
    function Invoke-AccessProcedureBatch {
        param($AccessApplication, $VbProject, [object[]]$Procedures)
        if ($script:BatchThrows) { throw "assertion failed in Test_Foo" }
        return , @([pscustomobject]@{ ok = $true; procedure = "Test_Foo"; returnValue = 1 })
    }
    function Close-TargetAccessDbIfOpen {
        param([string]$AccessPath)
        $script:Observed.RotClosePaths += $AccessPath
    }
    function Restore-AllowBypassKey {
        param([string]$AccessPath, [string]$Password, $OriginalState)
        $script:Observed.RestoredBypassPaths += $AccessPath
    }
    function Restore-StartupFeatures {
        param([string]$AccessPath, [string]$Password, $RestoreInfo)
        $script:Observed.RestoredStartupPaths += $AccessPath
    }
    # The sandbox compile is pinned by dysflow-vba-manager-test-vba-compile-1911; here it succeeds.
    function Invoke-TestSandboxCompile {
        param($AccessApplication, [string]$SandboxPath, [string]$AccessPath)
        return [pscustomobject]@{ ok = $true }
    }

    function New-FakeAccessSession {
        param($OwnedPid)
        $access = [pscustomobject]@{ AutomationSecurity = 1 }
        $access | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value { }
        $access | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($opt) }
        $canonical = [pscustomobject]@{
            AccessApplication          = $access
            OwnedPid                   = $OwnedPid
            PidAttributed              = ($null -ne $OwnedPid)
            OriginalAutomationSecurity = 1
            EditSaved                  = $false
        }
        return [pscustomobject]@{
            AccessApplication = $access
            Vbe               = $null
            VbProject         = [pscustomobject]@{ Id = "vbp" }
            OriginalBypass    = [pscustomobject]@{ Exists = $true; Value = $false }
            StartupInfo       = [pscustomobject]@{ RenamedAutoExec = $false }
            ProcessId         = $OwnedPid
            CanonicalSession  = $canonical
        }
    }

    # Runs Run-Tests followed by the script's top-level close, the way the manager's
    # try/finally does, and returns what the doubles observed.
    function Invoke-RunTestsThenClose {
        param([string]$SourcePath, $OwnedPid, [switch]$BatchThrows)
        $script:BatchThrows = [bool]$BatchThrows
        $script:FakeOwnedPid = $OwnedPid
        $session = $null
        $writer = [System.IO.StringWriter]::new()
        $previous = [Console]::Out
        [Console]::SetOut($writer)
        $runError = $null
        try {
            $script:DeferDysflowResult = $true
            $script:PendingDysflowResult = $null
            try {
                Invoke-RunTestsAction -Session ([ref]$session) -ProceduresJson '[{"procedure":"Test_Foo"}]' -AccessPath $SourcePath -Json
            } catch {
                $runError = $_
            } finally {
                $null = Complete-AccessSessionClose -Session $session -AccessPath $SourcePath -Password "" `
                    -KillPidAction {
                        param([int]$AccessPid)
                        $script:Observed.KilledPids += $AccessPid
                        $script:Observed.SandboxExistedAtClose = (Test-Path -LiteralPath $script:Observed.OpenedPath)
                        $true
                    } `
                    -LockFileAction {
                        param([string]$LockPath)
                        $script:Observed.LockChecks += $LockPath
                        $script:Observed.SandboxExistedAtClose = (Test-Path -LiteralPath $script:Observed.OpenedPath)
                        $false
                    }
            }
        } finally {
            [Console]::SetOut($previous)
        }
        return [pscustomobject]@{ Error = $runError }
    }
}

Describe "test_vba close targets the sandbox copy (#1911)" {
    BeforeEach {
        $script:Root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1911-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($script:Root) | Out-Null
        $script:SourcePath = Join-Path $script:Root "front.accdb"
        [System.IO.File]::WriteAllBytes($script:SourcePath, [byte[]](1, 2, 3, 4, 5))
        $script:SourceHash = (Get-FileHash -LiteralPath $script:SourcePath -Algorithm SHA256).Hash

        $script:Observed = [pscustomobject]@{
            OpenedPath            = $null
            KilledPids            = @()
            LockChecks            = @()
            RotClosePaths         = @()
            RestoredBypassPaths   = @()
            RestoredStartupPaths  = @()
            SandboxExistedAtClose = $null
        }
        $script:OpenThrows = $false
    }

    AfterEach {
        $script:DeferDysflowResult = $false
        $script:PendingDysflowResult = $null
        if ($script:Observed.OpenedPath) {
            $dir = Split-Path -Parent $script:Observed.OpenedPath
            if ($dir -and (Test-Path -LiteralPath $dir)) { [System.IO.Directory]::Delete($dir, $true) }
        }
        if (Test-Path -LiteralPath $script:Root) { [System.IO.Directory]::Delete($script:Root, $true) }
    }

    It "restores AllowBypassKey and startup features on the sandbox copy, never on the source" {
        $null = Invoke-RunTestsThenClose -SourcePath $script:SourcePath -OwnedPid 4242

        $script:Observed.OpenedPath | Should -Not -Be $script:SourcePath
        $script:Observed.RestoredBypassPaths | Should -Be @($script:Observed.OpenedPath)
        $script:Observed.RestoredStartupPaths | Should -Be @($script:Observed.OpenedPath)
        (Get-FileHash -LiteralPath $script:SourcePath -Algorithm SHA256).Hash | Should -Be $script:SourceHash
    }

    It "closes an unattributed Access through the sandbox path (ROT close and lock check)" {
        $null = Invoke-RunTestsThenClose -SourcePath $script:SourcePath -OwnedPid $null

        $script:Observed.RotClosePaths.Count | Should -BeGreaterThan 0
        $script:Observed.RotClosePaths | Should -Not -Contain $script:SourcePath
        $script:Observed.RotClosePaths | ForEach-Object { $_ | Should -Be $script:Observed.OpenedPath }
        $expectedLock = [System.IO.Path]::ChangeExtension($script:Observed.OpenedPath, ".laccdb")
        $script:Observed.LockChecks | Should -Be @($expectedLock)
    }

    It "removes the sandbox only after Access was closed (pass path)" {
        $null = Invoke-RunTestsThenClose -SourcePath $script:SourcePath -OwnedPid 4242

        $script:Observed.KilledPids | Should -Be @(4242)
        $script:Observed.SandboxExistedAtClose | Should -BeTrue
        Test-Path -LiteralPath (Split-Path -Parent $script:Observed.OpenedPath) | Should -BeFalse
    }

    It "removes the sandbox only after Access was closed (assertion failure path)" {
        $run = Invoke-RunTestsThenClose -SourcePath $script:SourcePath -OwnedPid 4242 -BatchThrows

        $run.Error | Should -Not -BeNullOrEmpty
        $script:Observed.KilledPids | Should -Be @(4242)
        $script:Observed.SandboxExistedAtClose | Should -BeTrue
        $script:Observed.RestoredBypassPaths | Should -Be @($script:Observed.OpenedPath)
        Test-Path -LiteralPath (Split-Path -Parent $script:Observed.OpenedPath) | Should -BeFalse
    }

    It "removes the sandbox when Access never opened" {
        $script:OpenThrows = $true

        $run = Invoke-RunTestsThenClose -SourcePath $script:SourcePath -OwnedPid 4242

        $run.Error | Should -Not -BeNullOrEmpty
        $script:Observed.KilledPids.Count | Should -Be 0
        Test-Path -LiteralPath (Split-Path -Parent $script:Observed.OpenedPath) | Should -BeFalse
        Test-Path -LiteralPath $script:SourcePath | Should -BeTrue
    }
}

Describe "Remove-TestSandbox removes the lock file Access leaves next to the copy (#1911)" {
    It "deletes the sandbox, its .laccdb and the per-call directory" {
        $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-test-sandbox-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($dir) | Out-Null
        try {
            $sandbox = Join-Path $dir "front-sandbox.accdb"
            [System.IO.File]::WriteAllBytes($sandbox, [byte[]](1, 2, 3))
            [System.IO.File]::WriteAllBytes((Join-Path $dir "front-sandbox.laccdb"), [byte[]](0))

            Remove-TestSandbox -SandboxPath $sandbox

            Test-Path -LiteralPath $dir | Should -BeFalse
        } finally {
            if (Test-Path -LiteralPath $dir) { [System.IO.Directory]::Delete($dir, $true) }
        }
    }

    It "leaves unrelated files in the directory alone" {
        $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-test-sandbox-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($dir) | Out-Null
        try {
            $sandbox = Join-Path $dir "front-sandbox.accdb"
            [System.IO.File]::WriteAllBytes($sandbox, [byte[]](1, 2, 3))
            $other = Join-Path $dir "keep.txt"
            [System.IO.File]::WriteAllText($other, "x")

            Remove-TestSandbox -SandboxPath $sandbox

            Test-Path -LiteralPath $sandbox | Should -BeFalse
            Test-Path -LiteralPath $other | Should -BeTrue
        } finally {
            if (Test-Path -LiteralPath $dir) { [System.IO.Directory]::Delete($dir, $true) }
        }
    }
}
