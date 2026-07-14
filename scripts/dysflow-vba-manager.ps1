[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
[CmdletBinding()]
Param(
[Parameter(Mandatory = $true, Position = 0)]
[ValidateSet("Export", "Import", "Delete", "Fix-Encoding", "Generate-ERD", "List-Objects", "List-VbaModules", "Exists", "Run-Procedure", "Run-Tests")]
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
    ,
    [Parameter()]
    [switch]$Force,

    # issue #752 — opt-in verbose contract. When set, per-module import/export
    # result objects carry a `verbose` field with source / destination line
    # counts, byte counts, sha256 hashes and a derived `truncated` bool, so an AI
    # caller can detect silent truncation without trusting `status:ok`.
    [Parameter()]
    [switch]$VerboseContract,

    # Issue #807 (Feature 1) - List-VbaModules filters. PowerShell-side `[switch]`
    # for the boolean gates (so an absent `applyTypeFilter` is distinguishable
    # from `applyTypeFilter:$false`). The string params are empty by default.
    [Parameter()]
    [ValidateSet("standard", "class", "form", "report", "document", "")]
    [string]$TypeFilter = "",

    [Parameter()]
    [string]$NamePattern = "",

    [Parameter()]
    [switch]$ApplyTypeFilter,

    [Parameter()]
    [switch]$ApplyNamePattern
)

# issue #752 — wire the script-scope verbose flags consumed by Import-VbaModule
# / Export-VbaModule. We name the switch `-VerboseContract` because PowerShell's
# [CmdletBinding()] reserves `-Verbose` for Write-Verbose.
# Per-action filtering (import-only vs export-only) is the adapter's job — the
# contract flag gates both, symmetrically, in this version.
$script:ImportVerbose = [bool]$VerboseContract
$script:ExportVerbose = [bool]$VerboseContract

# Sentinel-guarantee trap. Any terminating error that escapes the per-action
# try/catch (uncaught .NET exception, dot-source failure during script load,
# external kill propagated as a terminating error, etc.) MUST still emit a
# `DYSFLOW_RESULT <json>` line before the script exits. Without this, the
# dysflow MCP runner surfaces a generic `VBA_MANAGER_INVALID_OUTPUT` with
# zero diagnostic information and the operator has to attach a debugger to
# find the cause. See issue #484.
trap {
    if ($script:HasDysflowResultEmitted) { exit 1 }
    $trapErr = $_.Exception
    $trapKind = if ($trapErr) { $trapErr.GetType().Name } else { "Unknown" }
    $trapMsg = if ($trapErr) { $trapErr.Message } else { [string]$_ }
    $trapLine = $null
    try { $trapLine = $_.InvocationInfo.ScriptLineNumber } catch { }
    $payload = [ordered]@{
        ok = $false
        error = [ordered]@{
            code = "VBA_MANAGER_UNEXPECTED_EXIT"
            message = "PowerShell terminating error: $trapMsg"
        }
        diagnostics = [ordered]@{
            trap_kind = $trapKind
        }
    }
    if ($null -ne $trapLine) { $payload.diagnostics["line"] = $trapLine }
    try {
        $json = ($payload | ConvertTo-Json -Compress -Depth 20) -replace "[\r\n]+"," "
        [Console]::Out.WriteLine("DYSFLOW_RESULT " + $json)
    } catch {
        # Last-resort fallback if the JSON serialization or console write itself fails.
        [Console]::Out.WriteLine('DYSFLOW_RESULT {"ok":false,"error":{"code":"VBA_MANAGER_UNEXPECTED_EXIT","message":"trap failed to emit sentinel"}}')
    }
    exit 1
}

$ErrorActionPreference = "Stop"

# ===========================================================================
# Early helpers block — pwsh 7+ script-load order contract.
#
# PowerShell 7+ honors the script's top-level statement order literally:
# a call to a function whose `function` definition appears LATER in the file
# raises CommandNotFoundException immediately, and the sentinel `trap` (see
# lines 81-107 above) wraps that into a DYSFLOW_RESULT line with code
# VBA_MANAGER_UNEXPECTED_EXIT, trap_kind=CommandNotFoundException, and a
# near-useless "no se reconoce como nombre de un cmdlet" message.
#
# Windows PowerShell 5.1 used to tolerate this ordering (the engine walked the
# script twice on first hit, so a top-level call to a later-defined function
# still worked). pwsh 7+ does NOT — order is honored as written.
#
# Rule: every helper invoked at the script's top level (i.e. NOT nested
# inside another function body) MUST be defined BEFORE its call site. The
# helpers below are invoked at the top level (Set-ScriptOutputEncodingUtf8
# right after this block, Set-VbComponentNameSafe / Write-DysflowOperationMarker
# from inside action handlers but pulled forward for safety), so they live
# here. The Pester suite `dysflow-vba-manager.Tests.ps1` walks the AST and
# fails if a future regression pushes any top-level call above its helper's
# definition.
# ===========================================================================

function Set-ScriptOutputEncodingUtf8 {
    <#
    .SYNOPSIS
        Force the script's stdout encoding to UTF-8 so non-ASCII characters
        round-trip through Node.js JSON consumers without mojibake.
    .DESCRIPTION
        powershell.exe (5.1) writes stdout through the active console code
        page (typically CP1252 on Western Windows). Node.js reads the child
        process's stdout as UTF-8, so any non-ASCII character (e.g. ó, í, ñ)
        would otherwise arrive as U+FFFD. Setting [Console]::OutputEncoding
        to UTF-8 makes Write-Output and ConvertTo-Json emit valid UTF-8.
    #>
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
}

function Set-VbComponentNameSafe {
    <#
    .SYNOPSIS
        Assign VBComponent.Name via the COM property setter (Unicode-safe).
    .DESCRIPTION
        DoCmd.CopyObject is NOT Unicode-safe: it mangles non-ASCII characters
        in the new object name (e.g. "Módulo1" -> "Mód×lo1"). The fix is to
        force VBComponent.Name via the COM property setter — the same
        Unicode-safe path the VBE F4 → Properties pane uses. Extracted from
        New-VbComponentFromCodeFile so the Pester test can exercise it
        with a PSCustomObject mock and assert the assignment is preserved
        end-to-end (#585).
    #>
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)] $Component,
        [Parameter(Mandatory = $true)] [string] $Name
    )
    $Component.Name = $Name
}

function Write-DysflowOperationMarker {
    [CmdletBinding()]
    Param(
        [string]$Status = "running",
        [AllowNull()]
        [object]$AccessPid = $null
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
                $startTime = $p.StartTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
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

# powershell.exe (5.1) defaults stdout to the active console code page (e.g. CP1252).
# Node.js reads the child's stdout as UTF-8, so non-ASCII chars (e.g. ó, í) arrive as
# U+FFFD replacement characters. Force UTF-8 output so VBA module names and any other
# user-supplied strings round-trip correctly through JSON. The helper definition lives
# in the early helpers block above so pwsh 7+ finds it before this top-level call.
Set-ScriptOutputEncodingUtf8
$script:QuietOutput = [bool]$Json
$script:HasDysflowResultEmitted = $false

# Load the shared COM helpers (Get-ProcessIdFromHwnd, Get-MsAccessProcesses*,
# Stop-AccessPidAndWait).  Dot-source keeps all functions in this script's scope
# and allows the Add-Type Win32.NativeMethods guard to work correctly.
. (Join-Path $PSScriptRoot 'lib/dysflow-access-com.ps1')

# Pin a deterministic culture before any Access/DAO/COM work so SQL date
# literals, decimal and list separators do not depend on the host's Windows
# regional settings. CurrentUICulture is left untouched (error messages stay in
# the OS language).
Set-DysflowThreadCulture

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

# TS<->PS result channel contract (issue #440).
# Emits exactly one DYSFLOW_RESULT <compact-single-line-json> line on stdout.
# All terminal result emits must route through this function — never emit raw ConvertTo-Json to stdout.
# -Depth is parameterized to preserve each call site's existing depth.
function Write-DysflowResult {
    param(
        [Parameter(Mandatory = $true)] [object] $Result,
        [Parameter(Mandatory = $false)] [int] $Depth = 20
    )
    try {
        $payload = @($Result)
        $json = ($payload | ConvertTo-Json -Compress -Depth $Depth) -replace "[\r\n]+"," "
        [Console]::Out.WriteLine("DYSFLOW_RESULT " + $json)
    } catch {
        # Sentinel contract (issue #440): we MUST still emit a DYSFLOW_RESULT line so the
        # MCP layer does not collapse the whole action to RUNNER_INVALID_JSON. But the
        # operator needs the original cause to diagnose the failure (issue #496), so we
        # also:
        #   1. capture the original exception into $script:LastSerializationError for tests
        #   2. emit a Write-Warning on stderr with the exception text
        #   3. include the captured exception in a `diagnostics` field of the fallback
        $script:LastSerializationError = if ($_.Exception) { $_.Exception.ToString() } else { "$_" }
        Write-Warning ("Write-DysflowResult could not serialize the result payload: " + $script:LastSerializationError)
        $diagTruncated = $script:LastSerializationError
        if ($null -ne $diagTruncated -and $diagTruncated.Length -gt 4096) {
            $diagTruncated = $diagTruncated.Substring(0, 4096) + "...[truncated]"
        }
        $fallback = @{
            ok = $false
            error = [ordered]@{
                code = "VBA_MANAGER_SERIALIZATION_FAILED"
                message = "Write-DysflowResult could not serialize the result payload."
            }
            diagnostics = @("LastSerializationError: " + $diagTruncated)
        } | ConvertTo-Json -Compress -Depth 6
        [Console]::Out.WriteLine("DYSFLOW_RESULT " + $fallback)
    }
    $script:HasDysflowResultEmitted = $true
}

function Resolve-ImportModeValue {
    [CmdletBinding()]
    Param(
        [AllowNull()]
        [string]$ImportMode
    )

    if ([string]::IsNullOrWhiteSpace($ImportMode)) { return "Auto" }
    if ($ImportMode -ieq "replace") { return "Auto" }
    if ($ImportMode -ieq "Auto") { return "Auto" }
    # `Form` is a deprecated alias for `Auto`. A form/report always imports its
    # UI/layout from the `.form.txt` AND its canonical code from the sibling
    # `.cls` — there is no useful "layout-only" import, because LoadFromText
    # always carries the embedded (and possibly stale) code-behind. Mapping Form
    # to Auto guarantees the `.cls` wins for code while keeping old callers working.
    if ($ImportMode -ieq "Form") { return "Auto" }
    if ($ImportMode -ieq "Code") { return "Code" }

    Write-DysflowResult -Result ([ordered]@{
        ok = $false
        error = [ordered]@{
            code = "VBA_MANAGER_INVALID_IMPORT_MODE"
            message = "Invalid ImportMode '$ImportMode'. Valid values are Auto, Code, or aliases replace/Form (Form is deprecated and behaves like Auto)."
        }
    }) -Depth 6
    exit 1
}

function New-DaoDbEngine {
    [CmdletBinding()]
    Param()

    if ($env:DYSFLOW_MOCK_COM -eq '1') {
        return Get-MockDaoDbEngine
    }

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

function Open-DaoDatabaseForMaintenance {
    [CmdletBinding()]
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
    Param(
        [Parameter(Mandatory = $true)]$DbEngine,
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [string]$Password,
        [bool]$ReadOnly = $false
    )

    # issue #861 — ACCESS_VBA_PASSWORD is a VBA *project* password, which is NOT
    # the same as a database-level password. DAO's OpenDatabase(...;PWD=) expects
    # a *database* password; passing a VBA-project password (or any password to a
    # DB that has no database-level password) fails with "No es una contraseña
    # válida". The maintenance opens here (AllowBypassKey read/write + the
    # AutoExec/StartupForm disable) only need the file open via DAO, so we try
    # WITH the password first (covers a real database password) and then fall back
    # to opening WITHOUT a password (covers the common VBA-project-password /
    # no-database-password case) before giving up. Returns a structured result
    # instead of throwing so each caller keeps its own failure contract
    # (bypass helpers degrade to $null/$false; Disable-StartupFeatures aborts).
    $attempts = @()
    if (-not [string]::IsNullOrEmpty($Password)) { $attempts += ";PWD=$Password" }
    $attempts += ""

    $lastError = ""
    foreach ($connect in $attempts) {
        try {
            $db = $DbEngine.OpenDatabase($AccessPath, $false, $ReadOnly, $connect)
            return [pscustomobject]@{ Database = $db; ErrorMessage = "" }
        } catch {
            $lastError = if ($_.Exception -and $_.Exception.Message) { $_.Exception.Message } else { [string]$_ }
        }
    }

    return [pscustomobject]@{ Database = $null; ErrorMessage = $lastError }
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

        # issue #861 — password fallback (see Open-DaoDatabaseForMaintenance).
        $opened = Open-DaoDatabaseForMaintenance -DbEngine $dbEngine -AccessPath $AccessPath -Password $Password
        $database = $opened.Database
        if (-not $database) {
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

        # issue #861 — password fallback (see Open-DaoDatabaseForMaintenance).
        $opened = Open-DaoDatabaseForMaintenance -DbEngine $dbEngine -AccessPath $AccessPath -Password $Password
        $database = $opened.Database
        if (-not $database) {
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

        # issue #861 — password fallback (see Open-DaoDatabaseForMaintenance).
        $opened = Open-DaoDatabaseForMaintenance -DbEngine $dbEngine -AccessPath $AccessPath -Password $Password
        $database = $opened.Database
        if (-not $database) {
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

        # issue #861 — try WITH the password first, then WITHOUT it. A DB whose
        # only secret is a VBA-project password (ACCESS_VBA_PASSWORD) has no
        # database-level password, so `;PWD=` makes DAO throw "No es una
        # contraseña válida" and the gate used to abort every bulk-read
        # (list_vba_modules, list_objects, export ...). The fallback lets the
        # AutoExec/StartupForm disable succeed on those DBs while still honoring a
        # real database password when one exists.
        $opened = Open-DaoDatabaseForMaintenance -DbEngine $dbEngine -AccessPath $AccessPath -Password $Password
        $db = $opened.Database
        if (-not $db) {
            # Raise only the raw DAO detail; the outer catch wraps it in the
            # canonical "CRITICAL ... mediante DAO. Detalle: {0} ..." message.
            $detail = if ([string]::IsNullOrWhiteSpace($opened.ErrorMessage)) { "OpenDatabase devolvió null sin excepción." } else { $opened.ErrorMessage }
            throw $detail
        }

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

        # issue #861 — password fallback (see Open-DaoDatabaseForMaintenance) so
        # teardown re-enables AutoExec/StartupForm on VBA-project-password DBs too.
        $opened = Open-DaoDatabaseForMaintenance -DbEngine $dbEngine -AccessPath $AccessPath -Password $Password
        $db = $opened.Database
        if (-not $db) { return }

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
        [Parameter(Mandatory = $true)][ValidateSet("Export", "Import", "Delete", "Fix-Encoding", "Generate-ERD", "List-Objects", "List-VbaModules", "Exists", "Run-Procedure")][string]$Action
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

# issue #743: ensure that form `.cls` code-behind files emitted by Export-VbaModule
# always carry `Attribute VB_Name = "<FormName>"` as their first non-blank line.
# Without it, Access interprets the module as a placeholder and produces
# `Form_TempSccObj1`, `Form_TempSccObj2`, ... when the file is re-imported.
# Pure text helper: no COM, no filesystem side effects.
function Ensure-VbNameAttributeAtTop {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text,
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    if ([string]::IsNullOrEmpty($ModuleName)) {
        throw "Ensure-VbNameAttributeAtTop: -ModuleName is required"
    }

    $expected = "Attribute VB_Name = `"$ModuleName`""
    $normalized = $Text -replace "`r`n", "`n" -replace "`r", "`n"

    if ([string]::IsNullOrEmpty($normalized)) {
        # Empty input: return a fresh Attribute VB_Name line.
        return $expected
    }

    $lines = @($normalized -split "`n")

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $trim = $lines[$i].Trim()
        if ($trim -eq "") { continue }
        # First non-blank line is here. Three shapes:
        #   1) It is the correct Attribute VB_Name -> idempotent pass-through
        #   2) It is a stale Attribute VB_Name -> replace value in place
        #   3) Anything else -> prepend the canonical line and re-join
        if ($trim -match '^Attribute\s+VB_Name\s*=\s*"([^"]*)"\s*$') {
            if ($matches[1] -eq $ModuleName) {
                return $Text
            }
            $lines[$i] = $expected
            return ($lines -join "`n")
        }
        $lines = @($expected) + $lines
        return ($lines -join "`n")
    }

    # No non-blank line at all -> append
    return ($expected + "`n" + $Text)
}

# issue #743: ensure that the `CodeBehindForm` block of an Access `.form.txt`
# (and `.report.txt`) carries `Attribute VB_Name = "<FormName>"` as the first
# non-blank line after the marker, even when the underlying binary emitted
# only sibling `Attribute VB_GlobalNameSpace` / `VB_Creatable` lines.
# Pure text helper: no COM, no filesystem side effects.
function Ensure-CodeBehindFormVbName {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text,
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    if ([string]::IsNullOrEmpty($ModuleName)) {
        throw "Ensure-CodeBehindFormVbName: -ModuleName is required"
    }

    $expected = "Attribute VB_Name = `"$ModuleName`""
    $normalized = $Text -replace "`r`n", "`n" -replace "`r", "`n"
    $lines = @($normalized -split "`n")

    $markerIdx = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Trim() -eq "CodeBehindForm") {
            $markerIdx = $i
            break
        }
    }

    if ($markerIdx -lt 0) {
        # Not a document module text -> defensive no-op (do not invent structure)
        return $Text
    }

    for ($i = $markerIdx + 1; $i -lt $lines.Count; $i++) {
        $trim = $lines[$i].Trim()
        if ($trim -eq "") { continue }
        if ($trim -match '^Attribute\s+VB_Name\s*=\s*"([^"]*)"\s*$') {
            if ($matches[1] -eq $ModuleName) {
                return $Text
            }
            $lines[$i] = $expected
            return ($lines -join "`n")
        }
        # Insert before this non-blank, non-VB_Name line
        $before = @()
        for ($j = 0; $j -lt $i; $j++) { $before += $lines[$j] }
        $after = @()
        for ($j = $i; $j -lt $lines.Count; $j++) { $after += $lines[$j] }
        return (($before + @($expected) + $after) -join "`n")
    }

    # Only-whitespace after CodeBehindForm: append
    $lines += $expected
    return ($lines -join "`n")
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

# issue #745: trust contract for export_modules / export_all. The downstream
# consumers (TypeScript MCP layer) read `result.ok` to decide pass/fail; the
# previous implementation hard-coded `ok = $true` regardless of warnings, and
# the per-module loop in Invoke-ExportAction appended names to `$exported` even
# when Export-VbaModule silently returned without writing a file. This helper
# is the single source of truth: `ok` is FALSE iff any module produced a
# warning, the `exported` list is passed through unchanged, and the warnings
# are surfaced when non-empty. Pure (no COM) so Pester can pin the contract
# directly. Regression guard for the export silent-fail / `Form_TempSccObjN`
# symptom in #745.
#
# Naming note: a previous draft named this `Merge-ExportResults`, but the
# `Merge-` prefix collides with real cmdlets shipped by Hyper-V / ImportExcel
# (Merge-MultipleSheets, Merge-Worksheet, Merge-VHD, Merge-CIPolicy). On
# PowerShell 5.1 the verb-noun resolver tries those cmdlets first and never
# falls back to the AST-extracted function, so the test fails with
# `CommandNotFoundException`. `Build-` is a standard verb too but has no
# shipping cmdlet collisions in the Windows PowerShell 5.1 default module
# set, so the function is reliably discovered.
function Build-ExportResultSummary {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Exported,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][hashtable[]]$Warnings
    )

    $result = @{
        ok       = ($Warnings.Count -eq 0)
        exported = $Exported
    }
    if ($Warnings.Count -gt 0) {
        $result["warnings"] = $Warnings
    }
    return $result
}

function Test-IsVbaImportDroppableMetadataLine {
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
        $trim -match '^Attribute\s+VB_(?!Name\b)'
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

# issue #752: extract the `Attribute VB_Name` value from a raw source file.
# Pure function — no COM. Strips UTF-8 BOM, skips leading blank lines, returns $null
# when no Attribute VB_Name is present. Used by Import-VbaModule to refuse importing
# a source file whose declared VB_Name disagrees with the moduleName parameter (or
# with the existing component that Resolve-ExistingComponentName resolves to).
function Get-VbNameFromSourceFile {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) { return $null }

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -eq 0) { return $null }

    # Detect UTF-8 BOM (EF BB BF); if present, skip those 3 bytes before decoding.
    $startIndex = 0
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $startIndex = 3
    }
    if ($startIndex -ge $bytes.Length) { return $null }

    $rest = New-Object 'byte[]' ($bytes.Length - $startIndex)
    [Array]::Copy($bytes, $startIndex, $rest, 0, $rest.Length)
    $text = [System.Text.Encoding]::UTF8.GetString($rest)
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }

    $lines = @($text -split "`r?`n")
    foreach ($line in $lines) {
        $trim = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trim)) { continue }
        # Canonical VBA shape: `Attribute VB_Name = "<name>"`. VB_Name token is exact-case
        # per VBA convention; allow any amount of whitespace around `=` and inside quotes.
        if ($trim -match '^Attribute\s+VB_Name\s*=\s*"([^"]+)"\s*$') {
            return $matches[1]
        }
    }
    return $null
}

# issue #752: detect duplicate `Option Explicit` / `Option Compare ...` / `Option Base` /
# `Option Private Module` directives in a source file. The VBA compiler will silently
# reject — or, worse, accept and produce different symptoms downstream — when more than
# one of each kind appears. Imports through AddFromFile have been observed to skip
# silently when duplicates are present. Pure function — no COM.
function Test-SourceFileHasDuplicateOptions {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) { return $false }

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -eq 0) { return $false }

    # Strip UTF-8 BOM defensively before decoding.
    $startIndex = 0
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $startIndex = 3
    }
    if ($startIndex -ge $bytes.Length) { return $false }
    $rest = New-Object 'byte[]' ($bytes.Length - $startIndex)
    [Array]::Copy($bytes, $startIndex, $rest, 0, $rest.Length)
    $text = [System.Text.Encoding]::UTF8.GetString($rest)

    # Bucket duplicates by directive kind (Compare / Explicit / Base / Private Module),
    # case-insensitively. `Option Compare Text` and `Option Compare Database` share the
    # Compare bucket — VBA treats them as the same directive, so we follow suit.
    $seen = @{}
    $lines = @($text -split "`r?`n")
    foreach ($line in $lines) {
        $trim = $line.Trim()
        if ($trim -notmatch '^Option\s+\S') { continue }

        if ($trim -imatch '^Option\s+Compare\s+\S+\s*$') { $kind = "Compare" }
        elseif ($trim -imatch '^Option\s+Explicit\s*$') { $kind = "Explicit" }
        elseif ($trim -imatch '^Option\s+Base\s+\d+\s*$') { $kind = "Base" }
        elseif ($trim -imatch '^Option\s+Private\s+Module\s*$') { $kind = "PrivateModule" }
        else { continue }

        $key = $kind.ToLowerInvariant()
        if ($seen.ContainsKey($key)) {
            return $true
        }
        $seen[$key] = $true
    }
    return $false
}

# issue #752: pre-import size snapshot — raw file bytes / line count / sha256. Used by
# the `verbose:true` opt-in on dysflow_import_modules to surface silent truncation
# (when AddFromFile returns fewer lines than the source file). Pure function — no COM.
function Get-SourceFileSizeSnapshot {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Source file not found: '$Path'"
    }
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $byteCount = $bytes.Length
    if ($byteCount -eq 0) {
        return [pscustomobject]@{
            bytes  = 0
            lines  = 0
            sha256 = ""
        }
    }

    $sha = ""
    try {
        $sha = [System.BitConverter]::ToString(
            [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
        ).Replace("-", "").ToLowerInvariant()
    } catch {
        # SHA256 should never fail on the runtime we target; if it does, leave empty
        # rather than break the import path.
        $sha = ""
    }

    # Line count: count \n (0x0A) occurrences in the raw bytes. If the file ends with
    # a newline, the count is the number of *lines*; otherwise it's the number of line
    # endings, so add one for the trailing unterminated line. Empty file is handled at
    # the top of this function (returns 0).
    $newlineCount = 0
    foreach ($b in $bytes) {
        if ($b -eq 0x0A) { $newlineCount++ }
    }
    $lastByte = [int]$bytes[$byteCount - 1]
    if ($lastByte -eq 0x0A) {
        $lines = $newlineCount
    } else {
        $lines = $newlineCount + 1
    }

    return [pscustomobject]@{
        bytes  = $byteCount
        lines  = $lines
        sha256 = $sha
    }
}

# F16: CodeModule.AddFromFile can keep the destination component's previous
# CountOfLines cap even after DeleteLines(1, CountOfLines). For source-larger
# updates, keep the existing component (no VBComponents.Remove; no VBE Save As
# prompt) and fall back to CodeModule.AddFromString after clearing the module.
# Pure function — no COM.
function Test-ShouldUseCodeModuleStringFallback {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][int]$SourceLines,
        [Parameter(Mandatory = $true)][int]$ExistingLines
    )

    return ($SourceLines -gt 0 -and $ExistingLines -gt 0 -and $SourceLines -gt $ExistingLines)
}

# F16: AddFromString inserts visible code into the existing component. Hidden
# Attribute VB_* lines belong to file import/export metadata and must not be
# pasted into the code pane. Preserve comments and string literals verbatim.
# Pure function — no COM.
function Convert-VbaTextForCodeModuleString {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text
    )

    if ([string]::IsNullOrEmpty($Text)) { return "" }

    $lines = @($Text -split "`r?`n")
    $kept = New-Object System.Collections.Generic.List[string]
    foreach ($line in $lines) {
        if ($line -match '^\s*Attribute\s+VB_\w+\s*=') { continue }
        $kept.Add($line) | Out-Null
    }

    $result = ($kept -join "`r`n")
    if ($result.Length -gt 0 -and -not $result.EndsWith("`r`n")) {
        $result += "`r`n"
    }
    return $result
}

function Get-VbaTextLineCount {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text
    )

    if ([string]::IsNullOrEmpty($Text)) { return 0 }
    $newlineCount = ([regex]::Matches($Text, "`n")).Count
    if ($Text.EndsWith("`n")) { return $newlineCount }
    return ($newlineCount + 1)
}

function Get-VbaTextSizeSnapshot {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text
    )

    if ([string]::IsNullOrEmpty($Text)) {
        return [pscustomobject]@{ bytes = 0; lines = 0; sha256 = "" }
    }

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $sha = ""
    try {
        $sha = [System.BitConverter]::ToString(
            [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
        ).Replace("-", "").ToLowerInvariant()
    } catch {
        $sha = ""
    }

    return [pscustomobject]@{
        bytes  = $bytes.Length
        lines  = (Get-VbaTextLineCount -Text $Text)
        sha256 = $sha
    }
}

# issue #752 — binary-side counterpart of Get-SourceFileSizeSnapshot. Joins the
# live CodeModule's text via Lines(1, CountOfLines) with CRLF (matching how
# VBA's CodeModule stores lines), then hashes that string. Returns the same
# {bytes, lines, sha256} shape so callers can compare source vs destination
# without translating between two result types. This helper holds the only
# physical reference to the COM CodeModule; release it in the caller.
function Get-CodeModuleSizeSnapshot {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$CodeModule
    )

    if ($null -eq $CodeModule) {
        return [pscustomobject]@{ bytes = 0; lines = 0; sha256 = "" }
    }

    $count = 0
    try {
        $count = [int]$CodeModule.CountOfLines
    } catch {
        # COM already torn down (likely because the parent VBComponent was
        # removed mid-call). Return an empty snapshot so the verbose path is
        # never the cause of a noisy error of its own.
        return [pscustomobject]@{ bytes = 0; lines = 0; sha256 = "" }
    }

    if ($count -le 0) {
        return [pscustomobject]@{ bytes = 0; lines = 0; sha256 = "" }
    }

    $lines = @($CodeModule.Lines(1, $count))
    $joined = [string]::Join("`r`n", $lines)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
    $sha = ""
    try {
        $sha = [System.BitConverter]::ToString(
            [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
        ).Replace("-", "").ToLowerInvariant()
    } catch { $sha = "" }

    return [pscustomobject]@{
        bytes  = $bytes.Length
        lines  = $count
        sha256 = $sha
    }
}

function Get-CodeModuleTextSnapshot {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$CodeModule
    )

    $count = 0
    try { $count = [int]$CodeModule.CountOfLines } catch {
        return [pscustomobject]@{
            captured          = $false
            ok                = $false
            success           = $false
            text              = $null
            error             = [string]$_.Exception.Message
            originalLineCount = $null
        }
    }
    if ($count -le 0) {
        return [pscustomobject]@{
            captured          = $true
            ok                = $true
            success           = $true
            text              = ""
            error             = $null
            originalLineCount = 0
        }
    }

    try {
        $lines = @($CodeModule.Lines(1, $count))
        return [pscustomobject]@{
            captured          = $true
            ok                = $true
            success           = $true
            text              = [string]::Join("`r`n", $lines)
            error             = $null
            originalLineCount = $count
        }
    } catch {
        return [pscustomobject]@{
            captured          = $false
            ok                = $false
            success           = $false
            text              = $null
            error             = [string]$_.Exception.Message
            originalLineCount = $count
        }
    }
}

function Restore-CodeModuleTextSnapshot {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$CodeModule,
        [AllowNull()]$Snapshot
    )

    if ($null -eq $Snapshot -or -not $Snapshot.success) {
        $snapshotError = $null
        if ($null -ne $Snapshot -and $Snapshot.PSObject.Properties.Name -contains 'error') {
            $snapshotError = $Snapshot.error
        }
        if ([string]::IsNullOrWhiteSpace([string]$snapshotError)) {
            $snapshotError = "CodeModule snapshot is unavailable; rollback was not attempted."
        }
        return [pscustomobject]@{ applied = $false; error = ("Rollback snapshot unavailable: {0}" -f [string]$snapshotError) }
    }

    $snapshotText = [string]$Snapshot.text

    try {
        $currentCount = 0
        try { $currentCount = [int]$CodeModule.CountOfLines } catch { $currentCount = 0 }
        if ($currentCount -gt 0) { $CodeModule.DeleteLines(1, $currentCount) }
        if ($snapshotText.Length -gt 0) {
            $CodeModule.AddFromString($snapshotText)
        }
        return [pscustomobject]@{ applied = $true; error = $null }
    } catch {
        return [pscustomobject]@{ applied = $false; error = [string]$_.Exception.Message }
    }
}

function Normalize-VbaImportText {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$Text
    )

    $normalized = $Text -replace "`r`n", "`n" -replace "`r", "`n"
    # FIX: -split "`n", -1 returns a single-element array on PowerShell 7
    # (PS5.x treated -1 as "no limit"; PS7 changed semantics and returns 1 element).
    # Omitting the limit parameter restores the documented "no limit" behaviour on
    # both runtimes, which is what this function needs to scan a multi-line VBA module.
    $lines = @($normalized -split "`n")
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
        if (Test-IsVbaImportDroppableMetadataLine -Line $lines[$start]) {
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

            # issue #646: VB_Name carries module/form identity and MUST reach the
            # binary via AddFromFile. Keep it, but STAY in directive-block mode so
            # the droppable metadata after it is still stripped.
            if ($trim -match '^Attribute\s+VB_Name\b') {
                $result.Add($line)
                continue
            }

            if (Test-IsVbaImportDroppableMetadataLine -Line $line) {
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
    # FIX: -split "`n", -1 returns a single-element array on PowerShell 7. Omit the
    # limit parameter to keep the documented "no limit" behaviour across PS5.x/PS7.
    $lines = @($normalized -split "`n")
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
    # FIX: -split "`n", -1 returns a single-element array on PowerShell 7. Omit the
    # limit parameter to keep the documented "no limit" behaviour across PS5.x/PS7.
    foreach ($line in ($normalized -split "`n")) { $lines.Add([string]$line) }

    # Locate the document's ROOT End by tracking Begin/End nesting instead of
    # matching the first `End`. Both a control block (`Begin <type>`) and a
    # serialized blob (`<key> = Begin`) open a level; a bare `End` closes one.
    # The marker belongs after the End that brings nesting back to 0 — relying on
    # indentation breaks on flush-left exports, where a nested control's `End`
    # would otherwise trigger the marker prematurely inside the layout block.
    $depth = 0
    $started = $false
    $rootEndIndex = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $trimmed = ([string]$lines[$i]).Trim()
        if ($trimmed -match '^Begin(?:\s+\w+)?$' -or $trimmed -match '^\w+\s*=\s*Begin$') {
            $depth++
            $started = $true
            continue
        }
        if ($trimmed -eq "End") {
            if ($depth -gt 0) { $depth-- }
            if ($started -and $depth -eq 0) {
                $rootEndIndex = $i
                break
            }
        }
    }

    if ($rootEndIndex -lt 0) {
        # Malformed Begin/End nesting (it never balances back to 0). Warn and fall
        # back to the original first-`End` heuristic so a best-effort marker is
        # still inserted rather than silently dropping the code-behind.
        Write-Warning "Normalize-AccessDocumentOrphanCodeBehindSection: unbalanced Begin/End nesting; falling back to first End."
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if (([string]$lines[$i]).Trim() -eq "End") { $rootEndIndex = $i; break }
        }
        if ($rootEndIndex -lt 0) { return $DocumentText }
    }

    # Insert the marker before the first VBA-bearing line after the root End. If
    # nothing after the root End looks like VBA, there is no orphan code-behind to
    # mark and the document is returned untouched.
    $firstNonBlank = -1
    $hasVba = $false
    for ($j = $rootEndIndex + 1; $j -lt $lines.Count; $j++) {
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

# Get-ProcessIdFromHwnd is provided by the shared module dot-sourced above.

# Close-TargetAccessDbIfOpen is provided by the shared module dot-sourced above.
# Moved to scripts/lib/dysflow-access-com.ps1 in Slice 5 — single source of truth.

# ===========================================================================
# Access exclusive-lock detection (R5 of the consumer request).
# When another user holds an exclusive lock on the .accdb, Access surfaces
# COM exceptions with HRESULT 0x800A09D5 ("Can't open any more tables") and
# text like "The database has been placed in a state by another user on
# machine 'X' (user 'Y') that prevents it from being opened or locked.".
# The MCP layer needs a structured error code (ACCESS_DATABASE_LOCKED) plus
# the machine/user attribution so consumers can render an actionable message.
# These helpers stay pure (no COM, no side effects) so Pester can exercise
# them with synthetic strings.
# ===========================================================================

function Test-IsAccessDatabaseLockedError {
    [CmdletBinding()]
    [OutputType([bool])]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Message
    )
    if ([string]::IsNullOrWhiteSpace($Message)) { return $false }
    $msg = $Message.ToLowerInvariant()
    # The canonical patterns emitted by Access / DAO when an exclusive lock
    # blocks the open. We keep the patterns additive: when Access ships new
    # wording we extend the list, we do not narrow it.
    return ($msg -match '0x800a09d5' `
        -or $msg -match 'already in use' `
        -or $msg -match 'cannot be opened or locked' `
        -or $msg -match 'placed in a state by another' `
        -or $msg -match 'opened exclusively by')
}

function Get-AccessDatabaseLockedOwner {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Message
    )
    $result = [ordered]@{
        code = "ACCESS_DATABASE_LOCKED"
        message = if ([string]::IsNullOrEmpty($Message)) { "" } else { $Message }
        machine = $null
        user = $null
    }
    if ([string]::IsNullOrWhiteSpace($Message)) { return $result }
    # Try the canonical quoted form first (Access: machine 'X', user 'Y'),
    # then fall back to the bareword form some DAO variants emit.
    $mMatch = [regex]::Match(
        $Message,
        '(?i)machine\s+(?:[`"'']|'')?(?<machine>[^`"''\s,]+)(?:[`"'']|'')?'
    )
    if ($mMatch.Success) {
        $result.machine = $mMatch.Groups["machine"].Value
    }
    $uMatch = [regex]::Match(
        $Message,
        '(?i)user\s+(?:[`"'']|'')?(?<user>[^`"''\s,)]+)(?:[`"'']|'')?'
    )
    if ($uMatch.Success) {
        $result.user = $uMatch.Groups["user"].Value
    }
    return $result
}

function Open-AccessDatabase {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
        [string]$Password,
        [switch]$AllowStartupExecution
    )

    $canonical = $null
    $access = $null
    $originalBypass = $null
    $vbe = $null
    $vbProject = $null
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

        # Delegate COM spawn + 3-layer PID capture to the canonical open.
        # Open-CanonicalAccess handles: New-Object Access.Application, AutomationSecurity=1,
        # Visible/UserControl=$false (BEFORE OpenCurrentDatabase, see #730),
        # hWnd layer-1 (pre-open), OpenCurrentDatabase, hWnd layer-2 (post-open retry),
        # WMI diff layer-3 (fallback, bounded, never overwrites a stronger layer).
        $canonical = Open-CanonicalAccess -DbPath $AccessPath -Password $Password
        $access = $canonical.AccessApplication

        # Visible/UserControl are forced to $false inside Open-CanonicalAccess BEFORE
        # OpenCurrentDatabase (#730). DoCmd.SetWarnings still belongs to the runner —
        # it is not part of the headless invariant and Access.Application may legitimately
        # emit a warning on a successful spawn, which we want suppressed for tidy logs.
        try { $access.DoCmd.SetWarnings($false) } catch { Write-Debug "Diagnostics: $_" }

        $accessPid = $canonical.OwnedPid

        if (-not $accessPid) {
            Write-Status -Message ("WARN: no se pudo determinar el PID de Access para '{0}'. El cierre final se hara por COM/ROT y el lock podria persistir si Access queda vivo." -f $AccessPath) -Color DarkYellow
        }

        # DYSFLOW_OPERATION marker — emitted by vba-manager, NOT by the canonical function.
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
            # Store the canonical session so Close-AccessDatabase can delegate teardown back
            # to Close-CanonicalAccess (owns AutomationSecurity restore + GC + kill logic).
            CanonicalSession  = $canonical
        }
    } catch {
        # Release secondary COM objects acquired after the canonical open.
        foreach ($obj in @($vbProject, $vbe)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
        }
        # If the canonical session was created, delegate full teardown to Close-CanonicalAccess
        # (handles CloseCurrentDatabase, Quit, FinalReleaseComObject, GC, kill).
        if ($canonical) {
            try {
                Close-CanonicalAccess -Session $canonical -DbPath $AccessPath `
                    -RotCloseAction { param($p) Close-TargetAccessDbIfOpen -AccessPath $p }
            } catch { Write-Debug "Diagnostics: $_" }
        } elseif ($access) {
            # Canonical open threw before returning a session — do a best-effort release.
            try { $access.Quit() } catch { Write-Debug "Diagnostics: $_" }
            try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($access) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
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

# Get-MsAccessProcessesBounded is provided by the shared module dot-sourced above.

# Get-AccessLockFilePath is provided by the shared module dot-sourced above.

# Diagnostic helper: find an MSACCESS.EXE PID that appears to have the given
# database open, identified only by the database path in the process command
# line. A path-only match proves the process is relevant, but it does NOT prove
# ownership by this dysflow operation. Never use this result as authority to
# force-kill a process; only a PID captured in Session.ProcessId is owned.
function Find-AccessPidByDatabase {
    [CmdletBinding()]
    Param([Parameter(Mandatory = $true)][string]$AccessPath)
    $dbKey = $AccessPath.ToLowerInvariant()
    foreach ($proc in @(Get-MsAccessProcessesBounded)) {
        if ($proc.CommandLine -and $proc.CommandLine.ToLowerInvariant().Contains($dbKey)) {
            return [int]$proc.ProcessId
        }
    }
    return $null
}

# Stop-AccessPidAndWait is provided by the shared module dot-sourced above.

function Close-AccessDatabase {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "", Justification = "Requerido por especificacion del proyecto.")]
        [string]$Password,
        # Injectable seams forwarded to Close-CanonicalAccess — for testing only.
        # Production callers omit these; defaults are the real implementations.
        [scriptblock]$KillPidAction  = $null,
        [scriptblock]$LockFileAction = $null
    )

    $orig = $Session.OriginalBypass
    $startupInfo = $Session.StartupInfo

    # Release secondary COM objects (Vbe, VbProject) that vba-manager holds but
    # the canonical session does not know about — must happen BEFORE canonical teardown.
    foreach ($obj in @($Session.VbProject, $Session.Vbe)) {
        if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
    }

    # Build a canonical session from the vba-manager session fields so
    # Close-CanonicalAccess can own the COM teardown + GC + kill logic.
    # Prefer the CanonicalSession stored at open time (contains OriginalAutomationSecurity);
    # fall back to constructing one from the flat fields for sessions opened before Slice 4.
    $canonicalSession = if ($Session.PSObject.Properties['CanonicalSession'] -and $Session.CanonicalSession) {
        $Session.CanonicalSession
    } else {
        [PSCustomObject]@{
            AccessApplication          = $Session.AccessApplication
            OwnedPid                   = $Session.ProcessId
            OriginalAutomationSecurity = 1  # safe default; canonical will restore to 1
            PidAttributed              = ($null -ne $Session.ProcessId)
        }
    }

    # Delegate COM teardown + kill to Close-CanonicalAccess:
    #   - CloseCurrentDatabase, Quit, FinalReleaseComObject, GC (BEFORE kill)
    #   - Owned PID: Stop-AccessPidAndWait synchronous (with taskkill last-resort)
    #   - Null PID:  WARN + ROT close via RotCloseAction + lock-file check via LockFileAction
    # The DYSFLOW_OPERATION marker and AllowBypassKey/startup restore stay here in vba-manager.
    $rotClose = { param($p) Close-TargetAccessDbIfOpen -AccessPath $p }

    $closeArgs = @{
        Session       = $canonicalSession
        DbPath        = $AccessPath
        RotCloseAction = $rotClose
    }
    if ($KillPidAction)  { $closeArgs['KillPidAction']  = $KillPidAction }
    if ($LockFileAction) { $closeArgs['LockFileAction'] = $LockFileAction }

    $closeResult = Close-CanonicalAccess @closeArgs

    if ($null -ne $canonicalSession.OwnedPid -and -not $closeResult.OwnedPidKilled) {
        Write-Status -Message ("WARN: no se pudo confirmar la terminacion del PID {0} para '{1}' tras la espera acotada." -f $canonicalSession.OwnedPid, $AccessPath) -Color DarkYellow
    }

    # Restore AllowBypassKey and startup features — these belong to vba-manager,
    # NOT to the canonical close (which does not know about DAO/startup state).
    try { Restore-AllowBypassKey -AccessPath $AccessPath -Password $Password -OriginalState $orig } catch { Write-Debug "Diagnostics: $_" }
    try { Restore-StartupFeatures -AccessPath $AccessPath -Password $Password -RestoreInfo $startupInfo } catch { Write-Debug "Diagnostics: $_" }

    # Additional lock-file check after restore: if the lock persists, try ROT close once more.
    # The canonical already checked the lock in the null-PID path; this check covers the
    # owned-PID path where the lock might linger briefly after the kill.
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
    Param($Component, [string]$ModuleName, $AccessApplication)
    $name = if ($ModuleName) { $ModuleName } else { $Component.Name }
    if ($name -match "^Form_|^frm") { return "forms" }
    if ($name -match "^Report_") { return "reports" }
    if ($AccessApplication) {
        $info = Resolve-AccessObjectInfo -AccessApplication $AccessApplication -ModuleName $name
        if ($info.Exists) {
            if ($info.Kind -eq "Form") { return "forms" }
            if ($info.Kind -eq "Report") { return "reports" }
        }
    }
    if ($Component) {
        $t = $Component.Type
        if ($t -eq 1) { return "modules" }
        if ($t -eq 2) { return "classes" }
        if ($t -eq 100) { return "forms" }
        if ($t -eq 3) { return "forms" }
    }
    return $null
}

function Get-ComponentExtension {
    Param($Component, [string]$ModuleName, $AccessApplication)
    $name = if ($ModuleName) { $ModuleName } else { $Component.Name }
    if ($name -match "^Form_|^frm") { return ".form.txt" }
    if ($name -match "^Report_") { return ".report.txt" }
    if ($AccessApplication) {
        $info = Resolve-AccessObjectInfo -AccessApplication $AccessApplication -ModuleName $name
        if ($info.Exists) {
            if ($info.Kind -eq "Form") { return ".form.txt" }
            if ($info.Kind -eq "Report") { return ".report.txt" }
        }
    }
    if ($Component) {
        $t = $Component.Type
        if ($t -eq 1) { return ".bas" }
        if ($t -eq 2) { return ".cls" }
        if ($t -eq 100) { return ".form.txt" }
        if ($t -eq 3) { return ".form.txt" }
    }
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

        $ext = Get-ComponentExtension -Component $component -ModuleName $actualName -AccessApplication $AccessApplication
        $folder = Get-ComponentFolder -Component $component -ModuleName $actualName -AccessApplication $AccessApplication
        if (-not $ext -or -not $folder) { return }

        $targetFolder = Join-Path -Path $ModulesPath -ChildPath $folder
        if (-not (Test-Path -Path $targetFolder)) {
            New-Item -Path $targetFolder -ItemType Directory -Force | Out-Null
        }

        $finalPath = Join-Path -Path $targetFolder -ChildPath ($actualName + $ext)

        # FIX: formularios/reportes usan SaveAsText para obtener UI + codigo completo
        # SaveAsText requiere el nombre del objeto Access SIN prefijo "Form_"/"Report_"
        if ($ext -eq ".form.txt" -or $ext -eq ".report.txt") {
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
            # issue #743: inject/replace `Attribute VB_Name` so Access never invents a
            # `Form_TempSccObjN` placeholder on re-import. SaveAsText is the source of
            # truth for everything BUT Attribute VB_Name (which the binary may already
            # be missing on legacy graphs that imported through older dysflow versions).
            $formTxtContent = [System.IO.File]::ReadAllText($finalPath, [System.Text.Encoding]::UTF8)
            $formTxtContent = Ensure-CodeBehindFormVbName -Text $formTxtContent -ModuleName $actualName
            Write-Utf8NoBom -Path $finalPath -Text $formTxtContent
        } else {
            if (-not $component) {
                throw ("Componente no encontrado en VBProject para '{0}' y no es un documento Form/Report." -f $actualName)
            }
            $tmp = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("VBAManager_export_{0}{1}" -f @([guid]::NewGuid().ToString("N"), $ext))
            $component.Export($tmp)
            Convert-AnsiToUtf8NoBom -InputPath $tmp -OutputPath $finalPath
        }

        # Exportar tambien el codigo VBA como .cls para document modules (para diff y lectura rapida)
        if ($component -and ($actualName -match "^(Form|Report)_|^frm")) {
            $clsSubFolder = if ($actualName -match "^Report_") { "reports" } else { "forms" }
            $clsFolder = Join-Path -Path $ModulesPath -ChildPath $clsSubFolder
            if (-not (Test-Path -Path $clsFolder)) {
                New-Item -Path $clsFolder -ItemType Directory -Force | Out-Null
            }
            $clsPath = Join-Path -Path $clsFolder -ChildPath ($actualName + ".cls")
            $codeModule = $component.CodeModule
            if ($codeModule -and $codeModule.CountOfLines -gt 0) {
                $codeLines = $codeModule.Lines(1, $codeModule.CountOfLines)
                # issue #743: ensure the sibling .cls code-behind file carries
                # `Attribute VB_Name = "<FormName>"` at the top. `CodeModule.Lines`
                # for document modules does not include hidden declarations like
                # Attribute VB_Name, so we must inject it explicitly to make the file
                # re-importable as the canonical form (not a Form_TempSccObjN).
                $codeLines = Ensure-VbNameAttributeAtTop -Text $codeLines -ModuleName $actualName
                Write-Utf8NoBom -Path $clsPath -Text $codeLines
            }
        }
    } finally {
        if ($tmp -and (Test-Path -Path $tmp)) { Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue }
        if ($component) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
    }
}

function Assert-SafeVbaModuleName {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    $moduleNameText = [string]$ModuleName
    if ([string]::IsNullOrWhiteSpace($moduleNameText)) {
        throw "Invalid moduleName: value cannot be empty."
    }

    if ($moduleNameText -eq "." -or $moduleNameText -eq ".." -or
        $moduleNameText.IndexOfAny(@([char]'\', [char]'/', [char]':')) -ge 0 -or
        [System.IO.Path]::IsPathRooted($moduleNameText)) {
        throw ("Invalid moduleName '{0}': module names must not contain path separators, drive qualifiers, or traversal segments." -f $moduleNameText)
    }
}

function Resolve-ImportFileForModule {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [string]$ImportMode = "Auto"
    )

    Assert-SafeVbaModuleName -ModuleName $ModuleName

    $modulesPathText = [string]$ModulesPath
    $moduleNameText = [string]$ModuleName

    $subFolders = @("forms", "reports", "classes", "modules", "")
    switch ($ImportMode) {
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

function Get-FormCodeBehindCandidateNames {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    # Candidate base names for a form/report code-behind `.cls`. A module may be
    # named bare (`MyForm`), Form_-prefixed (`Form_MyForm`) or Report_-prefixed
    # (`Report_MyForm`). We probe the name as-is plus each prefixed variant of its
    # base. The base is the name with any leading `Form_`/`Report_` stripped, so we
    # never build a cross-prefix candidate like `Report_Form_MyForm`.
    $moduleNameText = [string]$ModuleName
    $baseName = $moduleNameText -replace '^(Form_|Report_)', ''

    return @(
        $moduleNameText,
        ("Form_" + $baseName),
        ("Report_" + $baseName)
    ) | Select-Object -Unique
}

function Resolve-FormCodeBehindFile {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [Parameter(Mandatory = $true)][string]$ModuleName
    )

    # A form/report is exported as TWO artifacts: the `.form.txt`/`.report.txt`
    # (layout + an embedded serialization of the code-behind) and a separate
    # `.cls` that holds the canonical code (verify_code compares the form's
    # code through this `.cls`, not the embedded copy). When both exist, an Auto
    # import must sync the `.cls` after loading the document so the canonical code
    # wins over the possibly-stale embedded copy. Returns that `.cls` path, or
    # $null when the module has no separate code-behind (layout-only form, or a
    # plain module/class that is not a document).
    $modulesPathText = [string]$ModulesPath
    $moduleNameText  = [string]$ModuleName

    $candidateNames = Get-FormCodeBehindCandidateNames -ModuleName $moduleNameText

    foreach ($folder in @('forms', 'reports')) {
        $searchPath = Join-Path -Path $modulesPathText -ChildPath $folder
        if (-not (Test-Path -Path $searchPath)) { continue }
        foreach ($candidate in $candidateNames) {
            $cls = Join-Path -Path $searchPath -ChildPath ($candidate + '.cls')
            if (Test-Path -Path $cls) { return $cls }
        }
    }
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
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [switch]$Force
    )

    $objectInfo = Resolve-AccessObjectInfo -AccessApplication $AccessApplication -ModuleName $ModuleName
    if ($objectInfo.Exists) {
        $objectType = if ($objectInfo.Kind -eq "Report") { 3 } else { 2 } # acReport=3, acForm=2
        try {
            $AccessApplication.DoCmd.DeleteObject($objectType, $objectInfo.Name)
            # Post-deletion verification
            $checkObject = Resolve-AccessObjectInfo -AccessApplication $AccessApplication -ModuleName $ModuleName
            if ($checkObject.Exists) {
                throw "Active lock detected: the object '$ModuleName' remains in the database after deletion attempt."
            }
            return [pscustomobject]@{
                module = $ModuleName
                status = "ok"
                deleted = $objectInfo.Name
                kind   = $objectInfo.Kind
            }
        } catch {
            $errStr = ""
            if ($_) { $errStr = $_.ToString() }
            if ($_.Exception) { $errStr += " " + $_.Exception.ToString() }
            $isFrictionError = ($errStr -like "*800ADEB9*" -or $errStr -like "*-2146771271*")
            if ($isFrictionError) {
                if ($Force) {
                    try {
                        $AccessApplication.RunCommand(4) # acCmdCompactDatabase = 4
                        $AccessApplication.DoCmd.DeleteObject($objectType, $objectInfo.Name)
                        # Post-deletion verification
                        $checkObject = Resolve-AccessObjectInfo -AccessApplication $AccessApplication -ModuleName $ModuleName
                        if ($checkObject.Exists) {
                            throw "Active lock detected: the object '$ModuleName' remains in the database after deletion attempt."
                        }
                        return [pscustomobject]@{
                            module = $ModuleName
                            status = "ok"
                            deleted = $objectInfo.Name
                            kind   = $objectInfo.Kind + "-CompactDelete"
                        }
                    } catch {
                        $remediation = "Access object cannot be deleted/modified. Ensure the object is not open in Design View, close the VBA Editor, or run a database compact & repair.`nNo se puede eliminar/modificar el objeto de Access. Asegúrese de que el objeto no esté abierto en Vista Diseño, cierre el Editor de VBA o ejecute Compactar y reparar base de datos."
                        throw ("No se pudo eliminar {0} '{1}': {2}" -f $objectInfo.Kind, $objectInfo.Name, $remediation)
                    }
                } else {
                    $remediation = "Access object cannot be deleted/modified. Ensure the object is not open in Design View, close the VBA Editor, or run a database compact & repair.`nNo se puede eliminar/modificar el objeto de Access. Asegúrese de que el objeto no esté abierto en Vista Diseño, cierre el Editor de VBA o ejecute Compactar y reparar base de datos."
                    throw ("No se pudo eliminar {0} '{1}': {2}" -f $objectInfo.Kind, $objectInfo.Name, $remediation)
                }
            } else {
                throw ("No se pudo eliminar {0} '{1}': {2}" -f $objectInfo.Kind, $objectInfo.Name, $_.Exception.Message)
            }
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
        # feat-759-no-compile / Slice 1 — persist via save-only
        # (`acCmdSaveAllModules` = 280) instead of the previous
        # compile-and-save-all (`acCmdCompileAndSaveAllModules` = 126). 126
        # was the structural root cause of the "Active lock detected" bug
        # on broken projects (#759): it failed silently when the project
        # did not compile, the deletion never persisted, and the
        # post-deletion verification re-found the component. 280 saves
        # without compiling, so it cannot fail because of pre-existing
        # project compile state. The human compiles in Access.
        try { $AccessApplication.RunCommand(280) } catch { Write-Debug "Diagnostics: $_" }
        # Post-deletion verification
        $checkCompName = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
        if ($checkCompName) {
            throw "Active lock detected: the VBA component '$ModuleName' remains in the project after deletion attempt."
        }
        return [pscustomobject]@{
            module = $ModuleName
            status = "ok"
            deleted = $componentName
            kind   = "VBComponent"
        }
    } catch {
        $errStr = ""
        if ($_) { $errStr = $_.ToString() }
        if ($_.Exception) { $errStr += " " + $_.Exception.ToString() }
        $isFrictionError = ($errStr -like "*800ADEB9*" -or $errStr -like "*-2146771271*")
        if ($isFrictionError) {
            if ($Force) {
                try {
                    $objectType = 5 # acModule=5
                    if ($componentName -like "Form_*") { $objectType = 2 }
                    elseif ($componentName -like "Report_*") { $objectType = 3 }
                    elseif ($component -and $component.Type -eq 3) { $objectType = 2 }

                    $cleanName = $componentName -replace '^(Form_|Report_)', ''
                    $AccessApplication.DoCmd.DeleteObject($objectType, $cleanName)
                    # Post-deletion verification
                    $checkCompName = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
                    if ($checkCompName) {
                        throw "Active lock detected: the VBA component '$ModuleName' remains in the project after deletion attempt."
                    }
                    return [pscustomobject]@{
                        module = $ModuleName
                        status = "ok"
                        deleted = $componentName
                        kind   = "VBComponent-ForceDelete"
                    }
                } catch {
                    try {
                        $AccessApplication.RunCommand(4) # acCmdCompactDatabase = 4
                        $components.Remove($component)
                        # feat-759-no-compile / Slice 1 — persist via save-only
                        # (acCmdSaveAllModules = 280) on the force/friction
                        # branch. See the :2205 comment above for the
                        # structural rationale (GH #759).
                        try { $AccessApplication.RunCommand(280) } catch {}
                        # Post-deletion verification
                        $checkCompName = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
                        if ($checkCompName) {
                            throw "Active lock detected: the VBA component '$ModuleName' remains in the project after deletion attempt."
                        }
                        return [pscustomobject]@{
                            module = $ModuleName
                            status = "ok"
                            deleted = $componentName
                            kind   = "VBComponent-CompactRemove"
                        }
                    } catch {
                        $remediation = "Access object cannot be deleted/modified. Ensure the object is not open in Design View, close the VBA Editor, or run a database compact & repair.`nNo se puede eliminar/modificar el objeto de Access. Asegúrese de que el objeto no esté abierto en Vista Diseño, cierre el Editor de VBA o ejecute Compactar y reparar base de datos."
                        throw ("No se pudo eliminar componente '{0}': {1}" -f $componentName, $remediation)
                    }
                }
            } else {
                $remediation = "Access object cannot be deleted/modified. Ensure the object is not open in Design View, close the VBA Editor, or run a database compact & repair.`nNo se puede eliminar/modificar el objeto de Access. Asegúrese de que el objeto no esté abierto en Vista Diseño, cierre el Editor de VBA o ejecute Compactar y reparar base de datos."
                throw ("No se pudo eliminar componente '{0}': {1}" -f $componentName, $remediation)
            }
        } else {
            # issue #852 (Bug A) — VBComponents.Remove() on a form/report
            # DOCUMENT MODULE (vbext_ct_Document = 100, canonically named
            # `Form_<X>` / `Report_<X>`) raises HRESULT 0x80070057 (E_INVALIDARG,
            # "el valor no está … del intervalo esperado"): document modules are
            # owned by their Access object and cannot be removed from the VBE.
            # This surfaces for forms whose BINARY name does not follow the
            # `Form_<X>` convention (e.g. `frmSplash`, document module
            # `Form_frmSplash`) because Resolve-AccessObjectInfo cannot match the
            # Access object and the code falls through to this component branch.
            # The only valid deletion is DoCmd.DeleteObject on the owning object.
            $invalidArgError = $false
            $walkException = $_.Exception
            while ($walkException) {
                try { if ([int]$walkException.HResult -eq -2147024809) { $invalidArgError = $true; break } } catch { Write-Debug "Diagnostics: $_" }
                $walkException = $walkException.InnerException
            }
            if (-not $invalidArgError) {
                $invalidArgError = ($errStr -like "*80070057*" -or $errStr -like "*E_INVALIDARG*")
            }
            $componentIsDocumentModule = ($componentName -match '^(Form_|Report_)')
            if (-not $componentIsDocumentModule -and $component) {
                try { if ([int]$component.Type -eq 100) { $componentIsDocumentModule = $true } } catch { Write-Debug "Diagnostics: $_" }
            }

            if ($invalidArgError -and $componentIsDocumentModule) {
                $ownerObjectType = if ($componentName -match '^Report_') { 3 } else { 2 } # acReport=3, acForm=2
                $ownerName = $componentName -replace '^(Form_|Report_)', ''
                try {
                    $AccessApplication.DoCmd.DeleteObject($ownerObjectType, $ownerName)
                } catch {
                    throw ("VBA_DELETE_INVALID_TARGET: '{0}' es un document module que no se puede quitar con VBComponents.Remove() y el objeto Access '{1}' tampoco pudo eliminarse: {2}" -f $componentName, $ownerName, $_.Exception.Message)
                }
                # Persist via save-only (acCmdSaveAllModules = 280); the human compiles.
                try { $AccessApplication.RunCommand(280) } catch { Write-Debug "Diagnostics: $_" }
                $checkCompName = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
                if ($checkCompName) {
                    throw "Active lock detected: the VBA component '$ModuleName' remains in the project after deletion attempt."
                }
                return [pscustomobject]@{
                    module  = $ModuleName
                    status  = "ok"
                    deleted = $componentName
                    kind    = "DocumentModule-DeleteObject"
                }
            }

            throw ("No se pudo eliminar componente '{0}': {1}" -f $componentName, $_.Exception.Message)
        }
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

function Remove-TempSccObjects {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)]$VbProject,
        [string[]]$ExistingNames = @()
    )

    $deleted = New-Object System.Collections.Generic.List[string]
    $existing = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($existingName in @($ExistingNames)) {
        if (-not [string]::IsNullOrWhiteSpace($existingName)) { [void]$existing.Add([string]$existingName) }
    }

    foreach ($kind in @('Forms', 'Reports')) {
        $objectType = if ($kind -eq 'Reports') { 3 } else { 2 } # acReport=3, acForm=2
        foreach ($name in @(Get-AccessObjectNames -AccessApplication $AccessApplication -Kind $kind)) {
            if ($name -notmatch '^(Form_|Report_)?TempSccObj\d+$') { continue }
            if ($existing.Contains([string]$name)) { continue }
            try {
                $AccessApplication.DoCmd.DeleteObject($objectType, $name)
                $deleted.Add([string]$name) | Out-Null
            } catch {
                Write-Debug "Diagnostics: $_"
            }
        }
    }

    $components = $VbProject.VBComponents
    try {
        for ($i = $components.Count; $i -ge 1; $i--) {
            $component = $null
            try {
                $component = $components.Item($i)
                $name = [string]$component.Name
                if ($name -notmatch '^(Form_|Report_)?TempSccObj\d+$') { continue }
                if ($existing.Contains($name)) { continue }
                $components.Remove($component)
                $deleted.Add($name) | Out-Null
            } catch {
                Write-Debug "Diagnostics: $_"
            } finally {
                if ($component) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
            }
        }
    } finally {
        if ($components) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($components) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
    }

    return @($deleted | Sort-Object -Unique)
}

function Get-TempSccObjectNames {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)]$VbProject
    )

    $names = New-Object System.Collections.Generic.List[string]
    foreach ($kind in @('Forms', 'Reports')) {
        foreach ($name in @(Get-AccessObjectNames -AccessApplication $AccessApplication -Kind $kind)) {
            if ($name -match '^(Form_|Report_)?TempSccObj\d+$') { $names.Add([string]$name) | Out-Null }
        }
    }

    $components = $VbProject.VBComponents
    try {
        for ($i = 1; $i -le $components.Count; $i++) {
            $component = $null
            try {
                $component = $components.Item($i)
                $name = [string]$component.Name
                if ($name -match '^(Form_|Report_)?TempSccObj\d+$') { $names.Add($name) | Out-Null }
            } catch {
                Write-Debug "Diagnostics: $_"
            } finally {
                if ($component) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
            }
        }
    } finally {
        if ($components) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($components) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
    }

    return @($names | Sort-Object -Unique)
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
            # DoCmd.CopyObject is not Unicode-safe: non-ASCII characters in the new object name
            # are mangled by the ANSI codepage (e.g. "Módulo1" becomes "Mód×lo1"). Force the
            # correct name via the COM property setter, which is Unicode-safe (same path as VBE
            # F4 → Name). This is a no-op when CopyObject happened to produce the right name.
            Set-VbComponentNameSafe -Component $newComponent -Name $ModuleName
        } else {
            $newComponent = $VbProject.VBComponents.Add($componentType)
            Set-VbComponentNameSafe -Component $newComponent -Name $ModuleName
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

    # feat-759-no-compile / Slice 1 — the previous code tried
    # `RunCommand(126)` (acCmdCompileAndSaveAllModules) first and fell
    # back to `RunCommand(280)` (acCmdSaveAllModules) on failure. The
    # 126 attempt is dropped entirely: 280 saves modules without
    # compiling, so it cannot fail because of pre-existing project
    # compile state. The human compiles in Access.
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

# ========================================================================
# feat-759-no-compile (v1.19.0) — Compile-machinery removed.
#
# The following PowerShell functions were deleted in PR-2:
#   - Get-ActiveVbeLocation      (~lines :2701-:2832) — only called by
#                                  Invoke-CompileVbaProject
#   - New-CompileFailureResult   (~lines :2834-:2859) — emits the
#                                  VBA_COMPILE_ERROR envelope (which is
#                                  gone from the error taxonomy)
#   - Invoke-CompileVbaProject   (~lines :2861-:2906) — calls RunCommand(126)
#                                  (= acCmdCompileAndSaveAllModules); the only
#                                  internal caller was the now-removed
#                                  compile_vba MCP tool
#   - Invoke-CompileAction       (~lines :4265-:4294) — top-level compile
#                                  dispatcher that called
#                                  Invoke-CompileVbaProject
#
# The remaining persistence path (import_modules, import_all, delete_module)
# uses RunCommand(280) = acCmdSaveAllModules (save WITHOUT compile). The
# human compiles in Access (Debug > Compile). See
# openspec/specs/vba-manager-actions/spec.md "Save-only persistence".
# ========================================================================

function Import-DocumentCodeBehind {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$VbProject,
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [Parameter(Mandatory = $true)][string]$SourcePath
    )

    # Overwrites the code module of an already-existing document (form/report)
    # component with the canonical code-behind from $SourcePath (a `.cls`). Called
    # after a form/report is loaded via LoadFromText so the `.cls` — the source of
    # truth verify_code compares against — wins over the `.form.txt`'s embedded
    # (and possibly stale) copy. Reuses the same DeleteLines + AddFromFile path
    # that importMode=Code uses for document code-behind.
    #
    # issue #849 — VB_Name normalization guard. AddFromFile silently applies the
    # source's `Attribute VB_Name` (if present) and otherwise lets VBE invent
    # a temporary name (`Form_TempSccObj1`, `Form_TempSccObj2`, ...). A
    # mismatched or missing VB_Name breaks the `.cls` <-> form-instance link:
    # the form's code module survives with the canonical `Form_<name>` name in
    # the VBE, but `Me.X` then resolves against a stale instance. Ensure-VbNameAttributeAtTop
    # is idempotent on already-canonical text, so we always run it as a guard.
    $componentName = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
    if (-not $componentName) {
        throw ("No se encontro el document module '{0}' tras LoadFromText; no se pudo sincronizar el code-behind desde '{1}'." -f $ModuleName, $SourcePath)
    }

    $ext = [System.IO.Path]::GetExtension($SourcePath)
    $tmpAnsi = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("VBAManager_codebehind_{0}{1}" -f @([guid]::NewGuid().ToString("N"), $ext))
    $component = $null
    $codeModule = $null
    try {
        Convert-Utf8CodeImportToAnsiTempFile -InputPath $SourcePath -TempPath $tmpAnsi
        # issue #849 — normalize the temp file so it carries
        # `Attribute VB_Name = "<ModuleName>"` before AddFromFile sees it. The
        # helper is text-only and idempotent; doing it here keeps the surface
        # auditable and avoids regressing the contract in any future caller
        # that bypasses the export-time normalization.
        $ansiEncoding = [System.Text.Encoding]::GetEncoding(1252)
        $normalizedText = [System.IO.File]::ReadAllText($tmpAnsi, $ansiEncoding)
        $normalizedText = Ensure-VbNameAttributeAtTop -Text $normalizedText -ModuleName $ModuleName
        [System.IO.File]::WriteAllText($tmpAnsi, $normalizedText, $ansiEncoding)
        $component = $VbProject.VBComponents.Item($componentName)
        $codeModule = $component.CodeModule
        $count = $codeModule.CountOfLines
        if ($count -gt 0) { $codeModule.DeleteLines(1, $count) }
        $codeModule.AddFromFile($tmpAnsi)
    } finally {
        if ($tmpAnsi -and (Test-Path -Path $tmpAnsi)) { Remove-Item -Path $tmpAnsi -Force -ErrorAction SilentlyContinue }
        foreach ($obj in @($codeModule, $component)) {
            if ($obj) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) | Out-Null } catch { Write-Debug "Diagnostics: $_" } }
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
        [string]$ImportMode = "Auto"
    )

    # Per-module phase tracking (R2 of the consumer request). The script-
    # scoped variable survives the throw back to the Invoke-ImportAction
    # catch block, which turns it into structured per-module reporting.
    # Valid values: locate-source | remove-existing | import | compile.
    $script:ImportCurrentPhase = "locate-source"
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
            $script:ImportCurrentPhase = "remove-existing"
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

            $script:ImportCurrentPhase = "import"
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

            # The document we just loaded carries an embedded copy of the
            # code-behind, but the canonical code lives in the sibling `.cls`
            # (what verify_code compares). Sync that `.cls` into the freshly
            # loaded document module so the canonical code wins over a
            # possibly-stale embedded copy. Only Code mode skips this block (it
            # resolves the `.cls` directly and never reaches LoadFromText); the
            # deprecated Form alias now normalizes to Auto, so it syncs too.
            $codeBehindSrc = Resolve-FormCodeBehindFile -ModulesPath $ModulesPath -ModuleName $ModuleName
            if ($codeBehindSrc) {
                Import-DocumentCodeBehind -VbProject $VbProject -ModuleName $ModuleName -SourcePath $codeBehindSrc
            }

            return [pscustomobject]@{
                CreatedNewComponent  = $false
                RequiresExplicitSave = $false
                # issue #849 — ReimportedDocument signals that this import replaced
                # an existing form/report in the binary (LoadFromText was a
                # replacement, not a creation). Invoke-ImportAction aggregates
                # these into ModifiedDocumentNames so the dispatcher can call
                # Save-VbaProjectModules even when CreatedComponentNames is
                # empty (the previous gate). Without this signal, dirty COM
                # state from the LoadFromText + Import-DocumentCodeBehind pair
                # never persisted.
                ReimportedDocument   = $documentExistsInAccess
                # R2 consumer-request fields. Keep CreatedNewComponent /
                # RequiresExplicitSave intact for backward compatibility with
                # existing tests; phase is null on the happy path (no failure).
                Phase                = $null
                Error                = $null
                DurationMs           = 0
                RollbackApplied      = $false
            }
        }

        # FIX: modulos y clases — DeleteLines + AddFromFile como primera opcion
        # Evita VBComponents.Remove() que puede disparar dialogo VBE en instancias visibles
        Convert-Utf8ToAnsiTempFile -InputPath $src -TempPath $tmpAnsi
        $tmpAnsiSanitized = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("VBAManager_import_sanitized_{0}{1}" -f @([guid]::NewGuid().ToString("N"), $ext))
        Convert-Utf8CodeImportToAnsiTempFile -InputPath $src -TempPath $tmpAnsiSanitized
        $script:ImportCurrentPhase = "remove-existing"
        $actualComponentName = Resolve-ExistingComponentName -VbProject $VbProject -ModuleName $ModuleName
        $looksLikeDocumentCode = ($ext -ieq '.cls') -and (Test-LooksLikeDocumentCodeTarget -ModuleName $ModuleName -SourcePath $src -ModulesPath $ModulesPath)
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

            # issue #752 — defensive validation #1: VB_Name collision.
            # If the source file declares `Attribute VB_Name = "<X>"` and that X
            # differs from $actualComponentName (the resolved existing component),
            # Access's CodeModule.AddFromFile still applies the source's VB_Name,
            # producing a silent rename. Refuse and surface a structured error so
            # the caller can rename the source file (or pass the matching
            # moduleName) instead of inheriting a misnamed module.
            $sourceVbName = Get-VbNameFromSourceFile -Path $src
            if (-not [string]::IsNullOrEmpty($sourceVbName) -and $sourceVbName -ne $actualComponentName) {
                throw ("VB_NAME_MISMATCH: source file declares Attribute VB_Name = '{0}' but moduleName parameter '{1}' resolves to existing component '{2}'. " +
                       "Resolve the conflict by renaming the source file or passing the matching moduleName. " +
                       "Use -VerboseContract to see source/destination hashes." -f $sourceVbName, $ModuleName, $actualComponentName)
            }

            # issue #752 — defensive validation #2: duplicate Option directives.
            # VBA rejects files with more than one Option Explicit / Option Compare
            # / Option Base / Option Private Module. AddFromFile currently passes
            # them through verbatim and Access fails downstream with a confusing
            # compile error. Fail fast here with a typed error code.
            if (Test-SourceFileHasDuplicateOptions -Path $src) {
                throw ("DUPLICATE_OPTION_DIRECTIVE: source file '{0}' has duplicate Option Explicit/Compare directives; VBA will reject the import." -f $src)
            }

            # issue #752 / F16 — compare the visible source that CodeModule can
            # contain, not hidden Attribute metadata that AddFromString strips
            # and the VBE does not expose through CountOfLines.
            $codeTextForStringImport = Convert-VbaTextForCodeModuleString -Text ([System.IO.File]::ReadAllText($tmpAnsiSanitized, [System.Text.Encoding]::GetEncoding(1252)))
            $visibleSourceLines = Get-VbaTextLineCount -Text $codeTextForStringImport
            $importVerboseSource = $null
            if ($script:ImportVerbose) {
                $importVerboseSource = Get-VbaTextSizeSnapshot -Text $codeTextForStringImport
            }

            $count = $codeModule.CountOfLines
            $shouldAllowStringFallback = Test-ShouldUseCodeModuleStringFallback -SourceLines ([int]$visibleSourceLines) -ExistingLines ([int]$count)
            $mutationStarted = $false
            $fallbackUsed = $false
            $fallbackReason = $null
            $rollbackResult = $null
            $script:ImportLastRollbackApplied = $false
            $script:ImportLastRollbackError = $null
            $script:ImportLastFallbackUsed = $false
            $script:ImportLastFallbackReason = $null
            $script:ImportLastRollbackAttempted = $false
            $originalCodeModuleSnapshot = Get-CodeModuleTextSnapshot -CodeModule $codeModule
            if (-not $originalCodeModuleSnapshot.success) {
                throw ("VBA_IMPORT_ROLLBACK_SNAPSHOT_FAILED: could not capture original module text before import mutation: {0}" -f $originalCodeModuleSnapshot.error)
            }
            $mutationStarted = $true
            if ($count -gt 0) { $codeModule.DeleteLines(1, $count) }
            $script:ImportCurrentPhase = "import"
            $codeModule.AddFromFile($tmpAnsiSanitized)
            $expectedImportedLines = [int]$visibleSourceLines
            $effectiveVerboseSource = $importVerboseSource

            # F16: keep the headless-safe DeleteLines + AddFromFile path as the
            # first attempt. If Access still applies the previous CountOfLines
            # cap for a source-larger update, clear the same component again and
            # paste visible code via AddFromString. This deliberately avoids
            # VBComponents.Remove(), which can raise VBE Save As UI prompts in
            # visible instances.
            $afterAddFromFileLines = 0
            try { $afterAddFromFileLines = [int]$codeModule.CountOfLines } catch { $afterAddFromFileLines = 0 }
            if ($shouldAllowStringFallback -and [int]$visibleSourceLines -gt $afterAddFromFileLines) {
                $fallbackUsed = $true
                $fallbackReason = "add_from_file_truncated"
                if ($afterAddFromFileLines -gt 0) { $codeModule.DeleteLines(1, $afterAddFromFileLines) }
                $expectedImportedLines = Get-VbaTextLineCount -Text $codeTextForStringImport
                if ($script:ImportVerbose) {
                    $effectiveVerboseSource = Get-VbaTextSizeSnapshot -Text $codeTextForStringImport
                }
                if (-not [string]::IsNullOrWhiteSpace($codeTextForStringImport)) {
                    $codeModule.AddFromString($codeTextForStringImport)
                }
            }

            # issue #752 — defensive validation #3: post-import truncation check.
            # If the source file's line count is strictly greater than the
            # destination's CountOfLines after AddFromFile, the import was
            # silently truncated. AddFromFile in v1.15.7 truncates when the
            # pre-existing component's CountOfLines was smaller than the source
            # (see issue #752 repro). Source-larger than destination is the
            # truncation signature; we allow source == destination (perfect
            # match) and source < destination (grew; fine).
            $destLines = 0
            try { $destLines = [int]$codeModule.CountOfLines } catch { $destLines = 0 }
            $srcLines = 0
            try {
                $srcLines = [int]$expectedImportedLines
            } catch { $srcLines = 0 }
            if ($srcLines -gt $destLines -and $srcLines -gt 0) {
                throw ("IMPORT_TRUNCATED: source has {0} lines, destination has {1} lines. " +
                       "The pre-existing module's CountOfLines may have capped AddFromFile. " +
                       "Pass -VerboseContract (verbose:true) or manually remove the existing module first." -f $srcLines, $destLines)
            }

            # issue #752 — opt-in verbose snapshot of the destination (binary)
            # after AddFromFile. Compute truncated/mismatchReason from the two
            # snapshots; $null means the destination mirrors the source.
            $importVerboseDest = $null
            $importVerboseTruncated = $false
            $importVerboseMismatch = $null
            if ($script:ImportVerbose) {
                $importVerboseDest = Get-CodeModuleSizeSnapshot -CodeModule $codeModule
                if ($effectiveVerboseSource -and $importVerboseDest) {
                    $importVerboseTruncated = ([int]$importVerboseDest.lines -lt [int]$effectiveVerboseSource.lines)
                    if (-not $importVerboseTruncated) {
                        if ([string]$importVerboseDest.sha256 -ne [string]$effectiveVerboseSource.sha256) {
                            $importVerboseMismatch = "content_hash"
                        }
                    } else {
                        $importVerboseMismatch = "line_count"
                    }
                }
            }

            $importResultVerbose = $null
            if ($script:ImportVerbose) {
                $importResultVerbose = [pscustomobject]@{
                    source         = $effectiveVerboseSource
                    destination    = $importVerboseDest
                    truncated      = [bool]$importVerboseTruncated
                    mismatchReason = $importVerboseMismatch
                }
            }

            return [pscustomobject]@{
                CreatedNewComponent  = $false
                RequiresExplicitSave = $false
                Phase                = $null
                Error                = $null
                DurationMs           = 0
                RollbackApplied      = $false
                FallbackUsed         = [bool]$fallbackUsed
                FallbackReason       = $fallbackReason
                # issue #752 — opt-in verbose contract. The pscustomobject
                # shape stays backward-compatible: when -VerboseContract is
                # not requested, Verbose is $null and existing consumers ignore
                # the field. When requested, downstream Invoke-ImportAction
                # forwards this object into the per-module entry of the
                # DYSFLOW_RESULT envelope.
                Verbose              = $importResultVerbose
            }
        } catch {
            if ($_.Exception.Message -ne 'COMPONENTE_NO_ENCONTRADO') {
                if ($mutationStarted) {
                    $script:ImportLastRollbackAttempted = $true
                    $rollbackResult = Restore-CodeModuleTextSnapshot -CodeModule $codeModule -Snapshot $originalCodeModuleSnapshot
                    $script:ImportLastRollbackApplied = [bool]$rollbackResult.applied
                    $script:ImportLastRollbackError = $rollbackResult.error
                }
                $script:ImportLastFallbackUsed = [bool]$fallbackUsed
                $script:ImportLastFallbackReason = $fallbackReason
                throw
            }

            if ($looksLikeDocumentCode) {
                throw ("Import bloqueado: '{0}' parece code-behind de formulario/reporte, pero no existe un document module resoluble en la BD. " +
                       "Se cancela para evitar crear módulos espurios como 'Módulo1' o 'Módulo2'. " +
                       "Usa 'import'/'import-form' según el caso o corrige el nombre del formulario/document module." -f $ModuleName)
            }

            # El componente no existe aun — crear explícitamente SOLO para clases/modulos normales.
            # Evita prompts/modales de VBE asociados a VBComponents.Import() y mantiene control del nombre final.
            $script:ImportCurrentPhase = "import"
            $newResult = New-VbComponentFromCodeFile -AccessApplication $AccessApplication -VbProject $VbProject -ModuleName $ModuleName -SourcePath $src -SanitizedAnsiPath $tmpAnsiSanitized
            # Augment the existing return with the consumer-request fields so the
            # upstream caller (Invoke-ImportAction) sees the same shape it sees for
            # the update path. CreatedNewComponent / RequiresExplicitSave stay as-is.
            return [pscustomobject]@{
                CreatedNewComponent  = $newResult.CreatedNewComponent
                RequiresExplicitSave = $newResult.RequiresExplicitSave
                Phase                = $null
                Error                = $null
                DurationMs           = 0
                RollbackApplied      = $false
                FallbackUsed         = $false
                FallbackReason       = $null
            }
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
        $targets = @(Get-ChildItem -Path $ModulesPath -Recurse -File -Include "*.bas", "*.cls", "*.frm", "*.form.txt", "*.report.txt" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
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

    foreach ($n in $names) {
        Assert-SafeVbaModuleName -ModuleName $n
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
    if ($oneBased -ge 0 -and $oneBased -lt 10) { return $oneBased }
    if ($raw -ge 0 -and $raw -lt 10) { return $raw }
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

        # Issue #2: Guard for parameterless execution
        if ($ProcedureArgs.Count -eq 0 -and $metadata.Count -eq 0) {
            try {
                $result = $AccessApplication.Run($ProcedureName)
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
                    argsCount   = 0
                    returnValue = $returnValue
                    returnType  = $returnType
                    byref_values = [pscustomobject]@{}
                    payload     = $decoded.payload
                    logs        = @($decoded.logs)
                    error       = $errorText
                }
            } catch {
                return [pscustomobject]@{
                    ok          = $false
                    procedure   = $ProcedureName
                    argsCount   = 0
                    returnValue = $null
                    returnType  = $null
                    byref_values = [pscustomobject]@{}
                    payload     = $null
                    logs        = @()
                    error       = $_.Exception.Message
                }
            }
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
                    $effectiveArgs.Add([System.Reflection.Missing]::Value) | Out-Null
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
                $invokeArgs += [System.Reflection.Missing]::Value
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
                while ($invokeArgs.Count -le [int]$retryIndex) {
                    $invokeArgs += [System.Reflection.Missing]::Value
                }
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

function Invoke-ExportAction {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [string[]]$NormalizedModules,
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [switch]$Json
    )
    $vbProject  = $Session.VbProject
    $components = $vbProject.VBComponents

    $targets = @()
    $warnings = @()
    if ($NormalizedModules.Count -gt 0) {
        # Issue #804 — pre-validation is TOTAL over the input list. A missing
        # module is a per-module result, not a call-level error: surface it
        # in the structured warnings[] payload (with a stable error code) and
        # continue exporting the modules that DO exist. This lets the
        # verify_code consumer run with a comprehensive moduleNames list and
        # get a full missingInBinary[] back instead of an opaque abort.
        foreach ($requestedName in $NormalizedModules) {
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
                # Check COM reflection if not in VBProject
                $info = Resolve-AccessObjectInfo -AccessApplication $Session.AccessApplication -ModuleName $requestedName
                if ($info.Exists) {
                    $found = $true
                }
            }
            if (-not $found) {
                Write-Status -Message ("WARN: Modulo '{0}' no existe en el proyecto VBA - se omite del export." -f $requestedName) -Color Yellow
                $warnings += @{
                    module  = $requestedName
                    error   = "VBA_MODULE_NOT_FOUND"
                    message = "El modulo '$requestedName' no existe en el proyecto VBA."
                }
                continue
            }
            $targets += $requestedName
        }
    } else {
        # Collect all standard modules and class modules from VBProject (type 1 and 2)
        for ($i = 1; $i -le $components.Count; $i++) {
            $c = $components.Item($i)
            try {
                $type = [int]$c.Type
                if ($type -eq 1 -or $type -eq 2) {
                    $targets += $c.Name
                }
            } finally {
                try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($c) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
            }
        }

        # Collect all forms from CurrentProject.AllForms
        $forms = @(Get-AccessObjectNames -AccessApplication $Session.AccessApplication -Kind Forms)
        foreach ($fName in $forms) {
            if ($fName -match '^Form_|^frm') {
                $targets += $fName
            } else {
                $targets += "Form_" + $fName
            }
        }

        # Collect all reports from CurrentProject.AllReports
        $reports = @(Get-AccessObjectNames -AccessApplication $Session.AccessApplication -Kind Reports)
        foreach ($rName in $reports) {
            if ($rName -match '^Report_') {
                $targets += $rName
            } else {
                $targets += "Report_" + $rName
            }
        }

        $targets = $targets | Sort-Object -Unique

        # Ensure directories exist
        foreach ($sub in @("forms", "reports", "modules", "classes")) {
            $p = Join-Path -Path $ModulesPath -ChildPath $sub
            if (-not (Test-Path -Path $p)) {
                New-Item -Path $p -ItemType Directory -Force | Out-Null
            }
        }
    }

    $exported = @()
    $total = $targets.Count
    $idx = 0
    foreach ($name in $targets) {
        $idx++
        Write-Status -Message ("[{0}/{1}] Exportando: {2}" -f $idx, $total, $name) -Color Cyan
        try {
            Export-VbaModule -VbProject $vbProject -ModuleName $name -ModulesPath $ModulesPath -AccessApplication $Session.AccessApplication
            $exported += $name
        } catch {
            if ($Json) {
                $errMsg = $_.Exception.Message
                Write-Status -Message ("WARN: No se pudo exportar '{0}': {1}" -f $name, $errMsg) -Color Yellow
                $warnings += @{
                    module = $name
                    error = $errMsg
                    message = $errMsg
                }
            } else {
                throw
            }
        }
    }

    if ($NormalizedModules.Count -eq 0) {
        # Export saved queries using open DAO session
        $db = $null
        $queryDefs = $null
        try {
            $db = $Session.AccessApplication.CurrentDb()
            if ($db) {
                $queriesFolder = Join-Path -Path $ModulesPath -ChildPath "queries"
                if (-not (Test-Path -Path $queriesFolder)) {
                    New-Item -Path $queriesFolder -ItemType Directory -Force | Out-Null
                }

                $queryDefs = $db.QueryDefs
                $queryList = @()
                for ($i = 0; $i -lt $queryDefs.Count; $i++) {
                    $q = $queryDefs.Item($i)
                    try {
                        $qName = $q.Name
                        # Exclude system/temporary queries
                        if ($qName -like '~*' -or $qName -like 'MSys*') {
                            continue
                        }

                        $sqlText = $q.SQL
                        $sanitizedName = $qName -replace '[^a-zA-Z0-9_-]', '_'
                        $sqlFileName = "$sanitizedName.sql"
                        $sqlFilePath = Join-Path -Path $queriesFolder -ChildPath $sqlFileName

                        Write-Utf8NoBom -Path $sqlFilePath -Text $sqlText

                        $queryList += [ordered]@{
                            name = $qName
                            file = "queries/$sqlFileName"
                        }
                    } finally {
                        if ($q) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($q) | Out-Null } catch {} }
                    }
                }

                # Write queries.json index
                $jsonIndex = $queryList | ConvertTo-Json -Depth 6
                $jsonIndexPath = Join-Path -Path $queriesFolder -ChildPath "queries.json"
                Write-Utf8NoBom -Path $jsonIndexPath -Text $jsonIndex
            }
        } catch {
            Write-Status -Message ("WARN: No se pudieron exportar queries a traves de DAO: {0}" -f $_.Exception.Message) -Color Yellow
        } finally {
            if ($queryDefs) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($queryDefs) | Out-Null } catch {} }
            if ($db) { try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($db) | Out-Null } catch {} }
        }
    }

    $exportResult = @{
        ok = $true
        exported = $exported
    }
    if ($warnings.Count -gt 0) {
        $exportResult["warnings"] = $warnings
    }
    Write-DysflowResult -Result $exportResult -Depth 4
    Write-Status -Message ("OK Export completado ({0})" -f $exported.Count) -Color Green
}

function Invoke-ListObjectsAction {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Session,
        [switch]$Json
    )

    $inventory = Get-FrontendInventory -AccessApplication $Session.AccessApplication -VbProject $Session.VbProject
    if ($Json) {
        Write-DysflowResult -Result $inventory -Depth 6
    } else {
        Write-Status -Message ("Forms: {0}" -f ($inventory.forms -join ", ")) -Color Cyan
        Write-Status -Message ("Reports: {0}" -f ($inventory.reports -join ", ")) -Color Cyan
        Write-Status -Message ("Modules: {0}" -f ($inventory.modules -join ", ")) -Color Cyan
        Write-Status -Message ("Classes: {0}" -f ($inventory.classes -join ", ")) -Color Cyan
        Write-Status -Message ("DocumentModules: {0}" -f ($inventory.documentModules -join ", ")) -Color Cyan
    }
}

# ========================================================================
# Issue #807 (Feature 1) - Invoke-ListVbaModulesAction.
#
# Walks VBProject.VBComponents exactly ONCE and emits a structured payload
# describing each component (name, type, fileType, binaryPath). Released every
# component COM reference in `finally { FinalReleaseComObject }` so this
# routine never leaks - the same COM-lifetime contract as Get-FrontendInventory.
#
# Filters:
#   - typeFilter: standard|class|form|report|document (mapped to a VBComponent.Type)
#   - namePattern: glob-style (single `*` wildcard on either end)
#
# Cross-reference against the on-disk source tree is computed by the TS-side
# service (runListVbaModules). This script reports the binary side only.
# ========================================================================
function Invoke-ListVbaModulesAction {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Session,
        [string]$TypeFilter = "",
        [string]$NamePattern = "",
        [switch]$ApplyTypeFilter,
        [switch]$ApplyNamePattern,
        [switch]$Json
    )

    # Map user-facing typeFilter into the integer VBComponent.Type we filter on.
    # `form` and `report` both map to 3 (acForm); the runner distinguishes them
    # later via the form/report kind on the TS side, but for the binary walk
    # we surface every type 3 component unconditionally.
    $typeFilterCode = $null
    if ($ApplyTypeFilter) {
        switch ($TypeFilter) {
            "standard" { $typeFilterCode = 1 }
            "class"    { $typeFilterCode = 2 }
            "form"     { $typeFilterCode = 3 }
            "report"   { $typeFilterCode = 3 }
            "document" { $typeFilterCode = 100 }
            default {
                throw ("TypeFilter invalido: {0}. Valores permitidos: standard|class|form|report|document." -f $TypeFilter)
            }
        }
    }

    # namePattern: lead/trail `*` only. After stripping the wildcards the
    # remaining substring is the only filter (case-insensitive contains).
    # Empty after trim means "match nothing".
    $nameNeedle = ""
    if ($ApplyNamePattern) {
        $trimmed = ([string]$NamePattern) -replace '^\*+|\*+$', ''
        $nameNeedle = $trimmed.ToLowerInvariant()
    }

    $components = $Session.VbProject.VBComponents
    $rows = New-Object System.Collections.Generic.List[object]
    try {
        for ($i = 1; $i -le $components.Count; $i++) {
            $component = $null
            try {
                $component = $components.Item($i)
                $vbType = [int]$component.Type

                if ($ApplyTypeFilter -and $vbType -ne $typeFilterCode) { continue }
                $name = [string]$component.Name
                if ($ApplyNamePattern) {
                    # match no rows when $nameNeedle is empty
                    if ($nameNeedle.Length -eq 0) { continue }
                    if (-not $name.ToLowerInvariant().Contains($nameNeedle)) { continue }
                }

                $fileType = switch ($vbType) {
                    1 { "bas" }
                    2 { "cls" }
                    3 { "form.txt" }
                    100 { "report.txt" }
                    default { "cls" }
                }
                $rows.Add([ordered]@{
                    name = $name
                    type = $vbType
                    fileType = $fileType
                })
            } finally {
                if ($component) {
                    try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($component) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
                }
            }
        }
    } finally {
        if ($components) {
            try { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($components) | Out-Null } catch { Write-Debug "Diagnostics: $_" }
        }
    }

    $appliedType = if ($ApplyTypeFilter) { [string]$TypeFilter } else { $null }
    $appliedName = if ($ApplyNamePattern) { [string]$NamePattern } else { $null }
    $payload = [ordered]@{
        ok = $true
        components = @($rows.ToArray())
        appliedFilters = [ordered]@{
            typeFilter = $appliedType
            namePattern = $appliedName
        }
    }
    if ($Json) {
        Write-DysflowResult -Result $payload -Depth 6
    } else {
        Write-Status -Message ("Components: {0}" -f $rows.Count) -Color Cyan
    }
}

function Invoke-ExistsAction {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)][string]$ModuleName,
        [switch]$Json
    )

    $info = Get-ExistsInfo -AccessApplication $Session.AccessApplication -VbProject $Session.VbProject -ModuleName $ModuleName
    if ($Json) {
        Write-DysflowResult -Result $info -Depth 6
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
}

function Invoke-GenerateErdAction {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $false)][string]$BackendPath,
        [Parameter(Mandatory = $true)][string]$DestinationRoot,
        [Parameter(Mandatory = $false)][string]$ErdPath,
        [Parameter(Mandatory = $false)][string]$Password,
        [switch]$Json
    )

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

    $result = @{
        ok = $true
        markdownFile = $mdFile
    }
    Write-DysflowResult -Result $result -Depth 4
    Write-Status -Message ("OK ERD generado en: {0}" -f $mdFile) -Color Green
}

function Invoke-DeleteAction {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [string[]]$NormalizedModules,
        [switch]$Json,
        [switch]$Force
    )

    if ($NormalizedModules.Count -eq 0) {
        throw "Delete requiere al menos un nombre de módulo/objeto."
    }

    $vbProject = $Session.VbProject
    $moduleResults = New-Object System.Collections.Generic.List[object]
    $idx = 0
    foreach ($name in $NormalizedModules) {
        $idx++
        Write-Status -Message ("[{0}/{1}] Eliminando: {2}" -f $idx, $NormalizedModules.Count, $name) -Color Cyan
        try {
            $existingTempSccObjects = @(Get-TempSccObjectNames -AccessApplication $Session.AccessApplication -VbProject $vbProject)
            $result = Remove-AccessObjectOrComponent -AccessApplication $Session.AccessApplication -VbProject $vbProject -ModuleName $name -Force:$Force
            $tempSccObjectsCleaned = @(Remove-TempSccObjects -AccessApplication $Session.AccessApplication -VbProject $vbProject -ExistingNames $existingTempSccObjects)
            $result | Add-Member -MemberType NoteProperty -Name tempSccObjectsCleaned -Value $tempSccObjectsCleaned -Force
            $moduleResults.Add($result) | Out-Null
        } catch {
            $moduleResults.Add([pscustomobject]@{
                module = [string]$name
                status = "error"
                error  = [string]$_.Exception.Message
            }) | Out-Null
        }
    }
    Write-DysflowResult -Result (@($moduleResults.ToArray())) -Depth 4
    $failedDeletes = @($moduleResults | Where-Object { $_.status -eq "error" })
    if ($failedDeletes.Count -gt 0) {
        throw ("Delete no pudo completar {0}/{1} objeto(s): {2}" -f $failedDeletes.Count, $NormalizedModules.Count, (($failedDeletes | ForEach-Object { "{0}: {1}" -f $_.module, $_.error }) -join "; "))
    }
    Write-Status -Message ("OK Delete completado ({0})" -f $NormalizedModules.Count) -Color Green
}

# ========================================================================
# feat-759-no-compile (v1.19.0) — Invoke-CompileAction removed.
#
# Was the top-level compile dispatcher. The `Compile` PowerShell action is
# no longer reachable: the compile_vba MCP tool is gone, the inline
# execution path skips the explicit compile step (letting run_vba surface
# any compile error as a regular run failure), and no other dispatcher
# branch invokes it.
# ========================================================================

function Invoke-RunProcedureAction {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)][string]$ProcedureName,
        # AllowEmptyString: a no-arg procedure (run_vba / vba_inline_execution with no
        # args) passes "". A bare Mandatory [string] rejects empty with a binding error
        # before the body runs; Convert-ProcedureArgsJson already maps empty -> @().
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$ProcedureArgsJson,
        [switch]$Json
    )

    $procedureArgs = Convert-ProcedureArgsJson -JsonText $ProcedureArgsJson
    $runResult = Invoke-AccessProcedure -AccessApplication $Session.AccessApplication -VbProject $Session.VbProject -ProcedureName $ProcedureName -ProcedureArgs $procedureArgs
    if ($Json) {
        Write-DysflowResult -Result $runResult -Depth 6
    } else {
        if ($runResult.ok) {
            Write-Status -Message ("OK {0} ejecutado. ReturnValue: {1}" -f $runResult.procedure, $runResult.returnValue) -Color Green
        } else {
            Write-Status -Message ("ERROR {0}: {1}" -f $runResult.procedure, $runResult.error) -Color Red
        }
    }
}

function Invoke-RunTestsAction {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][ref]$Session,
        [string]$ProceduresJson = "",
        [string]$ProceduresJsonFile = "",
        [Parameter(Mandatory = $true)][string]$AccessPath,
        [string]$Password = "",
        [switch]$AllowStartupExecution,
        [switch]$Json
    )

    if (-not [string]::IsNullOrWhiteSpace($ProceduresJsonFile)) {
        $ProceduresJson = Get-Content -Path $ProceduresJsonFile -Raw -Encoding UTF8
    }
    if ([string]::IsNullOrWhiteSpace($ProceduresJson)) {
        throw "Run-Tests requiere -ProceduresJson o -ProceduresJsonFile con un array JSON de procedimientos."
    }

    $procedures = ConvertFrom-Json -InputObject $ProceduresJson
    $Session.Value = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
    $batchResults = Invoke-AccessProcedureBatch -AccessApplication $Session.Value.AccessApplication -VbProject $Session.Value.VbProject -Procedures $procedures
    if ($Json) {
        Write-DysflowResult -Result @($batchResults) -Depth 6
    }
}

function Invoke-FixEncodingAction {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][ref]$Session,
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$NormalizedModules,
        [Parameter(Mandatory = $true)][string]$Location,
        [string]$AccessPath = "",
        [string]$Password = "",
        [switch]$AllowStartupExecution,
        [switch]$Json
    )

    $fixedSrc = 0
    $fixedAccess = 0

    if ($Location -eq "Src" -or $Location -eq "Both") {
        $fixedSrc = Fix-EncodingInSrc -ModulesPath $ModulesPath -ModuleName $NormalizedModules
        Write-Status -Message ("Fix-Encoding (Src): {0}" -f $fixedSrc) -Color Yellow
    }

    if ($Location -eq "Access" -or $Location -eq "Both") {
        $Session.Value = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        $fixedAccess = Fix-EncodingInAccess -VbProject $Session.Value.VbProject -ModulesPath $ModulesPath -ModuleName $NormalizedModules -AccessApplication $Session.Value.AccessApplication
        Write-Status -Message ("Fix-Encoding (Access): {0}" -f $fixedAccess) -Color Yellow
    }

    $result = @{
        ok = $true
        fixedSrc = $fixedSrc
        fixedAccess = $fixedAccess
    }
    Write-DysflowResult -Result $result -Depth 4
    Write-Status -Message "OK Fix-Encoding completado" -Color Green
}

function Invoke-ImportAction {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [string[]]$NormalizedModules,
        [Parameter(Mandatory = $true)][string]$ModulesPath,
        [Parameter(Mandatory = $true)][string]$ImportMode,
        # R4: when bound, an empty NormalizedModules list is treated as an
        # explicit no-op plan (no Get-ChildItem discovery fallback, no
        # import-all expansion). When NOT bound (legacy call paths), the
        # absence of moduleNames keeps the historical "import everything
        # under ModulesPath" behavior.
        [switch]$ModuleNamesExplicit,
        [switch]$Json
    )

    $vbProject = $Session.VbProject

    $targets = @()
    if ($NormalizedModules.Count -gt 0) {
        $targets = $NormalizedModules
    } elseif ($ModuleNamesExplicit) {
        # R4: explicit-empty. Do NOT fall back to Get-ChildItem. The caller
        # is asking for a plan with zero modules; respect that.
        $targets = @()
    } else {
        # FIX: incluir *.form.txt y *.report.txt y extraer nombre correctamente
        $targets = @(Get-ChildItem -Path $ModulesPath -File -Recurse `
            -Include "*.bas", "*.cls", "*.frm", "*.form.txt", "*.report.txt" -ErrorAction SilentlyContinue |
            ForEach-Object {
                if ($_.Name -match '\.form\.txt$') { $_.Name -replace '\.form\.txt$', '' }
                elseif ($_.Name -match '\.report\.txt$') { $_.Name -replace '\.report\.txt$', '' }
                else { $_.BaseName }
            } | Sort-Object -Unique)
    }

    $total = $targets.Count
    $useRetryImport = ($targets.Count -gt 1)
    $createdComponentNames = New-Object System.Collections.Generic.List[string]
    # issue #849 — track form/report re-imports separately so the dispatcher can
    # trigger Save-VbaProjectModules for them too (the previous gate was
    # CreatedComponentNames.Count -gt 0, which is empty for re-imports and
    # skipped RunCommand(280), leaving LoadFromText + Import-DocumentCodeBehind
    # mutations in dirty COM state).
    $modifiedDocumentNames = New-Object System.Collections.Generic.List[string]
    $pendingTargets = @($targets)
    $pass = 0
    # R2: per-module structured result. Keys are module names, values are
    # pscustomobject entries with {module, status, phase, error, durationMs,
    # rollbackApplied, fallbackUsed, fallbackReason}. On error, error carries
    # {code, message, machine, user, rollbackAttempted, rollbackApplied,
    # rollbackError, fallbackUsed, fallbackReason}. Keeping these keyed by
    # module name lets the retry loop preserve the last known good/bad state
    # for each module.
    $lastResults = @{}
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

            $moduleStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            $script:ImportCurrentPhase = "locate-source"
            $script:ImportLastRollbackAttempted = $false
            $script:ImportLastRollbackApplied = $false
            $script:ImportLastRollbackError = $null
            $script:ImportLastFallbackUsed = $false
            $script:ImportLastFallbackReason = $null
            try {
                $beforeExists = Resolve-ExistingComponentName -VbProject $vbProject -ModuleName $name
                $importResult = Import-VbaModule -VbProject $vbProject -ModuleName $name -ModulesPath $ModulesPath -AccessApplication $Session.AccessApplication -ImportMode $ImportMode
                if (-not $beforeExists) {
                    $afterExists = Resolve-ExistingComponentName -VbProject $vbProject -ModuleName $name
                    if ($afterExists -and $importResult -and $importResult.CreatedNewComponent -and $importResult.RequiresExplicitSave) {
                        $createdComponentNames.Add([string]$afterExists) | Out-Null
                    }
                } elseif ($importResult -and $importResult.PSObject.Properties['ReimportedDocument'] -and [bool]$importResult.ReimportedDocument) {
                    # issue #849 — form/report re-import path. The form already
                    # existed in the binary, so CreatedComponentNames stays
                    # empty; the dispatcher needs a separate signal to know
                    # Save-VbaProjectModules must run.
                    $modifiedDocumentNames.Add([string]$name) | Out-Null
                }
                $moduleStopwatch.Stop()
                $progressThisPass = $true
                # R2 success record. Phase is null on the happy path because
                # nothing failed. DurationMs is captured per-module (not just
                # total). rollbackApplied is false on success because no
                # rollback is needed; fallbackUsed/fallbackReason report whether
                # the F16 AddFromString fallback was needed after AddFromFile.
                $resultFallbackUsed = [bool]($importResult -and $importResult.PSObject.Properties['FallbackUsed'] -and $importResult.FallbackUsed)
                $resultFallbackReason = $null
                if ($importResult -and $importResult.PSObject.Properties['FallbackReason']) {
                    $resultFallbackReason = $importResult.FallbackReason
                }
                $lastResults[$name] = [pscustomobject]@{
                    module          = [string]$name
                    status          = "ok"
                    phase           = $null
                    error           = $null
                    durationMs      = [int64]$moduleStopwatch.ElapsedMilliseconds
                    rollbackApplied = $false
                    fallbackUsed    = $resultFallbackUsed
                    fallbackReason  = $resultFallbackReason
                }
                if ($lastResults[$name].error) {
                    # Defensive: never let a non-null error slip into an ok entry.
                    $lastResults[$name].error = $null
                }
                # issue #752 — forward the optional Verbose snapshot from
                # Import-VbaModule. Backward-compatible: when the caller did not
                # pass -VerboseContract, $importResult.Verbose is $null and we
                # do not set the property on $lastResults[$name]. When set, the
                # field carries {source, destination, truncated, mismatchReason}.
                if ($importResult -and $importResult.PSObject.Properties['Verbose'] -and $importResult.Verbose) {
                    $lastResults[$name] | Add-Member -NotePropertyName Verbose -NotePropertyValue ($importResult.Verbose) -Force
                }
            } catch {
                $moduleStopwatch.Stop()
                $failedThisPass.Add($name) | Out-Null
                # Coerce $_.Exception.Message defensively to a string (issue #496). When
                # the VBE raises a COM error (e.g. 0x800A09D5), .Exception.Message can be
                # a COM property reference rather than a plain string, which later breaks
                # ConvertTo-Json inside Write-DysflowResult.
                $rawMessage = $_.Exception.Message
                $messageString = if ($null -eq $rawMessage) { "<empty VBE error>" }
                                 elseif ($rawMessage -is [string]) { $rawMessage }
                                 else { [string]$rawMessage }
                # R2 structured error. machine/user are populated only when the
                # message text matches a recognizable Access lock pattern;
                # otherwise null. We deliberately do NOT try to be cleverer
                # than the message text — guessing would mislead consumers.
                # issue #752 — VB_NAME_MISMATCH / DUPLICATE_OPTION_DIRECTIVE /
                # IMPORT_TRUNCATED detection is done by simple prefix matching
                # on the throw messages emitted by Import-VbaModule so the
                # per-module error.code carries the typed signal consumers need
                # to act on the failure without re-parsing free-form text.
                $machine = $null
                $user = $null
                $errorCode = "VBA_IMPORT_PHASE_FAILED"
                if ($messageString.StartsWith("VB_NAME_MISMATCH:")) {
                    $errorCode = "VB_NAME_MISMATCH"
                } elseif ($messageString.StartsWith("DUPLICATE_OPTION_DIRECTIVE:")) {
                    $errorCode = "DUPLICATE_OPTION_DIRECTIVE"
                } elseif ($messageString.StartsWith("IMPORT_TRUNCATED:")) {
                    $errorCode = "IMPORT_TRUNCATED"
                } elseif ($messageString.StartsWith("VBA_IMPORT_ROLLBACK_SNAPSHOT_FAILED:")) {
                    $errorCode = "VBA_IMPORT_ROLLBACK_SNAPSHOT_FAILED"
                } elseif (Get-Command -Name Test-IsAccessDatabaseLockedError -ErrorAction SilentlyContinue) {
                    if (Test-IsAccessDatabaseLockedError -Message $messageString) {
                        $errorCode = "ACCESS_DATABASE_LOCKED"
                        if (Get-Command -Name Get-AccessDatabaseLockedOwner -ErrorAction SilentlyContinue) {
                            $locked = Get-AccessDatabaseLockedOwner -Message $messageString
                            $machine = $locked.machine
                            $user = $locked.user
                        }
                    }
                }
                $lastResults[$name] = [pscustomobject]@{
                    module          = [string]$name
                    status          = "error"
                    phase           = [string]$script:ImportCurrentPhase
                    error           = [ordered]@{
                        code    = $errorCode
                        message = $messageString
                        machine = $machine
                        user    = $user
                        rollbackAttempted = [bool]$script:ImportLastRollbackAttempted
                        rollbackApplied   = [bool]$script:ImportLastRollbackApplied
                        rollbackError     = $script:ImportLastRollbackError
                        fallbackUsed      = [bool]$script:ImportLastFallbackUsed
                        fallbackReason    = $script:ImportLastFallbackReason
                    }
                    durationMs      = [int64]$moduleStopwatch.ElapsedMilliseconds
                    rollbackApplied = [bool]$script:ImportLastRollbackApplied
                    fallbackUsed    = [bool]$script:ImportLastFallbackUsed
                    fallbackReason  = $script:ImportLastFallbackReason
                }
            }
        }

        $pendingTargets = @($failedThisPass)
    } while ($useRetryImport -and $pendingTargets.Count -gt 0 -and $progressThisPass -and $pass -lt $maxPasses)

    # R2: emit per-module entries in the order the caller requested, with the
    # rich shape {module, status, phase, error:{...}, durationMs,
    # rollbackApplied, fallbackUsed, fallbackReason}. Error entries include
    # nested rollback/fallback diagnostics under error as well.
    # Preserve the existing happy-path emit shape (top-level array) so existing
    # consumers parsing the DYSFLOW_RESULT sentinel still see a JSON array of
    # module entries.
    $moduleResults = New-Object System.Collections.Generic.List[object]
    foreach ($t in $targets) {
        if ($lastResults.ContainsKey([string]$t)) {
            $moduleResults.Add($lastResults[[string]$t]) | Out-Null
        } else {
            # Should not happen, but defend against an entry that was never
            # processed (e.g. empty NormalizedModules explicit case).
            $moduleResults.Add([pscustomobject]@{
                module          = [string]$t
                status          = "ok"
                phase           = $null
                error           = $null
                durationMs      = 0
                rollbackApplied = $false
                fallbackUsed    = $false
                fallbackReason  = $null
            }) | Out-Null
        }
    }

    if ($pendingTargets.Count -gt 0) {
        $details = @($pendingTargets | ForEach-Object {
            $n = [string]$_
            if ($lastResults.ContainsKey($n) -and $lastResults[$n].error) {
                $msg = [string]$lastResults[$n].error.message
                "{0}: {1}" -f $n, $msg
            } else {
                $n
            }
        }) -join "; "
        $scopeLabel = if ($ModuleNamesExplicit -and $NormalizedModules.Count -eq 0) { "Import-plan" }
                      elseif ($NormalizedModules.Count -eq 0) { "Import-all" }
                      else { "Import" }
        $errorMessage = "{0} no pudo completar algunos modulos tras {1} pasada(s): {2}" -f $scopeLabel, $pass, $details
        $modulesArray = @($moduleResults.ToArray())
        # The top-level error code stays VBA_IMPORT_FAILED for backward
        # compatibility with existing consumers; per-module error.code carries
        # the fine-grained signal (ACCESS_DATABASE_LOCKED, VBA_IMPORT_PHASE_FAILED).
        Write-DysflowResult -Result ([ordered]@{
            ok = $false
            error = [ordered]@{
                code = "VBA_IMPORT_FAILED"
                message = $errorMessage
            }
            modules = $modulesArray
        }) -Depth 6
        return [pscustomobject]@{
            CreatedComponentNames = @()
            # issue #849 — surface the modified-document list even on the
            # error envelope so the dispatcher's save-all gate stays accurate
            # when a partial error path produced re-imports before the failure.
            ModifiedDocumentNames = @($modifiedDocumentNames)
            Total = [int]$total
            HasErrors = $true
            ErrorMessage = $errorMessage
        }
    }

    Write-DysflowResult -Result (@($moduleResults.ToArray())) -Depth 4

    return [pscustomobject]@{
        CreatedComponentNames = @($createdComponentNames)
        # issue #849 — ModifiedDocumentNames surfaces form/report re-imports so
        # the dispatcher can trigger Save-VbaProjectModules for them.
        ModifiedDocumentNames = @($modifiedDocumentNames)
        Total = [int]$total
        HasErrors = $false
    }
}

$session = $null

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
    # R4: track whether the caller explicitly passed -ModuleNamesJson (even if
    # the resulting array is empty). PowerShell $PSBoundParameters distinguishes
    # "parameter not bound" from "bound with []". We forward this signal into
    # Invoke-ImportAction so an explicit empty list does NOT trigger the
    # import-all fallback.
    $moduleNamesExplicit = $false
    if ($PSBoundParameters.ContainsKey("ModuleNamesJson") -and -not [string]::IsNullOrWhiteSpace($ModuleNamesJson)) {
        try {
            $jsonModules = ConvertFrom-Json -InputObject $ModuleNamesJson -ErrorAction Stop
            if ($jsonModules -is [System.Collections.IEnumerable] -and -not ($jsonModules -is [string])) {
                $inputModules = @($jsonModules | ForEach-Object { [string]$_ })
                $moduleNamesExplicit = $true
            } elseif ($null -ne $jsonModules) {
                $inputModules = @([string]$jsonModules)
                $moduleNamesExplicit = $true
            }
        } catch {
            throw ("No se pudo interpretar -ModuleNamesJson: {0}" -f $_.Exception.Message)
        }
    } elseif ($PSBoundParameters.ContainsKey("ModuleNamesJson")) {
        # Bound with whitespace-only — treat as explicit empty (caller intentionally
        # passed the flag) but the resulting list is empty.
        $moduleNamesExplicit = $true
    }
    $normalizedModules = @($inputModules | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($Action -eq "Import") {
        $ImportMode = Resolve-ImportModeValue -ImportMode $ImportMode
    }

    if ($Action -eq "Export") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        Invoke-ExportAction -Session $session -NormalizedModules $normalizedModules -ModulesPath $ModulesPath -Json:$Json

    } elseif ($Action -eq "Import") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        $importResult = Invoke-ImportAction -Session $session -NormalizedModules $normalizedModules -ModulesPath $ModulesPath -ImportMode $ImportMode -ModuleNamesExplicit:$moduleNamesExplicit -Json:$Json
        if ($importResult.HasErrors) { exit 1 }
        # issue #849 — gate Save-VbaProjectModules on EITHER newly created
        # components OR re-imported form/report documents. The previous
        # CreatedComponentNames-only gate skipped save-all for form re-imports
        # and left LoadFromText + Import-DocumentCodeBehind in dirty COM state.
        $hasCreated = (@($importResult.CreatedComponentNames).Count -gt 0)
        $hasReimportedDocuments = ($importResult.PSObject.Properties['ModifiedDocumentNames'] -and @($importResult.ModifiedDocumentNames).Count -gt 0)
        if ($hasCreated -or $hasReimportedDocuments) {
            $saveNames = @($importResult.CreatedComponentNames)
            if ($hasReimportedDocuments) { $saveNames += @($importResult.ModifiedDocumentNames) }
            # issue #861 — the per-module import already succeeded and emitted its
            # DYSFLOW_RESULT (status:"ok"). Save-VbaProjectModules is best-effort
            # persistence (RunCommand 280 = acCmdSaveAllModules); its per-module
            # fallback wrongly targets form/report document modules with
            # acModule=5 and can throw. A throw here used to make the script
            # exit 1 AFTER a successful import, so the TS adapter wrapped a
            # status:"ok" result in a misleading VBA_MANAGER_FAILED envelope.
            # The human compiles in Access before trusting the binary, so a save
            # hiccup must degrade to a warning, never corrupt the success envelope.
            try {
                Save-VbaProjectModules -AccessApplication $session.AccessApplication -ModuleNames @($saveNames | Select-Object -Unique)
            } catch {
                Write-Status -Message ("ADVERTENCIA: guardado explícito post-import no completó ({0}). El import se aplicó; compilá en Access (Debug > Compile) para persistir/verificar." -f $_.Exception.Message) -Color Yellow
            }
        }
        Write-Status -Message ("OK Import completado ({0})" -f $importResult.Total) -Color Green

    } elseif ($Action -eq "Delete") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        Invoke-DeleteAction -Session $session -NormalizedModules $normalizedModules -Json:$Json -Force:$Force

    } elseif ($Action -eq "List-Objects") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        Invoke-ListObjectsAction -Session $session -Json:$Json

    } elseif ($Action -eq "List-VbaModules") {
        # Issue #807 (Feature 1) - per-component binary enumeration. The TS
        # service layers the source-side cross-reference on top of this.
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        Invoke-ListVbaModulesAction -Session $session -TypeFilter $TypeFilter -NamePattern $NamePattern -ApplyTypeFilter:$ApplyTypeFilter -ApplyNamePattern:$ApplyNamePattern -Json:$Json

    } elseif ($Action -eq "Exists") {
        if ($normalizedModules.Count -ne 1) {
            throw "Exists requiere exactamente un nombre de módulo/objeto."
        }
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        Invoke-ExistsAction -Session $session -ModuleName $normalizedModules[0] -Json:$Json

    } elseif ($Action -eq "Run-Procedure") {
        $session = Open-AccessDatabase -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution
        Invoke-RunProcedureAction -Session $session -ProcedureName $ProcedureName -ProcedureArgsJson $ProcedureArgsJson -Json:$Json

    } elseif ($Action -eq "Run-Tests") {
        Invoke-RunTestsAction -Session ([ref]$session) -ProceduresJson $ProceduresJson -ProceduresJsonFile $ProceduresJsonFile -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution -Json:$Json

    # feat-759-no-compile (v1.19.0) — the `Compile` action dispatcher branch
    # was removed. The compile_vba MCP tool is gone, the inline execution
    # path skips the explicit compile step (letting run_vba surface any
    # compile error as a regular run failure), and the helper functions
    # Invoke-CompileVbaProject / Invoke-CompileAction / New-CompileFailureResult
    # are gone. No path routes -Action "Compile" anymore.

    } elseif ($Action -eq "Generate-ERD") {
        Invoke-GenerateErdAction -BackendPath $BackendPath -DestinationRoot $DestinationRoot -ErdPath $ErdPath -Password $Password -Json:$Json

    } else {
        Invoke-FixEncodingAction -Session ([ref]$session) -ModulesPath $ModulesPath -NormalizedModules $normalizedModules -Location $Location -AccessPath $AccessPath -Password $Password -AllowStartupExecution:$AllowStartupExecution -Json:$Json
    }
} catch {
    if (-not $script:HasDysflowResultEmitted) {
        # R5: detect Access exclusive-lock COM errors and surface them with a
        # dedicated structured envelope (ACCESS_DATABASE_LOCKED) so consumers
        # can render an actionable remediation message ("close interactive
        # Access on machine X / user Y"). Falls back to the legacy
        # VBA_MANAGER_FAILED envelope when the pattern does not match.
        $caughtMessage = if ($_.Exception) { [string]$_.Exception.Message } else { [string]$_ }
        if (Test-IsAccessDatabaseLockedError -Message $caughtMessage) {
            $locked = Get-AccessDatabaseLockedOwner -Message $caughtMessage
            $remediation = "Close the interactive Access session that holds the lock"
            if ($locked.machine -or $locked.user) {
                $remediation += " ("
                $bits = @()
                if ($locked.machine) { $bits += "machine '$($locked.machine)'" }
                if ($locked.user) { $bits += "user '$($locked.user)'" }
                $remediation += ($bits -join ", ") + ")"
            }
            $remediation += ", then retry."
            Write-DysflowResult -Result ([ordered]@{
                ok = $false
                error = [ordered]@{
                    code = "ACCESS_DATABASE_LOCKED"
                    message = $caughtMessage
                    machine = $locked.machine
                    user = $locked.user
                    remediation = $remediation
                }
            }) -Depth 6
        } else {
            Write-DysflowResult -Result ([ordered]@{
                ok = $false
                error = [ordered]@{
                    code = "VBA_MANAGER_FAILED"
                    message = $caughtMessage
                }
            }) -Depth 6
        }
    }
    exit 1
} finally {
    if ($session) {
        try { Close-AccessDatabase -Session $session -AccessPath $AccessPath -Password $Password } catch { Write-Debug "Diagnostics: $_" }
    }
}
