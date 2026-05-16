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

function Convert-TableDefs {
  param($Database, [bool] $Linked)
  $tables = New-Object System.Collections.ArrayList
  foreach ($table in $Database.TableDefs) {
    $name = [string]$table.Name
    if ($name.StartsWith('MSys')) { continue }
    $isLinked = -not [string]::IsNullOrWhiteSpace([string]$table.Connect)
    if ($Linked -ne $isLinked) { continue }
    [void]$tables.Add([ordered]@{
      name = $name
      linked = $isLinked
      sourceTableName = $table.SourceTableName
      connect = $table.Connect
    })
  }
  return @($tables | Sort-Object name)
}

function Convert-TableSchema {
  param($Database, [string] $TableName)
  $table = $Database.TableDefs.Item($TableName)
  $fields = New-Object System.Collections.ArrayList
  foreach ($field in $table.Fields) {
    [void]$fields.Add([ordered]@{
      name = [string]$field.Name
      type = [int]$field.Type
      size = [int]$field.Size
      required = [bool]$field.Required
    })
  }
  return [ordered]@{ tableName = $TableName; fields = $fields }
}

function Convert-Relationships {
  param($Database)
  $relationships = New-Object System.Collections.ArrayList
  foreach ($relationship in $Database.Relations) {
    $fields = New-Object System.Collections.ArrayList
    foreach ($field in $relationship.Fields) {
      [void]$fields.Add([ordered]@{
        name = [string]$field.Name
        foreignName = [string]$field.ForeignName
      })
    }
    [void]$relationships.Add([ordered]@{
      name = [string]$relationship.Name
      table = [string]$relationship.Table
      foreignTable = [string]$relationship.ForeignTable
      fields = $fields
    })
  }
  return $relationships
}

function Get-AccessFiles {
  param([string] $RootPath)
  if ([string]::IsNullOrWhiteSpace($RootPath)) { $RootPath = (Get-Location).Path }
  @(Get-ChildItem -LiteralPath $RootPath -Recurse -File |
    Where-Object { $_.Extension -in @('.accdb', '.mdb') } |
    Select-Object @{ Name = 'path'; Expression = { $_.FullName } },
                  @{ Name = 'name'; Expression = { $_.Name } },
                  @{ Name = 'length'; Expression = { $_.Length } })
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
    $action = [string]$payload.action
    if ([string]::IsNullOrWhiteSpace($action)) { $action = 'query_sql' }

    if ($action -eq 'list_tables') {
      [ordered]@{ tables = (Convert-TableDefs -Database $db -Linked $false) } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }
    if ($action -eq 'list_linked_tables') {
      [ordered]@{ tables = (Convert-TableDefs -Database $db -Linked $true) } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }
    if ($action -eq 'get_schema') {
      [ordered]@{ schema = (Convert-TableSchema -Database $db -TableName ([string]$payload.tableName)) } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }
    if ($action -eq 'count_rows') {
      $sql = 'SELECT COUNT(*) AS rowCount FROM [' + ([string]$payload.tableName).Replace(']', ']]') + ']'
      $rs = $db.OpenRecordset($sql)
      try {
        [ordered]@{ tableName = [string]$payload.tableName; count = [int]$rs.Fields.Item('rowCount').Value } | ConvertTo-Json -Compress -Depth 10
      } finally {
        if ($null -ne $rs) { $rs.Close() }
      }
      exit 0
    }
    if ($action -eq 'distinct_values') {
      $tableName = ([string]$payload.tableName).Replace(']', ']]')
      $columnName = ([string]$payload.columnName).Replace(']', ']]')
      $rs = $db.OpenRecordset("SELECT DISTINCT [$columnName] AS value FROM [$tableName]")
      try {
        [ordered]@{ tableName = [string]$payload.tableName; columnName = [string]$payload.columnName; values = (Convert-RecordsetRows $rs) } | ConvertTo-Json -Compress -Depth 20
      } finally {
        if ($null -ne $rs) { $rs.Close() }
      }
      exit 0
    }
    if ($action -eq 'get_relationships') {
      [ordered]@{ relationships = (Convert-Relationships -Database $db) } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }
    if ($action -eq 'list_access_files') {
      [ordered]@{ files = (Get-AccessFiles -RootPath ([string]$payload.rootPath)) } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }
    if ($action -eq 'compare_backends') {
      $otherPath = [string]$payload.backendPath
      if ([string]::IsNullOrWhiteSpace($otherPath) -or -not (Test-Path -LiteralPath $otherPath)) { throw "Backend path not found: $otherPath" }
      $other = $access.DBEngine.OpenDatabase($otherPath)
      try {
        $left = @(Convert-TableDefs -Database $db -Linked $false | ForEach-Object { $_.name })
        $right = @(Convert-TableDefs -Database $other -Linked $false | ForEach-Object { $_.name })
        [ordered]@{
          leftOnly = @($left | Where-Object { $right -notcontains $_ })
          rightOnly = @($right | Where-Object { $left -notcontains $_ })
          common = @($left | Where-Object { $right -contains $_ })
        } | ConvertTo-Json -Compress -Depth 20
      } finally {
        if ($null -ne $other) { $other.Close() }
      }
      exit 0
    }

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
