[CmdletBinding()]
param(
    [string]$Path,
    [string]$CapturesDir = (Join-Path $env:TEMP 'dysflow-usage-semantic-captures'),
    [switch]$SkipLive,
    [string]$OutputJson
)

$ErrorActionPreference = 'Stop'
if (-not $Path) { $Path = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$audit = Resolve-Path (Join-Path $PSScriptRoot '..\..\..\dysflow-codegraph-update\assets\scripts\Invoke-DysflowSemanticAudit.ps1')

if (-not $SkipLive) {
    & $audit -Refresh -CapturesDir $CapturesDir -SkillRoot $Path | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$fullPath = Join-Path $CapturesDir 'full.json'
if (-not (Test-Path -LiteralPath $fullPath)) {
    throw 'A complete candidate-runtime full.json capture is required. Use -SkipLive only with -CapturesDir from the semantic audit.'
}

$capture = Get-Content -Raw -LiteralPath $fullPath | ConvertFrom-Json -Depth 100
if ($capture.PSObject.Properties.Name -contains 'payload') { $capture = $capture.payload }
if ($capture.schemaVersion -ne 'dysflow.result/v1') { throw 'full.json is not a Dysflow result/v1 capture.' }
$bootstrapPath = Join-Path $CapturesDir 'bootstrap.json'
$adapterVersion = $null
if (Test-Path -LiteralPath $bootstrapPath) {
    $bootstrapCapture = Get-Content -Raw -LiteralPath $bootstrapPath | ConvertFrom-Json -Depth 100
    if ($bootstrapCapture.PSObject.Properties.Name -contains 'payload') { $bootstrapCapture = $bootstrapCapture.payload }
    $adapterVersion = $bootstrapCapture.adapterVersion
}
$tools = @{}
foreach ($tool in @($capture.tools)) { $tools[[string]$tool.name] = $tool }
$findings = [Collections.Generic.List[object]]::new()
$checked = 0

function Add-Finding([string]$File,[string]$Tool,[string]$Code,[string]$Detail) {
    $findings.Add([pscustomobject]@{kind='DRIFT';file=$File;tool=$Tool;code=$Code;detail=$Detail})
}

function Test-VersionStamp([string]$RelativePath) {
    $documentPath = Join-Path $Path $RelativePath
    if (-not (Test-Path -LiteralPath $documentPath)) {
        Add-Finding $RelativePath '' 'VERSION_STAMP_MISSING' 'Version-stamped document is missing.'
        return
    }
    $document = Get-Content -Raw -LiteralPath $documentPath
    $match = [regex]::Match($document, 'verified for the v([^\s]+) release', 'IgnoreCase')
    if (-not $match.Success) {
        Add-Finding $RelativePath '' 'VERSION_STAMP_MISSING' 'Expected a release version stamp.'
        return
    }
    if ([string]::IsNullOrWhiteSpace([string]$adapterVersion)) {
        Add-Finding $RelativePath '' 'VERSION_STAMP_UNAVAILABLE' 'bootstrap.adapterVersion is required to verify the document stamp.'
        return
    }
    $documentedVersion = $match.Groups[1].Value
    if ($documentedVersion -ne [string]$adapterVersion) {
        Add-Finding $RelativePath '' 'VERSION_STAMP_MISMATCH' "Documented v$documentedVersion does not match bootstrap.adapterVersion $adapterVersion."
    }
}

function Test-Type($Value,$Schema) {
    if ($null -eq $Schema -or $null -eq $Schema.type) { return $true }
    if ($null -eq $Value) { return $Schema.nullable -eq $true -or $Schema.type -eq 'array' }
    switch ([string]$Schema.type) {
        'string' { return $Value -is [string] }
        'boolean' { return $Value -is [bool] }
        'number' { return $Value -is [ValueType] -and $Value -isnot [bool] }
        'array' { return $null -eq $Value -or $Value -is [array] -or $Value -is [Collections.IList] }
        'object' { return $Value -is [pscustomobject] -or $Value -is [Collections.IDictionary] }
        default { return $true }
    }
}

function Test-Invocation([string]$File,[string]$ToolName,$Arguments) {
    $script:checked++
    if (-not $tools.ContainsKey($ToolName)) {
        Add-Finding $File $ToolName 'UNKNOWN_TOOL' 'Tool is absent from the callable schema index/full catalog.'
        return
    }
    if ($null -eq $Arguments) { $Arguments = [pscustomobject]@{} }
    $argumentNames = @($Arguments.PSObject.Properties.Name | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    $tool = $tools[$ToolName]
    $properties = $tool.inputSchema.properties
    foreach ($name in $argumentNames) {
        if (-not ($properties.PSObject.Properties.Name -contains $name)) {
            Add-Finding $File $ToolName 'UNKNOWN_PARAMETER' "Parameter '$name' is absent from inputSchema.properties."
            continue
        }
        $argumentValue = $Arguments.PSObject.Properties[$name].Value
        if (-not (Test-Type $argumentValue $properties.$name)) {
            Add-Finding $File $ToolName 'PARAMETER_TYPE' "Parameter '$name' does not match type '$($properties.$name.type)'."
        }
    }
    $required = @($tool.inputSchema.required | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    $runtimeRequired = @($properties.PSObject.Properties | Where-Object { $_.Value.runtimeRequired -eq $true } | ForEach-Object Name)
    foreach ($name in @($required + $runtimeRequired | Sort-Object -Unique)) {
        if ($name -notin $argumentNames) { Add-Finding $File $ToolName 'MISSING_PARAMETER' "Required parameter '$name' is absent." }
    }
    $alternatives = @($tool.inputSchema.anyOf | Where-Object { $null -ne $_ })
    if ($alternatives.Count -gt 0) {
        $satisfied = @($alternatives | Where-Object {
            @($_.required | Where-Object { $_ -notin $argumentNames }).Count -eq 0
        }).Count -gt 0
        if (-not $satisfied) { Add-Finding $File $ToolName 'COMPOSITION' 'No inputSchema.anyOf required alternative is satisfied.' }
    }
    $hasApply = $properties.PSObject.Properties.Name -contains 'apply'
    if ($tool.access -eq 'read-only' -and 'apply' -in $argumentNames) {
        Add-Finding $File $ToolName 'READ_ONLY_WRITE_INTENT' 'Read-only example declares a write-intent flag.'
    }
    if ($tool.access -ne 'read-only' -and $hasApply -and 'apply' -notin $argumentNames) {
        Add-Finding $File $ToolName 'MISSING_WRITE_INTENT' 'Write-capable example must declare canonical apply:true|false explicitly.'
    }
}

Test-VersionStamp 'references/error-codes.md'
Test-VersionStamp 'assets/write-flags-matrix.md'

$examplesDir = Join-Path $Path 'assets\examples'
foreach ($file in Get-ChildItem -LiteralPath $examplesDir -Filter '*.md' -File | Sort-Object Name) {
    $text = Get-Content -Raw -LiteralPath $file.FullName
    $fileCheckedBefore = $checked
    foreach ($match in [regex]::Matches($text, '(?s)(?:<!--\s*dysflow-example\s+tool="([A-Za-z_][A-Za-z0-9_]*)"\s*-->\s*)?```json\s*(\{.*?\})\s*```')) {
        $rawBlock = $match.Groups[2].Value
        if (-not $match.Groups[1].Value -and $rawBlock -notmatch '"(?:tool|name)"\s*:') { continue }
        try { $value = $rawBlock | ConvertFrom-Json -Depth 100 -ErrorAction Stop }
        catch { Add-Finding $file.Name '' 'INVALID_JSON' $_.Exception.Message; continue }
        $markerTool = $match.Groups[1].Value
        $toolName = if ($markerTool) { $markerTool } elseif ($value.tool) { [string]$value.tool } elseif ($value.name -and $value.arguments) { [string]$value.name } else { '' }
        if (-not $toolName) { continue }
        $arguments = if ($value.PSObject.Properties.Name -contains 'arguments') { $value.arguments } else {
            $copy = [ordered]@{}
            foreach ($property in $value.PSObject.Properties) { if ($property.Name -notin @('tool','name')) { $copy[$property.Name] = $property.Value } }
            [pscustomobject]$copy
        }
        Test-Invocation $file.Name $toolName $arguments
    }
    $inferredTool = $file.BaseName -replace '-','_'
    $declaresToolScaffold = [regex]::IsMatch($text, '(?m)^#\s+`' + [regex]::Escape($inferredTool) + '`\s*$')
    if ($declaresToolScaffold -and $tools.ContainsKey($inferredTool) -and $checked -eq $fileCheckedBefore) {
        Add-Finding $file.Name $inferredTool 'MISSING_CALL' 'Tool example has no machine-readable JSON invocation block.'
    }
}

$report = [pscustomobject]@{
    adapterVersion = $adapterVersion
    callableTools = $tools.Count
    checkedInvocations = $checked
    findings = @($findings)
}
$json = $report | ConvertTo-Json -Depth 100
if ($OutputJson) { [IO.File]::WriteAllText($OutputJson,$json,[Text.UTF8Encoding]::new($false)) }
[Console]::Out.WriteLine($json)
if ($findings.Count) { exit 1 }
exit 0
