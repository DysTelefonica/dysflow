[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
[CmdletBinding()]
Param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("Export", "Import", "Delete", "Fix-Encoding", "Generate-ERD", "List-Objects", "Exists", "Run-Procedure", "Run-Tests", "Compile")]
    [string]$Action,

    [Parameter()]
    [string]$AccessPath,

    [Parameter()]
    [Alias("DestinationPath")]
    [string]$DestinationRoot,

    # FIX: ModuleName con Position alto para que nunca compita posicionalmente con otros parametros.
    # Siempre pasar con nombre explicito: -ModuleName "A" "B" "C"
    # Evita que PowerShell asigne valores del array a -Location u otros parametros con ValidateSet.
    [Parameter(Position = 100)]
    [string[]]$ModuleName,

    [Parameter()]
    [string]$ModuleNamesJson,

    [Parameter()]
    [string]$ProcedureName,

    [Parameter()]
    [string]$ProcedureArgsJson,

    [Parameter()]
    [string]$ProceduresJson,

    [Parameter()]
    [string]$ProceduresJsonFile,

    # FIX: Location sin Position para que no participe en binding posicional automatico
    # y nunca compita con los valores del array de -ModuleName.
    [Parameter()]
    [ValidateSet("Both", "Src", "Access")]
    [string]$Location = "Both",

    [Parameter()]
    [ValidateSet("Auto", "Form", "Code")]
    [string]$ImportMode = "Auto",

    [Parameter()]
    [string]$BackendPath,

    [Parameter()]
    [string]$ErdPath,

    [Parameter()]
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "Password", Justification = "Requerido por especificacion del proyecto.")]
    [string]$Password = ""
    ,
    [Parameter()]
    [string]$ProjectRoot = ""
    ,
    [Parameter()]
    [switch]$Json
    ,
    [Parameter()]
    [switch]$AllowStartupExecution
    ,
    [Parameter()]
    [string]$OperationId = ""
    ,
    [Parameter()]
    [string]$OperationFile = ""
)

$ErrorActionPreference = "Stop"
$script:QuietOutput = [bool]$Json

function Write-DysflowOperationMarker {
    [CmdletBinding()]
    Param(
        [string]$Status = "running",
        [System.Nullable[int]]$AccessPid = $null
    )

    if ([string]::IsNullOrWhiteSpace($OperationFile)) { return }
    try {
        $dir = Split-Path -Parent $OperationFile
        if ($dir -and -not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
        }
        $startTime = $null
        if ($AccessPid) {
            try {
                $p = Get-Process -Id $AccessPid -ErrorAction Stop
                $startTime = $p.StartTime.ToUniversalTime().ToString("o")
            } catch { Write-Debug "Diagnostics: $_" }
        }
        $record = [pscustomobject]@{
            operationId      = $OperationId
            action           = $Action
            accessPath       = $AccessPath
            destinationRootAbs = $DestinationRoot
            accessPid        = if ($AccessPid) { [int]$AccessPid } else { $null }
            processStartTime = $startTime
            status           = $Status
            updatedAt        = (Get-Date).ToUniversalTime().ToString("o")
        }
        $record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OperationFile -Encoding UTF8
    } catch {
        Write-Status -Message ("WARN: no se pudo escribir marker de operación dysflow: {0}" -f $_.Exception.Message) -Color DarkYellow
    }
}

if (-not $Password) { $Password = $env:ACCESS_VBA_PASSWORD }
if (-not $Password) {
    # Resolve-SecretsPath: check ProjectRoot first, then ScriptDir
    $resolvedSecretsPath = $null
    if (-not [string]::IsNullOrWhiteSpace($ProjectRoot)) {
        $candidate = Join-Path $ProjectRoot '.secrets.json'
        if (Test-Path $candidate) { $resolvedSecretsPath = $candidate }
    }
    if (-not $resolvedSecretsPath) {
        $candidate = Join-Path $PSScriptRoot '.secrets.json'
        if (Test-Path $candidate) { $resolvedSecretsPath = $candidate }
    }
    if ($resolvedSecretsPath) {
        try {
            $secrets = Get-Content $resolvedSecretsPath -Raw | ConvertFrom-Json
            if ($secrets.PSObject.Properties['access_password']) { $Password = [string]$secrets.access_password }
            elseif ($secrets.PSObject.Properties['AccessVbaPassword']) { $Password = [string]$secrets.AccessVbaPassword }
        } catch { Write-Debug "Diagnostics: $_" }
    }
}

function Write-Status {
    Param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )
    if ($script:QuietOutput) { return }
    $old = $Host.UI.RawUI.ForegroundColor
    try {
        $Host.UI.RawUI.ForegroundColor = $Color
        Write-Host $Message
    } finally {
        $Host.UI.RawUI.ForegroundColor = $old
    }
}

function New-DaoDbEngine {
    [CmdletBinding()]
    Param()

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
        } catch { Write-Debug "Diagnostics: $_" }
    }

    return $null
}

function Get-AllowBypassKeyState {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
        [string]$Password
    )

    $dbEngine = $null
    $database = $null
    $prop = $null

    try {
        $dbEngine = New-DaoDbEngine
        if (-not $dbEngine) { return $null }

        $connect = ""
        if (-not [string]::IsNullOrEmpty($Password)) {
            $connect = ";PWD=$Password"
        }

        try {
            $database = $dbEngine.OpenDatabase($AccessPath, $false, $false, $connect)
        } catch {
            return $null
        }

        try {
            $prop = $database.Properties("AllowBypassKey")
            return [pscustomobject]@{ Existed = $true; Value = [bool]$prop.Value }
        } catch {
            return [pscustomobject]@{ Existed = $false; Value = $null }
        }
    } finally {
        if ($database) { try { $database.Close() } catch { Write-Debug "Diagnostics: $_" } }
        foreach ($obj in @($prop, $database, $dbEngine)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        }
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
}

function Enable-AllowBypassKey {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
        [string]$Password
    )

    $dbEngine = $null
    $database = $null
    $prop = $null
    $newProp = $null

    try {
        $dbEngine = New-DaoDbEngine
        if (-not $dbEngine) { return $false }

        $connect = ""
        if (-not [string]::IsNullOrEmpty($Password)) {
            $connect = ";PWD=$Password"
        }

        try {
            $database = $dbEngine.OpenDatabase($AccessPath, $false, $false, $connect)
        } catch {
            return $false
        }

        try {
            $prop = $database.Properties("AllowBypassKey")
            $prop.Value = $true
        } catch {
            # 1 = dbBoolean, sin cast [int16] para evitar problemas COM
            $newProp = $database.CreateProperty("AllowBypassKey", 1, $true)
            $database.Properties.Append($newProp)
        }
        return $true
    } finally {
        if ($database) { try { $database.Close() } catch { Write-Debug "Diagnostics: $_" } }
        foreach ($obj in @($newProp, $prop, $database, $dbEngine)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        }
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
}

function Restore-AllowBypassKey {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
        [string]$Password,
        $OriginalState
    )

    if (-not $OriginalState) { return }

    $dbEngine = $null
    $database = $null
    $prop = $null

    try {
        $dbEngine = New-DaoDbEngine
        if (-not $dbEngine) { return }

        $connect = ""
        if (-not [string]::IsNullOrEmpty($Password)) {
            $connect = ";PWD=$Password"
        }

        try {
            $database = $dbEngine.OpenDatabase($AccessPath, $false, $false, $connect)
        } catch {
            return
        }

        if ($OriginalState.Existed) {
            $prop = $database.Properties("AllowBypassKey")
            $prop.Value = [bool]$OriginalState.Value
        } else {
            try { $database.Properties.Delete("AllowBypassKey") } catch { Write-Debug "Diagnostics: $_" }
        }
    } finally {
        if ($database) { try { $database.Close() } catch { Write-Debug "Diagnostics: $_" } }
        foreach ($obj in @($prop, $database, $dbEngine)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        }
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
}

function Disable-StartupFeatures {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [string]$Password
    )

    $dbEngine = $null
    $db = $null
    $restoreInfo = [ordered]@{
        RenamedAutoExec     = $false
        OriginalStartupForm = $null
        HasStartupForm      = $false
        OriginalAppIcon     = $null
        HasAppIcon          = $false
    }

    try {
        $dbEngine = New-DaoDbEngine
        if (-not $dbEngine) {
            throw "CRITICAL: No se pudo deshabilitar AutoExec/StartupForm porque no se pudo crear DAO.DBEngine. Se aborta la apertura para evitar ejecucion no desatendida. Si estás en un entorno controlado de testing y aceptás ejecutar startup code, reintentá con --allow-startup-execution."
        }

        $connect = if ($Password) { ";PWD=$Password" } else { "" }
        $db = $dbEngine.OpenDatabase($AccessPath, $false, $false, $connect)

        try {
            $scripts = $db.Containers("Scripts")
            $scriptNames = @()
            foreach ($doc in $scripts.Documents) { $scriptNames += [string]$doc.Name }

            if ($scriptNames -contains "AutoExec_TraeBackup" -and -not ($scriptNames -contains "AutoExec")) {
                foreach ($doc in $scripts.Documents) {
                    if ($doc.Name -eq "AutoExec_TraeBackup") {
                        $doc.Name = "AutoExec"
                        break
                    }
                }
            }

            foreach ($doc in $scripts.Documents) {
                if ($doc.Name -eq "AutoExec") {
                    $doc.Name = "AutoExec_TraeBackup"
                    $restoreInfo.RenamedAutoExec = $true
                    break
                }
            }
        } catch { Write-Debug "Diagnostics: $_" }

        try {
            $prop = $db.Properties("StartupForm")
            $restoreInfo.OriginalStartupForm = $prop.Value
            $restoreInfo.HasStartupForm = $true
            $db.Properties.Delete("StartupForm")
        } catch { Write-Debug "Diagnostics: $_" }

        try {
            $prop = $db.Properties("AppIcon")
            $restoreInfo.OriginalAppIcon = $prop.Value
            $restoreInfo.HasAppIcon = $true
            $db.Properties.Delete("AppIcon")
        } catch { Write-Debug "Diagnostics: $_" }

        return [pscustomobject]$restoreInfo

    } catch {
        $detail = if ($_.Exception -and $_.Exception.Message) { $_.Exception.Message } else { [string]$_ }
        throw ("CRITICAL: No se pudo deshabilitar AutoExec/StartupForm mediante DAO. Detalle: {0}. Se aborta la apertura para evitar ejecucion no desatendida. Si estás en un entorno controlado de testing y aceptás ejecutar startup code, reintentá con --allow-startup-execution." -f $detail)
    } finally {
        if ($db) { try { $db.Close() } catch { Write-Debug "Diagnostics: $_" } }
        foreach ($obj in @($db, $dbEngine)) {
            if ($null -ne $obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        }
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
}

function Restore-StartupFeatures {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [string]$Password,
        $RestoreInfo
    )

    if (-not $RestoreInfo) { return }

    $dbEngine = $null
    $db = $null

    try {
        $dbEngine = New-DaoDbEngine
        if (-not $dbEngine) { return }

        $connect = if ($Password) { ";PWD=$Password" } else { "" }
        $db = $dbEngine.OpenDatabase($AccessPath, $false, $false, $connect)

        if ($RestoreInfo.RenamedAutoExec) {
            try {
                $scripts = $db.Containers("Scripts")
                foreach ($doc in $scripts.Documents) {
                    if ($doc.Name -eq "AutoExec_TraeBackup") {
                        $doc.Name = "AutoExec"
                        break
                    }
                }
            } catch { Write-Debug "Diagnostics: $_" }
        }

        if ($RestoreInfo.HasStartupForm) {
            try {
                $db.Properties("StartupForm").Value = $RestoreInfo.OriginalStartupForm
            } catch {
                try {
                    # 10 = dbText, sin cast [int16] para evitar problemas COM
                    $newProp = $db.CreateProperty("StartupForm", 10, $RestoreInfo.OriginalStartupForm)
                    $db.Properties.Append($newProp)
                } catch { Write-Debug "Diagnostics: $_" }
            }
        }

        if ($RestoreInfo.HasAppIcon) {
            try {
                $db.Properties("AppIcon").Value = $RestoreInfo.OriginalAppIcon
            } catch {
                try {
                    $newProp = $db.CreateProperty("AppIcon", 10, $RestoreInfo.OriginalAppIcon)
                    $db.Properties.Append($newProp)
                } catch { Write-Debug "Diagnostics: $_" }
            }
        }
    } catch { Write-Debug "Diagnostics: $_" } finally {
        if ($db) { try { $db.Close() } catch { Write-Debug "Diagnostics: $_" } }
        foreach ($obj in @($db, $dbEngine)) {
            if ($null -ne $obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        }
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
}

function Resolve-AccessPath {
    [CmdletBinding()]
    Param(
        [string]$AccessPath
    )

    if (-not [string]::IsNullOrWhiteSpace($AccessPath)) {
        return (Resolve-Path -Path $AccessPath).Path
    }

    $candidates = Get-ChildItem -Path (Get-Location) -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in @(".accdb", ".accde", ".mdb", ".mde") } |
        Sort-Object -Property Name

    if (-not $candidates -or $candidates.Count -eq 0) {
        throw "No se encontro ningun archivo .accdb/.accde/.mdb/.mde en el directorio actual."
    }

    if ($candidates.Count -gt 1) {
        Write-Status -Message "ADVERTENCIA: Se encontraron varias BDs; eligiendo determinista (alfabetico):" -Color Yellow
        foreach ($c in $candidates) { Write-Status -Message (" - {0}" -f $c.Name) -Color Yellow }
    }

    return $candidates[0].FullName
}

function Resolve-DestinationRoot {
    [CmdletBinding()]
    Param(
        [string]$DestinationRoot
    )

    if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
        $DestinationRoot = Join-Path -Path (Get-Location) -ChildPath "src"
    }

    if (-not (Test-Path -Path $DestinationRoot)) {
        New-Item -Path $DestinationRoot -ItemType Directory -Force | Out-Null
    }

    return (Resolve-Path -Path $DestinationRoot).Path
}

function Resolve-ModulesPath {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$DestinationRoot,
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [Parameter(Mandatory = $true)][ValidateSet("Export", "Import", "Delete", "Fix-Encoding", "Generate-ERD", "List-Objects", "Exists", "Run-Procedure", "Compile")][string]$Action
    )
    if (-not (Test-Path -Path $DestinationRoot)) {
        if ($Action -eq "Export" -or $Action -eq "Fix-Encoding" -or $Action -eq "Delete") {
            New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null
        } else {
            throw ("No existe la carpeta de modulos: {0}" -f $DestinationRoot)
        }
    }

    return (Resolve-Path -Path $DestinationRoot).Path
}

function Get-FileEncodingInfo {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        return [pscustomobject]@{ HasUtf8Bom = $true; Bytes = $bytes }
    }
    return [pscustomobject]@{ HasUtf8Bom = $false; Bytes = $bytes }
}

function Write-Utf8NoBom {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Text
    )

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

function Convert-AnsiToUtf8NoBom {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$InputPath,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    $ansi = [System.Text.Encoding]::GetEncoding(1252)
    $text = [System.IO.File]::ReadAllText($InputPath, $ansi)
    Write-Utf8NoBom -Path $OutputPath -Text $text
}

function Convert-Utf8ToAnsiTempFile {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$InputPath,
        [Parameter(Mandatory = $true)][string]$TempPath
    )

    $utf8 = [System.Text.Encoding]::UTF8
    $ansi = [System.Text.Encoding]::GetEncoding(1252)
    $text = [System.IO.File]::ReadAllText($InputPath, $utf8)
    [System.IO.File]::WriteAllText($TempPath, $text, $ansi)
}

function Test-IsVbaImportMetadataLine {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$Line
    )

    $trim = $Line.Trim()
    if ([string]::IsNullOrWhiteSpace($trim)) { return $false }

    return (
        $trim -match '^VERSION\s+\d+(\.\d+)?\s+CLASS$' -or
        $trim -match '^BEGIN\b' -or
        $trim -match '^END$' -or
        $trim -match '^(MultiUse|Persistable|DataBindingBehavior|DataSourceBehavior|MTSTransactionMode)\s*=' -or
        $trim -match '^Attribute\s+VB_'
    )
}

function Test-IsVbaOptionDirectiveLine {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$Line
    )

    $trim = $Line.Trim()
    return ($trim -match '^Option\s+(Compare\s+\w+|Explicit|Base\s+\d+|Private\s+Module)$')
}

function Normalize-VbaImportText {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$Text
    )

    $normalized = $Text -replace "`r`n", "`n" -replace "`r", "`n"
    $lines = @($normalized -split "`n", -1)
    if ($lines.Count -eq 0) { return "" }

    if ($lines[0].Length -gt 0 -and [int][char]$lines[0][0] -eq 0xFEFF) {
        $lines[0] = $lines[0].Substring(1)
    }

    $start = 0
    while ($start -lt $lines.Count) {
        $trim = $lines[$start].Trim()
        if ($trim -eq "") {
            $start++
            continue
        }
        if (Test-IsVbaImportMetadataLine -Line $lines[$start]) {
            $start++
            continue
        }
        break
    }

    $result = New-Object System.Collections.Generic.List[string]
    $seenOptions = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    $inDirectiveBlock = $true

    for ($i = $start; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        $trim = $line.Trim()

        if ($inDirectiveBlock) {
            if ($trim -eq "") {
                $result.Add($line)
                continue
            }

            if (Test-IsVbaImportMetadataLine -Line $line) {
                continue
            }

            if (Test-IsVbaOptionDirectiveLine -Line $line) {
                if ($seenOptions.Add($trim)) {
                    $result.Add($line)
                }
                continue
            }

            $inDirectiveBlock = $false
        }

        $result.Add($line)
    }

    while ($result.Count -gt 0 -and [string]::IsNullOrWhiteSpace($result[0])) {
        $result.RemoveAt(0)
    }

    return [string]::Join("`r`n", $result)
}

function Convert-Utf8CodeImportToAnsiTempFile {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$InputPath,
        [Parameter(Mandatory = $true)][string]$TempPath
    )

    $utf8 = [System.Text.Encoding]::UTF8
    $ansi = [System.Text.Encoding]::GetEncoding(1252)
    $text = [System.IO.File]::ReadAllText($InputPath, $utf8)
    $sanitized = Normalize-VbaImportText -Text $text
    [System.IO.File]::WriteAllText($TempPath, $sanitized, $ansi)
}

function Get-PreferredNewline {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text
    )

    if ($Text.Contains("`r`n")) { return "`r`n" }
    return "`n"
}

function Normalize-Newlines {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text,
        [string]$Newline = "`n"
    )

    return (($Text -replace "`r`n", "`n" -replace "`r", "`n") -replace "`n", $Newline)
}

function Split-CodeBehindSection {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text
    )

    $normalized = Normalize-Newlines -Text $Text -Newline "`n"
    $match = [regex]::Match($normalized, '(?im)^([ \t]*CodeBehind\w*[^\r\n]*)(?:\n|$)')
    if (-not $match.Success) { return $null }

    $start = $match.Index
    $markerLine = $match.Groups[1].Value
    $markerEnd = $match.Index + $match.Length

    return [pscustomobject]@{
        Start      = $start
        Before     = $normalized.Substring(0, $start)
        MarkerLine = $markerLine
        Body       = $normalized.Substring($markerEnd)
    }
}

function Split-VbaHeaderAndBody {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text
    )

    $normalized = Normalize-Newlines -Text $Text -Newline "`n"
    $lines = @($normalized -split "`n", -1)
    if ($lines.Count -gt 0 -and $lines[0].Length -gt 0 -and [int][char]$lines[0][0] -eq 0xFEFF) {
        $lines[0] = $lines[0].Substring(1)
    }

    $header = New-Object System.Collections.Generic.List[string]
    $index = 0
    while ($index -lt $lines.Count) {
        $line = $lines[$index]
        $trim = $line.Trim()
        if ($trim -eq "" -or (Test-IsVbaImportMetadataLine -Line $line) -or (Test-IsVbaOptionDirectiveLine -Line $line)) {
            $header.Add($line)
            $index++
            continue
        }
        break
    }

    while ($header.Count -gt 0 -and [string]::IsNullOrWhiteSpace($header[$header.Count - 1])) {
        $header.RemoveAt($header.Count - 1)
    }

    $bodyLines = New-Object System.Collections.Generic.List[string]
    for ($i = $index; $i -lt $lines.Count; $i++) {
        $bodyLines.Add($lines[$i])
    }
    while ($bodyLines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($bodyLines[0])) {
        $bodyLines.RemoveAt(0)
    }

    return [pscustomobject]@{
        Header = [string]::Join("`n", $header)
        Body   = [string]::Join("`n", $bodyLines)
    }
}

function Join-VbaHeaderAndBody {
    [CmdletBinding()]
    Param(
        [AllowEmptyString()][string]$Header,
        [AllowEmptyString()][string]$Body,
        [string]$Newline = "`r`n"
    )

    $parts = New-Object System.Collections.Generic.List[string]
    $headerText = if ($null -ne $Header) { [string]$Header } else { "" }
    $bodyText = if ($null -ne $Body) { [string]$Body } else { "" }
    $normalizedHeader = (Normalize-Newlines -Text $headerText -Newline "`n") -replace '\n+$', ''
    $normalizedBody = (Normalize-Newlines -Text $bodyText -Newline "`n") -replace '^\n+', ''

    if (-not [string]::IsNullOrEmpty($normalizedHeader)) { $parts.Add($normalizedHeader) }
    if (-not [string]::IsNullOrEmpty($normalizedBody)) { $parts.Add($normalizedBody) }

    return ([string]::Join("`n", $parts) -replace "`n", $Newline)
}

function Merge-AccessDocumentWithCanonicalHeader {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$LocalDocumentText,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$CanonicalDocumentText
    )

    $localSection = Split-CodeBehindSection -Text $LocalDocumentText
    if (-not $localSection) { throw "El documento local no contiene ningún marcador CodeBehind*." }

    $canonicalSection = Split-CodeBehindSection -Text $CanonicalDocumentText
    if (-not $canonicalSection) { throw "El documento canónico exportado desde Access no contiene ningún marcador CodeBehind*." }

    $newline = Get-PreferredNewline -Text $CanonicalDocumentText
    $localCode = Split-VbaHeaderAndBody -Text $localSection.Body
    $canonicalCode = Split-VbaHeaderAndBody -Text $canonicalSection.Body
    $effectiveHeader = if (-not [string]::IsNullOrWhiteSpace($canonicalCode.Header)) { $canonicalCode.Header } else { $localCode.Header }
    $mergedCode = Join-VbaHeaderAndBody -Header $effectiveHeader -Body $localCode.Body -Newline $newline
    $normalizedBefore = Normalize-Newlines -Text $localSection.Before -Newline $newline

    return ($normalizedBefore + $canonicalSection.MarkerLine + $newline + $mergedCode)
}

function Remove-AccessDocumentRootNameProperty {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DocumentText
    )

    # Access.LoadFromText recibe el nombre del formulario/reporte como segundo
    # argumento. En exports válidos de Access, el root Begin Form/Report no lleva
    # una propiedad Name inmediata; si aparece ahí al crear un documento nuevo,
    # Access puede fallar con "Esta propiedad no se utiliza para este control".
    return [regex]::Replace(
        $DocumentText,
        '(^\s*Begin\s+(?:Form|Report)\s*\r?\n)\s*Name\s*=\s*"[^"]*"\s*\r?\n',
        '$1',
        [System.Text.RegularExpressions.RegexOptions]::Multiline
    )
}

function Normalize-AccessDocumentRootEndMarker {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DocumentText
    )

    # Access SaveAsText cierra el documento raíz con "End", no con
    # "End Form"/"End Report". Si una IA genera ese cierre explícito,
    # LoadFromText lee "End" y falla después con "Esperado EOF. Encontrado: Form".
    return [regex]::Replace(
        $DocumentText,
        '(?im)^(\s*)End\s+(Form|Report)\s*$',
        '$1End'
    )
}

function Normalize-AccessDocumentCodeBehindMarker {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DocumentText
    )

    # Access SaveAsText no usa un marcador genérico "CodeBehind" para
    # formularios. Si una IA lo genera, LoadFromText interpreta que el
    # documento terminó en el End raíz y falla con "Esperado EOF. Encontrado:
    # CodeBehind". Canonicalizamos antes de escribir el temporal ANSI.
    $normalized = Normalize-Newlines -Text $DocumentText -Newline "`n"
    $suffix = if ($normalized -match '(?im)^\s*Begin\s+Report\b') { "Report" } else { "Form" }
    return [regex]::Replace(
        $DocumentText,
        '(?im)^([ \t]*)CodeBehind[ \t]*$',
        ('$1CodeBehind' + $suffix)
    )
}

function Test-LooksLikeVbaCodeLine {
    Param([AllowEmptyString()][string]$Line)
    $trim = ([string]$Line).Trim()
    return ($trim -match '^(Option\s+(Compare|Explicit|Base|Private\s+Module)|Attribute\s+VB_|(Public|Private|Friend)\s+(Sub|Function|Property|Enum|Type)|Sub\s+\w+|Function\s+\w+|Property\s+(Get|Let|Set)\s+\w+|Dim\s+\w+|Const\s+\w+)')
}

function Normalize-AccessDocumentOrphanCodeBehindSection {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DocumentText
    )

    if (Split-CodeBehindSection -Text $DocumentText) { return $DocumentText }

    $newline = Get-PreferredNewline -Text $DocumentText
    $normalized = Normalize-Newlines -Text $DocumentText -Newline "`n"
    $suffix = if ($normalized -match '(?im)^\s*Begin\s+Report\b') { "Report" } else { "Form" }
    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in ($normalized -split "`n", -1)) { $lines.Add([string]$line) }

    for ($i = 0; $i -lt $lines.Count; $i++) {
        if (([string]$lines[$i]).Trim() -ne "End") { continue }
        if ($lines[$i] -notmatch '^End\s*$') { continue }

        $firstNonBlank = -1
        $hasVba = $false
        for ($j = $i + 1; $j -lt $lines.Count; $j++) {
            if ($firstNonBlank -lt 0 -and -not [string]::IsNullOrWhiteSpace($lines[$j])) { $firstNonBlank = $j }
            if (Test-LooksLikeVbaCodeLine -Line $lines[$j]) {
                $hasVba = $true
                break
            }
        }

        if ($firstNonBlank -ge 0 -and $hasVba) {
            $lines.Insert($firstNonBlank, ("CodeBehind{0}" -f $suffix))
            return (($lines -join "`n") -replace "`n", $newline)
        }
    }

    return $DocumentText
}

function Normalize-AccessDocumentTextForLoadFromText {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DocumentText
    )
    $withoutRootName = Remove-AccessDocumentRootNameProperty -DocumentText $DocumentText
    $withRootEnd = Normalize-AccessDocumentRootEndMarker -DocumentText $withoutRootName
    $withMarker = Normalize-AccessDocumentCodeBehindMarker -DocumentText $withRootEnd
    return Normalize-AccessDocumentOrphanCodeBehindSection -DocumentText $withMarker
}

function Assert-AccessDocumentTextLooksLoadable {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DocumentText,
        [Parameter(Mandatory = $true)][ValidateSet("Form", "Report")][string]$Kind,
        [Parameter(Mandatory = $true)][string]$SourcePath
    )

    $normalized = Normalize-Newlines -Text $DocumentText -Newline "`n"
    $lines = @($normalized -split "`n")
    $firstLine = $null
    $lineNumber = 0
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $candidate = ([string]$lines[$i]).Trim()
        if ($candidate.Length -gt 0) {
            $firstLine = $candidate.TrimStart([char]0xFEFF)
            $lineNumber = $i + 1
            break
        }
    }

    $label = [System.IO.Path]::GetFileName($SourcePath)
    if ([string]::IsNullOrWhiteSpace($firstLine)) {
        throw ("{0} está vacío; no es un .form.txt/.report.txt de Access válido." -f $label)
    }

    if ($firstLine -match '^[A-Za-z_][\w -]*\s*:' -and $firstLine -notmatch '^[A-Za-z_][\w -]*\s*=') {
        throw ("{0} no parece un SaveAsText de Access: línea {1} contiene ':' antes de '=' ({2}). Probablemente fue generado por IA como YAML/Markdown. Debe partir de un export real de Access." -f $label, $lineNumber, $firstLine)
    }

    if ($firstLine -notmatch '^(Version|VersionRequired|PublishOption|Checksum)\s*=' -and $firstLine -notmatch '^Begin\s+(Form|Report)\b') {
        throw ("{0} no parece un SaveAsText de Access: línea {1} inesperada ({2}). Un .form.txt/.report.txt válido empieza con 'Version =...' o 'Begin Form/Report'." -f $label, $lineNumber, $firstLine)
    }

    $beginPattern = '(?im)^\s*Begin\s+' + [regex]::Escape($Kind) + '\b'
    if ($normalized -notmatch $beginPattern) {
        throw ("{0} no contiene 'Begin {1}'. No se puede importar como {1}." -f $label, $Kind)
    }

    $section = Split-CodeBehindSection -Text $normalized
    if ($section) {
        $rootEndMatch = [regex]::Match($normalized, '(?im)^End\s*$')
        if (-not $rootEndMatch.Success -or $section.Start -lt $rootEndMatch.Index) {
            throw ("{0} tiene el marcador {1} antes del End raíz del documento. Eso corrompe el .form.txt/.report.txt: el CodeBehind debe ir después del End raíz exportado por Access." -f $label, $section.MarkerLine.Trim())
        }
    }
}

function Get-ProcessIdFromHwnd {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][IntPtr]$Hwnd
    )

    if (-not ([System.Management.Automation.PSTypeName]"Win32.NativeMethods").Type) {
        Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NativeMethods {
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@
    }

    [uint32]$pid = 0
    [Win32.NativeMethods]::GetWindowThreadProcessId($Hwnd, [ref]$pid) | Out-Null
    return [int]$pid
}

function Close-TargetAccessDbIfOpen {
    # Cierra SOLO la instancia COM de Access que tiene abierta la BD indicada,
    # iterando el ROT completo para no afectar otras instancias de Access en ejecucion.
    # Toda la interaccion COM se hace en C# para evitar el problema de __ComObject opaco.
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath
    )

    $resolved = $null
    $rp = Resolve-Path -Path $AccessPath -ErrorAction SilentlyContinue
    if ($rp) { $resolved = $rp.Path }
    # Fallback: si Resolve-Path falla (OneDrive, rutas largas), usar el path raw
    if (-not $resolved) {
        if (Test-Path -LiteralPath $AccessPath) { $resolved = $AccessPath }
        else {
            Write-Status -Message ("Close-TargetAccessDbIfOpen: no se pudo resolver la ruta: {0}" -f $AccessPath) -Color DarkYellow
            return
        }
    }

    # Registrar tipos solo una vez por sesion de PowerShell
    if (-not ([System.Management.Automation.PSTypeName]"RotManager").Type) {
        Add-Type -TypeDefinition @"
using System;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public class RotCloseResult {
    public bool Success;
    public string Error;
    public int ClosedCount;
}

public class RotManager {
    [DllImport("ole32.dll")]
    private static extern int GetRunningObjectTable(uint reserved, out IRunningObjectTable pprot);

    [DllImport("ole32.dll")]
    private static extern int CreateBindCtx(uint reserved, out IBindCtx ppbc);

    public static RotCloseResult CloseDatabaseIfOpen(string dbPath) {
        var result = new RotCloseResult { Success = true };
        IRunningObjectTable rot = null;
        IEnumMoniker enumMk = null;
        IBindCtx bindCtx = null;

        try {
            int hr = GetRunningObjectTable(0, out rot);
            if (hr != 0 || rot == null) { result.Error = "No se pudo obtener el ROT"; return result; }

            hr = CreateBindCtx(0, out bindCtx);
            if (hr != 0 || bindCtx == null) { result.Error = "No se pudo crear BindCtx"; return result; }

            rot.EnumRunning(out enumMk);
            if (enumMk == null) { result.Error = "EnumRunning devolvio null"; return result; }

            enumMk.Reset();
            var monikers = new IMoniker[1];

            while (enumMk.Next(1, monikers, IntPtr.Zero) == 0) {
                if (monikers[0] == null) continue;
                object comObj = null;
                try {
                    string displayName = null;
                    try { monikers[0].GetDisplayName(bindCtx, null, out displayName); } catch { continue; }
                    if (string.IsNullOrEmpty(displayName) || !displayName.Contains("Access.Application")) continue;

                    try { rot.GetObject(monikers[0], out comObj); } catch { continue; }
                    if (comObj == null) continue;

                    // Usar reflection (late-binding) — funciona sobre __ComObject sin interop assembly
                    object db = null;
                    string openDbName = null;
                    try {
                        db = comObj.GetType().InvokeMember("CurrentDb",
                            BindingFlags.InvokeMethod, null, comObj, null);
                        if (db != null) {
                            openDbName = (string)db.GetType().InvokeMember("Name",
                                BindingFlags.GetProperty, null, db, null);
                        }
                    } catch {
                        // No tiene BD abierta o instancia corrupta — saltar
                    } finally {
                        if (db != null) try { Marshal.ReleaseComObject(db); } catch { }
                    }

                    if (!string.IsNullOrEmpty(openDbName) &&
                        string.Equals(openDbName, dbPath, StringComparison.OrdinalIgnoreCase)) {
                        try {
                            comObj.GetType().InvokeMember("CloseCurrentDatabase",
                                BindingFlags.InvokeMethod, null, comObj, null);
                            try {
                                comObj.GetType().InvokeMember("Quit",
                                    BindingFlags.InvokeMethod, null, comObj, null);
                            } catch { }
                            result.ClosedCount++;
                        } catch { }
                    }
                } catch {
                    // Este moniker no sirve — continuar
                } finally {
                    if (comObj != null) try { Marshal.ReleaseComObject(comObj); } catch { }
                    try { Marshal.ReleaseComObject(monikers[0]); } catch { }
                    monikers[0] = null;
                }
            }
        } catch (Exception ex) {
            result.Success = false;
            result.Error = ex.Message;
        } finally {
            if (enumMk != null) try { Marshal.ReleaseComObject(enumMk); } catch { }
            if (bindCtx != null) try { Marshal.ReleaseComObject(bindCtx); } catch { }
            if (rot != null) try { Marshal.ReleaseComObject(rot); } catch { }
        }
        return result;
    }
}
"@
    }

    $closedViaRot = $false
    try {
        $result = [RotManager]::CloseDatabaseIfOpen($resolved)
        if ($result.ClosedCount -gt 0) {
            Write-Status -Message ("Cerrada(s) {0} instancia(s) COM de la BD: {1}" -f $result.ClosedCount, $resolved) -Color Yellow
            $closedViaRot = $true
        }
        if ($result.Error) {
            Write-Status -Message ("ROT warning: {0}" -f $result.Error) -Color DarkYellow
        }
    } catch { Write-Debug "Diagnostics: $_" }

    # Fallback: si el ROT no cerro nada, buscar proceso MSACCESS con lock bloqueado
    if (-not $closedViaRot) {
        $lockPath = Get-AccessLockFilePath -AccessPath $resolved
        if ($lockPath -and (Test-Path -LiteralPath $lockPath)) {
            Write-Status -Message ("Detectado lock activo: {0}" -f $lockPath) -Color Yellow

            # Buscar MSACCESS.EXE por CommandLine. Get-CimInstance puede deadlockear si hay
            # procesos zombie colgados en I/O de red (e.g. UNC inalcanzable); Job con timeout
            # como guardia: si WMI no responde en 4s, fallback a Get-Process sin WMI.
            $cimProcs = @()
            $wmiJob = Start-Job -ScriptBlock { Get-CimInstance Win32_Process -Filter "Name = 'MSACCESS.EXE'" -ErrorAction SilentlyContinue }
            if (Wait-Job $wmiJob -Timeout 4) {
                $cimProcs = @(Receive-Job $wmiJob -ErrorAction SilentlyContinue)
            } else {
                Stop-Job $wmiJob -ErrorAction SilentlyContinue
                Write-Status -Message "WMI colgado al enumerar MSACCESS (probable proceso zombie en red). Fallback: cerrar todos los MSACCESS." -Color DarkYellow
            }
            Remove-Job $wmiJob -Force -ErrorAction SilentlyContinue
            $killed = $false

            if ($cimProcs.Count -gt 0) {
                foreach ($cim in $cimProcs) {
                    if ($cim.CommandLine -and $cim.CommandLine -match [regex]::Escape($resolved)) {
                        Write-Status -Message ("Cerrando MSACCESS PID {0} (CommandLine contiene: {1})" -f $cim.ProcessId, $resolved) -Color Yellow
                        try {
                            Stop-Process -Id $cim.ProcessId -Force -ErrorAction Stop
                            $killed = $true
                        } catch {
                            Write-Status -Message ("No se pudo cerrar MSACCESS PID {0}: {1}" -f $cim.ProcessId, $_.Exception.Message) -Color Red
                        }
                    }
                }
                if (-not $killed) {
                    Write-Status -Message ("Ningun MSACCESS contiene '{0}' en CommandLine. PIDs activos: {1}" -f $resolved, (($cimProcs | ForEach-Object { $_.ProcessId }) -join ', ')) -Color DarkYellow
                }
            } else {
                foreach ($p in @(Get-Process MSACCESS -ErrorAction SilentlyContinue)) {
                    Write-Status -Message ("Fallback: cerrando MSACCESS PID {0}" -f $p.Id) -Color Yellow
                    try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; $killed = $true } catch { Write-Debug "Diagnostics: $_" }
                }
            }

            if ($killed) {
                $timeout = 5; $elapsed = 0
                while ((Test-Path -LiteralPath $lockPath) -and ($elapsed -lt $timeout)) {
                    Start-Sleep -Milliseconds 500
                    $elapsed += 0.5
                }
                if (Test-Path -LiteralPath $lockPath) {
                    Write-Status -Message ("ADVERTENCIA: lock sigue presente tras cerrar el proceso: {0}" -f $lockPath) -Color DarkYellow
                } else {
                    Write-Status -Message "Lock liberado correctamente." -Color Green
                }
            }
        }
    }
}

function Open-AccessDatabase {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
        [string]$Password,
        [switch]$AllowStartupExecution
    )

    $access = $null
    $originalBypass = $null
    $accessPid = $null
    $vbe = $null
    $vbProject = $null
    $prePids = @()
    $startupInfo = $null

    try {
        # Cerrar SOLO la instancia COM que tenga esta BD abierta, sin tocar otras instancias de Access
        Close-TargetAccessDbIfOpen -AccessPath $AccessPath

        $originalBypass = Get-AllowBypassKeyState -AccessPath $AccessPath -Password $Password
        $bypassOk = Enable-AllowBypassKey -AccessPath $AccessPath -Password $Password
        if (-not $bypassOk) {
            Write-Status -Message "ADVERTENCIA: No se pudo habilitar AllowBypassKey; abriendo de todas formas." -Color Yellow
        }

        if ($AllowStartupExecution) {
            Write-Status -Message "ADVERTENCIA: --allow-startup-execution activo; se abre Access sin deshabilitar AutoExec/StartupForm." -Color Yellow
            $startupInfo = [pscustomobject]@{
                RenamedAutoExec     = $false
                OriginalStartupForm = $null
                HasStartupForm      = $false
                OriginalAppIcon     = $null
                HasAppIcon          = $false
            }
        } else {
            $startupInfo = Disable-StartupFeatures -AccessPath $AccessPath -Password $Password
            if (-not $startupInfo) {
                throw "CRITICAL: No se pudo deshabilitar AutoExec/StartupForm. Se aborta la apertura para evitar ejecucion no desatendida. Si estás en un entorno controlado de testing y aceptás ejecutar startup code, reintentá con --allow-startup-execution."
            }
        }

        try {
            $prePids = @(Get-Process MSACCESS -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
        } catch {
            $prePids = @()
        }

        $access = New-Object -ComObject Access.Application
        $access.Visible = $false
        $access.UserControl = $false
        $access.AutomationSecurity = 1
        try {
            $hwnd = [IntPtr]$access.hWndAccessApp()
            if ($hwnd -and $hwnd -ne [IntPtr]::Zero) {
                $accessPid = Get-ProcessIdFromHwnd -Hwnd $hwnd
            }
        } catch { Write-Debug "Diagnostics: $_" }

        $access.OpenCurrentDatabase($AccessPath, $false, $Password)
        try { $access.DoCmd.SetWarnings($false) } catch { Write-Debug "Diagnostics: $_" }
        try {
            if (-not $accessPid) {
                $hwnd2 = [IntPtr]$access.hWndAccessApp()
                if ($hwnd2 -and $hwnd2 -ne [IntPtr]::Zero) {
                    $accessPid = Get-ProcessIdFromHwnd -Hwnd $hwnd2
                }
            }
        } catch { Write-Debug "Diagnostics: $_" }

        try {
            $post = @(Get-Process MSACCESS -ErrorAction SilentlyContinue | Select-Object -Property Id, StartTime)
            $new = @($post | Where-Object { $_.Id -notin $prePids })
            if ($new.Count -eq 1) {
                $accessPid = [int]$new[0].Id
            } elseif ($new.Count -gt 1 -and -not $accessPid) {
                Write-Status -Message ("WARN: se detectaron varias instancias nuevas de MSACCESS y no se pudo identificar con certeza cuál pertenece a '{0}'. Se evita fijar un PID ambiguo." -f $AccessPath) -Color DarkYellow
            }
        } catch { Write-Debug "Diagnostics: $_" }

        if (-not $accessPid) {
            Write-Status -Message ("WARN: no se pudo determinar el PID de Access para '{0}'. El cierre final se hara por COM/ROT y el lock podria persistir si Access queda vivo." -f $AccessPath) -Color DarkYellow
        }

        Write-DysflowOperationMarker -Status "running" -AccessPid $accessPid

        $vbe = $access.VBE
        $vbProject = $vbe.ActiveVBProject

        return [pscustomobject]@{
            AccessApplication = $access
            Vbe               = $vbe
            VbProject         = $vbProject
            OriginalBypass    = $originalBypass
            StartupInfo       = $startupInfo
            ProcessId         = $accessPid
        }
    } catch {
        if ($access) {
            try { $access.Quit() } catch { Write-Debug "Diagnostics: $_" }
            try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($access) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
        }
        foreach ($obj in @($vbProject, $vbe)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        }
        if ($originalBypass) {
            try { Restore-AllowBypassKey -AccessPath $AccessPath -Password $Password -OriginalState $originalBypass } catch { Write-Debug "Diagnostics: $_" }
        }
        if ($startupInfo) {
            try { Restore-StartupFeatures -AccessPath $AccessPath -Password $Password -RestoreInfo $startupInfo } catch { Write-Debug "Diagnostics: $_" }
        }
        throw
    }
}

function Get-AccessLockFilePath {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath
    )

    $ext = [System.IO.Path]::GetExtension($AccessPath)
    if ([string]::Equals($ext, ".accdb", [System.StringComparison]::OrdinalIgnoreCase)) {
        return [System.IO.Path]::ChangeExtension($AccessPath, ".laccdb")
    }
    if ([string]::Equals($ext, ".mdb", [System.StringComparison]::OrdinalIgnoreCase)) {
        return [System.IO.Path]::ChangeExtension($AccessPath, ".ldb")
    }
    return $null
}

# Find the MSACCESS.EXE PID that has the given database open, identified by the database
# path appearing in the process command line. Returns $null if no such process exists.
# This only ever matches the instance opened for THIS AccessPath — never other Access
# instances the user may have open with a different database.
function Find-AccessPidByDatabase {
    [CmdletBinding()]
    Param([Parameter(Mandatory = $true)][string]$AccessPath)
    $dbKey = $AccessPath.ToLowerInvariant()
    foreach ($proc in @(Get-CimInstance Win32_Process -Filter "Name = 'MSACCESS.EXE'" -ErrorAction SilentlyContinue)) {
        if ($proc.CommandLine -and $proc.CommandLine.ToLowerInvariant().Contains($dbKey)) {
            return [int]$proc.ProcessId
        }
    }
    return $null
}

# Force-terminate a specific PID and wait deterministically until it is actually gone,
# instead of relying on a fixed sleep. Access can stay in the process table briefly after
# CloseCurrentDatabase/Quit while it releases COM and file handles.
function Stop-AccessPidAndWait {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][int]$AccessPid,
        [int]$TimeoutMs = 20000
    )
    try { Stop-Process -Id $AccessPid -Force -ErrorAction SilentlyContinue } catch { Write-Debug "Diagnostics: $_" }
    $elapsed = 0
    while ($elapsed -lt $TimeoutMs) {
        $alive = $null
        try { $alive = Get-Process -Id $AccessPid -ErrorAction SilentlyContinue } catch { $alive = $null }
        if (-not $alive) { return $true }
        Start-Sleep -Milliseconds 100
        $elapsed += 100
        # Re-issue the kill in case the first signal was dropped during COM teardown.
        try { Stop-Process -Id $AccessPid -Force -ErrorAction SilentlyContinue } catch { Write-Debug "Diagnostics: $_" }
    }
    return $false
}

function Close-AccessDatabase {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
        [string]$Password
    )

    $access = $Session.AccessApplication
    $orig = $Session.OriginalBypass
    $startupInfo = $Session.StartupInfo
    $accessPid = $Session.ProcessId

    # If the PID was not captured at open time (e.g. New-Object reused an existing COM
    # instance and the pre/post process diff saw no new process), resolve it now by the
    # database path while the process is still alive and matchable.
    if (-not $accessPid) {
        $accessPid = Find-AccessPidByDatabase -AccessPath $AccessPath
    }

    if ($access) {
        try { $access.CloseCurrentDatabase() } catch { Write-Debug "Diagnostics: $_" }
        try { $access.Quit() } catch { Write-Debug "Diagnostics: $_" }
    }

    foreach ($obj in @($Session.VbProject, $Session.Vbe, $Session.AccessApplication)) {
        if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
    }

    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    # Kill Access BEFORE DAO restore operations so the file lock is guaranteed released.
    # Re-resolve the PID after Quit in case it only became matchable now.
    if (-not $accessPid) {
        $accessPid = Find-AccessPidByDatabase -AccessPath $AccessPath
    }
    if ($accessPid) {
        $terminated = Stop-AccessPidAndWait -AccessPid $accessPid -TimeoutMs 5000
        if (-not $terminated) {
            Write-Status -Message ("WARN: no se pudo confirmar la terminacion del PID {0} para '{1}'. Intentando taskkill." -f $accessPid, $AccessPath) -Color DarkYellow
            try {
              Start-Process -FilePath "taskkill" -ArgumentList "/F", "/PID", $accessPid -NoNewWindow -Wait:$false -ErrorAction SilentlyContinue
            } catch { Write-Debug "Diagnostics: $_" }
        }
    } else {
        Write-Status -Message ("WARN: se cierra '{0}' sin PID de Access resuelto. Se reintentara el cierre por ROT y se verificara el lock." -f $AccessPath) -Color DarkYellow
        try { Close-TargetAccessDbIfOpen -AccessPath $AccessPath } catch { Write-Debug "Diagnostics: $_" }
        Start-Sleep -Milliseconds 300
    }

    try { Restore-AllowBypassKey -AccessPath $AccessPath -Password $Password -OriginalState $orig } catch { Write-Debug "Diagnostics: $_" }
    try { Restore-StartupFeatures -AccessPath $AccessPath -Password $Password -RestoreInfo $startupInfo } catch { Write-Debug "Diagnostics: $_" }

    $lockPath = Get-AccessLockFilePath -AccessPath $AccessPath

    if ($lockPath) {
        Start-Sleep -Milliseconds 300
        if (Test-Path -LiteralPath $lockPath) {
            try { Close-TargetAccessDbIfOpen -AccessPath $AccessPath } catch { Write-Debug "Diagnostics: $_" }
            Start-Sleep -Milliseconds 300
            if (Test-Path -LiteralPath $lockPath) {
                Write-Status -Message ("WARN: el archivo de lock sigue presente tras cerrar '{0}': {1}" -f $AccessPath, $lockPath) -Color DarkYellow
            }
        }
    }
}

function Get-ComponentFolder {
    Param([Parameter(Mandatory = $true)]$Component, [string]$ModuleName)
    $name = if ($ModuleName) { $ModuleName } else { $Component.Name }
    if ($name -match "^Form_|^frm") { return "forms" }
    if ($name -match "^Report_") { return "reports" }
    $t = $Component.Type
    if ($t -eq 1) { return "modules" }
    if ($t -eq 2) { return "classes" }
    if ($t -eq 100) { return "forms" }  # Document module sin prefijo claro: fallback conservador a forms
    if ($t -eq 3) { return "forms" }
    return $null
}

function Get-ComponentExtension {
    Param([Parameter(Mandatory = $true)]$Component, [string]$ModuleName)
    $name = if ($ModuleName) { $ModuleName } else { $Component.Name }
    if ($name -match "^Form_|^frm") { return ".form.txt" }
    if ($name -match "^Report_") { return ".report.txt" }
    $t = $Component.Type
    if ($t -eq 1) { return ".bas" }
    if ($t -eq 2) { return ".cls" }
    if ($t -eq 100) { return ".form.txt" }
    if ($t -eq 3) { return ".form.txt" }
    return $null
}

function Export-VbaModule {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        $AccessApplication = $null  # FIX: necesario para SaveAsText de formularios
    )

    $component = $null
    $tmp = $null
    $finalPath = $null

    try {
        # Buscar en VBProject: primero con el nombre tal cual, luego con prefijos documentales
        $component = $null
        $actualName = $ModuleName  # nombre real del componente en VBProject
        try {
            $component = $VbProject.VBComponents.Item($ModuleName)
        } catch {
            $baseName = $ModuleName -replace '^(Form|Report)_', ''
            foreach ($candidate in @("Form_$baseName", "Report_$baseName") | Select-Object -Unique) {
                if ($component) { break }
                try { $component = $VbProject.VBComponents.Item($candidate); if ($component) { $actualName = $candidate } } catch { Write-Debug "Diagnostics: $_" }
            }
        }
        if ($component) {
            $type = [int]$component.Type
        } else {
            # No se encontro ni con ni sin prefijo
            return
        }
        if ($type -ne 1 -and $type -ne 2 -and $type -ne 100 -and $type -ne 3) { return }
        $ext = Get-ComponentExtension -Component $component -ModuleName $actualName
        $folder = Get-ComponentFolder -Component $component -ModuleName $actualName
        if (-not $ext -or -not $folder) { return }

        $targetFolder = Join-Path -Path $ModulesPath -ChildPath $folder
        if (-not (Test-Path -Path $targetFolder)) {
            New-Item -Path $targetFolder -ItemType Directory -Force | Out-Null
        }

        $finalPath = Join-Path -Path $targetFolder -ChildPath ($actualName + $ext)

        # FIX: formularios/reportes usan SaveAsText para obtener UI + codigo completo
        # SaveAsText requiere el nombre del objeto Access SIN prefijo "Form_"/"Report_"
        if ($type -eq 3 -or $type -eq 100) {
            $isReportDocument = ($actualName -match '^Report_') -or ($ext -ieq '.report.txt') -or ($folder -eq 'reports')
            $objectName = $actualName -replace '^(Form|Report)_', ''
            $objectType = if ($isReportDocument) { 3 } else { 2 } # acReport=3, acForm=2
            $beginMarker = if ($isReportDocument) { 'Begin Report' } else { 'Begin Form' }
            $tmp = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("VBAManager_export_{0}.txt" -f [guid]::NewGuid().ToString("N"))

            if (-not $AccessApplication) {
                # Sin sesion COM no es posible exportar la UI del documento
                throw ("Se necesita -AccessApplication para exportar el documento '{0}' con SaveAsText." -f $objectName)
            }

            try {
                $AccessApplication.SaveAsText($objectType, $objectName, $tmp)
            } catch {
                throw ("SaveAsText lanzo excepcion para '{0}': {1}" -f $objectName, $_.Exception.Message)
            }

            # Verificar integridad: SaveAsText puede completarse sin excepcion pero producir un archivo
            # incompleto si el formulario esta abierto en modo diseno o bloqueado internamente.
            # Un .form.txt/.report.txt valido siempre contiene la linea Begin correspondiente.
            $savedContent = $null
            if (Test-Path -Path $tmp) {
                try { $savedContent = [System.IO.File]::ReadAllText($tmp, [System.Text.Encoding]::GetEncoding(1252)) } catch { Write-Debug "Diagnostics: $_" }
            }
            if (-not $savedContent -or $savedContent -notmatch [regex]::Escape($beginMarker)) {
                throw ("SaveAsText produjo un archivo incompleto para '{0}' (falta '{1}'). " +
                       "Asegurate de que el documento no este abierto en modo diseno en ninguna instancia de Access." -f $objectName, $beginMarker)
            }

            Convert-AnsiToUtf8NoBom -InputPath $tmp -OutputPath $finalPath
        } else {
            $tmp = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("VBAManager_export_{0}{1}" -f @([guid]::NewGuid().ToString("N"), $ext))
            $component.Export($tmp)
            Convert-AnsiToUtf8NoBom -InputPath $tmp -OutputPath $finalPath
        }

        # Exportar tambien el codigo VBA como .cls para document modules (para diff y lectura rapida)
        if ($actualName -match "^(Form|Report)_|^frm") {
            $clsSubFolder = if ($actualName -match "^Report_") { "reports" } else { "forms" }
            $clsFolder = Join-Path -Path $ModulesPath -ChildPath $clsSubFolder
            if (-not (Test-Path -Path $clsFolder)) {
                New-Item -Path $clsFolder -ItemType Directory -Force | Out-Null
            }
            $clsPath = Join-Path -Path $clsFolder -ChildPath ($actualName + ".cls")
            $codeModule = $component.CodeModule
            if ($codeModule -and $codeModule.CountOfLines -gt 0) {
                $codeLines = $codeModule.Lines(1, $codeModule.CountOfLines)
                Write-Utf8NoBom -Path $clsPath -Text $codeLines
            }
        }
    } finally {
        if ($tmp -and (Test-Path -Path $tmp)) { Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue }
        if ($component) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
    }
}

function Resolve-ImportFileForModule {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [ValidateSet("Auto", "Form", "Code")][string]$ImportMode = "Auto"
    )

    $modulesPathText = [string]$ModulesPath
    $moduleNameText = [string]$ModuleName

    $subFolders = @("forms", "reports", "classes", "modules", "")
    switch ($ImportMode) {
        "Form" { $extensions = @(".form.txt", ".report.txt", ".frm") }
        "Code" { $extensions = @(".cls", ".bas") }
        default { $extensions = @(".form.txt", ".report.txt", ".frm", ".cls", ".bas") }
    }

    foreach ($folder in $subFolders) {
        $searchPath = if ($folder) { Join-Path -Path $modulesPathText -ChildPath $folder } else { $modulesPathText }
        if (-not (Test-Path -Path $searchPath)) { continue }

        foreach ($ext in $extensions) {
            $candidate = Join-Path -Path $searchPath -ChildPath ($moduleNameText + $ext)
            if (Test-Path -Path $candidate) { return $candidate }
            # FIX: si no se encontro y es un form txt, probar con prefijo "Form_"
            if ($ext -eq ".form.txt" -and -not ($moduleNameText -match '^Form_')) {
                $candidateWithPrefix = Join-Path -Path $searchPath -ChildPath ("Form_" + $moduleNameText + $ext)
                if (Test-Path -Path $candidateWithPrefix) { return $candidateWithPrefix }
            }
            if ($ext -eq ".report.txt" -and -not ($moduleNameText -match '^Report_')) {
                $candidateWithPrefix = Join-Path -Path $searchPath -ChildPath ("Report_" + $moduleNameText + $ext)
                if (Test-Path -Path $candidateWithPrefix) { return $candidateWithPrefix }
            }
        }
    }

    $any = Get-ChildItem -Path $modulesPathText -File -Recurse -Include "*.bas", "*.cls", "*.frm", "*.form.txt", "*.report.txt" -ErrorAction SilentlyContinue |
        Where-Object { $_.BaseName -ieq $moduleNameText -or ($_.Name -replace '\.(form|report)\.txt$', '') -ieq $moduleNameText } |
        Where-Object {
            switch ($ImportMode) {
                "Form" { $_.Name -match '\.(form|report)\.txt$' -or $_.Extension -ieq '.frm' }
                "Code" { $_.Extension -ieq '.cls' -or $_.Extension -ieq '.bas' }
                default { $true }
            }
        } |
        Sort-Object -Property @{ Expression = {
            if ($ImportMode -eq "Code") {
                if ($_.Extension -eq '.cls') { 0 } elseif ($_.Extension -eq '.bas') { 1 } else { 9 }
            } else {
                if ($_.Name -match '\.(form|report)\.txt$') { 0 } elseif ($_.Extension -eq '.frm') { 1 } elseif ($_.Extension -eq '.cls') { 2 } else { 3 }
            }
        } } |
        Select-Object -First 1

    if ($any) { return $any.FullName }
    return $null
}

function Remove-ExistingComponent {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    $components = $VbProject.VBComponents
    for ($i = $components.Count; $i -ge 1; $i--) {
        $c = $components.Item($i)
        try {
            if ($c.Name -ieq $ModuleName) {
                $components.Remove($c)
                break
            }
        } finally {
            try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($c) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
        }
    }
}

function Remove-AccessObjectOrComponent {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    $objectInfo = Resolve-AccessObjectInfo -AccessApplication $AccessApplication -ModuleName $ModuleName
    if ($objectInfo.Exists) {
        $objectType = if ($objectInfo.Kind -eq "Report") { 3 } else { 2 } # acReport=3, acForm=2
        try {
            $AccessApplication.DoCmd.DeleteObject($objectType, $objectInfo.Name)
            return [pscustomobject]@{
                module = $ModuleName
                status = "ok"
                deleted = $objectInfo.Name
                kind   = $objectInfo.Kind
            }
        } catch {
            throw ("No se pudo eliminar {0} '{1}': {2}" -f $objectInfo.Kind, $objectInfo.Name, $_.Exception.Message)
        }
    }

    $componentName = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
    if (-not $componentName) {
        throw ("No existe objeto/componente para eliminar: {0}" -f $ModuleName)
    }

    $components = $VbProject.VBComponents
    $component = $null
    try {
        $component = $components.Item($componentName)
        $components.Remove($component)
        try { $AccessApplication.RunCommand(126) } catch { Write-Debug "Diagnostics: $_" }
        return [pscustomobject]@{
            module = $ModuleName
            status = "ok"
            deleted = $componentName
            kind   = "VBComponent"
        }
    } catch {
        throw ("No se pudo eliminar componente '{0}': {1}" -f $componentName, $_.Exception.Message)
    } finally {
        if ($component) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        if ($components) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($components) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
    }
}

function Resolve-ExistingComponentName {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    foreach ($candidate in @(
        $ModuleName,
        ("Form_" + ($ModuleName -replace '^Form_', '')),
        ("Report_" + ($ModuleName -replace '^Report_', ''))
    ) | Select-Object -Unique) {
        try {
            $component = $VbProject.VBComponents.Item($candidate)
            if ($component) {
                try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
                return $candidate
            }
        } catch { Write-Debug "Diagnostics: $_" }
    }

    return $null
}

function Get-AccessObjectNames {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)][ValidateSet("Forms", "Reports")] [string]$Kind
    )

    $result = New-Object System.Collections.Generic.List[string]
    $allObjects = $null
    try {
        $allObjects = if ($Kind -eq "Forms") { $AccessApplication.CurrentProject.AllForms } else { $AccessApplication.CurrentProject.AllReports }
        for ($i = 0; $i -lt $allObjects.Count; $i++) {
            $obj = $allObjects.Item($i)
            try {
                if ($obj -and $obj.Name) { $result.Add([string]$obj.Name) }
            } finally {
                if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
            }
        }
    } finally {
        if ($allObjects) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($allObjects) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
    }

    return @($result | Sort-Object -Unique)
}

function Resolve-AccessObjectInfo {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    $forms = @(Get-AccessObjectNames -AccessApplication $AccessApplication -Kind Forms)
    $reports = @(Get-AccessObjectNames -AccessApplication $AccessApplication -Kind Reports)
    $baseName = ($ModuleName -replace '^(Form|Report)_', '')
    $candidates = @(
        $ModuleName,
        $baseName,
        ("Form_" + $baseName),
        ("Report_" + $baseName)
    ) | Select-Object -Unique

    foreach ($candidate in $candidates) {
        $formMatch = @($forms | Where-Object { $_ -ieq $candidate } | Select-Object -First 1)
        if ($formMatch) {
            return [pscustomobject]@{
                Exists     = $true
                Kind       = "Form"
                Name       = [string]$formMatch[0]
                Candidates = $candidates
            }
        }

        $reportMatch = @($reports | Where-Object { $_ -ieq $candidate } | Select-Object -First 1)
        if ($reportMatch) {
            return [pscustomobject]@{
                Exists     = $true
                Kind       = "Report"
                Name       = [string]$reportMatch[0]
                Candidates = $candidates
            }
        }
    }

    return [pscustomobject]@{
        Exists     = $false
        Kind       = $null
        Name       = $null
        Candidates = $candidates
    }
}

function Get-FrontendInventory {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)]$VbProject
    )

    $forms = @(Get-AccessObjectNames -AccessApplication $AccessApplication -Kind Forms)
    $reports = @(Get-AccessObjectNames -AccessApplication $AccessApplication -Kind Reports)
    $documentModules = New-Object System.Collections.Generic.List[string]
    $modules = New-Object System.Collections.Generic.List[string]
    $classes = New-Object System.Collections.Generic.List[string]
    $components = $VbProject.VBComponents

    try {
        for ($i = 1; $i -le $components.Count; $i++) {
            $component = $components.Item($i)
            try {
                $name = [string]$component.Name
                switch ([int]$component.Type) {
                    1 { $modules.Add($name) }
                    2 { $classes.Add($name) }
                    100 { $documentModules.Add($name) }
                }
            } finally {
                if ($component) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
            }
        }
    } finally {
        if ($components) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($components) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
    }

    return [pscustomobject]@{
        forms           = @($forms | Sort-Object -Unique)
        reports         = @($reports | Sort-Object -Unique)
        modules         = @($modules | Sort-Object -Unique)
        classes         = @($classes | Sort-Object -Unique)
        documentModules = @($documentModules | Sort-Object -Unique)
    }
}

function Get-ExistsInfo {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    $accessInfo = Resolve-AccessObjectInfo -AccessApplication $AccessApplication -ModuleName $ModuleName
    $vbName = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
    $componentType = $null
    $isDocumentModule = $false
    $moduleExists = $false
    $classExists = $false
    $component = $null

    if ($vbName) {
        try {
            $component = $VbProject.VBComponents.Item($vbName)
            $componentType = [int]$component.Type
            $isDocumentModule = ($componentType -eq 100)
            $moduleExists = ($componentType -eq 1)
            $classExists = ($componentType -eq 2)
        } finally {
            if ($component) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        }
    }

    return [pscustomobject]@{
        moduleName             = $ModuleName
        accessObjectExists     = [bool]$accessInfo.Exists
        accessObjectKind       = $accessInfo.Kind
        accessObjectName       = $accessInfo.Name
        accessObjectCandidates = @($accessInfo.Candidates)
        vbComponentExists      = [bool]$vbName
        vbComponentName        = $vbName
        vbComponentType        = $componentType
        isDocumentModule       = $isDocumentModule
        moduleExists           = $moduleExists
        classExists            = $classExists
        suggestedImportMode    = "import"
    }
}

function Test-LooksLikeDocumentCodeTarget {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$ModulesPath
    )

    $srcLower = $SourcePath.ToLowerInvariant()
    if ($ModuleName -match '^(Form|Report)_') { return $true }
    if ($srcLower -match '[\\/]forms[\\/].+\.cls$') { return $true }
    if ($srcLower -match '[\\/]reports[\\/].+\.cls$') { return $true }

    $candidateNames = @(
        $ModuleName,
        ("Form_" + ($ModuleName -replace '^Form_', '')),
        ("Report_" + ($ModuleName -replace '^Report_', ''))
    ) | Select-Object -Unique

    foreach ($candidate in $candidateNames) {
        foreach ($folder in @('forms', 'reports')) {
            foreach ($ext in @('.form.txt', '.report.txt')) {
                $candidatePath = Join-Path -Path (Join-Path -Path $ModulesPath -ChildPath $folder) -ChildPath ($candidate + $ext)
                if (Test-Path -Path $candidatePath) { return $true }
            }
        }
    }

    return $false
}

function New-VbComponentFromCodeFile {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$SanitizedAnsiPath
    )

    $componentType = switch ([System.IO.Path]::GetExtension($SourcePath).ToLowerInvariant()) {
        '.bas' { 1; break }
        '.cls' { 2; break }
        default { throw ("No se puede crear un componente nuevo desde extensión no soportada: {0}" -f $SourcePath) }
    }

    $newComponent = $null
    $newCodeModule = $null

    $seedComponentName = $null
    try {
        for ($i = 1; $i -le $VbProject.VBComponents.Count; $i++) {
            $candidateComponent = $VbProject.VBComponents.Item($i)
            try {
                if ([int]$candidateComponent.Type -eq $componentType -and $candidateComponent.Name -ne $ModuleName) {
                    $seedComponentName = [string]$candidateComponent.Name
                    break
                }
            } finally {
                if ($candidateComponent) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($candidateComponent) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
            }
        }
    } catch { Write-Debug "Diagnostics: $_" }

    try {
        $existingVariant = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
        if ($existingVariant) {
            throw ("Ya existe un componente VBA resoluble para '{0}' bajo el nombre '{1}'. Se aborta la creación para evitar duplicados." -f $ModuleName, $existingVariant)
        }

        if ($seedComponentName) {
            # acModule = 5. Access trata módulos estándar y clases bajo este tipo para CopyObject.
            $AccessApplication.DoCmd.CopyObject("", $ModuleName, 5, $seedComponentName)
            $resolvedClonedName = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
            if (-not $resolvedClonedName) {
                throw ("CopyObject devolvió sin error, pero no se encontró el componente clonado '{0}'." -f $ModuleName)
            }
            $newComponent = $VbProject.VBComponents.Item($resolvedClonedName)
        } else {
            $newComponent = $VbProject.VBComponents.Add($componentType)
            $newComponent.Name = $ModuleName
        }

        $newCodeModule = $newComponent.CodeModule
        $lineCount = $newCodeModule.CountOfLines
        if ($lineCount -gt 0) {
            $newCodeModule.DeleteLines(1, $lineCount)
        }
        $newCodeModule.AddFromFile($SanitizedAnsiPath)
        return [pscustomobject]@{
            CreatedNewComponent  = $true
            RequiresExplicitSave = (-not [bool]$seedComponentName)
            SeedComponentName    = $seedComponentName
        }
    } finally {
        foreach ($obj in @($newCodeModule, $newComponent)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        }
    }
}

function Save-VbaProjectModules {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)][string[]]$ModuleNames
    )

    try {
        # acCmdCompileAndSaveAllModules = 126
        $AccessApplication.RunCommand(126)
        return
    } catch { Write-Debug "Diagnostics: $_" }

    try {
        # acCmdSaveAllModules = 280
        $AccessApplication.DoCmd.RunCommand(280)
        return
    } catch { Write-Debug "Diagnostics: $_" }

    $failures = New-Object System.Collections.Generic.List[string]
    foreach ($moduleName in @($ModuleNames | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)) {
        try {
            $AccessApplication.DoCmd.OpenModule($moduleName)
            # acModule = 5 (Access.AcObjectType)
            $AccessApplication.DoCmd.Save(5, $moduleName)
        } catch {
            $failures.Add(("{0}: {1}" -f $moduleName, $_.Exception.Message)) | Out-Null
        }
    }

    if ($failures.Count -gt 0) {
        throw ("No se pudieron guardar explícitamente algunos módulos/clases nuevos: {0}" -f ([string]::Join("; ", $failures)))
    }
}

function Get-ActiveVbeLocation {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication
    )

    $componentName = $null
    $line = $null
    $column = $null
    $endLine = $null
    $endColumn = $null
    $sourceLine = $null

    try {
        $vbe = $AccessApplication.VBE
        $pane = $vbe.ActiveCodePane
        if ($pane) {
            $startLine = 0
            $startColumn = 0
            $selectedEndLine = 0
            $selectedEndColumn = 0
            try {
                $pane.GetSelection([ref]$startLine, [ref]$startColumn, [ref]$selectedEndLine, [ref]$selectedEndColumn)
                $line = [int]$startLine
                $column = [int]$startColumn
                $endLine = [int]$selectedEndLine
                $endColumn = [int]$selectedEndColumn
            } catch { Write-Debug "Diagnostics: $_" }

            try {
                $codeModule = $pane.CodeModule
                if ($codeModule) {
                    try { $componentName = [string]$codeModule.Parent.Name } catch { Write-Debug "Diagnostics: $_" }
                    if ($line -and $line -gt 0) {
                        try { $sourceLine = [string]$codeModule.Lines($line, 1) } catch { Write-Debug "Diagnostics: $_" }
                    }
                }
            } catch { Write-Debug "Diagnostics: $_" }
        }

        if (-not $componentName) {
            try {
                $selected = $vbe.SelectedVBComponent
                if ($selected) { $componentName = [string]$selected.Name }
            } catch { Write-Debug "Diagnostics: $_" }
        }
    } catch { Write-Debug "Diagnostics: $_" }

    return [pscustomobject]@{
        component  = $componentName
        line       = $line
        column     = $column
        endLine    = $endLine
        endColumn  = $endColumn
        sourceLine = $sourceLine
    }
}

function Invoke-CompileVbaProject {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication
    )

    try {
        # acCmdCompileAndSaveAllModules = 126
        $AccessApplication.RunCommand(126)
        return [pscustomobject]@{
            ok          = $true
            phase       = "compile"
            error       = $null
            component   = $null
            line        = $null
            column      = $null
            endLine     = $null
            endColumn   = $null
            sourceLine  = $null
        }
    } catch {
        $location = Get-ActiveVbeLocation -AccessApplication $AccessApplication
        return [pscustomobject]@{
            ok          = $false
            phase       = "compile"
            error       = $_.Exception.Message
            component   = $location.component
            line        = $location.line
            column      = $location.column
            endLine     = $location.endLine
            endColumn   = $location.endColumn
            sourceLine  = $location.sourceLine
        }
    }
}

function Import-VbaModule {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        $AccessApplication = $null,  # FIX: necesario para LoadFromText de formularios
        [ValidateSet("Auto", "Form", "Code")][string]$ImportMode = "Auto"
    )

    $src = Resolve-ImportFileForModule -ModulesPath $ModulesPath -ModuleName $ModuleName -ImportMode $ImportMode
    if (-not $src) { throw ("No se encontro archivo para el modulo '{0}' en {1}" -f $ModuleName, $ModulesPath) }

    $isDocumentTxt = ($src -match '\.(form|report)\.txt$')
    $isReportTxt = ($src -match '\.report\.txt$')
    $ext = [System.IO.Path]::GetExtension($src)
    $tmpAnsi = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("VBAManager_import_{0}{1}" -f @([guid]::NewGuid().ToString("N"), $ext))
    $tmpCanonical = $null
    $tmpAnsiSanitized = $null
    $component = $null
    $codeModule = $null

    try {
        # FIX: formularios/reportes usan LoadFromText — nunca VBComponents.Import
        if ($isDocumentTxt) {
            if (-not $AccessApplication) { throw "Se necesita -AccessApplication para importar documentos (.form.txt/.report.txt)" }
            $objectName = $ModuleName -replace '^(Form|Report)_', ''
            $objectType = if ($isReportTxt -or $ModuleName -match '^Report_') { 3 } else { 2 } # acReport=3, acForm=2
            $importDocumentText = [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8)

            $documentExistsInAccess = $false
            try {
                $documentKind = if ($objectType -eq 3) { "Reports" } else { "Forms" }
                $documentNames = @(Get-AccessObjectNames -AccessApplication $AccessApplication -Kind $documentKind)
                $documentExistsInAccess = @($documentNames | Where-Object { $_ -ieq $objectName } | Select-Object -First 1).Count -gt 0
            } catch {
                # Si no se pudo listar, mantenemos el comportamiento conservador anterior:
                # intentar SaveAsText y abortar si no puede reconstruir el header canónico.
                $documentExistsInAccess = $true
            }

            if ($documentExistsInAccess) {
                $tmpCanonical = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("VBAManager_import_canonical_{0}.txt" -f [guid]::NewGuid().ToString("N"))
                try {
                    $AccessApplication.SaveAsText($objectType, $objectName, $tmpCanonical)
                    if (Test-Path -Path $tmpCanonical) {
                        $canonicalDocumentText = [System.IO.File]::ReadAllText($tmpCanonical, [System.Text.Encoding]::GetEncoding(1252))
                        if ([string]::IsNullOrWhiteSpace($canonicalDocumentText)) {
                            throw "SaveAsText devolvió un documento canónico vacío."
                        }
                        $importDocumentText = Merge-AccessDocumentWithCanonicalHeader -LocalDocumentText $importDocumentText -CanonicalDocumentText $canonicalDocumentText
                    }
                } catch {
                    throw ("No se pudo reconstruir el header canónico desde Access para '{0}': {1}. Se aborta el import para evitar usar un header local potencialmente desactualizado." -f $objectName, $_.Exception.Message)
                }
            } else {
                Write-Status -Message ("WARN: '{0}' no existe en Access; se importará como documento nuevo usando el .form.txt/.report.txt local." -f $objectName) -Color DarkYellow
            }
            $importDocumentText = Normalize-AccessDocumentTextForLoadFromText -DocumentText $importDocumentText
            $documentKindLabel = if ($objectType -eq 3) { "Report" } else { "Form" }
            Assert-AccessDocumentTextLooksLoadable -DocumentText $importDocumentText -Kind $documentKindLabel -SourcePath $src

            [System.IO.File]::WriteAllText($tmpAnsi, $importDocumentText, [System.Text.Encoding]::GetEncoding(1252))
            try { $AccessApplication.DoCmd.SetWarnings($false) } catch { Write-Debug "Diagnostics: $_" }
            # Cerrar el documento si esta abierto — LoadFromText falla con "Cancelo la operacion anterior" si no
            try { $AccessApplication.DoCmd.Close($objectType, $objectName, 1) } catch { Write-Debug "Diagnostics: $_" }  # acSaveNo=1

            $importErrorsPath = $null
            try {
                $currentDb = $AccessApplication.CurrentDb()
                if ($currentDb -and $currentDb.Name) {
                    $importErrorsPath = Join-Path -Path (Split-Path -Path $currentDb.Name -Parent) -ChildPath "errors.txt"
                    if (Test-Path -LiteralPath $importErrorsPath) {
                        Remove-Item -LiteralPath $importErrorsPath -Force -ErrorAction SilentlyContinue
                    }
                }
            } catch { Write-Debug "Diagnostics: $_" }

            try {
                $AccessApplication.LoadFromText($objectType, $objectName, $tmpAnsi)
            } catch {
                $detail = $null
                if ($importErrorsPath -and (Test-Path -LiteralPath $importErrorsPath)) {
                    try { $detail = [System.IO.File]::ReadAllText($importErrorsPath, [System.Text.Encoding]::GetEncoding(1252)) } catch { Write-Debug "Diagnostics: $_" }
                }
                if ($detail) {
                    throw ("LoadFromText falló para '{0}'. Detalle de errors.txt: {1}" -f $objectName, ($detail.Trim()))
                }
                throw
            }

            return [pscustomobject]@{
                CreatedNewComponent  = $false
                RequiresExplicitSave = $false
            }
        }

        # FIX: modulos y clases — DeleteLines + AddFromFile como primera opcion
        # Evita VBComponents.Remove() que puede disparar dialogo VBE en instancias visibles
        Convert-Utf8ToAnsiTempFile -InputPath $src -TempPath $tmpAnsi
        $tmpAnsiSanitized = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("VBAManager_import_sanitized_{0}{1}" -f @([guid]::NewGuid().ToString("N"), $ext))
        Convert-Utf8CodeImportToAnsiTempFile -InputPath $src -TempPath $tmpAnsiSanitized
        $actualComponentName = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
        $looksLikeDocumentCode = ($ImportMode -ne "Form") -and ($ext -ieq '.cls') -and (Test-LooksLikeDocumentCodeTarget -ModuleName $ModuleName -SourcePath $src -ModulesPath $ModulesPath)
        try {
            if (-not $actualComponentName) {
                if ($looksLikeDocumentCode) {
                    throw ("Import bloqueado: '{0}' parece code-behind de formulario/reporte, pero no se resolvio un document module existente en la BD. " +
                           "Se prohibe importar este .cls como modulo/clase nueva porque Access acabaria creando 'Módulo1', 'Módulo2', etc. " +
                           "Primero exporta/sincroniza el formulario correcto o usa el nombre real del document module (por ejemplo 'Form_{1}')." -f
                           $ModuleName, ($ModuleName -replace '^(Form|Report)_', ''))
                }
                throw "COMPONENTE_NO_ENCONTRADO"
            }

            $component = $VbProject.VBComponents.Item($actualComponentName)
            $codeModule = $component.CodeModule
            $count = $codeModule.CountOfLines
            if ($count -gt 0) { $codeModule.DeleteLines(1, $count) }
            $codeModule.AddFromFile($tmpAnsiSanitized)
            return [pscustomobject]@{
                CreatedNewComponent  = $false
                RequiresExplicitSave = $false
            }
        } catch {
            if ($_.Exception.Message -ne 'COMPONENTE_NO_ENCONTRADO') {
                throw
            }

            if ($looksLikeDocumentCode) {
                throw ("Import bloqueado: '{0}' parece code-behind de formulario/reporte, pero no existe un document module resoluble en la BD. " +
                       "Se cancela para evitar crear módulos espurios como 'Módulo1' o 'Módulo2'. " +
                       "Usa 'import'/'import-form' según el caso o corrige el nombre del formulario/document module." -f $ModuleName)
            }

            # El componente no existe aun — crear explícitamente SOLO para clases/modulos normales.
            # Evita prompts/modales de VBE asociados a VBComponents.Import() y mantiene control del nombre final.
            return (New-VbComponentFromCodeFile -AccessApplication $AccessApplication -VbProject $VbProject -ModuleName $ModuleName -SourcePath $src -SanitizedAnsiPath $tmpAnsiSanitized)
        }

    } finally {
        if ($tmpAnsi -and (Test-Path -Path $tmpAnsi)) { Remove-Item -Path $tmpAnsi -Force -ErrorAction SilentlyContinue }
        if ($tmpCanonical -and (Test-Path -Path $tmpCanonical)) { Remove-Item -Path $tmpCanonical -Force -ErrorAction SilentlyContinue }
        if ($tmpAnsiSanitized -and (Test-Path -Path $tmpAnsiSanitized)) { Remove-Item -Path $tmpAnsiSanitized -Force -ErrorAction SilentlyContinue }
        foreach ($obj in @($codeModule, $component)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        }
    }
}

function Fix-EncodingInSrc {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [string[]]$ModuleName
    )

    $targets = @()
    if ($ModuleName -and $ModuleName.Count -gt 0) {
        foreach ($m in $ModuleName) {
            $f = Resolve-ImportFileForModule -ModulesPath $ModulesPath -ModuleName $m
            if ($f) { $targets += $f }
        }
    } else {
        $targets = @(Get-ChildItem -Path $ModulesPath -Recurse -File -Include "*.bas", "*.cls", "*.frm", "*.form.txt" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
    }

    $fixed = 0
    foreach ($p in $targets) {
        $utf8 = [System.Text.Encoding]::UTF8
        $text = [System.IO.File]::ReadAllText($p, $utf8)
        $info = Get-FileEncodingInfo -Path $p
        if ($info.HasUtf8Bom) {
            Write-Utf8NoBom -Path $p -Text $text
            $fixed++
        }
    }
    return $fixed
}

function Export-DataStructure {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$DatabasePath,
        [Parameter(Mandatory = $true)][string]$OutputPath,
        [string]$Password = ""
    )

    $dbEngine = $null
    $database = $null

    $typeMap = @{
        1 = "Boolean"; 2 = "Byte"; 3 = "Integer"; 4 = "Long"; 5 = "Currency"
        6 = "Single"; 7 = "Double"; 8 = "Date/Time"; 9 = "Binary"; 10 = "Text"
        11 = "OLE"; 12 = "Memo"; 15 = "GUID"; 16 = "BigInt"
        17 = "VarBinary"; 18 = "Char"; 19 = "Numeric"; 20 = "Decimal"
    }

    try {
        $dbEngine = New-DaoDbEngine
        if (-not $dbEngine) { throw "No se pudo crear DAO.DBEngine" }

        $connect = if (-not [string]::IsNullOrEmpty($Password)) { ";PWD=$Password" } else { "" }
        $database = $dbEngine.OpenDatabase($DatabasePath, $false, $true, $connect)

        $sb = [System.Text.StringBuilder]::new()
        $dbName = [System.IO.Path]::GetFileNameWithoutExtension($DatabasePath)
        [void]$sb.AppendLine("# ERD - $dbName")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("Generado: $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
        [void]$sb.AppendLine("")

        $tableDefs = $database.TableDefs
        $tables = @()
        for ($i = 0; $i -lt $tableDefs.Count; $i++) {
            $td = $tableDefs[$i]
            try {
                if ($td.Name -notmatch "^MSys" -and $td.Name -notmatch "^~") {
                    $tables += $td.Name
                }
            } catch { Write-Debug "Diagnostics: $_" }
        }
        $tables = $tables | Sort-Object

        [void]$sb.AppendLine("## Tablas ($($tables.Count))")
        [void]$sb.AppendLine("")

        foreach ($tableName in $tables) {
            try {
                $td = $database.TableDefs[$tableName]
                [void]$sb.AppendLine("### $tableName")
                [void]$sb.AppendLine("")
                [void]$sb.AppendLine("| Campo | Tipo | Tamaño | Requerido | PK |")
                [void]$sb.AppendLine("|---|---|---|---|---|")

                $pkFields = @()
                try {
                    for ($i = 0; $i -lt $td.Indexes.Count; $i++) {
                        $idx = $td.Indexes[$i]
                        if ($idx.Primary) {
                            for ($j = 0; $j -lt $idx.Fields.Count; $j++) {
                                $pkFields += $idx.Fields[$j].Name
                            }
                        }
                    }
                } catch { Write-Debug "Diagnostics: $_" }

                for ($i = 0; $i -lt $td.Fields.Count; $i++) {
                    try {
                        $field = $td.Fields[$i]
                        $typeCode = [int]$field.Type
                        $typeName = if ($typeMap.ContainsKey($typeCode)) { $typeMap[$typeCode] } else { "Tipo$typeCode" }
                        $size = if ($field.Size -gt 0) { $field.Size } else { "-" }
                        $required = if ($field.Required) { "Si" } else { "No" }
                        $isPk = if ($pkFields -contains $field.Name) { "PK" } else { "" }
                        [void]$sb.AppendLine("| $($field.Name) | $typeName | $size | $required | $isPk |")
                    } catch { Write-Debug "Diagnostics: $_" }
                }
                [void]$sb.AppendLine("")
            } catch {
                [void]$sb.AppendLine("_Error leyendo tabla: $tableName - $($_.Exception.Message)_")
                [void]$sb.AppendLine("")
            }
        }

        try {
            $relations = $database.Relations
            if ($relations.Count -gt 0) {
                [void]$sb.AppendLine("## Relaciones")
                [void]$sb.AppendLine("")
                [void]$sb.AppendLine("| Nombre | Tabla origen | Campo origen | Tabla destino | Campo destino |")
                [void]$sb.AppendLine("|---|---|---|---|---|")

                for ($i = 0; $i -lt $relations.Count; $i++) {
                    try {
                        $rel = $relations[$i]
                        $originField = ""
                        $foreignField = ""
                        if ($rel.Fields.Count -gt 0) {
                            $rf = $rel.Fields[0]
                            $originField = $rf.Name
                            $foreignField = $rf.ForeignName
                        }
                        [void]$sb.AppendLine("| $($rel.Name) | $($rel.Table) | $originField | $($rel.ForeignTable) | $foreignField |")
                    } catch { Write-Debug "Diagnostics: $_" }
                }
                [void]$sb.AppendLine("")
            }
        } catch { Write-Debug "Diagnostics: $_" }

        # FIX: renombrada $tdConnect para no sobreescribir $connect del scope exterior
        $linkedSources = @{}
        for ($i = 0; $i -lt $tableDefs.Count; $i++) {
            $td = $tableDefs[$i]
            try {
                $tdConnect = $td.Connect
                if (-not [string]::IsNullOrEmpty($tdConnect) -and $tdConnect -match ";DATABASE=(.+)$") {
                    $linkedDbPath = $Matches[1].Trim()
                    if (-not $linkedSources.ContainsKey($linkedDbPath)) {
                        $linkedSources[$linkedDbPath] = [System.Collections.Generic.List[string]]::new()
                    }
                    $linkedSources[$linkedDbPath].Add($td.Name)
                }
            } catch { Write-Debug "Diagnostics: $_" }
        }

        $unreachableBackends = @($linkedSources.Keys | Where-Object { -not (Test-Path -Path $_) })
        if ($unreachableBackends.Count -gt 0) {
            [void]$sb.AppendLine("## Backends vinculados no alcanzados")
            [void]$sb.AppendLine("")
            [void]$sb.AppendLine("Las siguientes bases de datos vinculadas no estaban disponibles al generar este ERD.")
            [void]$sb.AppendLine("Sus tablas aparecen en el listado de tablas pero su estructura no pudo verificarse.")
            [void]$sb.AppendLine("")
            foreach ($linkedPath in $unreachableBackends) {
                $linkedTables = $linkedSources[$linkedPath] -join ", "
                [void]$sb.AppendLine("- ``$linkedPath`` - tablas vinculadas: $linkedTables")
            }
            [void]$sb.AppendLine("")
        }

        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($OutputPath, $sb.ToString(), $utf8NoBom)

    } finally {
        if ($database) {
            try { $database.Close() } catch { Write-Debug "Diagnostics: $_" }
            try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($database) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
        }
        if ($dbEngine) {
            try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
        }
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
}

function Fix-EncodingInAccess {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [string[]]$ModuleName,
        $AccessApplication = $null
    )

    $components = $VbProject.VBComponents
    $names = @()

    if ($ModuleName -and $ModuleName.Count -gt 0) {
        $names = @($ModuleName | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    } else {
        for ($i = 1; $i -le $components.Count; $i++) {
            $c = $components.Item($i)
            try {
                $type = [int]$c.Type
                if ($type -ne 1 -and $type -ne 2 -and $type -ne 100 -and $type -ne 3) { continue }
                $ext = Get-ComponentExtension -Component $c -ModuleName $c.Name
                if ($ext) { $names += $c.Name }
            } finally {
                try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($c) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
            }
        }
    }

    $fixed = 0
    foreach ($n in $names | Sort-Object -Unique) {
        try {
            Export-VbaModule -VbProject $VbProject -ModuleName $n -ModulesPath $ModulesPath -AccessApplication $AccessApplication
            Import-VbaModule -VbProject $VbProject -ModuleName $n -ModulesPath $ModulesPath -AccessApplication $AccessApplication
            $fixed++
        } catch {
            Write-Status -Message ("ERROR en modulo '{0}': {1}" -f $n, $_.Exception.Message) -Color Red
        }
    }
    return $fixed
}

function Convert-ProcedureArgsJson {
    [CmdletBinding()]
    Param(
        [string]$JsonText
    )

    if ([string]::IsNullOrWhiteSpace($JsonText)) { return @() }

    try {
        $parsed = ConvertFrom-Json -InputObject $JsonText -ErrorAction Stop
    } catch {
        throw ("No se pudo interpretar -ProcedureArgsJson: {0}" -f $_.Exception.Message)
    }

    if ($null -eq $parsed) { return @($null) }
    if (-not ($parsed -is [System.Collections.IEnumerable]) -or ($parsed -is [string])) {
        throw "-ProcedureArgsJson debe ser un array JSON. Ejemplo: [123, `"texto`", true]"
    }

    $args = @()
    foreach ($value in @($parsed)) {
        if ($null -eq $value -or $value -is [string] -or $value -is [bool] -or $value -is [byte] -or $value -is [int16] -or $value -is [int32] -or $value -is [int64] -or $value -is [single] -or $value -is [double] -or $value -is [decimal]) {
            $args += $value
        } else {
            throw "-ProcedureArgsJson solo soporta valores simples: string, number, boolean o null."
        }
    }
    return $args
}

function Convert-RunReturnValue {
    Param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [string] -or $Value -is [bool] -or $Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or $Value -is [int64] -or $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]) {
        return $Value
    }
    return [string]$Value
}

function Convert-RunReturnPayload {
    Param($ReturnValue)

    $payload = $null
    $logs = @()
    $payloadOk = $null
    $payloadError = $null

    if ($ReturnValue -is [string] -and -not [string]::IsNullOrWhiteSpace($ReturnValue)) {
        $trimmed = $ReturnValue.Trim()
        if ($trimmed.StartsWith("{") -or $trimmed.StartsWith("[")) {
            try {
                $payload = ConvertFrom-Json -InputObject $trimmed -ErrorAction Stop
            } catch {
                $payload = $null
            }
        }
    }

    if ($null -ne $payload -and $payload.PSObject -and $payload.PSObject.Properties) {
        if ($payload.PSObject.Properties.Name -contains "logs") {
            if ($payload.logs -is [System.Collections.IEnumerable] -and -not ($payload.logs -is [string])) {
                $logs = @($payload.logs | ForEach-Object { [string]$_ })
            } elseif ($null -ne $payload.logs) {
                $logs = @([string]$payload.logs)
            }
        } elseif ($payload.PSObject.Properties.Name -contains "log" -and $null -ne $payload.log) {
            $logs = @([string]$payload.log)
        }

        if ($payload.PSObject.Properties.Name -contains "ok" -and $null -ne $payload.ok) {
            try { $payloadOk = [bool]$payload.ok } catch { $payloadOk = $null }
        }

        foreach ($name in @("error", "message", "mensaje")) {
            if ($payload.PSObject.Properties.Name -contains $name -and $null -ne $payload.PSObject.Properties[$name].Value) {
                $payloadError = [string]$payload.PSObject.Properties[$name].Value
                break
            }
        }
    }

    return [pscustomobject]@{
        payload      = $payload
        logs         = @($logs)
        payloadOk    = $payloadOk
        payloadError = $payloadError
    }
}

function Join-VbaLogicalLines {
    [CmdletBinding()]
    Param(
        [AllowNull()][string]$SourceText
    )

    if ([string]::IsNullOrEmpty($SourceText)) { return @() }

    $logicalLines = @()
    $current = ""
    foreach ($rawLine in ($SourceText -split "`r?`n")) {
        $line = [string]$rawLine
        $trimmedEnd = $line.TrimEnd()
        $continues = $trimmedEnd.EndsWith("_")
        if ($continues) {
            $trimmedEnd = $trimmedEnd.Substring(0, $trimmedEnd.Length - 1).TrimEnd()
        }

        if ([string]::IsNullOrWhiteSpace($current)) {
            $current = $trimmedEnd
        } else {
            $current = ($current.TrimEnd() + " " + $trimmedEnd.TrimStart())
        }

        if (-not $continues) {
            $logicalLines += $current
            $current = ""
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($current)) { $logicalLines += $current }
    return @($logicalLines)
}

function Split-VbaParameterList {
    [CmdletBinding()]
    Param(
        [AllowNull()][string]$ParameterList
    )

    if ([string]::IsNullOrWhiteSpace($ParameterList)) { return @() }

    $parts = @()
    $start = 0
    $depth = 0
    for ($i = 0; $i -lt $ParameterList.Length; $i++) {
        $ch = $ParameterList[$i]
        if ($ch -eq "(") { $depth++ }
        elseif ($ch -eq ")" -and $depth -gt 0) { $depth-- }
        elseif ($ch -eq "," -and $depth -eq 0) {
            $parts += $ParameterList.Substring($start, $i - $start).Trim()
            $start = $i + 1
        }
    }
    $parts += $ParameterList.Substring($start).Trim()
    return @($parts | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Get-VbaProcedureParameterMetadataFromText {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$SourceText,
        [Parameter(Mandatory = $true)][string]$ProcedureName
    )

    $escapedName = [regex]::Escape($ProcedureName)
    foreach ($line in (Join-VbaLogicalLines -SourceText $SourceText)) {
        $code = ([string]$line) -replace "\s+'.*$", ""
        $match = [regex]::Match($code, "^\s*(?:Public\s+|Private\s+|Friend\s+)?(?:Static\s+)?(?:Function|Sub)\s+$escapedName\s*\((?<params>.*)\)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if (-not $match.Success) { continue }

        $params = @()
        foreach ($part in (Split-VbaParameterList -ParameterList $match.Groups["params"].Value)) {
            $p = $part -replace "\s*=.*$", ""
            $m = [regex]::Match($p, "^\s*(?:Optional\s+)?(?<modifier>ByVal|ByRef)?\s*(?:ParamArray\s+)?(?<name>[A-Za-z_][A-Za-z0-9_]*)\b", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            if (-not $m.Success) { continue }

            $modifier = $m.Groups["modifier"].Value
            $isOptional = [regex]::IsMatch($p, "^\s*Optional\b", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            $isByRef = $true
            if ($modifier -and $modifier.Equals("ByVal", [System.StringComparison]::OrdinalIgnoreCase)) {
                $isByRef = $false
            }

            $params += [pscustomobject]@{
                name     = $m.Groups["name"].Value
                byRef    = [bool]$isByRef
                optional = [bool]$isOptional
                raw      = $part
            }
        }
        return @($params)
    }
    return @()
}

function Get-VbaProcedureParameterMetadata {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ProcedureName
    )

    try {
        $components = $VbProject.VBComponents
        for ($i = 1; $i -le $components.Count; $i++) {
            $component = $components.Item($i)
            try {
                $codeModule = $component.CodeModule
                if ($null -eq $codeModule -or $codeModule.CountOfLines -le 0) { continue }
                $source = $codeModule.Lines(1, $codeModule.CountOfLines)
                $metadata = @(Get-VbaProcedureParameterMetadataFromText -SourceText $source -ProcedureName $ProcedureName)
                if ($metadata.Count -gt 0) { return @($metadata) }
            } finally {
                try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
            }
        }
    } catch {
        return @()
    }
    return @()
}

function Invoke-AccessApplicationRunByRefIndex {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)][string]$ProcedureName,
        [object[]]$InvokeArgs = @(),
        [AllowNull()][System.Nullable[int]]$ByRefIndex = $null
    )

    if ($null -eq $ByRefIndex -or $ByRefIndex -lt 0) {
        switch ($InvokeArgs.Count) {
            0 { return $AccessApplication.Run($ProcedureName) }
            1 { return $AccessApplication.Run($ProcedureName, $InvokeArgs[0]) }
            2 { return $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1]) }
            3 { return $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2]) }
            4 { return $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2], $InvokeArgs[3]) }
            5 { return $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2], $InvokeArgs[3], $InvokeArgs[4]) }
            6 { return $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2], $InvokeArgs[3], $InvokeArgs[4], $InvokeArgs[5]) }
            7 { return $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2], $InvokeArgs[3], $InvokeArgs[4], $InvokeArgs[5], $InvokeArgs[6]) }
            8 { return $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2], $InvokeArgs[3], $InvokeArgs[4], $InvokeArgs[5], $InvokeArgs[6], $InvokeArgs[7]) }
            9 { return $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2], $InvokeArgs[3], $InvokeArgs[4], $InvokeArgs[5], $InvokeArgs[6], $InvokeArgs[7], $InvokeArgs[8]) }
            10 { return $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2], $InvokeArgs[3], $InvokeArgs[4], $InvokeArgs[5], $InvokeArgs[6], $InvokeArgs[7], $InvokeArgs[8], $InvokeArgs[9]) }
        }
    }

    switch ($ByRefIndex) {
        0 {
            switch ($InvokeArgs.Count) {
                1 { $arg0 = $InvokeArgs[0]; $r = $AccessApplication.Run($ProcedureName, [ref]$arg0); $InvokeArgs[0] = $arg0; return $r }
                2 { $arg0 = $InvokeArgs[0]; $r = $AccessApplication.Run($ProcedureName, [ref]$arg0, $InvokeArgs[1]); $InvokeArgs[0] = $arg0; return $r }
                3 { $arg0 = $InvokeArgs[0]; $r = $AccessApplication.Run($ProcedureName, [ref]$arg0, $InvokeArgs[1], $InvokeArgs[2]); $InvokeArgs[0] = $arg0; return $r }
                4 { $arg0 = $InvokeArgs[0]; $r = $AccessApplication.Run($ProcedureName, [ref]$arg0, $InvokeArgs[1], $InvokeArgs[2], $InvokeArgs[3]); $InvokeArgs[0] = $arg0; return $r }
                5 { $arg0 = $InvokeArgs[0]; $r = $AccessApplication.Run($ProcedureName, [ref]$arg0, $InvokeArgs[1], $InvokeArgs[2], $InvokeArgs[3], $InvokeArgs[4]); $InvokeArgs[0] = $arg0; return $r }
            }
        }
        1 {
            switch ($InvokeArgs.Count) {
                2 { $arg1 = $InvokeArgs[1]; $r = $AccessApplication.Run($ProcedureName, $InvokeArgs[0], [ref]$arg1); $InvokeArgs[1] = $arg1; return $r }
                3 { $arg1 = $InvokeArgs[1]; $r = $AccessApplication.Run($ProcedureName, $InvokeArgs[0], [ref]$arg1, $InvokeArgs[2]); $InvokeArgs[1] = $arg1; return $r }
                4 { $arg1 = $InvokeArgs[1]; $r = $AccessApplication.Run($ProcedureName, $InvokeArgs[0], [ref]$arg1, $InvokeArgs[2], $InvokeArgs[3]); $InvokeArgs[1] = $arg1; return $r }
                5 { $arg1 = $InvokeArgs[1]; $r = $AccessApplication.Run($ProcedureName, $InvokeArgs[0], [ref]$arg1, $InvokeArgs[2], $InvokeArgs[3], $InvokeArgs[4]); $InvokeArgs[1] = $arg1; return $r }
            }
        }
        2 {
            switch ($InvokeArgs.Count) {
                3 { $arg2 = $InvokeArgs[2]; $r = $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], [ref]$arg2); $InvokeArgs[2] = $arg2; return $r }
                4 { $arg2 = $InvokeArgs[2]; $r = $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], [ref]$arg2, $InvokeArgs[3]); $InvokeArgs[2] = $arg2; return $r }
                5 { $arg2 = $InvokeArgs[2]; $r = $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], [ref]$arg2, $InvokeArgs[3], $InvokeArgs[4]); $InvokeArgs[2] = $arg2; return $r }
            }
        }
        3 {
            switch ($InvokeArgs.Count) {
                4 { $arg3 = $InvokeArgs[3]; $r = $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2], [ref]$arg3); $InvokeArgs[3] = $arg3; return $r }
                5 { $arg3 = $InvokeArgs[3]; $r = $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2], [ref]$arg3, $InvokeArgs[4]); $InvokeArgs[3] = $arg3; return $r }
            }
        }
        4 {
            if ($InvokeArgs.Count -eq 5) { $arg4 = $InvokeArgs[4]; $r = $AccessApplication.Run($ProcedureName, $InvokeArgs[0], $InvokeArgs[1], $InvokeArgs[2], $InvokeArgs[3], [ref]$arg4); $InvokeArgs[4] = $arg4; return $r }
        }
    }

    throw "Run-Procedure no soporta fallback ByRef automático para $($InvokeArgs.Count) argumento(s) con ByRef en índice $ByRefIndex."
}

function Get-PSReferenceArgumentIndexFromError {
    [CmdletBinding()]
    Param(
        [AllowNull()][string]$Message,
        [int]$ArgumentCount
    )

    if ([string]::IsNullOrWhiteSpace($Message)) { return $null }
    if ($Message -notmatch "PSReference" -and $Message -notmatch "Use\s+\[ref\]") { return $null }

    $match = [regex]::Match($Message, "(?:Argumento|Argument)\s*:\s*'(?<index>\d+)'", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $match.Success) { return $null }

    $raw = [int]$match.Groups["index"].Value
    $oneBased = $raw - 1
    if ($oneBased -ge 0 -and $oneBased -lt $ArgumentCount) { return $oneBased }
    if ($raw -ge 0 -and $raw -lt $ArgumentCount) { return $raw }
    return $null
}

function Invoke-AccessProcedure {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)][string]$ProcedureName,
        [object[]]$ProcedureArgs = @(),
        $VbProject = $null
    )

    if ([string]::IsNullOrWhiteSpace($ProcedureName)) {
        throw "Run-Procedure requiere -ProcedureName."
    }
    if ($ProcedureArgs.Count -gt 10) {
        throw "Run-Procedure soporta hasta 10 argumentos simples."
    }

    try {
        $metadata = @()
        if ($null -ne $VbProject) {
            $metadata = @(Get-VbaProcedureParameterMetadata -VbProject $VbProject -ProcedureName $ProcedureName)
        }

        # VBA permite omitir Optional ByRef desde la Ventana Inmediata, pero
        # Access.Application.Run vía PowerShell COM necesita un PSReference real.
        # Si la firma termina en Optional ByRef p_Error As String (patrón canónico),
        # completamos automáticamente el argumento con "" para poder envolverlo
        # luego con [ref]. Esto evita que test-vba falle por manifests sin args.
        if ($metadata.Count -gt $ProcedureArgs.Count) {
            $effectiveArgs = New-Object System.Collections.Generic.List[object]
            foreach ($arg in @($ProcedureArgs)) { $effectiveArgs.Add($arg) | Out-Null }
            for ($i = $ProcedureArgs.Count; $i -lt $metadata.Count; $i++) {
                $param = $metadata[$i]
                if ($null -ne $param -and $param.optional -and $param.byRef) {
                    $effectiveArgs.Add("") | Out-Null
                    continue
                }
                break
            }
            $ProcedureArgs = [object[]]$effectiveArgs.ToArray()
        }

        $invokeArgs = @()
        $byRefArgs = @{}
        $byRefIndexes = @()
        for ($i = 0; $i -lt $ProcedureArgs.Count; $i++) {
            $param = if ($i -lt $metadata.Count) { $metadata[$i] } else { $null }
            if ($null -ne $param -and $param.byRef) {
                $invokeArgs += $ProcedureArgs[$i]
                $name = if (-not [string]::IsNullOrWhiteSpace($param.name)) { [string]$param.name } else { "arg$($i + 1)" }
                $byRefIndexes += $i
                $byRefArgs[$i] = [pscustomobject]@{ name = $name }
            } else {
                $invokeArgs += $ProcedureArgs[$i]
            }
        }
        foreach ($key in @($byRefArgs.Keys)) {
            while ($invokeArgs.Count -le [int]$key) {
                $invokeArgs += ""
            }
        }

        $result = $null
        $ran = $false
        for ($attempt = 0; $attempt -le $ProcedureArgs.Count; $attempt++) {
            try {
                if ($invokeArgs.Count -eq 3 -and $byRefArgs.ContainsKey(1) -and $byRefArgs.ContainsKey(2)) {
                    [string]$arg0 = [string]$invokeArgs[0]
                    [string]$arg1 = [string]$invokeArgs[1]
                    [string]$arg2 = [string]$invokeArgs[2]
                    $result = $AccessApplication.Run($ProcedureName, [ref]$arg0, [ref]$arg1, [ref]$arg2)
                    $invokeArgs[0] = $arg0
                    $invokeArgs[1] = $arg1
                    $invokeArgs[2] = $arg2
                } else {
                    $currentByRefIndexes = @($byRefArgs.Keys)
                    $byRefIndex = if ($currentByRefIndexes.Count -eq 1) { [int]$currentByRefIndexes[0] } else { $null }
                    $result = Invoke-AccessApplicationRunByRefIndex -AccessApplication $AccessApplication -ProcedureName $ProcedureName -InvokeArgs $invokeArgs -ByRefIndex $byRefIndex
                }
                $ran = $true
                break
            } catch {
                $retryIndex = Get-PSReferenceArgumentIndexFromError -Message $_.Exception.Message -ArgumentCount $ProcedureArgs.Count
                if ($null -eq $retryIndex -or $byRefArgs.ContainsKey($retryIndex)) { throw }

                $param = if ($retryIndex -lt $metadata.Count) { $metadata[$retryIndex] } else { $null }
                $name = if ($null -ne $param -and -not [string]::IsNullOrWhiteSpace($param.name)) { [string]$param.name } elseif ($retryIndex -eq ($ProcedureArgs.Count - 1)) { "p_Error" } else { "arg$($retryIndex + 1)" }
                $byRefArgs[$retryIndex] = [pscustomobject]@{ name = $name }
            }
        }
        if (-not $ran) {
            throw "No se pudo ejecutar $ProcedureName tras reintentos ByRef."
        }

        $byRefValues = [ordered]@{}
        foreach ($key in $byRefArgs.Keys) {
            $entry = $byRefArgs[$key]
            $byRefValues[$entry.name] = Convert-RunReturnValue -Value $invokeArgs[[int]$key]
        }

        $returnType = if ($null -eq $result) { $null } else { $result.GetType().FullName }
        $returnValue = Convert-RunReturnValue -Value $result
        $decoded = Convert-RunReturnPayload -ReturnValue $returnValue
        $ok = $true
        if ($null -ne $decoded.payloadOk) { $ok = [bool]$decoded.payloadOk }
        $errorText = $null
        if (-not $ok) { $errorText = $decoded.payloadError }
        return [pscustomobject]@{
            ok          = $ok
            procedure   = $ProcedureName
            argsCount   = [int]$ProcedureArgs.Count
            returnValue = $returnValue
            returnType  = $returnType
            byref_values = [pscustomobject]$byRefValues
            payload     = $decoded.payload
            logs        = @($decoded.logs)
            error       = $errorText
        }
    } catch {
        return [pscustomobject]@{
            ok          = $false
            procedure   = $ProcedureName
            argsCount   = [int]$ProcedureArgs.Count
            returnValue = $null
            returnType  = $null
            byref_values = [pscustomobject]@{}
            payload     = $null
            logs        = @()
            error       = $_.Exception.Message
        }
    }
}

function Invoke-AccessProcedureBatch {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)][object[]]$Procedures,
        $VbProject = $null
    )
    $list = [System.Collections.Generic.List[object]]::new()
    for ($i = 0; $i -lt $Procedures.Count; $i++) {
        $proc = $Procedures[$i]
        $name = [string]($proc.procedure)
        $procArgs = @()
        if ($null -ne $proc.PSObject.Properties.Item("args") -and $null -ne $proc.args) {
            $procArgs = @($proc.args)
        }
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $r = Invoke-AccessProcedure -AccessApplication $AccessApplication -VbProject $VbProject -ProcedureName $name -ProcedureArgs $procArgs
        $sw.Stop()
        try {
            $r | Add-Member -NotePropertyName durationMs -NotePropertyValue ([int64]$sw.ElapsedMilliseconds) -Force
        } catch { Write-Debug "Diagnostics: $_" }
        $list.Add($r)
    }
    return , @($list)
}

$session = $null
$importCreatedNewComponents = $false

try {
    $DestinationRoot = Resolve-DestinationRoot -DestinationRoot $DestinationRoot

    if ($Action -ne "Generate-ERD") {
        $AccessPath = Resolve-AccessPath -AccessPath $AccessPath
        if ($Action -ne "Run-Tests") {
            $ModulesPath = Resolve-ModulesPath -DestinationRoot $DestinationRoot -AccessPath $AccessPath -Action $Action
        }
        if (-not $Json) {
            Write-Status -Message ("Accion: {0}" -f $Action) -Color Yellow
            Write-Status -Message ("Base de datos: {0}" -f $AccessPath) -Color Yellow
            if (-not [string]::IsNullOrWhiteSpace($ModulesPath)) {
                Write-Status -Message ("Carpeta: {0}" -f $ModulesPath) -Color Yellow
            }
        }
    } else {
        if (-not $Json) {
            Write-Status -Message ("Accion: {0}" -f $Action) -Color Yellow
        }
    }

    # Prefer JSON transport to preserve nombres con comas u otros caracteres.
    $inputModules = $ModuleName
    if (-not [string]::IsNullOrWhiteSpace($ModuleNamesJson)) {
        try {
            $jsonModules = ConvertFrom-Json -InputObject $ModuleNamesJson -ErrorAction Stop
            if ($jsonModules -is [System.Collections.IEnumerable] -and -not ($jsonModules -is [string])) {
                $inputModules = @($jsonModules | ForEach-Object { [string]$_ })
            } elseif ($null -ne $jsonModules) {
                $inputModules = @([string]$jsonModules)
            }
        } catch {
            throw ("No se pudo interpretar -ModuleNamesJson: {0}" -f $_.Exception.Message)
        }
    }
    $normalizedModules = @($inputModules | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    if ($Action -eq "Export") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        $vbProject = $session.VbProject
        $components = $vbProject.VBComponents

        $targets = @()
        if ($normalizedModules.Count -gt 0) {
            $targets = $normalizedModules
            # Validate every requested module exists in VBProject before exporting any
            foreach ($requestedName in $targets) {
                $found = $false
                try {
                    $null = $vbProject.VBComponents.Item($requestedName)
                    $found = $true
                } catch {
                    $baseName = $requestedName -replace '^(Form|Report)_', ''
                    foreach ($candidate in @("Form_$baseName", "Report_$baseName")) {
                        try { $null = $vbProject.VBComponents.Item($candidate); $found = $true; break } catch { Write-Debug "Diagnostics: $_" }
                    }
                }
                if (-not $found) {
                    throw ("VBA_MODULE_NOT_FOUND: El modulo '{0}' no existe en el proyecto VBA." -f $requestedName)
                }
            }
        } else {
            for ($i = 1; $i -le $components.Count; $i++) {
                $c = $components.Item($i)
                try {
                    $ext = Get-ComponentExtension -Component $c -ModuleName $c.Name
                    if ($ext) { $targets += $c.Name }
                } finally {
                    try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($c) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
                }
            }
            $targets = $targets | Sort-Object -Unique
        }

        $total = $targets.Count
        $idx = 0
        foreach ($name in $targets) {
            $idx++
            Write-Status -Message ("[{0}/{1}] Exportando: {2}" -f $idx, $total, $name) -Color Cyan
            # FIX: pasar AccessApplication para que SaveAsText funcione en formularios
            Export-VbaModule -VbProject $vbProject -ModuleName $name -ModulesPath $ModulesPath -AccessApplication $session.AccessApplication
        }
        Write-Status -Message ("OK Export completado ({0})" -f $total) -Color Green

    } elseif ($Action -eq "Import") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        $vbProject = $session.VbProject

        $targets = @()
        if ($normalizedModules.Count -gt 0) {
            $targets = $normalizedModules
        } else {
            # FIX: incluir *.form.txt y extraer nombre correctamente
            $targets = @(Get-ChildItem -Path $ModulesPath -File -Recurse `
                -Include "*.bas", "*.cls", "*.frm", "*.form.txt" -ErrorAction SilentlyContinue |
                ForEach-Object {
                    if ($_.Name -match '\.form\.txt$') { $_.Name -replace '\.form\.txt$', '' }
                    else { $_.BaseName }
                } | Sort-Object -Unique)
        }

        $total = $targets.Count
        $useRetryImport = ($targets.Count -gt 1)
        $createdComponentNames = New-Object System.Collections.Generic.List[string]
        $pendingTargets = @($targets)
        $pass = 0
        $lastErrors = @{}
        $maxPasses = if ($useRetryImport) { [Math]::Max(2, $targets.Count) } else { 1 }

        do {
            $pass++
            $progressThisPass = $false
            $failedThisPass = New-Object System.Collections.Generic.List[string]
            $idx = 0

            foreach ($name in $pendingTargets) {
                $idx++
                if ($useRetryImport -and $pass -gt 1) {
                    Write-Status -Message ("[{0}/{1}] Importando (pasada {2}): {3}" -f $idx, $pendingTargets.Count, $pass, $name) -Color Cyan
                } else {
                    Write-Status -Message ("[{0}/{1}] Importando: {2}" -f $idx, $total, $name) -Color Cyan
                }

                try {
                    $beforeExists = Resolve-ExistingComponentName -VbProject $vbProject -ModuleName $name
                    $importResult = Import-VbaModule -VbProject $vbProject -ModuleName $name -ModulesPath $ModulesPath -AccessApplication $session.AccessApplication -ImportMode $ImportMode
                    if (-not $beforeExists) {
                        $afterExists = Resolve-ExistingComponentName -VbProject $vbProject -ModuleName $name
                        if ($afterExists -and $importResult -and $importResult.CreatedNewComponent -and $importResult.RequiresExplicitSave) {
                            $importCreatedNewComponents = $true
                            $createdComponentNames.Add([string]$afterExists) | Out-Null
                        }
                    }
                    $progressThisPass = $true
                    if ($lastErrors.ContainsKey($name)) { $lastErrors.Remove($name) }
                } catch {
                    $failedThisPass.Add($name) | Out-Null
                    $lastErrors[$name] = $_.Exception.Message
                    if (-not $useRetryImport) { throw }
                }
            }

            $pendingTargets = @($failedThisPass)
        } while ($useRetryImport -and $pendingTargets.Count -gt 0 -and $progressThisPass -and $pass -lt $maxPasses)

        $moduleResults = New-Object System.Collections.Generic.List[object]
        foreach ($t in $targets) {
            if ($lastErrors.ContainsKey($t)) {
                $moduleResults.Add([pscustomobject]@{
                    module = [string]$t
                    status = "error"
                    error  = [string]$lastErrors[$t]
                }) | Out-Null
            } else {
                $moduleResults.Add([pscustomobject]@{
                    module = [string]$t
                    status = "ok"
                }) | Out-Null
            }
        }
        Write-Host ("##MODULE_RESULTS:{0}" -f ($moduleResults | ConvertTo-Json -Compress -Depth 4))

        if ($pendingTargets.Count -gt 0) {
            $details = @($pendingTargets | ForEach-Object {
                if ($lastErrors.ContainsKey($_)) { "{0}: {1}" -f $_, $lastErrors[$_] } else { $_ }
            }) -join "; "
            $scopeLabel = if ($normalizedModules.Count -eq 0) { "Import-all" } else { "Import" }
            throw ("{0} no pudo completar algunos módulos tras {1} pasada(s): {2}" -f $scopeLabel, $pass, $details)
        }

        if ($importCreatedNewComponents) {
            Save-VbaProjectModules -AccessApplication $session.AccessApplication -ModuleNames @($createdComponentNames)
        }
        Write-Status -Message ("OK Import completado ({0})" -f $total) -Color Green

    } elseif ($Action -eq "Delete") {
        if ($normalizedModules.Count -eq 0) {
            throw "Delete requiere al menos un nombre de módulo/objeto."
        }
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        $vbProject = $session.VbProject
        $moduleResults = New-Object System.Collections.Generic.List[object]
        $idx = 0
        foreach ($name in $normalizedModules) {
            $idx++
            Write-Status -Message ("[{0}/{1}] Eliminando: {2}" -f $idx, $normalizedModules.Count, $name) -Color Cyan
            try {
                $result = Remove-AccessObjectOrComponent -AccessApplication $session.AccessApplication -VbProject $vbProject -ModuleName $name
                $moduleResults.Add($result) | Out-Null
            } catch {
                $moduleResults.Add([pscustomobject]@{
                    module = [string]$name
                    status = "error"
                    error  = [string]$_.Exception.Message
                }) | Out-Null
            }
        }
        Write-Host ("##MODULE_RESULTS:{0}" -f ($moduleResults | ConvertTo-Json -Compress -Depth 4))
        $failedDeletes = @($moduleResults | Where-Object { $_.status -eq "error" })
        if ($failedDeletes.Count -gt 0) {
            throw ("Delete no pudo completar {0}/{1} objeto(s): {2}" -f $failedDeletes.Count, $normalizedModules.Count, (($failedDeletes | ForEach-Object { "{0}: {1}" -f $_.module, $_.error }) -join "; "))
        }
        Write-Status -Message ("OK Delete completado ({0})" -f $normalizedModules.Count) -Color Green

    } elseif ($Action -eq "List-Objects") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        $inventory = Get-FrontendInventory -AccessApplication $session.AccessApplication -VbProject $session.VbProject
        if ($Json) {
            $inventory | ConvertTo-Json -Depth 6
        } else {
            Write-Status -Message ("Forms: {0}" -f ($inventory.forms -join ", ")) -Color Cyan
            Write-Status -Message ("Reports: {0}" -f ($inventory.reports -join ", ")) -Color Cyan
            Write-Status -Message ("Modules: {0}" -f ($inventory.modules -join ", ")) -Color Cyan
            Write-Status -Message ("Classes: {0}" -f ($inventory.classes -join ", ")) -Color Cyan
            Write-Status -Message ("DocumentModules: {0}" -f ($inventory.documentModules -join ", ")) -Color Cyan
        }

    } elseif ($Action -eq "Exists") {
        if ($normalizedModules.Count -ne 1) {
            throw "Exists requiere exactamente un nombre de módulo/objeto."
        }
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        $info = Get-ExistsInfo -AccessApplication $session.AccessApplication -VbProject $session.VbProject -ModuleName $normalizedModules[0]
        if ($Json) {
            $info | ConvertTo-Json -Depth 6
        } else {
            Write-Status -Message ("moduleName: {0}" -f $info.moduleName) -Color Cyan
            Write-Status -Message ("accessObjectExists: {0}" -f $info.accessObjectExists) -Color Cyan
            Write-Status -Message ("accessObjectKind: {0}" -f $info.accessObjectKind) -Color Cyan
            Write-Status -Message ("accessObjectName: {0}" -f $info.accessObjectName) -Color Cyan
            Write-Status -Message ("vbComponentExists: {0}" -f $info.vbComponentExists) -Color Cyan
            Write-Status -Message ("vbComponentName: {0}" -f $info.vbComponentName) -Color Cyan
            Write-Status -Message ("isDocumentModule: {0}" -f $info.isDocumentModule) -Color Cyan
            Write-Status -Message ("suggestedImportMode: {0}" -f $info.suggestedImportMode) -Color Cyan
        }

    } elseif ($Action -eq "Run-Procedure") {
        $procedureArgs = Convert-ProcedureArgsJson -JsonText $ProcedureArgsJson
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        $runResult = Invoke-AccessProcedure -AccessApplication $session.AccessApplication -VbProject $session.VbProject -ProcedureName $ProcedureName -ProcedureArgs $procedureArgs
        if ($Json) {
            $runResult | ConvertTo-Json -Depth 6
        } else {
            if ($runResult.ok) {
                Write-Status -Message ("OK {0} ejecutado. ReturnValue: {1}" -f $runResult.procedure, $runResult.returnValue) -Color Green
            } else {
                Write-Status -Message ("ERROR {0}: {1}" -f $runResult.procedure, $runResult.error) -Color Red
            }
        }

    } elseif ($Action -eq "Run-Tests") {
        if (-not [string]::IsNullOrWhiteSpace($ProceduresJsonFile)) {
            $ProceduresJson = Get-Content -Path $ProceduresJsonFile -Raw -Encoding UTF8
        }
        if ([string]::IsNullOrWhiteSpace($ProceduresJson)) {
            throw "Run-Tests requiere -ProceduresJson o -ProceduresJsonFile con un array JSON de procedimientos."
        }
        $procedures = ConvertFrom-Json -InputObject $ProceduresJson
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        $batchResults = Invoke-AccessProcedureBatch -AccessApplication $session.AccessApplication -VbProject $session.VbProject -Procedures $procedures
        if ($Json) {
            ConvertTo-Json -InputObject @($batchResults) -Depth 6
        }

    } elseif ($Action -eq "Compile") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        $compileResult = Invoke-CompileVbaProject -AccessApplication $session.AccessApplication
        if ($Json) {
            $compileResult | ConvertTo-Json -Depth 6
        } else {
            if ($compileResult.ok) {
                Write-Status -Message "OK compilación VBA completada" -Color Green
            } else {
                Write-Status -Message ("ERROR compilación VBA: {0}" -f $compileResult.error) -Color Red
                if ($compileResult.component) { Write-Status -Message ("Componente: {0}" -f $compileResult.component) -Color Red }
                if ($compileResult.line) { Write-Status -Message ("Línea: {0}, Columna: {1}" -f $compileResult.line, $compileResult.column) -Color Red }
                if ($compileResult.sourceLine) { Write-Status -Message ("Código: {0}" -f $compileResult.sourceLine) -Color Red }
            }
        }

    } elseif ($Action -eq "Generate-ERD") {
        if ([string]::IsNullOrWhiteSpace($BackendPath)) {
            $candidates = Get-ChildItem -Path (Get-Location) -File -Filter "*_Datos.accdb" -ErrorAction SilentlyContinue
            if (-not $candidates) {
                $candidates = Get-ChildItem -Path (Get-Location) -File -Filter "*_Datos.mdb" -ErrorAction SilentlyContinue
            }

            if ($candidates) {
                if ($candidates.Count -gt 1) {
                    Write-Status -Message "ADVERTENCIA: Multiples backends encontrados, usando el primero: $($candidates[0].Name)" -Color Yellow
                }
                $BackendPath = $candidates[0].FullName
            } else {
                throw "No se especifico -BackendPath y no se encontro ningun archivo *_Datos.accdb/.mdb en el directorio actual."
            }
        }

        $BackendPath = (Resolve-Path -Path $BackendPath).Path
        Write-Status -Message ("Backend: {0}" -f $BackendPath) -Color Yellow

        if ([string]::IsNullOrWhiteSpace($ErdPath)) {
            $parent = Split-Path -Parent $DestinationRoot
            $ErdPath = Join-Path -Path $parent -ChildPath "ERD"
        }

        if (-not (Test-Path -Path $ErdPath)) {
            New-Item -ItemType Directory -Force -Path $ErdPath | Out-Null
        }
        $ErdPath = (Resolve-Path -Path $ErdPath).Path
        Write-Status -Message ("ERD Folder: {0}" -f $ErdPath) -Color Yellow

        $backendName = [System.IO.Path]::GetFileNameWithoutExtension($BackendPath)
        $mdFile = Join-Path -Path $ErdPath -ChildPath ($backendName + ".md")

        Export-DataStructure -DatabasePath $BackendPath -OutputPath $mdFile -Password $Password

        Write-Status -Message ("OK ERD generado en: {0}" -f $mdFile) -Color Green

    } else {
        $fixedSrc = 0
        $fixedAccess = 0

        if ($Location -eq "Src" -or $Location -eq "Both") {
            $fixedSrc = Fix-EncodingInSrc -ModulesPath $ModulesPath -ModuleName $normalizedModules
            Write-Status -Message ("Fix-Encoding (Src): {0}" -f $fixedSrc) -Color Yellow
        }

        if ($Location -eq "Access" -or $Location -eq "Both") {
            $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
            $fixedAccess = Fix-EncodingInAccess -VbProject $session.VbProject -ModulesPath $ModulesPath -ModuleName $normalizedModules -AccessApplication $session.AccessApplication
            Write-Status -Message ("Fix-Encoding (Access): {0}" -f $fixedAccess) -Color Yellow
        }

        Write-Status -Message ("OK Fix-Encoding completado") -Color Green
    }
} finally {
    if ($session) {
        try { Close-AccessDatabase -Session $session -AccessPath $AccessPath -Password $Password } catch { Write-Debug "Diagnostics: $_" }
    }
}
