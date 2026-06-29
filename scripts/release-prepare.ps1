# scripts/release-prepare.ps1
#
# Safe release preparation workflow for dysflow. Closes the CI/tag race gap
# documented in the Engram topic "dysflow/release/process-gap-2026-06-29":
#
#   1. Bump package.json version (interactive: patch | minor | major | explicit).
#   2. Stage CHANGELOG.md + package.json and commit "chore(release): prepare vX.Y.Z".
#   3. Push to origin/main.
#   4. Wait for the CI workflow on the release commit to reach
#      `conclusion: success` (or fail loudly if it stays red).
#   5. ONLY when CI is green: create annotated tag vX.Y.Z and push it.
#   6. The existing `.github/workflows/release.yml` fires on the tag push,
#      builds the tarball, signs SHA256SUMS with Ed25519, and publishes the
#      GitHub Release with the assets.
#
# Usage:
#   pwsh -File scripts/release-prepare.ps1 -Bump minor
#   pwsh -File scripts/release-prepare.ps1 -Bump patch
#   pwsh -File scripts/release-prepare.ps1 -Version 1.11.2
#
# Pre-flight:
#   - Working tree clean (the script refuses to start on dirty trees so the
#     release commit does not accidentally bundle unrelated work).
#   - All open commits already pushed to origin/main (no "ahead of origin"
#     commits that would land in the release without being CI-tested).
#   - `gh` CLI authenticated, `git` remote `origin` configured.
#
# Reference: docs/security/update-trust-model.md (release signing).
# Reference: .github/workflows/release.yml (publishes on tag push).

[CmdletBinding()]
Param(
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump,
    [string]$Version
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# --- preflight ---------------------------------------------------------------

if (-not (Test-Path "package.json")) {
    throw "package.json not found. Run from the repo root."
}

$status = git status --porcelain
if ($status) {
    Write-Host "Working tree is dirty. Commit or stash before running release." -ForegroundColor Red
    $status | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    throw "Aborting release preparation."
}

$ahead = git rev-list --count "origin/main..HEAD" 2>$null
if ($null -ne $ahead -and $ahead -gt 0) {
    throw "Local main is $ahead commit(s) ahead of origin/main. Push first, or this release would land un-CI'd commits."
}

$ghOk = gh --version 2>$null
if (-not $ghOk) {
    throw "gh CLI not available. Install it and authenticate with `gh auth login`."
}

# --- bump version -----------------------------------------------------------

$pkgJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$current = [Version]$pkgJson.version

if ($Version) {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') {
        throw "Version must be semver (e.g. 1.11.2). Got: $Version"
    }
    $next = [Version]$Version
} elseif ($Bump) {
    $major = $current.Major
    $minor = $current.Minor
    $patch = $current.Build
    switch ($Bump) {
        "patch" { $patch++ }
        "minor" { $minor++; $patch = 0 }
        "major" { $major++; $minor = 0; $patch = 0 }
    }
    $next = [Version]("{0}.{1}.{2}" -f $major, $minor, $patch)
} else {
    throw "Specify -Bump (patch|minor|major) or -Version X.Y.Z"
}

if ($next -le $current) {
    throw "Next version $next is not greater than current $current. Use a higher version."
}

$tag = "v$next"
Write-Host "Bumping $current -> $next (tag $tag)" -ForegroundColor Cyan

# Update package.json (preserve formatting: parse, modify, emit).
$pkgRaw = Get-Content "package.json" -Raw
$pkgRaw = $pkgRaw -replace '"version"\s*:\s*"[^"]+"', ('"version": "{0}"' -f $next)
Set-Content "package.json" -Value $pkgRaw -NoNewline

# Update CHANGELOG.md (prepend a fresh section using git log since the last tag).
$lastTag = git describe --tags --abbrev=0 2>$null
if ($null -eq $lastTag) {
    $logRange = "HEAD"
    $date = (Get-Date).ToString("yyyy-MM-dd")
} else {
    $logRange = "$lastTag..HEAD"
    $date = (Get-Date).ToString("yyyy-MM-dd")
}

$commits = git log $logRange --pretty=format:"- %s" 2>$null
if (-not $commits) {
    $commits = @("- No commits since $lastTag (verify the previous tag is correct)")
}

$changelogNewSection = @"
## [$tag] - $date

$commits

"@

$changelogPath = "CHANGELOG.md"
if (Test-Path $changelogPath) {
    $existing = Get-Content $changelogPath -Raw
    $marker = "# Changelog"
    $idx = $existing.IndexOf($marker)
    if ($idx -lt 0) {
        throw "Could not find '# Changelog' header in CHANGELOG.md"
    }
    $insertAt = $idx + $marker.Length
    $before = $existing.Substring(0, $insertAt)
    $after = $existing.Substring($insertAt)
    Set-Content $changelogPath -Value ($before + "`n`n" + $changelogNewSection + $after) -NoNewline
} else {
    Set-Content $changelogPath -Value ("# Changelog`n`n" + $changelogNewSection) -NoNewline
}

# --- commit + push ----------------------------------------------------------

git add "package.json" "CHANGELOG.md"
git commit -m "chore(release): prepare $tag"

$headSha = git rev-parse HEAD
Write-Host "Release commit $headSha created locally. Pushing to origin/main..." -ForegroundColor Cyan
git push origin main

# --- wait for CI ------------------------------------------------------------

Write-Host "Waiting for CI to confirm green on $headSha..." -ForegroundColor Cyan
$maxWaitSeconds = 600  # 10 minutes — e2e + unit tests usually finish in ~2 min
$pollSeconds = 10
$elapsed = 0
$ciConcluded = $null
$ciRunId = $null

# Find the run that corresponds to our head SHA.
while ($elapsed -lt $maxWaitSeconds -and -not $ciConcluded) {
    Start-Sleep -Seconds $pollSeconds
    $elapsed += $pollSeconds
    $runJson = gh run list --limit 20 --workflow ci.yml --json databaseId,headSha,status,conclusion 2>$null | ConvertFrom-Json
    $matchingRun = $runJson | Where-Object { $_.headSha -eq $headSha } | Select-Object -First 1
    if ($matchingRun) {
        $ciRunId = $matchingRun.databaseId
        if ($matchingRun.status -eq "completed") {
            $ciConcluded = $matchingRun.conclusion
            break
        }
    }
    Write-Host "  ($elapsed s) waiting..."
}

if (-not $ciConcluded) {
    throw "CI did not conclude within $maxWaitSeconds s. Check run at: https://github.com/DysTelefonica/dysflow/actions"
}

if ($ciConcluded -ne "success") {
    throw "CI concluded with '$ciConcluded' on $headSha. NOT pushing the tag. Inspect: https://github.com/DysTelefonica/dysflow/actions/runs/$ciRunId"
}

Write-Host "CI green. Tagging $tag and pushing..." -ForegroundColor Green

# --- tag + push -------------------------------------------------------------

git tag -a $tag -m $tag
git push origin $tag

Write-Host ""
Write-Host "Release $tag dispatched. The release.yml workflow will:" -ForegroundColor Green
Write-Host "  - Build the tarball"
Write-Host "  - Sign SHA256SUMS with Ed25519"
Write-Host "  - Publish the GitHub Release with the assets"
Write-Host ""
Write-Host "Watch progress: gh run watch --workflow release.yml"