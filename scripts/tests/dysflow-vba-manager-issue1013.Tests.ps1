#Requires -Modules Pester
<#
.SYNOPSIS
    Pester tests for issue #1013 — test_vba sandbox sync to current binary.

.NOTES
    Issue: [Bug] test_vba runner uses a sandbox with helper code different from
    the current binary. Hypothesis is stale helper/module cache in the sandbox
    setup. Fix must make each test_vba sandbox load helper code from the current
    binary at the moment the test run is prepared; do not use stale cache.

    Pure-PowerShell helper tests run in any environment (no Access required).
    The sandbox copy is created on disk and asserted by hash equality.
#>

# Helper to stub/mock Write-DysflowResult for functions extracted via AST
function global:Write-DysflowResult {
    param(
        [Parameter(Mandatory = $true)] [object] $Result,
        [Parameter(Mandatory = $false)] [int] $Depth = 20
    )
    $json = ($Result | ConvertTo-Json -Compress -Depth $Depth) -replace "[\r\n]+"," "
    if ($null -ne $script:HostMessages) {
        $script:HostMessages.Add("DYSFLOW_RESULT " + $json)
    }
    Write-Output $json
}

Describe "dysflow-vba-manager.ps1 — script structure (issue #1013)" {
    BeforeAll {
        $script:ScriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    }

    Context "File presence and parseability" {
        It "script file exists" {
            Test-Path $script:ScriptPath | Should -Be $true
        }

        It "script parses without syntax errors" {
            $errors = $null
            $null = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $script:ScriptPath).Path,
                [ref]$null,
                [ref]$errors
            )
            $errors | Should -BeNullOrEmpty
        }
    }

    Context "Get-TestSandboxPath is exported as a top-level helper" {
        It "script defines Get-TestSandboxPath" {
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $script:ScriptPath).Path, [ref]$null, [ref]$null
            )
            $matches = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'Get-TestSandboxPath' },
                $true
            )
            $matches.Count | Should -BeGreaterOrEqual 1
        }
    }
}

Describe "Get-TestSandboxPath — pure helper (issue #1013 RED)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Get-TestSandboxPath' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) {
            throw "Get-TestSandboxPath not found in $($script:VbaManagerPath) — RED: sandbox helper missing."
        }
        Invoke-Expression $fnAst.Extent.Text
    }

    BeforeEach {
        $script:SandboxRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
            "vba-mgr-i1013-" + [guid]::NewGuid().ToString("N")
        )
        [System.IO.Directory]::CreateDirectory($script:SandboxRoot) | Out-Null

        # Build a source fixture .accdb stub (binary content is irrelevant; the
        # helper just needs to copy bytes verbatim and prove the copy is fresh).
        $script:SourcePath = Join-Path $script:SandboxRoot "source.accdb"
        $bytes = [byte[]](0..511 | ForEach-Object { [byte]($_ % 251) })
        [System.IO.File]::WriteAllBytes($script:SourcePath, $bytes)
    }

    AfterEach {
        if (Test-Path -LiteralPath $script:SandboxRoot) {
            [System.IO.Directory]::Delete($script:SandboxRoot, $true)
        }
    }

    It "RED: returns a path that points inside the temp directory and differs from the source" {
        $sandboxPath = Get-TestSandboxPath -AccessPath $script:SourcePath -TempRoot ([System.IO.Path]::GetTempPath())
        $sandboxPath | Should -Not -BeNullOrEmpty
        $sandboxPath | Should -Not -Be $script:SourcePath
        $sandboxFull = [System.IO.Path]::GetFullPath($sandboxPath)
        $tempFull = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
        $sandboxFull.StartsWith($tempFull, [System.StringComparison]::OrdinalIgnoreCase) | Should -Be $true
    }

    It "RED: creates the sandbox copy on disk at the returned path with byte-exact content" {
        $sandboxPath = Get-TestSandboxPath -AccessPath $script:SourcePath -TempRoot ([System.IO.Path]::GetTempPath())
        Test-Path -LiteralPath $sandboxPath | Should -Be $true
        $sourceHash = (Get-FileHash -LiteralPath $script:SourcePath -Algorithm SHA256).Hash
        $sandboxHash = (Get-FileHash -LiteralPath $sandboxPath -Algorithm SHA256).Hash
        $sandboxHash | Should -Be $sourceHash
    }

    It "RED: each call returns a distinct path so concurrent runs do not collide" {
        $first = Get-TestSandboxPath -AccessPath $script:SourcePath -TempRoot ([System.IO.Path]::GetTempPath())
        $second = Get-TestSandboxPath -AccessPath $script:SourcePath -TempRoot ([System.IO.Path]::GetTempPath())
        $first | Should -Not -Be $second
    }

    It "RED: the sandbox copy is a fresh snapshot — overwriting the source after copy does not change the sandbox bytes" {
        $sandboxPath = Get-TestSandboxPath -AccessPath $script:SourcePath -TempRoot ([System.IO.Path]::GetTempPath())
        $originalHash = (Get-FileHash -LiteralPath $sandboxPath -Algorithm SHA256).Hash
        # Overwrite the source with new bytes AFTER the sandbox copy.
        [System.IO.File]::WriteAllBytes($script:SourcePath, [byte[]](0..127 | ForEach-Object { [byte]42 }))
        $afterHash = (Get-FileHash -LiteralPath $sandboxPath -Algorithm SHA256).Hash
        $afterHash | Should -Be $originalHash
    }

    It "RED: throws when the source .accdb does not exist" {
        $missing = Join-Path $script:SandboxRoot "does-not-exist.accdb"
        { Get-TestSandboxPath -AccessPath $missing -TempRoot ([System.IO.Path]::GetTempPath()) } |
            Should -Throw "*does-not-exist*"
    }

    It "RED: throws when the source path is empty" {
        { Get-TestSandboxPath -AccessPath "" -TempRoot ([System.IO.Path]::GetTempPath()) } |
            Should -Throw "*AccessPath*"
    }
}

Describe "Remove-TestSandbox — pure helper (issue #1013 RED)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Remove-TestSandbox' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) {
            throw "Remove-TestSandbox not found in $($script:VbaManagerPath) — RED: cleanup helper missing."
        }
        Invoke-Expression $fnAst.Extent.Text
    }

    It "RED: deletes the file at the sandbox path and is a no-op for missing paths" {
        $root = Join-Path ([System.IO.Path]::GetTempPath()) ("vba-mgr-i1013-rm-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($root) | Out-Null
        try {
            $sandbox = Join-Path $root "sandbox.accdb"
            [System.IO.File]::WriteAllBytes($sandbox, [byte[]](1, 2, 3))
            Test-Path -LiteralPath $sandbox | Should -Be $true

            Remove-TestSandbox -SandboxPath $sandbox
            Test-Path -LiteralPath $sandbox | Should -Be $false

            # No-op for missing path.
            Remove-TestSandbox -SandboxPath $sandbox
            Remove-TestSandbox -SandboxPath ""
        } finally {
            if (Test-Path -LiteralPath $root) {
                [System.IO.Directory]::Delete($root, $true)
            }
        }
    }
}

Describe "Invoke-RunTestsAction — sandbox integration (issue #1013 RED)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-RunTestsAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) {
            throw "Invoke-RunTestsAction not found in $($script:VbaManagerPath)"
        }
        Invoke-Expression $fnAst.Extent.Text
    }

    BeforeEach {
        $script:BatchCalled = $false
        $script:OpenCalled = $false
        $script:BatchResult = @()
        $script:OpenArgs = $null
        $script:GetSandboxCalls = @()
        $script:RemoveSandboxCalls = @()
        $script:BatchProcedures = @()

        $script:SandboxRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
            "vba-mgr-i1013-rt-" + [guid]::NewGuid().ToString("N")
        )
        [System.IO.Directory]::CreateDirectory($script:SandboxRoot) | Out-Null
        $script:SourcePath = Join-Path $script:SandboxRoot "source.accdb"
        [System.IO.File]::WriteAllBytes($script:SourcePath, [byte[]](1, 2, 3, 4, 5))
        $script:SandboxPath = Join-Path $script:SandboxRoot "sandbox.accdb"

        function script:Open-AccessDatabase {
            param($AccessPath, $Password, $AllowStartupExecution)
            $script:OpenCalled = $true
            $script:OpenArgs = $AccessPath
            return [pscustomobject]@{
                AccessApplication = [pscustomobject]@{ Id = "app" }
                VbProject = [pscustomobject]@{ Id = "vbe" }
            }
        }

        function script:Invoke-AccessProcedureBatch {
            param($AccessApplication, $VbProject, [object[]]$Procedures)
            $script:BatchCalled = $true
            $script:BatchProcedures = @($Procedures)
            return , @($script:BatchResult)
        }

        function script:Get-TestSandboxPath {
            param([string]$AccessPath, [string]$TempRoot)
            $script:GetSandboxCalls += [pscustomobject]@{
                AccessPath = $AccessPath
                TempRoot = $TempRoot
            }
            return $script:SandboxPath
        }

        function script:Remove-TestSandbox {
            param([string]$SandboxPath)
            $script:RemoveSandboxCalls += [pscustomobject]@{ SandboxPath = $SandboxPath }
        }
    }

    AfterEach {
        if (Test-Path -LiteralPath $script:SandboxRoot) {
            [System.IO.Directory]::Delete($script:SandboxRoot, $true)
        }
    }

    It "RED: opens the sandbox path produced by Get-TestSandboxPath, not the source" {
        $tmpJson = [System.IO.Path]::GetTempFileName()
        try {
            '[{"procedure":"Test_Foo"}]' | Set-Content -Path $tmpJson -Encoding UTF8 -NoNewline
            $script:BatchResult = @(
                [pscustomobject]@{ ok = $true; procedure = "Test_Foo"; returnValue = 1 }
            )
            $session = $null

            $result = Invoke-RunTestsAction -Session ([ref]$session) -ProceduresJson "" -ProceduresJsonFile $tmpJson -AccessPath $script:SourcePath -Json
            $null = $result | ConvertFrom-Json

            $script:OpenArgs | Should -Be $script:SandboxPath
            $script:OpenArgs | Should -Not -Be $script:SourcePath
            $script:GetSandboxCalls.Count | Should -Be 1
            $script:GetSandboxCalls[0].AccessPath | Should -Be $script:SourcePath
        } finally {
            if (Test-Path $tmpJson) { Remove-Item -Path $tmpJson -Force }
        }
    }

    It "RED: removes the sandbox after the batch runs (happy path)" {
        $tmpJson = [System.IO.Path]::GetTempFileName()
        try {
            '[{"procedure":"Test_Foo"}]' | Set-Content -Path $tmpJson -Encoding UTF8 -NoNewline
            $script:BatchResult = @(
                [pscustomobject]@{ ok = $true; procedure = "Test_Foo"; returnValue = 1 }
            )
            $session = $null

            $null = Invoke-RunTestsAction -Session ([ref]$session) -ProceduresJson "" -ProceduresJsonFile $tmpJson -AccessPath $script:SourcePath -Json

            $script:RemoveSandboxCalls.Count | Should -BeGreaterOrEqual 1
            $script:RemoveSandboxCalls[-1].SandboxPath | Should -Be $script:SandboxPath
        } finally {
            if (Test-Path $tmpJson) { Remove-Item -Path $tmpJson -Force }
        }
    }

    It "RED: removes the sandbox even when the batch runner throws" {
        $tmpJson = [System.IO.Path]::GetTempFileName()
        try {
            '[{"procedure":"Test_Foo"}]' | Set-Content -Path $tmpJson -Encoding UTF8 -NoNewline
            function script:Invoke-AccessProcedureBatch {
                param($AccessApplication, $VbProject, [object[]]$Procedures)
                throw "Batch boom"
            }
            $session = $null

            { Invoke-RunTestsAction -Session ([ref]$session) -ProceduresJson "" -ProceduresJsonFile $tmpJson -AccessPath $script:SourcePath -Json } |
                Should -Throw "Batch boom"

            $script:RemoveSandboxCalls.Count | Should -BeGreaterOrEqual 1
            $script:RemoveSandboxCalls[-1].SandboxPath | Should -Be $script:SandboxPath
        } finally {
            if (Test-Path $tmpJson) { Remove-Item -Path $tmpJson -Force }
        }
    }

    It "RED: never creates or removes a sandbox when procedures are missing (early-return path)" {
        $session = $null
        { Invoke-RunTestsAction -Session ([ref]$session) -ProceduresJson "" -ProceduresJsonFile "" -AccessPath $script:SourcePath } |
            Should -Throw "*Run-Tests requiere*"

        $script:GetSandboxCalls.Count | Should -Be 0
        $script:RemoveSandboxCalls.Count | Should -Be 0
        $script:OpenCalled | Should -Be $false
    }
}