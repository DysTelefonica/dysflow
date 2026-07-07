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
        $script:Ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:ScriptPath).Path,
            [ref]$null,
            [ref]$null
        )

        foreach ($functionName in @(
            'Test-ShouldUseCodeModuleStringFallback',
            'Convert-VbaTextForCodeModuleString',
            'Get-VbaTextLineCount',
            'Get-VbaTextSizeSnapshot'
        )) {
            $fnAst = $script:Ast.FindAll(
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

    It "counts logical VBA text lines without treating the trailing newline as an extra code line" {
        Get-VbaTextLineCount -Text "" | Should -Be 0
        Get-VbaTextLineCount -Text "Option Explicit" | Should -Be 1
        Get-VbaTextLineCount -Text "Option Explicit`r`nPublic Sub A()`r`nEnd Sub`r`n" | Should -Be 3
    }

    It "builds a size snapshot from visible VBA text for verbose fallback comparison" {
        $snapshot = Get-VbaTextSizeSnapshot -Text "Option Explicit`r`nPublic Sub A()`r`nEnd Sub`r`n"
        $snapshot.lines | Should -Be 3
        $snapshot.bytes | Should -BeGreaterThan 0
        $snapshot.sha256 | Should -Match '^[a-f0-9]{64}$'
    }

    It "does not call VBComponents.Remove in the production import path" {
        $fnAst = $script:Ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Import-VbaModule' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Import-VbaModule not found in $($script:ScriptPath)" }

        $removeCalls = @($fnAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and
              $args[0].Member.Value -eq 'Remove' },
            $true
        ))

        $removeCalls.Count | Should -Be 0
    }
}
