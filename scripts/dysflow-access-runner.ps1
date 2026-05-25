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

function Open-DatabaseWithPassword {
  param(
    [Parameter(Mandatory = $true)] $DbEngine,
    [Parameter(Mandatory = $true)] [string] $DatabasePath,
    [Parameter(Mandatory = $false)] [bool] $Exclusive = $false,
    [Parameter(Mandatory = $false)] [bool] $ReadOnly = $false,
    [Parameter(Mandatory = $false)] [string] $Password = ""
  )
  if ([string]::IsNullOrWhiteSpace($Password)) {
    return $DbEngine.OpenDatabase($DatabasePath, $Exclusive, $ReadOnly)
  }
  return $DbEngine.OpenDatabase($DatabasePath, $Exclusive, $ReadOnly, ";PWD=$Password")
}

function Open-DatabaseWithBackendPassword {
  param(
    [Parameter(Mandatory = $true)] $DbEngine,
    [Parameter(Mandatory = $true)] [string] $DatabasePath,
    [Parameter(Mandatory = $false)] [bool] $ReadOnly = $false
  )
  return Open-DatabaseWithPassword -DbEngine $DbEngine -DatabasePath $DatabasePath -ReadOnly $ReadOnly -Password $BackendPassword
}

function Resolve-WriteActionDatabase {
  param(
    [Parameter(Mandatory = $true)] $DbEngine,
    [Parameter(Mandatory = $true)] $CurrentDb,
    [Parameter(Mandatory = $true)] $Payload
  )
  $dryRun = $true
  if ($null -ne $Payload.dryRun) { $dryRun = [bool]$Payload.dryRun }
  $targetPath = [string]$Payload.databasePath
  if ([string]::IsNullOrWhiteSpace($targetPath)) { $targetPath = [string]$Payload.sourcePath }
  if ([string]::IsNullOrWhiteSpace($targetPath)) { $targetPath = [string]$Payload.backendPath }
  if ([string]::IsNullOrWhiteSpace($targetPath) -or $dryRun) {
    return [ordered]@{ Database = $CurrentDb; Owned = $false; TargetPath = $targetPath }
  }
  $targetDb = Open-DatabaseWithBackendPassword -DbEngine $DbEngine -DatabasePath $targetPath
  return [ordered]@{ Database = $targetDb; Owned = $true; TargetPath = $targetPath }
}

function Resolve-ReadActionDatabase {
  param(
    [Parameter(Mandatory = $true)] $DbEngine,
    [Parameter(Mandatory = $true)] $CurrentDb,
    [Parameter(Mandatory = $true)] $Payload
  )
  $targetPath = [string]$Payload.databasePath
  if ([string]::IsNullOrWhiteSpace($targetPath)) { $targetPath = [string]$Payload.sourcePath }
  if ([string]::IsNullOrWhiteSpace($targetPath)) { $targetPath = [string]$Payload.backendPath }
  if ([string]::IsNullOrWhiteSpace($targetPath)) {
    return [ordered]@{ Database = $CurrentDb; Owned = $false; TargetPath = $targetPath }
  }
  $targetDb = Open-DatabaseWithBackendPassword -DbEngine $DbEngine -DatabasePath $targetPath -ReadOnly $true
  return [ordered]@{ Database = $targetDb; Owned = $true; TargetPath = $targetPath }
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

function Write-DysflowProgress {
  param(
    [Parameter(Mandatory = $true)] [int] $Percent,
    [Parameter(Mandatory = $false)] [string] $Message,
    [Parameter(Mandatory = $false)] [int] $Total
  )
  $obj = [ordered]@{ percent = $Percent }
  if ($Total -gt 0) { $obj['total'] = $Total }
  if (-not [string]::IsNullOrWhiteSpace($Message)) { $obj['message'] = $Message }
  [Console]::Error.WriteLine('DYSFLOW_PROGRESS ' + ($obj | ConvertTo-Json -Compress -Depth 2))
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
    if ($connect -match '(?i)(?:^|;)DATABASE=([^;]+)') {
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
    } catch { Write-Debug "Diagnostics: $_" }
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
    } catch { Write-Debug "Diagnostics: $_" }
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
  $dryRun = $true
  if ($null -ne $Payload.dryRun) {
    $dryRun = [bool]$Payload.dryRun
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
      try { $linked = $Database.TableDefs.Item([string]$tableName) } catch { Write-Debug "Diagnostics: $_" }
      if ($dryRun) {
        [void]$updated.Add([ordered]@{
          name = [string]$tableName
          backendPath = $backendPath
          wouldCreateOrRefresh = ($null -eq $linked)
        })
        continue
      }
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
        try { $linked.RefreshLink() } catch { Write-Debug "Diagnostics: $_" }
      }
      [void]$updated.Add([ordered]@{
        name = [string]$tableName
        backendPath = $backendPath
      })
      try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($linked) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
    }

    return [ordered]@{
      backendPath = $backendPath
      linkedTables = $updated
    }
  } finally {
    try { $backendDb.Close() } catch { Write-Debug "Diagnostics: $_" }
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($backendDb) } catch { Write-Debug "Diagnostics: $_" }
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) } catch { Write-Debug "Diagnostics: $_" }
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
    try { $table = $Database.TableDefs.Item([string]$tableName) } catch { Write-Debug "Diagnostics: $_" }
    if ($null -eq $table) { continue }
    if ([string]::IsNullOrWhiteSpace([string]$table.Connect)) {
      throw "Table $tableName is not linked."
    }
    $Database.TableDefs.Delete([string]$tableName)
    [void]$removed.Add([string]$tableName)
    try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($table) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
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
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) } catch { Write-Debug "Diagnostics: $_" }
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
    try { $backendDb.Close() } catch { Write-Debug "Diagnostics: $_" }
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($backendDb) } catch { Write-Debug "Diagnostics: $_" }
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) } catch { Write-Debug "Diagnostics: $_" }
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

# ---------------------------------------------------------------------------
# relink_directory helpers — file enumeration, classification, dry-run JSON
# ---------------------------------------------------------------------------

function Get-AccessFilesRecursive {
  param(
    [string]$RootPath,
    [bool]$Recursive = $true
  )
  $filter = @("*.accdb", "*.mdb")
  if ($Recursive) {
    return @(Get-ChildItem -Path $RootPath -Include $filter -Recurse -File -ErrorAction SilentlyContinue)
  }
  $searchPath = Join-Path $RootPath "*"
  return @(Get-ChildItem -Path $searchPath -Include $filter -File -ErrorAction SilentlyContinue)
}

function Build-AccessFileIndex {
  param([System.IO.FileInfo[]]$Files)
  $index = @{}
  foreach ($f in $Files) {
    $key = $f.Name.ToLower()
    if (-not $index.ContainsKey($key)) {
      $index[$key] = [System.Collections.Generic.List[string]]::new()
    }
    $index[$key].Add($f.FullName)
  }
  return $index
}

function Resolve-LocalPath {
  param(
    [string]$BackendPath,
    [hashtable]$AliasMap,
    [hashtable]$FileIndex
  )
  $basename = [System.IO.Path]::GetFileName($BackendPath).ToLower()
  $matchExt = [System.IO.Path]::GetExtension($basename).ToLower()

  # Apply alias map first
  if ($AliasMap.ContainsKey($basename)) {
    $basename = $AliasMap[$basename].ToLower()
    $matchExt = [System.IO.Path]::GetExtension($basename).ToLower()
  }

  if (-not $FileIndex.ContainsKey($basename)) { return $null }

  $matches = @($FileIndex[$basename])
  # Extension-exact match (no .mdb <-> .accdb cross-match per ADR-5)
  $exactMatches = @($matches | Where-Object { [System.IO.Path]::GetExtension($_).ToLower() -eq $matchExt })

  if ($exactMatches.Count -eq 0) { return $null }
  if ($exactMatches.Count -gt 1) { return @{ path = $null; ambiguous = $true } }
  return @{ path = $exactMatches[0]; ambiguous = $false }
}

function Get-LinkClassification {
  param(
    [string]$BackendPath,
    [string]$RootPath,
    [hashtable]$AliasMap,
    [hashtable]$FileIndex
  )

  # Already local if path starts under RootPath
  if ($BackendPath.StartsWith($RootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    return @{ classification = "alreadyLocal"; resolvedLocalPath = $BackendPath }
  }

  $resolved = Resolve-LocalPath -BackendPath $BackendPath -AliasMap $AliasMap -FileIndex $FileIndex
  if ($null -eq $resolved) {
    return @{ classification = "unresolved"; resolvedLocalPath = $null }
  }
  if ($resolved.ambiguous) {
    return @{ classification = "ambiguous"; resolvedLocalPath = $null }
  }
  return @{ classification = "plannedRelink"; resolvedLocalPath = $resolved.path }
}

function Backup-AccessFile {
  param([string]$Path)
  $ts = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
  $dest = "${Path}.bak-${ts}"
  if (Test-Path -LiteralPath $dest) {
    $rand = [System.IO.Path]::GetRandomFileName().Replace('.', '')
    $dest = "${Path}.bak-${ts}-${rand}"
  }
  Copy-Item -LiteralPath $Path -Destination $dest -ErrorAction Stop
  return $dest
}

function Resolve-LinkChain {
  param(
    $DbEngine,
    $StartDb,
    [string]$TableName,
    [string]$RootPath,
    [hashtable]$AliasMap,
    [hashtable]$FileIndex,
    [ref]$Visited,
    [int]$Depth = 0,
    [int]$MaxDepth = 5
  )
  $dbPath = [string]$StartDb.Name
  $key = "$($dbPath.ToLower())|$($TableName.ToLower())"
  if ($Visited.Value.ContainsKey($key)) {
    return [ordered]@{ resolvedPath = $null; resolvedTable = $null; isLocal = $false; cycleDetected = $true; hops = $Depth }
  }
  if ($Depth -ge $MaxDepth) {
    return [ordered]@{ resolvedPath = $null; resolvedTable = $null; isLocal = $false; cycleDetected = $false; hops = $MaxDepth }
  }
  $Visited.Value[$key] = $true

  $td = $null
  foreach ($t in $StartDb.TableDefs) {
    if ([string]$t.Name -eq $TableName) { $td = $t; break }
  }
  if ($null -eq $td) {
    return [ordered]@{ resolvedPath = $null; resolvedTable = $null; isLocal = $false; cycleDetected = $false; hops = $Depth }
  }

  $connectStr = [string]$td.Connect
  if ([string]::IsNullOrWhiteSpace($connectStr)) {
    return [ordered]@{ resolvedPath = $dbPath; resolvedTable = $TableName; isLocal = $true; cycleDetected = $false; hops = $Depth }
  }

  $dbMatch = [regex]::Match($connectStr, '(?i)(?:^|;)DATABASE=([^;]+)')
  if (-not $dbMatch.Success) {
    return [ordered]@{ resolvedPath = $null; resolvedTable = $null; isLocal = $false; cycleDetected = $false; hops = $Depth }
  }

  $nextBackend = $dbMatch.Groups[1].Value.Trim()
  $sourceTable = [string]$td.SourceTableName

  $classResult = Get-LinkClassification -BackendPath $nextBackend -RootPath $RootPath -AliasMap $AliasMap -FileIndex $FileIndex
  $localPath = $null
  if ($classResult.classification -eq 'alreadyLocal' -or $classResult.classification -eq 'plannedRelink') {
    $localPath = $classResult.resolvedLocalPath
  }
  if ($null -eq $localPath) {
    return [ordered]@{ resolvedPath = $null; resolvedTable = $null; isLocal = $false; cycleDetected = $false; hops = $Depth }
  }

  $nextDb = $null
  try {
    try {
      $nextDb = Open-DatabaseWithPassword -DbEngine $DbEngine -DatabasePath $localPath -ReadOnly $true -Password $BackendPassword
    } catch {
      if (-not [string]::IsNullOrWhiteSpace($AccessPassword)) {
        $nextDb = Open-DatabaseWithPassword -DbEngine $DbEngine -DatabasePath $localPath -ReadOnly $true -Password $AccessPassword
      } else {
        throw $_
      }
    }
    try {
      return Resolve-LinkChain `
        -DbEngine $DbEngine -StartDb $nextDb -TableName $sourceTable `
        -RootPath $RootPath -AliasMap $AliasMap -FileIndex $FileIndex `
        -Visited $Visited -Depth ($Depth + 1) -MaxDepth $MaxDepth
    } finally {
      try { $nextDb.Close() } catch { Write-Debug "Diagnostics: $_" }
      try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($nextDb) } catch { Write-Debug "Diagnostics: $_" }
    }
  } catch {
    return [ordered]@{ resolvedPath = $null; resolvedTable = $null; isLocal = $false; cycleDetected = $false; hops = $Depth }
  }
}

function Test-LinkExternal {
  param(
    [string]$BackendPath,
    [string]$RootPath,
    [string[]]$DenyPrefixes = @()
  )
  $external = -not $BackendPath.StartsWith($RootPath, [System.StringComparison]::OrdinalIgnoreCase)
  $broken   = $external -and -not (Test-Path -LiteralPath $BackendPath -PathType Leaf)
  $denied   = $false
  foreach ($prefix in $DenyPrefixes) {
    if ($BackendPath.StartsWith([string]$prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      $denied = $true; break
    }
  }
  return [ordered]@{ external = $external; denied = $denied; broken = $broken }
}

function Invoke-RelinkDirectory {
  param($Payload)

  $rootPath      = [string]$Payload.rootPath
  $dryRun        = $true;  if ($null -ne $Payload.dryRun)          { $dryRun        = [bool]$Payload.dryRun }
  $recursive     = $true;  if ($null -ne $Payload.recursive)       { $recursive     = [bool]$Payload.recursive }
  $noBackup      = $false; if ($null -ne $Payload.noBackup)        { $noBackup      = [bool]$Payload.noBackup }
  $removeUnresolved = $false; if ($null -ne $Payload.removeUnresolved) { $removeUnresolved = [bool]$Payload.removeUnresolved }

  $aliasMap = @{}
  if ($null -ne $Payload.maps) {
    foreach ($entry in @($Payload.maps)) {
      $fromVal = [string]$entry.from; $toVal = [string]$entry.to
      if (-not [string]::IsNullOrWhiteSpace($fromVal) -and -not [string]::IsNullOrWhiteSpace($toVal)) {
        $aliasMap[$fromVal.ToLower()] = $toVal
      }
    }
  }

  $files      = @(Get-AccessFilesRecursive -RootPath $rootPath -Recursive $recursive)
  $fileIndex  = Build-AccessFileIndex -Files $files

  $fileResults   = [System.Collections.ArrayList]::new()
  $allErrors     = [System.Collections.ArrayList]::new()
  $allBackupPaths = [System.Collections.ArrayList]::new()
  $totalLinked = 0; $totalAlreadyLocal = 0; $totalPlanned = 0; $totalApplied = 0; $totalRemoved = 0

  Write-DysflowProgress -Percent 20 -Message "Scanning files" -Total $files.Count

  $dbEngine = New-Object -ComObject DAO.DBEngine.120
  try {
    $fileIdx = 0
    foreach ($file in $files) {
      $fileIdx++
      Write-DysflowProgress -Percent ([int](20 + 60 * $fileIdx / [Math]::Max(1, $files.Count))) -Message "Processing $($file.Name)" -Total $files.Count

      $fileResult = [ordered]@{
        filePath          = $file.FullName
        linkedTablesFound = 0; alreadyLocal = 0; plannedRelinks = 0; appliedRelinks = 0
        links  = [System.Collections.ArrayList]::new()
        errors = [System.Collections.ArrayList]::new()
      }

      try {
        # Phase 1: classify all links (read-only)
        $remapPlan          = [System.Collections.ArrayList]::new()
        $unresolvedLinkNames = [System.Collections.ArrayList]::new()

        $db = $null
        try {
          $db = Open-DatabaseWithPassword -DbEngine $dbEngine -DatabasePath $file.FullName -ReadOnly $true -Password $AccessPassword
        } catch {
          if (-not [string]::IsNullOrWhiteSpace($BackendPassword)) {
            $db = Open-DatabaseWithPassword -DbEngine $dbEngine -DatabasePath $file.FullName -ReadOnly $true -Password $BackendPassword
          } else {
            throw $_
          }
        }
        try {
          foreach ($td in $db.TableDefs) {
            $tdName = [string]$td.Name
            if ($tdName.StartsWith("MSys")) { continue }
            $connectStr = [string]$td.Connect
            if ([string]::IsNullOrWhiteSpace($connectStr)) { continue }

            $dbMatch = [regex]::Match($connectStr, '(?i)(?:^|;)DATABASE=([^;]+)')
            if (-not $dbMatch.Success) { continue }

            $backendPath = $dbMatch.Groups[1].Value.Trim()
            $classResult = Get-LinkClassification `
              -BackendPath $backendPath -RootPath $rootPath -AliasMap $aliasMap -FileIndex $fileIndex

            $linkEntry = [ordered]@{
              database            = $file.FullName
              linkName            = $tdName
              originalBackendPath = $backendPath
              classification      = $classResult.classification
              resolvedLocalPath   = $classResult.resolvedLocalPath
              chainHops           = 0
              cycleDetected       = $false
            }

            $fileResult.linkedTablesFound++; $totalLinked++

            switch ($classResult.classification) {
              "alreadyLocal"  { $fileResult.alreadyLocal++; $totalAlreadyLocal++ }
              "plannedRelink" {
                $fileResult.plannedRelinks++; $totalPlanned++
                [void]$remapPlan.Add([ordered]@{ tdName = $tdName; resolvedLocalPath = $classResult.resolvedLocalPath; linkEntry = $linkEntry })
              }
              "unresolved" { [void]$unresolvedLinkNames.Add($tdName) }
              "ambiguous"  { $linkEntry.classification = "unresolved"; [void]$unresolvedLinkNames.Add($tdName) }
            }
            [void]$fileResult.links.Add($linkEntry)
          }
        } finally {
          try { $db.Close() } catch { Write-Debug "Diagnostics: $_" }
          try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($db) } catch { Write-Debug "Diagnostics: $_" }
        }

        # Phase 2: apply (when not dry-run and there is work)
        $hasWork = $remapPlan.Count -gt 0 -or ($removeUnresolved -and $unresolvedLinkNames.Count -gt 0)
        if (-not $dryRun -and $hasWork) {
          $applyOk = $true
          if (-not $noBackup) {
            try {
              $bak = Backup-AccessFile -Path $file.FullName
              [void]$allBackupPaths.Add($bak)
            } catch {
              [void]$fileResult.errors.Add("Backup failed: $($_.Exception.Message)")
              [void]$allErrors.Add("$($file.FullName): Backup failed: $($_.Exception.Message)")
              $applyOk = $false
            }
          }

          if ($applyOk) {
            $dbWrite = $null
            try {
              $dbWrite = Open-DatabaseWithPassword -DbEngine $dbEngine -DatabasePath $file.FullName -ReadOnly $false -Password $AccessPassword
            } catch {
              if (-not [string]::IsNullOrWhiteSpace($BackendPassword)) {
                $dbWrite = Open-DatabaseWithPassword -DbEngine $dbEngine -DatabasePath $file.FullName -ReadOnly $false -Password $BackendPassword
              } else {
                throw $_
              }
            }
            try {
              foreach ($plan in $remapPlan) {
                $visited = [hashtable]::new([System.StringComparer]::OrdinalIgnoreCase)
                $chain = Resolve-LinkChain `
                  -DbEngine $dbEngine -StartDb $dbWrite -TableName $plan.tdName `
                  -RootPath $rootPath -AliasMap $aliasMap -FileIndex $fileIndex `
                  -Visited ([ref]$visited) -Depth 0 -MaxDepth 5

                if ($chain.cycleDetected) {
                  $plan.linkEntry.classification = "cycle"
                  $plan.linkEntry.cycleDetected  = $true
                  continue
                }

                $targetPath = if ($null -ne $chain.resolvedPath) { $chain.resolvedPath } else { $plan.resolvedLocalPath }
                $plan.linkEntry.chainHops = $chain.hops

                try {
                  $tdW = $dbWrite.TableDefs.Item($plan.tdName)
                  $currentConnect = [string]$tdW.Connect
                  $currentSource = [string]$tdW.SourceTableName
                  
                  $newConnect = if ([string]::IsNullOrWhiteSpace($BackendPassword)) {
                    $pwdMatch = [regex]::Match($currentConnect, '(?i)(?:^|;)PWD=([^;]+)')
                    if ($pwdMatch.Success) {
                      ";DATABASE=$targetPath;PWD=$($pwdMatch.Groups[1].Value)"
                    } else {
                      ";DATABASE=$targetPath"
                    }
                  } else {
                    ";DATABASE=$targetPath;PWD=$BackendPassword"
                  }

                  if ($chain.resolvedTable -and $currentSource -ne [string]$chain.resolvedTable) {
                    $linkName = $tdW.Name
                    $attributes = $tdW.Attributes
                    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($tdW) } catch { Write-Debug "Diagnostics: $_" }
                    $dbWrite.TableDefs.Delete($linkName)
                    $newTd = $dbWrite.CreateTableDef($linkName, $attributes, $chain.resolvedTable, $newConnect)
                    $dbWrite.TableDefs.Append($newTd)
                    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($newTd) } catch { Write-Debug "Diagnostics: $_" }
                  } else {
                    if ($currentConnect -ne $newConnect) {
                      $tdW.Connect = $newConnect
                      $tdW.RefreshLink()
                    }
                    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($tdW) } catch { Write-Debug "Diagnostics: $_" }
                  }

                  $plan.linkEntry.classification = "applied"
                  $plan.linkEntry.resolvedLocalPath = $targetPath
                  $fileResult.appliedRelinks++; $totalApplied++
                } catch {
                  [void]$fileResult.errors.Add("RefreshLink $($plan.tdName): $($_.Exception.Message)")
                  [void]$allErrors.Add("$($file.FullName)!$($plan.tdName): $($_.Exception.Message)")
                }
              }

              if ($removeUnresolved) {
                foreach ($linkName in $unresolvedLinkNames) {
                  try {
                    $dbWrite.TableDefs.Delete($linkName)
                    $totalRemoved++
                    foreach ($le in $fileResult.links) {
                      if ([string]$le.linkName -eq $linkName) { $le.classification = "removed"; break }
                    }
                  } catch {
                    [void]$fileResult.errors.Add("Delete ${linkName}: $($_.Exception.Message)")
                    [void]$allErrors.Add("$($file.FullName)!$($linkName): $($_.Exception.Message)")
                  }
                }
              }
            } finally {
              try { $dbWrite.Close() } catch { Write-Debug "Diagnostics: $_" }
              try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbWrite) } catch { Write-Debug "Diagnostics: $_" }
            }
          }
        }
      } catch {
        [void]$fileResult.errors.Add($_.Exception.Message)
        [void]$allErrors.Add("$($file.FullName): $($_.Exception.Message)")
      }

      [void]$fileResults.Add($fileResult)
    }
  } finally {
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) } catch { Write-Debug "Diagnostics: $_" }
  }

  Write-DysflowProgress -Percent 90 -Message "Finalizing"

  $allLinks = @($fileResults | ForEach-Object { @($_.links) } | Where-Object { $_ -ne $null })

  $denyPrefixList = [string[]]@()
  if ($null -ne $Payload.denyPrefixes) { $denyPrefixList = @($Payload.denyPrefixes | ForEach-Object { [string]$_ }) }

  $externalLinkCount = 0
  $datosteLinkCount  = 0
  $brokenLinkCount   = 0
  foreach ($link in $allLinks) {
    $cls = [string]$link.classification
    if ($cls -notin @("alreadyLocal", "applied", "removed")) {
      $check = Test-LinkExternal -BackendPath ([string]$link.originalBackendPath) -RootPath $rootPath -DenyPrefixes $denyPrefixList
      if ($check.external) { $externalLinkCount++ }
      if ($check.denied)   { $datosteLinkCount++ }
      if ($check.broken)   { $brokenLinkCount++ }
    }
  }

  return [ordered]@{
    relinkDirectory = [ordered]@{
      mode              = if ($dryRun) { "dry-run" } else { "apply" }
      root              = $rootPath
      filesScanned      = $files.Count
      linkedTablesFound = $totalLinked
      alreadyLocal      = $totalAlreadyLocal
      plannedRelinks    = $totalPlanned
      appliedRelinks    = $totalApplied
      unresolved        = @($allLinks | Where-Object { $_.classification -eq "unresolved" })
      removed           = @($allLinks | Where-Object { $_.classification -eq "removed" })
      externalLinkCount = $externalLinkCount
      datosteLinkCount  = $datosteLinkCount
      brokenLinkCount   = $brokenLinkCount
      backupPaths       = @($allBackupPaths)
      errors            = @($allErrors)
      fileResults       = @($fileResults)
    }
  }
}

# ---------------------------------------------------------------------------
# Early dispatch for relink_directory — bypasses Access COM open (ADR-2)
# ---------------------------------------------------------------------------
if ($Operation -eq 'query') {
  $earlyPayload = ConvertFrom-JsonCompat $PayloadJson
  if ([string]$earlyPayload.action -eq 'relink_directory') {
    try {
      $result = Invoke-RelinkDirectory -Payload $earlyPayload
      $result | ConvertTo-Json -Depth 20 -Compress
      exit 0
    } catch {
      [Console]::Error.WriteLine($_.Exception.Message)
      exit 1
    }
  }
}

$access = $null
try {
  $before = Get-MsAccessProcesses
  $payload = ConvertFrom-JsonCompat $PayloadJson
  $action = [string]$payload.action
  $targetPath = [string]$payload.databasePath
  if ([string]::IsNullOrWhiteSpace($targetPath)) { $targetPath = [string]$payload.sourcePath }
  if ([string]::IsNullOrWhiteSpace($targetPath)) { $targetPath = [string]$payload.backendPath }
  $dryRun = $true
  if ($null -ne $payload.dryRun) { $dryRun = [bool]$payload.dryRun }
  $isDirectTargetQuery = $Operation -eq 'query' -and -not [string]::IsNullOrWhiteSpace($targetPath) -and -not $dryRun -and (
    $action -in @('exec_sql', 'run_script', 'create_table', 'drop_table', 'seed_fixture', 'teardown_fixture') -or
    ([string]::IsNullOrWhiteSpace($action) -and $payload.mode -eq 'write')
  )

  if (-not $isDirectTargetQuery -and -not (Test-Path -LiteralPath $AccessDbPath)) {
    throw "Access database not found: $AccessDbPath"
  }

  $access = New-Object -ComObject Access.Application
  $access.Visible = $false

  if (-not $isDirectTargetQuery) {
    if ([string]::IsNullOrEmpty($AccessPassword)) {
      $access.OpenCurrentDatabase($AccessDbPath)
    } else {
      $access.OpenCurrentDatabase($AccessDbPath, $false, $AccessPassword)
    }
    Write-AccessProcessMarker -Before $before -AccessDbPath $AccessDbPath
  }

  Write-DysflowProgress -Percent 10 -Message "Opening database"

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
    Write-DysflowProgress -Percent 40 -Message "Executing operation"
    $returnValue = $access.Run.Invoke($runArgs)
    Write-DysflowProgress -Percent 90 -Message "Finalizing"
    [ordered]@{ returnValue = $returnValue } | ConvertTo-Json -Compress -Depth 10
    exit 0
  }

  if ($Operation -eq 'query') {
    if ($isDirectTargetQuery) {
      $directDb = Open-DatabaseWithBackendPassword -DbEngine $access.DBEngine -DatabasePath $targetPath
      try {
        $directAction = $action
        if ([string]::IsNullOrWhiteSpace($directAction) -and $payload.mode -eq 'write') { $directAction = 'exec_sql' }
        $result = Invoke-WriteAction -Database $directDb -Action $directAction -Payload $payload
        Write-DysflowProgress -Percent 90 -Message "Finalizing"
        $result | ConvertTo-Json -Compress -Depth 20
      } finally {
        try { $directDb.Close() } catch { Write-Debug "Diagnostics: $_" }
        try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($directDb) } catch { Write-Debug "Diagnostics: $_" }
      }
      exit 0
    }

    $db = $access.CurrentDb()
    Write-DysflowProgress -Percent 40 -Message "Executing operation"
    if ([string]::IsNullOrWhiteSpace($action) -or $action -eq 'query_sql') {
      if ($payload.mode -eq 'read') {
        $rs = $db.OpenRecordset([string]$payload.sql)
        try {
          $rows = @(Convert-RecordsetRows $rs)
          Write-DysflowProgress -Percent 90 -Message "Finalizing"
          [ordered]@{ rows = $rows } | ConvertTo-Json -Compress -Depth 20
        } finally {
          if ($null -ne $rs) { $rs.Close() }
        }
        exit 0
      }

      $db.Execute([string]$payload.sql, 128)
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      [ordered]@{ affectedRows = $db.RecordsAffected } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }

    if ($action -eq 'list_tables') {
      $readDb = Resolve-ReadActionDatabase -DbEngine $access.DBEngine -CurrentDb $db -Payload $payload
      try {
        $tables = @(Get-TableNames -Database $readDb.Database)
        Write-DysflowProgress -Percent 90 -Message "Finalizing"
        [ordered]@{ tables = $tables } | ConvertTo-Json -Compress -Depth 10
      } finally {
        if ($readDb.Owned) { $readDb.Database.Close() }
      }
      exit 0
    }

    if ($action -eq 'list_linked_tables') {
      $tables = @(Get-TableNames -Database $db -LinkedOnly)
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      [ordered]@{ tables = $tables } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }

    if ($action -eq 'get_schema') {
      if ([string]::IsNullOrWhiteSpace([string]$payload.tableName)) { throw "tableName is required for get_schema." }
      $readDb = Resolve-ReadActionDatabase -DbEngine $access.DBEngine -CurrentDb $db -Payload $payload
      try {
        $schema = @(Get-TableSchema -Database $readDb.Database -TableName ([string]$payload.tableName))
        Write-DysflowProgress -Percent 90 -Message "Finalizing"
        [ordered]@{ schema = $schema } | ConvertTo-Json -Compress -Depth 20
      } finally {
        if ($readDb.Owned) { $readDb.Database.Close() }
      }
      exit 0
    }

    if ($action -eq 'count_rows') {
      if ([string]::IsNullOrWhiteSpace([string]$payload.tableName)) { throw "tableName is required for count_rows." }
      $rs = $db.OpenRecordset("SELECT COUNT(*) AS RowCount FROM [$([string]$payload.tableName)]")
      try {
        $rows = @(Convert-RecordsetRows $rs)
        Write-DysflowProgress -Percent 90 -Message "Finalizing"
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
        Write-DysflowProgress -Percent 90 -Message "Finalizing"
        [ordered]@{ rows = $rows } | ConvertTo-Json -Compress -Depth 10
      } finally {
        if ($null -ne $rs) { $rs.Close() }
      }
      exit 0
    }

    if ($action -eq 'compare_backends') {
      $result = Compare-BackendTables -CurrentDb $db -BackendPath ([string]$payload.backendPath)
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'list_access_files') {
      $files = @(Get-AccessFiles -RootPath ([string]$payload.rootPath))
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      [ordered]@{ files = $files } | ConvertTo-Json -Compress -Depth 10
      exit 0
    }

    if ($action -eq 'get_relationships') {
      $readDb = Resolve-ReadActionDatabase -DbEngine $access.DBEngine -CurrentDb $db -Payload $payload
      try {
        $relationships = @(Get-Relationships -Database $readDb.Database)
        Write-DysflowProgress -Percent 90 -Message "Finalizing"
        [ordered]@{ relationships = $relationships } | ConvertTo-Json -Compress -Depth 20
      } finally {
        if ($readDb.Owned) { $readDb.Database.Close() }
      }
      exit 0
    }

    if ($action -eq 'list_links') {
      $links = @(Get-LinkInfo -Database $db)
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      [ordered]@{ links = $links } | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'link_tables') {
      $dryRun = $true; if ($null -ne $payload.dryRun) { $dryRun = [bool]$payload.dryRun }
      if ($dryRun) {
        $backendPath = [string]$payload.backendPath
        Write-DysflowProgress -Percent 90 -Message "Finalizing"
        [ordered]@{ dryRun = $true; backendPath = $backendPath; linkedTables = @() } | ConvertTo-Json -Compress -Depth 20
        exit 0
      }
      $result = Update-LinkTables -Database $db -Payload $payload
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'relink_tables') {
      $result = Update-LinkTables -Database $db -Payload $payload -RefreshOnly
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'localize_backend_links') {
      $result = Update-LinkTables -Database $db -Payload $payload -RefreshOnly
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'unlink_table') {
      $result = Remove-LinkTable -Database $db -Payload $payload
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'export_queries') {
      $result = Export-QueryDefinitions -Database $db -Payload $payload -AccessDbPath $AccessDbPath
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'import_queries') {
      $result = Import-QueryDefinitions -Database $db -Payload $payload
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -eq 'compact_repair') {
      $result = Compact-RepairDatabase -Payload $payload -AccessDbPath $AccessDbPath
      Write-DysflowProgress -Percent 90 -Message "Finalizing"
      $result | ConvertTo-Json -Compress -Depth 20
      exit 0
    }

    if ($action -in @('exec_sql', 'run_script', 'create_table', 'drop_table', 'seed_fixture', 'teardown_fixture')) {
      $writeDb = Resolve-WriteActionDatabase -DbEngine $access.DBEngine -CurrentDb $db -Payload $payload
      try {
        $result = Invoke-WriteAction -Database $writeDb.Database -Action $action -Payload $payload
        Write-DysflowProgress -Percent 90 -Message "Finalizing"
        $result | ConvertTo-Json -Compress -Depth 20
      } finally {
        if ($writeDb.Owned) {
          try { $writeDb.Database.Close() } catch { Write-Debug "Diagnostics: $_" }
          try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($writeDb.Database) } catch { Write-Debug "Diagnostics: $_" }
        }
      }
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
    try { $access.CloseCurrentDatabase() } catch { Write-Debug "Diagnostics: $_" }
    try { $access.Quit() } catch { Write-Debug "Diagnostics: $_" }
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($access) } catch { Write-Debug "Diagnostics: $_" }
  }
}
