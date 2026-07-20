#Requires -Modules Pester
<#
.SYNOPSIS
    Regression tests for issue #1007 — round-trip source↔binary corrupts .cls
    files containing WithEvents declarations because the AddFromString F16
    fallback (dysflow-vba-manager.ps1:3420-3439) strips member-level
    Attribute <var>.VB_VarHelpID = -1 lines that VBE needs to bind a WithEvents
    declaration to its event source. The Test-IsVbaImportDroppableMetadataLine
    regex at line 991 is correct (verified empirically against HEAD) — the
    actual loss point is VBE's AddFromString (per comment at 3388-3390).
    The fix introduces Test-SourceContainsWithEventsDeclaration so the import
    path can skip the F16 fallback for source with WithEvents and let
    AddFromFile carry the import; if AddFromFile itself truncates, the
    existing post-import check at line 3455 throws IMPORT_TRUNCATED with a
    typed error instead of silent corruption.

.NOTES
    Pure-PowerShell: AST-loads the relevant helpers from dysflow-vba-manager.ps1
    and exercises them against the WebSocket fixture published in the issue body.
    No live Access COM.
#>

Describe "issue #1007 — WithEvents member-level Attribute *.VB_VarHelpID preservation" {

    Context "Test-SourceContainsWithEventsDeclaration — helper introduced by #1007 fix" {
        BeforeAll {
            $scriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $scriptPath).Path, [ref]$null, [ref]$null
            )
            $fn = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'Test-SourceContainsWithEventsDeclaration' },
                $true
            ) | Select-Object -First 1
            $fn | Should -Not -BeNullOrEmpty `
                -Because "the fix introduces Test-SourceContainsWithEventsDeclaration as the WithEvents detector (#1007)"
            . ([ScriptBlock]::Create($fn.Extent.Text))
        }

        It "returns true for source with Private WithEvents declaration" {
            $src = @(
                "VERSION 1.0 CLASS", "BEGIN", "  MultiUse = -1  'True", "END",
                "Attribute VB_Name = ""WebSocketFixture""", "Option Explicit", "",
                "Private WithEvents doc As HTMLDocument",
                "Attribute doc.VB_VarHelpID = -1",
                "Public Sub Foo()", "End Sub"
            ) -join "`r`n"
            Test-SourceContainsWithEventsDeclaration -SourceText $src | Should -Be $true
        }

        It "returns true for source with Public WithEvents declaration" {
            $src = "Public WithEvents foo As Bar`r`nAttribute foo.VB_VarHelpID = -1"
            Test-SourceContainsWithEventsDeclaration -SourceText $src | Should -Be $true
        }

        It "returns true for indented WithEvents declaration inside the source body" {
            $src = "VERSION 1.0 CLASS`r`nBEGIN`r`nEND`r`nAttribute VB_Name = ""Foo""`r`n    Private WithEvents m_Doc As HTMLDocument"
            Test-SourceContainsWithEventsDeclaration -SourceText $src | Should -Be $true
        }

        It "returns false for source without WithEvents declarations" {
            $src = @(
                "VERSION 1.0 CLASS", "BEGIN", "  MultiUse = -1  'True", "END",
                "Attribute VB_Name = ""Foo""", "Option Explicit", "",
                "Public Sub Bar()", "End Sub"
            ) -join "`r`n"
            Test-SourceContainsWithEventsDeclaration -SourceText $src | Should -Be $false
        }

        It "returns false for empty source" {
            Test-SourceContainsWithEventsDeclaration -SourceText "" | Should -Be $false
        }

        It "ignores the literal word 'WithEvents' that is not part of a declaration (e.g. inside a comment)" {
            # 'WithEvents' inside an apostrophe comment line should NOT match,
            # because the regex anchors on (Public|Private) <ws>+ WithEvents <ws>+ <ident>.
            $src = @(
                "VERSION 1.0 CLASS", "BEGIN", "  MultiUse = -1  'True", "END",
                "Attribute VB_Name = ""Foo""", "Option Explicit", "",
                "' See notes about WithEvents behavior on VBA 7.1"
            ) -join "`r`n"
            Test-SourceContainsWithEventsDeclaration -SourceText $src | Should -Be $false
        }
    }

    Context "Test-ShouldUseCodeModuleStringFallback — skip F16 for WithEvents (#1007)" {
        BeforeAll {
            $scriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $scriptPath).Path, [ref]$null, [ref]$null
            )
            # Load Test-SourceContainsWithEventsDeclaration FIRST because
            # Test-ShouldUseCodeModuleStringFallback calls it.
            $helperFn = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'Test-SourceContainsWithEventsDeclaration' },
                $true
            ) | Select-Object -First 1
            $helperFn | Should -Not -BeNullOrEmpty `
                -Because "Test-SourceContainsWithEventsDeclaration must exist so Test-ShouldUseCodeModuleStringFallback can short-circuit for WithEvents (#1007)"
            . ([ScriptBlock]::Create($helperFn.Extent.Text))

            $fn = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'Test-ShouldUseCodeModuleStringFallback' },
                $true
            ) | Select-Object -First 1
            $fn | Should -Not -BeNullOrEmpty `
                -Because "Test-ShouldUseCodeModuleStringFallback already exists and gains a -SourceText parameter (#1007)"
            . ([ScriptBlock]::Create($fn.Extent.Text))
        }

        It "returns false when source contains WithEvents (skip F16 AddFromString — VBE strips member-level attrs)" {
            $src = @(
                "VERSION 1.0 CLASS", "BEGIN", "  MultiUse = -1  'True", "END",
                "Attribute VB_Name = ""WebSocketFixture""", "Option Explicit", "",
                "Private WithEvents doc As HTMLDocument",
                "Attribute doc.VB_VarHelpID = -1",
                "Public Sub Foo()", "End Sub"
            ) -join "`r`n"
            # Even when the line-count comparison WOULD trigger fallback
            # (25 source lines, 5 existing lines), the WithEvents detector must
            # short-circuit to false so AddFromString (which strips hidden
            # attribute metadata per comment 3388-3390) is not used.
            Test-ShouldUseCodeModuleStringFallback -SourceLines 25 -ExistingLines 5 -SourceText $src `
                | Should -Be $false `
                -Because "WithEvents source must NOT trigger AddFromString F16 fallback (#1007)"
        }

        It "preserves the original line-count comparison when source has no WithEvents" {
            Test-ShouldUseCodeModuleStringFallback -SourceLines 25 -ExistingLines 5 `
                | Should -Be $true `
                -Because "existing line-count contract for non-WithEvents source (#752 F16 fallback)"
            Test-ShouldUseCodeModuleStringFallback -SourceLines 10 -ExistingLines 10 `
                | Should -Be $false `
                -Because "equal lines: source is not strictly greater than existing"
            Test-ShouldUseCodeModuleStringFallback -SourceLines 9 -ExistingLines 10 `
                | Should -Be $false `
                -Because "source smaller than existing"
            Test-ShouldUseCodeModuleStringFallback -SourceLines 0 -ExistingLines 10 `
                | Should -Be $false `
                -Because "zero source lines"
            Test-ShouldUseCodeModuleStringFallback -SourceLines 25 -ExistingLines 0 `
                | Should -Be $false `
                -Because "zero existing lines"
        }

        It "preserves the original line-count comparison when SourceText is omitted (back-compat for existing callers)" {
            # Existing tests in dysflow-vba-manager-f16-string-fallback.Tests.ps1
            # call without -SourceText. They must continue to pass.
            Test-ShouldUseCodeModuleStringFallback -SourceLines 11 -ExistingLines 10 `
                | Should -Be $true
        }
    }
}
