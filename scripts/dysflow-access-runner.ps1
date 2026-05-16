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

function Convert-LinkedTableDefs {
  param($Database)
  @(Convert-TableDefs -Database $Database -Linked $true | ForEach-Object {
    [ordered]@{
      name = $_.name
      sourceTableName = $_.sourceTableName
      connect = $_.connect
      backendPath = Get-BackendPathFromConnect -Connect ([string]$_.connect)
    }
  })
}

function Get-BackendPathFromConnect {
  param([string] $Connect)
  if ([string]::IsNullOrWhiteSpace($Connect)) { return $null }
  $match = [regex]::Match($Connect, '(?i)(?:^|;)DATABASE=([^;]+)')
  if (-not $match.Success) { return $null }
  return $match.Groups[1].Value
}

function New-AccessBackendConnectString {
  param([string] $BackendPath)
  if ([string]::IsNullOrWhiteSpace($BackendPath)) { throw 'backendPath is required.' }
  if (-not (Test-Path -LiteralPath $BackendPath)) { throw "Backend path not found: $BackendPath" }
  return ';DATABASE=' + $BackendPath
}

function ConvertTo-LinkTablePlans {
  param($Payload)
  $plans = New-Object System.Collections.ArrayList
  if ($Payload.tables) {
    foreach ($item in @($Payload.tables)) {
      [void]$plans.Add([ordered]@{
        tableName = [string]$item.tableName
        sourceTableName = if ([string]::IsNullOrWhiteSpace([string]$item.sourceTableName)) { [string]$item.tableName } else { [string]$item.sourceTableName }
        backendPath = if ([string]::IsNullOrWhiteSpace([string]$item.backendPath)) { [string]$Payload.backendPath } else { [string]$item.backendPath }
      })
    }
    return @($plans)
  }
  $tableName = [string]$Payload.tableName
  [void]$plans.Add([ordered]@{
    tableName = $tableName
    sourceTableName = if ([string]::IsNullOrWhiteSpace([string]$Payload.sourceTableName)) { $tableName } else { [string]$Payload.sourceTableName }
    backendPath = [string]$Payload.backendPath
  })
  return @($plans)
}

function Get-RequestedTableNames {
  param($Payload)
  $names = @(ConvertTo-StringArray $Payload.tableNames)
  if ($names.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$Payload.tableName)) {
    $names = @([string]$Payload.tableName)
  }
  return $names
}

function Select-LinkedTablesForPayload {
  param($Database, $Payload)
  $requested = @(Get-RequestedTableNames -Payload $Payload)
  $links = @(Convert-LinkedTableDefs -Database $Database)
  if ($requested.Count -eq 0) { return $links }
  return @($links | Where-Object { $requested -contains $_.name })
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

function ConvertTo-StringArray {
  param($Value)
  if ($null -eq $Value) { return @() }
  if ($Value -is [System.Array]) { return @($Value | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) }
  return @([string]$Value | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Protect-AccessTableName {
  param($Payload, [string] $TableName)
  if ([string]::IsNullOrWhiteSpace($TableName)) { return }
  if ($TableName.StartsWith('MSys', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify system table: $TableName"
  }
  $denyTables = @(ConvertTo-StringArray $Payload.denyTables)
  foreach ($denyTable in $denyTables) {
    if ($denyTable -eq '*' -or $denyTable.Equals($TableName, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Table denied by policy: $TableName"
    }
  }
  $allowTables = @(ConvertTo-StringArray $Payload.allowTables)
  if ($allowTables.Count -gt 0) {
    $allowed = $false
    foreach ($allowTable in $allowTables) {
      if ($allowTable -eq '*' -or $allowTable.Equals($TableName, [System.StringComparison]::OrdinalIgnoreCase)) {
        $allowed = $true
        break
      }
    }
    if (-not $allowed) { throw "Table not allowed by policy: $TableName" }
  }
}

function Get-SqlTableNames {
  param([string] $Sql)
  $tables = New-Object System.Collections.ArrayList
  foreach ($pattern in @('(?i)\bUPDATE\s+(?:\[([^\]]+)\]|([A-Za-z0-9_]+))', '(?i)\bINTO\s+(?:\[([^\]]+)\]|([A-Za-z0-9_]+))', '(?i)\bFROM\s+(?:\[([^\]]+)\]|([A-Za-z0-9_]+))')) {
    foreach ($match in [regex]::Matches($Sql, $pattern)) {
      $name = $match.Groups[1].Value
      if ([string]::IsNullOrWhiteSpace($name)) { $name = $match.Groups[2].Value }
      [void]$tables.Add($name.Trim())
    }
  }
  return @($tables | Select-Object -Unique)
}

function Protect-AccessSql {
  param($Payload, [string] $Sql)
  if ([string]::IsNullOrWhiteSpace($Sql)) { throw 'SQL is required for write action.' }
  foreach ($tableName in @(Get-SqlTableNames -Sql $Sql)) {
    Protect-AccessTableName -Payload $Payload -TableName $tableName
  }
}

function ConvertTo-SqlLiteral {
  param($Value)
  if ($null -eq $Value) { return 'NULL' }
  if ($Value -is [bool]) { if ($Value) { return 'True' } else { return 'False' } }
  if ($Value -is [int] -or $Value -is [long] -or $Value -is [decimal] -or $Value -is [double]) { return [string]$Value }
  return "'" + ([string]$Value).Replace("'", "''") + "'"
}

function ConvertTo-SeedFixtureSql {
  param([string] $TableName, $Rows)
  $statements = New-Object System.Collections.ArrayList
  foreach ($row in @($Rows)) {
    $columns = @($row.PSObject.Properties | ForEach-Object { '[' + $_.Name.Replace(']', ']]') + ']' })
    $values = @($row.PSObject.Properties | ForEach-Object { ConvertTo-SqlLiteral $_.Value })
    [void]$statements.Add('INSERT INTO [' + $TableName.Replace(']', ']]') + '] (' + ($columns -join ', ') + ') VALUES (' + ($values -join ', ') + ')')
  }
  return @($statements)
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
      [ordered]@{ name = 'access-db-path'; ok = $true; message = "configuredAccessPath=$AccessDbPath" },
      [ordered]@{ name = 'access-open'; ok = $true; message = "openedAccessPath=$AccessDbPath" }
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
    if ($action -eq 'list_links') {
      [ordered]@{ links = @(Convert-LinkedTableDefs -Database $db) } | ConvertTo-Json -Compress -Depth 20
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

    if ($action -eq 'link_tables') {
      $plans = @(ConvertTo-LinkTablePlans -Payload $payload)
      foreach ($plan in $plans) { Protect-AccessTableName -Payload $payload -TableName ([string]$plan.tableName) }
      if ($payload.dryRun -eq $true) {
        [ordered]@{ applied = $false; links = $plans } | ConvertTo-Json -Compress -Depth 20
        exit 0
      }
      foreach ($plan in $plans) {
        $connect = New-AccessBackendConnectString -BackendPath ([string]$plan.backendPath)
        $tableDef = $db.CreateTableDef([string]$plan.tableName)
        $tableDef.SourceTableName = [string]$plan.sourceTableName
        $tableDef.Connect = $connect
        $db.TableDefs.Append($tableDef)
      }
      [ordered]@{ applied = $true; links = $plans } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }
    if ($action -eq 'relink_tables' -or $action -eq 'localize_backend_links') {
      $links = @(Select-LinkedTablesForPayload -Database $db -Payload $payload)
      $backendPath = [string]$payload.backendPath
      $plans = @($links | ForEach-Object {
        [ordered]@{ tableName = $_.name; sourceTableName = $_.sourceTableName; from = $_.backendPath; to = $backendPath }
      })
      if ($payload.dryRun -eq $true) {
        [ordered]@{ applied = $false; links = $plans } | ConvertTo-Json -Compress -Depth 20
        exit 0
      }
      $connect = New-AccessBackendConnectString -BackendPath $backendPath
      foreach ($link in $links) {
        Protect-AccessTableName -Payload $payload -TableName ([string]$link.name)
        $tableDef = $db.TableDefs.Item([string]$link.name)
        $tableDef.Connect = $connect
        $tableDef.RefreshLink()
      }
      [ordered]@{ applied = $true; links = $plans } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }
    if ($action -eq 'unlink_table') {
      $tableName = [string]$payload.tableName
      Protect-AccessTableName -Payload $payload -TableName $tableName
      if ($payload.dryRun -eq $true) {
        [ordered]@{ applied = $false; tableName = $tableName } | ConvertTo-Json -Compress -Depth 20
        exit 0
      }
      $tableDef = $db.TableDefs.Item($tableName)
      if ([string]::IsNullOrWhiteSpace([string]$tableDef.Connect)) { throw "Table is not linked: $tableName" }
      $db.TableDefs.Delete($tableName)
      [ordered]@{ applied = $true; tableName = $tableName } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'exec_sql') {
      $sql = [string]$payload.sql
      Protect-AccessSql -Payload $payload -Sql $sql
      if ($payload.dryRun -eq $true) {
        [ordered]@{ applied = $false; statements = @($sql) } | ConvertTo-Json -Compress -Depth 20
        exit 0
      }
      $db.Execute($sql, 128)
      [ordered]@{ applied = $true; affectedRows = $db.RecordsAffected } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }
    if ($action -eq 'run_script') {
      $scriptPath = [string]$payload.scriptPath
      if ([string]::IsNullOrWhiteSpace($scriptPath) -or -not (Test-Path -LiteralPath $scriptPath)) { throw "SQL script not found: $scriptPath" }
      $statements = @((Get-Content -LiteralPath $scriptPath -Raw) -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
      foreach ($statement in $statements) { Protect-AccessSql -Payload $payload -Sql $statement }
      if ($payload.dryRun -eq $true) {
        [ordered]@{ applied = $false; scriptPath = $scriptPath; statements = $statements } | ConvertTo-Json -Compress -Depth 20
        exit 0
      }
      $affectedRows = 0
      foreach ($statement in $statements) {
        $db.Execute($statement, 128)
        $affectedRows += [int]$db.RecordsAffected
      }
      [ordered]@{ applied = $true; affectedRows = $affectedRows } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }
    if ($action -eq 'create_table') {
      $tableName = [string]$payload.tableName
      Protect-AccessTableName -Payload $payload -TableName $tableName
      $sql = 'CREATE TABLE [' + $tableName.Replace(']', ']]') + '] (' + ([string]$payload.definition) + ')'
      if ($payload.dryRun -eq $true) {
        [ordered]@{ applied = $false; statements = @($sql) } | ConvertTo-Json -Compress -Depth 20
        exit 0
      }
      $db.Execute($sql, 128)
      [ordered]@{ applied = $true; affectedRows = $db.RecordsAffected } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }
    if ($action -eq 'drop_table') {
      $tableName = [string]$payload.tableName
      Protect-AccessTableName -Payload $payload -TableName $tableName
      $sql = 'DROP TABLE [' + $tableName.Replace(']', ']]') + ']'
      if ($payload.dryRun -eq $true) {
        [ordered]@{ applied = $false; statements = @($sql) } | ConvertTo-Json -Compress -Depth 20
        exit 0
      }
      $db.Execute($sql, 128)
      [ordered]@{ applied = $true; affectedRows = $db.RecordsAffected } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }
    if ($action -eq 'seed_fixture') {
      $tableName = [string]$payload.tableName
      Protect-AccessTableName -Payload $payload -TableName $tableName
      $statements = @(ConvertTo-SeedFixtureSql -TableName $tableName -Rows $payload.rows)
      if ($payload.dryRun -eq $true) {
        [ordered]@{ applied = $false; tableName = $tableName; statements = $statements } | ConvertTo-Json -Compress -Depth 20
        exit 0
      }
      $affectedRows = 0
      foreach ($statement in $statements) {
        $db.Execute($statement, 128)
        $affectedRows += [int]$db.RecordsAffected
      }
      [ordered]@{ applied = $true; affectedRows = $affectedRows } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }
    if ($action -eq 'teardown_fixture') {
      $tableName = [string]$payload.tableName
      Protect-AccessTableName -Payload $payload -TableName $tableName
      $sql = 'DELETE FROM [' + $tableName.Replace(']', ']]') + ']'
      if ($payload.dryRun -eq $true) {
        [ordered]@{ applied = $false; statements = @($sql) } | ConvertTo-Json -Compress -Depth 20
        exit 0
      }
      $db.Execute($sql, 128)
      [ordered]@{ applied = $true; affectedRows = $db.RecordsAffected } | ConvertTo-Json -Compress -Depth 10
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
