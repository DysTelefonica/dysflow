<#
.SYNOPSIS
    Instala, valida o desinstala la tarea programada de Windows que ejecuta
    scripts/cache-listado-nc-tui.ps1 -Action RepairOpenAndNotify cada N horas.

.DESCRIPTION
    Pipeline:
      1) Valida prerrequisitos: admin, PowerShell 5.1, scripts presentes,
         config valida, backend accesible, password ACCESS_VBA_PASSWORD
         visible en un scope que la tarea pueda heredar.
      2) Hace un dry-run real con -Action AuditOpen (no escribe nada).
      3) Crea o sobrescribe la tarea programada con schtasks /Create.
      4) Verifica la tarea creada y muestra proxima ejecucion + comando a correr.

    Por que este script existe:
      - El usuario queria correr la reparacion + notificacion cada 3 horas en
        un Windows Server 2016 con PowerShell 5.1 sin intervencion manual.
      - El password se resuelve por env var (ACCESS_VBA_PASSWORD). Las tareas
        programadas NO heredan variables en scope "Process" del shell que las
        creo, por eso este script chequea y exige scope "User" o "Machine".
      - La notificacion se hace encolando un email en TbCorreosEnviados via
        el TUI (no se envia SMTP directo desde el script).

.PARAMETER TaskName
    Nombre jerarquico de la tarea. Default: NoConformidades\CacheListadoNC-AuditNotify.

.PARAMETER IntervalHours
    Cada cuantas horas se ejecuta. Default: 3.

.PARAMETER StartTime
    HH:MM de la primera corrida. Si se omite, se usa la hora actual redondeada
    al cuarto de hora siguiente.

.PARAMETER ConfigPath
    Ruta al JSON de configuracion del TUI. Default: <ScriptDir>\cache-listado-nc.config.json.

.PARAMETER SkipDryRun
    Omite la corrida de validacion con -Action AuditOpen.

.PARAMETER Uninstall
    Si se pasa, elimina la tarea y sale.

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-cache-listado-nc-task.ps1

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-cache-listado-nc-task.ps1 -IntervalHours 6 -StartTime 07:30

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-cache-listado-nc-task.ps1 -Uninstall

.NOTES
    Compatible con PowerShell 5.1 (Windows Server 2016).
    Ejecutar como Administrador; la tarea corre con /RL HIGHEST.
#>

[CmdletBinding()]
param(
    [string]$TaskName = "NoConformidades\CacheListadoNC-AuditNotify",
    [int]$IntervalHours = 3,
    [string]$StartTime = "",
    [string]$ConfigPath = "",
    [switch]$SkipDryRun,
    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -----------------------------------------------------------------------------
# Bootstrap paths
# -----------------------------------------------------------------------------

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $ScriptDir "..")).Path
$TuiScript = Join-Path $ScriptDir "cache-listado-nc-tui.ps1"
$ConfigTemplate = Join-Path $ScriptDir "cache-listado-nc.config.template.json"
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $ScriptDir "cache-listado-nc.config.json"
}

function Write-Section {
    param([Parameter(Mandatory = $true)][string]$Title)
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor Cyan
    Write-Host ("  " + $Title) -ForegroundColor Cyan
    Write-Host ("=" * 72) -ForegroundColor Cyan
}

function Test-Administrator {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-PasswordScopeInfo {
    # Las tareas programadas NO heredan variables en scope "Process".
    # Si el usuario definio el password solo para la sesion actual, la tarea
    # fallara al intentar abrir el backend. Aca detectamos eso y avisamos.
    $userPw = [Environment]::GetEnvironmentVariable("ACCESS_VBA_PASSWORD", "User")
    $machinePw = [Environment]::GetEnvironmentVariable("ACCESS_VBA_PASSWORD", "Machine")
    $processPw = [Environment]::GetEnvironmentVariable("ACCESS_VBA_PASSWORD", "Process")

    if (-not [string]::IsNullOrEmpty($userPw)) {
        return @{ Scope = "User"; Inheritable = $true }
    }
    if (-not [string]::IsNullOrEmpty($machinePw)) {
        return @{ Scope = "Machine"; Inheritable = $true }
    }
    if (-not [string]::IsNullOrEmpty($processPw)) {
        return @{ Scope = "Process"; Inheritable = $false }
    }
    return @{ Scope = "<none>"; Inheritable = $false }
}

function Resolve-ConfigRelativePath {
    param([Parameter(Mandatory = $true)][string]$PathValue)
    if ([string]::IsNullOrWhiteSpace($PathValue)) { return $PathValue }
    $expanded = [Environment]::ExpandEnvironmentVariables($PathValue)
    if ([System.IO.Path]::IsPathRooted($expanded)) { return $expanded }
    return (Join-Path $ScriptDir $expanded)
}

# -----------------------------------------------------------------------------
# Uninstall path (early exit)
# -----------------------------------------------------------------------------

if ($Uninstall) {
    Write-Section "Desinstalar tarea programada"
    Write-Host ("  Tarea: " + $TaskName) -ForegroundColor Yellow
    $existing = schtasks /Query /TN $TaskName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  La tarea no existe. Nada que hacer." -ForegroundColor Yellow
        exit 0
    }
    schtasks /Delete /TN $TaskName /F | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: no se pudo eliminar la tarea." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Tarea eliminada OK." -ForegroundColor Green
    exit 0
}

# -----------------------------------------------------------------------------
# 1) Prerequisite validation
# -----------------------------------------------------------------------------

Write-Section "1) Validar prerrequisitos"

$failures = New-Object System.Collections.Generic.List[string]

# PowerShell 5.1
if ($PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -eq 1) {
    Write-Host ("  [OK]   PowerShell 5.1 (" + $PSVersionTable.PSVersion + ")") -ForegroundColor Green
} else {
    Write-Host ("  [WARN] PowerShell " + $PSVersionTable.PSVersion + " detectado. El TUI fue validado contra 5.1; puede requerir ajustes.") -ForegroundColor Yellow
}

# Administrator
if (Test-Administrator) {
    Write-Host "  [OK]   Sesion con privilegios de Administrador" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Se requiere Administrador para crear la tarea con /RL HIGHEST." -ForegroundColor Red
    $failures.Add("Reabrir PowerShell como Administrador y reintentar.")
}

# TUI script
if (Test-Path -LiteralPath $TuiScript) {
    Write-Host ("  [OK]   TUI script: " + $TuiScript) -ForegroundColor Green
} else {
    Write-Host ("  [FAIL] No existe el TUI: " + $TuiScript) -ForegroundColor Red
    $failures.Add("Restaurar scripts/cache-listado-nc-tui.ps1 desde git (esta untracked actualmente).")
}

# Config: create from template if missing
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    if (Test-Path -LiteralPath $ConfigTemplate) {
        Copy-Item -LiteralPath $ConfigTemplate -Destination $ConfigPath -Force
        Write-Host ("  [OK]   Config creada desde template: " + $ConfigPath) -ForegroundColor Green
        Write-Host "         >>> Revisa BackendPath antes de continuar. <<<" -ForegroundColor Yellow
        $failures.Add("Editar config y verificar BackendPath, luego reintentar.")
    } else {
        Write-Host ("  [FAIL] No existe config ni template: " + $ConfigPath) -ForegroundColor Red
        $failures.Add("Restaurar scripts/cache-listado-nc-tui.config.json desde git.")
    }
} else {
    Write-Host ("  [OK]   Config presente: " + $ConfigPath) -ForegroundColor Green
}

# Backend path in config
if (Test-Path -LiteralPath $ConfigPath) {
    try {
        $cfgRaw = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8
        $cfg = $cfgRaw | ConvertFrom-Json
        $backendRaw = [string]$cfg.BackendPath
        if ([string]::IsNullOrWhiteSpace($backendRaw)) {
            Write-Host "  [FAIL] BackendPath vacio en config." -ForegroundColor Red
            $failures.Add("Configurar BackendPath en " + $ConfigPath + ".")
        } else {
            $backend = Resolve-ConfigRelativePath $backendRaw
            if (Test-Path -LiteralPath $backend) {
                Write-Host ("  [OK]   Backend accesible: " + $backend) -ForegroundColor Green
            } else {
                Write-Host ("  [FAIL] Backend no accesible: " + $backend) -ForegroundColor Red
                $failures.Add("Verificar BackendPath en config y que el archivo .accdb exista.")
            }
        }

        # Notification recipient sanity
        $recipient = [string]$cfg.NotificationRecipient
        if ([string]::IsNullOrWhiteSpace($recipient)) {
            Write-Host "  [WARN] NotificationRecipient vacio en config. La tarea no podra registrar email." -ForegroundColor Yellow
        } else {
            Write-Host ("  [OK]   Destinatario de notificacion: " + $recipient) -ForegroundColor Green
        }
    } catch {
        Write-Host ("  [FAIL] Config no es JSON valido: " + $_.Exception.Message) -ForegroundColor Red
        $failures.Add("Reparar JSON en " + $ConfigPath + ".")
    }
}

# Password scope
$pwdInfo = Get-PasswordScopeInfo
if ($pwdInfo.Scope -eq "User") {
    Write-Host "  [OK]   ACCESS_VBA_PASSWORD en scope User (la tarea la hereda)" -ForegroundColor Green
} elseif ($pwdInfo.Scope -eq "Machine") {
    Write-Host "  [OK]   ACCESS_VBA_PASSWORD en scope Machine (la tarea la hereda)" -ForegroundColor Green
} elseif ($pwdInfo.Scope -eq "Process") {
    Write-Host "  [WARN] ACCESS_VBA_PASSWORD solo en scope Process. La tarea NO la heredara." -ForegroundColor Yellow
    Write-Host "         La primera ejecucion programada fallara al abrir el backend." -ForegroundColor Yellow
    $failures.Add("Promover la variable a scope User o Machine antes de instalar la tarea.")
} else {
    Write-Host "  [FAIL] ACCESS_VBA_PASSWORD no esta definida en ningun scope." -ForegroundColor Red
    $failures.Add("Definir la variable: [Environment]::SetEnvironmentVariable('ACCESS_VBA_PASSWORD', \$pw, 'User') o 'Machine'.")
}

if ($failures.Count -gt 0) {
    Write-Section "Prerrequisitos pendientes"
    foreach ($f in $failures) {
        Write-Host ("  - " + $f) -ForegroundColor Red
    }
    exit 2
}

# -----------------------------------------------------------------------------
# 2) Dry-run with AuditOpen (read-only)
# -----------------------------------------------------------------------------

if (-not $SkipDryRun) {
    Write-Section "2) Dry-run con -Action AuditOpen (no escribe)"
    Write-Host "  Ejecutando una corrida real de solo lectura contra el backend..." -ForegroundColor Cyan
    Write-Host "  Comando: powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$TuiScript`" -ConfigPath `"$ConfigPath`" -Action AuditOpen" -ForegroundColor DarkGray

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $TuiScript -ConfigPath $ConfigPath -Action AuditOpen 2>&1
    $childExit = $LASTEXITCODE
    $tail = (@($output) | Select-Object -Last 8) -join "`n"

    if ($childExit -ne 0) {
        Write-Host ("  [FAIL] Dry-run termino con exit code " + $childExit + ".") -ForegroundColor Red
        Write-Host ("  Ultimas lineas:`n" + $tail) -ForegroundColor Red
        exit 3
    }
    if ($output -match "CACHE_TUI_CHILD_RESULT: OK") {
        Write-Host "  [OK]   Dry-run finalizo OK." -ForegroundColor Green
        Write-Host "  Ultimas lineas:" -ForegroundColor DarkGray
        Write-Host ("  " + ($tail -replace "(?m)^", "  ")) -ForegroundColor DarkGray
    } else {
        Write-Host "  [WARN] Dry-run termino sin el sentinel CACHE_TUI_CHILD_RESULT: OK. Revisar output:" -ForegroundColor Yellow
        Write-Host ("  " + $tail) -ForegroundColor DarkGray
        Write-Host "  Continuando de todos modos. Si algo esta mal, aborta con Ctrl+C en el siguiente paso." -ForegroundColor Yellow
        $confirm = Read-Host "  Escribi CONTINUAR para seguir con la creacion de la tarea, o Enter para abortar"
        if ($confirm -ne "CONTINUAR") {
            Write-Host "  Abortado por el usuario." -ForegroundColor Yellow
            exit 0
        }
    }
}

# -----------------------------------------------------------------------------
# 3) Create scheduled task
# -----------------------------------------------------------------------------

Write-Section "3) Crear / actualizar tarea programada"
Write-Host ("  Tarea:        " + $TaskName) -ForegroundColor Cyan
Write-Host ("  Frecuencia:   cada " + $IntervalHours + " horas") -ForegroundColor Cyan
if (-not [string]::IsNullOrWhiteSpace($StartTime)) {
    Write-Host ("  Primera corr.: " + $StartTime) -ForegroundColor Cyan
}

# /TR value: powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<script>" -Action RepairOpenAndNotify
$trValue = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $TuiScript + '" -Action RepairOpenAndNotify'

$schtasksArgs = @(
    "/Create"
    "/SC", "HOURLY"
    "/MO", "$IntervalHours"
    "/TN", $TaskName
    "/TR", $trValue
    "/RL", "HIGHEST"
    "/F"
)

if (-not [string]::IsNullOrWhiteSpace($StartTime)) {
    $schtasksArgs += @("/ST", $StartTime)
}

Write-Host ("  Comando schtasks: schtasks " + ($schtasksArgs -join " ")) -ForegroundColor DarkGray

$result = schtasks @schtasksArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] schtasks /Create fallo:" -ForegroundColor Red
    Write-Host $result -ForegroundColor Red
    exit 4
}
Write-Host "  [OK]   Tarea creada/actualizada." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 4) Verify
# -----------------------------------------------------------------------------

Write-Section "4) Verificar tarea creada"
$query = schtasks /Query /TN $TaskName /V /FO LIST 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [WARN] No se pudo consultar la tarea. Revisar manualmente:" -ForegroundColor Yellow
    Write-Host ("    schtasks /Query /TN `"$TaskName`" /V /FO LIST") -ForegroundColor Yellow
} else {
    $useful = $query | Where-Object { $_ -match "^(Task Name|Status|Run As User|Schedule Type|Start Time|Start Date|Comment|Task To Run|Next Run Time):" }
    foreach ($line in $useful) {
        Write-Host ("  " + $line) -ForegroundColor Gray
    }
}

Write-Section "Listo"
Write-Host "  Proximos pasos:" -ForegroundColor Cyan
Write-Host "    1. Probar manualmente: schtasks /Run /TN \"$TaskName\"" -ForegroundColor White
Write-Host "    2. Revisar HTML nuevo en scripts\reports\cache-listado-nc\html\" -ForegroundColor White
Write-Host "    3. Confirmar que llego el email a andres.romandelperal@telefonica.com" -ForegroundColor White
Write-Host "    4. Si todo OK, commitear installer + scripts del TUI desde staging." -ForegroundColor White
Write-Host ""
Write-Host ("  Para desinstalar mas tarde:  $PSCommandPath -Uninstall") -ForegroundColor DarkGray
Write-Host ("  Para ajustar la frecuencia:  $PSCommandPath -IntervalHours 6") -ForegroundColor DarkGray

exit 0
