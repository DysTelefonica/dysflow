#Requires -Version 5.1
<#
.SYNOPSIS
    #1918 — exports the Windows Application log entries for a crashed process as
    normalized lines, so a COM shutdown trace can be correlated with the crash
    events of the SAME process.

.DESCRIPTION
    The Application log entry (event id 1000) names the faulting application, the
    faulting module, the exception code, the faulting offset and the process id.
    Those are the exact fields needed to line a dysflow COM teardown trace up
    with the crash that followed it.

    The rendered message of that event is LOCALIZED (it reads "Nombre de la
    aplicación con errores" on a Spanish machine), so this script never parses
    the message text. It reads the event XML and takes the named EventData
    fields, whose names and values are locale independent.

    Output line format (one per crash):

        utc=<ISO-8601> pid=<decimal> app=MSACCESS.EXE appVersion=<v> module=<name> moduleVersion=<v> exception=<hex> offset=<hex> reportId=<id>

    The decimal pid is what a COM teardown trace records, so the two artifacts
    join on that value.

.PARAMETER SinceUtc
    ISO-8601 instant. Only events at or after it are exported.

.PARAMETER OutputPath
    File that receives the normalized lines.

.PARAMETER AppName
    Application name to keep. Defaults to MSACCESS.EXE.

.PARAMETER EventId
    Application log event id to read. Defaults to 1000 (Application Error).

.PARAMETER MaxEvents
    Upper bound on the events read from the log. Defaults to 5000.

.EXAMPLE
    pwsh -NoProfile -File scripts/collect-access-crash-events.ps1 `
        -SinceUtc "2026-10-26T10:41:19Z" `
        -OutputPath "$env:RUNNER_TEMP\access-crash-events.log"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SinceUtc,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [string]$AppName = "MSACCESS.EXE",
    [int]$EventId = 1000,
    [int]$MaxEvents = 5000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Reads the named EventData fields of one event. Locale independent by design:
# the EventData names and values do not change with the display language.
function ConvertTo-NormalizedCrashEvent {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][xml]$EventXml,
        [Parameter(Mandatory = $true)][datetime]$TimeCreated
    )

    $fields = @{}
    foreach ($data in @($EventXml.Event.EventData.Data)) {
        if ($data -isnot [System.Xml.XmlElement]) { continue }
        # The attribute and the text are read through the DOM, not through the
        # PowerShell XML adapter: an EMPTY <Data Name="x" /> has no '#text'
        # property at all, and reading it under StrictMode throws and would
        # drop the whole event.
        $name = $data.GetAttribute("Name")
        if ($name) { $fields[$name] = $data.InnerText }
    }

    # ProcessId arrives as hex ("0x8708") in the raw event data; the trace
    # records a decimal pid, so normalize here instead of at correlation time.
    # The variable is NOT named $pid: $PID is a read-only automatic variable.
    $processId = 0
    $rawPid = if ($fields.ContainsKey("ProcessId")) { $fields["ProcessId"] } else { "" }
    if ($rawPid -match '^0x([0-9a-fA-F]+)$') {
        $processId = [Convert]::ToInt64($Matches[1], 16)
    } elseif ($rawPid -match '^\d+$') {
        $processId = [int64]$rawPid
    }

    return [pscustomobject]@{
        Utc           = $TimeCreated.ToUniversalTime().ToString("o")
        Pid           = $processId
        App           = if ($fields.ContainsKey("AppName")) { $fields["AppName"] } else { "" }
        AppVersion    = if ($fields.ContainsKey("AppVersion")) { $fields["AppVersion"] } else { "" }
        Module        = if ($fields.ContainsKey("ModuleName")) { $fields["ModuleName"] } else { "" }
        ModuleVersion = if ($fields.ContainsKey("ModuleVersion")) { $fields["ModuleVersion"] } else { "" }
        Exception     = if ($fields.ContainsKey("ExceptionCode")) { $fields["ExceptionCode"] } else { "" }
        Offset        = if ($fields.ContainsKey("FaultingOffset")) { $fields["FaultingOffset"] } else { "" }
        ReportId      = if ($fields.ContainsKey("IntegratorReportId")) { $fields["IntegratorReportId"] } else { "" }
    }
}

function Format-CrashEventLine {
    [CmdletBinding()]
    Param([Parameter(Mandatory = $true)]$Event)
    return ("utc={0} pid={1} app={2} appVersion={3} module={4} moduleVersion={5} exception={6} offset={7} reportId={8}" -f `
        $Event.Utc, $Event.Pid, $Event.App, $Event.AppVersion, $Event.Module, $Event.ModuleVersion, `
        $Event.Exception, $Event.Offset, $Event.ReportId)
}

function Export-AccessCrashEvents {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$SinceUtc,
        [Parameter(Mandatory = $true)][string]$OutputPath,
        [string]$AppName = "MSACCESS.EXE",
        [int]$EventId = 1000,
        [int]$MaxEvents = 5000
    )

    # NOT named $sinceUtc: PowerShell variable names are case insensitive, so
    # that name would BE the [string] $SinceUtc parameter above, and assigning
    # the DateTime to it would coerce it back to a string.
    $sinceInstant = [datetime]::Parse($SinceUtc, [cultureinfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()

    $events = @()
    try {
        $events = @(Get-WinEvent -FilterHashtable @{ LogName = "Application"; Id = $EventId; StartTime = $sinceInstant } -MaxEvents $MaxEvents -ErrorAction Stop)
    } catch {
        # An empty or unreadable log is not a failure of this diagnostic: report it
        # and leave a header-only artifact rather than failing the whole workflow.
        Write-Warning "collect-access-crash-events: could not read the Application log: $_"
    }

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($event in $events) {
        $normalized = $null
        try {
            [xml]$eventXml = $event.ToXml()
            $normalized = ConvertTo-NormalizedCrashEvent -EventXml $eventXml -TimeCreated $event.TimeCreated
        } catch {
            Write-Warning "collect-access-crash-events: skipped an unparsable event: $_"
            continue
        }
        if ($AppName -and $normalized.App -ne $AppName) { continue }
        $lines.Add((Format-CrashEventLine -Event $normalized))
    }

    $header = "# application-error events id={0} app={1} since_utc={2} exported={3} read={4}" -f `
        $EventId, $AppName, $sinceInstant.ToString("o"), $lines.Count, $events.Count
    Set-Content -LiteralPath $OutputPath -Value (@($header) + $lines) -Encoding utf8

    return $lines.Count
}

if ($MyInvocation.InvocationName -ne ".") {
    $exported = Export-AccessCrashEvents `
        -SinceUtc $SinceUtc `
        -OutputPath $OutputPath `
        -AppName $AppName `
        -EventId $EventId `
        -MaxEvents $MaxEvents
    Write-Host ("collect-access-crash-events: exported {0} crash lines to {1}" -f $exported, $OutputPath)
}
