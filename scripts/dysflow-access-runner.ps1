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

if ([string]::IsNullOrEmpty($AccessPassword)) {
  $AccessPassword = $env:DYSFLOW_ACCESS_PASSWORD
}
if ([string]::IsNullOrEmpty($AccessPassword)) {
  $AccessPassword = $env:ACCESS_VBA_PASSWORD
}

$BackendPassword = $env:DYSFLOW_BACKEND_PASSWORD

function Open-DatabaseWithBackendPassword {
  param(
    [Parameter(Mandatory = $true)] $DbEngine,
    [Parameter(Mandatory = $true)] [string] $DatabasePath
  )
  if ([string]::IsNullOrWhiteSpace($BackendPassword)) {
    return $DbEngine.OpenDatabase($DatabasePath)
  }
  return $DbEngine.OpenDatabase($DatabasePath, $false, $false, ";PWD=$BackendPassword")
}

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

function Resolve-SandboxedPath {
  param(
    [Parameter(Mandatory = $true)] [string] $RawPath,
    [Parameter(Mandatory = $true)] [string] $RootPath,
    [Parameter(Mandatory = $true)] [string] $Label
  )
  $baseFull = [System.IO.Path]::GetFullPath($RootPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $resolved = [System.IO.Path]::GetFullPath($RawPath)
  if (-not ($resolved.Equals($baseFull, [System.StringComparison]::OrdinalIgnoreCase) -or $resolved.StartsWith($baseFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or $resolved.StartsWith($baseFull + [System.IO.Path]::AltDirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "$Label must stay inside the resolved root."
  }
  return $resolved
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

function Get-TableNames {
  param($Database, [switch] $LinkedOnly)
  $names = New-Object System.Collections.ArrayList
  foreach ($table in $Database.TableDefs) {
    $name = [string]$table.Name
    if ($name.StartsWith("MSys")) { continue }
    $isLinked = -not [string]::IsNullOrWhiteSpace([string]$table.Connect)
    if ($LinkedOnly -and -not $isLinked) { continue }
    [void]$names.Add($name)
  }
  return $names
}

function Get-TableSchema {
  param($Database, [string] $TableName)
  $table = $Database.TableDefs.Item($TableName)
  $schema = New-Object System.Collections.ArrayList
  foreach ($field in $table.Fields) {
    [void]$schema.Add([ordered]@{
      name = [string]$field.Name
      type = [int]$field.Type
      size = if ($field.Properties.Item("Size")) { [int]$field.Size } else { $null }
      required = [bool]$field.Required
      allowZeroLength = if ($field.Properties.Item("AllowZeroLength")) { [bool]$field.AllowZeroLength } else { $null }
    })
  }
  return $schema
}

function Get-Relationships {
  param($Database)
  $relationships = New-Object System.Collections.ArrayList
  foreach ($rel in $Database.Relations) {
    $fields = New-Object System.Collections.ArrayList
    foreach ($field in $rel.Fields) {
      [void]$fields.Add([ordered]@{
        name = [string]$field.Name
        foreignName = [string]$field.ForeignName
      })
    }
    [void]$relationships.Add([ordered]@{
      name = [string]$rel.Name
      table = [string]$rel.Table
      foreignTable = [string]$rel.ForeignTable
      fields = $fields
    })
  }
  return $relationships
}

function Get-LinkInfo {
  param($Database)
  $links = New-Object System.Collections.ArrayList
  foreach ($table in $Database.TableDefs) {
    $name = [string]$table.Name
    if ($name.StartsWith("MSys")) { continue }
    $connect = [string]$table.Connect
    if ([string]::IsNullOrWhiteSpace($connect)) { continue }
    $backendPath = $null
    if ($connect -match '(?i)(?:^|;)DATABASE=(.+)$') {
      $backendPath = $Matches[1].Trim()
    }
    [void]$links.Add([ordered]@{
      name = $name
      sourceTableName = [string]$table.SourceTableName
      connect = $connect
      backendPath = $backendPath
      attributes = [int]$table.Attributes
    })
  }
  return $links
}

function Resolve-QueryDefinitions {
  param($Database, $Payload)
  $definitions = New-Object System.Collections.ArrayList
  foreach ($query in $Database.QueryDefs) {
    try {
      $name = [string]$query.Name
      if ($name.StartsWith("~")) { continue }
      [void]$definitions.Add([ordered]@{
        name = $name
        sql = [string]$query.SQL
        returnsRecords = [bool]$query.ReturnsRecords
      })
    } catch {}
  }
  return $definitions
}

function Export-QueryDefinitions {
  param($Database, $Payload, [string]$AccessDbPath)
  $queries = @(Resolve-QueryDefinitions -Database $Database -Payload $Payload)
  $exportPath = [string]$Payload.exportPath
  if (-not [string]::IsNullOrWhiteSpace($exportPath)) {
    $basePath = [string]$Payload.rootPath
    if ([string]::IsNullOrWhiteSpace($basePath)) { $basePath = Split-Path -Path $AccessDbPath -Parent }
    $exportFull = Resolve-SandboxedPath -RawPath $exportPath -RootPath $basePath -Label "exportPath"
    $json = [ordered]@{ queries = $queries } | ConvertTo-Json -Compress -Depth 20
    [System.IO.File]::WriteAllText($exportFull, $json, [System.Text.Encoding]::UTF8)
    $exportPath = $exportFull
  }
  return [ordered]@{
    exportPath = $exportPath
    queries = $queries
  }
}

function Import-QueryDefinitions {
  param($Database, $Payload)
  $definitions = @()
  $basePath = [string]$Payload.rootPath
  if ([string]::IsNullOrWhiteSpace($basePath)) {
    $basePath = Split-Path -Path $AccessDbPath -Parent
  }
  if ($Payload.queryDefinitions) {
    $definitions = @($Payload.queryDefinitions)
  } elseif (-not [string]::IsNullOrWhiteSpace([string]$Payload.importPath)) {
    $importFull = Resolve-SandboxedPath -RawPath ([string]$Payload.importPath) -RootPath $basePath -Label "importPath"
    if ([System.IO.Path]::GetExtension($importFull).ToLowerInvariant() -ne ".json") {
      throw "importPath extension must be .json."
    }
    $raw = Get-Content -LiteralPath $importFull -Raw
    $parsed = $raw | ConvertFrom-Json
    $definitions = if ($parsed.queries) { @($parsed.queries) } else { @($parsed) }
  }
  if ($definitions.Count -eq 0) { throw "queryDefinitions or importPath is required for import_queries." }

  $imported = New-Object System.Collections.ArrayList
  foreach ($definition in $definitions) {
    $name = [string]$definition.name
    $sql = [string]$definition.sql
    if ([string]::IsNullOrWhiteSpace($name)) { throw "Each query definition requires a name." }
    if ([string]::IsNullOrWhiteSpace($sql)) { throw "Each query definition requires sql." }

    try {
      $queryDef = $Database.QueryDefs.Item($name)
      $queryDef.SQL = $sql
    } catch {
      $queryDef = $Database.CreateQueryDef($name, $sql)
    }
    [void]$imported.Add([ordered]@{
      name = [string]$queryDef.Name
      sql = [string]$queryDef.SQL
    })
  }

  return [ordered]@{
    imported = $imported.Count
    queries = $imported
  }
}

function Get-LinkNames {
  param($Database)
  $names = New-Object System.Collections.ArrayList
  foreach ($table in $Database.TableDefs) {
    try {
      $name = [string]$table.Name
      if ($name.StartsWith("MSys")) { continue }
      if (-not [string]::IsNullOrWhiteSpace([string]$table.Connect)) {
        [void]$names.Add($name)
      }
    } catch {}
  }
  return @($names | Sort-Object -Unique)
}

function Resolve-LinkTargetNames {
  param($Database, $Payload)
  $tableNames = @()
  if ($Payload.tableNames) { $tableNames = @($Payload.tableNames) }
  elseif ($Payload.tableName) { $tableNames = @([string]$Payload.tableName) }
  if ($tableNames.Count -gt 0) { return $tableNames }
  if ($Payload.action -eq 'relink_tables' -or $Payload.action -eq 'localize_backend_links' -or $Payload.action -eq 'unlink_table') {
    return @(Get-LinkNames -Database $Database)
  }
  return @()
}

function Update-LinkTables {
  param($Database, $Payload, [switch] $RefreshOnly)

  $backendPath = [string]$Payload.backendPath
  if ([string]::IsNullOrWhiteSpace($backendPath)) {
    throw "backendPath is required for link_table actions."
  }
  if (-not (Test-Path -LiteralPath $backendPath)) {
    throw "Backend database not found: $backendPath"
  }

  $dbEngine = New-Object -ComObject DAO.DBEngine.120
  $backendDb = Open-DatabaseWithBackendPassword -DbEngine $dbEngine -DatabasePath $backendPath
  try {
    $targetNames = @(Resolve-LinkTargetNames -Database $Database -Payload $Payload)
    if ($targetNames.Count -eq 0) {
      $targetNames = @(Get-TableNames -Database $backendDb)
    }

    $updated = New-Object System.Collections.ArrayList
    foreach ($tableName in $targetNames) {
      $linked = $null
      try { $linked = $Database.TableDefs.Item([string]$tableName) } catch {}
      if ($null -eq $linked) {
        if ($RefreshOnly) {
          throw "Linked table not found: $tableName"
        }
        $linked = $Database.CreateTableDef([string]$tableName)
        if ([string]::IsNullOrWhiteSpace($BackendPassword)) {
          $linked.Connect = ";DATABASE=$backendPath"
        } else {
          $linked.Connect = ";DATABASE=$backendPath;PWD=$BackendPassword"
        }
        $linked.SourceTableName = [string]$tableName
        $Database.TableDefs.Append($linked)
      } else {
        if ([string]::IsNullOrWhiteSpace([string]$linked.Connect) -and $RefreshOnly) {
          throw "Table $tableName is not linked."
        }
        if ([string]::IsNullOrWhiteSpace($BackendPassword)) {
          $linked.Connect = ";DATABASE=$backendPath"
        } else {
          $linked.Connect = ";DATABASE=$backendPath;PWD=$BackendPassword"
        }
        if ([string]::IsNullOrWhiteSpace([string]$linked.SourceTableName)) {
          $linked.SourceTableName = [string]$tableName
        }
        try { $linked.RefreshLink() } catch {}
      }
      [void]$updated.Add([ordered]@{
        name = [string]$tableName
        backendPath = $backendPath
      })
      try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($linked) | Out-Null } catch {}
    }

    return [ordered]@{
      backendPath = $backendPath
      linkedTables = $updated
    }
  } finally {
    try { $backendDb.Close() } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($backendDb) } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) } catch {}
  }
}

function Remove-LinkTable {
  param($Database, $Payload)
  $tableNames = @(Resolve-LinkTargetNames -Database $Database -Payload $Payload)
  if ($tableNames.Count -eq 0) {
    if ([string]::IsNullOrWhiteSpace([string]$Payload.tableName)) { throw "tableName is required for unlink_table." }
    $tableNames = @([string]$Payload.tableName)
  }

  $removed = New-Object System.Collections.ArrayList
  foreach ($tableName in $tableNames) {
    $table = $null
    try { $table = $Database.TableDefs.Item([string]$tableName) } catch {}
    if ($null -eq $table) { continue }
    if ([string]::IsNullOrWhiteSpace([string]$table.Connect)) {
      throw "Table $tableName is not linked."
    }
    $Database.TableDefs.Delete([string]$tableName)
    [void]$removed.Add([string]$tableName)
    try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($table) | Out-Null } catch {}
  }

  return [ordered]@{
    unlinkedTables = $removed
  }
}

function Compact-RepairDatabase {
  param($Payload, [string]$AccessDbPath)
  $dryRun = $true
  if ($null -ne $Payload.dryRun) {
    $dryRun = [bool]$Payload.dryRun
  }
  $sourcePath = [string]$Payload.databasePath
  if ([string]::IsNullOrWhiteSpace($sourcePath)) {
    $sourcePath = [string]$Payload.backendPath
  }
  if ([string]::IsNullOrWhiteSpace($sourcePath)) {
    $sourcePath = $AccessDbPath
  }
  if ([string]::IsNullOrWhiteSpace($sourcePath)) {
    throw "databasePath or backendPath is required for compact_repair."
  }
  $sourceFull = [System.IO.Path]::GetFullPath($sourcePath)
  $accessFull = [System.IO.Path]::GetFullPath($AccessDbPath)
  if (-not $dryRun -and $sourceFull -ieq $accessFull) {
    throw "compact_repair cannot rewrite the currently open database safely. Use a separate databasePath."
  }

  $targetPath = [string]$Payload.targetPath
  if ([string]::IsNullOrWhiteSpace($targetPath)) {
    $folder = [System.IO.Path]::GetDirectoryName($sourceFull)
    $base = [System.IO.Path]::GetFileNameWithoutExtension($sourceFull)
    $ext = [System.IO.Path]::GetExtension($sourceFull)
    $targetPath = [System.IO.Path]::Combine($folder, "$base.compacted$ext")
  } else {
    $folder = [System.IO.Path]::GetDirectoryName($sourceFull)
    $targetPath = Resolve-SandboxedPath -RawPath $targetPath -RootPath $folder -Label "targetPath"
  }

  if ($dryRun) {
    return [ordered]@{
      dryRun = $true
      sourcePath = $sourceFull
      targetPath = $targetPath
      wouldReplaceSource = $true
    }
  }

  $dbEngine = New-Object -ComObject DAO.DBEngine.120
  try {
    $dbEngine.CompactDatabase($sourceFull, $targetPath)
    if (Test-Path -LiteralPath $targetPath) {
      Move-Item -LiteralPath $targetPath -Destination $sourceFull -Force
    }
    return [ordered]@{
      dryRun = $false
      sourcePath = $sourceFull
      targetPath = $targetPath
      compacted = $true
    }
  } finally {
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) } catch {}
  }
}

function Get-AccessFiles {
  param([string] $RootPath)
  $root = if ([string]::IsNullOrWhiteSpace($RootPath)) { Split-Path -Path $AccessDbPath -Parent } else { $RootPath }
  @(Get-ChildItem -LiteralPath $root -Recurse -File -Include *.accdb, *.accde, *.mdb, *.mde -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty FullName)
}

function Compare-BackendTables {
  param($CurrentDb, [string] $BackendPath)
  if ([string]::IsNullOrWhiteSpace($BackendPath)) {
    throw "backendPath is required for compare_backends."
  }
  if (-not (Test-Path -LiteralPath $BackendPath)) {
    throw "Backend database not found: $BackendPath"
  }

  $dbEngine = New-Object -ComObject DAO.DBEngine.120
  $backendDb = Open-DatabaseWithBackendPassword -DbEngine $dbEngine -DatabasePath $BackendPath
  try {
    $currentTables = @(Get-TableNames -Database $CurrentDb)
    $backendTables = @(Get-TableNames -Database $backendDb)
    $currentSet = @{ }
    foreach ($name in $currentTables) { $currentSet[$name.ToLowerInvariant()] = $name }
    $backendSet = @{ }
    foreach ($name in $backendTables) { $backendSet[$name.ToLowerInvariant()] = $name }

    $missingInBackend = @()
    foreach ($name in $currentTables) {
      if (-not $backendSet.ContainsKey($name.ToLowerInvariant())) { $missingInBackend += $name }
    }

    $extraInBackend = @()
    foreach ($name in $backendTables) {
      if (-not $currentSet.ContainsKey($name.ToLowerInvariant())) { $extraInBackend += $name }
    }

    return [ordered]@{
      comparison = [ordered]@{
        backendPath = $BackendPath
        currentTables = $currentTables
        backendTables = $backendTables
        missingInBackend = $missingInBackend
        extraInBackend = $extraInBackend
      }
    }
  } finally {
    try { $backendDb.Close() } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($backendDb) } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) } catch {}
  }
}

function Format-SqlLiteral {
  param($Value)
  if ($null -eq $Value) { return "NULL" }
  if ($Value -is [bool]) { if ($Value) { return "True" } else { return "False" } }
  if ($Value -is [byte] -or $Value -is [int16] -or $Value -is [int] -or $Value -is [int64] -or $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]) { return ([string]$Value) }
  return "'" + ($Value.ToString().Replace("'", "''")) + "'"
}

function Split-SqlStatements {
  param([string] $Sql)
  $statements = New-Object System.Collections.ArrayList
  $builder = New-Object System.Text.StringBuilder
  $inSingleQuote = $false

  for ($i = 0; $i -lt $Sql.Length; $i++) {
    $char = $Sql[$i]
    $nextChar = if ($i + 1 -lt $Sql.Length) { $Sql[$i + 1] } else { [char]0 }

    if ($char -eq "'" -and $inSingleQuote -and $nextChar -eq "'") {
      [void]$builder.Append($char)
      [void]$builder.Append($nextChar)
      $i++
      continue
    }

    if ($char -eq "'") {
      $inSingleQuote = -not $inSingleQuote
      [void]$builder.Append($char)
      continue
    }

    if ($char -eq ";" -and -not $inSingleQuote) {
      $sql = $builder.ToString().Trim()
      if (-not [string]::IsNullOrWhiteSpace($sql)) { [void]$statements.Add($sql) }
      [void]$builder.Clear()
      continue
    }

    [void]$builder.Append($char)
  }

  $tail = $builder.ToString().Trim()
  if (-not [string]::IsNullOrWhiteSpace($tail)) { [void]$statements.Add($tail) }
  return $statements
}

function Invoke-WriteAction {
  param($Database, [string] $Action, $Payload)

  $dryRun = $true
  if ($null -ne $Payload.dryRun) {
    $dryRun = [bool]$Payload.dryRun
  }

  $allowTables = @()
  if ($Payload.allowTables) { $allowTables = @($Payload.allowTables) }
  $denyTables = @()
  if ($Payload.denyTables) { $denyTables = @($Payload.denyTables) }

  function Assert-TableAllowed([string] $TableName) {
    if ($allowTables.Count -gt 0 -and (-not ($allowTables -contains $TableName))) {
      throw "Table $TableName is not in allowTables."
    }
    if ($denyTables -contains $TableName) {
      throw "Table $TableName is denied."
    }
  }

  switch ($Action) {
    "exec_sql" {
      if ([string]::IsNullOrWhiteSpace([string]$Payload.sql)) { throw "sql is required for exec_sql." }
      if ($dryRun) {
        return [ordered]@{ dryRun = $true; affectedRows = 0; sql = [string]$Payload.sql }
      }
      $Database.Execute([string]$Payload.sql, 128)
      return [ordered]@{ dryRun = $false; affectedRows = $Database.RecordsAffected; sql = [string]$Payload.sql }
    }
    "run_script" {
      if ([string]::IsNullOrWhiteSpace([string]$Payload.scriptPath)) { throw "scriptPath is required for run_script." }
      $rootPath = [string]$Payload.rootPath
      if ([string]::IsNullOrWhiteSpace($rootPath)) { $rootPath = Split-Path -Path $AccessDbPath -Parent }
      $scriptPath = Resolve-SandboxedPath -RawPath ([string]$Payload.scriptPath) -RootPath $rootPath -Label "scriptPath"
      if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Script file not found: $scriptPath" }
      $statements = @(Split-SqlStatements (Get-Content -LiteralPath $scriptPath -Raw))
      $executed = New-Object System.Collections.ArrayList
      foreach ($statement in $statements) {
        $sql = $statement.Trim()
        if ([string]::IsNullOrWhiteSpace($sql)) { continue }
        if ($dryRun) {
          [void]$executed.Add($sql)
          continue
        }
        $Database.Execute($sql, 128)
        [void]$executed.Add($sql)
      }
      return [ordered]@{ dryRun = $dryRun; statements = $executed }
    }
    "create_table" {
      if ([string]::IsNullOrWhiteSpace([string]$Payload.tableName)) { throw "tableName is required for create_table." }
      if ([string]::IsNullOrWhiteSpace([string]$Payload.definition)) { throw "definition is required for create_table." }
      Assert-TableAllowed ([string]$Payload.tableName)
      $sql = "CREATE TABLE [$([string]$Payload.tableName)] ($([string]$Payload.definition))"
      if ($dryRun) { return [ordered]@{ dryRun = $true; sql = $sql } }
      $Database.Execute($sql, 128)
      return [ordered]@{ dryRun = $false; sql = $sql; affectedRows = $Database.RecordsAffected }
    }
    "drop_table" {
      if ([string]::IsNullOrWhiteSpace([string]$Payload.tableName)) { throw "tableName is required for drop_table." }
      Assert-TableAllowed ([string]$Payload.tableName)
      $sql = "DROP TABLE [$([string]$Payload.tableName)]"
      if ($dryRun) { return [ordered]@{ dryRun = $true; sql = $sql } }
      $Database.Execute($sql, 128)
      return [ordered]@{ dryRun = $false; sql = $sql; affectedRows = $Database.RecordsAffected }
    }
    "seed_fixture" {
      if ([string]::IsNullOrWhiteSpace([string]$Payload.tableName)) { throw "tableName is required for seed_fixture." }
      Assert-TableAllowed ([string]$Payload.tableName)
      $tableName = [string]$Payload.tableName
      if ($tableName -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$') { throw "Invalid table name: $tableName" }
      $rows = @($Payload.rows)
      if ($rows.Count -eq 0) { throw "rows are required for seed_fixture." }
      $count = 0
      foreach ($row in $rows) {
        $columns = @()
        $values = @()
        foreach ($property in $row.PSObject.Properties) {
          $colName = $property.Name
          if ($colName -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$') { throw "Invalid column name: $colName" }
          $columns += "[$colName]"
          $value = $property.Value
          $values += Format-SqlLiteral $value
        }
        $sql = "INSERT INTO [$tableName] (" + ($columns -join ", ") + ") VALUES (" + ($values -join ", ") + ")"
        if (-not $dryRun) { $Database.Execute($sql, 128) }
        $count++
      }
      return [ordered]@{ dryRun = $dryRun; affectedRows = $count; tableName = $tableName }
    }
    "teardown_fixture" {
      if ([string]::IsNullOrWhiteSpace([string]$Payload.tableName)) { throw "tableName is required for teardown_fixture." }
      Assert-TableAllowed ([string]$Payload.tableName)
      $sql = "DELETE FROM [$([string]$Payload.tableName)]"
      if ($dryRun) { return [ordered]@{ dryRun = $true; sql = $sql } }
      $Database.Execute($sql, 128)
      return [ordered]@{ dryRun = $false; sql = $sql; affectedRows = $Database.RecordsAffected }
    }
    default {
      throw "Unsupported write action: $Action"
    }
  }
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
    if ([string]::IsNullOrWhiteSpace($action) -or $action -eq 'query_sql') {
      if ($payload.mode -eq 'read') {
        $rs = $db.OpenRecordset([string]$payload.sql)
        try {
          $rows = @(Convert-RecordsetRows $rs)
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

    if ($action -eq 'list_tables') {
      [ordered]@{ tables = @(Get-TableNames -Database $db) } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }

    if ($action -eq 'list_linked_tables') {
      [ordered]@{ tables = @(Get-TableNames -Database $db -LinkedOnly) } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }

    if ($action -eq 'get_schema') {
      if ([string]::IsNullOrWhiteSpace([string]$payload.tableName)) { throw "tableName is required for get_schema." }
      [ordered]@{ schema = @(Get-TableSchema -Database $db -TableName ([string]$payload.tableName)) } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'count_rows') {
      if ([string]::IsNullOrWhiteSpace([string]$payload.tableName)) { throw "tableName is required for count_rows." }
      $rs = $db.OpenRecordset("SELECT COUNT(*) AS RowCount FROM [$([string]$payload.tableName)]")
      try {
        $rows = @(Convert-RecordsetRows $rs)
        [ordered]@{ rows = $rows } | ConvertTo-Json -Compress -Depth 10
      } finally {
        if ($null -ne $rs) { $rs.Close() }
      }
      exit 0
    }

    if ($action -eq 'distinct_values') {
      if ([string]::IsNullOrWhiteSpace([string]$payload.tableName)) { throw "tableName is required for distinct_values." }
      if ([string]::IsNullOrWhiteSpace([string]$payload.columnName)) { throw "columnName is required for distinct_values." }
      $rs = $db.OpenRecordset("SELECT DISTINCT [$([string]$payload.columnName)] AS Value FROM [$([string]$payload.tableName)]")
      try {
        $rows = @(Convert-RecordsetRows $rs)
        [ordered]@{ rows = $rows } | ConvertTo-Json -Compress -Depth 10
      } finally {
        if ($null -ne $rs) { $rs.Close() }
      }
      exit 0
    }

    if ($action -eq 'compare_backends') {
      $result = Compare-BackendTables -CurrentDb $db -BackendPath ([string]$payload.backendPath)
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'list_access_files') {
      [ordered]@{ files = @(Get-AccessFiles -RootPath ([string]$payload.rootPath)) } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }

    if ($action -eq 'get_relationships') {
      [ordered]@{ relationships = @(Get-Relationships -Database $db) } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'list_links') {
      [ordered]@{ links = @(Get-LinkInfo -Database $db) } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'link_tables') {
      $result = Update-LinkTables -Database $db -Payload $payload
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'relink_tables') {
      $result = Update-LinkTables -Database $db -Payload $payload -RefreshOnly
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'localize_backend_links') {
      $result = Update-LinkTables -Database $db -Payload $payload -RefreshOnly
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'unlink_table') {
      $result = Remove-LinkTable -Database $db -Payload $payload
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'export_queries') {
      $result = Export-QueryDefinitions -Database $db -Payload $payload -AccessDbPath $AccessDbPath
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'import_queries') {
      $result = Import-QueryDefinitions -Database $db -Payload $payload
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'compact_repair') {
      $result = Compact-RepairDatabase -Payload $payload -AccessDbPath $AccessDbPath
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -in @('exec_sql', 'run_script', 'create_table', 'drop_table', 'seed_fixture', 'teardown_fixture')) {
      $result = Invoke-WriteAction -Database $db -Action $action -Payload $payload
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    throw "Unsupported query action: $action"
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
