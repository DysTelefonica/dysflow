#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1911: test_vba compiles its temporary sandbox copy before it runs any test.
      - Application.Run compiles on demand, and a compile error opens a modal VBE dialog the
        COM call never returns from; compiling first (RunCommand 126 + IsCompiled) turns that
        hang into a typed VBA_COMPILE_ERROR, and no test is run;
      - the compile only ever targets the sandbox copy: a guard refuses any path that is not a
        dysflow-test-sandbox-* copy under the temp directory, equals the user's accessPath, or is
        not the database Access has open;
      - no other action compiles.
.NOTES
    Pure PowerShell. Loads the manager's run/close functions from the script AST and the shared
    COM module; Open-AccessDatabase, the test batch, the DAO restores and the ROT close are test
    doubles defined in the same scope the loaded functions resolve from. The Access application
    is a fake object. No Access is started and no process is killed.
#>

BeforeAll {
    $script:PreviousMockCom = $env:DYSFLOW_MOCK_COM
    $env:DYSFLOW_MOCK_COM = '1'

    $script:VbaManagerPath   = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    $script:SharedModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"

    . (Resolve-Path $script:SharedModulePath).Path

    $script:ManagerAst = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
    foreach ($fnName in @('Write-DysflowResult', 'Close-AccessDatabase', 'Complete-AccessSessionClose',
                          'Invoke-RunTestsAction', 'Get-TestSandboxPath', 'Remove-TestSandbox',
                          'Assert-TestSandboxCompileTarget', 'Invoke-TestSandboxCompile')) {
        $fnAst = $script:ManagerAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $fnName },
            $true
        ) | Select-Object -First 1
        if ($fnAst) { Invoke-Expression $fnAst.Extent.Text }
    }

    # Doubles are defined here, after the shared module was dot-sourced, so they replace
    # the real open, ROT close and DAO restores in the scope the loaded functions resolve from.
    function Write-Status { param([string]$Message, $Color) }
    function Open-AccessDatabase {
        param($AccessPath, $Password, [switch]$AllowStartupExecution)
        $script:Observed.OpenedPath = $AccessPath
        $projectPath = if ($script:FakeProjectPath) { $script:FakeProjectPath } else { $AccessPath }
        return New-FakeAccessSession -OwnedPid 4242 -ProjectPath $projectPath
    }
    function Invoke-AccessProcedureBatch {
        param($AccessApplication, $VbProject, [object[]]$Procedures)
        $script:Observed.BatchCalls++
        return , @([pscustomobject]@{ ok = $true; procedure = "Test_Foo"; returnValue = 1 })
    }
    function Close-TargetAccessDbIfOpen { param([string]$AccessPath) }
    function Restore-AllowBypassKey { param([string]$AccessPath, [string]$Password, $OriginalState) }
    function Restore-StartupFeatures { param([string]$AccessPath, [string]$Password, $RestoreInfo) }

    # A fake Access.Application: RunCommand records each command; the compile outcome is
    # scripted through $script:Compile (IsCompiled before the compile, after it, and whether
    # RunCommand throws).
    function New-FakeAccessApplication {
        param([string]$ProjectPath)
        $access = [pscustomobject]@{
            AutomationSecurity = 1
            IsCompiled         = [bool]$script:Compile.InitiallyCompiled
            CurrentProject     = [pscustomobject]@{ FullName = $ProjectPath }
            VBE                = [pscustomobject]@{
                SelectedVBComponent = [pscustomobject]@{ Name = "modBroken" }
                ActiveVBProject     = [pscustomobject]@{ VBComponents = @(
                    [pscustomobject]@{ Name = "modBroken"; Type = 1; CodeModule = [pscustomobject]@{ CountOfLines = 10 } }
                    [pscustomobject]@{ Name = "Form_frmMain"; Type = 100; CodeModule = [pscustomobject]@{ CountOfLines = [int]$script:Compile.DocumentCodeLines } }
                ) }
            }
        }
        $access | Add-Member -MemberType ScriptMethod -Name RunCommand -Value {
            param($command)
            $script:Observed.RunCommands += [int]$command
            if ($script:Compile.Throws) { throw "Compile error in hidden module: modBroken" }
            if ([int]$command -eq 126) { $this.IsCompiled = [bool]$script:Compile.CompilesTo }
        }
        $access | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value { }
        $access | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($opt) }
        return $access
    }

    function New-FakeAccessSession {
        param($OwnedPid, [string]$ProjectPath)
        $access = New-FakeAccessApplication -ProjectPath $ProjectPath
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
    # try/finally does, and returns the emitted DYSFLOW_RESULT payload.
    function Invoke-RunTestsThenClose {
        param([string]$SourcePath)
        $session = $null
        $writer = [System.IO.StringWriter]::new()
        $previous = [Console]::Out
        [Console]::SetOut($writer)
        $runError = $null
        try {
            $script:DeferDysflowResult = $true
            $script:PendingDysflowResult = $null
            $script:HasDysflowResultEmitted = $false
            try {
                Invoke-RunTestsAction -Session ([ref]$session) -ProceduresJson '[{"procedure":"Test_Foo"}]' -AccessPath $SourcePath -Json
            } catch {
                $runError = $_
            } finally {
                $null = Complete-AccessSessionClose -Session $session -AccessPath $SourcePath -Password "" `
                    -KillPidAction { param([int]$AccessPid) $script:Observed.KilledPids += $AccessPid; $true } `
                    -LockFileAction { param([string]$LockPath) $false }
            }
        } finally {
            [Console]::SetOut($previous)
        }
        $line = @($writer.ToString() -split "`r?`n" | Where-Object { $_ -like 'DYSFLOW_RESULT *' }) | Select-Object -Last 1
        $payload = if ($line) { $line.Substring('DYSFLOW_RESULT '.Length) | ConvertFrom-Json } else { $null }
        return [pscustomobject]@{ Error = $runError; Payload = $payload }
    }

    function New-ObservedState {
        return [pscustomobject]@{
            OpenedPath  = $null
            RunCommands = @()
            BatchCalls  = 0
            KilledPids  = @()
        }
    }
}

AfterAll {
    $env:DYSFLOW_MOCK_COM = $script:PreviousMockCom
    $script:DeferDysflowResult = $false
    $script:PendingDysflowResult = $null
}

Describe "test_vba compiles the sandbox copy before running tests (#1911)" {
    BeforeEach {
        $script:Root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1911c-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($script:Root) | Out-Null
        $script:SourcePath = Join-Path $script:Root "front.accdb"
        [System.IO.File]::WriteAllBytes($script:SourcePath, [byte[]](1, 2, 3, 4, 5))
        $script:SourceHash = (Get-FileHash -LiteralPath $script:SourcePath -Algorithm SHA256).Hash
        $script:Observed = New-ObservedState
        $script:FakeProjectPath = $null
        $script:Compile = [pscustomobject]@{ InitiallyCompiled = $false; CompilesTo = $true; Throws = $false; DocumentCodeLines = 0 }
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

    It "returns VBA_COMPILE_ERROR without running a test when the sandbox does not compile, and still closes Access" {
        $script:Compile.CompilesTo = $false

        $run = Invoke-RunTestsThenClose -SourcePath $script:SourcePath

        $run.Error | Should -Not -BeNullOrEmpty
        $run.Payload.ok | Should -BeFalse
        $run.Payload.error.code | Should -Be "VBA_COMPILE_ERROR"
        $run.Payload.component | Should -Be "modBroken"
        $script:Observed.BatchCalls | Should -Be 0
        $script:Observed.RunCommands | Should -Not -BeNullOrEmpty
        $script:Observed.RunCommands | ForEach-Object { $_ | Should -Be 126 }
        $script:Observed.KilledPids | Should -Be @(4242)
        Test-Path -LiteralPath (Split-Path -Parent $script:Observed.OpenedPath) | Should -BeFalse
        (Get-FileHash -LiteralPath $script:SourcePath -Algorithm SHA256).Hash | Should -Be $script:SourceHash
    }

    It "runs the tests with a warning instead of failing when only document modules can explain the uncompiled state" {
        # Access cannot bring form/report code-behind to IsCompiled headless (#543/#547): an
        # uncompiled copy with document-module code is not proof of a compile error.
        $script:Compile.CompilesTo = $false
        $script:Compile.DocumentCodeLines = 12

        $run = Invoke-RunTestsThenClose -SourcePath $script:SourcePath

        $run.Error | Should -BeNullOrEmpty
        $script:Observed.BatchCalls | Should -Be 1
        $run.Payload.tests[0].procedure | Should -Be "Test_Foo"
        $script:Observed.KilledPids | Should -Be @(4242)
    }

    It "returns VBA_COMPILE_ERROR when the compile command itself throws" {
        $script:Compile.Throws = $true

        $run = Invoke-RunTestsThenClose -SourcePath $script:SourcePath

        $run.Payload.error.code | Should -Be "VBA_COMPILE_ERROR"
        $run.Payload.error.message | Should -BeLike "*modBroken*"
        $script:Observed.BatchCalls | Should -Be 0
        $script:Observed.KilledPids | Should -Be @(4242)
    }

    It "compiles an uncompiled sandbox and then runs the tests as before" {
        $run = Invoke-RunTestsThenClose -SourcePath $script:SourcePath

        $run.Error | Should -BeNullOrEmpty
        $script:Observed.RunCommands | Should -Be @(126)
        $script:Observed.BatchCalls | Should -Be 1
        @($run.Payload.tests).Count | Should -Be 1
        $run.Payload.tests[0].procedure | Should -Be "Test_Foo"
    }

    It "does not recompile a sandbox that is already compiled" {
        $script:Compile.InitiallyCompiled = $true

        $run = Invoke-RunTestsThenClose -SourcePath $script:SourcePath

        $run.Error | Should -BeNullOrEmpty
        $script:Observed.RunCommands.Count | Should -Be 0
        $script:Observed.BatchCalls | Should -Be 1
    }

    It "refuses to compile and runs no test when Access has the user's binary open instead of the copy" {
        $script:FakeProjectPath = $script:SourcePath

        $run = Invoke-RunTestsThenClose -SourcePath $script:SourcePath

        $run.Error | Should -Not -BeNullOrEmpty
        $script:Observed.RunCommands.Count | Should -Be 0
        $script:Observed.BatchCalls | Should -Be 0
        $script:Observed.KilledPids | Should -Be @(4242)
    }
}

Describe "Assert-TestSandboxCompileTarget refuses anything but a test_vba sandbox copy (#1911)" {
    BeforeEach {
        $script:Root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1911g-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($script:Root) | Out-Null
        $script:SourcePath = Join-Path $script:Root "front.accdb"
        [System.IO.File]::WriteAllBytes($script:SourcePath, [byte[]](1, 2, 3))
        $script:Sandbox = Get-TestSandboxPath -AccessPath $script:SourcePath
        $script:Observed = New-ObservedState
        $script:Compile = [pscustomobject]@{ InitiallyCompiled = $false; CompilesTo = $true; Throws = $false; DocumentCodeLines = 0 }
    }

    AfterEach {
        Remove-TestSandbox -SandboxPath $script:Sandbox
        if (Test-Path -LiteralPath $script:Root) { [System.IO.Directory]::Delete($script:Root, $true) }
    }

    It "accepts the copy Get-TestSandboxPath made" {
        { Assert-TestSandboxCompileTarget -SandboxPath $script:Sandbox -AccessPath $script:SourcePath -OpenProjectPath $script:Sandbox } |
            Should -Not -Throw
    }

    It "refuses the user's accessPath" {
        { Assert-TestSandboxCompileTarget -SandboxPath $script:SourcePath -AccessPath $script:SourcePath -OpenProjectPath $script:SourcePath } |
            Should -Throw "*Refusing to compile*"
    }

    It "refuses a sandbox path that resolves to the user's accessPath" {
        $sameFile = Join-Path $script:Root "." "front.accdb"
        { Assert-TestSandboxCompileTarget -SandboxPath $sameFile -AccessPath $script:SourcePath.ToUpperInvariant() -OpenProjectPath $sameFile } |
            Should -Throw "*Refusing to compile*"
    }

    It "refuses a copy outside a dysflow-test-sandbox-* directory under the temp root" {
        $notSandbox = Join-Path $script:Root "front-sandbox.accdb"
        { Assert-TestSandboxCompileTarget -SandboxPath $notSandbox -AccessPath $script:SourcePath -OpenProjectPath $notSandbox } |
            Should -Throw "*Refusing to compile*"
    }

    It "refuses a dysflow-test-sandbox-* directory that is not directly under the temp root" {
        $nested = Join-Path $script:Root ("dysflow-test-sandbox-" + [guid]::NewGuid().ToString("N")) "front-sandbox.accdb"
        { Assert-TestSandboxCompileTarget -SandboxPath $nested -AccessPath $script:SourcePath -OpenProjectPath $nested } |
            Should -Throw "*Refusing to compile*"
    }

    It "refuses when Access has another database open than the sandbox copy" {
        { Assert-TestSandboxCompileTarget -SandboxPath $script:Sandbox -AccessPath $script:SourcePath -OpenProjectPath $script:SourcePath } |
            Should -Throw "*Refusing to compile*"
    }

    It "refuses when the open database cannot be read" {
        { Assert-TestSandboxCompileTarget -SandboxPath $script:Sandbox -AccessPath $script:SourcePath -OpenProjectPath "" } |
            Should -Throw "*Refusing to compile*"
    }

    It "Invoke-TestSandboxCompile never sends the compile command when the target is the user's binary" {
        $app = New-FakeAccessApplication -ProjectPath $script:SourcePath

        { Invoke-TestSandboxCompile -AccessApplication $app -SandboxPath $script:SourcePath -AccessPath $script:SourcePath } |
            Should -Throw "*Refusing to compile*"
        { Invoke-TestSandboxCompile -AccessApplication $app -SandboxPath $script:Sandbox -AccessPath $script:SourcePath } |
            Should -Throw "*Refusing to compile*"
        $script:Observed.RunCommands.Count | Should -Be 0
    }
}

Describe "Only test_vba compiles, and only through the sandbox guard (#1911)" {
    BeforeAll {
        $script:ScriptFiles = @((Resolve-Path $script:VbaManagerPath).Path) +
            @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot ".." "lib") -File -Include "*.ps1", "*.psm1" -Recurse |
                ForEach-Object { $_.FullName })

        function Get-EnclosingFunctionName {
            param($Node)
            $cursor = $Node.Parent
            while ($cursor) {
                if ($cursor -is [System.Management.Automation.Language.FunctionDefinitionAst]) { return $cursor.Name }
                $cursor = $cursor.Parent
            }
            return '<script>'
        }

        # Every member access that compiles (RunCommand with 126) or reads the compile
        # state (IsCompiled), across the manager and every PowerShell library it loads.
        $script:CompileSites = foreach ($file in $script:ScriptFiles) {
            $ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$null, [ref]$null)
            $ast.FindAll({
                param($n)
                if ($n -isnot [System.Management.Automation.Language.MemberExpressionAst]) { return $false }
                $member = [string]$n.Member.Extent.Text
                if ($member -eq 'IsCompiled') { return $true }
                if ($member -ne 'RunCommand' -or $n -isnot [System.Management.Automation.Language.InvokeMemberExpressionAst]) { return $false }
                return @($n.Arguments | Where-Object { $_.Extent.Text -eq '126' }).Count -gt 0
            }, $true) | ForEach-Object {
                [pscustomobject]@{ File = (Split-Path -Leaf $file); Function = (Get-EnclosingFunctionName -Node $_); Text = $_.Extent.Text }
            }
        }

        $script:SandboxCompileCallers = foreach ($file in $script:ScriptFiles) {
            $ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$null, [ref]$null)
            $ast.FindAll({
                param($n)
                $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-TestSandboxCompile'
            }, $true) | ForEach-Object { Get-EnclosingFunctionName -Node $_ }
        }
    }

    It "sends the compile command and reads IsCompiled only inside Invoke-TestSandboxCompile" {
        $script:CompileSites | Should -Not -BeNullOrEmpty
        $offenders = @($script:CompileSites | Where-Object { $_.Function -ne 'Invoke-TestSandboxCompile' } |
            ForEach-Object { "$($_.File):$($_.Function): $($_.Text)" })
        $offenders | Should -BeNullOrEmpty
    }

    It "is called only by the Run-Tests action" {
        @($script:SandboxCompileCallers) | Should -Be @('Invoke-RunTestsAction')
    }

    It "guards the target before it compiles" {
        $fn = $script:ManagerAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Invoke-TestSandboxCompile' },
            $true) | Select-Object -First 1
        $guard = $fn.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Assert-TestSandboxCompileTarget' }, $true) |
            Select-Object -First 1
        $firstCompile = $fn.FindAll({ param($n) $n -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Member.Extent.Text -eq 'RunCommand' }, $true) |
            Select-Object -First 1
        $guard | Should -Not -BeNullOrEmpty
        $guard.Extent.StartOffset | Should -BeLessThan $firstCompile.Extent.StartOffset
    }

    It "leaves run_vba, import and export without a compile" {
        foreach ($action in @('Invoke-RunProcedureAction', 'Invoke-ImportAction', 'Invoke-ExportAction')) {
            $fn = $script:ManagerAst.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $action },
                $true) | Select-Object -First 1
            $fn | Should -Not -BeNullOrEmpty -Because "$action exists"
            $fn.Extent.Text | Should -Not -Match 'Invoke-TestSandboxCompile|RunCommand\(\s*126\s*\)|IsCompiled' -Because "$action must not compile"
        }
    }
}
