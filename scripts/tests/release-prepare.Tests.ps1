# Behavioral tests for scripts/release-prepare.ps1.
#
# The production script is parsed as PowerShell and its functions are loaded
# into the test scope. Tests exercise the functions rather than asserting on
# implementation source text.

BeforeAll {
    $script:repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
    $script:scriptPath = Join-Path $script:repoRoot "scripts\release-prepare.ps1"
    $script:qualityGatePath = Join-Path $script:repoRoot "test\quality-gates\changelog-release-entry-format.test.ts"
    $script:baseChangelog = Get-Content (Join-Path $script:repoRoot "CHANGELOG.md") -Raw
    $script:candidateHead = "a" * 40
    $script:skillNames = @(
        "dysflow-arnes", "dysflow-usage", "dysflow-codegraph-update", "dysflow-examples-sync", "dysflow-pointer-rollout"
    )

    $tokens = $null
    $parseErrors = $null
    $scriptAst = [System.Management.Automation.Language.Parser]::ParseFile(
        $script:scriptPath,
        [ref]$tokens,
        [ref]$parseErrors
    )
    if ($parseErrors.Count -gt 0) {
        throw "release-prepare.ps1 has parse errors: $($parseErrors.Message -join '; ')"
    }

    function Import-ReleaseFunction([string]$Name) {
        $functionAst = $scriptAst.Find(
            {
                param($node)
                $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                $node.Name -eq $Name
            },
            $true
        )
        if ($null -eq $functionAst) {
            throw "Function '$Name' not found in release-prepare.ps1"
        }
        Set-Item -Path "Function:\global:$Name" -Value $functionAst.Body.GetScriptBlock()
    }

    Import-ReleaseFunction "New-ReleaseChangelogSection"
    Import-ReleaseFunction "Test-ReleaseChangelogQuality"
    Import-ReleaseFunction "Assert-ReleaseChangelogQuality"
    Import-ReleaseFunction "Update-ReleaseVersionStamp"
    Import-ReleaseFunction "Update-SkillDysflowVersionStamp"
    Import-ReleaseFunction "Assert-ReleaseSemanticAuditEvidence"
    Import-ReleaseFunction "Invoke-ReleasePrepare"
    Import-ReleaseFunction "Invoke-ReleasePrepareEntryPoint"

    function Add-ReleaseSectionToFixture([string]$Section, [string]$Path) {
        $marker = "# Changelog"
        $insertAt = $script:baseChangelog.IndexOf($marker) + $marker.Length
        $fixture = $script:baseChangelog.Substring(0, $insertAt) +
            "`n`n" +
            $Section +
            $script:baseChangelog.Substring($insertAt)
        Set-Content -LiteralPath $Path -Value $fixture -NoNewline
    }

    function Set-FixtureSkillVersion([string]$Root, [string]$Version) {
        foreach ($name in $script:skillNames) {
            $path = Join-Path $Root "skills/$name/SKILL.md"
            $bytes = [IO.File]::ReadAllBytes($path)
            $text = [Text.UTF8Encoding]::new($false, $true).GetString($bytes)
            $updated = $text.Replace('last_dysflow_version: "4.0.5"', "last_dysflow_version: `"$Version`"")
            [IO.File]::WriteAllBytes($path, [Text.UTF8Encoding]::new($false).GetBytes($updated))
        }
    }

    function New-ReleaseRepoFixture {
        $root = Join-Path $TestDrive ([guid]::NewGuid())
        New-Item -ItemType Directory -Path $root | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $root "skills/dysflow-usage/references") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $root "skills/dysflow-usage/assets") -Force | Out-Null
        Set-Content (Join-Path $root "package.json") '{"version":"4.0.5"}' -NoNewline
        Set-Content (Join-Path $root "CHANGELOG.md") $script:baseChangelog -NoNewline
        Set-Content (Join-Path $root "skills/dysflow-usage/references/error-codes.md") "Verified for the v4.0.5 release.`nKeep this content." -NoNewline
        Set-Content (Join-Path $root "skills/dysflow-usage/assets/write-flags-matrix.md") "Verified for the v4.0.5 release.`nKeep this matrix." -NoNewline
        foreach ($index in 0..($script:skillNames.Count - 1)) {
            $name = $script:skillNames[$index]
            $skillRoot = Join-Path $root "skills/$name"
            New-Item -ItemType Directory -Path $skillRoot -Force | Out-Null
            $lineEnding = if ($index % 2 -eq 0) { "`r`n" } else { "`n" }
            $skillText = "---${lineEnding}name: $name${lineEnding}metadata:${lineEnding}  last_dysflow_version: `"4.0.5`"${lineEnding}---${lineEnding}${lineEnding}Keep $name body café unchanged.${lineEnding}"
            $encoding = [Text.UTF8Encoding]::new($index -eq 0)
            [IO.File]::WriteAllBytes(
                (Join-Path $skillRoot "SKILL.md"),
                $encoding.GetPreamble() + $encoding.GetBytes($skillText)
            )
        }
        $evidence = [ordered]@{
            schemaVersion = "dysflow.semantic-audit/v1"
            repositoryHead = $script:candidateHead
            repositoryClean = $true
            adapterVersion = "4.0.5"
            DRIFT = @()
            "RUNTIME CONTRACT GAP" = @()
            findings = @()
            runtimeGaps = @()
        }
        Set-Content (Join-Path $root "semantic-audit.json") ($evidence | ConvertTo-Json -Compress) -NoNewline
        $root
    }
}

Describe "release changelog generation" {
    It "emits one physical bullet per commit and passes the repository quality gate" {
        $section = New-ReleaseChangelogSection `
            -Tag "v99.1.0" `
            -Date "2026-07-27" `
            -CommitSubjects @(
                "fix(release): preserve physical changelog lines (#1203)",
                "docs(release): document the local validation gate (#1203)"
            )
        $fixturePath = Join-Path $TestDrive "CHANGELOG.md"
        Add-ReleaseSectionToFixture -Section $section -Path $fixturePath

        ($section -split "\r?\n" | Where-Object { $_ -match "^- " }).Count | Should -Be 2
        Test-ReleaseChangelogQuality `
            -ChangelogPath $fixturePath `
            -RepoRoot $script:repoRoot `
            -QualityGatePath $script:qualityGatePath | Should -BeTrue
    }

    It "omits merge-commit subjects from generated consumer notes" {
        $section = New-ReleaseChangelogSection `
            -Tag "v99.1.0" `
            -Date "2026-07-27" `
            -CommitSubjects @(
                "Merge pull request #1200 from DysTelefonica/fix/example",
                "fix(release): retain the squash-merge subject (#1203)"
            )

        ($section -split "\r?\n" | Where-Object { $_ -match "^- " }).Count | Should -Be 1
        $section | Should -Not -Match "Merge pull request"
    }

    It "normalizes an inline bullet separator so one subject cannot collapse the entry" {
        $section = New-ReleaseChangelogSection `
            -Tag "v99.1.0" `
            -Date "2026-07-27" `
            -CommitSubjects @("fix(release): first concern - second concern (#1203)")
        $fixturePath = Join-Path $TestDrive "normalized-CHANGELOG.md"
        Add-ReleaseSectionToFixture -Section $section -Path $fixturePath

        Test-ReleaseChangelogQuality `
            -ChangelogPath $fixturePath `
            -RepoRoot $script:repoRoot `
            -QualityGatePath $script:qualityGatePath | Should -BeTrue
    }
}

Describe "release changelog fail-fast gate" {
    It "rejects a deliberately collapsed release entry" {
        $collapsed = @"
## [v99.2.0] - 2026-07-27

### Changes

- fix(release): first note - fix(release): second note

"@
        $fixturePath = Join-Path $TestDrive "collapsed-CHANGELOG.md"
        Add-ReleaseSectionToFixture -Section $collapsed -Path $fixturePath

        Test-ReleaseChangelogQuality `
            -ChangelogPath $fixturePath `
            -RepoRoot $script:repoRoot `
            -QualityGatePath $script:qualityGatePath `
            -Quiet | Should -BeFalse
    }

    It "throws a release-specific error when the local quality gate fails" {
        Mock Test-ReleaseChangelogQuality { $false }

        {
            Assert-ReleaseChangelogQuality `
                -ChangelogPath "CHANGELOG.md" `
                -RepoRoot $script:repoRoot `
                -QualityGatePath $script:qualityGatePath
        } | Should -Throw "*before creating or pushing the release commit*"
    }

    It "restores exact bytes and remains retryable when changelog validation fails" {
        $fixtureRoot = New-ReleaseRepoFixture
        $packageBefore = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $fixtureRoot "package.json")))
        $changelogBefore = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $fixtureRoot "CHANGELOG.md")))
        $errorCodesPath = Join-Path $fixtureRoot "skills/dysflow-usage/references/error-codes.md"
        $writeFlagsPath = Join-Path $fixtureRoot "skills/dysflow-usage/assets/write-flags-matrix.md"
        $errorCodesBefore = [Convert]::ToBase64String([IO.File]::ReadAllBytes($errorCodesPath))
        $writeFlagsBefore = [Convert]::ToBase64String([IO.File]::ReadAllBytes($writeFlagsPath))
        $skillBytesBefore = @{}
        foreach ($name in $script:skillNames) {
            $skillPath = Join-Path $fixtureRoot "skills/$name/SKILL.md"
            $skillBytesBefore[$skillPath] = [Convert]::ToBase64String([IO.File]::ReadAllBytes($skillPath))
        }

        $script:gitCalls = [System.Collections.Generic.List[string]]::new()
        $script:gateCalls = 0
        Mock git {
            $call = $args -join " "
            $script:gitCalls.Add($call)
            if ($call -eq "status --porcelain") { return @() }
            if ($call -eq 'rev-list --count origin/main..HEAD') { return 0 }
            if ($call -eq "rev-parse HEAD") { return $script:candidateHead }
            if ($call -eq "describe --tags --abbrev=0") { return "v4.0.5" }
            if ($call -match "^log ") {
                return @(
                    "fix(release): first generated note (#1203)",
                    "fix(release): second generated note (#1203)"
                )
            }
            if ($call -match "^add " -and $script:gateCalls -eq 2) {
                throw "retry reached git add"
            }
        }
        Mock gh { "gh version 2.test" }
        Mock Assert-ReleaseChangelogQuality {
            $script:gateCalls++
            if ($script:gateCalls -eq 1) {
                throw "Local changelog quality gate failed before creating or pushing the release commit."
            }
        }

        Push-Location $fixtureRoot
        try {
            { Invoke-ReleasePrepare -Bump "minor" -SemanticAuditEvidencePath (Join-Path $fixtureRoot "semantic-audit.json") } |
                Should -Throw "*before creating or pushing the release commit*"
        } finally {
            Pop-Location
        }

        $script:gitCalls | Where-Object { $_ -match "^(add|commit|push)\b" } | Should -BeNullOrEmpty
        [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $fixtureRoot "package.json"))) | Should -Be $packageBefore
        [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $fixtureRoot "CHANGELOG.md"))) | Should -Be $changelogBefore
        [Convert]::ToBase64String([IO.File]::ReadAllBytes($errorCodesPath)) | Should -Be $errorCodesBefore
        [Convert]::ToBase64String([IO.File]::ReadAllBytes($writeFlagsPath)) | Should -Be $writeFlagsBefore
        foreach ($skillPath in $skillBytesBefore.Keys) {
            [Convert]::ToBase64String([IO.File]::ReadAllBytes($skillPath)) | Should -Be $skillBytesBefore[$skillPath]
        }

        Push-Location $fixtureRoot
        try {
            { Invoke-ReleasePrepare -Bump "minor" -SemanticAuditEvidencePath (Join-Path $fixtureRoot "semantic-audit.json") } | Should -Throw "*retry reached git add*"
        } finally { Pop-Location }
        $script:gitCalls | Where-Object { $_ -match "^add " } | Should -HaveCount 1
        [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $fixtureRoot "package.json"))) | Should -Be $packageBefore
        [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $fixtureRoot "CHANGELOG.md"))) | Should -Be $changelogBefore
        [Convert]::ToBase64String([IO.File]::ReadAllBytes($errorCodesPath)) | Should -Be $errorCodesBefore
        [Convert]::ToBase64String([IO.File]::ReadAllBytes($writeFlagsPath)) | Should -Be $writeFlagsBefore
        foreach ($skillPath in $skillBytesBefore.Keys) {
            [Convert]::ToBase64String([IO.File]::ReadAllBytes($skillPath)) | Should -Be $skillBytesBefore[$skillPath]
        }
    }
}

Describe "release version stamps" {
    It "preserves UTF-8 BOM, line endings, and unrelated bytes" {
        $path = Join-Path $TestDrive "stamped.md"
        $encoding = [Text.UTF8Encoding]::new($true)
        $beforeText = "# Header`r`n`r`nVerified for the v2.26.0 release.`r`nKeep café unchanged.`r`n"
        [IO.File]::WriteAllBytes($path, $encoding.GetPreamble() + $encoding.GetBytes($beforeText))

        Update-ReleaseVersionStamp -Path $path -Version ([Version]"2.26.1")

        $expectedText = $beforeText.Replace("v2.26.0", "v2.26.1")
        [Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) | Should -Be (
            [Convert]::ToBase64String($encoding.GetPreamble() + $encoding.GetBytes($expectedText))
        )
    }
}

Describe "release safety behavior" {
    BeforeEach {
        $script:fixtureRoot = New-ReleaseRepoFixture
        $script:gitCalls = [Collections.Generic.List[string]]::new()
        $script:dirty = $null
        $script:ahead = 0
        $script:ghAvailable = $true
        $script:ciResult = "success"
        $script:includeMatchingRun = $true
        Mock git {
            $call = $args -join " "
            $script:gitCalls.Add($call)
            if ($call -eq "status --porcelain") { return $script:dirty }
            if ($call -eq 'rev-list --count origin/main..HEAD') { return $script:ahead }
            if ($call -eq "describe --tags --abbrev=0") { return "v4.0.5" }
            if ($call -match "^log ") { return "fix(release): safe fixture (#1203)" }
            if ($call -eq "rev-parse HEAD") { return $script:candidateHead }
            if ($call -eq "rev-parse origin/main") { return $script:candidateHead }
            if ($call -match "rev-parse --verify refs/tags/") { return $null }
        }
        Mock gh {
            if (($args -join " ") -eq "--version") {
                if ($script:ghAvailable) { return "gh version test" }
                return $null
            }
            if (($args -join " ") -match "^release view ") { return $null }
            $runs = @(@{ databaseId = 1; headSha = "b" * 40; status = "completed"; conclusion = "failure" })
            if ($script:includeMatchingRun) {
                $runs += @{ databaseId = 2; headSha = $script:candidateHead; status = "completed"; conclusion = $script:ciResult }
            }
            return ($runs | ConvertTo-Json -Compress)
        }
        Mock Assert-ReleaseChangelogQuality {}
        Mock Start-Sleep {}
    }

    It "refuses <Name> before mutating release files" -ForEach @(
        @{ Name = "dirty state"; Dirty = " M unrelated"; Ahead = 0; Gh = $true; Params = @{ Bump = "patch" } }
        @{ Name = "ahead state"; Dirty = $null; Ahead = 1; Gh = $true; Params = @{ Bump = "patch" } }
        @{ Name = "missing gh"; Dirty = $null; Ahead = 0; Gh = $false; Params = @{ Bump = "patch" } }
        @{ Name = "missing version choice"; Dirty = $null; Ahead = 0; Gh = $true; Params = @{} }
        @{ Name = "non-greater version"; Dirty = $null; Ahead = 0; Gh = $true; Params = @{ Version = "4.0.5" } }
    ) {
        $script:dirty, $script:ahead, $script:ghAvailable = $Dirty, $Ahead, $Gh
        $packageBefore = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $script:fixtureRoot "package.json")))
        $changelogBefore = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $script:fixtureRoot "CHANGELOG.md")))

        Push-Location $script:fixtureRoot
        try { { Invoke-ReleasePrepare @Params } | Should -Throw } finally { Pop-Location }

        [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $script:fixtureRoot "package.json"))) | Should -Be $packageBefore
        [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $script:fixtureRoot "CHANGELOG.md"))) | Should -Be $changelogBefore
        $script:gitCalls | Where-Object { $_ -match "^(add|commit|push|tag)\b" } |
            Should -BeNullOrEmpty
    }

    It "uses exact-SHA green CI before creating and pushing an annotated tag" {
        Push-Location $script:fixtureRoot
        try { Invoke-ReleasePrepare -Bump patch -SemanticAuditEvidencePath (Join-Path $script:fixtureRoot "semantic-audit.json") -CiMaxWaitSeconds 1 -CiPollSeconds 1 } finally { Pop-Location }

        $writes = @($script:gitCalls | Where-Object { $_ -match "^(push|tag)\b" })
        $writes | Should -Be @("push origin main", "tag -a v4.0.6 -m v4.0.6", "push origin v4.0.6")
    }

    It "updates and stages every release-owned version stamp with package and changelog" {
        $skillBytesBefore = @{}
        foreach ($name in $script:skillNames) {
            $skillPath = Join-Path $script:fixtureRoot "skills/$name/SKILL.md"
            $skillBytesBefore[$skillPath] = [IO.File]::ReadAllBytes($skillPath)
        }

        Push-Location $script:fixtureRoot
        try { Invoke-ReleasePrepare -Bump patch -SemanticAuditEvidencePath (Join-Path $script:fixtureRoot "semantic-audit.json") -CiMaxWaitSeconds 1 -CiPollSeconds 1 } finally { Pop-Location }

        Get-Content (Join-Path $script:fixtureRoot "skills/dysflow-usage/references/error-codes.md") -Raw |
            Should -Match "Verified for the v4.0.6 release"
        Get-Content (Join-Path $script:fixtureRoot "skills/dysflow-usage/assets/write-flags-matrix.md") -Raw |
            Should -Match "Verified for the v4.0.6 release"
        foreach ($name in $script:skillNames) {
            $skillPath = Join-Path $script:fixtureRoot "skills/$name/SKILL.md"
            $before = $skillBytesBefore[$skillPath]
            $beforeText = [Text.UTF8Encoding]::new($false, $true).GetString($before)
            $expected = [Text.UTF8Encoding]::new($false).GetBytes($beforeText.Replace('last_dysflow_version: "4.0.5"', 'last_dysflow_version: "4.0.6"'))
            [Convert]::ToBase64String([IO.File]::ReadAllBytes($skillPath)) | Should -Be ([Convert]::ToBase64String($expected))
        }
        $script:gitCalls | Where-Object { $_ -match "^add " } | Should -Be @(
            "add package.json CHANGELOG.md skills/dysflow-usage/references/error-codes.md skills/dysflow-usage/assets/write-flags-matrix.md skills/dysflow-arnes/SKILL.md skills/dysflow-usage/SKILL.md skills/dysflow-codegraph-update/SKILL.md skills/dysflow-examples-sync/SKILL.md skills/dysflow-pointer-rollout/SKILL.md"
        )
    }

    It "requires current bound semantic-audit evidence before mutating release files: <Name>" -ForEach @(
        @{ Name = "missing evidence"; Kind = "missing" }
        @{ Name = "missing repository binding"; Kind = "missing-binding" }
        @{ Name = "malformed repository binding"; Kind = "malformed-binding" }
        @{ Name = "mismatched repository binding"; Kind = "mismatched-binding" }
        @{ Name = "dirty repository binding"; Kind = "dirty-binding" }
        @{ Name = "non-boolean clean binding"; Kind = "malformed-clean-binding" }
        @{ Name = "wrong report schema"; Kind = "wrong-schema" }
        @{ Name = "stale adapter evidence"; Kind = "stale-adapter" }
        @{ Name = "semantic drift"; Kind = "drift" }
        @{ Name = "runtime contract gap"; Kind = "runtime-gap" }
    ) {
        $evidencePath = Join-Path $script:fixtureRoot "semantic-audit.json"
        if ($Kind -eq "missing") {
            Remove-Item -LiteralPath $evidencePath
        } else {
            $evidence = Get-Content -Raw -LiteralPath $evidencePath | ConvertFrom-Json -Depth 100
            switch ($Kind) {
                "missing-binding" { $evidence.PSObject.Properties.Remove("repositoryHead") }
                "malformed-binding" { $evidence.repositoryHead = "not-a-commit" }
                "mismatched-binding" { $evidence.repositoryHead = "b" * 40 }
                "dirty-binding" { $evidence.repositoryClean = $false }
                "malformed-clean-binding" { $evidence.repositoryClean = "true" }
                "wrong-schema" { $evidence.schemaVersion = "dysflow.semantic-audit/v0" }
                "stale-adapter" { $evidence.adapterVersion = "4.0.4" }
                "drift" {
                    $evidence.DRIFT = @([pscustomobject]@{ kind = "example" })
                    $evidence.findings = @([pscustomobject]@{ kind = "example" })
                }
                "runtime-gap" {
                    $evidence.'RUNTIME CONTRACT GAP' = @([pscustomobject]@{ kind = "inventory" })
                    $evidence.runtimeGaps = @([pscustomobject]@{ kind = "inventory" })
                }
            }
            Set-Content -LiteralPath $evidencePath -Value ($evidence | ConvertTo-Json -Depth 100 -Compress) -NoNewline
        }
        $releaseFiles = @(
            "package.json",
            "CHANGELOG.md",
            "skills/dysflow-usage/references/error-codes.md",
            "skills/dysflow-usage/assets/write-flags-matrix.md"
        ) + @(
            $script:skillNames | ForEach-Object { "skills/$_/SKILL.md" }
        )
        $before = @{}
        foreach ($path in $releaseFiles) {
            $before[$path] = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $script:fixtureRoot $path)))
        }

        Push-Location $script:fixtureRoot
        try { { Invoke-ReleasePrepare -Bump patch -SemanticAuditEvidencePath $evidencePath } | Should -Throw "*semantic-audit evidence*" } finally { Pop-Location }

        foreach ($path in $releaseFiles) {
            [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $script:fixtureRoot $path))) |
                Should -Be $before[$path]
        }
        $script:gitCalls | Where-Object { $_ -match "^(add|commit|push|tag)\b" } | Should -BeNullOrEmpty
    }

    It "resumes an already prepared release without another bump or release commit" {
        Set-Content (Join-Path $script:fixtureRoot "package.json") '{"version":"4.0.6"}' -NoNewline
        Set-Content (Join-Path $script:fixtureRoot "CHANGELOG.md") ($script:baseChangelog -replace "# Changelog", "# Changelog`n`n## [v4.0.6] - 2026-08-26") -NoNewline
        Update-ReleaseVersionStamp -Path (Join-Path $script:fixtureRoot "skills/dysflow-usage/references/error-codes.md") -Version ([Version]"4.0.6")
        Update-ReleaseVersionStamp -Path (Join-Path $script:fixtureRoot "skills/dysflow-usage/assets/write-flags-matrix.md") -Version ([Version]"4.0.6")
        Set-FixtureSkillVersion -Root $script:fixtureRoot -Version "4.0.6"
        $releaseFiles = @(
            "package.json",
            "CHANGELOG.md",
            "skills/dysflow-usage/references/error-codes.md",
            "skills/dysflow-usage/assets/write-flags-matrix.md"
        ) + @(
            $script:skillNames | ForEach-Object { "skills/$_/SKILL.md" }
        )
        $before = @{}
        foreach ($path in $releaseFiles) {
            $before[$path] = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $script:fixtureRoot $path)))
        }

        Push-Location $script:fixtureRoot
        try { Invoke-ReleasePrepare -Resume -Version "4.0.6" -CiMaxWaitSeconds 1 -CiPollSeconds 1 } finally { Pop-Location }

        foreach ($path in $releaseFiles) {
            [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $script:fixtureRoot $path))) |
                Should -Be $before[$path]
        }
        $script:gitCalls | Where-Object { $_ -match "^(add|commit|push origin main)\b" } | Should -BeNullOrEmpty
        $script:gitCalls | Where-Object { $_ -match "^(tag\b|push origin v)" } | Should -Be @(
            "tag -a v4.0.6 -m v4.0.6",
            "push origin v4.0.6"
        )
    }

    It "rejects unsafe release recovery before mutation" -ForEach @(
        @{ Name = "resume with bump"; Params = @{ Resume = $true; Version = "4.0.6"; Bump = "patch" }; Package = "4.0.6"; Head = "release-sha"; Origin = "release-sha"; TagExists = $false; ReleaseExists = $false }
        @{ Name = "version mismatch"; Params = @{ Resume = $true; Version = "4.0.7" }; Package = "4.0.6"; Head = "release-sha"; Origin = "release-sha"; TagExists = $false; ReleaseExists = $false }
        @{ Name = "divergent HEAD"; Params = @{ Resume = $true; Version = "4.0.6" }; Package = "4.0.6"; Head = "local-sha"; Origin = "origin-sha"; TagExists = $false; ReleaseExists = $false }
        @{ Name = "existing tag"; Params = @{ Resume = $true; Version = "4.0.6" }; Package = "4.0.6"; Head = "release-sha"; Origin = "release-sha"; TagExists = $true; ReleaseExists = $false }
        @{ Name = "existing release"; Params = @{ Resume = $true; Version = "4.0.6" }; Package = "4.0.6"; Head = "release-sha"; Origin = "release-sha"; TagExists = $false; ReleaseExists = $true }
    ) {
        Set-Content (Join-Path $script:fixtureRoot "package.json") "{`"version`":`"$Package`"}" -NoNewline
        $script:resumeHead = $Head
        $script:resumeOrigin = $Origin
        $script:resumeTagExists = $TagExists
        $script:resumeReleaseExists = $ReleaseExists
        Mock git {
            $call = $args -join " "
            $script:gitCalls.Add($call)
            if ($call -eq "status --porcelain") { return @() }
            if ($call -eq 'rev-list --count origin/main..HEAD') { return 0 }
            if ($call -eq "rev-parse HEAD") { return $script:resumeHead }
            if ($call -eq "rev-parse origin/main") { return $script:resumeOrigin }
            if ($call -match "rev-parse --verify refs/tags/") {
                if ($script:resumeTagExists) { return "tag-sha" }
                return $null
            }
        }
        Mock gh {
            $call = $args -join " "
            if ($call -eq "--version") { return "gh version test" }
            if ($call -match "^release view ") {
                if ($script:resumeReleaseExists) { return '{"tagName":"v4.0.6"}' }
                return $null
            }
        }

        $paths = @(
            "package.json",
            "CHANGELOG.md",
            "skills/dysflow-usage/references/error-codes.md",
            "skills/dysflow-usage/assets/write-flags-matrix.md"
        )
        $before = @{}
        foreach ($path in $paths) {
            $before[$path] = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $script:fixtureRoot $path)))
        }

        Push-Location $script:fixtureRoot
        try { { Invoke-ReleasePrepare @Params } | Should -Throw } finally { Pop-Location }

        foreach ($path in $paths) {
            [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $script:fixtureRoot $path))) |
                Should -Be $before[$path]
        }
        $script:gitCalls | Where-Object { $_ -match "^(add|commit|push)\b" } | Should -BeNullOrEmpty
    }

    It "refuses the tag when exact-SHA CI is red" {
        $script:ciResult = "failure"
        Push-Location $script:fixtureRoot
        try {
            { Invoke-ReleasePrepare -Bump patch -SemanticAuditEvidencePath (Join-Path $script:fixtureRoot "semantic-audit.json") -CiMaxWaitSeconds 1 -CiPollSeconds 1 } | Should -Throw "*NOT pushing the tag*"
        } finally { Pop-Location }

        $script:gitCalls | Where-Object { $_ -match "^(tag|push origin v)\b" } |
            Should -BeNullOrEmpty
    }

    It "refuses a resumed tag when exact-SHA CI is red" {
        $script:ciResult = "failure"
        Set-Content (Join-Path $script:fixtureRoot "package.json") '{"version":"4.0.6"}' -NoNewline
        Set-Content (Join-Path $script:fixtureRoot "CHANGELOG.md") ($script:baseChangelog -replace "# Changelog", "# Changelog`n`n## [v4.0.6] - 2026-08-26") -NoNewline
        Update-ReleaseVersionStamp -Path (Join-Path $script:fixtureRoot "skills/dysflow-usage/references/error-codes.md") -Version ([Version]"4.0.6")
        Update-ReleaseVersionStamp -Path (Join-Path $script:fixtureRoot "skills/dysflow-usage/assets/write-flags-matrix.md") -Version ([Version]"4.0.6")
        Set-FixtureSkillVersion -Root $script:fixtureRoot -Version "4.0.6"

        Push-Location $script:fixtureRoot
        try {
            { Invoke-ReleasePrepare -Resume -Version "4.0.6" -CiMaxWaitSeconds 1 -CiPollSeconds 1 } |
                Should -Throw "*NOT pushing the tag*"
        } finally { Pop-Location }

        $script:gitCalls | Where-Object { $_ -match "^(add|commit|tag|push)\b" } | Should -BeNullOrEmpty
    }

    It "bounds CI polling when no run matches the release SHA" {
        $script:includeMatchingRun = $false
        Push-Location $script:fixtureRoot
        try {
            { Invoke-ReleasePrepare -Bump patch -SemanticAuditEvidencePath (Join-Path $script:fixtureRoot "semantic-audit.json") -CiMaxWaitSeconds 1 -CiPollSeconds 1 } | Should -Throw "*did not conclude within 1 s*"
        } finally { Pop-Location }

        Should -Invoke gh -ParameterFilter { ($args -join " ") -match "^run list " } -Times 1
        $script:gitCalls | Where-Object { $_ -match "^(tag|push origin v)\b" } |
            Should -BeNullOrEmpty
    }
}

Describe "release command-line dispatch" {
    It "forwards an explicit version without binding an empty bump" {
        $script:capturedBoundParameters = $null
        Mock Invoke-ReleasePrepare {
            $script:capturedBoundParameters = @{} + $PesterBoundParameters
        }

        Invoke-ReleasePrepareEntryPoint -BoundParameters @{
            Version = "2.33.0"
            SemanticAuditEvidencePath = "C:\audit\semantic-audit.json"
        }

        $script:capturedBoundParameters.Version | Should -Be "2.33.0"
        $script:capturedBoundParameters.SemanticAuditEvidencePath | Should -Be "C:\audit\semantic-audit.json"
        $script:capturedBoundParameters.ContainsKey("Bump") | Should -BeFalse
    }

    It "forwards explicit recovery without binding a bump" {
        $script:capturedBoundParameters = $null
        Mock Invoke-ReleasePrepare {
            $script:capturedBoundParameters = @{} + $PesterBoundParameters
        }

        Invoke-ReleasePrepareEntryPoint -BoundParameters @{ Resume = $true; Version = "4.0.5" }

        $script:capturedBoundParameters.Resume | Should -BeTrue
        $script:capturedBoundParameters.Version | Should -Be "4.0.5"
        $script:capturedBoundParameters.ContainsKey("Bump") | Should -BeFalse
    }
}

Describe "owned changelog gate process" {
    It "selects a Windows-launchable pnpm command when the quality gate process starts" `
        -Skip:([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        $process = [pscustomobject]@{ ExitCode = 0 }
        $process | Add-Member ScriptMethod WaitForExit { param($Milliseconds); return $true }
        Mock Start-Process { $process }
        $fixturePath = Join-Path $TestDrive "launcher-CHANGELOG.md"
        Set-Content $fixturePath $script:baseChangelog

        Test-ReleaseChangelogQuality `
            -ChangelogPath $fixturePath `
            -RepoRoot $script:repoRoot `
            -TimeoutSeconds 1 | Should -BeTrue

        Should -Invoke Start-Process -Times 1 -ParameterFilter {
            $FilePath -match '\.(?:cmd|exe)$'
        }
    }

    It "kills only its returned process tree when the timeout expires" {
        $process = [pscustomobject]@{ ExitCode = 0; Killed = $false }
        $process | Add-Member ScriptMethod WaitForExit { param($Milliseconds); $null -eq $Milliseconds }
        $process | Add-Member ScriptMethod Kill { param($EntireProcessTree); $this.Killed = $EntireProcessTree }
        Mock Start-Process { $process }
        $fixturePath = Join-Path $TestDrive "timeout-CHANGELOG.md"
        Set-Content $fixturePath $script:baseChangelog

        {
            Test-ReleaseChangelogQuality -ChangelogPath $fixturePath -RepoRoot $script:repoRoot -TimeoutSeconds 1
        } | Should -Throw "*timed out after 1 s*"
        $process.Killed | Should -BeTrue
    }
}
