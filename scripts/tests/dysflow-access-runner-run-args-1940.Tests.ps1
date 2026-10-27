#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1940 - run_vba 'vba' operation of dysflow-access-runner.ps1 marshals
    argsJson values through Access.Application.Run.

.NOTES
    The MCP run_vba tool reaches Access through the access runner's
    `if ($Operation -eq 'vba')` block. The test runs that block, taken from the
    script's AST, against FakeAccessApplication1940 (fixtures/fake-access-run-1940.ps1),
    whose Run overloads take every argument `ref object` like Access's
    [in,out] VARIANT* Arg1..Arg30. The runner script itself is never executed and
    lib/dysflow-access-com.ps1 is never loaded, so no real Access can start.
#>

Describe "dysflow-access-runner vba operation - Application.Run argument marshaling (#1940)" {
    BeforeAll {
        . (Join-Path $PSScriptRoot "fixtures/fake-access-run-1940.ps1")
        $libPath = Join-Path (Join-Path $PSScriptRoot "..") "lib/dysflow-access-run.ps1"
        if (Test-Path $libPath) { . $libPath }

        $runnerPath = Join-Path (Join-Path $PSScriptRoot "..") "dysflow-access-runner.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $runnerPath).Path, [ref]$null, [ref]$null)
        $vbaBlock = $ast.FindAll({
                $args[0] -is [System.Management.Automation.Language.IfStatementAst] -and
                $args[0].Clauses[0].Item1.Extent.Text -eq "`$Operation -eq 'vba'"
            }, $true) | Select-Object -First 1
        if ($null -eq $vbaBlock) { throw "vba operation block not found in dysflow-access-runner.ps1" }
        $script:VbaBlock = [scriptblock]::Create($vbaBlock.Extent.Text)

        function script:Write-DysflowProgress { param($Percent, $Message) }
        function script:Write-DysflowResult { param($Result, $Depth) $script:Emitted.Add($Result) | Out-Null }

        function script:Invoke-RunnerVbaOperation {
            param($Access, [string]$ArgsJson, [string]$ProcedureName = "Concat")
            $script:Emitted = [System.Collections.Generic.List[object]]::new()
            $script:exitCode = $null
            $Operation = "vba"
            $access = $Access
            $payload = [pscustomobject]@{ procedureName = $ProcedureName; arguments = ($ArgsJson | ConvertFrom-Json) }
            . $script:VbaBlock
            return [pscustomobject]@{ exitCode = $script:exitCode; results = @($script:Emitted) }
        }
    }

    It "passes two argsJson strings to Run and returns the value (issue repro)" {
        $app = [FakeAccessApplication1940]::new()

        $out = Invoke-RunnerVbaOperation -Access $app -ArgsJson '["459","C:\\dir"]'

        $out.exitCode | Should -Be 0
        $out.results[0].returnValue | Should -Be "459|C:\dir"
        $app.Calls[0] | Should -Be "Concat(String:459, String:C:\dir)"
    }

    It "passes <count> argument(s)" -TestCases @(
        @{ count = 0 }, @{ count = 1 }, @{ count = 3 }, @{ count = 5 }, @{ count = 30 }
    ) {
        param($count)
        $app = [FakeAccessApplication1940]::new()
        $values = @(if ($count -gt 0) { 1..$count | ForEach-Object { "v$_" } })

        $out = Invoke-RunnerVbaOperation -Access $app -ArgsJson (ConvertTo-Json -InputObject @($values) -Compress)

        $out.exitCode | Should -Be 0
        $out.results[0].returnValue | Should -Be ($values -join "|")
    }

    It "passes a falsy single value such as 0" {
        $app = [FakeAccessApplication1940]::new()

        $out = Invoke-RunnerVbaOperation -Access $app -ArgsJson '[0]'

        $out.exitCode | Should -Be 0
        $app.Calls[0] | Should -Match '^Concat\(Int(32|64):0\)$'
    }

    It "keeps non-string JSON types" {
        $app = [FakeAccessApplication1940]::new()

        $out = Invoke-RunnerVbaOperation -Access $app -ArgsJson '[7,true,"x"]'

        $out.exitCode | Should -Be 0
        $app.Calls[0] | Should -Match '^Concat\(Int(32|64):7, Boolean:True, String:x\)$'
    }

    It "reports RUN_ARGUMENT_MARSHALING_FAILED with the 1-based argsJson position" {
        $app = [pscustomobject]@{}
        $app | Add-Member -MemberType ScriptMethod -Name Run -Value {
            throw [System.Management.Automation.MethodException]::new("Argumento: '3' debe ser System.Management.Automation.PSReference. Use [ref].")
        }

        { Invoke-RunnerVbaOperation -Access $app -ArgsJson '["459","C:\\dir"]' } |
            Should -Throw "RUN_ARGUMENT_MARSHALING_FAILED*argument 2*Concat*"
    }

    It "lets a VBA error raised by the procedure propagate unchanged" {
        $app = [pscustomobject]@{}
        $app | Add-Member -MemberType ScriptMethod -Name Run -Value { throw "Error definido por la aplicacion" }

        { Invoke-RunnerVbaOperation -Access $app -ArgsJson '["a"]' } |
            Should -Throw "*Error definido por la aplicacion*"
    }
}
