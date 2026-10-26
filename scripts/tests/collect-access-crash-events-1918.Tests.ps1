#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1918: scripts/collect-access-crash-events.ps1 exports the Windows
    Application log crash entries as normalized lines that join on the process id
    with a COM shutdown trace.
.NOTES
    Pure PowerShell. The event log is stubbed; no event log and no Access is read.
    The functions are loaded from the production source with the AST parser, the
    same way dysflow-vba-manager.Tests.ps1 loads the shared COM module.
#>

BeforeAll {
    $script:CollectorPath = Join-Path $PSScriptRoot ".." "collect-access-crash-events.ps1"

    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:CollectorPath).Path,
        [ref]$null,
        [ref]$null
    )
    foreach ($fnName in @('ConvertTo-NormalizedCrashEvent', 'Format-CrashEventLine', 'Export-AccessCrashEvents')) {
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $fnName },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Function '$fnName' not found in $($script:CollectorPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }
}

Describe "collect-access-crash-events (#1918)" {

    Context "event normalization" {

        It "reads the named EventData fields and converts the hex process id to decimal" {
            [xml]$eventXml = @'
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <EventData>
    <Data Name="AppName">MSACCESS.EXE</Data>
    <Data Name="AppVersion">16.0.20527.20088</Data>
    <Data Name="ModuleName">combase.dll</Data>
    <Data Name="ModuleVersion">10.0.26100.9711</Data>
    <Data Name="ExceptionCode">c0000005</Data>
    <Data Name="FaultingOffset">000000000019e515</Data>
    <Data Name="ProcessId">0x8708</Data>
    <Data Name="IntegratorReportId">ddcef3d0-e243-4b72-8b8a-ac17959f58cc</Data>
  </EventData>
</Event>
'@
            # An offset-aware instant, converted to the machine's local time, so the
            # assertion holds on any machine timezone: 12:09:25+02:00 is 10:09:25Z.
            $localInstant = [datetimeoffset]::Parse("2026-10-26T12:09:25+02:00").LocalDateTime
            $normalized = ConvertTo-NormalizedCrashEvent -EventXml $eventXml -TimeCreated $localInstant

            $normalized.Pid | Should -Be 34568
            $normalized.App | Should -Be "MSACCESS.EXE"
            $normalized.Module | Should -Be "combase.dll"
            $normalized.Exception | Should -Be "c0000005"
            $normalized.Offset | Should -Be "000000000019e515"
            $normalized.Utc | Should -Be "2026-10-26T10:09:25.0000000Z"
        }

        It "keeps the named fields of an event that also carries EMPTY Data elements" {
            # A real Application Error event ends with two empty elements
            # (PackageFullName, PackageRelativeAppId). Reading them must not
            # drop the event: an empty element has no text node at all.
            [xml]$eventXml = @'
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <EventData>
    <Data Name="AppName">MSACCESS.EXE</Data>
    <Data Name="ExceptionCode">c0000005</Data>
    <Data Name="ProcessId">0x8708</Data>
    <Data Name="PackageFullName"></Data>
    <Data Name="PackageRelativeAppId"></Data>
  </EventData>
</Event>
'@
            $normalized = ConvertTo-NormalizedCrashEvent -EventXml $eventXml -TimeCreated ([datetime]"2026-10-26T12:00:00")

            $normalized.App | Should -Be "MSACCESS.EXE"
            $normalized.Pid | Should -Be 34568
            $normalized.Exception | Should -Be "c0000005"
        }

        It "formats a normalized event into a line that joins on the decimal pid" {
            $event = [pscustomobject]@{
                Utc = "2026-10-26T10:09:25.0000000Z"; Pid = 34568; App = "MSACCESS.EXE"
                AppVersion = "16.0.20527.20088"; Module = "combase.dll"; ModuleVersion = "10.0.26100.9711"
                Exception = "c0000005"; Offset = "000000000019e515"; ReportId = "abc"
            }

            $line = Format-CrashEventLine -Event $event

            $line | Should -Match ' pid=34568 '
            $line | Should -Match ' app=MSACCESS\.EXE '
            $line | Should -Match ' module=combase\.dll '
            $line | Should -Match ' exception=c0000005 '
            $line | Should -Match 'utc=2026-10-26T10:09:25'
        }
    }

    Context "export" {

        BeforeEach {
            $script:OutputPath = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1918-events-" + [guid]::NewGuid().ToString("N") + ".log")
        }

        AfterEach {
            if ($script:OutputPath -and (Test-Path -LiteralPath $script:OutputPath)) {
                Remove-Item -LiteralPath $script:OutputPath -Force
            }
        }

        It "exports only the requested application and writes a header with the counts" {
            function script:Get-WinEvent {
                param($FilterHashtable, $MaxEvents, $ErrorAction)
                $accessEvent = [pscustomobject]@{}
                $accessEvent | Add-Member -MemberType ScriptMethod -Name ToXml -Value {
                    @'
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <EventData>
    <Data Name="AppName">MSACCESS.EXE</Data>
    <Data Name="ExceptionCode">c0000005</Data>
    <Data Name="ProcessId">0x1</Data>
  </EventData>
</Event>
'@
                }
                $accessEvent | Add-Member -MemberType NoteProperty -Name TimeCreated -Value ([datetime]"2026-10-26T12:00:00")

                $otherEvent = [pscustomobject]@{}
                $otherEvent | Add-Member -MemberType ScriptMethod -Name ToXml -Value {
                    @'
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <EventData>
    <Data Name="AppName">EXCEL.EXE</Data>
    <Data Name="ExceptionCode">c0000005</Data>
    <Data Name="ProcessId">0x2</Data>
  </EventData>
</Event>
'@
                }
                $otherEvent | Add-Member -MemberType NoteProperty -Name TimeCreated -Value ([datetime]"2026-10-26T12:00:00")

                return @($accessEvent, $otherEvent)
            }

            $exported = Export-AccessCrashEvents -SinceUtc "2026-10-26T00:00:00Z" -OutputPath $script:OutputPath

            $exported | Should -Be 1
            $lines = @(Get-Content -LiteralPath $script:OutputPath)
            $lines[0] | Should -Match ' exported=1 '
            $lines[0] | Should -Match ' read=2$'
            ($lines | Select-Object -Skip 1) | Should -HaveCount 1
            $lines[1] | Should -Match ' app=MSACCESS\.EXE '
            $lines[1] | Should -Match ' pid=1 '
            $lines[1] | Should -Not -Match 'EXCEL'
        }

        It "leaves a header-only artifact when the event log cannot be read" {
            function script:Get-WinEvent {
                param($FilterHashtable, $MaxEvents, $ErrorAction)
                throw "the log is not available"
            }

            $exported = Export-AccessCrashEvents -SinceUtc "2026-10-26T00:00:00Z" -OutputPath $script:OutputPath -WarningAction SilentlyContinue

            $exported | Should -Be 0
            $lines = @(Get-Content -LiteralPath $script:OutputPath)
            $lines | Should -HaveCount 1
            $lines[0] | Should -Match ' exported=0 '
        }
    }
}
