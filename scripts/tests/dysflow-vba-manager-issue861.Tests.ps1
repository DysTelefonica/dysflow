#Requires -Modules Pester
<#
.SYNOPSIS
    Regression tests for issue #861 — the AutoExec/StartupForm safety gate must
    not abort bulk-read (list_vba_modules, list_objects, export ...) on databases
    whose only secret is a VBA *project* password.
.NOTES
    ACCESS_VBA_PASSWORD is a VBA-project password, NOT a database-level password.
    DAO's OpenDatabase(...;PWD=) expects a database password, so passing the
    project password (or any password to a DB with no database password) fails
    with "No es una contraseña válida". Before the fix Disable-StartupFeatures
    re-threw that as a CRITICAL abort and every bulk-read died. The fix retries
    the DAO open WITHOUT a password (Open-DaoDatabaseForMaintenance).

    Pure-PowerShell: uses a hand-rolled fake DAO engine, no live Access COM.
#>

BeforeDiscovery {
    $script:Issue861ScriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
}

Describe "issue #861 — AutoExec gate password fallback" {

    Context "Open-DaoDatabaseForMaintenance" {
        BeforeAll {
            $scriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $scriptPath).Path, [ref]$null, [ref]$null
            )
            $fn = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'Open-DaoDatabaseForMaintenance' },
                $true
            ) | Select-Object -First 1
            $fn | Should -Not -BeNullOrEmpty `
                -Because "the fix introduces Open-DaoDatabaseForMaintenance as the shared DAO-open seam"
            . ([ScriptBlock]::Create($fn.Extent.Text))

            # Fake DAO engine reproducing #861: OpenDatabase throws
            # "No es una contraseña válida" whenever a password is supplied and
            # only succeeds with an empty connect string.
            function New-FakeEngine {
                $engine = [PSCustomObject]@{ }
                $engine | Add-Member -MemberType ScriptMethod -Name OpenDatabase -Value {
                    param([string]$DatabasePath, [bool]$options, [bool]$readOnly, [string]$connect)
                    if ($connect -match 'PWD=') {
                        throw "Excepción al llamar a `"OpenDatabase`" con los argumentos `"4`": `"No es una contraseña válida`"."
                    }
                    return [PSCustomObject]@{ Opened = $true }
                }
                return $engine
            }
        }

        It "falls back to opening WITHOUT a password when the password is not a valid database password" {
            $opened = Open-DaoDatabaseForMaintenance -DbEngine (New-FakeEngine) -AccessPath "C:\fake.accdb" -Password "vba-project-secret"
            $opened.Database | Should -Not -BeNullOrEmpty `
                -Because "a VBA-project password must not block the maintenance open when the DB has no database password"
            $opened.ErrorMessage | Should -BeNullOrEmpty
        }

        It "returns the database directly when no password is supplied" {
            $opened = Open-DaoDatabaseForMaintenance -DbEngine (New-FakeEngine) -AccessPath "C:\fake.accdb" -Password ""
            $opened.Database | Should -Not -BeNullOrEmpty
        }

        It "reports the DAO error when the file cannot be opened at all" {
            $engine = [PSCustomObject]@{ }
            $engine | Add-Member -MemberType ScriptMethod -Name OpenDatabase -Value {
                param([string]$DatabasePath, [bool]$options, [bool]$readOnly, [string]$connect)
                throw "No es una contraseña válida"
            }
            $opened = Open-DaoDatabaseForMaintenance -DbEngine $engine -AccessPath "C:\fake.accdb" -Password "x"
            $opened.Database | Should -BeNullOrEmpty
            $opened.ErrorMessage | Should -Match "contraseña"
        }
    }

    Context "Disable-StartupFeatures — bulk_read_skips_unneeded_autoexec_gate" {
        BeforeAll {
            $scriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $scriptPath).Path, [ref]$null, [ref]$null
            )
            foreach ($name in @('Open-DaoDatabaseForMaintenance', 'Disable-StartupFeatures')) {
                $fn = $ast.FindAll(
                    { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                      $args[0].Name -eq $name },
                    $true
                ) | Select-Object -First 1
                $fn | Should -Not -BeNullOrEmpty -Because "the fix must keep $name extractable"
                . ([ScriptBlock]::Create($fn.Extent.Text))
            }

            # Redirect the DAO engine factory that Disable-StartupFeatures calls
            # internally to a fake that reproduces the #861 password failure.
            function New-DaoDbEngine {
                $engine = [PSCustomObject]@{ }
                $engine | Add-Member -MemberType ScriptMethod -Name OpenDatabase -Value {
                    param([string]$DatabasePath, [bool]$options, [bool]$readOnly, [string]$connect)
                    if ($connect -match 'PWD=') {
                        throw "Excepción al llamar a `"OpenDatabase`" con los argumentos `"4`": `"No es una contraseña válida`"."
                    }
                    $db = [PSCustomObject]@{ }
                    $db | Add-Member -MemberType ScriptMethod -Name Containers -Value {
                        param($name)
                        # No AutoExec script — the common bulk-read case.
                        return [PSCustomObject]@{ Documents = [System.Collections.ArrayList]::new() }
                    }
                    $db | Add-Member -MemberType ScriptMethod -Name Properties -Value {
                        param($name)
                        throw "Property '$name' not found"
                    }
                    $db | Add-Member -MemberType ScriptMethod -Name Close -Value { }
                    return $db
                }
                return $engine
            }
        }

        It "does NOT abort when the password is a VBA-project password (no database password)" {
            # A throw here (the pre-#861 behavior) fails the test: the gate used
            # to re-raise 'No es una contraseña válida' as a CRITICAL abort and
            # kill every bulk-read. The fix opens without a password and returns
            # a restore-info object instead.
            $restore = Disable-StartupFeatures -AccessPath "C:\fake.accdb" -Password "vba-project-secret"
            $restore | Should -Not -BeNullOrEmpty `
                -Because "the gate must open the DB (password fallback) and return restore info, not abort"
            $restore.RenamedAutoExec | Should -Be $false `
                -Because "the fake DB carries no AutoExec script, so nothing is renamed"
        }
    }
}
