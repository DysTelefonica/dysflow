# Issue #1912 - an import must not report a module ok when Access has no
# exclusive access to the database, and the lock must be named as a lock.

BeforeAll {
    $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    $script:ManagerAst = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
    function script:Import-ManagerFunction([string]$Name) {
        $fn = $script:ManagerAst.FindAll({
            $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $Name
        }, $true) | Select-Object -First 1
        if (-not $fn) { throw "$Name not found in $($script:VbaManagerPath)" }
        return $fn.Extent.Text
    }
    . ([scriptblock]::Create((Import-ManagerFunction 'Test-IsAccessDatabaseLockedError')))
}

Describe "Test-IsAccessDatabaseLockedError - exclusive access (#1912)" {
    It "classifies the <Label> exclusive-access message as a lock" -TestCases @(
        @{ Label = 'Spanish'; Message = 'No tiene acceso exclusivo a la base de datos en este momento. Si continúa haciendo cambios existe la posibilidad de que no pueda guardarlos.' }
        @{ Label = 'English'; Message = 'You do not have exclusive access to the database at this time. If you proceed to make changes, you may not be able to save them later.' }
    ) {
        Test-IsAccessDatabaseLockedError -Message $Message | Should -BeTrue
    }

    It "does not classify a parser rejection as a lock" {
        Test-IsAccessDatabaseLockedError -Message 'Expected: end of statement' | Should -BeFalse
    }
}
