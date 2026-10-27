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
    # Load single functions by AST, never the whole COM library, and fail
    # loudly if anything in this file tries to create a real COM object.
    $script:LibAst = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path (Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1")).Path, [ref]$null, [ref]$null)
    function script:Import-LibFunction([string]$Name) {
        $fn = $script:LibAst.FindAll({
            $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $Name
        }, $true) | Select-Object -First 1
        if (-not $fn) { throw "$Name not found in dysflow-access-com.ps1" }
        return $fn.Extent.Text
    }
    function script:New-Object {
        if ($args -contains '-ComObject') { throw 'REAL_COM_BLOCKED: this test must never create a COM object.' }
        Microsoft.PowerShell.Utility\New-Object @args
    }
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

Describe "Test-AccessDatabaseExclusiveAvailable - live holder probe (#1912)" {
    BeforeAll {
        . ([scriptblock]::Create((Import-LibFunction 'Test-AccessDatabaseExclusiveAvailable')))
    }
    BeforeEach {
        $script:Dir = Join-Path ([IO.Path]::GetTempPath()) ("dysflow-1912-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $script:Dir | Out-Null
        $script:Db = Join-Path $script:Dir 'front.accdb'
        [IO.File]::WriteAllBytes($script:Db, [byte[]](1, 2, 3))
    }
    AfterEach {
        Remove-Item -LiteralPath $script:Dir -Recurse -Force -ErrorAction SilentlyContinue
    }

    It "reports a database held open by a live process as not exclusive" {
        $holder = [IO.File]::Open($script:Db, 'Open', 'ReadWrite', 'ReadWrite')
        try {
            Test-AccessDatabaseExclusiveAvailable -AccessPath $script:Db | Should -BeFalse
        } finally { $holder.Dispose() }
    }

    It "does not treat a leftover .laccdb without a live holder as a lock" {
        [IO.File]::WriteAllBytes((Join-Path $script:Dir 'front.laccdb'), [byte[]](0))
        Test-AccessDatabaseExclusiveAvailable -AccessPath $script:Db | Should -BeTrue
    }

    It "releases its probe handle immediately" {
        $null = Test-AccessDatabaseExclusiveAvailable -AccessPath $script:Db
        { [IO.File]::Open($script:Db, 'Open', 'ReadWrite', 'None').Dispose() } | Should -Not -Throw
    }
}

Describe "Open-AccessDatabase -RequireExclusive - refuses before opening Access (#1912)" {
    BeforeAll {
        . ([scriptblock]::Create((Import-LibFunction 'Test-AccessDatabaseExclusiveAvailable')))
        . ([scriptblock]::Create((Import-ManagerFunction 'Open-AccessDatabase')))
        function script:Close-TargetAccessDbIfOpen { param([string]$AccessPath) $script:CloseReturn }
        function script:Get-AllowBypassKeyState { param([string]$AccessPath, [string]$Password) $script:Opened.Add('dao') }
        function script:Enable-AllowBypassKey { param([string]$AccessPath, [string]$Password) $true }
        function script:Disable-StartupFeatures { param([string]$AccessPath, [string]$Password, $RestoreInfo) $RestoreInfo }
        function script:Restore-AllowBypassKey { param($AccessPath, $Password, $OriginalState) }
        function script:Restore-StartupFeatures { param($AccessPath, $Password, $RestoreInfo) }
        function script:Write-DysflowOperationMarker { param([string]$Status, $AccessPid) }
        function script:Write-Status { param([string]$Message, $Color) }
        function script:Open-CanonicalAccess { param([string]$DbPath, [string]$Password) $script:Opened.Add('access'); throw 'stop after open' }
    }
    BeforeEach {
        $script:Opened = [System.Collections.Generic.List[string]]::new()
        $script:CloseReturn = $null
        $script:Dir = Join-Path ([IO.Path]::GetTempPath()) ("dysflow-1912-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $script:Dir | Out-Null
        $script:Db = Join-Path $script:Dir 'front.accdb'
        [IO.File]::WriteAllBytes($script:Db, [byte[]](1, 2, 3))
    }
    AfterEach { Remove-Item -LiteralPath $script:Dir -Recurse -Force -ErrorAction SilentlyContinue }

    It "throws a lock error and opens nothing when a live process holds the database" {
        $holder = [IO.File]::Open($script:Db, 'Open', 'ReadWrite', 'ReadWrite')
        try {
            { Open-AccessDatabase -AccessPath $script:Db -Password 'x' -RequireExclusive } |
                Should -Throw -ExpectedMessage '*ACCESS_DATABASE_LOCKED*exclusive access*'
        } finally { $holder.Dispose() }
        $script:Opened.Count | Should -Be 0
    }

    It "opens normally on a free database that only has a stale .laccdb" {
        [IO.File]::WriteAllBytes((Join-Path $script:Dir 'front.laccdb'), [byte[]](0))
        { Open-AccessDatabase -AccessPath $script:Db -Password 'x' -RequireExclusive } | Should -Throw -ExpectedMessage 'stop after open'
        $script:Opened | Should -Contain 'access'
    }

    It "returns only the session when the stale-lock cleanup reports success" {
        # Close-TargetAccessDbIfOpen returns $true after removing a stale .laccdb (#844);
        # that value must not leak into the session the caller dereferences.
        $script:CloseReturn = $true
        function script:Open-CanonicalAccess {
            param([string]$DbPath, [string]$Password)
            [pscustomobject]@{
                AccessApplication = [pscustomobject]@{ VBE = [pscustomobject]@{ ActiveVBProject = 'project' } }
                OwnedPid = 1
            }
        }
        $session = @(Open-AccessDatabase -AccessPath $script:Db -Password 'x' -RequireExclusive)
        $session.Count | Should -Be 1
        $session[0].VbProject | Should -Be 'project'
    }
}

Describe "Invoke-ImportAction - persistence of an existing module (#1912)" {
    BeforeAll {
        Import-Module (Join-Path $PSScriptRoot ".." "lib" "dysflow-vba-import-transport.psm1") -Force
        Invoke-Expression (Import-ManagerFunction 'Invoke-ImportAction')
        function script:Write-Status { param([string]$Message, $Color) }
        function script:Write-DysflowResult { param($Result, [int]$Depth = 20) $script:Results.Add($Result) }
        function script:Resolve-ExistingComponentName { param($VbProject, [string]$ModuleName) $ModuleName }
        function script:Get-AccessDatabaseLockedOwner { param([string]$Message) [ordered]@{ machine = $null; user = $null } }
        function script:Import-VbaModule {
            param($VbProject, [string]$ModuleName, [string]$ModulesPath, $AccessApplication, [string]$ImportMode, [bool]$RollbackOnMutationFailure)
            [pscustomobject]@{ CreatedNewComponent = $false; RequiresExplicitSave = $false }
        }
        function script:Save-VbaProjectModules {
            param($AccessApplication, $VbProject, [string[]]$ModuleNames)
            $script:Saved.AddRange([string[]]$ModuleNames)
            if ($script:SaveError) { throw $script:SaveError }
        }
    }
    BeforeEach {
        $script:Results = [System.Collections.Generic.List[object]]::new()
        $script:Saved = [System.Collections.Generic.List[string]]::new()
        $script:SaveError = $null
        $script:Session = [pscustomobject]@{ VbProject = 'p'; AccessApplication = 'a' }
    }

    It "saves a re-imported standard module by name before reporting it ok" {
        $summary = Invoke-ImportAction -Session $script:Session -NormalizedModules @('ModFoo') -ModulesPath 'C:\none' -ImportMode 'Auto' -ModuleNamesExplicit
        $script:Saved | Should -Contain 'ModFoo'
        $summary.HasErrors | Should -BeFalse
        @($script:Results[0].modules)[0].status | Should -Be 'ok'
    }

    It "fails the call instead of reporting ok when the save hits the exclusive-access lock" {
        $script:SaveError = 'VBA_CREATED_MODULE_SAVE_FAILED: ModFoo: No tiene acceso exclusivo a la base de datos en este momento.'
        { Invoke-ImportAction -Session $script:Session -NormalizedModules @('ModFoo', 'ModBar') -ModulesPath 'C:\none' -ImportMode 'Auto' -ModuleNamesExplicit } |
            Should -Throw -ExpectedMessage '*acceso exclusivo*'
        @($script:Results | Where-Object { $_.ok -eq $true }).Count | Should -Be 0
    }

    It "fails the call when a document save hits the lock (no warning-only success)" {
        $script:SaveError = 'No se pudieron guardar explícitamente algunos módulos/clases nuevos: Form_X: You do not have exclusive access to the database at this time.'
        { Invoke-ImportAction -Session $script:Session -NormalizedModules @('Form_X') -ModulesPath 'C:\none' -ImportMode 'Auto' -ModuleNamesExplicit } |
            Should -Throw -ExpectedMessage '*exclusive access*'
        $script:Results.Count | Should -Be 0
    }
}
