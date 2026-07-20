#Requires -Modules Pester
<#
.SYNOPSIS
    Regression tests for issue #1010 — false IMPORT_TRUNCATED on WithEvents
    re-imports.

    The #1007 fix (PR #1008) correctly short-circuited the F16 AddFromString
    fallback for source containing WithEvents declarations, but the post-import
    `IMPORT_TRUNCATED` guard at scripts/dysflow-vba-manager.ps1:3486-3495
    compares `visibleSourceLines` (computed from
    `Get-VbaTextLineCount -Text (Convert-VbaTextForCodeModuleString -Text $src)`)
    against `CodeModule.CountOfLines` (which excludes ALL hidden attrs, including
    member-level `Attribute <var>.VB_VarHelpID = -1`).

    The current `Convert-VbaTextForCodeModuleString` regex only matches FILE-
    level `Attribute VB_*` lines, so the line count it returns still includes
    member-level attrs. AddFromFile's CountOfLines strips them. The mismatch
    fires a false IMPORT_TRUNCATED on legitimate WithEvents re-imports.

    The fix extends the regex to also strip member-level
    `Attribute <var>.VB_VarHelpID = -1` (and any other
    `Attribute <ident>.VB_*` patterns), so the line count matches what VBE
    retains.

.NOTES
    Pure-PowerShell: AST-loads Convert-VbaTextForCodeModuleString and
    Get-VbaTextLineCount from dysflow-vba-manager.ps1 and exercises them
    against the WithEventsFixture published in the issue body. No live
    Access COM.
#>

Describe "issue #1010 — false IMPORT_TRUNCATED on WithEvents re-import" {

    Context "Convert-VbaTextForCodeModuleString — strip member-level Attribute <var>.VB_*" {
        BeforeAll {
            $scriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $scriptPath).Path, [ref]$null, [ref]$null
            )

            $convertFn = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'Convert-VbaTextForCodeModuleString' },
                $true
            ) | Select-Object -First 1
            $convertFn | Should -Not -BeNullOrEmpty `
                -Because "Convert-VbaTextForCodeModuleString must exist so the issue #1010 regex extension can be tested"
            . ([ScriptBlock]::Create($convertFn.Extent.Text))

            $countFn = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'Get-VbaTextLineCount' },
                $true
            ) | Select-Object -First 1
            $countFn | Should -Not -BeNullOrEmpty `
                -Because "Get-VbaTextLineCount must exist so the issue #1010 visible-line assertion can be tested"
            . ([ScriptBlock]::Create($countFn.Extent.Text))
        }

        It "strips file-level Attribute VB_* lines (regression — behavior preserved from #1007)" {
            $src = @(
                'Attribute VB_Name = "Foo"',
                'Attribute VB_GlobalNameSpace = False',
                'Option Explicit',
                'Public Sub Bar()',
                'End Sub'
            ) -join "`r`n"

            $converted = Convert-VbaTextForCodeModuleString -Text $src

            $converted.Contains("Attribute VB_Name = ""Foo""") | Should -BeFalse
            $converted.Contains("Attribute VB_GlobalNameSpace = False") | Should -BeFalse
            $converted.Contains("Option Explicit") | Should -BeTrue
            $converted.Contains("Public Sub Bar") | Should -BeTrue
            $converted.Contains("End Sub") | Should -BeTrue
        }

        It "strips member-level Attribute <var>.VB_VarHelpID = -1 lines (#1010 fix)" {
            $src = @(
                'Attribute VB_Name = "WithEventsFixture"',
                'Attribute VB_GlobalNameSpace = False',
                'Attribute VB_Creatable = True',
                'Option Explicit',
                'Private WithEvents m_Application As Access.Application',
                'Attribute m_Application.VB_VarHelpID = -1',
                'Private WithEvents m_Form As Access.Form',
                'Attribute m_Form.VB_VarHelpID = -1',
                'Public Sub Foo()',
                'End Sub'
            ) -join "`r`n"

            $converted = Convert-VbaTextForCodeModuleString -Text $src

            $converted.Contains("Attribute m_Application.VB_VarHelpID = -1") | Should -BeFalse `
                -Because "the #1010 fix must strip member-level `Attribute <var>.VB_*` lines that VBE strips on AddFromString"
            $converted.Contains("Attribute m_Form.VB_VarHelpID = -1") | Should -BeFalse `
                -Because "the #1010 fix must strip member-level `Attribute <var>.VB_*` lines that VBE strips on AddFromString"
            $converted.Contains("Private WithEvents m_Application") | Should -BeTrue
            $converted.Contains("Private WithEvents m_Form") | Should -BeTrue
        }

        It "returns a visible-line count that EXCLUDES member-level attrs (#1010 — guard against IMPORT_TRUNCATED false positive)" {
            # Mirrors the WithEventsFixture published in the issue body:
            # 5 file-level attrs + 3 member-level attrs + 16 visible lines.
            # Before the fix: Convert strips only the 5 file-level attrs and
            # Get-VbaTextLineCount returns 19 (16 visible + 3 member attrs),
            # which then > AddFromFile's 16 CountOfLines -> false IMPORT_TRUNCATED.
            # After the fix: Convert strips both, count returns 16, equal to
            # the destination's CountOfLines.
            $src = @(
                'VERSION 1.0 CLASS',
                'BEGIN',
                '  MultiUse = -1  ''True',
                'END',
                'Attribute VB_Name = "WithEventsFixture"',
                'Attribute VB_GlobalNameSpace = False',
                'Attribute VB_Creatable = True',
                'Attribute VB_PredeclaredId = False',
                'Attribute VB_Exposed = False',
                'Option Compare Database',
                'Option Explicit',
                '',
                'Private WithEvents m_Application As Access.Application',
                'Attribute m_Application.VB_VarHelpID = -1',
                'Private WithEvents m_Form As Access.Form',
                'Attribute m_Form.VB_VarHelpID = -1',
                'Private WithEvents m_Report As Access.Report',
                'Attribute m_Report.VB_VarHelpID = -1',
                '',
                'Public Sub ResetHandlers()',
                '    Set m_Application = Nothing',
                '    Set m_Form = Nothing',
                '    Set m_Report = Nothing',
                'End Sub'
            ) -join "`r`n"

            $visibleLines = Get-VbaTextLineCount -Text (Convert-VbaTextForCodeModuleString -Text $src)

            $visibleLines | Should -Be 16 `
                -Because "the post-import truncation guard compares Convert(...) against CodeModule.CountOfLines; both must strip member-level attrs so WithEvents re-imports do not throw IMPORT_TRUNCATED (#1010)"
        }

        It "still counts visible code lines that mention 'Attribute' inside comments / strings (defensive — does not over-strip)" {
            # 5 elements total: 1 file-level attr (stripped) + 1 comment line +
            # 3 visible code lines = 4 lines after Convert, regardless of fix.
            # The fix extends stripping to member-level `Attribute <var>.VB_*`
            # lines that START a line; comment/string bodies that happen to
            # contain the literal `Attribute` keyword must survive.
            $src = @(
                'Attribute VB_Name = "Foo"',
                ''' Note: Attribute m_X.VB_VarHelpID inside a comment must survive.',
                'Public Function Text() As String',
                '    Text = "Attribute foo.VB_X = literal"',
                'End Function'
            ) -join "`r`n"

            $converted = Convert-VbaTextForCodeModuleString -Text $src

            $converted.Contains("Attribute VB_Name = ""Foo""") | Should -BeFalse
            $converted.Contains("Attribute m_X.VB_VarHelpID inside a comment") | Should -BeTrue
            $converted.Contains("Text = ""Attribute foo.VB_X = literal""") | Should -BeTrue
            (Get-VbaTextLineCount -Text $converted) | Should -Be 4
        }
    }
}