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
    Import-AuditFunction "Get-ExampleIssue"
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

Describe "example audit issue classification" {
    BeforeAll {
        $script:knownTool = "find_references"
        $script:capNames = @("find_references")
        $script:fullByName = @{
            "find_references" = [pscustomobject]@{
                parameters           = [pscustomobject]@{ symbol = [pscustomobject]@{} }
                inputSchema          = [pscustomobject]@{ required = @("symbol") }
                resultContract       = [pscustomobject]@{
                    dataSchema    = [pscustomobject]@{ properties = [pscustomobject]@{ matches = [pscustomobject]@{} } }
                    errorEnvelope = [pscustomobject]@{ shape = [pscustomobject]@{} }
                }
            }
        }
    }

    It "separates a parse failure from a block that parsed but named no tool" {
        # The triple backticks are the markdown fence marker. Single-quoted here-strings keep
        # them literal so PowerShell does not try to interpret ` as an escape character.
        $unparseable = @'
```json
{"tool": "find_references", oops}
```
'@
        $nameless = @'
```json
{"tool": "", "arguments": {} }
```
'@

        $kindsA = @((Get-ExampleIssue -FileName "a.md" -Text $unparseable -CapNames $script:capNames -FullByName $script:fullByName) | ForEach-Object kind)
        $kindsB = @((Get-ExampleIssue -FileName "b.md" -Text $nameless -CapNames $script:capNames -FullByName $script:fullByName) | ForEach-Object kind)

        $kindsA | Should -Contain "example-json"
        $kindsB | Should -Contain "example-no-tool"
        # The two classes must not collapse into one kind.
        $kindsB | Should -Not -Contain "example-json"
    }

    It "names which block is unnamed when a file holds several" {
        $text = @'
```json
{"tool": "find_references", "arguments": { "symbol": "x" } }
```

```json
{"tool": "", "arguments": {} }
```
'@

        $targets = @(Get-ExampleIssue -FileName "multi.md" -Text $text -CapNames $script:capNames -FullByName $script:fullByName |
                Where-Object kind -eq "example-no-tool" | ForEach-Object target)

        $targets | Should -Be @("multi.md:block2")
    }

    It "clears the tool attribution when a block names an unknown tool" {
        # Block 1 names an unknown tool. A later `result.x` must not be charged against it, and
        # must not be charged against anything else either.
        $text = @'
```json
{"tool": "not_a_real_tool", "arguments": {} }
```

result.notAField
'@

        $issues = @(Get-ExampleIssue -FileName "attrib.md" -Text $text -CapNames $script:capNames -FullByName $script:fullByName)

        @($issues | ForEach-Object kind) | Should -Contain "example-tool"
        @($issues | ForEach-Object kind) | Should -Not -Contain "example-result"
    }

    It "marks result findings historical when the document carries a historical marker" {
        $text = @'
> **Historical evidence snapshot (2026-07-08), not an operational example.**

```json
{"tool": "find_references", "arguments": { "symbol": "x" } }
```

result.notAField
'@

        $results = @(Get-ExampleIssue -FileName "hist.md" -Text $text -CapNames $script:capNames -FullByName $script:fullByName |
                Where-Object kind -eq "example-result")

        $results.Count | Should -Be 1
        $results[0].historical | Should -BeTrue
    }
}