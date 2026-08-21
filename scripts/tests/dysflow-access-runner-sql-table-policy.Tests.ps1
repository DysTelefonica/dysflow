#Requires -Modules Pester
#Requires -Version 5.1
BeforeAll {
    $runnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"
    $runnerAst = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $runnerPath).Path, [ref]$null, [ref]$null)
    $invokeWriteAction = $runnerAst.FindAll(
        { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
          $args[0].Name -eq "Invoke-WriteAction" },
        $true
    ) | Select-Object -First 1
    if ($null -eq $invokeWriteAction) { throw "Could not locate Invoke-WriteAction in $runnerPath" }
    Invoke-Expression $invokeWriteAction.Extent.Text
    $script:FakeDatabase = [PSCustomObject]@{ SqlCalls = [System.Collections.ArrayList]::new(); RecordsAffected = 0 }
    $script:FakeDatabase | Add-Member -MemberType ScriptMethod -Name "Execute" -Value {
        param([string]$Sql, [int]$Options)
        [void]$this.SqlCalls.Add($Sql)
    }
}
Describe "Issue #1452 - production PowerShell arbitrary-SQL table policy gate" {
    BeforeEach { $script:FakeDatabase.SqlCalls.Clear() }
    It "exec_sql rejects allowTables even when the supplied array is empty" {
        {
            Invoke-WriteAction -Database $script:FakeDatabase -Action "exec_sql" -Payload ([PSCustomObject]@{
                sql = "UPDATE People SET active=True"
                allowTables = @()
                dryRun = $false
            })
        } | Should -Throw -ExpectedMessage "MCP_INPUT_INVALID:*allowTables*"
        $script:FakeDatabase.SqlCalls.Count | Should -Be 0
    }
    It "run_script rejects denyTables before resolving or reading the script path" {
        {
            Invoke-WriteAction -Database $script:FakeDatabase -Action "run_script" -Payload ([PSCustomObject]@{
                scriptPath = "does-not-exist.sql"
                denyTables = @("Secrets")
                dryRun = $false
            })
        } | Should -Throw -ExpectedMessage "MCP_INPUT_INVALID:*denyTables*"
        $script:FakeDatabase.SqlCalls.Count | Should -Be 0
    }
    It "exec_sql preserves existing execution when table-policy parameters are omitted" {
        $result = Invoke-WriteAction -Database $script:FakeDatabase -Action "exec_sql" -Payload ([PSCustomObject]@{
            sql = "UPDATE People SET active=True"
            dryRun = $false
        })
        $result.dryRun | Should -BeFalse
        $script:FakeDatabase.SqlCalls.Count | Should -Be 1
        $script:FakeDatabase.SqlCalls[0] | Should -Be "UPDATE People SET active=True"
    }
}
