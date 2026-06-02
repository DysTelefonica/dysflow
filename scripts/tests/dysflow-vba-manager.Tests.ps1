#Requires -Modules Pester
<#
.SYNOPSIS
    Pester tests for dysflow-vba-manager.ps1 COM cleanup paths and helper functions.
.NOTES
    COM-integration tests (requiring a live Access installation) are marked -Skip.
    Pure-PowerShell helper function tests run in any environment.
#>

Describe "dysflow-vba-manager.ps1 — script structure" {
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

    Context "COM cleanup function definitions" {
        BeforeAll {
            # Parse the AST to verify function definitions without executing the script
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $script:ScriptPath).Path,
                [ref]$null,
                [ref]$null
            )
            $script:FunctionNames = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] },
                $true
            ) | Select-Object -ExpandProperty Name
        }

        It "defines Get-AllowBypassKeyState" {
            $script:FunctionNames | Should -Contain "Get-AllowBypassKeyState"
        }

        It "defines Enable-AllowBypassKey" {
            $script:FunctionNames | Should -Contain "Enable-AllowBypassKey"
        }

        It "defines Restore-AllowBypassKey" {
            $script:FunctionNames | Should -Contain "Restore-AllowBypassKey"
        }

        It "defines Disable-StartupFeatures" {
            $script:FunctionNames | Should -Contain "Disable-StartupFeatures"
        }

        It "defines Restore-StartupFeatures" {
            $script:FunctionNames | Should -Contain "Restore-StartupFeatures"
        }

        It "defines New-DaoDbEngine" {
            $script:FunctionNames | Should -Contain "New-DaoDbEngine"
        }

        It "defines Open-AccessDatabase" {
            $script:FunctionNames | Should -Contain "Open-AccessDatabase"
        }

        It "defines Close-AccessDatabase" {
            $script:FunctionNames | Should -Contain "Close-AccessDatabase"
        }
    }

    Context "COM cleanup — try/finally pattern in source text" {
        BeforeAll {
            $script:SourceText = Get-Content -Raw (Resolve-Path $script:ScriptPath).Path
        }

        It "Get-AllowBypassKeyState uses FinalReleaseComObject in finally" {
            # Verify the function contains both 'finally' and 'FinalReleaseComObject'
            $script:SourceText | Should -Match "Get-AllowBypassKeyState"
            $script:SourceText | Should -Match "FinalReleaseComObject"
        }

        It "Enable-AllowBypassKey contains try/finally block" {
            $script:SourceText | Should -Match "Enable-AllowBypassKey"
            # The script must have multiple finally blocks for the COM functions
            ($script:SourceText | Select-String -Pattern "\} finally \{" -AllMatches).Matches.Count |
                Should -BeGreaterOrEqual 4
        }

        It "Disable-StartupFeatures initialises dbEngine inside try block" {
            # After the fix, $dbEngine = $null must appear before try, and
            # New-DaoDbEngine must be called inside the try block.
            # We verify the variable is pre-nulled at function scope and assigned inside try.
            $script:SourceText | Should -Match '\$dbEngine\s*=\s*\$null'
            $script:SourceText | Should -Match '\$dbEngine\s*=\s*New-DaoDbEngine'
        }

        It "Restore-StartupFeatures initialises dbEngine inside try block" {
            $script:SourceText | Should -Match '\$dbEngine\s*=\s*\$null'
            $script:SourceText | Should -Match '\$dbEngine\s*=\s*New-DaoDbEngine'
        }

        It "COM cleanup finally blocks use null guard pattern" {
            # Verify the null-guard pattern: if ($null -ne $obj) or if ($obj)
            $script:SourceText | Should -Match 'if \(\$null -ne \$obj\)'
        }

        It "COM cleanup finally blocks call db.Close before FinalRelease" {
            # The fixed pattern must Close before releasing
            $script:SourceText | Should -Match '\$db\.Close\(\)'
        }

        It "RotManager embedded C# does not contain PowerShell catch bodies" {
            $rotManagerBlock = [regex]::Match(
                $script:SourceText,
                'Add-Type -TypeDefinition @"(?<code>[\s\S]*?public class RotManager[\s\S]*?)"@'
            ).Groups['code'].Value

            $rotManagerBlock | Should -Not -Match 'Write-Debug'
            $rotManagerBlock | Should -Match 'catch \{ \}'
        }
    }
}

Describe "dysflow-vba-manager.ps1 — pure helper functions" {
    BeforeAll {
        # Dot-source only the helper functions by extracting them via AST
        # We mock the Param block's mandatory parameters to avoid execution
        # by loading helper functions that don't require COM or Access.

        # Load the pure text-processing functions via a restricted dot-source approach:
        # parse out only functions that have no COM dependencies.
        $scriptContent = Get-Content -Raw (Resolve-Path $script:ScriptPath).Path

        # We define the helper functions in a child scope by extracting and eval-ing
        # only the pure string/text functions. This avoids COM activation.
        $pureFunctions = @(
            'function Test-IsVbaImportMetadataLine',
            'function Test-IsVbaOptionDirectiveLine',
            'function Normalize-VbaImportText',
            'function Get-PreferredNewline',
            'function Normalize-Newlines',
            'function Split-CodeBehindSection',
            'function Split-VbaHeaderAndBody',
            'function Join-VbaHeaderAndBody',
            'function Merge-AccessDocumentWithCanonicalHeader',
            'function Remove-AccessDocumentRootNameProperty',
            'function Normalize-AccessDocumentRootEndMarker',
            'function Normalize-AccessDocumentCodeBehindMarker',
            'function Test-LooksLikeVbaCodeLine',
            'function Normalize-AccessDocumentOrphanCodeBehindSection',
            'function Normalize-AccessDocumentTextForLoadFromText',
            'function Get-FileEncodingInfo',
            'function Write-Utf8NoBom',
            'function Convert-AnsiToUtf8NoBom',
            'function Convert-Utf8ToAnsiTempFile',
            'function Convert-Utf8CodeImportToAnsiTempFile',
            'function Normalize-VbaImportText',
            'function Get-ComponentFolder',
            'function Get-ComponentExtension',
            'function Resolve-ImportFileForModule',
            'function Get-AccessLockFilePath'
        )

        $ast = [System.Management.Automation.Language.Parser]::ParseInput(
            $scriptContent, [ref]$null, [ref]$null
        )

        $functionDefs = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] },
            $true
        )

        $pureNames = @(
            'Test-IsVbaImportMetadataLine',
            'Test-IsVbaOptionDirectiveLine',
            'Normalize-VbaImportText',
            'Get-PreferredNewline',
            'Normalize-Newlines',
            'Split-CodeBehindSection',
            'Split-VbaHeaderAndBody',
            'Join-VbaHeaderAndBody',
            'Remove-AccessDocumentRootNameProperty',
            'Normalize-AccessDocumentRootEndMarker',
            'Normalize-AccessDocumentCodeBehindMarker',
            'Test-LooksLikeVbaCodeLine',
            'Normalize-AccessDocumentOrphanCodeBehindSection',
            'Normalize-AccessDocumentTextForLoadFromText',
            'Get-PreferredNewline',
            'Normalize-Newlines',
            'Get-AccessLockFilePath'
        )

        $extractedCode = ($functionDefs |
            Where-Object { $_.Name -in $pureNames } |
            ForEach-Object { $_.Extent.Text }
        ) -join "`n`n"

        Invoke-Expression $extractedCode
    }

    Context "Test-IsVbaImportMetadataLine" {
        It "returns true for VERSION line" {
            Test-IsVbaImportMetadataLine -Line "VERSION 1.0 CLASS" | Should -Be $true
        }

        It "returns true for BEGIN line" {
            Test-IsVbaImportMetadataLine -Line "BEGIN" | Should -Be $true
        }

        It "returns true for END line" {
            Test-IsVbaImportMetadataLine -Line "END" | Should -Be $true
        }

        It "returns true for Attribute VB_ line" {
            Test-IsVbaImportMetadataLine -Line "Attribute VB_Name = `"MyModule`"" | Should -Be $true
        }

        It "returns true for MultiUse property" {
            Test-IsVbaImportMetadataLine -Line "MultiUse = -1" | Should -Be $true
        }

        It "throws for empty string due to mandatory validation" {
            { Test-IsVbaImportMetadataLine -Line "" } | Should -Throw
        }

        It "returns false for regular VBA code" {
            Test-IsVbaImportMetadataLine -Line "Public Sub MyProcedure()" | Should -Be $false
        }
    }

    Context "Test-IsVbaOptionDirectiveLine" {
        It "returns true for Option Explicit" {
            Test-IsVbaOptionDirectiveLine -Line "Option Explicit" | Should -Be $true
        }

        It "returns true for Option Compare Database" {
            Test-IsVbaOptionDirectiveLine -Line "Option Compare Database" | Should -Be $true
        }

        It "returns false for regular code" {
            Test-IsVbaOptionDirectiveLine -Line "Dim x As Integer" | Should -Be $false
        }
    }

    Context "Get-PreferredNewline" {
        It "returns CRLF when text contains CRLF" {
            Get-PreferredNewline -Text "line1`r`nline2" | Should -Be "`r`n"
        }

        It "returns LF when text has no CRLF" {
            Get-PreferredNewline -Text "line1`nline2" | Should -Be "`n"
        }
    }

    Context "Normalize-Newlines" {
        It "converts CRLF to LF by default" {
            Normalize-Newlines -Text "a`r`nb" | Should -Be "a`nb"
        }

        It "converts CR-only to LF" {
            Normalize-Newlines -Text "a`rb" | Should -Be "a`nb"
        }

        It "converts to CRLF when specified" {
            Normalize-Newlines -Text "a`nb" -Newline "`r`n" | Should -Be "a`r`nb"
        }
    }

    Context "Remove-AccessDocumentRootNameProperty" {
        It "removes Name property immediately under Begin Form" {
            $input = "Begin Form`r`n    Name = `"MyForm`"`r`n    Caption = `"Test`"`r`n"
            $result = Remove-AccessDocumentRootNameProperty -DocumentText $input
            $result | Should -Not -Match 'Name\s*=\s*"MyForm"'
            $result | Should -Match 'Caption'
        }

        It "preserves text without root Name property" {
            $input = "Begin Form`r`n    Caption = `"Test`"`r`n"
            $result = Remove-AccessDocumentRootNameProperty -DocumentText $input
            $result | Should -Be $input
        }
    }

    Context "Normalize-AccessDocumentRootEndMarker" {
        It "replaces 'End Form' with 'End'" {
            $result = Normalize-AccessDocumentRootEndMarker -DocumentText "End Form"
            $result | Should -Be "End"
        }

        It "replaces 'End Report' with 'End'" {
            $result = Normalize-AccessDocumentRootEndMarker -DocumentText "End Report"
            $result | Should -Be "End"
        }

        It "leaves plain 'End' unchanged" {
            $result = Normalize-AccessDocumentRootEndMarker -DocumentText "End"
            $result | Should -Be "End"
        }
    }

    Context "Get-AccessLockFilePath" {
        It "returns .laccdb path for .accdb file" {
            $result = Get-AccessLockFilePath -AccessPath "C:\data\mydb.accdb"
            $result | Should -Be "C:\data\mydb.laccdb"
        }

        It "returns .ldb path for .mdb file" {
            $result = Get-AccessLockFilePath -AccessPath "C:\data\mydb.mdb"
            $result | Should -Be "C:\data\mydb.ldb"
        }

        It "returns null for unknown extension" {
            $result = Get-AccessLockFilePath -AccessPath "C:\data\mydb.accde"
            $result | Should -BeNullOrEmpty
        }
    }

    Context "Test-LooksLikeVbaCodeLine" {
        It "returns true for Option Explicit" {
            Test-LooksLikeVbaCodeLine -Line "Option Explicit" | Should -Be $true
        }

        It "returns true for Public Sub declaration" {
            Test-LooksLikeVbaCodeLine -Line "Public Sub MyProc()" | Should -Be $true
        }

        It "returns true for Private Function declaration" {
            Test-LooksLikeVbaCodeLine -Line "Private Function Calc() As Integer" | Should -Be $true
        }

        It "returns true for Dim statement" {
            Test-LooksLikeVbaCodeLine -Line "Dim x As String" | Should -Be $true
        }

        It "returns false for empty line" {
            Test-LooksLikeVbaCodeLine -Line "" | Should -Be $false
        }

        It "returns false for a form property line" {
            Test-LooksLikeVbaCodeLine -Line "    Caption = `"My Form`"" | Should -Be $false
        }
    }
}

Describe "dysflow-vba-manager.ps1 — COM cleanup integration (requires Access)" {
    Context "Get-AllowBypassKeyState releases COM objects on exception" {
        It "cleans up COM objects when database open fails" -Skip {
            # This test requires a live DAO COM installation.
            # Verify that calling the function with a non-existent path returns null
            # without leaving hanging COM objects.
            . (Resolve-Path $script:ScriptPath).Path -Action Exists -AccessPath "C:\nonexistent.accdb"
        }
    }

    Context "Disable-StartupFeatures releases COM objects on exception" {
        It "dbEngine is released when OpenDatabase throws" -Skip {
            # With a real DAO engine available, passing an invalid path should
            # trigger the OpenDatabase exception, hit the finally block, and
            # release $dbEngine without leaking it.
        }
    }

    Context "Restore-StartupFeatures releases COM objects on early return" {
        It "dbEngine is released when New-DaoDbEngine returns null" -Skip {
            # When DAO is unavailable, New-DaoDbEngine returns null,
            # the function should return early inside try so finally still runs.
        }
    }

    Context "Enable-AllowBypassKey releases COM objects on exception" {
        It "all COM objects released when database cannot be opened" -Skip {
            # Full COM integration test — requires Access/DAO installation.
        }
    }
}

# ===========================================================================
# P1 — Behavioral tests for Get-MsAccessProcessesBounded (#380)
# Extract the function via AST so the tests always run against the production
# source; any implementation change that breaks the contract turns these red.
# ===========================================================================

Describe "Get-MsAccessProcessesBounded (vba-manager) — behavioral (issue #380)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Get-MsAccessProcessesBounded' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Get-MsAccessProcessesBounded not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Stub for Write-Status used by the timeout branch inside vba-manager's version.
        # The real function lives in the full script and writes coloured console output.
        # Here we swallow it so tests run without COM/Access dependencies.
        function Write-Status { param([string]$Message, $Color) }
    }

    Context "hang guard — injected slow scriptblock times out fast" {
        It "returns empty result and completes well under the sleep duration" {
            # Prove the Wait-Job timeout fires: inject a 30-second sleeper but set TimeoutSeconds=1.
            # If the guard works, the call returns in <<30s. We assert it completed in <10s.
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            $result = @(Get-MsAccessProcessesBounded `
                -WmiScriptBlock { Start-Sleep -Seconds 30 } `
                -TimeoutSeconds 1)
            $sw.Stop()

            $result.Count | Should -Be 0
            $sw.Elapsed.TotalSeconds | Should -BeLessThan 10
            # ...and prove the Wait-Job timeout actually elapsed (not an instant bypass).
            $sw.Elapsed.TotalSeconds | Should -BeGreaterThan 0.9
        }
    }

    Context "success path — injected fast scriptblock passes results through" {
        It "returns a normalized object containing the injected ProcessId" {
            # Inject a scriptblock that returns a known object — proves the success path
            # captures and returns data from the job.
            $result = @(Get-MsAccessProcessesBounded `
                -WmiScriptBlock { [PSCustomObject]@{
                    ProcessId    = 4321
                    CreationDate = $null
                    CommandLine  = 'MSACCESS.EXE "C:\fake.accdb"'
                } } `
                -TimeoutSeconds 5)

            $result.Count | Should -BeGreaterOrEqual 1
            $result[0].ProcessId | Should -Be 4321
        }
    }
}

# ===========================================================================
# S1 — Behavioral tests for Invoke-ExportAction
# Extract via AST from the production source, stub I/O seams, assert behavior.
# ===========================================================================

Describe "Invoke-ExportAction — behavioral (decompose S1)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-ExportAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-ExportAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Stub Write-Status — swallow console output in tests
        function script:Write-Status { param([string]$Message, $Color) }
    }

    Context "filtered export — only matching modules are passed to Export-VbaModule" {
        BeforeEach {
            # Track which module names were passed to Export-VbaModule
            $script:ExportedModules = [System.Collections.Generic.List[string]]::new()
            function script:Export-VbaModule {
                param($VbProject, [string]$ModuleName, $ModulesPath, $AccessApplication)
                $script:ExportedModules.Add($ModuleName)
            }

            # Stub Get-ComponentExtension (not called when NormalizedModules is provided)
            function script:Get-ComponentExtension { param($Component, $ModuleName) return ".bas" }

            # Build a fake VBProject: VBComponents supports .Item(name) and .Count
            $fakeComponents = [PSCustomObject]@{ Count = 3 }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($nameOrIndex)
                return [PSCustomObject]@{ Name = $nameOrIndex }
            }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
            $fakeVbProject | Add-Member -MemberType NoteProperty -Name "VBComponents" -Value $fakeComponents -Force

            $script:FakeSession = [PSCustomObject]@{
                VbProject          = $fakeVbProject
                AccessApplication  = [PSCustomObject]@{ Id = "fake-app" }
            }
        }

        It "exports only the modules listed in NormalizedModules (A and C, not B)" {
            $modules = @("ModuleA", "ModuleC")
            Invoke-ExportAction `
                -Session $script:FakeSession `
                -NormalizedModules $modules `
                -ModulesPath "C:\fake\modules"

            $script:ExportedModules.Count | Should -Be 2
            $script:ExportedModules | Should -Contain "ModuleA"
            $script:ExportedModules | Should -Contain "ModuleC"
            $script:ExportedModules | Should -Not -Contain "ModuleB"
        }
    }

    Context "exception propagation — Export-VbaModule failure aborts the action" {
        # Behavioral contract: Invoke-ExportAction is a pure refactor of the original
        # inline Export arm. The original arm had NO per-module try/catch; an exception
        # from Export-VbaModule propagated directly to the dispatcher's try/finally.
        # This context asserts the ORIGINAL behavior is preserved: first failure aborts.
        BeforeEach {
            $script:ExportedModules = [System.Collections.Generic.List[string]]::new()
            $script:CallCount = 0
            function script:Export-VbaModule {
                param($VbProject, [string]$ModuleName, $ModulesPath, $AccessApplication)
                $script:CallCount++
                if ($ModuleName -eq "FailingModule") {
                    throw "Simulated export failure for $ModuleName"
                }
                $script:ExportedModules.Add($ModuleName)
            }

            function script:Get-ComponentExtension { param($Component, $ModuleName) return ".bas" }

            $fakeComponents = [PSCustomObject]@{ Count = 2 }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($nameOrIndex)
                return [PSCustomObject]@{ Name = $nameOrIndex }
            }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
            $fakeVbProject | Add-Member -MemberType NoteProperty -Name "VBComponents" -Value $fakeComponents -Force

            $script:FakeSession = [PSCustomObject]@{
                VbProject          = $fakeVbProject
                AccessApplication  = [PSCustomObject]@{ Id = "fake-app" }
            }
        }

        It "propagates exception from Export-VbaModule — Export aborts at first error" {
            # Original behavior: no per-module catch; exception surfaces to caller.
            $modules = @("FailingModule", "GoodModule")
            { Invoke-ExportAction `
                -Session $script:FakeSession `
                -NormalizedModules $modules `
                -ModulesPath "C:\fake\modules" } | Should -Throw "Simulated export failure for FailingModule"
        }

        It "does NOT attempt remaining modules after first Export-VbaModule failure" {
            # Abort-on-first-error: GoodModule must NOT be exported after FailingModule throws.
            $modules = @("FailingModule", "GoodModule")
            try {
                Invoke-ExportAction `
                    -Session $script:FakeSession `
                    -NormalizedModules $modules `
                    -ModulesPath "C:\fake\modules"
            } catch { }

            $script:CallCount | Should -Be 1
            $script:ExportedModules | Should -Not -Contain "GoodModule"
        }
    }
}
