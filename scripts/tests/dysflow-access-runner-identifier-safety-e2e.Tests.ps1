#Requires -Modules Pester
#Requires -Version 5.1
<#
.SYNOPSIS
    Pester E2E tests for issue #573 (Format-AccessIdentifier) over the real
    production SQL interpolation sites — Invoke-CountRowsAction,
    Invoke-DistinctValuesAction, and the write-fixture actions
    (create_table, drop_table, seed_fixture, teardown_fixture).

.DESCRIPTION
    The unit-test file `dysflow-access-runner-identifier-quoting.Tests.ps1`
    proves the Format-AccessIdentifier helper's own contract (validity,
    bracket-escape, SQL separator, digit-prefix, unicode rejection, error
    message shape). It also AST-proves that every interpolation site delegates
    to the helper.

    What it does NOT do is exercise the full INTEGRATED flow: a malicious name
    reaches the SQL-construction site, Format-AccessIdentifier throws, and the
    caller's database mock is NEVER touched. This file fills that gap by
    extracting the real Invoke-* functions and Invoke-WriteAction block from
    the production `dysflow-access-runner.ps1` (via AST, the only safe way —
    the runner has a mandatory param block + Access COM at top level so it
    cannot be plain dot-sourced) and running them against a synthetic
    database that records any SQL it would have executed.

    If a regression removes the helper or substitutes bare `[name]` brackets,
    the malicious name will reach the SQL string and either throw a different
    error or (worse) succeed against the fake DB with bracket-escape
    injections. Either way the SqlCalls counter or the error-message shape
    pinpoints the regression.

    No Access COM / real .accdb required: pure AST extraction + a fake DB.
#>

BeforeAll {
    $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"

    if (-not (Test-Path -LiteralPath $script:RunnerPath)) {
        throw "Runner script not found at $($script:RunnerPath)"
    }

    $script:RunnerAst = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:RunnerPath).Path,
        [ref]$null,
        [ref]$null
    )

    # Extract the helper + every SQL-construction site from production. The
    # function bodies are pasted verbatim into the test scope so any future
    # regression in those specific code paths surfaces here.
    $functionsToExtract = @(
        "Format-AccessIdentifier",
        "Format-SqlLiteral",
        "Convert-RecordsetRows",
        "Invoke-CountRowsAction",
        "Invoke-DistinctValuesAction",
        "Invoke-WriteAction"
    )
    foreach ($name in $functionsToExtract) {
        $fn = $script:RunnerAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq $name },
            $true
        ) | Select-Object -First 1
        if ($null -eq $fn) {
            throw "Could not locate function '$name' in $($script:RunnerPath)"
        }
        Invoke-Expression $fn.Extent.Text
    }

    # Synthetic database that records the SQL string passed to OpenRecordset /
    # Execute. The production Invoke-CountRowsAction et al. talk to whatever
    # $Database we hand them, so this is the full integration seam — if the
    # SQL ever reaches us with a malicious name, the regression is on disk.
    #
    # OpenRecordset returns a fake recordset shaped just enough to make
    # Convert-RecordsetRows iterate cleanly (EOF true, Fields empty,
    # MoveNext returning $false). Execute returns without raising. The
    # SqlCalls list records the SQL in invocation order so the assertions can
    # pin both the count and the exact string.
    $script:FakeDatabase = [PSCustomObject]@{
        SqlCalls = [System.Collections.ArrayList]::new()
    }
    $script:FakeDatabase | Add-Member -MemberType ScriptMethod -Name "OpenRecordset" -Value {
        param([string]$Sql)
        [void]$this.SqlCalls.Add($Sql)
        # Minimal DAO-ish recordset surface. Convert-RecordsetRows reads EOF,
        # Fields.Count, Fields.Item(i) (which returns a field with Name/Value),
        # and calls MoveNext — all safe defaults. The recordset reports EOF
        # immediately so the while-loop exits without iterating.
        $emptyFields = [PSCustomObject]@{
            Count = 0
        }
        $emptyFields | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
            param([int]$Index)
            return [PSCustomObject]@{ Name = "Col"; Value = $null }
        }
        $recordset = [PSCustomObject]@{
            EOF = $true
            Fields = $emptyFields
        }
        $recordset | Add-Member -MemberType ScriptMethod -Name "MoveNext" -Value { }
        return $recordset
    }
    $script:FakeDatabase | Add-Member -MemberType ScriptMethod -Name "Execute" -Value {
        param([string]$Sql, [int]$Options)
        [void]$this.SqlCalls.Add($Sql)
    }
    $script:FakeDatabase | Add-Member -MemberType ScriptMethod -Name "RecordsAffected" -Value { 0 }
}

Describe "Issue #573 — integrated SQL interpolation sites reject malicious identifiers (E2E)" {

    BeforeEach {
        $script:FakeDatabase.SqlCalls.Clear()
    }

    Context "Invoke-CountRowsAction — read path" {

        It "rejects a bracket-escape attempt: 'Users]' never reaches OpenRecordset" {
            { Invoke-CountRowsAction -Database $script:FakeDatabase -TableName "Users]" } |
                Should -Throw -ExpectedMessage "*Invalid table*"
            $script:FakeDatabase.SqlCalls.Count | Should -Be 0
        }

        It "rejects a SQL separator injection: 'MyTable;DROP TABLE x' never reaches OpenRecordset" {
            { Invoke-CountRowsAction -Database $script:FakeDatabase -TableName "MyTable;DROP TABLE x" } |
                Should -Throw -ExpectedMessage "*Invalid table*"
            $script:FakeDatabase.SqlCalls.Count | Should -Be 0
        }

        It "rejects a digit-prefixed identifier: '1Bad' never reaches OpenRecordset" {
            { Invoke-CountRowsAction -Database $script:FakeDatabase -TableName "1Bad" } |
                Should -Throw -ExpectedMessage "*Invalid table*"
            $script:FakeDatabase.SqlCalls.Count | Should -Be 0
        }

        It "accepts a valid identifier and produces SELECT COUNT(*) FROM [Name]" {
            Invoke-CountRowsAction -Database $script:FakeDatabase -TableName "TbValid" | Out-Null
            $script:FakeDatabase.SqlCalls.Count | Should -Be 1
            $script:FakeDatabase.SqlCalls[0] | Should -Be "SELECT COUNT(*) AS RowCount FROM [TbValid]"
        }
    }

    Context "Invoke-DistinctValuesAction — read path with table AND column" {

        It "rejects a malicious column name: 'bad;name' never reaches OpenRecordset" {
            { Invoke-DistinctValuesAction -Database $script:FakeDatabase -TableName "TbOk" -ColumnName "bad;name" } |
                Should -Throw -ExpectedMessage "*Invalid column*"
            $script:FakeDatabase.SqlCalls.Count | Should -Be 0
        }

        It "rejects a malicious table name even when the column is valid: never reaches OpenRecordset" {
            { Invoke-DistinctValuesAction -Database $script:FakeDatabase -TableName "bad-name" -ColumnName "col_ok" } |
                Should -Throw -ExpectedMessage "*Invalid table*"
            $script:FakeDatabase.SqlCalls.Count | Should -Be 0
        }

        It "accepts valid identifiers and brackets both column AND table" {
            Invoke-DistinctValuesAction -Database $script:FakeDatabase -TableName "TbUsers" -ColumnName "region" | Out-Null
            $script:FakeDatabase.SqlCalls.Count | Should -Be 1
            $script:FakeDatabase.SqlCalls[0] | Should -Be "SELECT DISTINCT [region] AS [Value] FROM [TbUsers]"
        }
    }

    Context "Invoke-WriteAction — write-fixture path (create_table, drop_table, seed_fixture, teardown_fixture)" {

        It "create_table rejects a malicious table name and never reaches Execute" {
            { Invoke-WriteAction -Database $script:FakeDatabase -Action "create_table" -Payload ([PSCustomObject]@{
                    tableName = "BadTable]"
                    definition = "Id INT"
                })
            } | Should -Throw -ExpectedMessage "*Invalid table*"
            $script:FakeDatabase.SqlCalls.Count | Should -Be 0
        }

        It "drop_table rejects a SQL-injection table name and never reaches Execute" {
            { Invoke-WriteAction -Database $script:FakeDatabase -Action "drop_table" -Payload ([PSCustomObject]@{
                    tableName = "Users; DROP TABLE Users--"
                })
            } | Should -Throw -ExpectedMessage "*Invalid table*"
            $script:FakeDatabase.SqlCalls.Count | Should -Be 0
        }

        It "seed_fixture rejects a malicious column name from a row and never reaches Execute" {
            { Invoke-WriteAction -Database $script:FakeDatabase -Action "seed_fixture" -Payload ([PSCustomObject]@{
                    tableName = "TbOk"
                    rows = @(
                        [PSCustomObject]@{ "bad;name" = 1; "ok_col" = "value" }
                    )
                })
            } | Should -Throw -ExpectedMessage "*Invalid column*"
            $script:FakeDatabase.SqlCalls.Count | Should -Be 0
        }

        It "teardown_fixture rejects a malicious table name and never reaches Execute" {
            { Invoke-WriteAction -Database $script:FakeDatabase -Action "teardown_fixture" -Payload ([PSCustomObject]@{
                    tableName = "1Bad"
                })
            } | Should -Throw -ExpectedMessage "*Invalid table*"
            $script:FakeDatabase.SqlCalls.Count | Should -Be 0
        }

        It "create_table accepts a valid table name and emits CREATE TABLE [Name]" {
            Invoke-WriteAction -Database $script:FakeDatabase -Action "create_table" -Payload ([PSCustomObject]@{
                    tableName = "TbNew"
                    definition = "Id INT, Name TEXT(50)"
                    dryRun    = $false
                }) | Out-Null
            $script:FakeDatabase.SqlCalls.Count | Should -Be 1
            $script:FakeDatabase.SqlCalls[0] | Should -Be "CREATE TABLE [TbNew] (Id INT, Name TEXT(50))"
        }

        It "drop_table accepts a valid table name and emits DROP TABLE [Name]" {
            Invoke-WriteAction -Database $script:FakeDatabase -Action "drop_table" -Payload ([PSCustomObject]@{
                    tableName = "TbDrop"
                    dryRun    = $false
                }) | Out-Null
            $script:FakeDatabase.SqlCalls.Count | Should -Be 1
            $script:FakeDatabase.SqlCalls[0] | Should -Be "DROP TABLE [TbDrop]"
        }

        It "teardown_fixture accepts a valid table name and emits DELETE FROM [Name]" {
            Invoke-WriteAction -Database $script:FakeDatabase -Action "teardown_fixture" -Payload ([PSCustomObject]@{
                    tableName = "TbTear"
                    dryRun    = $false
                }) | Out-Null
            $script:FakeDatabase.SqlCalls.Count | Should -Be 1
            $script:FakeDatabase.SqlCalls[0] | Should -Be "DELETE FROM [TbTear]"
        }

        It "create_table dryRun=true short-circuits and returns the SQL string without invoking Execute (regression: write-action default must be safe)" {
            $result = Invoke-WriteAction -Database $script:FakeDatabase -Action "create_table" -Payload ([PSCustomObject]@{
                    tableName = "TbPlanOnly"
                    definition = "Id INT"
                })
            # Dry-run is the safe default for every write-fixture action — the
            # helper returns the planned SQL so a caller can render a
            # confirmation prompt before applying.
            $result.dryRun | Should -Be $true
            $result.sql    | Should -Be "CREATE TABLE [TbPlanOnly] (Id INT)"
            $script:FakeDatabase.SqlCalls.Count | Should -Be 0
        }
    }
}