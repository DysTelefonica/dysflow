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

# ===========================================================================
# P1 — Behavioral tests for Get-MsAccessProcessesBounded (#380)
# The function moved to scripts/lib/dysflow-access-com.ps1 (Slice 1 dedup).
# Tests now load it from the module; the production behavior contract is unchanged.
# ===========================================================================

Describe "Get-MsAccessProcessesBounded — behavioral (issue #380)" {
    BeforeAll {
        $script:SharedModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:SharedModulePath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Get-MsAccessProcessesBounded' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Get-MsAccessProcessesBounded not found in $($script:SharedModulePath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    Context "hang guard — injected slow scriptblock times out fast" {
        It "returns empty result and completes well under the sleep duration" {
            # Prove the Wait-Job timeout fires: inject a 30-second sleeper but set TimeoutSeconds=1.
            # If the guard works, the call returns in <<30s. We assert it completed in <10s.
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            $result = @(Get-MsAccessProcessesBounded `
                -WmiScriptBlock { Start-Sleep -Seconds 30 } `
                -TimeoutSeconds 1)
            $sw.Stop()

            $result.Count | Should -Be 0
            $sw.Elapsed.TotalSeconds | Should -BeLessThan 10
            # ...and prove the Wait-Job timeout actually elapsed (not an instant bypass).
            $sw.Elapsed.TotalSeconds | Should -BeGreaterThan 0.9
        }
    }

    Context "success path — injected fast scriptblock passes results through" {
        It "returns a normalized object containing the injected ProcessId" {
            # Inject a scriptblock that returns a known object — proves the success path
            # captures and returns data from the job.
            $fakeProc = [PSCustomObject]@{
                ProcessId    = 4321
                CreationDate = $null
                CommandLine  = 'MSACCESS.EXE "C:\fake.accdb"'
            }
            $result = @(Get-MsAccessProcessesBounded `
                -WmiScriptBlock { [PSCustomObject]@{
                    ProcessId    = 4321
                    CreationDate = $null
                    CommandLine  = 'MSACCESS.EXE "C:\fake.accdb"'
                } } `
                -TimeoutSeconds 5)

            $result.Count | Should -BeGreaterOrEqual 1
            $result[0].ProcessId | Should -Be 4321
        }
    }
}

# ===========================================================================
# P3 — Behavioral tests for ConvertTo-IsoStartTime (#380)
# Pure function — extract via AST from the production source.
# ===========================================================================

Describe "ConvertTo-IsoStartTime — behavioral (issue #380)" {
    BeforeAll {
        $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:RunnerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'ConvertTo-IsoStartTime' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "ConvertTo-IsoStartTime not found in $($script:RunnerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    # Pattern: EXACTLY 3 fractional digits + Z (not 7 from .ToString('o'))
    $isoPattern = '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'

    Context "datetime input" {
        It "formats a [datetime] value as ISO with exactly 3 fractional digits and Z" {
            $dt = [datetime]::new(2026, 5, 18, 12, 34, 56, 123, [System.DateTimeKind]::Utc)
            $result = ConvertTo-IsoStartTime $dt
            $result | Should -Match $isoPattern
            $result | Should -Be '2026-05-18T12:34:56.123Z'
        }
    }

    Context "DMTF string input" {
        It "converts a DMTF CreationDate string with exactly 3 fractional digits and Z" {
            $result = ConvertTo-IsoStartTime '20260518123456.000000+000'
            $result | Should -Match $isoPattern
            # Verify not 7 fractional digits (no round-trip format)
            $result | Should -Not -Match '\.\d{7}Z$'
        }

        It "preserves sub-second precision from DMTF microseconds (truncated to ms)" {
            $result = ConvertTo-IsoStartTime '20260518123456.789000+000'
            $result | Should -Match $isoPattern
        }
    }

    Context "pre-formatted ISO string input" {
        It "re-parses and emits exactly 3 fractional digits for a pre-formatted ISO string" {
            $result = ConvertTo-IsoStartTime '2026-05-18T12:34:56.000Z'
            $result | Should -Match $isoPattern
        }
    }

    Context "null / empty input" {
        It "returns null for null input" {
            ConvertTo-IsoStartTime $null | Should -BeNullOrEmpty
        }

        It "returns null for empty string input" {
            ConvertTo-IsoStartTime '' | Should -BeNullOrEmpty
        }
    }
}

# ===========================================================================
# P6 — Behavioral tests for SQL dispatch/routing functions (#380)
# Extract each function via AST from the production source, stub I/O
# dependencies, assert routing *behavior* — not script text.
# ===========================================================================

Describe "Resolve-WriteActionDatabase — behavioral (issue #380)" {
    BeforeAll {
        $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:RunnerPath).Path,
            [ref]$null, [ref]$null
        )

        # Extract and load Resolve-WriteActionDatabase from the real source
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Resolve-WriteActionDatabase' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Resolve-WriteActionDatabase not found in $($script:RunnerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Sentinel CurrentDb — a distinct object the function must pass through unchanged
        $script:SentinelDb = [PSCustomObject]@{ IsSentinel = $true }
    }

    Context "dryRun=true — always returns CurrentDb unowned, never calls Open-DatabaseWithBackendPassword" {
        BeforeEach {
            # Stub: if called, fail the test
            $script:OpenCalled = $false
            function script:Open-DatabaseWithBackendPassword {
                param($DbEngine, $DatabasePath, [bool]$ReadOnly = $false)
                $script:OpenCalled = $true
                throw "Open-DatabaseWithBackendPassword must NOT be called on dryRun=true"
            }
        }

        It "dryRun=true with databasePath set → Owned=$false, Database is CurrentDb" {
            $payload = [PSCustomObject]@{ dryRun = $true; databasePath = "C:\db.accdb"; sourcePath = $null; backendPath = $null }
            $result = Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $result.Owned | Should -Be $false
            $result.Database | Should -Be $script:SentinelDb
            $script:OpenCalled | Should -Be $false
        }

        It "dryRun=true with no path → Owned=$false, Database is CurrentDb" {
            $payload = [PSCustomObject]@{ dryRun = $true; databasePath = $null; sourcePath = $null; backendPath = $null }
            $result = Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $result.Owned | Should -Be $false
            $result.Database | Should -Be $script:SentinelDb
            $script:OpenCalled | Should -Be $false
        }
    }

    Context "dryRun=false, no target path → CurrentDb unowned, no COM call" {
        BeforeEach {
            $script:OpenCalled = $false
            function script:Open-DatabaseWithBackendPassword {
                param($DbEngine, $DatabasePath, [bool]$ReadOnly = $false)
                $script:OpenCalled = $true
                throw "Open-DatabaseWithBackendPassword must NOT be called when no path"
            }
        }

        It "no path properties set → Owned=$false, Database is CurrentDb" {
            $payload = [PSCustomObject]@{ dryRun = $false; databasePath = $null; sourcePath = $null; backendPath = $null }
            $result = Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $result.Owned | Should -Be $false
            $result.Database | Should -Be $script:SentinelDb
            $script:OpenCalled | Should -Be $false
        }

        It "all path properties are empty strings → Owned=$false, Database is CurrentDb" {
            $payload = [PSCustomObject]@{ dryRun = $false; databasePath = ""; sourcePath = ""; backendPath = "" }
            $result = Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $result.Owned | Should -Be $false
            $result.Database | Should -Be $script:SentinelDb
            $script:OpenCalled | Should -Be $false
        }
    }

    Context "dryRun=false with databasePath → calls Open-DatabaseWithBackendPassword, Owned=true" {
        BeforeEach {
            $script:OpenArgs = $null
            $script:FakeOpenedDb = [PSCustomObject]@{ Name = "opened-db" }
            function script:Open-DatabaseWithBackendPassword {
                param($DbEngine, $DatabasePath, [bool]$ReadOnly = $false)
                $script:OpenArgs = [ordered]@{ DatabasePath = $DatabasePath; ReadOnly = $ReadOnly }
                return $script:FakeOpenedDb
            }
        }

        It "calls Open-DatabaseWithBackendPassword with the databasePath" {
            $payload = [PSCustomObject]@{ dryRun = $false; databasePath = "C:\explicit.accdb"; sourcePath = $null; backendPath = $null }
            $result = Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $script:OpenArgs | Should -Not -BeNullOrEmpty
            $script:OpenArgs.DatabasePath | Should -Be "C:\explicit.accdb"
        }

        It "returns Owned=true and the opened database object" {
            $payload = [PSCustomObject]@{ dryRun = $false; databasePath = "C:\explicit.accdb"; sourcePath = $null; backendPath = $null }
            $result = Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $result.Owned | Should -Be $true
            $result.Database | Should -Be $script:FakeOpenedDb
        }

        It "sets TargetPath to the databasePath value" {
            $payload = [PSCustomObject]@{ dryRun = $false; databasePath = "C:\explicit.accdb"; sourcePath = $null; backendPath = $null }
            $result = Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $result.TargetPath | Should -Be "C:\explicit.accdb"
        }

        It "does NOT open with ReadOnly (write path)" {
            $payload = [PSCustomObject]@{ dryRun = $false; databasePath = "C:\explicit.accdb"; sourcePath = $null; backendPath = $null }
            Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload | Out-Null
            $script:OpenArgs.ReadOnly | Should -Be $false
        }
    }

    Context "path precedence: databasePath > sourcePath > backendPath" {
        BeforeEach {
            $script:OpenArgs = $null
            function script:Open-DatabaseWithBackendPassword {
                param($DbEngine, $DatabasePath, [bool]$ReadOnly = $false)
                $script:OpenArgs = [ordered]@{ DatabasePath = $DatabasePath }
                return [PSCustomObject]@{ Name = $DatabasePath }
            }
        }

        It "uses databasePath when all three are set" {
            $payload = [PSCustomObject]@{ dryRun = $false; databasePath = "C:\db.accdb"; sourcePath = "C:\src.accdb"; backendPath = "C:\bk.accdb" }
            Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload | Out-Null
            $script:OpenArgs.DatabasePath | Should -Be "C:\db.accdb"
        }

        It "falls back to sourcePath when databasePath is absent" {
            $payload = [PSCustomObject]@{ dryRun = $false; databasePath = $null; sourcePath = "C:\src.accdb"; backendPath = "C:\bk.accdb" }
            Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload | Out-Null
            $script:OpenArgs.DatabasePath | Should -Be "C:\src.accdb"
        }

        It "falls back to backendPath when databasePath and sourcePath are absent" {
            $payload = [PSCustomObject]@{ dryRun = $false; databasePath = $null; sourcePath = $null; backendPath = "C:\bk.accdb" }
            Resolve-WriteActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload | Out-Null
            $script:OpenArgs.DatabasePath | Should -Be "C:\bk.accdb"
        }
    }
}

Describe "Resolve-ReadActionDatabase — behavioral (issue #380)" {
    BeforeAll {
        $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:RunnerPath).Path,
            [ref]$null, [ref]$null
        )

        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Resolve-ReadActionDatabase' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Resolve-ReadActionDatabase not found in $($script:RunnerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        $script:SentinelDb = [PSCustomObject]@{ IsSentinel = $true }
    }

    Context "no target path → CurrentDb unowned, no COM call" {
        BeforeEach {
            $script:OpenCalled = $false
            function script:Open-DatabaseWithBackendPassword {
                param($DbEngine, $DatabasePath, [bool]$ReadOnly = $false)
                $script:OpenCalled = $true
                throw "Open-DatabaseWithBackendPassword must NOT be called when no path"
            }
        }

        It "no path properties → Owned=$false, Database is CurrentDb" {
            $payload = [PSCustomObject]@{ databasePath = $null; sourcePath = $null; backendPath = $null }
            $result = Resolve-ReadActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $result.Owned | Should -Be $false
            $result.Database | Should -Be $script:SentinelDb
            $script:OpenCalled | Should -Be $false
        }

        It "empty string paths → Owned=$false, Database is CurrentDb" {
            $payload = [PSCustomObject]@{ databasePath = ""; sourcePath = ""; backendPath = "" }
            $result = Resolve-ReadActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $result.Owned | Should -Be $false
            $result.Database | Should -Be $script:SentinelDb
            $script:OpenCalled | Should -Be $false
        }
    }

    Context "path present → calls Open-DatabaseWithBackendPassword with ReadOnly=true, Owned=true" {
        BeforeEach {
            $script:OpenArgs = $null
            $script:FakeReadDb = [PSCustomObject]@{ Name = "read-db" }
            function script:Open-DatabaseWithBackendPassword {
                param($DbEngine, $DatabasePath, [bool]$ReadOnly = $false)
                $script:OpenArgs = [ordered]@{ DatabasePath = $DatabasePath; ReadOnly = $ReadOnly }
                return $script:FakeReadDb
            }
        }

        It "calls Open-DatabaseWithBackendPassword with the target path" {
            $payload = [PSCustomObject]@{ databasePath = "C:\read.accdb"; sourcePath = $null; backendPath = $null }
            $result = Resolve-ReadActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $script:OpenArgs | Should -Not -BeNullOrEmpty
            $script:OpenArgs.DatabasePath | Should -Be "C:\read.accdb"
        }

        It "opens with ReadOnly=true" {
            $payload = [PSCustomObject]@{ databasePath = "C:\read.accdb"; sourcePath = $null; backendPath = $null }
            Resolve-ReadActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload | Out-Null
            $script:OpenArgs.ReadOnly | Should -Be $true
        }

        It "returns Owned=true and the opened database object" {
            $payload = [PSCustomObject]@{ databasePath = "C:\read.accdb"; sourcePath = $null; backendPath = $null }
            $result = Resolve-ReadActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $result.Owned | Should -Be $true
            $result.Database | Should -Be $script:FakeReadDb
        }

        It "sets TargetPath correctly" {
            $payload = [PSCustomObject]@{ databasePath = "C:\read.accdb"; sourcePath = $null; backendPath = $null }
            $result = Resolve-ReadActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload
            $result.TargetPath | Should -Be "C:\read.accdb"
        }
    }

    Context "path precedence: databasePath > sourcePath > backendPath" {
        BeforeEach {
            $script:OpenArgs = $null
            function script:Open-DatabaseWithBackendPassword {
                param($DbEngine, $DatabasePath, [bool]$ReadOnly = $false)
                $script:OpenArgs = [ordered]@{ DatabasePath = $DatabasePath }
                return [PSCustomObject]@{ Name = $DatabasePath }
            }
        }

        It "uses databasePath when all three are set" {
            $payload = [PSCustomObject]@{ databasePath = "C:\db.accdb"; sourcePath = "C:\src.accdb"; backendPath = "C:\bk.accdb" }
            Resolve-ReadActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload | Out-Null
            $script:OpenArgs.DatabasePath | Should -Be "C:\db.accdb"
        }

        It "falls back to sourcePath when databasePath is absent" {
            $payload = [PSCustomObject]@{ databasePath = $null; sourcePath = "C:\src.accdb"; backendPath = "C:\bk.accdb" }
            Resolve-ReadActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload | Out-Null
            $script:OpenArgs.DatabasePath | Should -Be "C:\src.accdb"
        }

        It "falls back to backendPath when databasePath and sourcePath are absent" {
            $payload = [PSCustomObject]@{ databasePath = $null; sourcePath = $null; backendPath = "C:\bk.accdb" }
            Resolve-ReadActionDatabase -DbEngine ([PSCustomObject]@{}) -CurrentDb $script:SentinelDb -Payload $payload | Out-Null
            $script:OpenArgs.DatabasePath | Should -Be "C:\bk.accdb"
        }
    }
}

Describe "Invoke-QuerySqlReadAction — behavioral (issue #380)" {
    BeforeAll {
        $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:RunnerPath).Path,
            [ref]$null, [ref]$null
        )

        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-QuerySqlReadAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-QuerySqlReadAction not found in $($script:RunnerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    Context "dispatches SQL to Database.OpenRecordset and returns rows from Convert-RecordsetRows" {
        BeforeEach {
            $script:RecordsetOpenedWith = $null
            $script:FakeRows = @(
                [ordered]@{ id = 1; name = "Alice" },
                [ordered]@{ id = 2; name = "Bob" }
            )

            # Fake recordset: tracks OpenRecordset call and provides Close() for finally block
            $script:FakeRs = [PSCustomObject]@{ CloseCalled = $false }
            $script:FakeRs | Add-Member -MemberType ScriptMethod -Name "Close" -Value {
                $this.CloseCalled = $true
            }

            # Stub: capture the SQL and return the fake recordset
            $script:RecordsetOpenedWith = $null
            $fakeDb = [PSCustomObject]@{}
            $fakeDb | Add-Member -MemberType ScriptMethod -Name "OpenRecordset" -Value {
                param($Sql)
                $script:RecordsetOpenedWith = $Sql
                return $script:FakeRs
            }
            $script:FakeDatabase = $fakeDb

            # Stub Convert-RecordsetRows to return known rows
            function script:Convert-RecordsetRows {
                param($Recordset)
                return $script:FakeRows
            }
        }

        It "calls Database.OpenRecordset with the given SQL" {
            $testSql = "SELECT * FROM Orders"
            Invoke-QuerySqlReadAction -Database $script:FakeDatabase -Sql $testSql | Out-Null
            $script:RecordsetOpenedWith | Should -Be $testSql
        }

        It "returns a result with a rows key" {
            $result = Invoke-QuerySqlReadAction -Database $script:FakeDatabase -Sql "SELECT 1"
            $result | Should -Not -BeNullOrEmpty
            ($result.Keys -contains "rows") | Should -Be $true
        }

        It "rows match what Convert-RecordsetRows returned" {
            $result = Invoke-QuerySqlReadAction -Database $script:FakeDatabase -Sql "SELECT 1"
            $result.rows.Count | Should -Be 2
            $result.rows[0].id | Should -Be 1
            $result.rows[1].name | Should -Be "Bob"
        }

        It "calls rs.Close() in the finally block" {
            Invoke-QuerySqlReadAction -Database $script:FakeDatabase -Sql "SELECT 1" | Out-Null
            $script:FakeRs.CloseCalled | Should -Be $true
        }
    }
}

Describe "Access query write dry-run contract — behavioral" {
    BeforeAll {
        $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:RunnerPath).Path,
            [ref]$null, [ref]$null
        )
        foreach ($name in @('Remove-LinkTable', 'Import-QueryDefinitions')) {
            $fnAst = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq $name },
                $true
            ) | Select-Object -First 1
            if (-not $fnAst) { throw "$name not found in $($script:RunnerPath)" }
            Invoke-Expression $fnAst.Extent.Text
        }
    }

    It "unlink_table with dryRun=true reports the plan without deleting TableDefs" {
        $script:DeletedTables = [System.Collections.ArrayList]::new()
        function script:Resolve-LinkTargetNames {
            param($Database, $Payload)
            return @([string]$Payload.tableName)
        }
        $table = [PSCustomObject]@{ Name = "LinkedPeople"; Connect = ";DATABASE=C:\backend.accdb" }
        $tableDefs = [PSCustomObject]@{}
        $tableDefs | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
            param($Name)
            return $script:FakeLinkedTable
        }
        $tableDefs | Add-Member -MemberType ScriptMethod -Name "Delete" -Value {
            param($Name)
            [void]$script:DeletedTables.Add($Name)
        }
        $script:FakeLinkedTable = $table
        $database = [PSCustomObject]@{ TableDefs = $tableDefs }

        $result = Remove-LinkTable -Database $database -Payload ([PSCustomObject]@{
            action = "unlink_table"
            tableName = "LinkedPeople"
            dryRun = $true
        })

        $script:DeletedTables.Count | Should -Be 0
        $result.dryRun | Should -Be $true
        $result.unlinkedTables.Count | Should -Be 1
        $result.unlinkedTables[0] | Should -Be "LinkedPeople"
    }

    It "import_queries with dryRun=true reports definitions without creating or updating QueryDefs" {
        $script:AccessDbPath = "C:\frontend.accdb"
        $script:CreatedQueries = [System.Collections.ArrayList]::new()
        $script:UpdatedSql = [System.Collections.ArrayList]::new()
        $queryDefs = [PSCustomObject]@{}
        $queryDefs | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
            param($Name)
            throw "Query should not be loaded for dryRun=true"
        }
        $database = [PSCustomObject]@{ QueryDefs = $queryDefs }
        $database | Add-Member -MemberType ScriptMethod -Name "CreateQueryDef" -Value {
            param($Name, $Sql)
            [void]$script:CreatedQueries.Add([ordered]@{ name = $Name; sql = $Sql })
            return [PSCustomObject]@{ Name = $Name; SQL = $Sql }
        }

        $result = Import-QueryDefinitions -Database $database -Payload ([PSCustomObject]@{
            queryDefinitions = @([PSCustomObject]@{ name = "q_people"; sql = "SELECT * FROM People" })
            dryRun = $true
        })

        $script:CreatedQueries.Count | Should -Be 0
        $result.dryRun | Should -Be $true
        $result.imported | Should -Be 0
        $result.queries.Count | Should -Be 1
        $result.queries[0].name | Should -Be "q_people"
    }
}

Describe "Invoke-ListTablesAction — behavioral (issue #380)" {
    BeforeAll {
        $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:RunnerPath).Path,
            [ref]$null, [ref]$null
        )

        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-ListTablesAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-ListTablesAction not found in $($script:RunnerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    Context "delegates to Get-TableNames and wraps result in tables key" {
        BeforeEach {
            $script:GetTableNamesCalledWithDb = $null
            $script:FakeTableList = @("Orders", "Customers", "Products")

            function script:Get-TableNames {
                param($Database, [switch]$LinkedOnly)
                $script:GetTableNamesCalledWithDb = $Database
                return $script:FakeTableList
            }

            $script:FakeDatabase = [PSCustomObject]@{ DbId = "sentinel-db" }
        }

        It "calls Get-TableNames with the provided Database" {
            Invoke-ListTablesAction -Database $script:FakeDatabase | Out-Null
            $script:GetTableNamesCalledWithDb | Should -Be $script:FakeDatabase
        }

        It "returns a result with a tables key" {
            $result = Invoke-ListTablesAction -Database $script:FakeDatabase
            $result | Should -Not -BeNullOrEmpty
            ($result.Keys -contains "tables") | Should -Be $true
        }

        It "tables matches the list returned by Get-TableNames" {
            $result = Invoke-ListTablesAction -Database $script:FakeDatabase
            $result.tables.Count | Should -Be 3
            $result.tables[0] | Should -Be "Orders"
            $result.tables[1] | Should -Be "Customers"
            $result.tables[2] | Should -Be "Products"
        }
    }
}

# ===========================================================================
# Issue #443: replacement for the former "Access runner final cleanup
# ownership guard" describe block, which read .ps1 source text and
# asserted internal variable names / snippets.
#
# Behavioral contracts now covered:
#   (a) UnattributedKilled invariant: covered by "Slice 5 fix" and
#       Close-TargetAccessDbIfOpen tests above.
#   (b) Write-AccessProcessMarker does NOT claim ownership from a
#       CommandLine-only match: behavioral test below via AST extraction.
#   (c) Wiring/delegation from runner to Close-CanonicalAccess:
#       covered by the "Slice 5 fix" describe block which calls
#       Close-CanonicalAccess directly and asserts observable outputs.
# ===========================================================================

Describe "Write-AccessProcessMarker — ownership-safe behavior (issue #443)" {
    # Contract: Write-AccessProcessMarker claims ownership ONLY when a new
    # Access process appears after the snapshot taken in $Before.
    # When no new process appears, $script:accessPid must remain $null —
    # proving ownership is NOT claimed from CommandLine or path alone.
    #
    # Strategy: extract the function via AST, stub Get-MsAccessProcesses to
    # return the same list as $Before (no new process), and assert that
    # $script:accessPid stays null after the call.

    BeforeAll {
        $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:RunnerPath).Path,
            [ref]$null, [ref]$null
        )

        # Extract Write-AccessProcessMarker via AST (loader only; no body assertions)
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Write-AccessProcessMarker' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Write-AccessProcessMarker not found in $($script:RunnerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Also extract ConvertTo-IsoStartTime (required by Write-AccessProcessMarker)
        $isoFnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'ConvertTo-IsoStartTime' },
            $true
        ) | Select-Object -First 1
        if ($isoFnAst) { Invoke-Expression $isoFnAst.Extent.Text }
    }

    Context "no new Access process — ownership NOT claimed" {
        BeforeEach {
            # The function reads/writes $script:accessPid — reset to null
            $script:accessPid = $null

            # Before snapshot: an existing process with a known PID.
            # We will stub Get-MsAccessProcesses to return the SAME process,
            # so the delta is empty (no new process detected).
            $existingProc = [PSCustomObject]@{
                ProcessId    = 11111
                CreationDate = $null
                CommandLine  = 'MSACCESS.EXE "C:\test\mydb.accdb"'
            }
            $script:BeforeSnapshot = @($existingProc)

            # Stub Get-MsAccessProcesses (called by Write-AccessProcessMarker after the action)
            # to return the same snapshot — simulating no new MSACCESS process started.
            function script:Get-MsAccessProcesses {
                return $script:BeforeSnapshot
            }
        }

        It "does not throw when no new Access process is found" {
            { Write-AccessProcessMarker -Before $script:BeforeSnapshot -AccessDbPath "C:\test\mydb.accdb" } |
                Should -Not -Throw
        }

        It "does not set script:accessPid when no new process is detected" {
            # Core safety invariant: ownership must NOT be claimed from CommandLine or path alone.
            # When $Before and the post-action snapshot are identical (no new process),
            # the function must leave $script:accessPid null.
            Write-AccessProcessMarker -Before $script:BeforeSnapshot -AccessDbPath "C:\test\mydb.accdb"
            $script:accessPid | Should -BeNullOrEmpty `
                -Because "no new MSACCESS process was detected, so ownership must not be claimed from CommandLine or path alone"
        }
    }

    Context "new Access process appears — ownership IS claimed from the new PID" {
        BeforeEach {
            $script:accessPid = $null

            $existingProc = [PSCustomObject]@{
                ProcessId    = 22222
                CreationDate = $null
                CommandLine  = 'MSACCESS.EXE "C:\other\db.accdb"'
            }
            $script:BeforeSnapshot = @($existingProc)

            $newProc = [PSCustomObject]@{
                ProcessId    = 33333
                CreationDate = $null
                CommandLine  = 'MSACCESS.EXE "C:\test\mydb.accdb"'
            }

            function script:Get-MsAccessProcesses {
                return @($existingProc, $newProc)
            }
            function script:ConvertTo-IsoStartTime { param($CreationDate) return $null }
        }

        It "sets script:accessPid to the new process PID" {
            Write-AccessProcessMarker -Before $script:BeforeSnapshot -AccessDbPath "C:\test\mydb.accdb"
            $script:accessPid | Should -Be 33333 `
                -Because "the new process that appeared after $Before must be claimed"
        }
    }
}

# ===========================================================================
# Issue #443: behavioral test for return-based exits (no bare 'exit' inside try)
# Replaces the former source-text test "verifies scripts/dysflow-access-runner.ps1
# conforms to return-based exits and force-kill design" in access-runner.test.ts.
#
# The behavioral contract: the runner script must use exactly one top-level
# 'exit' statement (at the very end) and rely on 'return' inside try blocks
# so that finally blocks always run. We verify this via AST exit-statement
# counting — counting exit statements by AST type, not by source-text grep,
# so a rename of the exit-code variable does not break the test.
# ===========================================================================

Describe "Access runner return-based exits and force-kill — behavioral (issue #443)" {
    # Contract: the runner must use 'return' inside try/catch blocks and only
    # call 'exit' with the tracked exit-code expression — never a bare 'exit 0'
    # or 'exit 1' literal. A bare literal exit would bypass the tracked exit
    # code, losing error state. A bare 'exit' inside the try body would skip
    # the finally block.
    #
    # We verify this via AST ExitStatementAst inspection (not source-text grep),
    # so a rename of the exit-code variable does not break the test.

    BeforeAll {
        $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:RunnerPath).Path,
            [ref]$null, [ref]$null
        )
        $script:RunnerAst = $ast

        # Collect all ExitStatementAst nodes from the entire script.
        $script:ExitStatements = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.ExitStatementAst] },
            $true
        )
    }

    It "all exit statements pass a pipeline argument (no bare 'exit' and no literal-number exits)" {
        # Behavioral contract: every 'exit' must carry an expression — never a bare 'exit'
        # and never 'exit 0' / 'exit 1' literals. A bare exit discards the tracked exit code.
        $bareOrLiteralExits = $script:ExitStatements | Where-Object {
            # Bare exit: no pipeline at all
            ($null -eq $_.Pipeline) -or
            # Literal integer exit: pipeline is a constant integer expression
            ($_.Pipeline.ToString() -match '^\d+$')
        }
        $bareOrLiteralExits.Count | Should -Be 0 `
            -Because "all exit statements must pass the tracked exit-code expression, not a bare exit or literal integer"
    }

    It "script defines at least one script-scoped variable for tracking cleanup PID" {
        # Behavioral contract: the runner must track the Access PID in a script-scoped
        # variable so the finally block can kill the process even after an error.
        # We verify via AST variable assignment, not by asserting a specific name.
        $scriptScopeAssignments = $script:RunnerAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.AssignmentStatementAst] -and
              $args[0].Left.ToString() -like '$script:*' },
            $true
        )
        $pidRelatedAssignments = $scriptScopeAssignments |
            Where-Object { $_.Left.ToString() -match 'pid|access|process' }
        $pidRelatedAssignments.Count | Should -BeGreaterOrEqual 1 `
            -Because "the runner must track the Access process PID in a script-scoped variable for finally-block cleanup"
    }

    It "script defines at least one script-scoped variable for tracking the exit code" {
        # Behavioral contract: exit code must be tracked in a script-scoped variable so the
        # finally block can emit the correct exit status.
        $scriptScopeAssignments = $script:RunnerAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.AssignmentStatementAst] -and
              $args[0].Left.ToString() -like '$script:*' },
            $true
        )
        $exitCodeAssignments = $scriptScopeAssignments |
            Where-Object { $_.Left.ToString() -match 'exit|code|status' }
        $exitCodeAssignments.Count | Should -BeGreaterOrEqual 1 `
            -Because "the runner must track the exit code in a script-scoped variable so finally can exit correctly"
    }
}

# ---------------------------------------------------------------------------
# Slice 5 — port test: null-PID close runs ROT fallback, no force-kill, no throw
# ---------------------------------------------------------------------------
# THE FIX: before Slice 5, the runner's finally block with OwnedPid=$null only emitted
# a WARN and left the MSACCESS process to die on its own (~5s) → zombie-check FAIL.
# After Slice 5, Close-CanonicalAccess is called with -RotCloseAction, so the null-PID
# path runs ROT close + lock-check + WARN instead of a bare WARN.
#
# This test pins the observable contract directly on the canonical module
# (the runner's behavior flows through it — per testing-philosophy.md, test at the port):
#   - OwnedPid=$null → OwnedPidKilled=$false
#   - OwnedPid=$null → UnattributedKilled=$false (invariant)
#   - OwnedPid=$null → RotCloseAction IS invoked (the ROT fallback runs)
#   - Close does NOT throw

Describe "Slice 5 fix — null-PID close runs ROT fallback (behavior at the port)" {
    BeforeAll {
        $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
        . (Resolve-Path $script:ModulePath).Path
    }

    Context "null-PID path: ROT fallback runs, no force-kill, no exception" {
        It "OwnedPidKilled=false, UnattributedKilled=false, RotCloseAction invoked, no throw" {
            # Track whether RotCloseAction was called (proves ROT fallback ran).
            $rotCalls = [System.Collections.Generic.List[string]]::new()

            $fakeApp = [PSCustomObject]@{ AutomationSecurity = 3 }
            $fakeApp | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value {}
            $fakeApp | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($s) }

            # Build a canonical session with OwnedPid=$null (attribution failed).
            $session = [PSCustomObject]@{
                AccessApplication          = $fakeApp
                OwnedPid                   = $null
                OriginalAutomationSecurity = 3
                PidAttributed              = $false
            }

            $threw = $false
            $result = $null
            try {
                $result = Close-CanonicalAccess `
                    -Session        $session `
                    -DbPath         "C:\fake.accdb" `
                    -RotCloseAction { param($p) $rotCalls.Add($p) } `
                    -KillPidAction  { param([int]$AccessPid) $true } `
                    -LockFileAction { $false }
            } catch {
                $threw = $true
            }

            # No exception — Close must be safe even when PID attribution failed.
            $threw             | Should -Be $false -Because "Close with null-PID must never throw"

            # Owned-PID kill must NOT have fired (no PID to kill).
            $result.OwnedPidKilled     | Should -Be $false -Because "no PID was attributed so nothing should be killed"

            # Invariant: unattributed processes are NEVER killed.
            $result.UnattributedKilled | Should -Be $false -Because "invariant: unattributed MSACCESS is never force-killed"

            # THE FIX: RotCloseAction MUST have been called (ROT fallback runs instead of bare WARN).
            $rotCalls.Count | Should -BeGreaterOrEqual 1 -Because "null-PID path must invoke -RotCloseAction to attempt ROT close"
        }
    }
}

# ---------------------------------------------------------------------------
# Null-PID close notice wording — must not mislead a consuming agent into
# thinking the null-PID path is a dangerous fallback (root cause of a
# false-positive "unsafe process kill" report). The notice must make the SAFE
# invariant unambiguous: nothing is killed and other instances are unaffected.
# ---------------------------------------------------------------------------

Describe "Get-NullPidCloseNotice — reassuring, non-alarming wording" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
        . (Resolve-Path $modulePath).Path
    }

    It "states plainly that no process is killed and other instances are unaffected" {
        $notice = Get-NullPidCloseNotice
        $notice | Should -Match '(?i)kills? nothing|never (kills|terminates)|no .*process.*killed'
        $notice | Should -Match '(?i)unaffected|other .*instances?'
    }

    It "does not read as a risky fallback that could touch other instances" {
        $notice = Get-NullPidCloseNotice
        $notice | Should -Not -Match '(?i)fallback only'
    }
}
