#Requires -Modules Pester
#Requires -Version 5.1

BeforeAll {
    $runnerPath = Join-Path $PSScriptRoot '..\dysflow-access-runner.ps1'
    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $runnerPath).Path,
        [ref]$null,
        [ref]$null
    )
    foreach ($name in @(
        'Format-AccessIdentifier',
        'Format-SqlLiteral',
        'Convert-RecordsetRows',
        'Get-TableSchema',
        'Invoke-GetSchemaAction',
        'Invoke-CountRowsAction',
        'Invoke-DistinctValuesAction',
        'Invoke-WriteAction'
    )) {
        $functionAst = $ast.FindAll(
            { $args[0] -is [Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $name },
            $true
        ) | Select-Object -First 1
        if ($null -eq $functionAst) { throw "Production function '$name' was not found." }
        Invoke-Expression $functionAst.Extent.Text
    }

    function New-IdentifierFakeDatabase {
        $database = [PSCustomObject]@{
            SqlCalls = [Collections.ArrayList]::new()
            SchemaCalls = [Collections.ArrayList]::new()
            RecordsAffected = 1
        }
        $tableDefs = [PSCustomObject]@{ Database = $database }
        $tableDefs | Add-Member ScriptMethod Item {
            param([string] $Name)
            [void]$this.Database.SchemaCalls.Add($Name)
            return [PSCustomObject]@{ Fields = @() }
        }
        $database | Add-Member NoteProperty TableDefs $tableDefs
        $database | Add-Member ScriptMethod OpenRecordset {
            param([string] $Sql)
            [void]$this.SqlCalls.Add($Sql)
            $recordset = [PSCustomObject]@{ EOF = $true; Fields = [PSCustomObject]@{ Count = 0 } }
            $recordset | Add-Member ScriptMethod MoveNext { }
            $recordset | Add-Member ScriptMethod Close { }
            return $recordset
        }
        $database | Add-Member ScriptMethod Execute {
            param([string] $Sql, [int] $Options)
            [void]$this.SqlCalls.Add($Sql)
        }
        return $database
    }

    $script:DaoAvailable = $false
    try {
        $probe = New-Object -ComObject DAO.DBEngine.120
        [Runtime.InteropServices.Marshal]::FinalReleaseComObject($probe) | Out-Null
        $script:DaoAvailable = $true
    } catch { $script:DaoAvailable = $false }
}

Describe 'Access identifier compatibility contract (#1456)' {
    It 'bracket-quotes spaces, Unicode, reserved words, hyphens, and leading digits' -ForEach @(
        @{ Name = 'Order Details'; Expected = '[Order Details]' }
        @{ Name = 'Año'; Expected = '[Año]' }
        @{ Name = 'SELECT'; Expected = '[SELECT]' }
        @{ Name = 'Order-Details'; Expected = '[Order-Details]' }
        @{ Name = '2026Data'; Expected = '[2026Data]' }
    ) {
        Format-AccessIdentifier -Name $Name | Should -Be $Expected
    }

    It 'rejects empty, whitespace-only, and closing-bracket names' -ForEach @(
        @{ Name = ''; Message = '*required*' }
        @{ Name = '   '; Message = '*required*' }
        @{ Name = 'Orders] DROP TABLE Users'; Message = '*Invalid*' }
    ) {
        { Format-AccessIdentifier -Name $Name } | Should -Throw -ExpectedMessage $Message
    }

    It 'uses the same valid-name set across schema, count, distinct, and fixtures' {
        $database = New-IdentifierFakeDatabase
        Invoke-GetSchemaAction -Database $database -TableName 'Order Details' | Out-Null
        Invoke-CountRowsAction -Database $database -TableName '2026 Data' | Out-Null
        Invoke-DistinctValuesAction -Database $database -TableName 'Order-Details' -ColumnName 'SELECT' | Out-Null
        Invoke-WriteAction -Database $database -Action 'seed_fixture' -Payload ([PSCustomObject]@{
            tableName = 'Año Datos'; rows = @([PSCustomObject][ordered]@{ 'Order Id' = 900000 }); dryRun = $false
        }) | Out-Null
        Invoke-WriteAction -Database $database -Action 'teardown_fixture' -Payload ([PSCustomObject]@{
            tableName = '2026 Fixtures'; predicate = [PSCustomObject]@{ column = 'Test Id'; min = 900000; max = 900001 }; dryRun = $false
        }) | Out-Null

        @($database.SchemaCalls) | Should -Be @('Order Details')
        @($database.SqlCalls) | Should -Be @(
            'SELECT COUNT(*) AS RowCount FROM [2026 Data]'
            'SELECT DISTINCT [SELECT] AS [Value] FROM [Order-Details]'
            'INSERT INTO [Año Datos] ([Order Id]) VALUES (900000)'
            'DELETE FROM [2026 Fixtures] WHERE [Test Id] BETWEEN 900000 AND 900001'
        )
    }

    It 'rejects a closing bracket before any schema or SQL boundary is called' -ForEach @(
        @{ Invoke = { param($Db) Invoke-GetSchemaAction -Database $Db -TableName 'Unsafe]' } }
        @{ Invoke = { param($Db) Invoke-CountRowsAction -Database $Db -TableName 'Unsafe]' } }
        @{ Invoke = { param($Db) Invoke-DistinctValuesAction -Database $Db -TableName 'Safe' -ColumnName 'Unsafe]' } }
        @{ Invoke = { param($Db) Invoke-WriteAction -Database $Db -Action 'seed_fixture' -Payload ([PSCustomObject]@{ tableName = 'Safe'; rows = @([PSCustomObject][ordered]@{ 'Unsafe]' = 1 }) }) } }
        @{ Invoke = { param($Db) Invoke-WriteAction -Database $Db -Action 'teardown_fixture' -Payload ([PSCustomObject]@{ tableName = 'Safe'; predicate = [PSCustomObject]@{ column = 'Unsafe]'; min = 900000; max = 900001 } }) } }
    ) {
        $database = New-IdentifierFakeDatabase
        { & $Invoke $database } | Should -Throw -ExpectedMessage '*Invalid*'
        ($database.SqlCalls.Count + $database.SchemaCalls.Count) | Should -Be 0
    }

    It 'executes the representative compatibility names against a disposable real Access database' {
        if (-not $script:DaoAvailable) {
            Set-ItResult -Skipped -Because 'DAO.DBEngine COM is unavailable.'
            return
        }
        $directory = Join-Path ([IO.Path]::GetTempPath()) ('dysflow1456_' + [guid]::NewGuid().ToString('N'))
        $path = Join-Path $directory 'identifiers.accdb'
        New-Item -ItemType Directory -Path $directory | Out-Null
        $engine = $null
        $database = $null
        try {
            $engine = New-Object -ComObject DAO.DBEngine.120
            $database = $engine.CreateDatabase($path, ';LANGID=0x0409;CP=1252;COUNTRY=0')
            $table = $database.CreateTableDef('2026 Café-Orders')
            $table.Fields.Append($table.CreateField('Test Id', 4))
            $table.Fields.Append($table.CreateField('SELECT', 10, 50))
            $database.TableDefs.Append($table)

            $schema = Invoke-GetSchemaAction -Database $database -TableName '2026 Café-Orders'
            @($schema.schema.name) | Should -Be @('Test Id', 'SELECT')
            Invoke-WriteAction -Database $database -Action 'seed_fixture' -Payload ([PSCustomObject]@{
                tableName = '2026 Café-Orders'; rows = @([PSCustomObject][ordered]@{ 'Test Id' = 900000; 'SELECT' = 'uno' }); dryRun = $false
            }) | Out-Null
            $count = Invoke-CountRowsAction -Database $database -TableName '2026 Café-Orders'
            [int]$count.rows[0].RowCount | Should -Be 1
            $distinct = Invoke-DistinctValuesAction -Database $database -TableName '2026 Café-Orders' -ColumnName 'SELECT'
            [string]$distinct.rows[0].Value | Should -Be 'uno'
            Invoke-WriteAction -Database $database -Action 'teardown_fixture' -Payload ([PSCustomObject]@{
                tableName = '2026 Café-Orders'; predicate = [PSCustomObject]@{ column = 'Test Id'; min = 900000; max = 900000 }; dryRun = $false
            }) | Out-Null
            $after = Invoke-CountRowsAction -Database $database -TableName '2026 Café-Orders'
            [int]$after.rows[0].RowCount | Should -Be 0
        } finally {
            if ($null -ne $database) { try { $database.Close() } catch { } }
            if ($null -ne $database) { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($database) | Out-Null }
            if ($null -ne $engine) { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($engine) | Out-Null }
            Start-Sleep -Milliseconds 200
            Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
