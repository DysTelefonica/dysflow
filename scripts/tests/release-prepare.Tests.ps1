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

    function New-ReleaseRepoFixture {
        $root = Join-Path $TestDrive ([guid]::NewGuid())
        New-Item -ItemType Directory -Path $root | Out-Null
        Set-Content (Join-Path $root "package.json") '{"version":"2.26.0"}' -NoNewline
        Set-Content (Join-Path $root "CHANGELOG.md") $script:baseChangelog -NoNewline; $root
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

        $script:gitCalls = [System.Collections.Generic.List[string]]::new()
        $script:gateCalls = 0
        Mock git {
            $call = $args -join " "
            $script:gitCalls.Add($call)
            if ($call -eq "status --porcelain") { return @() }
            if ($call -eq 'rev-list --count origin/main..HEAD') { return 0 }
            if ($call -eq "describe --tags --abbrev=0") { return "v2.26.0" }
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
            { Invoke-ReleasePrepare -Bump "minor" } |
                Should -Throw "*before creating or pushing the release commit*"
        } finally {
            Pop-Location
        }

        $script:gitCalls | Where-Object { $_ -match "^(add|commit|push)\b" } | Should -BeNullOrEmpty
        [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $fixtureRoot "package.json"))) | Should -Be $packageBefore
        [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $fixtureRoot "CHANGELOG.md"))) | Should -Be $changelogBefore

        Push-Location $fixtureRoot
        try {
            { Invoke-ReleasePrepare -Bump "minor" } | Should -Throw "*retry reached git add*"
        } finally { Pop-Location }
        $script:gitCalls | Where-Object { $_ -match "^add " } | Should -HaveCount 1
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
            if ($call -eq "describe --tags --abbrev=0") { return "v2.26.0" }
            if ($call -match "^log ") { return "fix(release): safe fixture (#1203)" }
            if ($call -eq "rev-parse HEAD") { return "release-sha" }
        }
        Mock gh {
            if (($args -join " ") -eq "--version") {
                if ($script:ghAvailable) { return "gh version test" }
                return $null
            }
            $runs = @(@{ databaseId = 1; headSha = "other-sha"; status = "completed"; conclusion = "failure" })
            if ($script:includeMatchingRun) {
                $runs += @{ databaseId = 2; headSha = "release-sha"; status = "completed"; conclusion = $script:ciResult }
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
        @{ Name = "non-greater version"; Dirty = $null; Ahead = 0; Gh = $true; Params = @{ Version = "2.26.0" } }
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
        try { Invoke-ReleasePrepare -Bump patch -CiMaxWaitSeconds 1 -CiPollSeconds 1 } finally { Pop-Location }

        $writes = @($script:gitCalls | Where-Object { $_ -match "^(push|tag)\b" })
        $writes | Should -Be @("push origin main", "tag -a v2.26.1 -m v2.26.1", "push origin v2.26.1")
    }

    It "refuses the tag when exact-SHA CI is red" {
        $script:ciResult = "failure"
        Push-Location $script:fixtureRoot
        try {
            { Invoke-ReleasePrepare -Bump patch -CiMaxWaitSeconds 1 -CiPollSeconds 1 } | Should -Throw "*NOT pushing the tag*"
        } finally { Pop-Location }

        $script:gitCalls | Where-Object { $_ -match "^(tag|push origin v)\b" } |
            Should -BeNullOrEmpty
    }

    It "bounds CI polling when no run matches the release SHA" {
        $script:includeMatchingRun = $false
        Push-Location $script:fixtureRoot
        try {
            { Invoke-ReleasePrepare -Bump patch -CiMaxWaitSeconds 1 -CiPollSeconds 1 } | Should -Throw "*did not conclude within 1 s*"
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

        Invoke-ReleasePrepareEntryPoint -BoundParameters @{ Version = "2.33.0" }

        $script:capturedBoundParameters.Version | Should -Be "2.33.0"
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
