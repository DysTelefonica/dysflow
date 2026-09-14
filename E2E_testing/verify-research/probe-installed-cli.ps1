[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "results/installed-cli.json")
)

$ErrorActionPreference = "Stop"
$command = Get-Command dysflow -ErrorAction Stop
$entrypoint = $command.Source

function Invoke-CapturedCommand {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    if ([IO.Path]::GetExtension($entrypoint) -ieq ".ps1") {
        $psi.FileName = (Get-Command pwsh -ErrorAction Stop).Source
        foreach ($hostArgument in @("-NoProfile", "-NonInteractive", "-File", $entrypoint)) {
            [void]$psi.ArgumentList.Add($hostArgument)
        }
    } else {
        $psi.FileName = $entrypoint
    }
    foreach ($argument in $Arguments) {
        [void]$psi.ArgumentList.Add($argument)
    }
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $process = [System.Diagnostics.Process]::Start($psi)
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    [ordered]@{
        arguments = $Arguments
        exitCode = $process.ExitCode
        stdout = $stdout.TrimEnd()
        stderr = $stderr.TrimEnd()
    }
}

$version = Invoke-CapturedCommand -Arguments @("--version")
$help = Invoke-CapturedCommand -Arguments @("--help")
$verify = Invoke-CapturedCommand -Arguments @("verify")

$result = [ordered]@{
    generatedAt = [DateTimeOffset]::UtcNow.ToString("o")
    entrypoint = $entrypoint
    version = $version
    help = $help
    verify = $verify
    verifyAvailable = ($verify.exitCode -eq 0)
    accessOpened = $false
    note = "Availability probe only. No Access operation or MCP tool call is performed."
}

$parent = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8
$result | ConvertTo-Json -Depth 8
