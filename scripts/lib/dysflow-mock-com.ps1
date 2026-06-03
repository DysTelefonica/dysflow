# ---------------------------------------------------------------------------
# Dysflow Microsoft Access / DAO COM Mock Module
# ---------------------------------------------------------------------------
# Used on Linux/macOS or when $env:DYSFLOW_MOCK_COM = 1 to bypass
# platform-specific COM registration and native Win32 library dependencies.

function Get-MockAccessApplication {
    $mockDoCmd = [PSCustomObject]@{ }
    $mockDoCmd | Add-Member -MemberType ScriptMethod -Name SetWarnings -Value { param($val) }

    $mockVbe = [PSCustomObject]@{ }
    $mockVbProject = [PSCustomObject]@{ }

    $mockAccess = [PSCustomObject]@{
        hWndAccessApp              = [IntPtr]1234
        AutomationSecurity         = 1
        Visible                    = $false
        UserControl                = $false
        DoCmd                      = $mockDoCmd
        Vbe                        = $mockVbe
        VbProject                  = $mockVbProject
    }

    $mockAccess | Add-Member -MemberType ScriptMethod -Name OpenCurrentDatabase -Value { param($dbPath, $exclusive, $password) }
    $mockAccess | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value { }
    $mockAccess | Add-Member -MemberType ScriptMethod -Name Quit -Value { }

    return $mockAccess
}

function Get-MockDaoDbEngine {
    $mockEngine = [PSCustomObject]@{ }
    $mockEngine | Add-Member -MemberType ScriptMethod -Name OpenDatabase -Value {
        param([string]$DatabasePath, [bool]$options, [bool]$readOnly, [string]$connect)
        return Get-MockDatabase -DatabasePath $DatabasePath
    }
    return $mockEngine
}

function Get-MockRecordset {
    param([array]$Rows)

    $rs = [PSCustomObject]@{
        _Index = 0
        _Rows  = $Rows
    }
    $rs | Add-Member -MemberType ScriptProperty -Name EOF -GetScript {
        return $this._Index -ge $this._Rows.Count
    }
    $rs | Add-Member -MemberType ScriptProperty -Name Fields -GetScript {
        if ($this._Index -ge $this._Rows.Count) { return $null }
        $row = $this._Rows[$this._Index]
        $fieldsList = [System.Collections.ArrayList]::new()
        foreach ($prop in $row.PSObject.Properties) {
            $fieldsList.Add([PSCustomObject]@{
                Name  = $prop.Name
                Value = $prop.Value
            }) | Out-Null
        }
        return $fieldsList
    }
    $rs | Add-Member -MemberType ScriptMethod -Name MoveNext -Value {
        $this._Index++
    }
    $rs | Add-Member -MemberType ScriptMethod -Name Close -Value { }

    return $rs
}

function Get-MockDatabase {
    param([string]$DatabasePath)

    # 1. Load mock data from environment variable if configured
    $mockData = $null
    if ($env:DYSFLOW_MOCK_FIXTURE_PATH -and (Test-Path -LiteralPath $env:DYSFLOW_MOCK_FIXTURE_PATH)) {
        try {
            $json = Get-Content -LiteralPath $env:DYSFLOW_MOCK_FIXTURE_PATH -Raw
            $mockData = ConvertFrom-Json $json
        } catch {
            Write-Warning "Failed to load mock fixture: $_"
        }
    }

    # 2. Provide default mock data if none was loaded
    if ($null -eq $mockData) {
        $mockData = [PSCustomObject]@{
            TableDefs = @(
                [PSCustomObject]@{ Name = "Clientes"; Connect = ""; Fields = @("ID", "Nombre") },
                [PSCustomObject]@{ Name = "Facturas"; Connect = ""; Fields = @("ID", "ClienteID", "Total") }
            )
            QueryDefs = @(
                [PSCustomObject]@{ Name = "QueryClientes"; SQL = "SELECT * FROM Clientes" }
            )
            Relations = @(
                [PSCustomObject]@{ Name = "FK_Clientes_Facturas"; Table = "Clientes"; ForeignTable = "Facturas"; Fields = @("ID", "ClienteID") }
            )
            Queries = @{
                "SELECT COUNT\(\*\) AS RowCount" = @( [PSCustomObject]@{ RowCount = 2 } )
                "SELECT \* FROM Clientes" = @(
                    [PSCustomObject]@{ ID = 1; Nombre = "Cliente Mock A" },
                    [PSCustomObject]@{ ID = 2; Nombre = "Cliente Mock B" }
                )
            }
        }
    }

    # 3. Build TableDefs collection
    $tableDefs = [System.Collections.ArrayList]::new()
    foreach ($t in $mockData.TableDefs) {
        $fields = [System.Collections.ArrayList]::new()
        if ($t.Fields) {
            foreach ($f in $t.Fields) {
                $fields.Add([PSCustomObject]@{ Name = $f }) | Out-Null
            }
        }
        $td = [PSCustomObject]@{
            Name = $t.Name
            Connect = $t.Connect
            Fields = $fields
        }
        $td | Add-Member -MemberType ScriptMethod -Name RefreshLink -Value { }
        $tableDefs.Add($td) | Out-Null
    }

    # Add methods to the array list object itself
    Add-Member -InputObject $tableDefs -MemberType ScriptMethod -Name Item -Value {
        param($name)
        return $this | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    }
    Add-Member -InputObject $tableDefs -MemberType ScriptMethod -Name Append -Value {
        param($td)
        $this.Add($td) | Out-Null
    }
    Add-Member -InputObject $tableDefs -MemberType ScriptMethod -Name Delete -Value {
        param($name)
        $matched = $this | Where-Object { $_.Name -eq $name }
        if ($matched) {
            $this.Remove($matched) | Out-Null
        }
    }

    # 4. Build QueryDefs collection
    $queryDefs = [System.Collections.ArrayList]::new()
    foreach ($q in $mockData.QueryDefs) {
        $qd = [PSCustomObject]@{
            Name = $q.Name
            SQL  = $q.SQL
        }
        $queryDefs.Add($qd) | Out-Null
    }
    Add-Member -InputObject $queryDefs -MemberType ScriptMethod -Name Item -Value {
        param($name)
        return $this | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    }

    # 5. Build Relations collection
    $relations = [System.Collections.ArrayList]::new()
    foreach ($r in $mockData.Relations) {
        $fields = [System.Collections.ArrayList]::new()
        if ($r.Fields) {
            $fields.Add([PSCustomObject]@{
                Name = $r.Fields[0]
                ForeignName = $r.Fields[1]
            }) | Out-Null
        }
        $rel = [PSCustomObject]@{
            Name = $r.Name
            Table = $r.Table
            ForeignTable = $r.ForeignTable
            Fields = $fields
        }
        $relations.Add($rel) | Out-Null
    }

    # 6. Build the main Database object
    $db = [PSCustomObject]@{
        TableDefs       = $tableDefs
        QueryDefs       = $queryDefs
        Relations       = $relations
        RecordsAffected = 0
    }

    # Database methods
    $db | Add-Member -MemberType ScriptMethod -Name Close -Value { }
    $db | Add-Member -MemberType ScriptMethod -Name CreateProperty -Value {
        param($name, $type, $value)
        return [PSCustomObject]@{ Name = $name; Value = $value }
    }
    $db | Add-Member -MemberType ScriptMethod -Name CreateQueryDef -Value {
        param($name, $sql)
        $qd = [PSCustomObject]@{ Name = $name; SQL = $sql }
        $queryDefs.Add($qd) | Out-Null
        return $qd
    }
    $db | Add-Member -MemberType ScriptMethod -Name CreateTableDef -Value {
        param($name)
        $td = [PSCustomObject]@{ Name = $name; Connect = ""; Fields = [System.Collections.ArrayList]::new() }
        $td | Add-Member -MemberType ScriptMethod -Name RefreshLink -Value { }
        return $td
    }
    $db | Add-Member -MemberType ScriptMethod -Name Containers -Value {
        param($name)
        $docs = [System.Collections.ArrayList]::new()
        if ($mockData.VbaModules) {
            foreach ($m in $mockData.VbaModules) {
                $docs.Add([PSCustomObject]@{ Name = $m }) | Out-Null
            }
        } else {
            $docs.Add([PSCustomObject]@{ Name = "Module1" }) | Out-Null
        }
        return [PSCustomObject]@{ Documents = $docs }
    }
    $db | Add-Member -MemberType ScriptMethod -Name Properties -Value {
        param($name)
        return [PSCustomObject]@{ Name = $name; Value = "MockValue" }
    }

    # Mock Execute method
    $db | Add-Member -MemberType ScriptMethod -Name Execute -Value {
        param($sql, $options)
        $this.RecordsAffected = 1
    }

    # Mock OpenRecordset method
    $db | Add-Member -MemberType ScriptMethod -Name OpenRecordset -Value {
        param($sql)
        $rows = $null
        if ($mockData.Queries) {
            foreach ($k in $mockData.Queries.PSObject.Properties) {
                if ($sql -match $k.Name) {
                    $rows = $k.Value
                    break
                }
            }
        }
        if ($null -eq $rows) {
            $rows = @( [PSCustomObject]@{ RowCount = 0 } )
        }
        return Get-MockRecordset -Rows $rows
    }

    return $db
}
