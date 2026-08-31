[CmdletBinding()]
param(
    [ValidateSet('tools/call')][string]$Method = 'tools/call',
    [Parameter(Mandatory)][ValidateSet('bootstrap','get_capabilities','schema','describe_tool')][string]$ToolName,
    [hashtable]$Arguments = @{},
    [string]$ArgumentsJson,
    [ValidateRange(1000,120000)][int]$TimeoutMs = 30000,
    [string]$OutFile,
    [string]$DysflowShim = $env:DYSFLOW_SHIM
)

$ErrorActionPreference = 'Stop'
if ($ArgumentsJson) { $Arguments = $ArgumentsJson | ConvertFrom-Json -AsHashtable }
if ($ToolName -eq 'schema' -and $Arguments.view -notin @('index','compact','full')) {
    throw 'schema requires an explicit view=index|compact|full.'
}
if ($ToolName -eq 'describe_tool' -and [string]::IsNullOrWhiteSpace([string]$Arguments.name)) {
    throw 'describe_tool requires a non-empty name.'
}
if ([string]::IsNullOrWhiteSpace($DysflowShim)) {
    throw 'Set -DysflowShim or DYSFLOW_SHIM to the candidate runtime launcher. Production-runtime fallback is intentionally disabled.'
}
if (-not (Test-Path -LiteralPath $DysflowShim)) { throw "dysflow launcher not found: $DysflowShim" }

$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = $DysflowShim
$psi.ArgumentList.Add('mcp')
$psi.ArgumentList.Add('--disable-writes')
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$process = [System.Diagnostics.Process]::Start($psi)

function Send-Json([object]$Message) {
    $process.StandardInput.WriteLine(($Message | ConvertTo-Json -Depth 30 -Compress))
    $process.StandardInput.Flush()
}

function Read-Response([int]$Id) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ([DateTime]::UtcNow -lt $deadline) {
        $line = $process.StandardOutput.ReadLine()
        if ($null -eq $line) { break }
        try { $message = $line | ConvertFrom-Json -Depth 100 -ErrorAction Stop } catch { continue }
        if ($message.id -eq $Id) { return $message }
    }
    throw "dysflow JSON-RPC stream closed or timed out before response id=$Id."
}

function Parse-TextPayload([object]$Result) {
    if (-not $Result.content -or $Result.content.Count -ne 1 -or $Result.content[0].type -ne 'text') {
        throw 'Unexpected MCP content envelope.'
    }
    try { return $Result.content[0].text | ConvertFrom-Json -Depth 100 -ErrorAction Stop }
    catch { throw 'MCP text fallback is not a complete JSON payload and structuredContent was absent.' }
}

try {
    Send-Json @{ jsonrpc='2.0'; id=1; method='initialize'; params=@{ protocolVersion='2025-06-18'; capabilities=@{}; clientInfo=@{name='dysflow-readonly-audit';version='3.0.0'} } }
    $init = Read-Response 1
    if ($init.error) { throw "initialize failed: $($init.error.message)" }
    Send-Json @{ jsonrpc='2.0'; method='notifications/initialized' }
    Send-Json @{ jsonrpc='2.0'; id=2; method=$Method; params=@{name=$ToolName;arguments=$Arguments} }
    $response = Read-Response 2
    if ($response.error) { throw "tools/call failed: $($response.error.message)" }

    $payload = if ($response.result.structuredContent) {
        $response.result.structuredContent
    } else {
        Parse-TextPayload $response.result
    }
    if ($payload.schemaVersion -ne 'dysflow.result/v1') {
        throw "Unexpected or missing Dysflow schemaVersion: $($payload.schemaVersion)"
    }
    $result = [pscustomobject]@{
        ok = -not [bool]$response.result.isError
        source = if ($response.result.structuredContent) { 'structuredContent' } else { 'text' }
        payload = $payload
    }
    $json = $result | ConvertTo-Json -Depth 100 -Compress
    if ($OutFile) {
        $parent = Split-Path -Parent $OutFile
        if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        [IO.File]::WriteAllText($OutFile, $json, [Text.UTF8Encoding]::new($false))
    }
    if (-not $OutFile) { [Console]::Out.WriteLine($json) }
    if (-not $result.ok) { exit 1 }
} finally {
    try { $process.StandardInput.Close() } catch {}
    if (-not $process.WaitForExit(2000)) { try { $process.Kill($true) } catch {} }
}
