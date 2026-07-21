#requires -Version 5.1
<#
.SYNOPSIS
    Pester pin for issue #1045 — `Set-ScriptOutputEncodingUtf8` must live in
    `scripts/dysflow-access-runner.ps1` and be invoked at the script's top
    level BEFORE any non-ASCII text is written to stdout.

.DESCRIPTION
    Background:
      powershell.exe (5.1) defaults `[Console]::OutputEncoding` to the active
      console code page (typically CP1252 on Western Windows). Node.js reads
      the child process's stdout as UTF-8, so any non-ASCII character
      (e.g. `Excepción`) was arriving at the dysflow runner as a U+FFFD
      replacement character. The visible symptom: `run_vba` reported
      `RUNNER_FAILED: PowerShell runner failed with exit code 1: Excepci�n al
      llamar a "Run" con los argumentos "31": ...` instead of the original
      Spanish error.

    The fix mirrors the existing helper in `dysflow-vba-manager.ps1`
    (`Set-ScriptOutputEncodingUtf8`, #585). `dysflow-access-runner.ps1` must
    define the same helper AND call it at the top level so the encoding
    flip happens before any `ConvertTo-Json` output or Access error stream
    emission.

    This file pins two contracts:
      1. The helper is defined and lives in the early helpers block
         (before any first call site).
      2. The helper, when invoked, sets `[Console]::OutputEncoding.CodePage`
         to 65001 (UTF-8) and `.WebName` to `"utf-8"`.

.NOTES
    Run with: pwsh -Command "Invoke-Pester scripts/tests/dysflow-access-runner-1045.Tests.ps1 -CI"
    Requires Pester 5.x.
#>

Describe "dysflow-access-runner.ps1 — Set-ScriptOutputEncodingUtf8 (#1045)" {

    BeforeAll {
        $script:ScriptPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"

        $script:ScriptAst = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:ScriptPath).Path,
            [ref]$null,
            [ref]$null
        )

        # Map: function name -> first definition line (1-based).
        $script:FunctionDefs = @{}
        $script:ScriptAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] },
            $true
        ) | ForEach-Object {
            if (-not $script:FunctionDefs.ContainsKey($_.Name)) {
                $script:FunctionDefs[$_.Name] = $_.Extent.StartLineNumber
            }
        }

        # Extract the Set-ScriptOutputEncodingUtf8 AST node so the helper can
        # be dot-sourced into the test scope and exercised end-to-end.
        $script:SetEncodingFnAst = $script:ScriptAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Set-ScriptOutputEncodingUtf8' },
            $true
        ) | Select-Object -First 1

        if ($script:SetEncodingFnAst) {
            Invoke-Expression $script:SetEncodingFnAst.Extent.Text
        }
    }

    It "defines Set-ScriptOutputEncodingUtf8 as an extractable helper" {
        $script:SetEncodingFnAst | Should -Not -BeNullOrEmpty `
            -Because "dysflow-access-runner.ps1 must define Set-ScriptOutputEncodingUtf8 (#1045) — without it the PowerShell runner emits non-ASCII chars (e.g. Excepción) as U+FFFD because [Console]::OutputEncoding defaults to the OEM codepage"
    }

    It "Set-ScriptOutputEncodingUtf8 lives in the early helpers block (line <= 250)" {
        # Mirrors the dysflow-vba-manager convention (#585 / #807): every helper
        # the script invokes at top level MUST be defined BEFORE its call site.
        # pwsh 7+ enforces script-load order strictly; a top-level call before
        # the helper's definition raises CommandNotFoundException.
        $script:FunctionDefs.ContainsKey('Set-ScriptOutputEncodingUtf8') | Should -Be $true
        $script:FunctionDefs['Set-ScriptOutputEncodingUtf8'] | Should -BeLessOrEqual 250 `
            -Because "the helper must precede any first top-level call site so pwsh 7+ can find it"
    }

    It "Set-ScriptOutputEncodingUtf8 sets [Console]::OutputEncoding to UTF-8 (codepage 65001)" {
        $script:SetEncodingFnAst | Should -Not -BeNullOrEmpty

        $previous = [Console]::OutputEncoding
        try {
            [Console]::OutputEncoding = [System.Text.Encoding]::ASCII
            Set-ScriptOutputEncodingUtf8
            [Console]::OutputEncoding.CodePage | Should -Be 65001
            [Console]::OutputEncoding.WebName | Should -Be "utf-8"
        } finally {
            [Console]::OutputEncoding = $previous
        }
    }

    It "every top-level invocation of a script-defined function comes AFTER its definition" {
        # Walk every CommandAst in the script and keep only the ones that
        # are NOT nested inside any function body (a top-level call runs
        # during script load; a call inside a function body only runs when
        # that outer function is invoked, by which time the whole top-level
        # pass — including every `function` statement — has completed).
        $allCommands = $script:ScriptAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.CommandAst] },
            $true
        )

        $topLevelCommands = $allCommands | Where-Object {
            $node = $_.Parent
            while ($null -ne $node) {
                if ($node -is [System.Management.Automation.Language.FunctionDefinitionAst]) {
                    return $false
                }
                $node = $node.Parent
            }
            return $true
        }

        $violations = foreach ($cmd in $topLevelCommands) {
            $name = $cmd.GetCommandName()
            if ($name -and $script:FunctionDefs.ContainsKey($name)) {
                $defLine = $script:FunctionDefs[$name]
                $invLine = $cmd.Extent.StartLineNumber
                if ($invLine -lt $defLine) {
                    [pscustomobject]@{
                        Function  = $name
                        DefinedAt = $defLine
                        InvokedAt = $invLine
                    }
                }
            }
        }

        $violations = @($violations)
        if ($violations.Count -gt 0) {
            $detail = ($violations | ForEach-Object {
                "{0} defined L{1} but invoked at L{2}" -f $_.Function, $_.DefinedAt, $_.InvokedAt
            }) -join '; '
            $violations.Count | Should -Be 0 `
                -Because "top-level invocations must come AFTER the function's first definition line. Violations: $detail"
        } else {
            $violations.Count | Should -Be 0 `
                -Because "no top-level invocation precedes its function definition"
        }
    }
}