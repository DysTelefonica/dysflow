#Requires -Version 5.1
<#
.SYNOPSIS
    Entry point of the offline Pester suite (`pnpm test:ps1`).

.DESCRIPTION
    Sets DYSFLOW_PESTER_GUARD=1 so every seam in scripts/lib/dysflow-access-com.ps1 refuses
    real Access.Application creation and real process kills, in this process and in any
    child process a test starts (#1948, #1958). A direct `Invoke-Pester` is guarded too,
    because the library also detects a loaded Pester module. See README.md in this folder.
#>
Param(
    [string[]]$Path = @($PSScriptRoot),
    [string]$Output = 'Normal'
)

$env:DYSFLOW_PESTER_GUARD = '1'
$result = Invoke-Pester -Path $Path -Output $Output -PassThru
if ($result.Result -ne 'Passed') { exit 1 }
