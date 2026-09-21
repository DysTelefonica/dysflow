# Behavioral tests for the examples audit in
# skills/dysflow-codegraph-update/assets/scripts/Invoke-DysflowSemanticAudit.ps1.
#
# The production script runs a live MCP capture, so its helpers are loaded into
# the test scope by parsing the file and importing the named functions, the same
# technique scripts/tests/release-prepare.Tests.ps1 uses.
#
# #1772: the extractor used to fall back to the examples file name when it could
# not name a tool. A markdown file is a document, never a callable, so that
# substitute invented a tool and emitted one bogus `example-tool` finding per
# `result.` occurrence in the file.

BeforeAll {
    $script:repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
    $script:scriptPath = Join-Path $script:repoRoot "skills\dysflow-codegraph-update\assets\scripts\Invoke-DysflowSemanticAudit.ps1"

    $tokens = $null
    $parseErrors = $null
    $scriptAst = [System.Management.Automation.Language.Parser]::ParseFile(
        $script:scriptPath,
        [ref]$tokens,
        [ref]$parseErrors
    )
    if ($parseErrors.Count -gt 0) {
        throw "Invoke-DysflowSemanticAudit.ps1 has parse errors: $($parseErrors.Message -join '; ')"
    }

    function Import-AuditFunction([string]$Name) {
        $functionAst = $scriptAst.Find(
            {
                param($node)
                $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                $node.Name -eq $Name
            },
            $true
        )
        if ($null -eq $functionAst) {
            throw "Function '$Name' not found in Invoke-DysflowSemanticAudit.ps1"
        }
        Set-Item -Path "Function:\global:$Name" -Value $functionAst.Body.GetScriptBlock()
    }

    Import-AuditFunction "Get-ExampleToolName"
    Import-AuditFunction "Test-HistoricalExample"
}

Describe "example tool extraction" {
    It "reads the tool field when the block names one" {
        Get-ExampleToolName ([pscustomobject]@{ tool = "find_references" }) | Should -Be "find_references"
    }

    It "reads name plus arguments when the block uses the shorthand pair" {
        Get-ExampleToolName ([pscustomobject]@{
                name      = "run_vba"
                arguments = [pscustomobject]@{ procedureName = "Test_X" }
            }) | Should -Be "run_vba"
    }

    It "returns nothing for a document that names no tool" {
        # The regression: this returned the file name slugified, so a markdown
        # document was reported as a callable absent from the runtime.
        Get-ExampleToolName ([pscustomobject]@{ prose = "no tool here" }) | Should -BeNullOrEmpty
    }

    It "does not fall back to the file name for a block whose tool is empty" {
        Get-ExampleToolName ([pscustomobject]@{ tool = "" }) | Should -BeNullOrEmpty
    }

    It "does not accept name alone as a tool name" {
        Get-ExampleToolName ([pscustomobject]@{ name = "prompt_ia_mantenedora" }) | Should -BeNullOrEmpty
    }
}

Describe "historical example markers" {
    It "recognises the archived-prompt marker" {
        Test-HistoricalExample "> **Historical evidence snapshot (2026-07-08), not an operational example." |
            Should -BeTrue
    }

    It "recognises an explicit compatibility marker" {
        Test-HistoricalExample "## Explicitly compatibility example" | Should -BeTrue
        Test-HistoricalExample "This is a legacy example." | Should -BeTrue
    }

    It "leaves active instruction prose unmarked" {
        Test-HistoricalExample "Call the tool with apply:true after review." | Should -BeFalse
        # "legacy" alone is not a marker: the marker vocabulary is the documented one.
        Test-HistoricalExample "Access would reject that assignment, so the test is valid." | Should -BeFalse
    }
}