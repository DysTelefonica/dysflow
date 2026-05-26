<#
.SYNOPSIS
Synchronizes all local Engram projects from Engram Cloud.

.DESCRIPTION
Project-scoped Engram Cloud import helper. It lists local Engram projects,
checks cloud sync status for each one, imports pending remote chunks, and can
repair legacy imports that fail because cloud chunks reference missing local
session rows.

This script intentionally uses the latest Engram from source through `go run`
because older local Engram binaries may have sync/help quirks.

.EXAMPLE
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-engram-cloud-projects.ps1

.EXAMPLE
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-engram-cloud-projects.ps1 -Projects gestion_riesgos,condor,hps
#>

[CmdletBinding()]
param(
    [string[]]$Projects,
    [string]$EngramPackage = 'github.com/Gentleman-Programming/engram/cmd/engram@latest',
    [string]$EngramDb = (Join-Path $env:USERPROFILE '.engram\engram.db'),
    [string]$FallbackDirectory = (Get-Location).Path,
    [int]$MaxImportAttempts = 4,
    [switch]$NoRepairMissingSessions,
    [switch]$KeepGoingOnRepoEngramArtifacts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-Engram {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $output = & go run $EngramPackage @Arguments 2>&1
    [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output   = ($output -join "`n")
    }
}

function Assert-Tooling {
    foreach ($tool in @('go', 'python')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            throw "Required command not found on PATH: $tool"
        }
    }
    if (-not (Test-Path -LiteralPath $EngramDb)) {
        throw "Engram DB not found: $EngramDb"
    }
}

function Assert-NoRepoEngramArtifacts {
    $repoEngram = Join-Path (Get-Location).Path '.engram'
    if (Test-Path -LiteralPath $repoEngram) {
        $message = "Repository .engram artifact exists: $repoEngram. Remove it or rerun with -KeepGoingOnRepoEngramArtifacts."
        if ($KeepGoingOnRepoEngramArtifacts) {
            Write-Warning $message
        }
        else {
            throw $message
        }
    }
}

function Get-LocalEngramProjects {
    $result = Invoke-Engram -Arguments @('projects', 'list')
    if ($result.ExitCode -ne 0) {
        throw "Unable to list Engram projects:`n$($result.Output)"
    }

    $items = foreach ($line in ($result.Output -split "`r?`n")) {
        if ($line -match '^\s{2}(.+?)\s+\d+\s+obs\b') {
            $Matches[1].Trim()
        }
    }

    $items | Sort-Object -Unique
}

function Get-CloudStatus {
    param([Parameter(Mandatory)][string]$Project)

    $result = Invoke-Engram -Arguments @('sync', '--cloud', '--status', '--project', $Project)
    $pending = $null
    $local = $null
    $remote = $null

    if ($result.Output -match 'Local chunks:\s+(\d+)') { $local = [int]$Matches[1] }
    if ($result.Output -match 'Remote chunks:\s+(\d+)') { $remote = [int]$Matches[1] }
    if ($result.Output -match 'Pending import:\s+(\d+)') { $pending = [int]$Matches[1] }

    [pscustomobject]@{
        Project = $Project
        ExitCode = $result.ExitCode
        Output = $result.Output
        LocalChunks = $local
        RemoteChunks = $remote
        PendingImport = $pending
    }
}

function Backup-EngramDb {
    $timestamp = Get-Date -Format 'yyyyMMddHHmmss'
    $backup = "$EngramDb.backup-before-cloud-import-repair-$timestamp.bak"
    Copy-Item -LiteralPath $EngramDb -Destination $backup
    return $backup
}

function Add-MissingSessionStubs {
    param(
        [Parameter(Mandatory)][string]$Project,
        [Parameter(Mandatory)][string[]]$SessionIds
    )

    $ids = @($SessionIds | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() } | Sort-Object -Unique)
    if ($ids.Count -eq 0) { return [pscustomobject]@{ Inserted = 0; Backup = $null; Directory = $null } }

    $backup = Backup-EngramDb
    $payloadPath = Join-Path $env:TEMP ("engram-session-stubs-{0}.json" -f ([guid]::NewGuid().ToString('N')))
    $payload = [pscustomobject]@{
        db = $EngramDb
        project = $Project
        ids = $ids
        fallback_directory = $FallbackDirectory
    }
    $payload | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $payloadPath -Encoding UTF8

    $python = @'
import datetime
import json
import sqlite3
import sys

payload_path = sys.argv[1]
with open(payload_path, "r", encoding="utf-8-sig") as f:
    payload = json.load(f)

con = sqlite3.connect(payload["db"])
project = payload["project"]
fallback = payload["fallback_directory"]
ids = payload["ids"]

rows = con.execute(
    "select directory, count(*) from sessions where project=? and ifnull(directory,'')<>'' group by directory order by count(*) desc limit 1",
    (project,),
).fetchall()
directory = rows[0][0] if rows else fallback
now = datetime.datetime.utcnow().replace(microsecond=0).isoformat(sep=" ")
summary = "Stub session inserted by sync-engram-cloud-projects.ps1 to satisfy legacy cloud import FK dependency."

before = con.total_changes
con.executemany(
    "insert or ignore into sessions(id, project, directory, started_at, summary) values(?,?,?,?,?)",
    [(sid, project, directory, now, summary) for sid in ids],
)
con.commit()
inserted = con.total_changes - before
print(json.dumps({"inserted": inserted, "directory": directory, "ids": ids}))
'@

    try {
        $pyResult = $python | python - $payloadPath 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Python repair failed:`n$($pyResult -join "`n")"
        }
        $parsed = ($pyResult -join "`n") | ConvertFrom-Json
        [pscustomobject]@{ Inserted = [int]$parsed.inserted; Backup = $backup; Directory = [string]$parsed.directory }
    }
    finally {
        Remove-Item -LiteralPath $payloadPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-PendingSessionDependencies {
    param([Parameter(Mandatory)][string]$Output)

    if ($Output -notmatch 'pending session dependencies:\s*(.+)$') { return @() }
    $Matches[1] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}

function Import-ProjectFromCloud {
    param([Parameter(Mandatory)][string]$Project)

    $repairs = @()
    for ($attempt = 1; $attempt -le $MaxImportAttempts; $attempt++) {
        Write-Host "  Import attempt $attempt/$MaxImportAttempts..."
        $result = Invoke-Engram -Arguments @('sync', '--cloud', '--import', '--project', $Project)
        if ($result.ExitCode -eq 0) {
            return [pscustomobject]@{ Success = $true; Output = $result.Output; Repairs = $repairs }
        }

        $deps = @(Get-PendingSessionDependencies -Output $result.Output)
        if ($deps.Count -eq 0 -or $NoRepairMissingSessions) {
            return [pscustomobject]@{ Success = $false; Output = $result.Output; Repairs = $repairs }
        }

        Write-Warning "  Import blocked by missing session dependencies: $($deps -join ', ')"
        $repair = Add-MissingSessionStubs -Project $Project -SessionIds $deps
        $repairs += $repair
        Write-Warning "  Inserted $($repair.Inserted) session stub(s). Backup: $($repair.Backup). Directory: $($repair.Directory)"
    }

    [pscustomobject]@{ Success = $false; Output = "Max import attempts reached for $Project"; Repairs = $repairs }
}

Assert-Tooling
Assert-NoRepoEngramArtifacts

Write-Step "Detecting local Engram projects"
$projectList = @(if ($Projects -and @($Projects).Count -gt 0) { $Projects | Sort-Object -Unique } else { Get-LocalEngramProjects })
Write-Host ("Projects to check: {0}" -f @($projectList).Count)

$aligned = New-Object System.Collections.Generic.List[string]
$imported = New-Object System.Collections.Generic.List[string]
$skipped = New-Object System.Collections.Generic.List[object]
$failed = New-Object System.Collections.Generic.List[object]
$repairLog = New-Object System.Collections.Generic.List[object]

foreach ($project in $projectList) {
    Write-Step "Checking $project"
    $status = Get-CloudStatus -Project $project

    if ($status.ExitCode -ne 0 -or $null -eq $status.PendingImport) {
        Write-Warning "Skipping $project. Status failed: $($status.Output)"
        $skipped.Add([pscustomobject]@{ Project = $project; Reason = $status.Output }) | Out-Null
        continue
    }

    Write-Host "  Local=$($status.LocalChunks) Remote=$($status.RemoteChunks) Pending=$($status.PendingImport)"
    if ($status.PendingImport -eq 0) {
        $aligned.Add($project) | Out-Null
        continue
    }

    $import = Import-ProjectFromCloud -Project $project
    foreach ($repair in $import.Repairs) {
        $repairLog.Add([pscustomobject]@{ Project = $project; Inserted = $repair.Inserted; Backup = $repair.Backup; Directory = $repair.Directory }) | Out-Null
    }

    if (-not $import.Success) {
        Write-Warning "Import failed for ${project}: $($import.Output)"
        $failed.Add([pscustomobject]@{ Project = $project; Reason = $import.Output }) | Out-Null
        continue
    }

    $finalStatus = Get-CloudStatus -Project $project
    if ($finalStatus.PendingImport -eq 0) {
        $imported.Add($project) | Out-Null
        Write-Host "  Imported and aligned."
    }
    else {
        $failed.Add([pscustomobject]@{ Project = $project; Reason = "Pending import remains: $($finalStatus.PendingImport)" }) | Out-Null
    }
}

Assert-NoRepoEngramArtifacts

Write-Step "Summary"
Write-Host "Already aligned: $($aligned.Count)"
$aligned | ForEach-Object { Write-Host "  - $_" }
Write-Host "Imported: $($imported.Count)"
$imported | ForEach-Object { Write-Host "  - $_" }
Write-Host "Skipped: $($skipped.Count)"
$skipped | ForEach-Object { Write-Host "  - $($_.Project): $($_.Reason -replace "`r?`n", ' | ')" }
Write-Host "Failed: $($failed.Count)"
$failed | ForEach-Object { Write-Host "  - $($_.Project): $($_.Reason -replace "`r?`n", ' | ')" }
Write-Host "Repairs: $($repairLog.Count)"
$repairLog | ForEach-Object { Write-Host "  - $($_.Project): inserted=$($_.Inserted), backup=$($_.Backup), directory=$($_.Directory)" }

$git = & git status --short --branch 2>&1
Write-Host "`nGit status:"
Write-Host ($git -join "`n")

if ($failed.Count -gt 0) { exit 2 }
exit 0
