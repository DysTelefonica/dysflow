# scripts/release-prepare.ps1
#
# Safe release preparation workflow for dysflow. Closes the CI/tag race gap
# documented in the Engram topic "dysflow/release/process-gap-2026-06-29":
#
#   1. Bump package.json version (interactive: patch | minor | major | explicit).
#   2. Generate one CHANGELOG bullet per non-merge commit and run the
#      changelog format quality gate locally.
#   3. Stage CHANGELOG.md + package.json and commit "chore(release): prepare vX.Y.Z".
#   4. Push to origin/main.
#   5. Wait for the CI workflow on the release commit to reach
#      `conclusion: success` (or fail loudly if it stays red).
#   6. ONLY when CI is green: create annotated tag vX.Y.Z and push it.
#   7. The existing `.github/workflows/release.yml` fires on the tag push,
#      builds the tarball, signs SHA256SUMS with Ed25519, and publishes the
#      GitHub Release with the assets.
#
# Usage:
#   pwsh -File scripts/release-prepare.ps1 -Bump minor -SemanticAuditEvidencePath C:\audit\semantic-audit.json
#   pwsh -File scripts/release-prepare.ps1 -Bump patch -SemanticAuditEvidencePath C:\audit\semantic-audit.json
#   pwsh -File scripts/release-prepare.ps1 -Version 1.11.2 -SemanticAuditEvidencePath C:\audit\semantic-audit.json
#   pwsh -File scripts/release-prepare.ps1 -Resume -Version 1.11.2
# Non-resume preparation requires the current, candidate-bound, gate-clean JSON report emitted by
# Invoke-DysflowSemanticAudit.ps1.
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
    [string]$Version,
    [switch]$Resume,
    [string]$SemanticAuditEvidencePath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function New-ReleaseChangelogSection {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory)]
        [string]$Tag,
        [Parameter(Mandatory)]
        [string]$Date,
        [string[]]$CommitSubjects = @()
    )

    $notes = @(
        $CommitSubjects |
            Where-Object { $_ -and $_ -notmatch '^Merge pull request\b' } |
            ForEach-Object {
                "- $($_.Trim() -replace ' - ', ' — ')"
            }
    )
    if ($notes.Count -eq 0) {
        $notes = @("- No user-visible changes were detected; verify the previous tag.")
    }
    $noteLines = $notes -join [Environment]::NewLine

    return @"
## [$Tag] - $Date

### Changes

$noteLines

"@
}

function Test-ReleaseChangelogQuality {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory)]
        [string]$ChangelogPath,
        [string]$RepoRoot = (Get-Location).Path,
        [string]$QualityGatePath = "test/quality-gates/changelog-release-entry-format.test.ts",
        [ValidateRange(1, 3600)]
        [int]$TimeoutSeconds = 120,
        [switch]$Quiet
    )

    $resolvedChangelog = (Resolve-Path $ChangelogPath).Path
    $previousChangelogPath = $env:DYSFLOW_CHANGELOG_PATH
    try {
        $env:DYSFLOW_CHANGELOG_PATH = $resolvedChangelog
        Push-Location $RepoRoot
        try {
            $pnpmFilePath = "pnpm"
            if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
                $pnpmCommand = @(
                    @("pnpm.exe", "pnpm.cmd") |
                        ForEach-Object {
                            Get-Command $_ -CommandType Application -ErrorAction SilentlyContinue |
                                Select-Object -First 1
                        }
                ) | Select-Object -First 1
                if ($null -eq $pnpmCommand) {
                    throw "pnpm executable not found. Install pnpm and ensure pnpm.exe or pnpm.cmd is on PATH."
                }
                $pnpmFilePath = $pnpmCommand.Source
            }

            $process = Start-Process -FilePath $pnpmFilePath `
                -ArgumentList @("exec", "vitest", "run", $QualityGatePath) `
                -PassThru -NoNewWindow
            if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
                $process.Kill($true)
                $process.WaitForExit()
                throw "Local changelog quality gate timed out after $TimeoutSeconds s; its owned process tree was terminated."
            }
            return $process.ExitCode -eq 0
        } finally {
            Pop-Location
        }
    } finally {
        $env:DYSFLOW_CHANGELOG_PATH = $previousChangelogPath
    }
}

function Assert-ReleaseChangelogQuality {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory)]
        [string]$ChangelogPath,
        [string]$RepoRoot = (Get-Location).Path,
        [string]$QualityGatePath = "test/quality-gates/changelog-release-entry-format.test.ts",
        [int]$TimeoutSeconds = 120
    )

    if (-not (Test-ReleaseChangelogQuality `
        -ChangelogPath $ChangelogPath `
        -RepoRoot $RepoRoot `
        -QualityGatePath $QualityGatePath `
        -TimeoutSeconds $TimeoutSeconds)) {
        throw "Local changelog quality gate failed before creating or pushing the release commit."
    }
}

function Update-ReleaseVersionStamp {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [Version]$Version
    )

    $bytes = [IO.File]::ReadAllBytes($Path)
    $encoding = [Text.UTF8Encoding]::new($false, $true)
    $preambleLength = 0
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $encoding = [Text.UTF8Encoding]::new($true, $true)
        $preambleLength = 3
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        $encoding = [Text.UnicodeEncoding]::new($false, $true, $true)
        $preambleLength = 2
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
        $encoding = [Text.UnicodeEncoding]::new($true, $true, $true)
        $preambleLength = 2
    }

    $text = $encoding.GetString($bytes, $preambleLength, $bytes.Length - $preambleLength)
    $pattern = '(?i)verified for the v(?<version>[^\s]+) release'
    $matches = [regex]::Matches($text, $pattern)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one release version stamp in $Path; found $($matches.Count)."
    }
    $versionToken = $matches[0].Groups['version']
    $updated = $text.Remove($versionToken.Index, $versionToken.Length).Insert(
        $versionToken.Index,
        [string]$Version
    )
    $body = $encoding.GetBytes($updated)
    if ($preambleLength -eq 0) {
        [IO.File]::WriteAllBytes($Path, $body)
        return
    }
    $preamble = $encoding.GetPreamble()
    $output = [byte[]]::new($preamble.Length + $body.Length)
    [Array]::Copy($preamble, 0, $output, 0, $preamble.Length)
    [Array]::Copy($body, 0, $output, $preamble.Length, $body.Length)
    [IO.File]::WriteAllBytes($Path, $output)
}

function Update-SkillDysflowVersionStamp {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [Version]$Version
    )

    $bytes = [IO.File]::ReadAllBytes($Path)
    $encoding = [Text.UTF8Encoding]::new($false, $true)
    $preambleLength = 0
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $encoding = [Text.UTF8Encoding]::new($true, $true)
        $preambleLength = 3
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        $encoding = [Text.UnicodeEncoding]::new($false, $true, $true)
        $preambleLength = 2
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
        $encoding = [Text.UnicodeEncoding]::new($true, $true, $true)
        $preambleLength = 2
    }

    $text = $encoding.GetString($bytes, $preambleLength, $bytes.Length - $preambleLength)
    $pattern = '(?m)^[ \t]*last_dysflow_version:[ \t]*"(?<version>[^"\r\n]+)"[^\r\n]*\r?$'
    $matches = [regex]::Matches($text, $pattern)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one last_dysflow_version field in $Path; found $($matches.Count)."
    }
    $versionToken = $matches[0].Groups['version']
    $updated = $text.Remove($versionToken.Index, $versionToken.Length).Insert(
        $versionToken.Index,
        [string]$Version
    )
    $body = $encoding.GetBytes($updated)
    if ($preambleLength -eq 0) {
        [IO.File]::WriteAllBytes($Path, $body)
        return
    }
    $preamble = $encoding.GetPreamble()
    $output = [byte[]]::new($preamble.Length + $body.Length)
    [Array]::Copy($preamble, 0, $output, 0, $preamble.Length)
    [Array]::Copy($body, 0, $output, $preamble.Length, $body.Length)
    [IO.File]::WriteAllBytes($Path, $output)
}

function Assert-ReleaseSemanticAuditEvidence {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [Version]$CurrentVersion,
        [Parameter(Mandatory)]
        [string]$CurrentHead
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Current drift-free semantic-audit evidence is required before release preparation: $Path"
    }
    try {
        $evidence = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json -Depth 100
    } catch {
        throw "Semantic-audit evidence is not valid JSON: $Path"
    }
    $requiredFields = @(
        'schemaVersion', 'repositoryHead', 'repositoryClean', 'adapterVersion',
        'DRIFT', 'RUNTIME CONTRACT GAP', 'findings', 'runtimeGaps'
    )
    $missingFields = @($requiredFields | Where-Object { $_ -notin $evidence.PSObject.Properties.Name })
    if ($missingFields.Count -gt 0) {
        throw "Semantic-audit evidence does not match the canonical report; missing: $($missingFields -join ', ')."
    }
    if ($evidence.schemaVersion -cne 'dysflow.semantic-audit/v1') {
        throw "Semantic-audit evidence uses unsupported schemaVersion '$($evidence.schemaVersion)'."
    }
    if ([string]$evidence.repositoryHead -notmatch '^[0-9a-f]{40}$') {
        throw "Semantic-audit evidence has a malformed repositoryHead binding."
    }
    if ([string]$evidence.repositoryHead -cne $CurrentHead) {
        throw "Semantic-audit evidence targets repository HEAD $($evidence.repositoryHead), not current candidate $CurrentHead."
    }
    if ($evidence.repositoryClean -isnot [bool] -or $evidence.repositoryClean -ne $true) {
        throw "Semantic-audit evidence is not bound to a clean repository candidate."
    }
    if ([string]$evidence.adapterVersion -ne [string]$CurrentVersion) {
        throw "Semantic-audit evidence targets adapter $($evidence.adapterVersion), not current candidate $CurrentVersion."
    }
    if (@($evidence.DRIFT).Count -gt 0 -or @($evidence.findings).Count -gt 0) {
        throw "Semantic-audit evidence reports drift; release metadata will not be advanced."
    }
    if (@($evidence.'RUNTIME CONTRACT GAP').Count -gt 0 -or @($evidence.runtimeGaps).Count -gt 0) {
        throw "Semantic-audit evidence reports a runtime contract gap; release metadata will not be advanced."
    }
}

function Invoke-ReleasePrepare {
    [CmdletBinding()]
    Param(
        [ValidateSet("patch", "minor", "major")]
        [string]$Bump,
        [string]$Version,
        [switch]$Resume,
        [string]$SemanticAuditEvidencePath,
        [int]$GateTimeoutSeconds = 120,
        [int]$CiMaxWaitSeconds = 600,
        [int]$CiPollSeconds = 10
    )

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

if ($Resume) {
    if ($Bump) {
        throw "-Resume cannot be combined with -Bump. Pass the already prepared -Version only."
    }
    if (-not $Version) {
        throw "-Resume requires the already prepared -Version X.Y.Z."
    }
    if ($Version -notmatch '^\d+\.\d+\.\d+$') {
        throw "Version must be semver (e.g. 1.11.2). Got: $Version"
    }
    $next = [Version]$Version
    if ($next -ne $current) {
        throw "Resume version $next does not match package.json version $current."
    }
} elseif ($Version) {
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

if (-not $Resume -and $next -le $current) {
    throw "Next version $next is not greater than current $current. Use a higher version."
}

if (-not $Resume) {
    if ([string]::IsNullOrWhiteSpace($SemanticAuditEvidencePath)) {
        throw "Current drift-free semantic-audit evidence is required before release preparation."
    }
    $candidateHead = [string](git rev-parse HEAD)
    if ($candidateHead -notmatch '^[0-9a-f]{40}$') {
        throw "Semantic-audit evidence cannot be bound because current repository HEAD is invalid."
    }
    Assert-ReleaseSemanticAuditEvidence `
        -Path $SemanticAuditEvidencePath `
        -CurrentVersion $current `
        -CurrentHead $candidateHead
}

$tag = "v$next"
if ($Resume) {
    Write-Host "Resuming already prepared $tag without mutating release files." -ForegroundColor Cyan
} else {
    Write-Host "Bumping $current -> $next (tag $tag)" -ForegroundColor Cyan
}

$packagePath = (Resolve-Path "package.json").Path
$changelogPath = Join-Path (Get-Location).Path "CHANGELOG.md"
$stampPaths = @(
    (Join-Path (Get-Location).Path "skills/dysflow-usage/references/error-codes.md"),
    (Join-Path (Get-Location).Path "skills/dysflow-usage/assets/write-flags-matrix.md")
)
$skillRelativePaths = @(
    "skills/dysflow-arnes/SKILL.md", "skills/dysflow-usage/SKILL.md", "skills/dysflow-codegraph-update/SKILL.md",
    "skills/dysflow-examples-sync/SKILL.md", "skills/dysflow-pointer-rollout/SKILL.md"
)
$skillPaths = @($skillRelativePaths | ForEach-Object { Join-Path (Get-Location).Path $_ })

if ($Resume) {
    $headSha = git rev-parse HEAD
    $originMainSha = git rev-parse origin/main
    if (-not $headSha -or $headSha -ne $originMainSha) {
        throw "Release recovery requires HEAD to equal origin/main exactly."
    }
    $existingTag = git rev-parse --verify "refs/tags/$tag" 2>$null
    $existingRemoteTag = git ls-remote --tags origin "refs/tags/$tag" 2>$null
    if ($existingTag -or $existingRemoteTag) {
        throw "Cannot resume $tag because the tag already exists."
    }
    $existingRelease = gh release view $tag --json tagName 2>$null
    if ($existingRelease) {
        throw "Cannot resume $tag because the GitHub Release already exists."
    }
    if ((Get-Content $changelogPath -Raw) -notmatch "(?m)^## \[$([regex]::Escape($tag))\] - ") {
        throw "Cannot resume $tag because CHANGELOG.md has no prepared release section."
    }
    foreach ($stampPath in $stampPaths) {
        if ((Get-Content $stampPath -Raw) -notmatch "(?i)verified for the v$([regex]::Escape([string]$next)) release") {
            throw "Cannot resume $tag because $stampPath does not carry the prepared version stamp."
        }
    }
    foreach ($skillPath in $skillPaths) {
        if ((Get-Content $skillPath -Raw) -notmatch "(?m)^[ \t]*last_dysflow_version:[ \t]*`"$([regex]::Escape([string]$next))`"") {
            throw "Cannot resume $tag because $skillPath does not carry the prepared last_dysflow_version."
        }
    }
} else {
$packageBefore = [IO.File]::ReadAllBytes($packagePath)
$changelogExisted = Test-Path $changelogPath
$changelogBefore = if ($changelogExisted) { [IO.File]::ReadAllBytes($changelogPath) } else { $null }
$stampBytesBefore = @{}
foreach ($stampPath in $stampPaths) {
    if (-not (Test-Path $stampPath)) { throw "Release-owned version stamp file not found: $stampPath" }
    $stampBytesBefore[$stampPath] = [IO.File]::ReadAllBytes($stampPath)
}
$skillBytesBefore = @{}
foreach ($skillPath in $skillPaths) {
    if (-not (Test-Path $skillPath)) { throw "Release-owned skill file not found: $skillPath" }
    $skillBytesBefore[$skillPath] = [IO.File]::ReadAllBytes($skillPath)
}
$preCommitSucceeded = $false
try {
# Update package.json (preserve formatting: parse, modify, emit).
$pkgRaw = Get-Content $packagePath -Raw
$pkgRaw = $pkgRaw -replace '"version"\s*:\s*"[^"]+"', ('"version": "{0}"' -f $next)
Set-Content $packagePath -Value $pkgRaw -NoNewline

# Update CHANGELOG.md (prepend one physical note per non-merge commit since the last tag).
$lastTag = git describe --tags --abbrev=0 2>$null
if ($null -eq $lastTag) {
    $logRange = "HEAD"
    $date = (Get-Date).ToString("yyyy-MM-dd")
} else {
    $logRange = "$lastTag..HEAD"
    $date = (Get-Date).ToString("yyyy-MM-dd")
}

foreach ($stampPath in $stampPaths) {
    Update-ReleaseVersionStamp -Path $stampPath -Version $next
}
foreach ($skillPath in $skillPaths) {
    Update-SkillDysflowVersionStamp -Path $skillPath -Version $next
}

$commits = git log $logRange --no-merges --pretty=format:"%s" 2>$null
$changelogNewSection = New-ReleaseChangelogSection `
    -Tag $tag `
    -Date $date `
    -CommitSubjects $commits

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

# Validate the exact file that would be committed. A malformed generated entry
# must fail locally before the release commit can make main red.
Assert-ReleaseChangelogQuality -ChangelogPath $changelogPath -TimeoutSeconds $GateTimeoutSeconds
$releasePaths = @(
    "package.json",
    "CHANGELOG.md",
    "skills/dysflow-usage/references/error-codes.md",
    "skills/dysflow-usage/assets/write-flags-matrix.md"
) + $skillRelativePaths
git add @releasePaths
$preCommitSucceeded = $true
} finally {
    if (-not $preCommitSucceeded) {
        [IO.File]::WriteAllBytes($packagePath, $packageBefore)
        if ($changelogExisted) {
            [IO.File]::WriteAllBytes($changelogPath, $changelogBefore)
        } elseif (Test-Path $changelogPath) {
            Remove-Item $changelogPath -Force
        }
        foreach ($stampPath in $stampPaths) {
            [IO.File]::WriteAllBytes($stampPath, $stampBytesBefore[$stampPath])
        }
        foreach ($skillPath in $skillPaths) {
            [IO.File]::WriteAllBytes($skillPath, $skillBytesBefore[$skillPath])
        }
    }
}

# --- commit + push ----------------------------------------------------------

git commit -m "chore(release): prepare $tag"

$headSha = git rev-parse HEAD
Write-Host "Release commit $headSha created locally. Pushing to origin/main..." -ForegroundColor Cyan
git push origin main
}

# --- wait for CI ------------------------------------------------------------

Write-Host "Waiting for CI to confirm green on $headSha..." -ForegroundColor Cyan
$elapsed = 0
$ciConcluded = $null
$ciRunId = $null

# Find the run that corresponds to our head SHA.
while ($elapsed -lt $CiMaxWaitSeconds -and -not $ciConcluded) {
    Start-Sleep -Seconds $CiPollSeconds
    $elapsed += $CiPollSeconds
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
    throw "CI did not conclude within $CiMaxWaitSeconds s. Check run at: https://github.com/DysTelefonica/dysflow/actions"
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
}

function Invoke-ReleasePrepareEntryPoint {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory)]
        [hashtable]$BoundParameters
    )

    $releaseParameters = @{}
    if ($BoundParameters.ContainsKey("Bump")) {
        $releaseParameters.Bump = $BoundParameters.Bump
    }
    if ($BoundParameters.ContainsKey("Version")) {
        $releaseParameters.Version = $BoundParameters.Version
    }
    if ($BoundParameters.ContainsKey("Resume")) {
        $releaseParameters.Resume = $BoundParameters.Resume
    }
    if ($BoundParameters.ContainsKey("SemanticAuditEvidencePath")) {
        $releaseParameters.SemanticAuditEvidencePath = $BoundParameters.SemanticAuditEvidencePath
    }

    Invoke-ReleasePrepare @releaseParameters
}

if ($MyInvocation.InvocationName -ne ".") {
    Invoke-ReleasePrepareEntryPoint -BoundParameters $PSBoundParameters
}
