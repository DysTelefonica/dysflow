<#
.SYNOPSIS
    Creates a GitHub Release with structured changelog (CHANGELOG.md + GitHub Release body).

.DESCRIPTION
    Validates environment, optionally merges source→target branch, auto-generates
    a categorized changelog from git log, opens it in your editor for review/edit,
    prepends the entry to CHANGELOG.md, commits it, tags, pushes, and publishes
    the GitHub Release. Follows Keep a Changelog + Conventional Commits standards.

.PARAMETER Version
    Semver version tag. E.g.: v1.2.3, v2.0.0-beta.1

.PARAMETER SourceBranch
    Branch to merge into TargetBranch before releasing. Default: develop

.PARAMETER TargetBranch
    Branch that will be tagged and released. Default: main

.PARAMETER NoMerge
    Skip the merge step. Releases current branch as-is.

.PARAMETER Draft
    Create the GitHub Release as a draft (not publicly visible).

.PARAMETER Prerelease
    Mark the GitHub Release as a pre-release.

.PARAMETER AssetPath
    Optional path to one or more files to attach to the release.

.PARAMETER NoEdit
    Skip opening the editor. Use the auto-generated changelog as-is.

.PARAMETER Editor
    Editor command to open the changelog for editing.
    Auto-detected from $EDITOR env var, then tries: code, notepad++, notepad.

.EXAMPLE
    .\release.ps1 -Version v1.3.0
    .\release.ps1 -Version v1.3.0 -NoMerge
    .\release.ps1 -Version v2.0.0-beta.1 -SourceBranch feature/new-ui -Prerelease
    .\release.ps1 -Version v1.3.0 -Draft -AssetPath .\dist\app.zip
    .\release.ps1 -Version v1.3.0 -NoEdit
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Version tag, e.g. v1.2.3")]
    [ValidatePattern('^v?\d+\.\d+\.\d+(-[\w\.]+)?$')]
    [string]$Version,

    [string]$SourceBranch = "develop",
    [string]$TargetBranch = "main",
    [switch]$NoMerge,
    [switch]$Draft,
    [switch]$Prerelease,
    [string[]]$AssetPath,
    [switch]$NoEdit,
    [string]$Editor = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
function Write-Step { param($msg) Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Fail { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }
function Write-Info { param($msg) Write-Host "  · $msg" -ForegroundColor Gray }
function Write-Warn { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }

function Resolve-Editor {
    if ($Editor)      { return $Editor }
    if ($env:EDITOR)  { return $env:EDITOR }
    foreach ($c in @("code --wait", "notepad++", "notepad")) {
        $bin = $c.Split(" ")[0]
        if (Get-Command $bin -ErrorAction SilentlyContinue) { return $c }
    }
    return "notepad"
}

# ─────────────────────────────────────────────
# 1. Pre-flight checks
# ─────────────────────────────────────────────
Write-Step "Pre-flight checks"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Fail "git not found in PATH" }
Write-OK "git found"

if (-not (Get-Command gh -ErrorAction SilentlyContinue))  { Write-Fail "gh CLI not found. Install: https://cli.github.com" }
Write-OK "gh CLI found"

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Fail "gh is not authenticated. Run: gh auth login" }
Write-OK "gh authenticated"

$repoRoot = git rev-parse --show-toplevel 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "Not inside a git repository" }
Write-OK "Git repo: $repoRoot"

$changes = git status --porcelain
if ($changes) { Write-Fail "Repo has uncommitted changes. Commit or stash them first.`n$changes" }
Write-OK "Working tree clean"

if ($Version -notmatch '^v') { $Version = "v$Version" }

$existingTag = git tag -l $Version
if ($existingTag) { Write-Fail "Tag '$Version' already exists." }
Write-OK "Tag '$Version' is available"

Write-Info "Version : $Version"
Write-Info "Branches: $SourceBranch → $TargetBranch"

# ─────────────────────────────────────────────
# 2. Branch management
# ─────────────────────────────────────────────
if (-not $NoMerge) {
    Write-Step "Branch management: $SourceBranch → $TargetBranch"

    $sourceBranchExists = git branch -a --list "*$SourceBranch*"
    if (-not $sourceBranchExists) { Write-Fail "Source branch '$SourceBranch' not found" }

    git checkout $TargetBranch 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to checkout '$TargetBranch'" }
    Write-OK "Checked out '$TargetBranch'"

    git pull origin $TargetBranch --quiet
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to pull '$TargetBranch' from origin" }
    Write-OK "Pulled latest '$TargetBranch'"

    git merge $SourceBranch --no-ff -m "chore: merge $SourceBranch for release $Version" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "Merge failed. Resolve conflicts and re-run." }
    Write-OK "Merged '$SourceBranch' into '$TargetBranch'"
} else {
    Write-Step "Skipping merge (-NoMerge)"
    Write-Info "Current branch: $(git branch --show-current)"
}

# ─────────────────────────────────────────────
# 3. Resolve changelog range
# ─────────────────────────────────────────────
Write-Step "Resolving changelog range"

$prevTag = git tag --sort=-creatordate | Where-Object { $_ -ne $Version } | Select-Object -First 1

if ($prevTag) {
    Write-OK "Previous tag: $prevTag"
    $logRange = "$prevTag..HEAD"
} else {
    Write-Warn "No previous tag — changelog will include all commits"
    $logRange = "HEAD"
}

# ─────────────────────────────────────────────
# 4. Auto-generate structured changelog
# ─────────────────────────────────────────────
Write-Step "Generating changelog from commits ($logRange)"

$rawCommits = git log $logRange --pretty=format:"%H|%s|%b<END>" 2>$null

$sections = [ordered]@{
    breaking    = [System.Collections.Generic.List[string]]::new()
    features    = [System.Collections.Generic.List[string]]::new()
    fixes       = [System.Collections.Generic.List[string]]::new()
    performance = [System.Collections.Generic.List[string]]::new()
    refactor    = [System.Collections.Generic.List[string]]::new()
    docs        = [System.Collections.Generic.List[string]]::new()
    maintenance = [System.Collections.Generic.List[string]]::new()
    other       = [System.Collections.Generic.List[string]]::new()
}

$commitBlocks = ($rawCommits -join "`n") -split "<END>" | Where-Object { $_.Trim() }

foreach ($block in $commitBlocks) {
    $lines   = $block.Trim() -split "\|", 3
    if ($lines.Count -lt 2) { continue }

    $hash    = $lines[0].Trim().Substring(0, [Math]::Min(7, $lines[0].Trim().Length))
    $subject = $lines[1].Trim()
    $body    = if ($lines.Count -gt 2) { $lines[2].Trim() } else { "" }

    if ($subject -match '^Merge (branch|pull request)')  { continue }
    if ($subject -match '^chore: merge .+ for release')  { continue }

    $entry = "- $subject (``$hash``)"

    if ($body -match 'BREAKING CHANGE') { $sections.breaking.Add($entry); continue }

    switch -Regex ($subject) {
        '^feat(\(.+\))?!:'                                    { $sections.breaking.Add($entry);    break }
        '^feat(ure)?(\(.+\))?:'                               { $sections.features.Add($entry);    break }
        '^(fix|bugfix|hotfix)(\(.+\))?:'                      { $sections.fixes.Add($entry);       break }
        '^perf(\(.+\))?:'                                     { $sections.performance.Add($entry); break }
        '^refactor(\(.+\))?:'                                 { $sections.refactor.Add($entry);    break }
        '^docs?(\(.+\))?:'                                    { $sections.docs.Add($entry);        break }
        '^(chore|build|ci)(\(.+\))?:'                        { $sections.maintenance.Add($entry); break }
        default                                               { $sections.other.Add($entry) }
    }
}

$sectionMap = [ordered]@{
    breaking    = "### 💥 Breaking Changes"
    features    = "### ✨ New Features"
    fixes       = "### 🐛 Bug Fixes"
    performance = "### ⚡ Performance"
    refactor    = "### ♻️ Refactoring"
    docs        = "### 📚 Documentation"
    maintenance = "### 🔧 Maintenance"
    other       = "### 📦 Other Changes"
}

$bodyLines = [System.Collections.Generic.List[string]]::new()
foreach ($key in $sectionMap.Keys) {
    if ($sections[$key].Count -gt 0) {
        $bodyLines.Add($sectionMap[$key])
        $sections[$key] | ForEach-Object { $bodyLines.Add($_) }
        $bodyLines.Add("")
    }
}
if ($bodyLines.Count -eq 0) {
    $bodyLines.Add("_No significant changes found in this release._")
    $bodyLines.Add("")
}

$totalCommits = ($sections.Values | ForEach-Object { $_.Count } | Measure-Object -Sum).Sum
Write-OK "$totalCommits commits categorized"

$repoUrl     = (git remote get-url origin 2>$null) -replace '\.git$','' -replace 'git@github\.com:','https://github.com/'
$compareUrl  = if ($prevTag) { "$repoUrl/compare/$prevTag...$Version" } else { "$repoUrl/commits/$Version" }
$releaseDate = Get-Date -Format "yyyy-MM-dd"

# ─────────────────────────────────────────────
# 5. Build changelog entry (Keep a Changelog format)
# ─────────────────────────────────────────────

$changelogEntry = "## [$Version] - $releaseDate`n`n$($bodyLines -join "`n")"

$releaseNotes = @"
## What's Changed

$($bodyLines -join "`n")
---
**Full Changelog**: $compareUrl
"@

# ─────────────────────────────────────────────
# 6. Edit step — open in editor for review
# ─────────────────────────────────────────────
if (-not $NoEdit) {
    Write-Step "Opening changelog entry for review/edit"

    $tmpFile = [System.IO.Path]::GetTempFileName() -replace '\.tmp$','.md'

    $editContent = @"
<!-- ═══════════════════════════════════════════════════════════════
     REVIEW & EDIT — Save and close this file to continue.
     Lines starting with <!-- are comments and won't be included.
     ═══════════════════════════════════════════════════════════════ -->

$changelogEntry
"@
    Set-Content -Path $tmpFile -Value $editContent -Encoding UTF8

    $editorCmd = Resolve-Editor
    Write-Info "Editor: $editorCmd"
    Write-Host ""
    Write-Host "  ✏  Edit the changelog, then save and close the editor to continue..." -ForegroundColor Yellow
    Write-Host "     (use -NoEdit to skip this step next time)" -ForegroundColor DarkGray

    $editorParts = $editorCmd -split " ", 2
    if ($editorParts.Count -gt 1) {
        & $editorParts[0] $editorParts[1] $tmpFile
    } else {
        & $editorCmd $tmpFile
    }

    # Read back — strip comment lines
    $editedLines  = Get-Content -Path $tmpFile -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*<!--' }
    $changelogEntry = ($editedLines -join "`n").Trim()

    # Rebuild release notes from edited body (skip the ## header line)
    $editedBody = ($changelogEntry -split "`n" | Select-Object -Skip 1) -join "`n"
    $releaseNotes = @"
## What's Changed
$editedBody

---
**Full Changelog**: $compareUrl
"@

    Remove-Item $tmpFile -ErrorAction SilentlyContinue
    Write-OK "Changelog entry accepted"
} else {
    Write-Info "Skipping edit step (-NoEdit)"
}

# ─────────────────────────────────────────────
# 7. Update CHANGELOG.md
# ─────────────────────────────────────────────
Write-Step "Updating CHANGELOG.md"

$changelogPath = Join-Path $repoRoot "CHANGELOG.md"

if (Test-Path $changelogPath) {
    $existing = Get-Content $changelogPath -Raw -Encoding UTF8

    # Insert after top-level header + description block, before first release entry
    if ($existing -match '(?s)(^# [^\n]+\n.*?\n\n)(.*)') {
        $newContent = "$($Matches[1])$changelogEntry`n`n$($Matches[2])"
    } else {
        $newContent = "$changelogEntry`n`n$existing"
    }
    Write-OK "Prepended entry to existing CHANGELOG.md"
} else {
    $newContent = @"
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

$changelogEntry
"@
    Write-OK "Created new CHANGELOG.md"
}

Set-Content -Path $changelogPath -Value $newContent.TrimEnd() -Encoding UTF8 -NoNewline

# ─────────────────────────────────────────────
# 8. Commit CHANGELOG.md
# ─────────────────────────────────────────────
Write-Step "Committing CHANGELOG.md"

git add (Join-Path $repoRoot "CHANGELOG.md")
git commit -m "chore(release): update CHANGELOG.md for $Version"
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to commit CHANGELOG.md" }
Write-OK "CHANGELOG.md committed"

# ─────────────────────────────────────────────
# 9. Create annotated tag
# ─────────────────────────────────────────────
Write-Step "Creating annotated tag: $Version"

git tag -a $Version -m "Release $Version"
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to create tag '$Version'" }
Write-OK "Tag '$Version' created"

# ─────────────────────────────────────────────
# 10. Push branch + tag
# ─────────────────────────────────────────────
Write-Step "Pushing to origin"

if (-not $NoMerge) {
    git push origin $TargetBranch --quiet
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to push branch '$TargetBranch'" }
    Write-OK "Pushed branch '$TargetBranch'"
}

git push origin $Version
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to push tag '$Version'" }
Write-OK "Pushed tag '$Version'"

# ─────────────────────────────────────────────
# 11. Create GitHub Release
# ─────────────────────────────────────────────
Write-Step "Creating GitHub Release"

$ghArgs = @(
    "release", "create", $Version,
    "--title", "Release $Version",
    "--notes", $releaseNotes
)
if ($Draft)      { $ghArgs += "--draft" }
if ($Prerelease) { $ghArgs += "--prerelease" }
if ($AssetPath)  { $ghArgs += $AssetPath }

& gh @ghArgs
if ($LASTEXITCODE -ne 0) { Write-Fail "gh release create failed" }

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  ✅  Release $Version published successfully"    -ForegroundColor Green
if ($Draft)      { Write-Host "  📋  Status: DRAFT (not publicly visible)"    -ForegroundColor Yellow }
if ($Prerelease) { Write-Host "  🧪  Marked: PRE-RELEASE"                     -ForegroundColor Yellow }
Write-Host "  📄  CHANGELOG.md updated and committed"        -ForegroundColor Green
Write-Host "  🔗  $repoUrl/releases/tag/$Version"            -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan