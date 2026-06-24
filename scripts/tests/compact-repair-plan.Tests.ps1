#requires -Version 5.1
<#
.SYNOPSIS
    Pester tests for the compact_repair source/target planning in dysflow-access-runner.ps1.

.DESCRIPTION
    Regression coverage for the bug where compact_repair refused to compact a project's own
    configured database (sourceFull == AccessDbPath) from the MCP. compact_repair is early-
    dispatched before MSACCESS opens, runs pure DAO CompactDatabase into a DISTINCT temp target,
    then atomically moves it over the source under the cross-process lock — so rewriting the
    configured database in place is safe and must be allowed.

.NOTES
    Run with: pwsh -Command "Invoke-Pester scripts/tests/ -CI"
    Follows the repo convention: the pure helper under test is redefined here and kept in sync
    with scripts/dysflow-access-runner.ps1 (the full script cannot be dot-sourced — mandatory
    param block + Access COM at top level).
#>

# ---------------------------------------------------------------------------
# Helper under test — kept in sync with Get-CompactRepairPlan in
# scripts/dysflow-access-runner.ps1. Pure: resolves source/target and dry-run.
# It MUST NOT reject sourceFull == AccessDbPath (in-place compaction is safe via
# a distinct temp target + atomic move).
# ---------------------------------------------------------------------------
function script:Get-CompactRepairPlan {
    param($Payload, [string]$AccessDbPath)
    $dryRun = $true
    if ($null -ne $Payload.dryRun) { $dryRun = [bool]$Payload.dryRun }
    $sourcePath = [string]$Payload.databasePath
    if ([string]::IsNullOrWhiteSpace($sourcePath)) { $sourcePath = [string]$Payload.backendPath }
    if ([string]::IsNullOrWhiteSpace($sourcePath)) { $sourcePath = $AccessDbPath }
    if ([string]::IsNullOrWhiteSpace($sourcePath)) {
        throw "databasePath or backendPath is required for compact_repair."
    }
    $sourceFull = [System.IO.Path]::GetFullPath($sourcePath)
    $targetPath = [string]$Payload.targetPath
    if ([string]::IsNullOrWhiteSpace($targetPath)) {
        $folder = [System.IO.Path]::GetDirectoryName($sourceFull)
        $base = [System.IO.Path]::GetFileNameWithoutExtension($sourceFull)
        $ext = [System.IO.Path]::GetExtension($sourceFull)
        $targetPath = [System.IO.Path]::Combine($folder, "$base.compacted$ext")
    }
    return [ordered]@{ dryRun = $dryRun; sourceFull = $sourceFull; targetPath = $targetPath }
}

Describe "Get-CompactRepairPlan" {
    BeforeAll {
        $script:accessDb = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "Expedientes.accdb")
    }

    It "prefers databasePath over backendPath and AccessDbPath" {
        $sep = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "separate.accdb")
        $back = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "backend.accdb")
        $plan = Get-CompactRepairPlan -Payload @{ databasePath = $sep; backendPath = $back } -AccessDbPath $accessDb
        $plan.sourceFull | Should -Be ([System.IO.Path]::GetFullPath($sep))
    }

    It "falls back to backendPath when databasePath is absent" {
        $back = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "backend.accdb")
        $plan = Get-CompactRepairPlan -Payload @{ backendPath = $back } -AccessDbPath $accessDb
        $plan.sourceFull | Should -Be ([System.IO.Path]::GetFullPath($back))
    }

    It "falls back to AccessDbPath when neither databasePath nor backendPath is given" {
        $plan = Get-CompactRepairPlan -Payload @{} -AccessDbPath $accessDb
        $plan.sourceFull | Should -Be ([System.IO.Path]::GetFullPath($accessDb))
    }

    It "derives a distinct .compacted target next to the source" {
        $plan = Get-CompactRepairPlan -Payload @{} -AccessDbPath $accessDb
        $expected = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "Expedientes.compacted.accdb")
        $plan.targetPath | Should -Be ([System.IO.Path]::GetFullPath($expected))
    }

    It "throws when no source can be resolved" {
        { Get-CompactRepairPlan -Payload @{} -AccessDbPath "" } | Should -Throw -ExpectedMessage "*databasePath or backendPath is required*"
    }

    It "defaults to dry-run and honors an explicit dryRun flag" {
        (Get-CompactRepairPlan -Payload @{} -AccessDbPath $accessDb).dryRun | Should -BeTrue
        (Get-CompactRepairPlan -Payload @{ dryRun = $false } -AccessDbPath $accessDb).dryRun | Should -BeFalse
    }

    # Regression: compacting the project's OWN configured database (sourceFull == AccessDbPath)
    # with apply (dryRun = $false) must be allowed and yield a distinct temp target — it must
    # NOT throw the old "cannot rewrite the currently open database" guard.
    It "allows compacting the configured database in place (source == AccessDbPath, apply)" {
        # A throw here (the old guard) fails the test — this is the regression lock.
        $plan = Get-CompactRepairPlan -Payload @{ databasePath = $accessDb; dryRun = $false } -AccessDbPath $accessDb
        $plan.sourceFull | Should -Be ([System.IO.Path]::GetFullPath($accessDb))
        $plan.targetPath | Should -Not -Be $plan.sourceFull
        $plan.dryRun | Should -BeFalse
    }
}
