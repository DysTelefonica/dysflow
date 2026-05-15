#requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $AccessDbPath,
  [Parameter(Mandatory = $true)] [ValidateSet('vba','query','diagnostics')] [string] $Operation,
  [Parameter(Mandatory = $true)] [string] $PayloadJson,
  [Parameter(Mandatory = $false)] [string] $AccessPassword,
  [Parameter(Mandatory = $false)] [string] $OperationId
)

$ErrorActionPreference = 'Stop'

function ConvertTo-IsoStartTime {
  param($CreationDate)
  if ($null -eq $CreationDate) { return $null }
  if ($CreationDate -is [datetime]) { return $CreationDate.ToUniversalTime().ToString('o') }
  $text = [string]$CreationDate
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  if ($text -match '^\d{14}\.') {
    return ([System.Management.ManagementDateTimeConverter]::ToDateTime($text)).ToUniversalTime().ToString('o')
  }
  return ([datetime]::Parse($text)).ToUniversalTime().ToString('o')
}

function Get-MsAccessProcesses {
  @(Get-CimInstance Win32_Process -Filter "Name = 'MSACCESS.EXE'" -ErrorAction SilentlyContinue |
    Select-Object ProcessId, CreationDate, CommandLine)
}

function Write-AccessProcessMarker {
  param($Before, [string] $AccessDbPath)
  $after = Get-MsAccessProcesses
  $beforeIds = @{}
  foreach ($proc in $Before) { $beforeIds[[int]$proc.ProcessId] = $true }
  $candidate = $null
  foreach ($proc in $after) {
    if (-not $beforeIds.ContainsKey([int]$proc.ProcessId)) {
      $candidate = $proc
      break
    }
  }
  if ($null -eq $candidate) {
    foreach ($proc in $after) {
      if ($proc.CommandLine -and $proc.CommandLine.ToLowerInvariant().Contains($AccessDbPath.ToLowerInvariant())) {
        $candidate = $proc
        break
      }
    }
  }
  if ($null -ne $candidate) {
    $payload = [ordered]@{
      pid = [int]$candidate.ProcessId
      processStartTime = ConvertTo-IsoStartTime $candidate.CreationDate
      commandLine = $candidate.CommandLine
    }
    [Console]::Error.WriteLine('DYSFLOW_ACCESS_PROCESS ' + ($payload | ConvertTo-Json -Compress -Depth 5))
  }
}

function ConvertFrom-JsonCompat {
  param([string] $Json)
  if ([string]::IsNullOrWhiteSpace($Json)) { return @{} }
  return $Json | ConvertFrom-Json
}

function Convert-RecordsetRows {
  param($Recordset)
  $rows = New-Object System.Collections.ArrayList
  while (-not $Recordset.EOF) {
    $row = [ordered]@{}
    for ($i = 0; $i -lt $Recordset.Fields.Count; $i++) {
      $field = $Recordset.Fields.Item($i)
      $row[$field.Name] = $field.Value
    }
    [void]$rows.Add($row)
    $Recordset.MoveNext()
  }
  return $rows
}

$access = $null
try {
  if (-not (Test-Path -LiteralPath $AccessDbPath)) {
    throw "Access database not found: $AccessDbPath"
  }

  $before = Get-MsAccessProcesses
  $payload = ConvertFrom-JsonCompat $PayloadJson
  $access = New-Object -ComObject Access.Application
  $access.Visible = $false

  if ([string]::IsNullOrEmpty($AccessPassword)) {
    $access.OpenCurrentDatabase($AccessDbPath)
  } else {
    $access.OpenCurrentDatabase($AccessDbPath, $false, $AccessPassword)
  }

  Write-AccessProcessMarker -Before $before -AccessDbPath $AccessDbPath

  if ($Operation -eq 'diagnostics') {
    $checks = @(
      [ordered]@{ name = 'access-db-path'; ok = $true; message = 'configured' },
      [ordered]@{ name = 'access-open'; ok = $true; message = 'opened' }
    )
    [ordered]@{ checks = $checks } | ConvertTo-Json -Compress -Depth 10
    exit 0
  }

  if ($Operation -eq 'vba') {
    $argsList = @()
    if ($payload.arguments) { $argsList = @($payload.arguments) }
    $runArgs = @($payload.procedureName) + $argsList
    $returnValue = $access.Run.Invoke($runArgs)
    [ordered]@{ returnValue = $returnValue } | ConvertTo-Json -Compress -Depth 10
    exit 0
  }

  if ($Operation -eq 'query') {
    $db = $access.CurrentDb()
    if ($payload.mode -eq 'read') {
      $rs = $db.OpenRecordset([string]$payload.sql)
      try {
        $rows = Convert-RecordsetRows $rs
        [ordered]@{ rows = $rows } | ConvertTo-Json -Compress -Depth 20
      } finally {
        if ($null -ne $rs) { $rs.Close() }
      }
      exit 0
    }

    $db.Execute([string]$payload.sql, 128)
    [ordered]@{ affectedRows = $db.RecordsAffected } | ConvertTo-Json -Compress -Depth 10
    exit 0
  }

  throw "Unsupported operation: $Operation"
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally {
  if ($null -ne $access) {
    try { $access.CloseCurrentDatabase() } catch {}
    try { $access.Quit() } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($access) } catch {}
  }
}
