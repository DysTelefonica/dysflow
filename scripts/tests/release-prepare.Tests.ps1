# Pester tests for scripts/release-prepare.ps1. Pins the contract that the
# release-prepare script refuses to run when its preconditions are not met
# (dirty working tree, behind origin, no gh CLI, non-greater version, etc.)
# so that a future refactor cannot silently regress to "publish a broken
# release" again — the exact failure mode documented in the Engram topic
# `dysflow/release/process-gap-2026-06-29`.

BeforeAll {
    $script:scriptPath = Join-Path $PSScriptRoot "..\release-prepare.ps1"
    if (-not (Test-Path $script:scriptPath)) {
        throw "release-prepare.ps1 not found at $($script:scriptPath)"
    }
    $script:scriptText = Get-Content $script:scriptPath -Raw
}

Describe "release-prepare.ps1 surface contract" {
    It "exists at scripts/release-prepare.ps1" {
        Test-Path $script:scriptPath | Should -BeTrue
    }

    It "declares both -Bump and -Version parameters" {
        $script:scriptText | Should -Match '\[string\]\s*\$Bump'
        $script:scriptText | Should -Match '\[string\]\s*\$Version'
    }

    It "validates -Bump values (patch, minor, major)" {
        $script:scriptText | Should -Match 'ValidateSet\("patch",\s*"minor",\s*"major"\)'
    }

    It "refuses to run on a dirty working tree" {
        $script:scriptText | Should -Match 'Working tree is dirty'
        $script:scriptText | Should -Match 'git status --porcelain'
    }

    It "refuses when local main is ahead of origin/main" {
        $script:scriptText | Should -Match 'origin/main\.\.HEAD'
        $script:scriptText | Should -Match 'would land un-CI'
    }

    It "checks gh CLI availability before mutating anything" {
        $script:scriptText | Should -Match 'gh --version'
        $script:scriptText | Should -Match 'gh auth login'
    }

    It "rejects a version that is not greater than the current one" {
        $script:scriptText | Should -Match 'is not greater than current'
    }

    It "requires explicit -Bump or -Version (no implicit bump)" {
        $script:scriptText | Should -Match 'Specify -Bump .* or -Version X\.Y\.Z'
    }
}

Describe "release-prepare.ps1 CI-gating contract" {
    It "calls 'gh run list --workflow ci.yml' to find the run for the release SHA" {
        $script:scriptText | Should -Match 'gh run list.*workflow ci\.yml'
        $script:scriptText | Should -Match 'headSha'
    }

    It "polls CI status with a bounded timeout (does not block forever)" {
        $script:scriptText | Should -Match '\$maxWaitSeconds\s*=\s*\d+'
        $script:scriptText | Should -Match '\$pollSeconds'
    }

    It "refuses to tag if CI conclusion is not 'success'" {
        $script:scriptText | Should -Match 'CI concluded with'
        $script:scriptText | Should -Match 'NOT pushing the tag'
    }

    It "matches the release SHA precisely (not the latest run)" {
        # The script must poll by headSha == our commit, not by 'latest run',
        # so a concurrent CI run for an unrelated branch cannot be mistaken
        # for the release run.
        $script:scriptText | Should -Match '\$matchingRun = \$runJson \| Where-Object \{ \$_\.headSha -eq \$headSha \}'
    }
}

Describe "release-prepare.ps1 tag + push contract" {
    It "creates an annotated tag" {
        $script:scriptText | Should -Match 'git tag -a'
    }

    It "pushes the tag to origin" {
        $script:scriptText | Should -Match 'git push origin \$tag'
    }

    It "logs the release.yml workflow expectation so the operator knows what comes next" {
        $script:scriptText | Should -Match 'Sign SHA256SUMS with Ed25519'
        $script:scriptText | Should -Match 'release\.yml'
    }
}