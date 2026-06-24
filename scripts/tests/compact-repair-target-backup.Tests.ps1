#requires -Version 5.1
<#
.SYNOPSIS
    Pester tests for compact_repair target cleanup and pre-compaction backup helpers in
    dysflow-access-runner.ps1.

.DESCRIPTION
    1. Clear-CompactTarget: DAO DBEngine.CompactDatabase throws if the target already exists.
       A run killed after compaction but before the final Move-Item leaves a "<base>.compacted"
       file that would make every future compact_repair fail. The target must be cleared first.
    2. Backup-AccessFile: compact_repair's backupFirst flag backs the source up before compacting;
       this locks the helper's contract (timestamped .bak copy, content preserved).

.NOTES
    Run with: pwsh -Command "Invoke-Pester scripts/tests/ -CI"
    Repo convention: pure I/O helpers are redefined here, kept in sync with the source.
#>

# Kept in sync with Clear-CompactTarget in scripts/dysflow-access-runner.ps1.
function script:Clear-CompactTarget {
    param([string]$TargetPath)
    if (Test-Path -LiteralPath $TargetPath) {
        Remove-Item -LiteralPath $TargetPath -Force -ErrorAction SilentlyContinue
    }
}

# Kept in sync with Backup-AccessFile in scripts/dysflow-access-runner.ps1.
function script:Backup-AccessFile {
    param([string]$Path)
    $ts = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
    $dest = "${Path}.bak-${ts}"
    if (Test-Path -LiteralPath $dest) {
        $rand = [System.IO.Path]::GetRandomFileName().Replace('.', '')
        $dest = "${Path}.bak-${ts}-${rand}"
    }
    Copy-Item -LiteralPath $Path -Destination $dest -ErrorAction Stop
    return $dest
}

Describe "Clear-CompactTarget" {
    BeforeEach {
        $script:dir = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-compact-clear-" + [System.IO.Path]::GetRandomFileName())
        New-Item -ItemType Directory -Path $script:dir -Force | Out-Null
    }
    AfterEach {
        Remove-Item -LiteralPath $script:dir -Recurse -Force -ErrorAction SilentlyContinue
    }

    It "removes a leftover compacted target file before compaction" {
        $target = Join-Path $script:dir "Expedientes.compacted.accdb"
        Set-Content -LiteralPath $target -Value "leftover" -Encoding ascii
        Test-Path -LiteralPath $target | Should -BeTrue
        Clear-CompactTarget -TargetPath $target
        Test-Path -LiteralPath $target | Should -BeFalse
    }

    It "is a no-op when the target does not exist" {
        $target = Join-Path $script:dir "absent.compacted.accdb"
        { Clear-CompactTarget -TargetPath $target } | Should -Not -Throw
        Test-Path -LiteralPath $target | Should -BeFalse
    }
}

Describe "Backup-AccessFile" {
    BeforeEach {
        $script:dir = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-compact-backup-" + [System.IO.Path]::GetRandomFileName())
        New-Item -ItemType Directory -Path $script:dir -Force | Out-Null
    }
    AfterEach {
        Remove-Item -LiteralPath $script:dir -Recurse -Force -ErrorAction SilentlyContinue
    }

    It "creates a timestamped .bak copy and returns its path with the source content" {
        $src = Join-Path $script:dir "Expedientes.accdb"
        Set-Content -LiteralPath $src -Value "original-bytes" -Encoding ascii
        $bak = Backup-AccessFile -Path $src
        $bak | Should -Match "\.bak-\d{14}"
        Test-Path -LiteralPath $bak | Should -BeTrue
        (Get-Content -LiteralPath $bak -Raw).Trim() | Should -Be "original-bytes"
        # The source is preserved (a copy, not a move).
        Test-Path -LiteralPath $src | Should -BeTrue
    }
}
