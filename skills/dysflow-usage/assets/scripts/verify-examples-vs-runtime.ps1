<#
.SYNOPSIS
    Verify the canonical example scaffolds match dysflow-usage's authoring discipline.

.DESCRIPTION
    Structural checker for the example corpus under assets/examples/. The script
    does NOT call MCP tools at runtime; it validates the document shape only.

    What it checks per scaffold:
      1. Filename matches kebab-case of the H1 heading tool name.
      2. H1 heading has a name token in triple-backtick fences.
      3. Section headers (## What it does, ## When to use, ## Required flags,
         ## All input properties, ## Call shape, ## Result shape, ## Common errors,
         ## Cross-reference, ## TODO before production use) all present.
      4. Call-shape section contains a JSON code block with an explicit
         apply:true|false flag (HR-2 of dysflow-usage).
      5. NO legacy flag strings appear (dryRun:true, options.confirm:true,
         confirmOverwriteSource:true, confirmPid:<digits>) - HR-9 of dysflow-usage.
      6. The Common errors table starts with `| Code | Description | Fix |` header.
      7. For query_execute specifically, the call shape must declare mode
         (HR-3 of dysflow-usage).

    Exit codes:
      0 = all scaffolds pass
      1 = one or more scaffolds failed
      2 = script-level failure (could not find assets/examples, etc.)

.NOTES
    Generated: 2026-08-20 (dysflow-usage ARN-3 close-out).

.EXAMPLE
    PS> powershell -File assets/scripts/verify-examples-vs-runtime.ps1
    PS> powershell -File assets/scripts/verify-examples-vs-runtime.ps1 -ExamplesDir C:\path
    PS> powershell -File assets/scripts/verify-examples-vs-runtime.ps1 -Json
#>

[CmdletBinding()]
param (
    [string]$ExamplesDir,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'

if (-not $ExamplesDir) {
    if ($PSScriptRoot) {
        $ExamplesDir = Join-Path $PSScriptRoot '..\examples'
    } else {
        # Fallback when running via `powershell -File` from a different cwd.
        $here = Split-Path -Parent $MyInvocation.MyCommand.Path
        $ExamplesDir = Join-Path $here '..\examples'
    }
}

function H1Name([string]$content) {
    if ($content -match '(?m)^#\s+`{1,3}([A-Za-z_][A-Za-z0-9_]*)`{1,3}') { return $matches[1] }
    if ($content -match '(?m)^#\s+([A-Za-z_][A-Za-z0-9_]*)') { return $matches[1] }
    return $null
}

function CallShapeSection([string]$content) {
    # Match `## Call shape` heading (with optional parenthetical suffix).
    $m = [regex]::Match($content, '(?im)^##\s+Call\s+shape(?=\s|$)', 'Multiline')
    if (-not $m.Success) { return $null }
    $start = $m.Index
    $rest = $content.Substring($start)
    $next = [regex]::Match($rest, '(?m)^##\s+')
    if ($next.Success -and $next.Index -gt 0) { return $rest.Substring(0, $next.Index) }
    return $rest
}

function Section([string]$haystack, [string]$needle) {
    if ($haystack.IndexOf($needle) -ge 0) { return $true }
    return $false
}

function TestKebab([string]$name) {
    if ($name -match '^[a-z][a-z0-9]*(-[a-z0-9]+)*$') {
        return "ok"
    }
    return "filename '$name' is not kebab-case"
}

function TestH1NameMatchesFilename([string]$content, [string]$basename) {
    $n = H1Name $content
    if (-not $n) { return 'no name token in H1' }
    $expected = $basename -replace '-', '_'
    if ($n -ne $expected) {
        return "H1 tool name '$n' does not match filename expectation '$expected'"
    }
    return 'ok'
}

function TestRequiredHeadings([string]$content) {
    $required = @(
        'What it does',
        'When to use',
        'Required flags',
        'All input properties',
        'Call shape',
        'Result shape',
        'Common errors',
        'Cross-reference',
        'TODO before production use'
    )
    $missing = @()
    foreach ($h in $required) {
        # Allow optional parenthetical suffix: `## Heading` or `## Heading (extra context)`.
        $pattern = '(?m)^##\s+' + [regex]::Escape($h) + '(\s*$|\s+\()'
        if (-not [regex]::IsMatch($content, $pattern)) {
            $missing += $h
        }
    }
    if ($missing.Count -gt 0) { return "missing headings: " + ($missing -join ', ') }
    return 'ok'
}

function TestCallShapeApply([string]$content) {
    $cs = CallShapeSection $content
    if (-not $cs) { return "no '## Call shape' section" }
    # Accept 1-3 backtick fences (PowerShell here-strings sometimes strip backticks).
    if (-not [regex]::IsMatch($cs, '(?m)`{1,3}json')) {
        return 'no JSON code block under Call shape (expected 1-3 backticks + json)'
    }
    if (-not [regex]::IsMatch($cs, 'apply\s*:\s*(true|false)')) {
        return 'call shape JSON does not declare apply:true/false (HR-2)'
    }
    return 'ok'
}

function TestLegacyFlags([string]$content) {
    # Each legacy flag is documented as anti-pattern in anti-patterns.md and in
    # the TODO section of each scaffold. The check ignores matches whose
    # surrounding context (160-char window) contains documentation markers
    # like "NEVER", "do not use", "Replace with", "migrate", "opt-out", or
    # "forbidden". Anything else is real usage and HR-9 fails it.
    $patterns = @(
        @{ n = 'dryRun:true';                 re = 'dryRun\s*:\s*true' },
        @{ n = 'options.confirm:true';        re = 'options\.confirm\s*:\s*true' },
        @{ n = 'confirmOverwriteSource:true'; re = 'confirmOverwriteSource\s*:\s*true' },
        @{ n = 'confirmPid:<digits>';        re = 'confirmPid\s*:\s*\d+' }
    )
    $docTokens = 'NEVER|do not use|Replace with|forbidden|opt-out|migrate|migration'
    foreach ($p in $patterns) {
        foreach ($m in [regex]::Matches($content, $p.re)) {
            $start = [Math]::Max(0, $m.Index - 80)
            $ctx = $content.Substring($start, [Math]::Min(160, $content.Length - $start))
            if ($ctx -match $docTokens) { continue }
            return ("legacy flag {0} used (HR-9) - this is real call-shape usage, not the documentation anti-pattern" -f $p.n)
        }
    }
    return 'ok'
}

function TestCommonErrorsTable([string]$content) {
    if (-not (Section $content '## Common errors')) { return "no '## Common errors' section" }
    if (-not [regex]::IsMatch($content, '(?m)^\|\s*Code\s*\|\s*Description\s*\|\s*Fix\s*\|')) {
        return "common errors table not in '| Code | Description | Fix |' format"
    }
    return 'ok'
}

function TestQueryExecuteMode([string]$content) {
    $tool = H1Name $content
    if ($tool -ne 'query_execute') { return 'ok' }
    $cs = CallShapeSection $content
    if (-not $cs) { return 'skipped (no call shape)' }
    if (-not [regex]::IsMatch($cs, 'mode\s*:')) { return 'query_execute call shape must declare mode (HR-3)' }
    return 'ok'
}

if (-not (Test-Path -LiteralPath $ExamplesDir)) {
    Write-Error ("examples dir not found: $ExamplesDir")
    exit 2
}

$files = Get-ChildItem -LiteralPath $ExamplesDir -Filter '*.md' -ErrorAction SilentlyContinue | Sort-Object Name
if (-not $files) {
    Write-Error ("no .md scaffolds under $ExamplesDir")
    exit 2
}

$results = New-Object System.Collections.Generic.List[object]

foreach ($f in $files) {
    $content = Get-Content -LiteralPath $f.FullName -Raw
    $checks = [ordered]@{
        '1. kebab-filename'           = (TestKebab $f.BaseName)
        '2. H1 name matches filename' = (TestH1NameMatchesFilename $content $f.BaseName)
        '3. required headings'        = (TestRequiredHeadings $content)
        '4. call shape apply'         = (TestCallShapeApply $content)
        '5. no legacy flags'          = (TestLegacyFlags $content)
        '6. common errors table'      = (TestCommonErrorsTable $content)
        '7. query_execute has mode'   = (TestQueryExecuteMode $content)
    }
    $failed = $false
    $firstReason = $null
    foreach ($k in $checks.Keys) {
        if ($checks[$k] -ne 'ok') {
            $failed = $true
            if (-not $firstReason) { $firstReason = '[' + $k + '] ' + $checks[$k] }
        }
    }
    $results.Add([pscustomobject]@{
        file   = $f.Name
        ok     = (-not $failed)
        checks = $checks
        reason = $firstReason
    }) | Out-Null
}

$passed = ($results | Where-Object { $_.ok }).Count
$failed = ($results | Where-Object { -not $_.ok }).Count

if ($Json) {
    [pscustomobject]@{
        examplesDir = $ExamplesDir
        total       = $results.Count
        passed      = $passed
        failed      = $failed
        results     = $results
    } | ConvertTo-Json -Depth 6
    if ($failed -gt 0) { exit 1 }
    exit 0
}

Write-Host '== verify-examples-vs-runtime =='
Write-Host ("examplesDir: {0}" -f $ExamplesDir)
Write-Host ("total: {0}  passed: {1}  failed: {2}" -f $results.Count, $passed, $failed)
Write-Host ''

foreach ($r in $results) {
    if ($r.ok) {
        Write-Host ("OK   {0}" -f $r.file)
    } else {
        Write-Host ("FAIL {0}  {1}" -f $r.file, $r.reason)
    }
}

if ($failed -gt 0) {
    Write-Host ''
    Write-Host ("FAILED: {0} of {1} scaffolds need fixes" -f $failed, $results.Count)
    exit 1
}

Write-Host ''
Write-Host 'All scaffolds pass.'
exit 0
