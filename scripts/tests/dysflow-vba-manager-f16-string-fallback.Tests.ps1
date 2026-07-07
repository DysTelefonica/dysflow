#Requires -Modules Pester
<#
.SYNOPSIS
    Pester tests for the F16 import_modules grow-in-place fallback.
.NOTES
    These tests exercise pure PowerShell helper contracts only. They do not open Access.
#>

Describe "dysflow-vba-manager.ps1 — F16 source-larger import fallback helpers" {
    BeforeAll {
        $script:ScriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:ScriptPath).Path,
            [ref]$null,
            [ref]$null
        )

        foreach ($functionName in @(
            'Test-ShouldUseCodeModuleStringFallback',
            'Convert-VbaTextForCodeModuleString'
        )) {
            $fnAst = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq $functionName },
                $true
            ) | Select-Object -First 1
            if ($fnAst) { Invoke-Expression $fnAst.Extent.Text }
        }
    }

    It "uses the string fallback only when the source has more lines than the existing component" {
        Test-ShouldUseCodeModuleStringFallback -SourceLines 11 -ExistingLines 10 | Should -Be $true
        Test-ShouldUseCodeModuleStringFallback -SourceLines 10 -ExistingLines 10 | Should -Be $false
        Test-ShouldUseCodeModuleStringFallback -SourceLines 9 -ExistingLines 10 | Should -Be $false
        Test-ShouldUseCodeModuleStringFallback -SourceLines 0 -ExistingLines 10 | Should -Be $false
    }

    It "strips hidden Attribute lines before using CodeModule.AddFromString" {
        $source = @(
            'Attribute VB_Name = "Test_Foo"',
            'Attribute VB_GlobalNameSpace = False',
            'Option Explicit',
            'Public Sub Sanity()',
            'End Sub'
        ) -join "`r`n"

        $converted = Convert-VbaTextForCodeModuleString -Text $source

        $converted | Should -Be ((@(
            'Option Explicit',
            'Public Sub Sanity()',
            'End Sub'
        ) -join "`r`n") + "`r`n")
    }

    It "preserves comments and string literals that mention Attribute VB_" {
        $source = @(
            'Attribute VB_Name = "Test_Foo"',
            ''' Attribute VB_Name = "CommentOnly"',
            'Public Function Text() As String',
            '    Text = "Attribute VB_Name = literal"',
            'End Function'
        ) -join "`r`n"

        $converted = Convert-VbaTextForCodeModuleString -Text $source

        $converted | Should -Match "CommentOnly"
        $converted | Should -Match "literal"
        $converted | Should -Not -Match '^Attribute VB_Name = "Test_Foo"'
    }
}
