Set-StrictMode -Version 2.0

function Invoke-VbaImportCoreDecision {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][ValidateSet('start', 'pass-completed', 'save-completed')][string]$Event,
        [Parameter(Mandatory = $true)]$Payload,
        [string]$CoreCliPath = (Join-Path -Path (Split-Path -Path (Split-Path -Path $PSScriptRoot -Parent) -Parent) -ChildPath 'dist/cli/vba-import-orchestration.js'),
        [string]$NodeCommand = 'node'
    )

    if (-not (Test-Path -LiteralPath $CoreCliPath)) {
        throw "VBA import core bridge not found at '$CoreCliPath'. Run the TypeScript build before importing."
    }
    $json = $Payload | ConvertTo-Json -Depth 16 -Compress
    $payloadBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    $lines = @(& $NodeCommand $CoreCliPath --event $Event --payload-base64 $payloadBase64 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw ("VBA import core bridge failed for event '{0}': {1}" -f $Event, ($lines -join [Environment]::NewLine))
    }
    $marker = 'DYSFLOW_IMPORT_DECISION '
    $line = @($lines | Where-Object { [string]$_ -like "$marker*" } | Select-Object -Last 1)
    if ($line.Count -ne 1) {
        throw "VBA import core bridge returned no decision marker for event '$Event'."
    }
    $encoded = ([string]$line[0]).Substring($marker.Length)
    $decisionJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
    return $decisionJson | ConvertFrom-Json
}

function Invoke-VbaImportPrimitivePass {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$ModuleNames,
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [Parameter(Mandatory = $true)][string]$ImportMode,
        [Parameter(Mandatory = $true)][bool]$RollbackOnMutationFailure,
        [Parameter(Mandatory = $true)][scriptblock]$ResolveExisting,
        [Parameter(Mandatory = $true)][scriptblock]$ImportModule,
        [Parameter(Mandatory = $true)][scriptblock]$ResetDiagnostics,
        [Parameter(Mandatory = $true)][scriptblock]$ReadDiagnostics,
        [Parameter(Mandatory = $true)][scriptblock]$InspectLockOwner,
        [Parameter(Mandatory = $true)][scriptblock]$WriteStatus,
        [int]$Pass = 1,
        [int]$Total = 0
    )

    $attempts = New-Object System.Collections.Generic.List[object]
    $rollbackActions = New-Object System.Collections.Generic.List[scriptblock]
    $idx = 0
    foreach ($name in $ModuleNames) {
        $idx++
        $message = if ($Pass -gt 1) {
            "[{0}/{1}] Importando (pasada {2}): {3}" -f $idx, $ModuleNames.Count, $Pass, $name
        } else {
            "[{0}/{1}] Importando: {2}" -f $idx, $Total, $name
        }
        & $WriteStatus $message
        & $ResetDiagnostics
        $stopwatch = [Diagnostics.Stopwatch]::StartNew()
        try {
            $beforeExists = & $ResolveExisting $Session.VbProject $name
            $importResult = & $ImportModule $Session $name $ModulesPath $ImportMode $RollbackOnMutationFailure
            $createdComponentName = $null
            $modifiedDocumentName = $null
            if (-not $beforeExists) {
                $afterExists = & $ResolveExisting $Session.VbProject $name
                if ($afterExists -and $importResult -and $importResult.CreatedNewComponent -and $importResult.RequiresExplicitSave) {
                    $createdComponentName = [string]$afterExists
                }
            } elseif ($importResult -and $importResult.PSObject.Properties['ReimportedDocument'] -and [bool]$importResult.ReimportedDocument) {
                $modifiedDocumentName = [string]$name
            }
            $stopwatch.Stop()
            $attempt = [ordered]@{
                module          = [string]$name
                ok              = $true
                durationMs      = [int64]$stopwatch.ElapsedMilliseconds
                fallbackUsed    = [bool]($importResult -and $importResult.PSObject.Properties['FallbackUsed'] -and $importResult.FallbackUsed)
                fallbackReason  = if ($importResult -and $importResult.PSObject.Properties['FallbackReason']) { $importResult.FallbackReason } else { $null }
            }
            if ($createdComponentName) { $attempt.createdComponentName = $createdComponentName }
            if ($modifiedDocumentName) { $attempt.modifiedDocumentName = $modifiedDocumentName }
            if ($importResult -and $importResult.PSObject.Properties['Verbose'] -and $importResult.Verbose) {
                $attempt.verbose = $importResult.Verbose
            }
            $attempts.Add([pscustomobject]$attempt) | Out-Null
            if ($importResult -and $importResult.PSObject.Properties['RollbackAction'] -and $importResult.RollbackAction) {
                $rollbackActions.Add([scriptblock]$importResult.RollbackAction) | Out-Null
            }
        } catch {
            $stopwatch.Stop()
            $rawMessage = $_.Exception.Message
            $messageString = if ($null -eq $rawMessage) { '<empty VBE error>' } elseif ($rawMessage -is [string]) { $rawMessage } else { [string]$rawMessage }
            $diagnostics = & $ReadDiagnostics
            $lockOwner = & $InspectLockOwner $messageString
            $attempts.Add([pscustomobject][ordered]@{
                module             = [string]$name
                ok                 = $false
                durationMs         = [int64]$stopwatch.ElapsedMilliseconds
                phase              = [string]$diagnostics.phase
                message            = $messageString
                data               = $diagnostics.data
                databaseLocked     = [bool]$lockOwner.databaseLocked
                machine            = $lockOwner.machine
                user               = $lockOwner.user
                rollbackAttempted  = [bool]$diagnostics.rollbackAttempted
                rollbackApplied    = [bool]$diagnostics.rollbackApplied
                rollbackError      = $diagnostics.rollbackError
                fallbackUsed       = [bool]$diagnostics.fallbackUsed
                fallbackReason     = $diagnostics.fallbackReason
            }) | Out-Null
        }
    }
    return [pscustomobject]@{
        Attempts = $attempts.ToArray()
        RollbackActions = $rollbackActions.ToArray()
    }
}

function Invoke-VbaImportTransport {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Targets,
        [Parameter(Mandatory = $true)][ValidateSet('explicit', 'all')][string]$Scope,
        [Parameter(Mandatory = $true)][scriptblock]$CoreDecision,
        [Parameter(Mandatory = $true)][scriptblock]$RunPass,
        [Parameter(Mandatory = $true)][scriptblock]$Save,
        [Parameter(Mandatory = $true)][scriptblock]$WriteResult,
        [Parameter(Mandatory = $true)][scriptblock]$WriteStatus
    )

    $rollbackJournal = New-Object System.Collections.Generic.List[scriptblock]
    $decision = & $CoreDecision 'start' ([ordered]@{ targets = @($Targets); scope = $Scope })
    while ([string]$decision.kind -ne 'complete') {
        if ([string]$decision.kind -eq 'run-pass') {
            $passResult = & $RunPass -moduleNames @($decision.moduleNames) -rollbackOnMutationFailure ([bool]$decision.rollbackOnMutationFailure) -pass ([int]$decision.state.pass + 1) -total ([int]$decision.state.targets.Count)
            if ($passResult.PSObject.Properties['Attempts']) {
                $attempts = @($passResult.Attempts)
                foreach ($action in @($passResult.RollbackActions)) {
                    if ($action) { $rollbackJournal.Add([scriptblock]$action) | Out-Null }
                }
            } else {
                $attempts = @($passResult)
            }
            try {
                $decision = & $CoreDecision 'pass-completed' ([ordered]@{ state = $decision.state; attempts = $attempts })
            } catch {
                $bridgeError = [string]$_.Exception.Message
                $rollbackErrors = New-Object System.Collections.Generic.List[string]
                for ($i = $rollbackJournal.Count - 1; $i -ge 0; $i--) {
                    try { & $rollbackJournal[$i] } catch { $rollbackErrors.Add([string]$_.Exception.Message) | Out-Null }
                }
                $rollbackStatus = if ($rollbackErrors.Count -eq 0) {
                    'successful mutations were rolled back'
                } else {
                    'rollback was incomplete: ' + ($rollbackErrors -join '; ')
                }
                $message = "VBA import core bridge failed after mutation; ${rollbackStatus}: $bridgeError"
                & $WriteStatus ("ERROR: {0}" -f $message)
                & $WriteResult -result ([ordered]@{
                    ok = $false
                    error = [ordered]@{ code = 'VBA_IMPORT_FAILED'; message = $message }
                    modules = @()
                })
                return [pscustomobject]@{
                    CreatedComponentNames = @()
                    ModifiedDocumentNames = @()
                    Total = $Targets.Count
                    HasErrors = $true
                    ErrorMessage = $message
                }
            }
            continue
        }
        if ([string]$decision.kind -eq 'save') {
            $warning = & $Save -moduleNames @($decision.moduleNames)
            $payload = [ordered]@{ state = $decision.state }
            if (-not [string]::IsNullOrWhiteSpace([string]$warning)) { $payload.warning = [string]$warning }
            $decision = & $CoreDecision 'save-completed' $payload
            continue
        }
        throw "VBA import core returned unsupported decision '$($decision.kind)'."
    }

    if ($decision.PSObject.Properties['saveWarning'] -and -not [string]::IsNullOrWhiteSpace([string]$decision.saveWarning)) {
        & $WriteStatus ("ADVERTENCIA: guardado explícito post-import no completó ({0}). El import se aplicó; compilá en Access (Debug > Compile) para persistir/verificar." -f $decision.saveWarning)
    }
    & $WriteResult -result $decision.result
    return $decision.summary
}

Export-ModuleMember -Function Invoke-VbaImportCoreDecision, Invoke-VbaImportPrimitivePass, Invoke-VbaImportTransport
