[CmdletBinding()]
param(
    [string]$CapturesDir,
    [switch]$Refresh,
    [string]$SkillRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\dysflow-usage')).Path,
    [string]$OutputJson,
    [switch]$FailOnRuntimeGap
)

$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot 'Invoke-DysflowJsonRpc.ps1'
if (-not $CapturesDir) { $CapturesDir = Join-Path $env:TEMP 'dysflow-semantic-audit' }
$repoRoot = (Resolve-Path (Join-Path $SkillRoot '..\..')).Path
$repositoryHead = [string](& git -C $repoRoot rev-parse HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or $repositoryHead -notmatch '^[0-9a-f]{40}$') {
    throw "Could not bind semantic audit evidence to repository HEAD at $repoRoot."
}
$repositoryStatus = @(& git -C $repoRoot status --porcelain 2>$null)
if ($LASTEXITCODE -ne 0) { throw "Could not inspect repository status at $repoRoot." }
$repositoryClean = $repositoryStatus.Count -eq 0

function Read-Capture([string]$Path) {
    $value = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json -Depth 100
    while ($value -is [string]) { $value = $value | ConvertFrom-Json -Depth 100 }
    if ($value.PSObject.Properties.Name -contains 'payload') { $value = $value.payload }
    if ($value.schemaVersion -ne 'dysflow.result/v1') { throw "Invalid capture schemaVersion in $Path" }
    return $value
}

function Save-LiveCapture {
    if (-not (Test-Path -LiteralPath $CapturesDir)) { New-Item -ItemType Directory -Path $CapturesDir -Force | Out-Null }
    $describeDir = Join-Path $CapturesDir 'describe'
    if (-not (Test-Path -LiteralPath $describeDir)) { New-Item -ItemType Directory -Path $describeDir -Force | Out-Null }
    & $helper -ToolName bootstrap -OutFile (Join-Path $CapturesDir 'bootstrap.json') -TimeoutMs 60000 | Out-Null
    & $helper -ToolName get_capabilities -ArgumentsJson '{"view":"compact"}' -OutFile (Join-Path $CapturesDir 'capabilities-compact.json') -TimeoutMs 60000 | Out-Null
    & $helper -ToolName get_capabilities -ArgumentsJson '{"view":"full"}' -OutFile (Join-Path $CapturesDir 'capabilities.json') -TimeoutMs 60000 | Out-Null
    & $helper -ToolName schema -ArgumentsJson '{"view":"index"}' -OutFile (Join-Path $CapturesDir 'index.json') -TimeoutMs 60000 | Out-Null
    & $helper -ToolName schema -ArgumentsJson '{"view":"compact"}' -OutFile (Join-Path $CapturesDir 'compact.json') -TimeoutMs 60000 | Out-Null
    & $helper -ToolName schema -ArgumentsJson '{"view":"full"}' -OutFile (Join-Path $CapturesDir 'full.json') -TimeoutMs 60000 | Out-Null
    $indexCapture = Read-Capture (Join-Path $CapturesDir 'index.json')
    foreach ($tool in @($indexCapture.tools)) {
        if ([string]::IsNullOrWhiteSpace([string]$tool.name)) { continue }
        & $helper -ToolName describe_tool -ArgumentsJson (@{name=[string]$tool.name} | ConvertTo-Json -Compress) -OutFile (Join-Path $describeDir "$($tool.name).json") -TimeoutMs 60000 | Out-Null
    }
}

if ($Refresh) { Save-LiveCapture }
$required = @('bootstrap.json','capabilities-compact.json','capabilities.json','index.json','compact.json','full.json') | ForEach-Object { Join-Path $CapturesDir $_ }
foreach ($path in $required) { if (-not (Test-Path -LiteralPath $path)) { throw "Missing capture: $path. Use -Refresh." } }
$describeDir = Join-Path $CapturesDir 'describe'
if (-not (Test-Path -LiteralPath $describeDir)) { throw "Missing describe directory: $describeDir" }

$bootstrap = Read-Capture $required[0]
$capsCompact = Read-Capture $required[1]
$caps = Read-Capture $required[2]
$index = Read-Capture $required[3]
$compact = Read-Capture $required[4]
$full = Read-Capture $required[5]
$drift = [Collections.Generic.List[object]]::new()
$gaps = [Collections.Generic.List[object]]::new()
function Add-Issue {
    param(
        [string]$Kind,
        [string]$Target,
        [string]$Detail,
        [switch]$RuntimeGap,
        [switch]$Historical
    )
    $item = [pscustomobject]@{kind=$Kind;target=$Target;detail=$Detail}
    # #1772: procedure Step 2 item 7 audits historical examples separately from active
    # instructions, so the record has to say which one a finding came from. The marker is
    # additive: a consumer that ignores it sees exactly the previous shape.
    if ($Historical) { $item | Add-Member -NotePropertyName historical -NotePropertyValue $true }
    if ($RuntimeGap) { $gaps.Add($item) } else { $drift.Add($item) }
}

# #1772: a markdown file in assets/examples is a document, never a callable. The previous
# extractor fell back to `GetFileNameWithoutExtension` when it could not name a tool, which
# invented a callable from the file name and reported one bogus `example-tool` finding per
# `result.` occurrence in the file. Returns $null when the block names no tool.
#
# Explicit param() blocks, never inline `($Example)`: the test harness parses this file and
# imports a function's body, and only a param() block survives that extraction.
function Get-ExampleToolName {
    param($Example)
    if ($Example.tool) { return [string]$Example.tool }
    if ($Example.name -and $Example.arguments) { return [string]$Example.name }
    return $null
}

# Markers that separate a historical example from an active instruction. Step 2 item 7 owns
# the rule; this is the vocabulary it recognises. The pattern lives inside the function so the
# helper is self-contained and importable without script-scope state.
function Test-HistoricalExample {
    param([string]$Text)
    $markerPattern = '(?im)historical[- ]?(?:evidence|snapshot|example)|\bnot an operational example\b|explicitly[- ]?(?:compatibility|legacy)|compatibility example|legacy example'
    return [bool]($Text -match $markerPattern)
}
function Names($Items) { @($Items | ForEach-Object name | Sort-Object -Unique) }
function Json($Value) { $Value | ConvertTo-Json -Depth 100 -Compress }

# Strip documentation prose AND describe_tool-only metadata enrichments so
# structural-equality compares contract shape, not AI-facing enrichment.
# Rationale: `describe_tool` is documented to enrich descriptions with
# cross-references like "(see #1226)" and to expose per-parameter metadata
# (`canonicalName`, `precedence`, `aliases`) that `schema({view:"full"})` does
# not include. That divergence is by design (full = lean contract,
# describe = AI-facing enrichment). Comparing only the structural skeleton
# avoids the false-positive describe-full-parity findings surfaced post-#1230.
function Strip-DocProse {
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [string]) { return $Value }
    if ($Value -is [System.Collections.IDictionary]) {
        $clone = [ordered]@{}
        foreach ($k in $Value.Keys) { $clone[$k] = Strip-DocProse $Value[$k] }
        return $clone
    }
    if ($Value -is [pscustomobject]) {
        $clone = [ordered]@{}
        foreach ($prop in $Value.PSObject.Properties) {
            # Documentation prose: AI-facing text, allowed to differ.
            # Metadata enrichments: describe_tool-only fields, full-schema omits.
            if ($prop.Name -in @('description','title','summary','x-intent','x-crossRefs','intent','crossRefs',
                                  'canonicalName','precedence','aliases','enumValues','deprecatedSince',
                                  'conflictsWith')) { continue }
            $clone[$prop.Name] = Strip-DocProse $prop.Value
        }
        return $clone
    }
    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        $arr = @()
        foreach ($item in $Value) { $arr += ,(Strip-DocProse $item) }
        return ,$arr
    }
    return $Value
}

$invalidIndexEntries = @($index.tools | Where-Object { [string]::IsNullOrWhiteSpace([string]$_.name) })
foreach ($entry in $invalidIndexEntries) { Add-Issue index-entry schema 'blank callable name in schema index' -RuntimeGap }
$capNames = @($index.tools | ForEach-Object { [string]$_.name } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
$capabilityNames = @($caps.tools.PSObject.Properties.Name | Sort-Object)
$compactNames = Names $compact.tools
$fullNames = Names $full.tools
if ([int]$caps.toolsVisible -ne $capabilityNames.Count) { Add-Issue count capabilities "toolsVisible=$($caps.toolsVisible), map=$($capabilityNames.Count)" -RuntimeGap }
if ([int]$bootstrap.toolInventory.callable -ne $capNames.Count) { Add-Issue count bootstrap "callable=$($bootstrap.toolInventory.callable), index=$($capNames.Count)" -RuntimeGap }
$advertisedCount = @($index.tools | Where-Object { $_.advertised -eq $true }).Count
if ([int]$bootstrap.toolInventory.advertised -ne $advertisedCount -or [int]$bootstrap.toolsVisible -ne $advertisedCount) { Add-Issue count bootstrap "advertised fields disagree with index advertised=$advertisedCount" -RuntimeGap }
foreach ($surface in @(@('capabilities',$capabilityNames),@('compact',$compactNames),@('full',$fullNames))) {
    $delta = Compare-Object $capNames $surface[1]
    if ($delta) { Add-Issue tool-parity $surface[0] (Json $delta) -RuntimeGap }
}

$compactByName = @{}; foreach ($tool in $compact.tools) { $compactByName[$tool.name] = $tool }
$fullByName = @{}; foreach ($tool in $full.tools) { $fullByName[$tool.name] = $tool }
$describeByName = @{}
foreach ($name in $capNames) {
    $path = Join-Path $describeDir "$name.json"
    if (-not (Test-Path -LiteralPath $path)) { Add-Issue describe-missing $name $path; continue }
    $describeByName[$name] = Read-Capture $path
}

$statuses = @{preferred=0;specialized=0;legacy=0}
foreach ($name in $capNames) {
    $c = $compactByName[$name]; $f = $fullByName[$name]; $d = $describeByName[$name]
    if (-not $c -or -not $f -or -not $d) { continue }
    if ($d.name -ne $name) { Add-Issue describe-name $name "returned $($d.name)" }
    foreach ($field in @('access','inputSchema','parameters','returns','errorCodes','requiredCapabilities','safeByDefault','agentWorkflow','useCases','compositionConstraints','resultContract')) {
        $strippedFull = Strip-DocProse $f.$field
        $strippedDesc = Strip-DocProse $d.$field
        # Treat null/empty-object as equivalent to null. Some tools have an empty
        # resultContract/agentWorkflow/useCases object in describe_tool (the
        # runtime omits the field entirely when there are no members) while full
        # schema emits an empty object. Same data, different emission convention.
        $isEmpty = { param($v) ($null -eq $v) -or ($v -is [pscustomobject] -and @($v.PSObject.Properties).Count -eq 0) -or ($v -is [System.Collections.IDictionary] -and $v.Count -eq 0) -or ($v -is [System.Collections.IEnumerable] -and @($v).Count -eq 0) }
        if (& $isEmpty $strippedFull -and (& $isEmpty $strippedDesc)) { continue }
        if ((Json $strippedFull) -ne (Json $strippedDesc)) { Add-Issue describe-full-parity "$name.$field" 'full schema and describe_tool differ after documented description/params normalization' }
    }
    $compactRequired = @($c.requiredParameters | Where-Object { $_ } | Sort-Object)
    $fullRequired = @($f.inputSchema.required | Where-Object { $_ } | Sort-Object)
    if ((Json $compactRequired) -ne (Json $fullRequired)) { Add-Issue compact-full-parity "$name.requiredParameters" 'compact requiredParameters differs from full inputSchema.required' }
    if ((Json $c.defaults) -ne (Json ([pscustomobject]@{}))) {
        foreach ($property in $c.defaults.PSObject.Properties) {
            if ((Json $property.Value) -ne (Json $f.parameters.($property.Name).default)) { Add-Issue compact-full-parity "$name.defaults.$($property.Name)" 'compact default differs from full parameter metadata' }
        }
    }

    $parameterNames = @($f.parameters.PSObject.Properties.Name)
    foreach ($parameterName in $parameterNames) {
        $parameter = $f.parameters.$parameterName
        if ($parameter.canonicalName -and $parameter.canonicalName -notin $parameterNames -and $parameter.canonicalName -notin @($parameter.enumValues)) { Add-Issue canonicalName "$name.$parameterName" "unknown canonicalName=$($parameter.canonicalName)" -RuntimeGap }
        if ($parameter.canonicalName -and $parameter.canonicalName -in @($parameter.enumValues)) { Add-Issue canonicalName "$name.$parameterName" "canonicalName=$($parameter.canonicalName) is an enum value, not a parameter" -RuntimeGap }
        if ($parameter.deprecated -and -not $parameter.deprecatedSince) { Add-Issue deprecatedSince "$name.$parameterName" 'deprecated parameter lacks deprecatedSince' -RuntimeGap }
        if ($parameter.precedence -and $parameter.precedence -notin @('canonical','deprecated')) { Add-Issue precedence "$name.$parameterName" "invalid precedence=$($parameter.precedence)" -RuntimeGap }
        foreach ($conflict in @($parameter.conflictsWith | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })) { if ($conflict -notin $parameterNames) { Add-Issue conflictsWith "$name.$parameterName" "unknown parameter=$conflict" -RuntimeGap } }
        if ($parameter.PSObject.Properties.Name -contains 'default' -and $parameter.default -is [string] -and $parameter.default -eq 'runtime-defined') { Add-Issue structured-default "$name.$parameterName" 'default is prose sentinel runtime-defined' -RuntimeGap }
        if ($parameter.sensitive -and $parameterName -notmatch '(?i)(password|secret|credential|apiKey|authToken)') { Add-Issue sensitive "$name.$parameterName" 'sensitive=true appears inferred from non-credential token vocabulary' -RuntimeGap }
    }

$constraints = @($f.compositionConstraints)
      $schemaGroups = @($f.inputSchema.anyOf | ForEach-Object { @($_.required) | Sort-Object } | ForEach-Object { ,$_ })
      if ($constraints.Count -gt 0 -and $schemaGroups.Count -eq 0) { Add-Issue composition "$name" 'compositionConstraints exist without inputSchema.anyOf' -RuntimeGap }
      $compactGroupsFlat = @($c.requiredParameterGroups | ForEach-Object { @($_ | Sort-Object) })
      if ((Json $compactGroupsFlat) -ne (Json $schemaGroups)) { Add-Issue composition "$name" 'compact requiredParameterGroups differs from full inputSchema.anyOf required groups' -RuntimeGap }

    $meta = $caps.tools.$name
    if ($meta.canonicalCommitFlag -notin @('apply','dryRun')) { Add-Issue write-intent $name "invalid canonicalCommitFlag=$($meta.canonicalCommitFlag)" -RuntimeGap }
    if ($meta.commitFlag -ne $meta.canonicalCommitFlag) { Add-Issue write-intent $name 'commitFlag differs from canonicalCommitFlag' -RuntimeGap }
    if ($meta.defaultBehavior -notin @('noop','plan','writes')) { Add-Issue write-intent $name "invalid defaultBehavior=$($meta.defaultBehavior)" -RuntimeGap }
    if ($meta.defaultBehavior -ne 'noop' -and -not $f.parameters.($meta.canonicalCommitFlag)) { Add-Issue write-intent $name 'canonical commit flag is absent from parameters' -RuntimeGap }
    foreach ($alias in @($meta.legacyAliases)) { if (-not $f.parameters.$alias) { Add-Issue write-intent $name "legacy alias $alias absent from parameters" -RuntimeGap } }
    if (-not $f.resultContract) { Add-Issue resultContract $name 'missing resultContract' -RuntimeGap }
    elseif ($meta.defaultBehavior -ne 'noop') {
        $errorFields = @($f.resultContract.errorEnvelope.shape.PSObject.Properties.Name)
        $requiredIntentFields = @('rejectedFlag','rejectedFlags','toolCommitFlag')
        $missingIntentFields = @($requiredIntentFields | Where-Object { $_ -notin $errorFields })
        if ($missingIntentFields.Count) { Add-Issue contradictory-flag-envelope $name ("resultContract error envelope omits: " + ($missingIntentFields -join ', ')) -RuntimeGap }
    }

    $status = $f.agentWorkflow.status
    if (-not $statuses.ContainsKey($status)) { Add-Issue classification $name "invalid status=$status" -RuntimeGap } else { $statuses[$status]++ }
}

foreach ($name in $capNames) {
    $visited = [Collections.Generic.HashSet[string]]::new()
    $current = $name
    while ($fullByName[$current].agentWorkflow.status -eq 'legacy') {
        if (-not $visited.Add($current)) { Add-Issue supersededBy $name 'cycle detected' -RuntimeGap; break }
        $next = $fullByName[$current].agentWorkflow.supersededBy
        if (-not $next -or $next -notin $capNames) { Add-Issue supersededBy $current "invalid target=$next" -RuntimeGap; break }
        $current = $next
    }
    if ($fullByName[$name].agentWorkflow.status -eq 'legacy' -and $fullByName[$current].agentWorkflow.status -ne 'preferred') { Add-Issue supersededBy $name "terminal target $current is not preferred" -RuntimeGap }
}

$validPhases = @('bootstrap','sync','tests','sql','forms','recovery')
$seenPhases = @()
foreach ($workflow in @($caps.preferredAgentWorkflows)) {
    $seenPhases += $workflow.phase
    if ($workflow.phase -notin $validPhases) { Add-Issue workflow $workflow.phase 'unknown phase' -RuntimeGap }
    foreach ($name in @($workflow.tools)) {
        if ($name -notin $capNames) { Add-Issue workflow "$($workflow.phase).$name" 'unknown tool' -RuntimeGap }
        elseif ($fullByName[$name].agentWorkflow.status -eq 'legacy') { Add-Issue workflow "$($workflow.phase).$name" 'legacy tool referenced' -RuntimeGap }
    }
}
if ((Compare-Object ($validPhases | Sort-Object) ($seenPhases | Sort-Object))) { Add-Issue workflow phases 'phase set differs from documented canonical phases' }

$examplesDir = Join-Path $SkillRoot 'assets\examples'
if (Test-Path -LiteralPath $examplesDir) {
    foreach ($file in Get-ChildItem -LiteralPath $examplesDir -Filter '*.md' -File) {
        $text = Get-Content -Raw -LiteralPath $file.FullName
        $jsonBlocks = @([regex]::Matches($text, '(?s)```json\s*(\{.*?\})\s*```') | Where-Object { $_.Groups[1].Value -match '"tool"\s*:' })
        $previousBlockEnd = 0
        # #1772: a `result.X` assertion below attributes to the tool the nearest preceding
        # block named. When no block named one, the assertion is unattributable and is
        # skipped rather than charged against a fabricated tool name.
        $lastTool = $null
        foreach ($match in $jsonBlocks) {
            $blockPreamble = $text.Substring($previousBlockEnd, $match.Index - $previousBlockEnd)
            $compatibility = Test-HistoricalExample $blockPreamble
            $previousBlockEnd = $match.Index + $match.Length
            try { $example = $match.Groups[1].Value | ConvertFrom-Json -Depth 100 -ErrorAction Stop } catch { Add-Issue example-json $file.Name $_.Exception.Message -Historical:$compatibility; continue }
            $toolName = Get-ExampleToolName $example
            if (-not $toolName) { Add-Issue example-json "$($file.Name):unnamed-block" 'example block names neither a tool nor a name+arguments pair' -Historical:$compatibility; continue }
            if ($toolName -notin $capNames) { Add-Issue example-tool "$($file.Name):$toolName" 'example names a tool absent from get_capabilities.tools' -Historical:$compatibility; continue }
            $lastTool = $toolName
            $arguments = if ($example.arguments) { $example.arguments } else { $example }
            foreach ($property in $arguments.PSObject.Properties.Name) {
                if ($property -in @('tool','name','arguments')) { continue }
                if (-not $fullByName[$toolName].parameters.$property) { Add-Issue example-parameter "$($file.Name):$toolName.$property" 'parameter is not in full schema' -Historical:$compatibility }
                elseif (-not $compatibility -and $fullByName[$toolName].parameters.$property.deprecated -and $fullByName[$toolName].parameters.$property.canonicalName -ne $property -and $fullByName[$toolName].parameters.$property.canonicalName -in @($fullByName[$toolName].parameters.PSObject.Properties.Name)) { Add-Issue example-parameter "$($file.Name):$toolName.$property" 'deprecated/alias parameter used without explicit compatibility marker' -Historical:$compatibility }
            }
            foreach ($requiredParameter in @($fullByName[$toolName].inputSchema.required | Where-Object { $_ })) {
                if ($requiredParameter -notin @($arguments.PSObject.Properties.Name)) { Add-Issue example-missingParam "$($file.Name):$toolName.$requiredParameter" 'example omits a schema-required parameter; live MCP_INPUT_INVALID uses missingParam for this boundary' -Historical:$compatibility }
            }
        }
        $fileIsHistorical = Test-HistoricalExample $text
        foreach ($match in [regex]::Matches($text, '(?i)\b(?:result|response)\.([A-Za-z][A-Za-z0-9_]*)')) {
            if (-not $lastTool) { continue }
            $toolName = $lastTool
            $field = $match.Groups[1].Value
            $result = $fullByName[$toolName].resultContract
            $fields = @('content','isError','ok','error') + @($result.dataSchema.properties.PSObject.Properties.Name) + @($result.errorEnvelope.shape.PSObject.Properties.Name)
            if ($field -notin $fields) { Add-Issue example-result "$($file.Name):$field" 'asserted result field is absent from resultContract/envelope' -Historical:$fileIsHistorical }
        }
    }
}

$report = [pscustomobject]@{schemaVersion='dysflow.semantic-audit/v1';repositoryHead=$repositoryHead;repositoryClean=$repositoryClean;adapterVersion=$caps.adapterVersion;toolInventory=$bootstrap.toolInventory;callableCount=$capNames.Count;advertisedCount=$advertisedCount;compactCount=$compactNames.Count;fullCount=$fullNames.Count;describedCount=$describeByName.Count;classification=[pscustomobject]$statuses;workflowPhases=@($seenPhases);compositionConstraintsCount=@($full.tools | Where-Object { @($_.compositionConstraints).Count -gt 0 }).Count;DRIFT=@($drift);'RUNTIME CONTRACT GAP'=@($gaps);findings=@($drift);runtimeGaps=@($gaps)}
if ($OutputJson) { [IO.File]::WriteAllText($OutputJson, ($report | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false)) }
$report | ConvertTo-Json -Depth 100
if ($drift.Count) { exit 1 }
if ($FailOnRuntimeGap -and $gaps.Count) { exit 2 }
exit 0
