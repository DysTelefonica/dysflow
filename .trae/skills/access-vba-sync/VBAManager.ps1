[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
[CmdletBinding()]
Param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Export", "Import", "Fix-Encoding", "Generate-ERD")]
    [string]$Action,

    [string]$BackendPath,
    [string]$ErdPath,

    [string]$AccessPath,

    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "Password", Justification = "Requerido por especificacion del proyecto.")]
    [string]$Password = "dpddpd",

    [string[]]$ModuleName,

    [Alias("DestinationPath")]
    [string]$DestinationRoot,

    [ValidateSet("Both", "Src", "Access")]
    [string]$Location = "Both"
)

$ErrorActionPreference = "Stop"

function Write-Status {
    Param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )
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
        } catch {}
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
        if ($database) { try { $database.Close() } catch {} }
        foreach ($obj in @($prop, $database, $dbEngine)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch {} }
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
            $newProp = $database.CreateProperty("AllowBypassKey", [int16]1, $true)
            $database.Properties.Append($newProp)
        }
        return $true
    } finally {
        if ($database) { try { $database.Close() } catch {} }
        foreach ($obj in @($newProp, $prop, $database, $dbEngine)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch {} }
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
            try { $database.Properties.Delete("AllowBypassKey") } catch {}
        }
    } finally {
        if ($database) { try { $database.Close() } catch {} }
        foreach ($obj in @($prop, $database, $dbEngine)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch {} }
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
    
    $dbEngine = New-DaoDbEngine
    if (-not $dbEngine) { return $null }
    
    $db = $null
    $restoreInfo = [ordered]@{
        RenamedAutoExec = $false
        OriginalStartupForm = $null
        HasStartupForm = $false
    }
    
    try {
        $connect = if ($Password) { ";PWD=$Password" } else { "" }
        $db = $dbEngine.OpenDatabase($AccessPath, $false, $false, $connect)
        
        # 1. Handle AutoExec
        try {
            $scripts = $db.Containers("Scripts")
            # Check for stale backup first
            foreach ($doc in $scripts.Documents) {
                if ($doc.Name -eq "AutoExec_TraeBackup") {
                     # Try to restore it first if AutoExec is missing
                     $autoExecExists = $false
                     foreach ($d in $scripts.Documents) { if ($d.Name -eq "AutoExec") { $autoExecExists = $true } }
                     
                     if (-not $autoExecExists) {
                        $doc.Name = "AutoExec"
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
        } catch {}
        
        # 2. Handle StartupForm
        try {
            $prop = $db.Properties("StartupForm")
            $restoreInfo.OriginalStartupForm = $prop.Value
            $restoreInfo.HasStartupForm = $true
            $db.Properties.Delete("StartupForm")
        } catch {}
        
        return [pscustomobject]$restoreInfo
        
    } catch {
        return $null
    } finally {
        if ($db) { $db.Close(); [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($db) | Out-Null }
        if ($dbEngine) { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) | Out-Null }
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
    
    $dbEngine = New-DaoDbEngine
    $db = $null
    
    try {
        $connect = if ($Password) { ";PWD=$Password" } else { "" }
        $db = $dbEngine.OpenDatabase($AccessPath, $false, $false, $connect)
        
        # 1. Restore AutoExec
        if ($RestoreInfo.RenamedAutoExec) {
            try {
                $scripts = $db.Containers("Scripts")
                foreach ($doc in $scripts.Documents) {
                    if ($doc.Name -eq "AutoExec_TraeBackup") {
                        $doc.Name = "AutoExec"
                        break
                    }
                }
            } catch {}
        }
        
        # 2. Restore StartupForm
        if ($RestoreInfo.HasStartupForm) {
            try {
                try { $db.Properties.Delete("StartupForm") } catch {}
                $prop = $db.CreateProperty("StartupForm", 10, $RestoreInfo.OriginalStartupForm)
                $db.Properties.Append($prop)
            } catch {}
        }
        
    } finally {
        if ($db) { $db.Close(); [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($db) | Out-Null }
        if ($dbEngine) { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) | Out-Null }
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
        Where-Object { 
            ($_.Extension -in @(".accdb", ".accde", ".mdb", ".mde")) -and 
            ($_.Name -notlike "*_datos.accdb") # <--- LA CLAVE: Ignora el backend
        } |
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
        [Parameter(Mandatory = $true)][ValidateSet("Export", "Import", "Fix-Encoding", "Generate-ERD")][string]$Action
    )
    if (-not (Test-Path -Path $DestinationRoot)) {
        if ($Action -eq "Export" -or $Action -eq "Fix-Encoding") {
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

    # MODIFICADO: Usar BOM ($true) para mejorar compatibilidad en Windows/Excel
    [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($true)))
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

function Open-AccessDatabase {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
        [string]$Password
    )

    $access = $null
    $originalBypass = $null
    $startupInfo = $null
    $accessPid = $null
    $vbe = $null
    $vbProject = $null
    $prePids = @()

    try {
        $originalBypass = Get-AllowBypassKeyState -AccessPath $AccessPath -Password $Password
        $bypassOk = Enable-AllowBypassKey -AccessPath $AccessPath -Password $Password
        if (-not $bypassOk) {
            Write-Status -Message "ADVERTENCIA: No se pudo habilitar AllowBypassKey; abriendo de todas formas." -Color Yellow
        }
        
        $startupInfo = Disable-StartupFeatures -AccessPath $AccessPath -Password $Password
        if (-not $startupInfo) {
            throw "CRITICAL: No se pudo deshabilitar AutoExec/StartupForm. Se aborta la apertura para evitar ejecución no desatendida."
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
            $hwnd = [IntPtr]$access.hWndAccessApp
            if ($hwnd -and $hwnd -ne [IntPtr]::Zero) {
                $accessPid = Get-ProcessIdFromHwnd -Hwnd $hwnd
            }
        } catch {}

        $access.OpenCurrentDatabase($AccessPath, $false, $Password)
        try { $access.DoCmd.SetWarnings($false) } catch {}
        try {
            if (-not $accessPid) {
                $hwnd2 = [IntPtr]$access.hWndAccessApp
                if ($hwnd2 -and $hwnd2 -ne [IntPtr]::Zero) {
                    $accessPid = Get-ProcessIdFromHwnd -Hwnd $hwnd2
                }
            }
        } catch {}

        try {
            $post = @(Get-Process MSACCESS -ErrorAction SilentlyContinue | Select-Object -Property Id, StartTime)
            $new = @($post | Where-Object { $_.Id -notin $prePids })
            if ($new.Count -ge 1) {
                $picked = $new | Sort-Object -Property StartTime -Descending | Select-Object -First 1
                $accessPid = [int]$picked.Id
            }
        } catch {}

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
            try { $access.Quit() } catch {}
            try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($access) | Out-Null } catch {}
        }
        foreach ($obj in @($vbProject, $vbe)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch {} }
        }
        if ($originalBypass) {
            try { Restore-AllowBypassKey -AccessPath $AccessPath -Password $Password -OriginalState $originalBypass } catch {}
        }
        if ($startupInfo) {
            try { Restore-StartupFeatures -AccessPath $AccessPath -Password $Password -RestoreInfo $startupInfo } catch {}
        }
        throw
    }
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
    $startup = $Session.StartupInfo
    $accessPid = $Session.ProcessId

    if ($access) {
        try { $access.CloseCurrentDatabase() } catch {}
        try { $access.Quit() } catch {}
    }

    foreach ($obj in @($Session.VbProject, $Session.Vbe, $Session.AccessApplication)) {
        if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch {} }
    }

    try { Restore-AllowBypassKey -AccessPath $AccessPath -Password $Password -OriginalState $orig } catch {}
    try { Restore-StartupFeatures -AccessPath $AccessPath -Password $Password -RestoreInfo $startup } catch {}

    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    if ($accessPid) {
        try { Start-Sleep -Milliseconds 300 } catch {}
        try { Stop-Process -Id $accessPid -Force -ErrorAction SilentlyContinue } catch {}
        try { Start-Sleep -Milliseconds 300 } catch {}
        try { Stop-Process -Id $accessPid -Force -ErrorAction SilentlyContinue } catch {}
    }
}

function Get-SubfolderByType {
    Param([int]$Type, [string]$ModuleName)
    switch ($Type) {
        1       { return "modules" } # .bas
        2       { return "classes" } # .cls
        100     { 
            # Los formularios y reportes en Access son Tipo 100 pero empiezan por Form_ o Report_
            if ($ModuleName -like "Form_*") { return "forms" } 
            elseif ($ModuleName -like "Report_*") { return "reports" }
            else { return "classes" } 
        }
        3       { return "forms" }   # .frm
        default { return "others" }
    }
}

function Export-DataStructure {
    Param([string]$DatabasePath, [string]$OutputPath, [string]$Password)
    $dbEngine = New-DaoDbEngine
    $db = $null
    try {
        $conn = if ($Password) { ";PWD=$Password" } else { "" }
        $db = $dbEngine.OpenDatabase($DatabasePath, $false, $false, $conn)
        $report = "# Estructura de Datos: $(Split-Path $DatabasePath -Leaf)`n`n"
        foreach ($td in $db.TableDefs) {
            # MODIFICADO: Permitir tablas vinculadas (Attributes & 0x40000000)
            if ($td.Name -notlike "MSys*") {
                $isLinked = ($td.Attributes -band 0x40000000) -ne 0
                $linkedInfo = ""
                
                if ($isLinked) {
                    $srcTable = $td.SourceTableName
                    $cleanConnect = $td.Connect -replace "PWD=[^;]+", "PWD=***"
                    $linkedInfo = "`n> (LINKED) **Tabla Vinculada**`n> *Origen:* $srcTable`n> *Conexión:* $cleanConnect`n"
                }

                $report += "## Tabla: $($td.Name)$linkedInfo`n| Campo | Tipo | Longitud |`n| :--- | :--- | :--- |`n"
                foreach ($f in $td.Fields) { $report += "| $($f.Name) | $($f.Type) | $($f.Size) |`n" }
                $report += "`n"
            }
        }
        Write-Utf8NoBom -Path $OutputPath -Text $report
    } finally {
        if ($db) { $db.Close(); [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($db) | Out-Null }
        if ($dbEngine) { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($dbEngine) | Out-Null }
    }
}
function Get-ComponentExtension {
    Param([Parameter(Mandatory = $true)]$Component)
    $t = $Component.Type
    if ($t -eq 1) { return ".bas" }
    if ($t -eq 2) { return ".cls" }
    if ($t -eq 100) { return ".cls" }
    if ($t -eq 3) { return ".frm" }
    return $null
}

function Export-VbaModule {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [Parameter(Mandatory = $true)][string]$ModulesPath
    )

    $component = $null
    $tmp = $null
    $tmpDesign = $null
    $accessObjName = ""

    try {
        $component = $VbProject.VBComponents.Item($ModuleName)
        $type = [int]$component.Type
        
        # 1. DETERMINAR CARPETA
        $subfolder = Get-SubfolderByType -Type $type -ModuleName $ModuleName
        $targetDir = Join-Path -Path $ModulesPath -ChildPath $subfolder
        if (!(Test-Path $targetDir)) { New-Item $targetDir -ItemType Directory -Force | Out-Null }

        # 2. LIMPIEZA DE DUPLICADOS (Evita que el archivo viva en dos sitios)
        $ext = Get-ComponentExtension -Component $component
        if ($ext) {
            $possibleFolders = @("modules", "classes", "forms", "reports", "others")
            foreach ($folder in $possibleFolders) {
                if ($folder -ne $subfolder) {
                    $oldFile = Join-Path -Path $ModulesPath -ChildPath (Join-Path $folder ($ModuleName + $ext))
                    if (Test-Path $oldFile) { Remove-Item $oldFile -Force }
                }
            }
        }

        Write-Status -Message "  [+] Exportando a /${subfolder}: $ModuleName" -Color Cyan

        # 3. EXPORTACIÓN DE CÓDIGO VBA
        if ($type -eq 1 -or $type -eq 2 -or $type -eq 100 -or $type -eq 3) {
            if ($ext) {
                $finalPath = Join-Path -Path $targetDir -ChildPath ($ModuleName + $ext)
                $tmp = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("vba_tmp_$([guid]::NewGuid().ToString('N'))$ext")
                $component.Export($tmp)
                
                $text = [System.IO.File]::ReadAllText($tmp, [System.Text.Encoding]::GetEncoding(1252))
                [System.IO.File]::WriteAllText($finalPath, $text, (New-Object System.Text.UTF8Encoding($false)))
            }
        }

        # 4. EXPORTACIÓN DE DISEÑO (.form.txt)
        if ($subfolder -eq "forms" -or $subfolder -eq "reports") {
            $accessObjName = $ModuleName -replace "^Form_", "" -replace "^Report_", ""
            $acType = if ($subfolder -eq "forms") { 2 } else { 3 } 
            $extDesign = if ($subfolder -eq "forms") { ".form.txt" } else { ".report.txt" }
            
            try {
                $designPath = Join-Path -Path $targetDir -ChildPath ($accessObjName + $extDesign)
                $tmpDesign = Join-Path ([System.IO.Path]::GetTempPath()) "vba_design_$([guid]::NewGuid().ToString('N')).txt"
                
                $AccessApplication.SaveAsText($acType, $accessObjName, $tmpDesign)
                
                if (Test-Path $tmpDesign) {
                    $text = [System.IO.File]::ReadAllText($tmpDesign, [System.Text.Encoding]::GetEncoding(1252))
                    [System.IO.File]::WriteAllText($designPath, $text, (New-Object System.Text.UTF8Encoding($false)))
                    Write-Status -Message "    ✅ LOG: Diseño guardado en ${subfolder}/${accessObjName}${extDesign}" -Color Green
                }
            } catch {
                Write-Status -Message "    ⚠️ LOG: Error en SaveAsText para ${accessObjName}: $($_.Exception.Message)" -Color Gray
            }
        }
    } finally {
        if ($tmp -and (Test-Path $tmp)) { Remove-Item $tmp -Force }
        if ($tmpDesign -and (Test-Path $tmpDesign)) { Remove-Item $tmpDesign -Force }
        if ($component) { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null }
    }
}
function Resolve-ImportFileForModule {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    $modulesPathText = [string]$ModulesPath
    $moduleNameText = [string]$ModuleName

    $candidates = @(
        (Join-Path -Path $modulesPathText -ChildPath ($moduleNameText + ".bas"))
        (Join-Path -Path $modulesPathText -ChildPath ($moduleNameText + ".cls"))
        (Join-Path -Path $modulesPathText -ChildPath ($moduleNameText + ".frm"))
    )

    foreach ($c in $candidates) {
        if (Test-Path -Path $c) { return $c }
    }

    $any = Get-ChildItem -Path $modulesPathText -Recurse -File -Include "*.bas", "*.cls", "*.frm" -ErrorAction SilentlyContinue |
        Where-Object { $_.BaseName -ieq $moduleNameText } |
        Sort-Object -Property Extension |
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
            try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($c) | Out-Null } catch {}
        }
    }
}

function Import-VbaModule {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        $AccessApplication
    )

    $src = Resolve-ImportFileForModule -ModulesPath $ModulesPath -ModuleName $ModuleName
    if (-not $src) { throw ("No se encontro archivo para el modulo '{0}' en {1}" -f $ModuleName, $ModulesPath) }
    
    # Lógica LoadFromText para Formularios/Reportes (Actualiza Diseño + Código)
    if ($AccessApplication) {
        $designFile = $null
        $acType = -1
        $accessObjName = ""
        
        if ($ModuleName -match "^Form_(.+)") {
            $accessObjName = $matches[1]
            $acType = 2 # acForm
            $d = Join-Path (Split-Path $src -Parent) "$accessObjName.form.txt"
            if (Test-Path $d) { $designFile = $d }
        } elseif ($ModuleName -match "^Report_(.+)") {
            $accessObjName = $matches[1]
            $acType = 3 # acReport
            $d = Join-Path (Split-Path $src -Parent) "$accessObjName.report.txt"
            if (Test-Path $d) { $designFile = $d }
        }
        
        if ($designFile) {
            $tmpDesign = Join-Path ([System.IO.Path]::GetTempPath()) "vba_load_$([guid]::NewGuid().ToString('N')).txt"
            try {
                Convert-Utf8ToAnsiTempFile -InputPath $designFile -TempPath $tmpDesign
                $AccessApplication.LoadFromText($acType, $accessObjName, $tmpDesign)
                Write-Status -Message "    [LoadFromText] $accessObjName actualizado desde $designFile" -Color Green
                return
            } catch {
                Write-Warning "Fallo LoadFromText para $accessObjName : $($_.Exception.Message). Intentando metodo VBA standard..."
            } finally {
                if (Test-Path $tmpDesign) { Remove-Item $tmpDesign -Force -ErrorAction SilentlyContinue }
            }
        }
    }

    $ext = [System.IO.Path]::GetExtension($src)
    $tmpAnsi = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("VBAManager_import_{0}{1}" -f @([guid]::NewGuid().ToString("N"), $ext))
    $imported = $null
    $existing = $null
    $codeModule = $null

    try {
        Convert-Utf8ToAnsiTempFile -InputPath $src -TempPath $tmpAnsi
        try {
            Remove-ExistingComponent -VbProject $VbProject -ModuleName $ModuleName
        } catch {
            if ($ext -in @(".bas", ".cls")) {
                $existing = $VbProject.VBComponents.Item($ModuleName)
                $codeModule = $existing.CodeModule
                $count = $codeModule.CountOfLines
                if ($count -gt 0) { $codeModule.DeleteLines(1, $count) }
                $codeModule.AddFromFile($tmpAnsi)
                return
            }
            throw
        }

        $imported = $VbProject.VBComponents.Import($tmpAnsi)
        try {
            if ($imported -and $imported.Name -and ($imported.Name -ne $ModuleName)) {
                $imported.Name = $ModuleName
            }
        } catch {}
    } finally {
        if ($tmpAnsi -and (Test-Path -Path $tmpAnsi)) { Remove-Item -Path $tmpAnsi -Force -ErrorAction SilentlyContinue }
        if ($imported) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($imported) | Out-Null } catch {} }
        if ($codeModule) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($codeModule) | Out-Null } catch {} }
        if ($existing) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($existing) | Out-Null } catch {} }
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
        $targets = @(Get-ChildItem -Path $ModulesPath -Recurse -File -Include "*.bas", "*.cls", "*.frm" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
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

function Fix-EncodingInAccess {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication, # <--- AÑADE ESTA LÍNEA
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [string[]]$ModuleName
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
                if ($type -ne 1 -and $type -ne 2 -and $type -ne 100) { continue }
                $ext = Get-ComponentExtension -Component $c
                if ($ext) { $names += $c.Name }
            } finally {
                try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($c) | Out-Null } catch {}
            }
        }
    }

    $fixed = 0
    foreach ($n in $names | Sort-Object -Unique) {
        try {
            Export-VbaModule -AccessApplication $AccessApplication -VbProject $vbProject -ModuleName $n -ModulesPath $ModulesPath
            Import-VbaModule -VbProject $VbProject -ModuleName $n -ModulesPath $ModulesPath -AccessApplication $AccessApplication
            $fixed++
        } catch {
            Write-Status -Message ("ERROR en modulo '{0}': {1}" -f $n, $_.Exception.Message) -Color Red
        }
    }
    return $fixed
}

$session = $null

try {
    $DestinationRoot = Resolve-DestinationRoot -DestinationRoot $DestinationRoot

    if ($Action -ne "Generate-ERD") {
        $AccessPath = Resolve-AccessPath -AccessPath $AccessPath
        $ModulesPath = Resolve-ModulesPath -DestinationRoot $DestinationRoot -AccessPath $AccessPath -Action $Action

        Write-Status -Message ("Accion: {0}" -f $Action) -Color Yellow
        Write-Status -Message ("Base de datos: {0}" -f $AccessPath) -Color Yellow
        Write-Status -Message ("Carpeta: {0}" -f $ModulesPath) -Color Yellow
    } else {
        Write-Status -Message ("Accion: {0}" -f $Action) -Color Yellow
    }

    $normalizedModules = @($ModuleName | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

   if ($Action -eq "Export") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password
        $vbProject = $session.VbProject
        
        $targets = @()
        if ($normalizedModules.Count -gt 0) {
            $targets = $normalizedModules
        } else {
            foreach ($c in $vbProject.VBComponents) {
                if (Get-ComponentExtension -Component $c) { $targets += $c.Name }
            }
        }

        Write-Status -Message "🚀 Iniciando Exportacion Organizada de $($targets.Count) componentes..." -Color Magenta
        
        $idx = 0
        foreach ($name in $targets | Sort-Object) {
            $idx++
            # Eliminamos el uso de $subfolder aquí para evitar errores de scope
            Write-Status -Message "  [$idx/$($targets.Count)] Procesando: $name" -Color Cyan
            Export-VbaModule -AccessApplication $session.AccessApplication -VbProject $vbProject -ModuleName $name -ModulesPath $ModulesPath
        }
        Write-Status -Message "OK Export completado." -Color Green
    } elseif ($Action -eq "Import") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password
        $vbProject = $session.VbProject

        $targets = @()
        if ($normalizedModules.Count -gt 0) {
            $targets = $normalizedModules
        } else {
            $targets = @(Get-ChildItem -Path $ModulesPath -File -Include "*.bas", "*.cls", "*.frm" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty BaseName | Sort-Object -Unique)
        }

        $total = $targets.Count
        $idx = 0
        foreach ($name in $targets) {
            $idx++
            Write-Status -Message ("[{0}/{1}] Importando: {2}" -f $idx, $total, $name) -Color Cyan
            Import-VbaModule -VbProject $vbProject -ModuleName $name -ModulesPath $ModulesPath -AccessApplication $session.AccessApplication
        }
        Write-Status -Message ("OK Import completado ({0})" -f $total) -Color Green
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
        
        $mdFile = Join-Path -Path $ErdPath -ChildPath "Estructura_Datos.md"
        
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
            $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password
            $fixedAccess = Fix-EncodingInAccess -AccessApplication $session.AccessApplication -VbProject $session.VbProject -ModulesPath $ModulesPath -ModuleName $normalizedModules
            Write-Status -Message ("Fix-Encoding (Access): {0}" -f $fixedAccess) -Color Yellow
        }

        Write-Status -Message ("OK Fix-Encoding completado") -Color Green
    }
} finally {
    if ($session) {
        try { Close-AccessDatabase -Session $session -AccessPath $AccessPath -Password $Password } catch {}
    }
}
