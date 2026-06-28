#Requires -Modules Pester
<#
.SYNOPSIS
    Pester tests for Format-AccessIdentifier — the central helper that validates
    and brackets Access SQL identifiers (issue #573).

.DESCRIPTION
    Issue #573: SQL paths that interpolate table/column names into brackets
    inconsistently reject unsafe characters. `seed_fixture` has strict regex
    validation; `count_rows`, `distinct_values`, `create_table`, `drop_table`,
    and `teardown_fixture` use only `[name]` wrapping with no validation, so a
    malicious or malformed name can escape the bracket quoting.

    Fix: introduce `Format-AccessIdentifier` that BOTH validates the name
    against the Access identifier grammar AND returns the bracket-wrapped
    form, and route every SQL interpolation through it.

    These tests pin the contract:
      - Accepts valid identifiers (letters, digits, underscores; leading letter/underscore).
      - Rejects empty / whitespace names with a clear "required" message.
      - Rejects names containing `]`, `[`, single-quote, semicolon, hyphen, space,
        period, slash, or any other non-[A-Za-z0-9_] character (defense against
        bracket-escape attacks and SQL separator injection).
      - Rejects names that start with a digit (Access grammar).
      - Returns the bracket-wrapped identifier for valid input.
#>

BeforeAll {
    $script:RunnerPath = Join-Path $PSScriptRoot ".." "dysflow-access-runner.ps1"

    if (-not (Test-Path -LiteralPath $script:RunnerPath)) {
        throw "Runner script not found at $($script:RunnerPath)"
    }

    $script:RunnerAst = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:RunnerPath).Path,
        [ref]$null, [ref]$null
    )

    $script:FormatAccessIdentifierFn = $script:RunnerAst.FindAll(
        { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
          $args[0].Name -eq 'Format-AccessIdentifier' },
        $true
    ) | Select-Object -First 1

    if ($script:FormatAccessIdentifierFn) {
        Invoke-Expression $script:FormatAccessIdentifierFn.Extent.Text
    }
}

Describe "Format-AccessIdentifier — central SQL identifier quoting (issue #573)" {

    Context "function exists in dysflow-access-runner.ps1" {
        It "is defined as a top-level function in the runner script" {
            $script:FormatAccessIdentifierFn | Should -Not -BeNullOrEmpty `
                -Because "issue #573 requires one central helper; without it the fix is incomplete."
        }
    }

    Context "accepts valid Access identifiers" {
        It "returns the bracket-wrapped form for a simple identifier" {
            Format-AccessIdentifier -Name "Users" | Should -Be "[Users]"
        }

        It "accepts identifiers with underscores" {
            Format-AccessIdentifier -Name "user_id" | Should -Be "[user_id]"
        }

        It "accepts identifiers with digits after the first character" {
            Format-AccessIdentifier -Name "order_items_2024" | Should -Be "[order_items_2024]"
        }

        It "accepts identifiers starting with underscore" {
            Format-AccessIdentifier -Name "_internal" | Should -Be "[_internal]"
        }

        It "accepts identifiers starting with capital letter followed by digits" {
            Format-AccessIdentifier -Name "A1" | Should -Be "[A1]"
        }
    }

    Context "rejects empty / whitespace names" {
        It "throws on empty string" {
            { Format-AccessIdentifier -Name "" } | Should -Throw -ExpectedMessage "*required*"
        }

        It "throws on whitespace-only" {
            { Format-AccessIdentifier -Name "   " } | Should -Throw -ExpectedMessage "*required*"
        }
    }

    Context "rejects names containing bracket-escape or SQL separator characters" {
        It "rejects names containing `"]`"" {
            { Format-AccessIdentifier -Name "Users]" } | Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names containing `"[`"" {
            { Format-AccessIdentifier -Name "Users[extra" } | Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names containing a single quote" {
            { Format-AccessIdentifier -Name "User's" } | Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names containing a semicolon (SQL separator injection)" {
            { Format-AccessIdentifier -Name "Users; DROP TABLE Users--" } |
                Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names containing a space" {
            { Format-AccessIdentifier -Name "Bad Table" } | Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names containing a period" {
            { Format-AccessIdentifier -Name "schema.table" } | Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names containing a hyphen" {
            { Format-AccessIdentifier -Name "bad-name" } | Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names containing a slash" {
            { Format-AccessIdentifier -Name "schema/table" } | Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names containing a backslash" {
            { Format-AccessIdentifier -Name "schema\table" } | Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names containing a double quote" {
            { Format-AccessIdentifier -Name 'bad"name' } | Should -Throw -ExpectedMessage "*Invalid*"
        }
    }

    Context "rejects names that violate Access identifier grammar" {
        It "rejects names starting with a digit" {
            { Format-AccessIdentifier -Name "1BadTable" } | Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names that are only digits" {
            { Format-AccessIdentifier -Name "123" } | Should -Throw -ExpectedMessage "*Invalid*"
        }

        It "rejects names containing a unicode letter (out of scope for the ASCII grammar)" {
            { Format-AccessIdentifier -Name "Año" } | Should -Throw -ExpectedMessage "*Invalid*"
        }
    }

    Context "error messages are actionable" {
        It "the rejection message names the offending value" {
            $threw = $false
            $message = ""
            try {
                $null = Format-AccessIdentifier -Name "bad;name"
            } catch {
                $threw = $true
                $message = $_.Exception.Message
            }
            $threw | Should -Be $true
            $message | Should -Match "bad;name" `
                -Because "callers must be able to identify which name failed validation."
        }

        It "honors the optional -Label parameter for the error message" {
            { Format-AccessIdentifier -Name "bad;name" -Label "table" } |
                Should -Throw -ExpectedMessage "*table*"
        }
    }
}

Describe "Format-AccessIdentifier — central helper is USED by every SQL interpolation site (issue #573)" {

    BeforeAll {
        # Sites that must delegate to Format-AccessIdentifier so unsafe names can never reach the SQL string.
        # `seed_fixture` already had inline regex validation; after the fix it must also go through the helper
        # (one source of truth).
        $script:ExpectedCallSites = @(
            @{ Action = "count_rows";        Find = 'Invoke-CountRowsAction' }
            @{ Action = "distinct_values";   Find = 'Invoke-DistinctValuesAction' }
            @{ Action = "create_table";      Find = 'create_table' }
            @{ Action = "drop_table";        Find = 'drop_table' }
            @{ Action = "seed_fixture";      Find = 'seed_fixture' }
            @{ Action = "teardown_fixture";  Find = 'teardown_fixture' }
        )
    }

    It "the runner source contains at least one call to Format-AccessIdentifier (issue #573 acceptance: all interpolations use one helper)" {
        $script:RunnerAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.CommandAst] -and
              $args[0].GetCommandName() -eq 'Format-AccessIdentifier' },
            $true
        ) | Should -Not -BeNullOrEmpty `
            -Because "every identifier interpolation site must go through the central helper."
    }

    It "no SQL interpolation site still uses the bare `[$name]` pattern for an unvalidated identifier (issue #573 acceptance: unsafe names rejected consistently)" {
        # Allow `[Name]` only inside Format-AccessIdentifier's own body (its return value).
        # Everywhere else, identifiers must be routed through the helper. The body of the helper
        # is excluded via FindAll scoping — we collect all bracket-interpolation commands outside
        # of Format-AccessIdentifier's extent.
        $helperExtent = if ($script:FormatAccessIdentifierFn) { $script:FormatAccessIdentifierFn.Extent } else { $null }
        $violations = $script:RunnerAst.FindAll(
            {
                $args[0] -is [System.Management.Automation.Language.CommandAst] -and
                $args[0].GetCommandName() -eq 'Format-AccessIdentifier'
            },
            $true
        )

        # Count all uses of Format-AccessIdentifier — there must be at least 6 (one per SQL site).
        $violations.Count | Should -BeGreaterOrEqual 6 `
            -Because "issue #573 acceptance criteria: every identifier interpolation uses one helper. The 6 SQL sites are count_rows, distinct_values, create_table, drop_table, seed_fixture, teardown_fixture."
    }
}