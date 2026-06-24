#requires -Version 5.1
<#
.SYNOPSIS
    Pester tests for compact_repair password selection in dysflow-access-runner.ps1.

.DESCRIPTION
    Regression for "No es una contraseña válida" when compacting a password-protected
    frontend: compact_repair's only env-sourced password was $BackendPassword, but the
    configured frontend (AccessDbPath) is protected with the ACCESS password. Raw password
    values are stripped from the payload for security (#498), so the password must be selected
    from the env-sourced $AccessPassword / $BackendPassword by the database being compacted.

.NOTES
    Run with: pwsh -Command "Invoke-Pester scripts/tests/ -CI"
    Follows the repo convention: the pure helper under test is redefined here, kept in sync
    with Resolve-CompactPassword in scripts/dysflow-access-runner.ps1.
#>

# ---------------------------------------------------------------------------
# Helper under test — kept in sync with Resolve-CompactPassword in
# scripts/dysflow-access-runner.ps1. Picks the password for the database being
# compacted: the configured frontend (AccessDbPath) carries the ACCESS password;
# a separate/backend file carries the BACKEND password; cross-fallback otherwise.
# ---------------------------------------------------------------------------
function script:Resolve-CompactPassword {
    param(
        [string]$SourceFull,
        [string]$AccessDbPath,
        [string]$AccessPassword,
        [string]$BackendPassword
    )
    $accessFull = if ([string]::IsNullOrWhiteSpace($AccessDbPath)) { "" } else { [System.IO.Path]::GetFullPath($AccessDbPath) }
    if (-not [string]::IsNullOrWhiteSpace($accessFull) -and $SourceFull -ieq $accessFull) {
        if (-not [string]::IsNullOrWhiteSpace($AccessPassword)) { return $AccessPassword }
        return $BackendPassword
    }
    if (-not [string]::IsNullOrWhiteSpace($BackendPassword)) { return $BackendPassword }
    return $AccessPassword
}

Describe "Resolve-CompactPassword" {
    BeforeAll {
        $script:front = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "Expedientes.accdb")
        $script:back = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "Expedientes_datos.accdb")
    }

    It "uses the ACCESS password when compacting the configured frontend" {
        Resolve-CompactPassword -SourceFull ([System.IO.Path]::GetFullPath($front)) -AccessDbPath $front -AccessPassword "acc" -BackendPassword "bck" |
            Should -Be "acc"
    }

    It "uses the BACKEND password when compacting a separate/backend file" {
        Resolve-CompactPassword -SourceFull ([System.IO.Path]::GetFullPath($back)) -AccessDbPath $front -AccessPassword "acc" -BackendPassword "bck" |
            Should -Be "bck"
    }

    It "falls back to the BACKEND password for the frontend when no access password is set" {
        Resolve-CompactPassword -SourceFull ([System.IO.Path]::GetFullPath($front)) -AccessDbPath $front -AccessPassword "" -BackendPassword "bck" |
            Should -Be "bck"
    }

    It "falls back to the ACCESS password for a separate file when no backend password is set" {
        Resolve-CompactPassword -SourceFull ([System.IO.Path]::GetFullPath($back)) -AccessDbPath $front -AccessPassword "acc" -BackendPassword "" |
            Should -Be "acc"
    }

    It "returns empty when no passwords are available" {
        Resolve-CompactPassword -SourceFull ([System.IO.Path]::GetFullPath($front)) -AccessDbPath $front -AccessPassword "" -BackendPassword "" |
            Should -BeNullOrEmpty
    }
}
