#Requires -Modules Pester
#Requires -Version 5.1

# Issue #1943 — get_schema returned a stale column list for a table that is a
# LINKED TableDef in the opened database: DAO's TableDef.Fields on a link is
# the link's cached field list (stale until RefreshLink), while SQL against the
# same table resolves through the link and sees the source's current columns.
# These tests drive the production functions against a fake DAO object model;
# no real Access or DAO engine is ever created.

BeforeAll {
    # Guard: any attempt to create a real COM object (Access.Application or a
    # DAO.DBEngine) from the code under test fails the run instead of spawning
    # Access on the developer machine.
    function New-Object {
        param([string] $TypeName, [string] $ComObject)
        if ($ComObject) { throw "Test guard: real COM object '$ComObject' must not be created." }
        Microsoft.PowerShell.Utility\New-Object -TypeName $TypeName
    }
    function New-DaoDbEngine { throw 'Test guard: New-DaoDbEngine must not run in unit tests.' }

    $runnerPath = Join-Path $PSScriptRoot '..\dysflow-access-runner.ps1'
    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $runnerPath).Path,
        [ref]$null,
        [ref]$null
    )
    foreach ($name in @(
        'Format-AccessIdentifier',
        'Open-DatabaseWithPassword',
        'Remove-PasswordFromConnectString',
        'Get-TableDefFieldSchema',
        'Get-TableSchema',
        'Invoke-GetSchemaAction'
    )) {
        $functionAst = $ast.FindAll(
            { $args[0] -is [Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $name },
            $true
        ) | Select-Object -First 1
        if ($null -eq $functionAst) { throw "Production function '$name' was not found." }
        Invoke-Expression $functionAst.Extent.Text
    }

    function New-FakeField {
        param([string] $Name)
        $properties = [PSCustomObject]@{}
        $properties | Add-Member ScriptMethod Item { param([string] $Key) return $true }
        return [PSCustomObject]@{
            Name = $Name
            Type = 10
            Size = 255
            Required = $false
            AllowZeroLength = $true
            Properties = $properties
        }
    }

    function New-FakeTableDef {
        param([string] $Connect = '', [string] $SourceTableName = '', [string[]] $Columns)
        return [PSCustomObject]@{
            Connect = $Connect
            SourceTableName = $SourceTableName
            LastUpdated = [datetime]'2026-10-01T08:30:00'
            Fields = @($Columns | ForEach-Object { New-FakeField -Name $_ })
        }
    }

    function New-FakeDatabase {
        param([hashtable] $Tables)
        $database = [PSCustomObject]@{ Closed = $false; Tables = $Tables }
        $tableDefs = [PSCustomObject]@{ Database = $database }
        $tableDefs | Add-Member ScriptMethod Item {
            param([string] $Name)
            $table = $this.Database.Tables[$Name]
            if ($null -eq $table) { throw "Item not found in this collection: $Name" }
            return $table
        }
        $database | Add-Member NoteProperty TableDefs $tableDefs
        $database | Add-Member ScriptMethod Close { $this.Closed = $true }
        return $database
    }

    function New-FakeEngine {
        param([hashtable] $Databases, [switch] $FailOpen)
        $engine = [PSCustomObject]@{
            Databases = $Databases
            FailOpen = [bool]$FailOpen
            Opens = [Collections.ArrayList]::new()
        }
        $engine | Add-Member ScriptMethod OpenDatabase {
            param($Path, $Exclusive, $ReadOnly, $Connect)
            [void]$this.Opens.Add([PSCustomObject]@{
                Path = [string]$Path; Exclusive = $Exclusive; ReadOnly = $ReadOnly; Connect = [string]$Connect
            })
            if ($this.FailOpen) { throw "Could not find file '$Path'." }
            return $this.Databases[[string]$Path]
        }
        return $engine
    }

    $script:OldColumns = @('IDAnexo', 'IDEdicion', 'Nombre', 'Ruta', 'Tipo', 'Fecha', 'Usuario', 'Notas', 'Orden')
    $script:NewColumns = $script:OldColumns + @('IDAccionMitigacion', 'IDAccionContingencia')
}

Describe 'get_schema reads the current definition of a linked table (#1943)' {
    BeforeEach {
        $BackendPassword = ''
    }

    It 'lists columns added to the source table after the link was created' {
        $source = New-FakeDatabase -Tables @{ TbAnexos = New-FakeTableDef -Columns $script:NewColumns }
        $engine = New-FakeEngine -Databases @{ 'C:\data\Backend.accdb' = $source }
        $opened = New-FakeDatabase -Tables @{
            TbAnexos = New-FakeTableDef -Connect ';DATABASE=C:\data\Backend.accdb' -SourceTableName 'TbAnexos' -Columns $script:OldColumns
        }

        $result = Invoke-GetSchemaAction -Database $opened -TableName 'TbAnexos' -DbEngine $engine

        @($result.schema | ForEach-Object { $_.name }) | Should -Be $script:NewColumns
        $result.schemaSource.kind | Should -Be 'linked-source'
        $result.schemaSource.live | Should -BeTrue
        $result.schemaSource.sourceDatabase | Should -Be 'C:\data\Backend.accdb'
        $result.schemaSource.sourceTableName | Should -Be 'TbAnexos'
        $engine.Opens.Count | Should -Be 1
        $engine.Opens[0].ReadOnly | Should -BeTrue
        $source.Closed | Should -BeTrue
    }

    It 'follows SourceTableName when the link is renamed locally' {
        $source = New-FakeDatabase -Tables @{ tblAnexosBE = New-FakeTableDef -Columns $script:NewColumns }
        $engine = New-FakeEngine -Databases @{ 'C:\data\Backend.accdb' = $source }
        $opened = New-FakeDatabase -Tables @{
            TbAnexos = New-FakeTableDef -Connect ';DATABASE=C:\data\Backend.accdb' -SourceTableName 'tblAnexosBE' -Columns $script:OldColumns
        }

        $result = Invoke-GetSchemaAction -Database $opened -TableName 'TbAnexos' -DbEngine $engine

        @($result.schema).Count | Should -Be 11
        $result.schemaSource.sourceTableName | Should -Be 'tblAnexosBE'
    }

    It 'opens the source with the link password without echoing it' {
        $source = New-FakeDatabase -Tables @{ TbAnexos = New-FakeTableDef -Columns $script:NewColumns }
        $engine = New-FakeEngine -Databases @{ 'C:\data\Backend.accdb' = $source }
        $opened = New-FakeDatabase -Tables @{
            TbAnexos = New-FakeTableDef -Connect 'MS Access;PWD=s3cret;DATABASE=C:\data\Backend.accdb' -SourceTableName 'TbAnexos' -Columns $script:OldColumns
        }

        $result = Invoke-GetSchemaAction -Database $opened -TableName 'TbAnexos' -DbEngine $engine

        $engine.Opens[0].Connect | Should -Be ';PWD=s3cret'
        ($result | ConvertTo-Json -Depth 10) | Should -Not -Match 's3cret'
    }

    It 'reads a local table from its own definition and labels the result as live' {
        $engine = New-FakeEngine -Databases @{}
        $opened = New-FakeDatabase -Tables @{ TbAnexos = New-FakeTableDef -Columns $script:NewColumns }

        $result = Invoke-GetSchemaAction -Database $opened -TableName 'TbAnexos' -DbEngine $engine

        @($result.schema).Count | Should -Be 11
        $result.schemaSource.kind | Should -Be 'table-definition'
        $result.schemaSource.live | Should -BeTrue
        $engine.Opens.Count | Should -Be 0
    }

    It 'falls back to link metadata with its age and a refresh hint when the source cannot be opened' {
        $BackendPassword = 'envSecret'
        $engine = New-FakeEngine -Databases @{} -FailOpen
        $opened = New-FakeDatabase -Tables @{
            TbAnexos = New-FakeTableDef -Connect ';PWD=linkSecret;DATABASE=C:\gone\Backend.accdb' -SourceTableName 'TbAnexos' -Columns $script:OldColumns
        }

        $result = Invoke-GetSchemaAction -Database $opened -TableName 'TbAnexos' -DbEngine $engine

        @($result.schema).Count | Should -Be 9
        $result.schemaSource.kind | Should -Be 'link-metadata'
        $result.schemaSource.live | Should -BeFalse
        $result.schemaSource.linkLastUpdated | Should -Be '2026-10-01T08:30:00'
        $result.schemaSource.warning | Should -Match 'relink_tables'
        $json = $result | ConvertTo-Json -Depth 10
        $json | Should -Not -Match 'linkSecret'
        $json | Should -Not -Match 'envSecret'
    }

    It 'does not open non-Access links and reports their metadata as possibly stale' {
        $engine = New-FakeEngine -Databases @{}
        $opened = New-FakeDatabase -Tables @{
            TbAnexos = New-FakeTableDef -Connect 'ODBC;DSN=Sales;UID=sa;PWD=odbcSecret' -SourceTableName 'dbo.Anexos' -Columns $script:OldColumns
        }

        $result = Invoke-GetSchemaAction -Database $opened -TableName 'TbAnexos' -DbEngine $engine

        $engine.Opens.Count | Should -Be 0
        $result.schemaSource.kind | Should -Be 'link-metadata'
        ($result | ConvertTo-Json -Depth 10) | Should -Not -Match 'odbcSecret'
    }

    It 'keeps link metadata when no DAO engine is supplied' {
        $opened = New-FakeDatabase -Tables @{
            TbAnexos = New-FakeTableDef -Connect ';DATABASE=C:\data\Backend.accdb' -SourceTableName 'TbAnexos' -Columns $script:OldColumns
        }

        $result = Invoke-GetSchemaAction -Database $opened -TableName 'TbAnexos'

        $result.schemaSource.kind | Should -Be 'link-metadata'
    }
}
