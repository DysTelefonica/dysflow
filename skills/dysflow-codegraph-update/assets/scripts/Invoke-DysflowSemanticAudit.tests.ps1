$ErrorActionPreference = 'Stop'

BeforeAll {
    if ([string]::IsNullOrWhiteSpace($env:DYSFLOW_SHIM)) {
        throw 'DYSFLOW_SHIM must point to the repository-local candidate runtime.'
    }
    $script:Audit = Join-Path $PSScriptRoot 'Invoke-DysflowSemanticAudit.ps1'
    $script:Helper = Join-Path $PSScriptRoot 'Invoke-DysflowJsonRpc.ps1'
    $script:Captures = Join-Path $TestDrive 'captures'
    $script:Report = Join-Path $TestDrive 'semantic-report.json'
    $script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
    $script:RepositoryHead = git -C $script:RepoRoot rev-parse HEAD
    $script:RepositoryClean = @(git -C $script:RepoRoot status --porcelain).Count -eq 0
    & $script:Audit -Refresh -CapturesDir $script:Captures -OutputJson $script:Report -FailOnRuntimeGap | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Candidate semantic audit failed with exit $LASTEXITCODE" }
}

Describe 'candidate-only JSON-RPC bridge' {
    It 'rejects non-introspection tools' {
        { & $script:Helper -ToolName import_modules } | Should -Throw
    }

    It 'prefers structuredContent and disables writes' {
        $path = Join-Path $TestDrive 'capabilities.json'
        & $script:Helper -ToolName get_capabilities -ArgumentsJson '{"view":"compact"}' -OutFile $path | Out-Null
        $capture = Get-Content -Raw $path | ConvertFrom-Json -Depth 100
        $capture.source | Should -Be 'structuredContent'
        $capture.payload.schemaVersion | Should -Be 'dysflow.result/v1'
        $capture.payload.writesProcess.enabled | Should -BeFalse
    }
}

Describe 'progressive semantic audit' {
    It 'proves callable and advertised inventories independently' {
        $report = Get-Content -Raw $script:Report | ConvertFrom-Json -Depth 100
        $report.schemaVersion | Should -Be 'dysflow.semantic-audit/v1'
        $report.repositoryHead | Should -Match '^[0-9a-f]{40}$'
        $report.repositoryHead | Should -BeExactly $script:RepositoryHead
        $report.repositoryClean | Should -BeOfType ([bool])
        $report.repositoryClean | Should -Be $script:RepositoryClean
        $report.callableCount | Should -Be $report.toolInventory.callable
        $report.advertisedCount | Should -Be $report.toolInventory.advertised
        $report.callableCount | Should -BeGreaterOrEqual $report.advertisedCount
        $report.compactCount | Should -Be $report.callableCount
        $report.fullCount | Should -Be $report.callableCount
        $report.describedCount | Should -Be $report.callableCount
        @($report.DRIFT).Count | Should -Be 0
        @($report.'RUNTIME CONTRACT GAP').Count | Should -Be 0
    }

    It 'binds an installed audit script to the checkout supplied through SkillRoot' {
        $installedScripts = Join-Path $TestDrive 'installed/assets/scripts'
        New-Item -ItemType Directory -Path $installedScripts -Force | Out-Null
        Copy-Item -LiteralPath $script:Audit -Destination $installedScripts
        Copy-Item -LiteralPath $script:Helper -Destination $installedScripts
        $installedAudit = Join-Path $installedScripts 'Invoke-DysflowSemanticAudit.ps1'
        $reportPath = Join-Path $TestDrive 'installed-report.json'

        & $installedAudit `
            -CapturesDir $script:Captures `
            -SkillRoot (Join-Path $script:RepoRoot 'skills/dysflow-usage') `
            -OutputJson $reportPath | Out-Null

        $LASTEXITCODE | Should -Be 0
        $report = Get-Content -Raw $reportPath | ConvertFrom-Json -Depth 100
        $report.repositoryHead | Should -BeExactly $script:RepositoryHead
        $report.repositoryClean | Should -Be $script:RepositoryClean
    }

    It 'classifies capture disagreement as DRIFT rather than a runtime gap' {
        $copy = Join-Path $TestDrive 'drift'
        Copy-Item -LiteralPath $script:Captures -Destination $copy -Recurse
        $path = Join-Path $copy 'full.json'
        $capture = Get-Content -Raw $path | ConvertFrom-Json -Depth 100
        $capture.payload.tools = @($capture.payload.tools | Select-Object -Skip 1)
        $capture | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $path -Encoding utf8NoBOM
        & $script:Audit -CapturesDir $copy -OutputJson (Join-Path $TestDrive 'drift-report.json') | Out-Null
        $LASTEXITCODE | Should -Be 1
        $report = Get-Content -Raw (Join-Path $TestDrive 'drift-report.json') | ConvertFrom-Json -Depth 100
        @($report.DRIFT).Count | Should -BeGreaterThan 0
    }
}
