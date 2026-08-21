Set-StrictMode -Version 2.0

function Invoke-RelinkDirectoryCoreDecision {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][ValidateSet('start', 'inspections-completed', 'apply-completed')][string]$Event,
        [Parameter(Mandatory = $true)]$Payload,
        [string]$CoreCliPath = (Join-Path -Path (Split-Path -Path (Split-Path -Path $PSScriptRoot -Parent) -Parent) -ChildPath 'dist/cli/relink-directory-orchestration.js'),
        [string]$NodeCommand = 'node'
    )

    if (-not (Test-Path -LiteralPath $CoreCliPath)) {
        throw "Relink-directory core bridge not found at '$CoreCliPath'. Run the TypeScript build before relinking."
    }
    $json = $Payload | ConvertTo-Json -Depth 24 -Compress
    $encodedPayload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    $previous = $env:DYSFLOW_RELINK_DECISION_PAYLOAD_BASE64
    try {
        $env:DYSFLOW_RELINK_DECISION_PAYLOAD_BASE64 = $encodedPayload
        $lines = @(& $NodeCommand $CoreCliPath --event $Event 2>&1)
    } finally {
        if ($null -eq $previous) {
            Remove-Item Env:DYSFLOW_RELINK_DECISION_PAYLOAD_BASE64 -ErrorAction SilentlyContinue
        } else {
            $env:DYSFLOW_RELINK_DECISION_PAYLOAD_BASE64 = $previous
        }
    }
    if ($LASTEXITCODE -ne 0) {
        throw ("Relink-directory core bridge failed for event '{0}': {1}" -f $Event, ($lines -join [Environment]::NewLine))
    }
    $marker = 'DYSFLOW_RELINK_DECISION '
    $line = @($lines | Where-Object { [string]$_ -like "$marker*" } | Select-Object -Last 1)
    if ($line.Count -ne 1) {
        throw "Relink-directory core bridge returned no decision marker for event '$Event'."
    }
    $encodedDecision = ([string]$line[0]).Substring($marker.Length)
    $decisionJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedDecision))
    return $decisionJson | ConvertFrom-Json
}

function Invoke-RelinkDirectoryTransport {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Payload,
        [Parameter(Mandatory = $true)][scriptblock]$CoreDecision,
        [Parameter(Mandatory = $true)][scriptblock]$EnumerateFiles,
        [Parameter(Mandatory = $true)][scriptblock]$InspectFile,
        [Parameter(Mandatory = $true)][scriptblock]$ApplyFile,
        [Parameter(Mandatory = $true)][scriptblock]$WriteProgress
    )

    $dryRunProperty = $Payload.PSObject.Properties['dryRun']
    $recursiveProperty = $Payload.PSObject.Properties['recursive']
    $noBackupProperty = $Payload.PSObject.Properties['noBackup']
    $removeProperty = $Payload.PSObject.Properties['removeUnresolved']
    $mapsProperty = $Payload.PSObject.Properties['maps']
    $denyPrefixesProperty = $Payload.PSObject.Properties['denyPrefixes']
    $dryRun = if ($null -eq $dryRunProperty -or $null -eq $dryRunProperty.Value) { $true } else { [bool]$dryRunProperty.Value }
    $recursive = if ($null -eq $recursiveProperty -or $null -eq $recursiveProperty.Value) { $true } else { [bool]$recursiveProperty.Value }
    $input = [ordered]@{
        rootPath = [string]$Payload.rootPath
        dryRun = $dryRun
        recursive = $recursive
        noBackup = [bool]($null -ne $noBackupProperty -and $noBackupProperty.Value)
        removeUnresolved = [bool]($null -ne $removeProperty -and $removeProperty.Value)
        maps = if ($null -eq $mapsProperty -or $null -eq $mapsProperty.Value) { @() } else { @($mapsProperty.Value) }
        denyPrefixes = if ($null -eq $denyPrefixesProperty -or $null -eq $denyPrefixesProperty.Value) { @() } else { @($denyPrefixesProperty.Value) }
    }
    $candidates = @(& $EnumerateFiles $input.rootPath)
    $decision = & $CoreDecision 'start' ([ordered]@{ input = $input; candidates = $candidates })
    if ([string]$decision.kind -ne 'inspect') {
        throw "Relink-directory core returned unsupported initial decision '$($decision.kind)'."
    }

    & $WriteProgress 20 'Scanning files' @($decision.files).Count
    $inspections = [System.Collections.Generic.List[object]]::new()
    $index = 0
    foreach ($filePath in @($decision.files)) {
        $index++
        $percent = [int](20 + 40 * $index / [Math]::Max(1, @($decision.files).Count))
        & $WriteProgress $percent "Inspecting $([System.IO.Path]::GetFileName([string]$filePath))" @($decision.files).Count
        $inspections.Add((& $InspectFile ([string]$filePath)))
    }
    $decision = & $CoreDecision 'inspections-completed' ([ordered]@{
        state = $decision.state
        inspections = $inspections.ToArray()
    })

    if ([string]$decision.kind -eq 'apply') {
        $results = [System.Collections.Generic.List[object]]::new()
        $planIndex = 0
        foreach ($plan in @($decision.plans)) {
            $planIndex++
            $percent = [int](60 + 25 * $planIndex / [Math]::Max(1, @($decision.plans).Count))
            & $WriteProgress $percent "Applying $([System.IO.Path]::GetFileName([string]$plan.filePath))" @($decision.plans).Count
            $results.Add((& $ApplyFile $plan))
        }
        $decision = & $CoreDecision 'apply-completed' ([ordered]@{
            state = $decision.state
            results = $results.ToArray()
        })
    }
    if ([string]$decision.kind -ne 'complete') {
        throw "Relink-directory core returned unsupported terminal decision '$($decision.kind)'."
    }
    & $WriteProgress 90 'Finalizing' ([int]$decision.report.filesScanned)
    return [ordered]@{ relinkDirectory = $decision.report }
}

Export-ModuleMember -Function Invoke-RelinkDirectoryCoreDecision, Invoke-RelinkDirectoryTransport
