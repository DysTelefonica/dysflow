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

    It "does not classify a compile error that merely quotes 'exclusive access' as a lock" {
        Test-IsAccessDatabaseLockedError -Message "Compile error near 'exclusive access' text" | Should -BeFalse
        Test-IsAccessDatabaseLockedError -Message "Error de compilación cerca de 'acceso exclusivo'" | Should -BeFalse
    }

    It "classifies the pre-flight refusal as a lock" {
        Test-IsAccessDatabaseLockedError -Message "ACCESS_DATABASE_LOCKED: another process holds 'x.accdb' open." | Should -BeTrue
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

    It "does not treat a read-only scanner that shares read and write as a lock" {
        # Antivirus, indexers, backups and dysflow's own copy read the file and
        # share it; Access can still open it shared and save, so no lock.
        $reader = [IO.File]::Open($script:Db, 'Open', 'Read', 'ReadWrite, Delete')
        try {
            Test-AccessDatabaseExclusiveAvailable -AccessPath $script:Db | Should -BeTrue
        } finally { $reader.Dispose() }
    }

    It "does not treat an invalid path as a lock" {
        Test-AccessDatabaseExclusiveAvailable -AccessPath 'a|b.accdb' | Should -BeTrue
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

    It "reports every module as a lock error when the save hits the exclusive-access lock" {
        $script:SaveError = 'VBA_CREATED_MODULE_SAVE_FAILED: ModFoo: No tiene acceso exclusivo a la base de datos en este momento.'
        $summary = Invoke-ImportAction -Session $script:Session -NormalizedModules @('ModFoo', 'ModBar') -ModulesPath 'C:\none' -ImportMode 'Auto' -ModuleNamesExplicit
        $summary.HasErrors | Should -BeTrue
        $script:Results.Count | Should -Be 1
        $script:Results[0].ok | Should -BeFalse
        @($script:Results[0].modules | ForEach-Object { $_.status }) | Should -Be @('error', 'error')
        @($script:Results[0].modules | ForEach-Object { $_.error.code }) | Should -Be @('ACCESS_DATABASE_LOCKED', 'ACCESS_DATABASE_LOCKED')
    }

    It "reports a lock error when a document save hits the lock (no warning-only success)" {
        $script:SaveError = 'No se pudieron guardar explícitamente algunos módulos/clases nuevos: Form_X: You do not have exclusive access to the database at this time.'
        $summary = Invoke-ImportAction -Session $script:Session -NormalizedModules @('Form_X') -ModulesPath 'C:\none' -ImportMode 'Auto' -ModuleNamesExplicit
        $summary.HasErrors | Should -BeTrue
        @($script:Results[0].modules)[0].status | Should -Be 'error'
        @($script:Results[0].modules)[0].error.code | Should -Be 'ACCESS_DATABASE_LOCKED'
    }
}

Describe "Import transport - unsaved modules and lock rollback (#1912 review)" {
    BeforeAll {
        Import-Module (Join-Path $PSScriptRoot ".." "lib" "dysflow-vba-import-transport.psm1") -Force
        $script:LockText = 'No tiene acceso exclusivo a la base de datos en este momento.'
    }
    BeforeEach {
        $script:Rollbacks = [System.Collections.Generic.List[string]]::new()
        $script:Results = [System.Collections.Generic.List[object]]::new()
        $script:Saves = [System.Collections.Generic.List[string]]::new()
    }

    It "requests a named save for a new component cloned with CopyObject" {
        $script:Resolved = 0
        $pass = Invoke-VbaImportPrimitivePass -Session ([pscustomobject]@{ VbProject = 'p'; AccessApplication = 'a' }) `
            -ModuleNames @('ModNew') -ModulesPath 'C:\src' -ImportMode 'Auto' -RollbackOnMutationFailure $true -Total 1 `
            -ResolveExisting { param($project, $name) $script:Resolved++; if ($script:Resolved -eq 1) { $null } else { 'ModNew' } } `
            -ImportModule { param($s, $n, $r, $m, $rb) [pscustomobject]@{ CreatedNewComponent = $true; RequiresExplicitSave = $false } } `
            -ResetDiagnostics { } -ReadDiagnostics { [pscustomobject]@{} } `
            -InspectLockOwner { [pscustomobject]@{ databaseLocked = $false; machine = $null; user = $null } } -WriteStatus { }
        $attempt = @($pass.Attempts)[0]
        @($attempt.createdComponentName, $attempt.modifiedComponentName) | Should -Contain 'ModNew'
    }

    It "rolls back the modules a lock-failed pass already imported and reports each as an error" {
        $null = Invoke-VbaImportTransport -Targets @('ModA', 'ModB') -Scope explicit `
            -CoreDecision { param($eventName, $payload) Invoke-VbaImportCoreDecision -Event $eventName -Payload $payload } `
            -RunPass {
                [pscustomobject]@{
                    Attempts = @(
                        [pscustomobject]@{ module = 'ModA'; ok = $true; durationMs = 1; modifiedComponentName = 'ModA' },
                        [pscustomobject]@{ module = 'ModB'; ok = $false; durationMs = 1; phase = 'import'; message = $script:LockText; databaseLocked = $true }
                    )
                    RollbackActions = @({ $script:Rollbacks.Add('ModA') | Out-Null })
                    RollbackModules = @('ModA')
                }
            } `
            -Save { throw 'save must not run' } `
            -WriteResult { param($result) $script:Results.Add($result) | Out-Null } -WriteStatus { }

        @($script:Rollbacks) | Should -Be @('ModA')
        $script:Results.Count | Should -Be 1
        $modules = @($script:Results[0].modules)
        @($modules.status) | Should -Be @('error', 'error')
        @($modules | ForEach-Object { $_.error.code }) | Should -Be @('ACCESS_DATABASE_LOCKED', 'ACCESS_DATABASE_LOCKED')
        $modules[0].error.rollbackAttempted | Should -BeTrue
        $modules[0].error.rollbackApplied | Should -BeTrue
    }

    It "keeps modules[] and rolls back when the save reports the lock" {
        $summary = Invoke-VbaImportTransport -Targets @('ModA') -Scope explicit `
            -CoreDecision { param($eventName, $payload) Invoke-VbaImportCoreDecision -Event $eventName -Payload $payload } `
            -RunPass {
                [pscustomobject]@{
                    Attempts = @([pscustomobject]@{ module = 'ModA'; ok = $true; durationMs = 1; modifiedComponentName = 'ModA' })
                    RollbackActions = @({ $script:Rollbacks.Add('ModA') | Out-Null })
                    RollbackModules = @('ModA')
                }
            } `
            -Save { param($moduleNames) [pscustomobject]@{ lockError = $script:LockText } } `
            -WriteResult { param($result) $script:Results.Add($result) | Out-Null } -WriteStatus { }

        $summary.HasErrors | Should -BeTrue
        @($script:Rollbacks) | Should -Be @('ModA')
        $modules = @($script:Results[0].modules)
        $modules[0].status | Should -Be 'error'
        $modules[0].error.code | Should -Be 'ACCESS_DATABASE_LOCKED'
        $modules[0].error.rollbackAttempted | Should -BeTrue
    }
}
