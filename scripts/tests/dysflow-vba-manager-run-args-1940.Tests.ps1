#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1940 - run_vba argument marshaling through Access.Application.Run.

.NOTES
    Access's type library declares Application.Run as
    Run(Procedure As String, [in,out,optional] Arg1..Arg30 As Variant*), so
    PowerShell's COM adapter rejects any positional argument that is not a
    PSReference ("Argument: '2' should be a System.Management.Automation.PSReference").
    The fake Access application (fixtures/fake-access-run-1940.ps1) reproduces that contract with a .NET class
    whose Run overloads take every argument `ref object`: PowerShell's .NET
    adapter enforces [ref] on those parameters with the same error.

    No real Access is involved: the shared lib/dysflow-access-run.ps1 is dot-sourced and the remaining run-procedure functions are loaded from
    dysflow-vba-manager.ps1 through the AST (the script and the COM library are
    never dot-sourced), and New-Object refuses to create Access.Application.
#>

Describe "Invoke-AccessProcedure - Application.Run argument marshaling (#1940)" {
    BeforeAll {
        . (Join-Path $PSScriptRoot "fixtures/fake-access-run-1940.ps1")
        . (Join-Path (Join-Path $PSScriptRoot "..") "lib/dysflow-access-run.ps1")

        $scriptPath = Join-Path (Join-Path $PSScriptRoot "..") "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $scriptPath).Path, [ref]$null, [ref]$null)
        $wanted = @(
            "Join-VbaLogicalLines",
            "Split-VbaParameterList",
            "Get-VbaProcedureParameterMetadataFromText",
            "Get-VbaProcedureParameterMetadata",
            "Convert-RunReturnValue",
            "Convert-RunReturnPayload",
            "Invoke-AccessProcedure"
        )
        $fnAsts = $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true) |
            Where-Object { $wanted -contains $_.Name }
        foreach ($fnAst in $fnAsts) { Invoke-Expression $fnAst.Extent.Text }


        function script:New-FakeVbProject {
            param([string]$Source)
            $codeModule = [pscustomobject]@{ CountOfLines = 1; Source = $Source }
            $codeModule | Add-Member -MemberType ScriptMethod -Name Lines -Value { param($start, $count) $this.Source }
            $component = [pscustomobject]@{ CodeModule = $codeModule }
            $components = [pscustomobject]@{ Count = 1; Component = $component }
            $components | Add-Member -MemberType ScriptMethod -Name Item -Value { param($i) $this.Component }
            return [pscustomobject]@{ VBComponents = $components }
        }
    }

    It "passes two ByVal String arguments by value and returns the result (issue repro)" {
        $app = [FakeAccessApplication1940]::new()
        $proj = New-FakeVbProject -Source "Public Function Concat(ByVal p_IDEdicion As String, ByVal p_Dir As String) As String`r`nEnd Function"
        $args1940 = '["459","C:\\dir"]' | ConvertFrom-Json

        $res = Invoke-AccessProcedure -AccessApplication $app -VbProject $proj -ProcedureName "Concat" -ProcedureArgs @($args1940)

        $res.error | Should -BeNullOrEmpty
        $res.ok | Should -BeTrue
        $res.returnValue | Should -Be "459|C:\dir"
        $app.Calls[0] | Should -Be "Concat(String:459, String:C:\dir)"
        @($res.byref_values.PSObject.Properties).Count | Should -Be 0
    }

    It "runs a parameterless procedure (0 args)" {
        $app = [FakeAccessApplication1940]::new()
        $proj = New-FakeVbProject -Source "Public Function Concat() As String`r`nEnd Function"

        $res = Invoke-AccessProcedure -AccessApplication $app -VbProject $proj -ProcedureName "Concat" -ProcedureArgs @()

        $res.ok | Should -BeTrue
        $app.Calls[0] | Should -Be "Concat()"
    }

    It "passes <count> ByVal argument(s)" -TestCases @(
        @{ count = 1 }, @{ count = 2 }, @{ count = 3 }, @{ count = 5 }, @{ count = 30 }
    ) {
        param($count)
        $app = [FakeAccessApplication1940]::new()
        $names = @(1..$count | ForEach-Object { "ByVal p$_ As String" })
        $proj = New-FakeVbProject -Source "Public Function Concat($($names -join ', ')) As String`r`nEnd Function"
        $values = @(1..$count | ForEach-Object { "v$_" })

        $res = Invoke-AccessProcedure -AccessApplication $app -VbProject $proj -ProcedureName "Concat" -ProcedureArgs $values

        $res.error | Should -BeNullOrEmpty
        $res.ok | Should -BeTrue
        $res.returnValue | Should -Be ($values -join "|")
        $res.argsCount | Should -Be $count
    }

    It "passes arguments when no signature metadata is available" {
        $app = [FakeAccessApplication1940]::new()

        $res = Invoke-AccessProcedure -AccessApplication $app -VbProject $null -ProcedureName "Concat" -ProcedureArgs @("a", "b", "c")

        $res.ok | Should -BeTrue
        $res.returnValue | Should -Be "a|b|c"
    }

    It "writes back only the parameters the signature declares ByRef (mixed signature)" {
        $app = [FakeAccessApplication1940]::new()
        $proj = New-FakeVbProject -Source "Public Function Mutate(ByVal p_A As String, p_B As String, ByRef p_C As Long, ByVal p_D As String) As String`r`nEnd Function"

        $res = Invoke-AccessProcedure -AccessApplication $app -VbProject $proj -ProcedureName "Mutate" -ProcedureArgs @("a", "b", 3, "d")

        $res.ok | Should -BeTrue
        $res.returnValue | Should -Be "mutated"
        $names = @($res.byref_values.PSObject.Properties.Name)
        $names | Should -Be @("p_B", "p_C")
        $res.byref_values.p_B | Should -Be "out1"
        $res.byref_values.p_C | Should -Be "out2"
    }

    It "keeps three ByRef arguments writing back (#606)" {
        $app = [FakeAccessApplication1940]::new()
        $proj = New-FakeVbProject -Source "Public Function Mutate(ByVal p_In As String, ByRef p_Out As String, Optional ByRef p_Error As String) As Boolean`r`nEnd Function"

        $res = Invoke-AccessProcedure -AccessApplication $app -VbProject $proj -ProcedureName "Mutate" -ProcedureArgs @("x", "", "")

        $res.ok | Should -BeTrue
        $res.byref_values.p_Out | Should -Be "out1"
        $res.byref_values.p_Error | Should -Be "out2"
        @($res.byref_values.PSObject.Properties.Name) | Should -Not -Contain "p_In"
    }

    It "pads an omitted trailing Optional ByRef parameter with Missing and reports it (#428)" {
        $app = [FakeAccessApplication1940]::new()
        $proj = New-FakeVbProject -Source "Public Function Mutate(ByVal p_In As String, Optional ByRef p_Error As String) As Boolean`r`nEnd Function"

        $res = Invoke-AccessProcedure -AccessApplication $app -VbProject $proj -ProcedureName "Mutate" -ProcedureArgs @("x")

        $res.ok | Should -BeTrue
        $app.Calls[0] | Should -Be "Mutate(String:x, <missing>)"
        $res.byref_values.p_Error | Should -Be "out1"
    }

    It "omits a trailing Optional ByVal parameter instead of padding it" {
        $app = [FakeAccessApplication1940]::new()
        $proj = New-FakeVbProject -Source "Public Function Concat(ByVal p_In As String, Optional ByVal p_Opt As String = ""d"") As String`r`nEnd Function"

        $res = Invoke-AccessProcedure -AccessApplication $app -VbProject $proj -ProcedureName "Concat" -ProcedureArgs @("x")

        $res.ok | Should -BeTrue
        $app.Calls[0] | Should -Be "Concat(String:x)"
    }

    It "names the parameter and its passing mode when Run rejects an argument" {
        $app = [pscustomobject]@{}
        $app | Add-Member -MemberType ScriptMethod -Name Run -Value {
            throw [System.Management.Automation.MethodException]::new("Argument: '3' should be a System.Management.Automation.PSReference. Use [ref].")
        }
        $proj = New-FakeVbProject -Source "Public Function Concat(ByVal p_IDEdicion As String, ByVal p_Dir As String) As String`r`nEnd Function"

        $res = Invoke-AccessProcedure -AccessApplication $app -VbProject $proj -ProcedureName "Concat" -ProcedureArgs @("459", "C:\dir")

        $res.ok | Should -BeFalse
        $res.error | Should -Match "RUN_ARGUMENT_MARSHALING_FAILED"
        $res.error | Should -Match "p_Dir"
        $res.error | Should -Match "ByVal"
        $res.error | Should -Not -Match "^Argument"
    }

    It "rejects more than 30 arguments with the Application.Run limit" {
        $app = [FakeAccessApplication1940]::new()

        { Invoke-AccessProcedure -AccessApplication $app -VbProject $null -ProcedureName "Concat" -ProcedureArgs @(1..31) } |
            Should -Throw "*30*"
        $app.Calls.Count | Should -Be 0
    }
}
