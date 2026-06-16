[CmdletBinding()]
param(
    [string]$ConfigPath = "",
    [ValidateSet("Tui", "AuditAll", "AuditOpen", "RepairConservative", "RepairOpen", "RepairAll", "RepairOpenAndNotify")]
    [string]$Action = "Tui"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $ScriptDirectory "cache-listado-nc.config.json"
}

function Resolve-ConfigPathValue {
    param([string]$PathValue)

    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return $PathValue
    }

    $expanded = [Environment]::ExpandEnvironmentVariables($PathValue)
    if ([System.IO.Path]::IsPathRooted($expanded)) {
        return $expanded
    }

    return (Join-Path (Split-Path -Parent $ConfigPath) $expanded)
}

function Read-CacheConfig {
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        $template = Join-Path $ScriptDirectory "cache-listado-nc.config.template.json"
        throw "No existe el config '$ConfigPath'. Copiá '$template' a '$ConfigPath' y ajustá BackendPath."
    }

    $raw = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8
    $config = $raw | ConvertFrom-Json
    $propertyNames = @($config.PSObject.Properties.Name)

    if (-not ($propertyNames -contains "BackendPath") -or [string]::IsNullOrWhiteSpace($config.BackendPath)) {
        throw "BackendPath no está configurado."
    }

    $config.BackendPath = Resolve-ConfigPathValue $config.BackendPath
    if (-not (Test-Path -LiteralPath $config.BackendPath)) {
        throw "No existe el backend configurado: $($config.BackendPath)"
    }

    if (-not ($propertyNames -contains "ReportDirectory") -or [string]::IsNullOrWhiteSpace($config.ReportDirectory)) {
        $config | Add-Member -NotePropertyName ReportDirectory -NotePropertyValue ".\scripts\reports" -Force
    }
    $config.ReportDirectory = Resolve-ConfigPathValue $config.ReportDirectory

    if (-not ($propertyNames -contains "HtmlReportDirectory") -or [string]::IsNullOrWhiteSpace($config.HtmlReportDirectory)) {
        $config | Add-Member -NotePropertyName HtmlReportDirectory -NotePropertyValue ".\reports\cache-listado-nc\html" -Force
    }
    $config.HtmlReportDirectory = Resolve-ConfigPathValue $config.HtmlReportDirectory

    if (-not ($propertyNames -contains "MaxRowsToShow") -or $null -eq $config.MaxRowsToShow -or [int]$config.MaxRowsToShow -le 0) {
        $config | Add-Member -NotePropertyName MaxRowsToShow -NotePropertyValue 50 -Force
    }
    if (-not ($propertyNames -contains "CommandTimeoutSeconds") -or $null -eq $config.CommandTimeoutSeconds -or [int]$config.CommandTimeoutSeconds -le 0) {
        $config | Add-Member -NotePropertyName CommandTimeoutSeconds -NotePropertyValue 120 -Force
    }
    if (-not ($propertyNames -contains "OperationTimeoutSeconds") -or $null -eq $config.OperationTimeoutSeconds -or [int]$config.OperationTimeoutSeconds -le 0) {
        $config | Add-Member -NotePropertyName OperationTimeoutSeconds -NotePropertyValue 90 -Force
    }
    if (-not ($propertyNames -contains "PasswordEnvironmentVariable") -or [string]::IsNullOrWhiteSpace($config.PasswordEnvironmentVariable)) {
        $config | Add-Member -NotePropertyName PasswordEnvironmentVariable -NotePropertyValue "ACCESS_VBA_PASSWORD" -Force
    }
    if (-not ($propertyNames -contains "RepairMode") -or [string]::IsNullOrWhiteSpace($config.RepairMode)) {
        $config | Add-Member -NotePropertyName RepairMode -NotePropertyValue "ConservativeInvalidate" -Force
    }
    if (-not ($propertyNames -contains "NotificationRecipient") -or [string]::IsNullOrWhiteSpace($config.NotificationRecipient)) {
        $config | Add-Member -NotePropertyName NotificationRecipient -NotePropertyValue "andres.romandelperal@telefonica.com" -Force
    }
    if (-not ($propertyNames -contains "NotificationOriginator") -or [string]::IsNullOrWhiteSpace($config.NotificationOriginator)) {
        $config | Add-Member -NotePropertyName NotificationOriginator -NotePropertyValue "cache-listado-nc-tui" -Force
    }
    if (-not ($propertyNames -contains "NotificationApplication") -or [string]::IsNullOrWhiteSpace($config.NotificationApplication)) {
        $config | Add-Member -NotePropertyName NotificationApplication -NotePropertyValue "NoConformidades" -Force
    }
    if (-not ($propertyNames -contains "EmailOnNoRepair") -or $null -eq $config.EmailOnNoRepair) {
        $config | Add-Member -NotePropertyName EmailOnNoRepair -NotePropertyValue $true -Force
    }
    if (-not ($propertyNames -contains "AceProviders") -or $null -eq $config.AceProviders -or @($config.AceProviders).Count -eq 0) {
        $config | Add-Member -NotePropertyName AceProviders -NotePropertyValue @("Microsoft.ACE.OLEDB.16.0", "Microsoft.ACE.OLEDB.12.0") -Force
    }

    return $config
}

function Get-PasswordPlainText {
    param([string]$EnvironmentVariable)

    $fromEnv = [Environment]::GetEnvironmentVariable($EnvironmentVariable, "Process")
    if ([string]::IsNullOrEmpty($fromEnv)) {
        $fromEnv = [Environment]::GetEnvironmentVariable($EnvironmentVariable, "User")
    }
    if ([string]::IsNullOrEmpty($fromEnv)) {
        $fromEnv = [Environment]::GetEnvironmentVariable($EnvironmentVariable, "Machine")
    }
    if (-not [string]::IsNullOrEmpty($fromEnv)) {
        return $fromEnv
    }

    $secure = Read-Host "Password del backend (no se guarda; también podés usar env:$EnvironmentVariable)" -AsSecureString
    if ($secure.Length -eq 0) {
        return ""
    }

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function New-AccessConnection {
    param($Config)

    Add-Type -AssemblyName System.Data
    $password = Get-PasswordPlainText ([string]$Config.PasswordEnvironmentVariable)
    $lastError = $null

    foreach ($provider in @($Config.AceProviders)) {
        $providerName = [string]$provider
        $builder = New-Object System.Data.OleDb.OleDbConnectionStringBuilder
        $builder.Provider = $providerName
        $builder["Data Source"] = [string]$Config.BackendPath
        if (-not [string]::IsNullOrEmpty($password)) {
            $builder["Jet OLEDB:Database Password"] = $password
        }

        $connection = New-Object System.Data.OleDb.OleDbConnection($builder.ConnectionString)
        try {
            $connection.Open()
            return $connection
        }
        catch {
            $lastError = $_.Exception.Message
            $connection.Dispose()
        }
    }

    throw "No se pudo abrir el backend con ACE OLEDB. Verificá Access Database Engine, ruta y password. Último error: $lastError"
}

function New-DaoDbEngine {
    $engineCandidates = @(
        "DAO.DBEngine.160",
        "DAO.DBEngine.150",
        "DAO.DBEngine.140",
        "DAO.DBEngine.120",
        "DAO.DBEngine.36"
    )

    foreach ($progId in $engineCandidates) {
        try {
            $engine = New-Object -ComObject $progId
            if ($engine) { return $engine }
        }
        catch {
            Write-Debug "DAO engine probe failed for ${progId}: $_"
        }
    }

    throw "No se pudo crear DAO.DBEngine. Verificá que Microsoft Access/DAO esté instalado en el servidor."
}

function Open-DaoDatabase {
    param(
        [Parameter(Mandatory = $true)]$DbEngine,
        [Parameter(Mandatory = $true)][string]$DatabasePath,
        [Parameter(Mandatory = $false)][string]$Password = ""
    )

    if ([string]::IsNullOrWhiteSpace($Password)) {
        return $DbEngine.OpenDatabase($DatabasePath, $false, $false)
    }

    return $DbEngine.OpenDatabase($DatabasePath, $false, $false, ";PWD=$Password")
}

function Invoke-Scalar {
    param(
        [System.Data.OleDb.OleDbConnection]$Connection,
        [string]$Sql,
        [int]$TimeoutSeconds = 120,
        [System.Data.OleDb.OleDbTransaction]$Transaction = $null
    )

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = $TimeoutSeconds
    if ($null -ne $Transaction) { $cmd.Transaction = $Transaction }
    try {
        return $cmd.ExecuteScalar()
    }
    finally {
        $cmd.Dispose()
    }
}

function Invoke-NonQuery {
    param(
        [System.Data.OleDb.OleDbConnection]$Connection,
        [string]$Sql,
        [System.Data.OleDb.OleDbTransaction]$Transaction = $null,
        [int]$TimeoutSeconds = 120
    )

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = $TimeoutSeconds
    if ($null -ne $Transaction) { $cmd.Transaction = $Transaction }
    try {
        return $cmd.ExecuteNonQuery()
    }
    finally {
        $cmd.Dispose()
    }
}

function Invoke-NonQueryParameters {
    param(
        [System.Data.OleDb.OleDbConnection]$Connection,
        [string]$Sql,
        [object[]]$Parameters,
        [System.Data.OleDb.OleDbTransaction]$Transaction = $null,
        [int]$TimeoutSeconds = 120
    )

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = $TimeoutSeconds
    if ($null -ne $Transaction) { $cmd.Transaction = $Transaction }
    try {
        foreach ($value in @($Parameters)) {
            $parameter = $cmd.CreateParameter()
            if ($null -eq $value) {
                $parameter.Value = [DBNull]::Value
            }
            else {
                $parameter.Value = $value
            }
            [void]$cmd.Parameters.Add($parameter)
        }
        return $cmd.ExecuteNonQuery()
    }
    finally {
        $cmd.Dispose()
    }
}

function Invoke-IdList {
    param([System.Data.OleDb.OleDbConnection]$Connection, [string]$Sql, [int]$TimeoutSeconds = 120)

    $ids = New-Object System.Collections.Generic.List[int]
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = $TimeoutSeconds
    $reader = $null
    try {
        $reader = $cmd.ExecuteReader()
        while ($reader.Read()) {
            if (-not $reader.IsDBNull(0)) {
                $ids.Add([int]$reader.GetValue(0))
            }
        }
        return $ids.ToArray()
    }
    finally {
        if ($null -ne $reader) { $reader.Dispose() }
        $cmd.Dispose()
    }
}

function Format-IdSample {
    param([int[]]$Ids, [int]$MaxRows)

    if ($null -eq $Ids -or $Ids.Count -eq 0) { return "(ninguno)" }
    $sample = $Ids | Select-Object -First $MaxRows
    $suffix = if ($Ids.Count -gt $MaxRows) { " ... (+$($Ids.Count - $MaxRows))" } else { "" }
    return (($sample -join ", ") + $suffix)
}

function Test-RequiredTables {
    param([System.Data.OleDb.OleDbConnection]$Connection)

    [void](Invoke-Scalar -Connection $Connection -Sql "SELECT COUNT(*) FROM TbNoConformidades")
    [void](Invoke-Scalar -Connection $Connection -Sql "SELECT COUNT(*) FROM TbCacheListadoNC")
}

function Get-SourceWhereClause {
    param([switch]$OpenOnly, [string]$Alias = "")

    $prefix = ""
    if (-not [string]::IsNullOrWhiteSpace($Alias)) {
        $prefix = "$Alias."
    }

    $where = "($($prefix)Borrado=False OR $($prefix)Borrado Is Null)"
    if ($OpenOnly) {
        $where = $where + " AND ($($prefix)FECHACIERRE Is Null OR $($prefix)Cerrada Is Null OR $($prefix)Cerrada <> 'Sí')"
    }
    return $where
}

function Invoke-CacheAudit {
    param($Config, [switch]$OpenOnly)

    $connection = New-AccessConnection $Config
    try {
        Test-RequiredTables $connection

        $sourceWhere = Get-SourceWhereClause -OpenOnly:$OpenOnly
        $scopeLabel = if ($OpenOnly) { "NC no cerradas" } else { "todas las NC activas" }

        Write-Host "Audit probe: contando filas del ámbito..." -ForegroundColor DarkCyan
        $sourceActive = [int](Invoke-Scalar -Connection $connection -Sql "SELECT COUNT(*) FROM TbNoConformidades WHERE $sourceWhere" -TimeoutSeconds $Config.CommandTimeoutSeconds)
        $cacheValid = [int](Invoke-Scalar -Connection $connection -Sql "SELECT COUNT(*) FROM TbCacheListadoNC WHERE CacheValida=True" -TimeoutSeconds $Config.CommandTimeoutSeconds)
        $cacheTotal = [int](Invoke-Scalar -Connection $connection -Sql "SELECT COUNT(*) FROM TbCacheListadoNC" -TimeoutSeconds $Config.CommandTimeoutSeconds)
        $invalidRows = [int](Invoke-Scalar -Connection $connection -Sql "SELECT COUNT(*) FROM TbCacheListadoNC WHERE CacheValida Is Null OR CacheValida=False" -TimeoutSeconds $Config.CommandTimeoutSeconds)

        $missingSql = @"
SELECT IDNoConformidad
FROM TbNoConformidades
WHERE $sourceWhere
  AND IDNoConformidad NOT IN (
    SELECT IDNoConformidad FROM TbCacheListadoNC WHERE CacheValida=True
  )
ORDER BY IDNoConformidad
"@
        $staleSql = @"
SELECT IDNoConformidad
FROM TbCacheListadoNC
WHERE CacheValida=True
  AND IDNoConformidad NOT IN (
    SELECT IDNoConformidad FROM TbNoConformidades WHERE $sourceWhere
  )
ORDER BY IDNoConformidad
"@
        $invalidSql = "SELECT IDNoConformidad FROM TbCacheListadoNC WHERE CacheValida Is Null OR CacheValida=False ORDER BY IDNoConformidad"

        Write-Host "Audit probe: buscando faltantes... timeout=$($Config.CommandTimeoutSeconds)s" -ForegroundColor DarkCyan
        $missing = @(Invoke-IdList -Connection $connection -Sql $missingSql -TimeoutSeconds $Config.CommandTimeoutSeconds)
        Write-Host "Audit probe: buscando sobrantes/stale... timeout=$($Config.CommandTimeoutSeconds)s" -ForegroundColor DarkCyan
        $stale = @(Invoke-IdList -Connection $connection -Sql $staleSql -TimeoutSeconds $Config.CommandTimeoutSeconds)
        Write-Host "Audit probe: buscando inválidos... timeout=$($Config.CommandTimeoutSeconds)s" -ForegroundColor DarkCyan
        $invalid = @(Invoke-IdList -Connection $connection -Sql $invalidSql -TimeoutSeconds $Config.CommandTimeoutSeconds)

        New-Item -ItemType Directory -Path $Config.ReportDirectory -Force | Out-Null
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $reportPath = Join-Path $Config.ReportDirectory "cache-listado-nc-audit-$timestamp.txt"

        $lines = @(
            "Auditoría TbCacheListadoNC - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
            "Backend: $($Config.BackendPath)",
            "Ámbito: $scopeLabel",
            "",
            "NC reales del ámbito: $sourceActive",
            "Filas válidas totales en cache (TbCacheListadoNC, CacheValida=True): $cacheValid",
            "Filas totales en cache: $cacheTotal",
            "Filas inválidas/no vigentes en cache: $invalidRows",
            "",
            "Faltantes en cache válida: $($missing.Count)",
            (Format-IdSample $missing $Config.MaxRowsToShow),
            "",
            "Sobrantes/stale en cache válida: $($stale.Count)",
            (Format-IdSample $stale $Config.MaxRowsToShow),
            "",
            "IDs con filas inválidas/no vigentes: $($invalid.Count)",
            (Format-IdSample $invalid $Config.MaxRowsToShow)
        )

        Set-Content -LiteralPath $reportPath -Value $lines -Encoding UTF8
        Write-Host "`n=== Resultado auditoría ===" -ForegroundColor Cyan
        $lines | ForEach-Object { Write-Host $_ }
        Write-Host "`nReporte: $reportPath" -ForegroundColor Green

        return [pscustomobject]@{
            Missing = $missing
            Stale = $stale
            Invalid = $invalid
            SourceActive = $sourceActive
            CacheValid = $cacheValid
            CacheTotal = $cacheTotal
            InvalidRows = $invalidRows
            ScopeLabel = $scopeLabel
            ReportPath = $reportPath
        }
    }
    finally {
        $connection.Dispose()
    }
}

function Invoke-ConservativeRepair {
    param($Config)

    $connection = New-AccessConnection $Config
    $transaction = $null
    try {
        Test-RequiredTables $connection
        $transaction = $connection.BeginTransaction()
        $sql = @"
UPDATE TbCacheListadoNC
SET CacheValida=False, FechaCache=Now()
WHERE CacheValida=True
  AND IDNoConformidad NOT IN (
    SELECT IDNoConformidad FROM TbNoConformidades WHERE (Borrado=False OR Borrado Is Null)
  )
"@
        Write-Host "Repair probe: invalidando sobrantes/stale... timeout=$($Config.CommandTimeoutSeconds)s" -ForegroundColor DarkCyan
        $updated = Invoke-NonQuery -Connection $connection -Sql $sql -Transaction $transaction -TimeoutSeconds $Config.CommandTimeoutSeconds
        $transaction.Commit()
        Write-Host "`nReparación conservadora completada." -ForegroundColor Green
        Write-Host "Filas sobrantes invalidadas: $updated"
        Write-Host "Si había faltantes, ejecutá en Access: PrepararStagingConCaches(False, True)" -ForegroundColor Yellow
    }
    catch {
        if ($null -ne $transaction) { $transaction.Rollback() }
        throw
    }
    finally {
        $connection.Dispose()
    }
}

function Get-RebuildListadoInsertSql {
    param([string]$SourceWhere)

    return @"
INSERT INTO TbCacheListadoNC
  (IDNoConformidad, Version, CodigoNoConformidad, IDExpediente, Nemotecnico, CodExp,
   JuridicaExp, IDTipo, Descripcion, Notas, Estado, FechaApertura, FechaCierre,
   RequiereControlEficacia, ControlEficacia, ResponsableTelefonica, RESPONSABLECALIDAD,
   ACR, Cerrada, FechaCache, CacheValida)
SELECT
  n.IDNoConformidad,
  1 AS Version,
  Left(IIf(IsNull(n.CodigoNoConformidad),'',n.CodigoNoConformidad),255) AS CodigoNoConformidad,
  n.IDExpediente,
  Left(IIf(IsNull(n.Nemotecnico),'',n.Nemotecnico),255) AS Nemotecnico,
  Left(IIf(IsNull(n.CodExp),'',n.CodExp),255) AS CodExp,
  Left(IIf(IsNull(n.JuridicaExp),'',n.JuridicaExp),255) AS JuridicaExp,
  IIf(IsNull(n.IDTipo),0,n.IDTipo) AS IDTipo,
  IIf(IsNull(n.Descripcion),'',n.Descripcion) AS Descripcion,
  IIf(IsNull(n.Notas),'',n.Notas) AS Notas,
  Left(IIf(IsNull(n.Estado),'',n.Estado),100) AS Estado,
  n.FechaApertura,
  n.FECHACIERRE AS FechaCierre,
  Left(IIf(IsNull(n.RequiereControlEficacia),'',n.RequiereControlEficacia),10) AS RequiereControlEficacia,
  Left(IIf(IsNull(n.ControlEficacia),'',n.ControlEficacia),255) AS ControlEficacia,
  Left(IIf(IsNull(n.ResponsableTelefonica),'',n.ResponsableTelefonica),255) AS ResponsableTelefonica,
  Left(IIf(IsNull(n.RESPONSABLECALIDAD),'',n.RESPONSABLECALIDAD),255) AS RESPONSABLECALIDAD,
  Left(IIf(IsNull(n.ACR),'',n.ACR),255) AS ACR,
  Left(IIf(IsNull(n.Cerrada),'',n.Cerrada),10) AS Cerrada,
  Now() AS FechaCache,
  True AS CacheValida
FROM TbNoConformidades AS n
WHERE $SourceWhere
"@
}

function Invoke-SqlRebuildRepair {
    param($Config, [switch]$OpenOnly)

    $connection = New-AccessConnection $Config
    $transaction = $null
    try {
        Test-RequiredTables $connection
        $transaction = $connection.BeginTransaction()

        $sourceWhere = Get-SourceWhereClause -OpenOnly:$OpenOnly
        if ($OpenOnly) {
            Write-Host "Repair probe: reconstruyendo cache de NC no cerradas y retirando filas stale/invalid... timeout=$($Config.CommandTimeoutSeconds)s" -ForegroundColor DarkCyan
            $deleteOpenSql = @"
DELETE FROM TbCacheListadoNC
WHERE CacheValida Is Null
   OR CacheValida=False
   OR IDNoConformidad IN (SELECT IDNoConformidad FROM TbNoConformidades WHERE $sourceWhere)
   OR IDNoConformidad NOT IN (SELECT IDNoConformidad FROM TbNoConformidades WHERE $sourceWhere)
"@
            [void](Invoke-NonQuery -Connection $connection -Sql $deleteOpenSql -Transaction $transaction -TimeoutSeconds $Config.CommandTimeoutSeconds)
        }
        else {
            Write-Host "Repair probe: borrando cache completa... timeout=$($Config.CommandTimeoutSeconds)s" -ForegroundColor DarkCyan
            [void](Invoke-NonQuery -Connection $connection -Sql "DELETE FROM TbCacheListadoNC" -Transaction $transaction -TimeoutSeconds $Config.CommandTimeoutSeconds)
        }

        $sql = Get-RebuildListadoInsertSql -SourceWhere $sourceWhere
        Write-Host "Repair probe: insertando filas reconstruidas... timeout=$($Config.CommandTimeoutSeconds)s" -ForegroundColor DarkCyan
        $inserted = Invoke-NonQuery -Connection $connection -Sql $sql -Transaction $transaction -TimeoutSeconds $Config.CommandTimeoutSeconds
        $transaction.Commit()
        if ($OpenOnly) {
            Write-Host "`nReconstrucción SQL de no cerradas completada." -ForegroundColor Green
        }
        else {
            Write-Host "`nReconstrucción SQL completa completada." -ForegroundColor Green
        }
        Write-Host "Filas insertadas: $inserted"
        Write-Host "Nota: esto reconstruye solo TbCacheListadoNC; para caches de detalle usá Access si corresponde." -ForegroundColor Yellow
    }
    catch {
        if ($null -ne $transaction) { $transaction.Rollback() }
        throw
    }
    finally {
        $connection.Dispose()
    }
}

function ConvertTo-HtmlText {
    param([object]$Value)

    if ($null -eq $Value) { return "" }
    return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function Get-AuditSummaryHtml {
    param($Audit)

    return @"
<ul>
  <li>Ámbito: <strong>$(ConvertTo-HtmlText $Audit.ScopeLabel)</strong></li>
  <li>NC reales del ámbito: <strong>$($Audit.SourceActive)</strong></li>
  <li>Filas válidas en cache: <strong>$($Audit.CacheValid)</strong></li>
  <li>Filas totales en cache: <strong>$($Audit.CacheTotal)</strong></li>
  <li>Faltantes: <strong>$($Audit.Missing.Count)</strong></li>
  <li>Sobrantes/stale: <strong>$($Audit.Stale.Count)</strong></li>
  <li>Inválidas/no vigentes: <strong>$($Audit.Invalid.Count)</strong></li>
</ul>
"@
}

function New-CacheHtmlReport {
    param($Config, $BeforeAudit, $AfterAudit, [bool]$RepairNeeded, [bool]$RepairDone)

    New-Item -ItemType Directory -Path $Config.HtmlReportDirectory -Force | Out-Null
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $reportPath = Join-Path $Config.HtmlReportDirectory "cache-listado-nc-notification-$timestamp.html"
    $statusText = if ($RepairNeeded) { if ($RepairDone) { "Reparación ejecutada" } else { "Reparación requerida pero no ejecutada" } } else { "Sin reparación requerida" }
    $statusClass = if ($RepairNeeded) { if ($RepairDone) { "ok" } else { "warn" } } else { "ok" }

    $html = @"
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte TbCacheListadoNC</title>
  <style>
    body { margin: 0; padding: 24px; background: #f4f6fb; color: #1f2937; font-family: Arial, Helvetica, sans-serif; }
    .wrap { max-width: 920px; margin: 0 auto; }
    .hero { background: #0066ff; color: white; border-radius: 14px; padding: 22px 26px; }
    .hero h1 { margin: 0 0 6px 0; font-size: 24px; }
    .hero p { margin: 0; opacity: .95; }
    .status { display: inline-block; margin-top: 14px; padding: 7px 12px; border-radius: 999px; font-weight: bold; }
    .status.ok { background: #dcfce7; color: #166534; }
    .status.warn { background: #fef3c7; color: #92400e; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
    .card { background: white; border-radius: 14px; padding: 18px; box-shadow: 0 10px 25px rgba(15, 23, 42, .08); }
    .card h2 { margin: 0 0 10px 0; font-size: 18px; color: #0f172a; }
    ul { padding-left: 20px; line-height: 1.65; }
    .meta { margin-top: 16px; color: #475569; font-size: 13px; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>Reporte de cache TbCacheListadoNC</h1>
      <p>Generado el $(ConvertTo-HtmlText (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))</p>
      <span class="status $statusClass">$(ConvertTo-HtmlText $statusText)</span>
    </section>
    <section class="grid">
      <article class="card">
        <h2>Estado antes</h2>
        $(Get-AuditSummaryHtml $BeforeAudit)
      </article>
      <article class="card">
        <h2>Estado final</h2>
        $(Get-AuditSummaryHtml $AfterAudit)
      </article>
    </section>
    <section class="card" style="margin-top:16px">
      <h2>Resultado</h2>
      <ul>
        <li>Reparación requerida: <strong>$($RepairNeeded.ToString().ToLowerInvariant())</strong></li>
        <li>Reparación realizada: <strong>$($RepairDone.ToString().ToLowerInvariant())</strong></li>
        <li>Reporte previo: <strong>$(ConvertTo-HtmlText $BeforeAudit.ReportPath)</strong></li>
        <li>Reporte final: <strong>$(ConvertTo-HtmlText $AfterAudit.ReportPath)</strong></li>
      </ul>
      <p class="meta">Backend: $(ConvertTo-HtmlText $Config.BackendPath)</p>
    </section>
  </div>
</body>
</html>
"@

    Set-Content -LiteralPath $reportPath -Value $html -Encoding UTF8
    return [pscustomobject]@{ Path = $reportPath; Html = $html }
}

function Add-CacheNotificationEmail {
    param($Config, [string]$Html, [string]$HtmlPath, [bool]$RepairNeeded, [bool]$RepairDone)

    $dbEngine = $null
    $db = $null
    $rs = $null
    try {
        $dbEngine = New-DaoDbEngine
        $password = Get-PasswordPlainText ([string]$Config.PasswordEnvironmentVariable)
        $db = Open-DaoDatabase -DbEngine $dbEngine -DatabasePath ([string]$Config.BackendPath) -Password $password
        $rsMax = $db.OpenRecordset("SELECT MAX(IDCorreo) AS MaxId FROM TbCorreosEnviados", 4)
        $nextId = 1
        if (-not $rsMax.EOF) {
            $rawMax = $rsMax.Fields("MaxId").Value
            if ($null -ne $rawMax) { $nextId = [int]$rawMax + 1 }
        }
        $rsMax.Close()
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($rsMax)

        $repairText = if ($RepairNeeded) { if ($RepairDone) { "reparada" } else { "requiere reparación" } } else { "sin reparación" }
        $subject = "TbCacheListadoNC - $repairText - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        if ($subject.Length -gt 255) { $subject = $subject.Substring(0, 255) }

        $rs = $db.OpenRecordset("TbCorreosEnviados")
        $rs.AddNew()
        $rs.Fields.Item("IDCorreo").Value = [int]$nextId
        $rs.Fields.Item("Aplicacion").Value = [string]$Config.NotificationApplication
        $rs.Fields.Item("Originador").Value = [string]$Config.NotificationOriginator
        $rs.Fields.Item("Destinatarios").Value = [string]$Config.NotificationRecipient
        $rs.Fields.Item("Asunto").Value = [string]$subject
        $rs.Fields.Item("Cuerpo").Value = [string]$Html
        $rs.Fields.Item("FechaGrabacion").Value = [datetime](Get-Date)
        $rs.Fields.Item("CuerpoHTML").Value = [bool]$true
        $rs.Fields.Item("URLAdjunto").Value = [string]$HtmlPath
        $rs.Update()
        return $nextId
    }
    catch {
        throw
    }
    finally {
        if ($null -ne $rs) { try { $rs.Close() } catch {} ; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($rs) } catch {} }
        if ($null -ne $db) { try { $db.Close() } catch {} ; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($db) } catch {} }
        if ($null -ne $dbEngine) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) } catch {} }
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
}

function Invoke-RepairOpenAndNotify {
    param($Config)

    $beforeAudit = Invoke-CacheAudit $Config -OpenOnly
    $repairNeeded = ($beforeAudit.Missing.Count -gt 0 -or $beforeAudit.Stale.Count -gt 0 -or $beforeAudit.Invalid.Count -gt 0)
    $repairDone = $false
    if ($repairNeeded) {
        Invoke-SqlRebuildRepair $Config -OpenOnly
        $repairDone = $true
    }

    $afterAudit = Invoke-CacheAudit $Config -OpenOnly
    $report = New-CacheHtmlReport -Config $Config -BeforeAudit $beforeAudit -AfterAudit $afterAudit -RepairNeeded $repairNeeded -RepairDone $repairDone
    $emailQueued = $false
    if ($repairNeeded -or [bool]$Config.EmailOnNoRepair) {
        [void](Add-CacheNotificationEmail -Config $Config -Html $report.Html -HtmlPath $report.Path -RepairNeeded $repairNeeded -RepairDone $repairDone)
        $emailQueued = $true
    }
    else {
        Write-Host "Notificación omitida: no hacía falta reparar y EmailOnNoRepair=False" -ForegroundColor Yellow
    }

    Write-Host "CACHE_TUI_CHILD_RESULT: OK action=RepairOpenAndNotify repairNeeded=$($repairNeeded.ToString().ToLowerInvariant()) emailQueued=$($emailQueued.ToString().ToLowerInvariant()) html=$($report.Path)"
}

function Show-EffectiveConfig {
    param($Config)

    Write-Host "`n=== Config efectiva ===" -ForegroundColor Cyan
    Write-Host "ConfigPath: $ConfigPath"
    Write-Host "BackendPath: $($Config.BackendPath)"
    Write-Host "ReportDirectory: $($Config.ReportDirectory)"
    Write-Host "HtmlReportDirectory: $($Config.HtmlReportDirectory)"
    Write-Host "MaxRowsToShow: $($Config.MaxRowsToShow)"
    Write-Host "PasswordEnvironmentVariable: $($Config.PasswordEnvironmentVariable)"
    Write-Host "CommandTimeoutSeconds: $($Config.CommandTimeoutSeconds)"
    Write-Host "OperationTimeoutSeconds: $($Config.OperationTimeoutSeconds)"
    Write-Host "RepairMode: $($Config.RepairMode)"
    Write-Host "NotificationRecipient: $($Config.NotificationRecipient)"
    Write-Host "NotificationOriginator: $($Config.NotificationOriginator)"
    Write-Host "NotificationApplication: $($Config.NotificationApplication)"
    Write-Host "EmailOnNoRepair: $($Config.EmailOnNoRepair)"
    Write-Host "ACE providers: $(@($Config.AceProviders) -join ', ')"
    Write-Host "Password: no se muestra ni se guarda" -ForegroundColor DarkYellow
}

function Invoke-ChildActionWithWatchdog {
    param(
        $Config,
        [Parameter(Mandatory = $true)][string]$ChildAction
    )

    $timeoutSeconds = [int]$Config.OperationTimeoutSeconds
    $scriptPath = $PSCommandPath
    if ([string]::IsNullOrWhiteSpace($scriptPath)) {
        $scriptPath = $MyInvocation.MyCommand.Path
    }

    Write-Host "`nWatchdog: ejecutando $ChildAction con timeout global de ${timeoutSeconds}s..." -ForegroundColor DarkCyan
    $powerShellExe = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
    if ([string]::IsNullOrWhiteSpace($powerShellExe)) {
        $powerShellExe = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
    }
    if ([string]::IsNullOrWhiteSpace($powerShellExe)) {
        throw "No se encontró powershell.exe ni pwsh para ejecutar la acción hija con watchdog."
    }

    $job = Start-Job -Name "cache-listado-nc-$ChildAction" -ScriptBlock {
        param($PowerShellExe, $ScriptPath, $ChildConfigPath, $ChildActionName)
        & $PowerShellExe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -ConfigPath $ChildConfigPath -Action $ChildActionName
    } -ArgumentList $powerShellExe, $scriptPath, $ConfigPath, $ChildAction

    try {
        $completed = Wait-Job -Job $job -Timeout $timeoutSeconds
        if ($null -eq $completed) {
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            Write-Host "`nTIMEOUT: la acción '$ChildAction' superó ${timeoutSeconds}s y fue cancelada por el watchdog." -ForegroundColor Red
            Write-Host "Si el backend quedó con lock, cerrá Access y reintentá. No sigas reparando a ciegas." -ForegroundColor Yellow
            Write-Host "CACHE_TUI_RESULT: TIMEOUT action=$ChildAction timeoutSeconds=$timeoutSeconds" -ForegroundColor Red
            return
        }

        Receive-Job -Job $job
        if ($job.State -eq "Completed") {
            Write-Host "CACHE_TUI_RESULT: OK action=$ChildAction" -ForegroundColor Green
        }
        else {
            Write-Host "CACHE_TUI_RESULT: FAILED action=$ChildAction state=$($job.State)" -ForegroundColor Red
        }
    }
    finally {
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    }
}

function Open-ConfigFile {
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw "No existe el config: $ConfigPath"
    }
    Invoke-Item -LiteralPath $ConfigPath
}

function Invoke-RepairMenu {
    param($Config)

    Write-Host "`n=== Reparación ===" -ForegroundColor Cyan
    Write-Host "1) Conservadora: invalidar sobrantes/stale; faltantes se regeneran desde Access"
    Write-Host "2) Reconstrucción SQL rápida: reparar solo NC no cerradas"
    Write-Host "3) Reconstrucción SQL completa: borrar y reconstruir TbCacheListadoNC"
    Write-Host "4) Reparar NC no cerradas y notificar por HTML/email"
    Write-Host "0) Volver"
    $choice = Read-Host "Elegí una opción"
    switch ($choice) {
        "1" { Invoke-ConservativeRepair $Config }
        "2" {
            Write-Host "Esta opción modifica TbCacheListadoNC solo para NC no cerradas." -ForegroundColor Yellow
            $confirm = Read-Host "Escribí ABIERTAS para confirmar"
            if ($confirm -eq "ABIERTAS") { Invoke-ChildActionWithWatchdog -Config $Config -ChildAction "RepairOpen" }
        }
        "3" {
            Write-Host "Esta opción modifica TbCacheListadoNC en una transacción." -ForegroundColor Yellow
            $confirm = Read-Host "Escribí REBUILD para confirmar"
            if ($confirm -eq "REBUILD") { Invoke-ChildActionWithWatchdog -Config $Config -ChildAction "RepairAll" }
        }
        "4" {
            Write-Host "Esta opción audita, repara NC no cerradas si hace falta y registra un email HTML." -ForegroundColor Yellow
            $confirm = Read-Host "Escribí NOTIFICAR para confirmar"
            if ($confirm -eq "NOTIFICAR") { Invoke-ChildActionWithWatchdog -Config $Config -ChildAction "RepairOpenAndNotify" }
        }
        default { return }
    }
}

function Start-Tui {
    $config = Read-CacheConfig
    while ($true) {
        Write-Host "`n==== TbCacheListadoNC TUI ====" -ForegroundColor Cyan
        Write-Host "1) Auditar / consultar integridad completa"
        Write-Host "5) Auditar rápido: solo NC no cerradas"
        Write-Host "2) Reparar cache"
        Write-Host "3) Mostrar config efectiva"
        Write-Host "4) Abrir config"
        Write-Host "0) Salir"
        $choice = Read-Host "Opción"
        try {
            switch ($choice) {
                "1" { Invoke-ChildActionWithWatchdog -Config $config -ChildAction "AuditAll" }
                "5" { Invoke-ChildActionWithWatchdog -Config $config -ChildAction "AuditOpen" }
                "2" { Invoke-RepairMenu $config }
                "3" { Show-EffectiveConfig $config }
                "4" { Open-ConfigFile }
                "0" { return }
                default { Write-Host "Opción no válida" -ForegroundColor Yellow }
            }
        }
        catch {
            Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

function Invoke-ActionAndExit {
    $config = Read-CacheConfig
    try {
        switch ($Action) {
            "AuditAll" { [void](Invoke-CacheAudit $config); Write-Host "CACHE_TUI_CHILD_RESULT: OK action=$Action"; return }
            "AuditOpen" { [void](Invoke-CacheAudit $config -OpenOnly); Write-Host "CACHE_TUI_CHILD_RESULT: OK action=$Action"; return }
            "RepairConservative" { Invoke-ConservativeRepair $config; Write-Host "CACHE_TUI_CHILD_RESULT: OK action=$Action"; return }
            "RepairOpen" { Invoke-SqlRebuildRepair $config -OpenOnly; Write-Host "CACHE_TUI_CHILD_RESULT: OK action=$Action"; return }
            "RepairAll" { Invoke-SqlRebuildRepair $config; Write-Host "CACHE_TUI_CHILD_RESULT: OK action=$Action"; return }
            "RepairOpenAndNotify" { Invoke-RepairOpenAndNotify $config; return }
            default { Start-Tui; return }
        }
    }
    catch {
        Write-Host "CACHE_TUI_CHILD_RESULT: FAILED action=$Action error=$($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

Invoke-ActionAndExit
