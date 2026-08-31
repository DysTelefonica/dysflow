<#
.SYNOPSIS
    Lint every SKILL.md under a root: frontmatter parseable, description present
    and within length cap. Soft-warns on metadata + body length.

.DESCRIPTION
    Enforces the lint section of dysflow-codegraph-update's Execution Step 7. Walks
    every SKILL.md under -Root (or the explicit -Path list) and validates:

      Hard failures (gate-blocking, exit 1):
        * Frontmatter block (---...---) is present and well-formed.
        * Description field present and starts with a leading "Trigger:".

      Soft warnings (informational, exit still 0):
        * Description length > 250 chars (drift from the trigger-friendly cap).
        * metadata.author / metadata.version absent.
        * License absent.
        * Body > 1000 tokens (4 chars/token heuristic).

    Exits 0 if all hard checks pass; 1 otherwise. Soft warnings are printed but
    never fail the run.

.PARAMETER Root
    Skill root directory. Defaults to the repository-bundled `skills/` directory
    resolved relative to this script, so release archives are self-contained.

.PARAMETER Path
    Optional array of specific SKILL.md paths to lint. If set, -Root is ignored.

.EXAMPLE
    pwsh.exe -ExecutionPolicy Bypass -File lint-frontmatter.ps1

    # Walks every SKILL.md under the default root, prints warnings, exits 0/1
    # based on hard failures only.

.EXAMPLE
    pwsh.exe -ExecutionPolicy Bypass -File lint-frontmatter.ps1 `
             -Path (Join-Path $SkillRoot 'dysflow-usage\SKILL.md')

    # Lints only the one file.
#>

[CmdletBinding()]
param(
    [string]$Root = (Join-Path $PSScriptRoot '..\..\..'),
    [string[]]$Path,
    [string[]]$Exempt
)

$ErrorActionPreference = 'Stop'

# Skills EXEMPT from the lint gate. ONLY the officially-deprecated skills per the
# Deprecated skills table in dysflow-codegraph-update/SKILL.md belong here.
# Auto-exempt (no list entry required) for SKILL.md files with
# `disable-model-invocation: true` or `user-invocable: false`.
#
# Do NOT add a skill here because "it isn't mine" or "gentle-ai maintains it".
# Maintainers are responsible for their own frontmatter; the linter surfaces
# violations but does not delete skills from the registry on its own.
$DEFAULT_EXEMPT = @(
    'access-query',                  # deprecated since 2026-07-06; superseded by dysflow MCP query_execute
    'access-vba-sync',               # deprecated; decomposed into per-workflow vba-* skills
    'access-vba-impact',             # deprecated; replaced by vba-source-impact + vba-blast-radius
    'access-vba-test-runner',        # deprecated; replaced by vba-run-tests
    'vba-refactor-planner'           # deprecated; replaced by direct use of vba-* per-workflow
)

$effectiveExempt = @($DEFAULT_EXEMPT + ($Exempt | Where-Object { $_ }))
# Resolve to set semantics (also dedupes)
$exemptSet = [System.Collections.Generic.HashSet[string]]::new(
    [string[]]$effectiveExempt,
    [System.StringComparer]::OrdinalIgnoreCase
)

if ($Path -and $Path.Count -gt 0) {
    $targets = @($Path | ForEach-Object { Resolve-Path $_ } | ForEach-Object { Get-Item $_ })
} else {
    $targets = @(Get-ChildItem -LiteralPath $Root -Recurse -Filter 'SKILL.md' -File)
}

if ($targets.Count -eq 0) {
    Write-Error "No SKILL.md files found under '$Root' (or in -Path)."
    exit 1
}

$hardFails = New-Object System.Collections.Generic.List[object]
$softWarn  = New-Object System.Collections.Generic.List[object]

foreach ($file in $targets) {
    $fullPath = $file.FullName
    $rel = (Resolve-Path -LiteralPath $fullPath -Relative) -replace '^\\', ''
    $content = Get-Content -LiteralPath $fullPath -Raw

    # Skill name from the path (last directory under -Root)
    $skillName = Split-Path -Path (Split-Path -Path $fullPath -Parent) -Leaf

    # IMPORTANT: reset $fm at the START of each iteration. PowerShell's foreach
    # does NOT scope variables per iteration, so without this reset a previous
    # iteration's $fm leaks into the current iteration's checks — that was the
    # original auto-exempt regression.
    $fm = $null

    # Manual exempt via -Exempt or $DEFAULT_EXEMPT. Catch this BEFORE the
    # frontmatter parsing so deprecated skills can have any frontmatter shape.
    if ($exemptSet.Contains($skillName)) {
        $softWarn.Add([pscustomobject]@{ Path = $rel; Kind = 'exempt-by-policy'; Detail = $skillName })
        continue
    }

    # Frontmatter block
    $fmMatch = [regex]::Match(
        $content,
        '^---\s*\r?\n(.*?)\r?\n---',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    if (-not $fmMatch.Success) {
        $hardFails.Add([pscustomobject]@{ Path = $rel; Kind = 'frontmatter-missing' })
        continue
    }
    $fm = $fmMatch.Groups[1].Value
    try {
        Import-Module powershell-yaml -ErrorAction Stop
        $parsedFrontmatter = ConvertFrom-Yaml -Yaml $fm -ErrorAction Stop
        if (-not $parsedFrontmatter -or -not $parsedFrontmatter.name) {
            throw 'frontmatter must parse to a mapping with name'
        }
    } catch {
        $hardFails.Add([pscustomobject]@{ Path = $rel; Kind = 'frontmatter-yaml-invalid'; Detail = $_.Exception.Message })
        continue
    }

    # Auto-exempt (legitimate convention): a skill whose frontmatter declares
    # `disable-model-invocation: true` or `user-invocable: false` opts out of
    # direct registry loading. The linter still scans them for frontmatter
    # hygiene but never hard-fails them.
    $autoExempt = ($fm -match '(?m)^\s*disable-model-invocation:\s*true') -or
                  ($fm -match '(?m)^\s*user-invocable:\s*false')
    if ($autoExempt) {
        $softWarn.Add([pscustomobject]@{ Path = $rel; Kind = 'exempt-by-policy'; Detail = "$skillName (disable-model-invocation/user-invocable)" })
        continue
    }

    # Description field — supports three YAML forms:
    #   1. Quoted:   description: "..."
    #   2. Folded:   description: >\n  text...
    #   3. Plain:    description: single-line plain text (no quotes, no fold)
    # For DEPRECATED skills the body starts with "⚠️ DEPRECATED ..." and may not
    # contain "Trigger:"; we surface that as a soft warn but never fail a
    # deprecated skill on it.
    $desc = $null
    $quotedDesc = [regex]::Match($fm, '(?ms)^description:\s*"(.*?)"\s*$')
    if ($quotedDesc.Success) {
        $desc = $quotedDesc.Groups[1].Value
    } else {
        $folded = [regex]::Match(
            $fm,
            '(?ms)^description:\s*>\s*\r?\n((?:[ \t]+.+\r?\n?)+)'
        )
        if ($folded.Success) {
            $raw = $folded.Groups[1].Value -replace '\r?\n[ \t]*', ' '
            $desc = $raw.Trim()
        } else {
            # Plain scalar — single line of text after `description:` until newline.
            # YAML plain scalar stops at the end of the line.
            $plain = [regex]::Match($fm, '(?m)^description:\s*(.+?)\s*$')
            if ($plain.Success) {
                $desc = $plain.Groups[1].Value
            }
        }
    }

    $isDeprecated = $fm -match '(?i)\bdeprecat' -or ($desc -and $desc -match '(?i)\bdeprecated\b')

    if ($null -eq $desc) {
        $hardFails.Add([pscustomobject]@{ Path = $rel; Kind = 'description-missing' })
    } else {
        $descLen = $desc.Length
        if (-not $desc.Contains('Trigger:')) {
            if ($isDeprecated) {
                $softWarn.Add([pscustomobject]@{ Path = $rel; Kind = 'description-no-trigger-deprecated'; Detail = '' })
            } else {
                $hardFails.Add([pscustomobject]@{ Path = $rel; Kind = 'description-no-trigger' })
            }
        } elseif (-not $desc.StartsWith('Trigger:')) {
            # Subject-first convention (synopsis then 'Trigger: ...phrases...'). Valid
            # but not the skill-creator default. Surface as soft warn so future skills
            # are nudged toward the strict prefix.
            $softWarn.Add([pscustomobject]@{ Path = $rel; Kind = 'description-trigger-not-prefix'; Detail = '' })
        }
        if ($descLen -gt 250) {
            $softWarn.Add([pscustomobject]@{ Path = $rel; Kind = 'description-over-cap'; Detail = "$descLen chars (cap 250)" })
        }
    }

    # Soft: missing license / metadata
    if ($fm -notmatch '(?m)^license:\s*\S+') {
        $softWarn.Add([pscustomobject]@{ Path = $rel; Kind = 'license-missing'; Detail = '' })
    }

    $metadataBlock = ''
    if ($fm -match '(?ms)^metadata:\s*\r?\n((?:.*\r?\n)*?)(?=^[a-z]|\z)') {
        $metadataBlock = $Matches[1]
    }
    if ($metadataBlock -notmatch '(?m)^\s+author:\s*\S+') {
        $softWarn.Add([pscustomobject]@{ Path = $rel; Kind = 'metadata-author-missing'; Detail = '' })
    }
    if ($metadataBlock -notmatch '(?m)^\s+version:\s*\S+') {
        $softWarn.Add([pscustomobject]@{ Path = $rel; Kind = 'metadata-version-missing'; Detail = '' })
    }

    # Soft: body token estimate
    $bodyStart = $fmMatch.Index + $fmMatch.Length
    $body = $content.Substring($bodyStart)
    $tokenEst = [int]($body.Length / 4)
    if ($tokenEst -gt 1000) {
        $softWarn.Add([pscustomobject]@{ Path = $rel; Kind = 'body-over-cap'; Detail = "~$tokenEst tokens (soft cap 1000)" })
    }
}

Write-Host ""
Write-Host "lint-frontmatter"
Write-Host "================"
Write-Host ("Files scanned:    {0}" -f $targets.Count)
Write-Host ("Hard failures:    {0}" -f $hardFails.Count)
Write-Host ("Soft warnings:    {0}" -f $softWarn.Count)
Write-Host ""

if ($hardFails.Count -gt 0) {
    Write-Host "FAIL (hard):" -ForegroundColor Red
    $grouped = $hardFails | Group-Object -Property Kind
    foreach ($g in $grouped) {
        Write-Host ("  [{0}] {1} file(s):" -f $g.Name, $g.Count) -ForegroundColor Red
        foreach ($item in $g.Group) {
            Write-Host ("    - {0}" -f $item.Path) -ForegroundColor Red
        }
    }
}
if ($softWarn.Count -gt 0) {
    Write-Host ""
    Write-Host "WARN (soft, not blocking):"
    $grouped = $softWarn | Group-Object -Property Kind
    foreach ($g in $grouped) {
        Write-Host ("  [{0}] {1} file(s):" -f $g.Name, $g.Count) -ForegroundColor Yellow
        foreach ($item in $g.Group) {
            $line = "    - $($item.Path)"
            if ($item.Detail) { $line += "  ($($item.Detail))" }
            Write-Host $line -ForegroundColor Yellow
        }
    }
}

if ($hardFails.Count -gt 0) {
    Write-Host ""
    Write-Host "FAIL: frontmatter hard-check did not pass." -ForegroundColor Red
    exit 1
}
Write-Host ""
Write-Host "OK: frontmatter hard-check clean." -ForegroundColor Green
exit 0
