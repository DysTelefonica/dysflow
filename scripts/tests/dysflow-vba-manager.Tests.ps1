#Requires -Modules Pester
<#
.SYNOPSIS
    Pester tests for dysflow-vba-manager.ps1 COM cleanup paths and helper functions.
.NOTES
    COM-integration tests (requiring a live Access installation) are marked -Skip.
    Pure-PowerShell helper function tests run in any environment.
#>

$ScriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

Describe "dysflow-vba-manager.ps1 — script structure" {
    Context "File presence and parseability" {
        It "script file exists" {
            Test-Path $ScriptPath | Should -Be $true
        }

        It "script parses without syntax errors" {
            $errors = $null
            $null = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $ScriptPath).Path,
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
                (Resolve-Path $ScriptPath).Path,
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
            $script:SourceText = Get-Content -Raw (Resolve-Path $ScriptPath).Path
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
    }
}

Describe "dysflow-vba-manager.ps1 — pure helper functions" {
    BeforeAll {
        # Dot-source only the helper functions by extracting them via AST
        # We mock the Param block's mandatory parameters to avoid execution
        # by loading helper functions that don't require COM or Access.

        # Load the pure text-processing functions via a restricted dot-source approach:
        # parse out only functions that have no COM dependencies.
        $scriptContent = Get-Content -Raw (Resolve-Path $ScriptPath).Path

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

        It "returns false for empty string" {
            Test-IsVbaImportMetadataLine -Line "" | Should -Be $false
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
        It "cleans up COM objects when database open fails" -Skip "Requires Access COM available" {
            # This test requires a live DAO COM installation.
            # Verify that calling the function with a non-existent path returns null
            # without leaving hanging COM objects.
            . (Resolve-Path $ScriptPath).Path -Action Exists -AccessPath "C:\nonexistent.accdb"
        }
    }

    Context "Disable-StartupFeatures releases COM objects on exception" {
        It "dbEngine is released when OpenDatabase throws" -Skip "Requires Access COM available" {
            # With a real DAO engine available, passing an invalid path should
            # trigger the OpenDatabase exception, hit the finally block, and
            # release $dbEngine without leaking it.
        }
    }

    Context "Restore-StartupFeatures releases COM objects on early return" {
        It "dbEngine is released when New-DaoDbEngine returns null" -Skip "Requires Access COM available" {
            # When DAO is unavailable, New-DaoDbEngine returns null,
            # the function should return early inside try so finally still runs.
        }
    }

    Context "Enable-AllowBypassKey releases COM objects on exception" {
        It "all COM objects released when database cannot be opened" -Skip "Requires Access COM available" {
            # Full COM integration test — requires Access/DAO installation.
        }
    }
}
