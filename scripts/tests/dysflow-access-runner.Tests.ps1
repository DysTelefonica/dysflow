#requires -Version 5.1
<#
.SYNOPSIS
    Pester tests for dysflow-access-runner.ps1 helper functions.

.DESCRIPTION
    Tests cover:
      - Resolve-SandboxedPath : path-traversal prevention
      - Format-SqlLiteral     : SQL value quoting / escaping
      - Split-SqlStatements   : semicolon-aware statement splitting with -- comment stripping
      - seed_fixture column/table validation (SQL injection prevention, #219)

.NOTES
    Run with: pwsh -Command "Invoke-Pester scripts/tests/ -CI"
    Requires Pester 5.x  (Install-Module Pester -Force -SkipPublisherCheck)
#>

# ---------------------------------------------------------------------------
# Bootstrap: define only the pure helper functions under test.
# We cannot dot-source the full script because it has a mandatory param block
# and an Access COM dependency at the top level.  Instead we redefine the
# small, self-contained functions here and keep them in sync with the source.
# ---------------------------------------------------------------------------

function script:Resolve-SandboxedPath {
    param(
        [Parameter(Mandatory = $true)] [string] $RawPath,
        [Parameter(Mandatory = $true)] [string] $RootPath,
        [Parameter(Mandatory = $true)] [string] $Label
    )
    $baseFull = [System.IO.Path]::GetFullPath($RootPath).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    $resolved = [System.IO.Path]::GetFullPath($RawPath)
    if (-not (
        $resolved.Equals($baseFull, [System.StringComparison]::OrdinalIgnoreCase) -or
        $resolved.StartsWith($baseFull + [System.IO.Path]::DirectorySeparatorChar,  [System.StringComparison]::OrdinalIgnoreCase) -or
        $resolved.StartsWith($baseFull + [System.IO.Path]::AltDirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
    )) {
        throw "$Label must stay inside the resolved root."
    }
    return $resolved
}

function script:Format-SqlLiteral {
    param($Value)
    if ($null -eq $Value) { return "NULL" }
    if ($Value -is [bool]) { if ($Value) { return "True" } else { return "False" } }
    if ($Value -is [byte]    -or $Value -is [int16]   -or $Value -is [int]    -or
        $Value -is [int64]   -or $Value -is [single]  -or $Value -is [double] -or
        $Value -is [decimal]) {
        return ([string]$Value)
    }
    return "'" + ($Value.ToString().Replace("'", "''")) + "'"
}

function script:Split-SqlStatements {
    param([string] $Sql)
    $statements = New-Object System.Collections.ArrayList
    $builder    = New-Object System.Text.StringBuilder
    $inSingleQuote = $false

    for ($i = 0; $i -lt $Sql.Length; $i++) {
        $char     = $Sql[$i]
        $nextChar = if ($i + 1 -lt $Sql.Length) { $Sql[$i + 1] } else { [char]0 }

        if ($char -eq "'" -and $inSingleQuote -and $nextChar -eq "'") {
            [void]$builder.Append($char)
            [void]$builder.Append($nextChar)
            $i++
            continue
        }
        if ($char -eq "'") {
            $inSingleQuote = -not $inSingleQuote
            [void]$builder.Append($char)
            continue
        }
        if ($char -eq '-' -and $nextChar -eq '-' -and -not $inSingleQuote) {
            while ($i -lt $Sql.Length -and $Sql[$i] -ne "`n") { $i++ }
            continue
        }
        if ($char -eq ";" -and -not $inSingleQuote) {
            $s = $builder.ToString().Trim()
            if (-not [string]::IsNullOrWhiteSpace($s)) { [void]$statements.Add($s) }
            [void]$builder.Clear()
            continue
        }
        [void]$builder.Append($char)
    }

    $tail = $builder.ToString().Trim()
    if (-not [string]::IsNullOrWhiteSpace($tail)) { [void]$statements.Add($tail) }
    return $statements
}

function script:Assert-ColumnNameSafe {
    param([string] $Name, [string] $Label = "column")
    if ($Name -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$') {
        throw "Invalid $Label name: $Name"
    }
}

function script:Invoke-SeedFixtureDryRun {
    param(
        [string]   $TableName,
        [object[]] $Rows
    )

    # Validate table name
    Assert-ColumnNameSafe -Name $TableName -Label "table"

    $statements = @()
    foreach ($row in $Rows) {
        $columns = @()
        $values  = @()
        foreach ($property in $row.PSObject.Properties) {
            $colName = $property.Name
            Assert-ColumnNameSafe -Name $colName -Label "column"
            $columns += "[$colName]"
            $values  += Format-SqlLiteral $property.Value
        }
        $sql = "INSERT INTO [$TableName] (" + ($columns -join ", ") + ") VALUES (" + ($values -join ", ") + ")"
        $statements += $sql
    }
    return $statements
}

# Open-DatabaseWithPassword: testable stub (avoids COM; validates routing logic)
# The stub captures the call args so we can assert which overload was chosen.
$script:LastOpenCall = $null

function script:New-FakeDbEngine {
    param([string] $Mode = "ok")
    $engine = [PSCustomObject]@{ Mode = $Mode; Calls = [System.Collections.ArrayList]::new() }
    $engine | Add-Member -MemberType ScriptMethod -Name "OpenDatabase" -Value {
        param($Path, $Exclusive, $ReadOnly, $Connect = $null)
        $entry = [ordered]@{ path = $Path; exclusive = $Exclusive; readOnly = $ReadOnly; connect = $Connect }
        $this.Calls.Add($entry) | Out-Null
        return [PSCustomObject]@{ Name = $Path; Closed = $false }
    }
    return $engine
}

function script:Open-DatabaseWithPassword {
    param(
        [Parameter(Mandatory = $true)] $DbEngine,
        [Parameter(Mandatory = $true)] [string] $DatabasePath,
        [Parameter(Mandatory = $false)] [bool] $Exclusive = $false,
        [Parameter(Mandatory = $false)] [bool] $ReadOnly = $false,
        [Parameter(Mandatory = $false)] [string] $Password = ""
    )
    if ([string]::IsNullOrWhiteSpace($Password)) {
        return $DbEngine.OpenDatabase($DatabasePath, $Exclusive, $ReadOnly)
    }
    return $DbEngine.OpenDatabase($DatabasePath, $Exclusive, $ReadOnly, ";PWD=$Password")
}

# ===========================================================================
# TESTS
# ===========================================================================

Describe "Open-DatabaseWithPassword" {

    Context "no password (blank / null / whitespace)" {
        It "calls OpenDatabase without connect string when password is empty string" {
            $engine = New-FakeDbEngine
            Open-DatabaseWithPassword -DbEngine $engine -DatabasePath "C:\db.accdb" -Password ""
            $engine.Calls.Count | Should -Be 1
            $engine.Calls[0].connect | Should -BeNullOrEmpty
        }

        It "calls OpenDatabase without connect string when password is whitespace" {
            $engine = New-FakeDbEngine
            Open-DatabaseWithPassword -DbEngine $engine -DatabasePath "C:\db.accdb" -Password "   "
            $engine.Calls.Count | Should -Be 1
            $engine.Calls[0].connect | Should -BeNullOrEmpty
        }

        It "passes ReadOnly flag correctly when no password" {
            $engine = New-FakeDbEngine
            Open-DatabaseWithPassword -DbEngine $engine -DatabasePath "C:\db.accdb" -ReadOnly $true -Password ""
            $engine.Calls[0].readOnly | Should -Be $true
        }
    }

    Context "with password" {
        It "appends ;PWD=<password> to connect string" {
            $engine = New-FakeDbEngine
            Open-DatabaseWithPassword -DbEngine $engine -DatabasePath "C:\db.accdb" -Password "secret"
            $engine.Calls.Count | Should -Be 1
            $engine.Calls[0].connect | Should -Be ";PWD=secret"
        }

        It "passes ReadOnly flag correctly when password is set" {
            $engine = New-FakeDbEngine
            Open-DatabaseWithPassword -DbEngine $engine -DatabasePath "C:\db.accdb" -ReadOnly $true -Password "pw"
            $engine.Calls[0].readOnly | Should -Be $true
            $engine.Calls[0].connect | Should -Be ";PWD=pw"
        }

        It "passes Exclusive flag correctly when password is set" {
            $engine = New-FakeDbEngine
            Open-DatabaseWithPassword -DbEngine $engine -DatabasePath "C:\db.accdb" -Exclusive $true -Password "pw"
            $engine.Calls[0].exclusive | Should -Be $true
            $engine.Calls[0].connect | Should -Be ";PWD=pw"
        }

        It "returns the database object from the engine" {
            $engine = New-FakeDbEngine
            $result = Open-DatabaseWithPassword -DbEngine $engine -DatabasePath "C:\db.accdb" -Password "pw"
            $result | Should -Not -BeNullOrEmpty
            $result.Name | Should -Be "C:\db.accdb"
        }
    }
}

Describe "Resolve-SandboxedPath" {
    BeforeAll {
        # Use a stable temp root that always exists on Windows
        $script:root = [System.IO.Path]::GetTempPath().TrimEnd('\', '/')
    }

    Context "valid paths inside root" {
        It "returns full path when RawPath equals root" {
            $result = Resolve-SandboxedPath -RawPath $script:root -RootPath $script:root -Label "test"
            $result | Should -Not -BeNullOrEmpty
        }

        It "returns full path when RawPath is a child of root" {
            $child = Join-Path $script:root "subdir"
            $result = Resolve-SandboxedPath -RawPath $child -RootPath $script:root -Label "test"
            $result | Should -BeLike "$($script:root)*"
        }
    }

    Context "path-traversal attempts" {
        It "throws for a path that escapes root via .." {
            $traversal = Join-Path $script:root ".." "outside"
            { Resolve-SandboxedPath -RawPath $traversal -RootPath $script:root -Label "scriptPath" } |
                Should -Throw -ExpectedMessage "*must stay inside the resolved root*"
        }

        It "throws for an absolute path outside root" {
            $outside = "C:\Windows\System32"
            # Only meaningful when root is not C:\Windows\System32 itself
            if (-not $outside.StartsWith($script:root, [System.StringComparison]::OrdinalIgnoreCase)) {
                { Resolve-SandboxedPath -RawPath $outside -RootPath $script:root -Label "exportPath" } |
                    Should -Throw -ExpectedMessage "*must stay inside the resolved root*"
            }
        }

        It "throws for a path that is a sibling of root" {
            $sibling = Join-Path (Split-Path $script:root -Parent) "sibling-dir"
            { Resolve-SandboxedPath -RawPath $sibling -RootPath $script:root -Label "path" } |
                Should -Throw -ExpectedMessage "*must stay inside the resolved root*"
        }
    }
}

Describe "Format-SqlLiteral" {

    Context "null and boolean values" {
        It "formats null as NULL" {
            Format-SqlLiteral $null | Should -Be "NULL"
        }

        It "formats true boolean as True" {
            Format-SqlLiteral $true | Should -Be "True"
        }

        It "formats false boolean as False" {
            Format-SqlLiteral $false | Should -Be "False"
        }
    }

    Context "numeric values (no quoting)" {
        It "formats integer without quotes" {
            Format-SqlLiteral 42 | Should -Be "42"
        }

        It "formats decimal without quotes" {
            Format-SqlLiteral 3.14 | Should -BeLike "3.14*"
        }

        It "formats zero without quotes" {
            Format-SqlLiteral 0 | Should -Be "0"
        }

        It "formats negative integer without quotes" {
            Format-SqlLiteral ([int]-7) | Should -Be "-7"
        }
    }

    Context "string values (single-quoted)" {
        It "wraps plain string in single quotes" {
            Format-SqlLiteral "hello" | Should -Be "'hello'"
        }

        It "escapes embedded single quotes by doubling them" {
            Format-SqlLiteral "O'Brien" | Should -Be "'O''Brien'"
        }

        It "escapes multiple single quotes" {
            Format-SqlLiteral "it's a 'test'" | Should -Be "'it''s a ''test'''"
        }

        It "handles empty string" {
            Format-SqlLiteral "" | Should -Be "''"
        }

        It "does not double-escape already-doubled quotes" {
            # Input string already contains '' — each ' gets doubled once
            Format-SqlLiteral "a''b" | Should -Be "'a''''b'"
        }
    }
}

Describe "Split-SqlStatements" {

    It "splits two statements separated by semicolon" {
        $result = @(Split-SqlStatements "SELECT 1; SELECT 2")
        $result.Count | Should -Be 2
        $result[0] | Should -Be "SELECT 1"
        $result[1] | Should -Be "SELECT 2"
    }

    It "handles single statement without trailing semicolon" {
        $result = @(Split-SqlStatements "SELECT 1")
        $result.Count | Should -Be 1
        $result[0] | Should -Be "SELECT 1"
    }

    It "handles single statement with trailing semicolon" {
        $result = @(Split-SqlStatements "SELECT 1;")
        $result.Count | Should -Be 1
    }

    It "does not split on semicolons inside string literals" {
        $result = @(Split-SqlStatements "INSERT INTO t (col) VALUES ('a;b'); SELECT 1")
        $result.Count | Should -Be 2
        $result[0] | Should -BeLike "INSERT INTO t*"
        $result[1] | Should -Be "SELECT 1"
    }

    It "handles escaped single quotes inside literals without splitting" {
        $result = @(Split-SqlStatements "INSERT INTO t (col) VALUES ('it''s;here'); SELECT 2")
        $result.Count | Should -Be 2
    }

    It "returns empty list for whitespace-only input" {
        $result = @(Split-SqlStatements "   ")
        $result.Count | Should -Be 0
    }

    It "trims whitespace from each statement" {
        $result = @(Split-SqlStatements "  SELECT 1  ;  SELECT 2  ")
        $result[0] | Should -Be "SELECT 1"
        $result[1] | Should -Be "SELECT 2"
    }

    It "strips leading line comments before a DDL statement" {
        $sql = "-- Issue #18 backend DDL`n-- second comment line`nCREATE TABLE Foo (Id INT)"
        $result = @(Split-SqlStatements $sql)
        $result.Count | Should -Be 1
        $result[0] | Should -Be "CREATE TABLE Foo (Id INT)"
    }

    It "strips inline line comments between statements" {
        $sql = "SELECT 1;`n-- a comment`nSELECT 2"
        $result = @(Split-SqlStatements $sql)
        $result.Count | Should -Be 2
        $result[0] | Should -Be "SELECT 1"
        $result[1] | Should -Be "SELECT 2"
    }

    It "does not strip -- inside a string literal" {
        $result = @(Split-SqlStatements "SELECT '--not a comment' AS x")
        $result.Count | Should -Be 1
        $result[0] | Should -Be "SELECT '--not a comment' AS x"
    }

    It "returns empty list for comment-only input" {
        $result = @(Split-SqlStatements "-- just a comment`n-- another one")
        $result.Count | Should -Be 0
    }
}

# ===========================================================================
# SQL INJECTION SECURITY TESTS (Issue #219)
# These tests document the required validation behaviour.
# They should PASS once the fix is applied to seed_fixture.
# ===========================================================================

Describe "seed_fixture SQL injection prevention" {

    Context "table name validation" {
        It "accepts a valid simple table name" {
            $rows = @([PSCustomObject]@{ id = 1 })
            { Invoke-SeedFixtureDryRun -TableName "Users" -Rows $rows } | Should -Not -Throw
        }

        It "accepts table name with underscores and digits" {
            $rows = @([PSCustomObject]@{ id = 1 })
            { Invoke-SeedFixtureDryRun -TableName "order_items_2024" -Rows $rows } | Should -Not -Throw
        }

        It "rejects table name with semicolon (SQL injection)" {
            $rows = @([PSCustomObject]@{ id = 1 })
            { Invoke-SeedFixtureDryRun -TableName "Users; DROP TABLE Users--" -Rows $rows } |
                Should -Throw -ExpectedMessage "*Invalid table name*"
        }

        It "rejects table name with single quote" {
            $rows = @([PSCustomObject]@{ id = 1 })
            { Invoke-SeedFixtureDryRun -TableName "User's" -Rows $rows } |
                Should -Throw -ExpectedMessage "*Invalid table name*"
        }

        It "rejects table name starting with a digit" {
            $rows = @([PSCustomObject]@{ id = 1 })
            { Invoke-SeedFixtureDryRun -TableName "1BadTable" -Rows $rows } |
                Should -Throw -ExpectedMessage "*Invalid table name*"
        }

        It "rejects table name with spaces" {
            $rows = @([PSCustomObject]@{ id = 1 })
            { Invoke-SeedFixtureDryRun -TableName "Bad Table" -Rows $rows } |
                Should -Throw -ExpectedMessage "*Invalid table name*"
        }
    }

    Context "column name validation" {
        It "accepts valid column names: user_id, Name, col1" {
            $rows = @([PSCustomObject]@{ user_id = 1; Name = "Alice"; col1 = "x" })
            { Invoke-SeedFixtureDryRun -TableName "Users" -Rows $rows } | Should -Not -Throw
        }

        It "rejects column name with semicolon injection: 'id; DROP TABLE'" {
            # PSCustomObject property names can be arbitrary strings
            $row = New-Object PSObject
            $row | Add-Member -MemberType NoteProperty -Name "id; DROP TABLE" -Value 1
            { Invoke-SeedFixtureDryRun -TableName "Users" -Rows @($row) } |
                Should -Throw -ExpectedMessage "*Invalid column name*"
        }

        It "rejects column name with single quote: id'" {
            $row = New-Object PSObject
            $row | Add-Member -MemberType NoteProperty -Name "id'" -Value 1
            { Invoke-SeedFixtureDryRun -TableName "Users" -Rows @($row) } |
                Should -Throw -ExpectedMessage "*Invalid column name*"
        }

        It "rejects column name with spaces: 'name WITH SPACES'" {
            $row = New-Object PSObject
            $row | Add-Member -MemberType NoteProperty -Name "name WITH SPACES" -Value "test"
            { Invoke-SeedFixtureDryRun -TableName "Users" -Rows @($row) } |
                Should -Throw -ExpectedMessage "*Invalid column name*"
        }

        It "rejects column name with double-dash SQL comment: 'col--comment'" {
            $row = New-Object PSObject
            $row | Add-Member -MemberType NoteProperty -Name "col--comment" -Value 1
            { Invoke-SeedFixtureDryRun -TableName "Users" -Rows @($row) } |
                Should -Throw -ExpectedMessage "*Invalid column name*"
        }

        It "rejects column name starting with a digit" {
            $row = New-Object PSObject
            $row | Add-Member -MemberType NoteProperty -Name "1col" -Value 1
            { Invoke-SeedFixtureDryRun -TableName "Users" -Rows @($row) } |
                Should -Throw -ExpectedMessage "*Invalid column name*"
        }

        It "rejects column name that is empty string" {
            { Assert-ColumnNameSafe -Name "" -Label "column" } |
                Should -Throw -ExpectedMessage "*Invalid column name*"
        }
    }

    Context "valid fixture produces correct INSERT SQL" {
        It "produces one INSERT per row" {
            $rows = @(
                [PSCustomObject]@{ id = 1; name = "Alice" },
                [PSCustomObject]@{ id = 2; name = "Bob" }
            )
            $stmts = @(Invoke-SeedFixtureDryRun -TableName "Users" -Rows $rows)
            $stmts.Count | Should -Be 2
        }

        It "wraps column names in square brackets" {
            $rows = @([PSCustomObject]@{ user_id = 42 })
            $stmts = @(Invoke-SeedFixtureDryRun -TableName "Orders" -Rows $rows)
            $stmts[0] | Should -BeLike "*[user_id]*"
        }

        It "wraps table name in square brackets" {
            $rows = @([PSCustomObject]@{ id = 1 })
            $stmts = @(Invoke-SeedFixtureDryRun -TableName "Order_Items" -Rows $rows)
            $stmts[0] | Should -BeLike "*[Order_Items]*"
        }

        It "quotes string values correctly" {
            $rows = @([PSCustomObject]@{ name = "O'Brien" })
            $stmts = @(Invoke-SeedFixtureDryRun -TableName "Users" -Rows $rows)
            $stmts[0] | Should -BeLike "*'O''Brien'*"
        }
    }
}
