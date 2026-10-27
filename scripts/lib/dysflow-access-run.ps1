<#
.SYNOPSIS
    Shared Access.Application.Run argument marshaling (#1940).

.DESCRIPTION
    Dot-sourced by dysflow-vba-manager.ps1 (Run-Procedure / Run-Tests) and by
    dysflow-access-runner.ps1 (the run_vba 'vba' operation) so both paths
    marshal arguments the same way.

    Access's type library declares Application.Run as
    Run(Procedure As String, [in,out,optional] Arg1..Arg30 As Variant*), so the
    PowerShell COM adapter rejects any positional argument that is not a
    PSReference ("Argument: '2' should be a System.Management.Automation.PSReference"),
    whatever the VBA procedure declares. Every argument is therefore sent as
    [ref]; the caller decides which values to read back.

    This file defines functions only. It never creates a COM object.
#>

function Invoke-AccessApplicationRun {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]$AccessApplication,
        [Parameter(Mandatory = $true)][string]$ProcedureName,
        [object[]]$InvokeArgs = @()
    )

    if ($InvokeArgs.Count -gt 30) {
        throw "Access.Application.Run accepts at most 30 arguments; received $($InvokeArgs.Count)."
    }

    $refs = [System.Management.Automation.PSReference[]]::new($InvokeArgs.Count)
    for ($i = 0; $i -lt $InvokeArgs.Count; $i++) {
        $value = $InvokeArgs[$i]
        if ($null -ne $value) { $value = $value.PSObject.BaseObject }
        $refs[$i] = [System.Management.Automation.PSReference]::new($value)
    }

    # PowerShell has no splatting for .NET/COM method calls, so the call is
    # generated for the exact arity. The text only contains fixed variable
    # names and indexes; argument values never reach the parser.
    $refList = @(for ($i = 0; $i -lt $refs.Count; $i++) { "`$r[$i]" })
    $callText = if ($refList.Count -gt 0) { "`$a.Run(`$p, $($refList -join ', '))" } else { "`$a.Run(`$p)" }
    $call = [scriptblock]::Create("param(`$a, `$p, `$r) $callText")
    $result = & $call $AccessApplication $ProcedureName $refs

    return [pscustomobject]@{
        result = $result
        values = @($refs | ForEach-Object { $_.Value })
    }
}

# Returns a RUN_ARGUMENT_MARSHALING_FAILED message naming the rejected argument
# (1-based, argsJson order) and, when signature metadata is available, its
# parameter name and declared passing mode. Returns $null when the message is
# not a PowerShell [ref] binding failure.
function Format-AccessRunMarshalingError {
    [CmdletBinding()]
    Param(
        [AllowNull()][string]$Message,
        [Parameter(Mandatory = $true)][string]$ProcedureName,
        [object[]]$Metadata = @()
    )

    if ([string]::IsNullOrWhiteSpace($Message)) { return $null }
    if ($Message -notmatch "PSReference" -and $Message -notmatch "Use\s+\[ref\]") { return $null }

    $describe = {
        param($index)
        $param = if ($index -ge 0 -and $index -lt $Metadata.Count) { $Metadata[$index] } else { $null }
        if ($null -eq $param) { return "argument $($index + 1) (no signature metadata)" }
        $mode = if ($param.byRef) { "ByRef" } else { "ByVal" }
        if ($param.optional) { $mode = "Optional $mode" }
        return "argument $($index + 1) '$($param.name)' (declared $mode)"
    }

    # PowerShell numbers Run's own parameters from 1, and Procedure is the first.
    $match = [regex]::Match($Message, "(?:Argumento|Argument)\s*:\s*['""](?<index>\d+)['""]", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success -and [int]$match.Groups["index"].Value -ge 2) {
        $target = & $describe ([int]$match.Groups["index"].Value - 2)
    } else {
        $target = (@(for ($i = 0; $i -lt $Metadata.Count; $i++) { & $describe $i }) -join "; ")
        if ([string]::IsNullOrWhiteSpace($target)) { $target = "arguments (no signature metadata)" }
    }
    return "RUN_ARGUMENT_MARSHALING_FAILED: Access.Application.Run could not receive $target of $ProcedureName."
}
