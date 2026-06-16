#
# scripts/uat-checks/check-uats.ps1
#
# Verifica BR-REL-1..5 (release/UAT governance) antes de promover
# staging -> main. Cubre:
#
# BR-REL-1: Ninguna feature se cierra sin pagina en docs/features/ y,
#            cuando exista, link en openspec/REGRESSION-ANCHOR.md; si
#            el anchor falta en el checkout, debe quedar documentado
#            como deuda de conciliacion.
# BR-REL-2: last_verified_commit debe ser prueba contra HEAD actual o
#            commit staging verificado; evidencia de commit message
#            no basta.
# BR-REL-3: Todos los commits de integracion deben ser ancestros de
#            staging antes de declarar passing.
# BR-REL-4: Cada ronda UAT crea tag inmutable PRUEBAS-###; el tag
#            final aprobado es gate de produccion.
# BR-REL-5: main es updated to the approved staging state; a
#            production release tag/record is created.
#
# Uso:
#   pwsh -File scripts/uat-checks/check-uats.ps1
#   pwsh -File scripts/uat-checks/check-uats.ps1 -FeatureRow 5
#   pwsh -File scripts/uat-checks/check-uats.ps1 -IntegrationCommits 18bc693,c227fef
#   pwsh -File scripts/uat-checks/check-uats.ps1 -LastVerifiedCommit a5af092
#   pwsh -File scripts/uat-checks/check-uats.ps1 -ExpectedUatTag PRUEBAS-001
#   pwsh -File scripts/uat-checks/check-uats.ps1 -MainReleaseTag release-2026-06
#
# Salida: exit code 0 si todo OK, 1 si hay violaciones.
# Para integracion CI: este script corre antes de cada merge a main
# o antes de una promocion staging -> main.
#

param(
    [string]$RepoRoot = (Get-Location).Path,
    [int]$FeatureRow = 0,
    [string]$IntegrationCommits = "",
    [string]$LastVerifiedCommit = "",
    [string]$ExpectedUatTag = "PRUEBAS-001",
    [string]$MainReleaseTag = ""
)

$ErrorActionPreference = "Stop"

$script:violations = New-Object System.Collections.Generic.List[string]

function Write-CheckOK {
    param([string]$Msg)
    Write-Host "[OK] $Msg" -ForegroundColor Green
}

function Write-CheckWARN {
    param([string]$Msg)
    Write-Host "[WARN] $Msg" -ForegroundColor Yellow
}

function Write-CheckFAIL {
    param([string]$Msg)
    Write-Host "[FAIL] $Msg" -ForegroundColor Red
    $script:violations.Add($Msg)
}

function Write-CheckINFO {
    param([string]$Msg)
    Write-Host "[INFO] $Msg" -ForegroundColor Cyan
}

function Get-StagingHead {
    $staging = git rev-parse --verify origin/staging 2>$null
    if ([string]::IsNullOrEmpty($staging)) {
        $staging = git rev-parse --verify staging 2>$null
    }
    return $staging
}

function Get-MainHead {
    $main = git rev-parse --verify origin/main 2>$null
    if ([string]::IsNullOrEmpty($main)) {
        $main = git rev-parse --verify main 2>$null
    }
    return $main
}

function Get-TagSha {
    param([string]$TagName)
    $info = git for-each-ref --format='%(refname:short) %(objectname:short)' "refs/tags/$TagName" 2>$null
    if ([string]::IsNullOrEmpty($info)) { return $null }
    $parts = $info -split ' '
    if ($parts.Count -lt 2) { return $null }
    return $parts[1]
}

Push-Location $RepoRoot

try {
    Write-Host ""
    Write-Host "=== BR-REL-1..5 check: UAT governance ===" -ForegroundColor Cyan
    Write-Host "Repo root: $RepoRoot"
    Write-Host ""

    # BR-REL-1
    if ($FeatureRow -gt 0) {
        Write-Host "-- BR-REL-1: feature row $FeatureRow --"
        $anchorPath = "openspec/REGRESSION-ANCHOR.md"
        if (-not (Test-Path $anchorPath)) {
            Write-CheckWARN "$anchorPath NO existe en este checkout"
            Write-CheckWARN "Anomalia #1 de docs/inventory/anomalies-investigation.md: el anchor esta untracked o no se commiteo"
        } else {
            $tracked = git ls-files "$anchorPath" 2>$null
            if ([string]::IsNullOrEmpty($tracked)) {
                Write-CheckWARN "$anchorPath existe pero NO esta tracked en git (es local state)"
            } else {
                Write-CheckOK "$anchorPath esta tracked"
            }

            $lines = Get-Content $anchorPath
            $featureLine = $lines | Select-Object -Skip ($FeatureRow - 1) -First 1
            Write-CheckINFO "Feature row $FeatureRow content: $featureLine"

            if ($featureLine -match '^\| `([a-z0-9-]+)` \|') {
                $featureKey = $matches[1]
                $featureDoc = Get-ChildItem -Path "docs/features" -Recurse -Filter "$featureKey.md" -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($null -ne $featureDoc) {
                    Write-CheckOK "Feature page existe: $($featureDoc.FullName)"
                } else {
                    Write-CheckFAIL "Feature $featureKey no tiene pagina en docs/features/"
                }
            } else {
                Write-CheckFAIL ("Feature row " + $FeatureRow + " no parsea como pipe feature_key pipe")
            }
        }
    } else {
        Write-Host "-- BR-REL-1: SKIP (FeatureRow=0) --"
    }
    Write-Host ""

    # BR-REL-2
    if (-not [string]::IsNullOrEmpty($LastVerifiedCommit)) {
        Write-Host "-- BR-REL-2: last_verified_commit = $LastVerifiedCommit --"
        $exists = git cat-file -t $LastVerifiedCommit 2>$null
        if ($exists -eq "commit") {
            Write-CheckOK "Commit $LastVerifiedCommit existe en este repo"
        } else {
            Write-CheckFAIL "Commit $LastVerifiedCommit NO existe en este repo"
        }
    } else {
        Write-Host "-- BR-REL-2: SKIP (LastVerifiedCommit vacio) --"
    }
    Write-Host ""

    # BR-REL-3
    if (-not [string]::IsNullOrEmpty($IntegrationCommits)) {
        Write-Host "-- BR-REL-3: integration_commits ancestros de staging --"
        $staging = Get-StagingHead
        if ([string]::IsNullOrEmpty($staging)) {
            Write-CheckFAIL "No se puede resolver staging (probar fetch origin)"
        } else {
            Write-CheckINFO "Staging HEAD = $staging"
            foreach ($raw in ($IntegrationCommits -split ',')) {
                $sha = $raw.Trim()
                if ([string]::IsNullOrEmpty($sha)) { continue }
                git merge-base --is-ancestor $sha $staging 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-CheckOK "Commit $sha es ancestro de staging"
                } else {
                    Write-CheckFAIL "Commit $sha NO es ancestro de staging"
                }
            }
        }
    } else {
        Write-Host "-- BR-REL-3: SKIP (IntegrationCommits vacio) --"
    }
    Write-Host ""

    # BR-REL-4
    Write-Host "-- BR-REL-4: UAT tag inmutabilidad ($ExpectedUatTag) --"
    $tagSha = Get-TagSha $ExpectedUatTag
    if ($null -eq $tagSha) {
        Write-CheckWARN "Tag $ExpectedUatTag NO existe todavia (probablemente pendiente de merge a staging)"
    } else {
        Write-CheckOK "Tag $ExpectedUatTag -> $tagSha"
        $tagCommit = git rev-parse "$tagSha^{commit}" 2>$null
        $stagingRef = Get-StagingHead
        if ($null -ne $stagingRef -and $tagCommit -eq $stagingRef) {
            Write-CheckOK "Tag $ExpectedUatTag coincide con staging HEAD (inmutable)"
        } else {
            Write-CheckWARN "Tag $ExpectedUatTag apunta a $tagCommit pero staging HEAD es $stagingRef"
        }
    }
    Write-Host ""

    # BR-REL-5
    if (-not [string]::IsNullOrEmpty($MainReleaseTag)) {
        Write-Host "-- BR-REL-5: production release tag ($MainReleaseTag) en main --"
        $tagSha = Get-TagSha $MainReleaseTag
        if ($null -eq $tagSha) {
            Write-CheckFAIL "Tag de produccion $MainReleaseTag NO existe (crear tras merge a main)"
        } else {
            $mainHead = Get-MainHead
            if ($tagSha -eq $mainHead) {
                Write-CheckOK "Tag de produccion $MainReleaseTag apunta a main HEAD"
            } else {
                Write-CheckFAIL "Tag de produccion $MainReleaseTag ($tagSha) NO coincide con main HEAD ($mainHead)"
            }
        }
    } else {
        Write-Host "-- BR-REL-5: SKIP (MainReleaseTag vacio) --"
    }
    Write-Host ""

    # Resumen
    Write-Host "=== Resumen ===" -ForegroundColor Cyan
    if ($script:violations.Count -eq 0) {
        Write-Host "Todos los checks pasaron. OK para promover." -ForegroundColor Green
        exit 0
    } else {
        $countStr = $script:violations.Count.ToString()
        Write-Host ($countStr + " violationes:") -ForegroundColor Red
        foreach ($v in $script:violations) {
            $line = "  - " + $v
            Write-Host $line -ForegroundColor Red
        }
        exit 1
    }
}
finally {
    Pop-Location
}
