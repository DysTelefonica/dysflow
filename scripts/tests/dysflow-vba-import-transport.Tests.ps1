#Requires -Modules Pester

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot ".." "lib" "dysflow-vba-import-transport.psm1") -Force
}

Describe "dysflow VBA import transport module (#1463)" {
    It "executes one ordered primitive pass through injected COM ports" {
        $calls = [Collections.Generic.List[string]]::new()
        $session = [pscustomobject]@{ VbProject = 'project'; AccessApplication = 'access' }
        $passResult = Invoke-VbaImportPrimitivePass `
            -Session $session `
            -ModuleNames @('ModA', 'ModB') `
            -ModulesPath 'C:\src' `
            -ImportMode 'Auto' `
            -RollbackOnMutationFailure $true `
            -Total 2 `
            -ResolveExisting { param($project, $name) $name } `
            -ImportModule {
                param($importSession, $name, $sourceRoot, $mode, $rollback)
                $calls.Add("$name|$sourceRoot|$mode|$rollback") | Out-Null
                [pscustomobject]@{ CreatedNewComponent = $false; RequiresExplicitSave = $false; FallbackUsed = $false; RollbackAction = { } }
            } `
            -ResetDiagnostics { } `
            -ReadDiagnostics { [pscustomobject]@{} } `
            -InspectLockOwner { [pscustomobject]@{ databaseLocked = $false; machine = $null; user = $null } } `
            -WriteStatus { }
        $attempts = @($passResult.Attempts)

        @($attempts.module) | Should -Be @('ModA', 'ModB')
        @($attempts.ok) | Should -Be @($true, $true)
        @($passResult.RollbackActions).Count | Should -Be 2
        @($calls) | Should -Be @('ModA|C:\src|Auto|True', 'ModB|C:\src|Auto|True')
    }

    It "serializes raw failure evidence without duplicating core error mapping" {
        $session = [pscustomobject]@{ VbProject = 'project'; AccessApplication = 'access' }
        $passResult = Invoke-VbaImportPrimitivePass `
            -Session $session `
            -ModuleNames @('BadMod') `
            -ModulesPath 'C:\src' `
            -ImportMode 'Auto' `
            -RollbackOnMutationFailure $true `
            -Total 1 `
            -ResolveExisting { 'BadMod' } `
            -ImportModule { throw 'VB_NAME_MISMATCH: wrong identity' } `
            -ResetDiagnostics { } `
            -ReadDiagnostics {
                [pscustomobject]@{
                    phase = 'import'
                    data = $null
                    rollbackAttempted = $true
                    rollbackApplied = $true
                    rollbackError = $null
                    fallbackUsed = $false
                    fallbackReason = $null
                }
            } `
            -InspectLockOwner { [pscustomobject]@{ databaseLocked = $false; machine = $null; user = $null } } `
            -WriteStatus { }
        $attempt = @($passResult.Attempts)

        $attempt.ok | Should -Be $false
        $attempt.message | Should -Be 'VB_NAME_MISMATCH: wrong identity'
        $attempt.phase | Should -Be 'import'
        $attempt.rollbackApplied | Should -Be $true
        ($attempt.PSObject.Properties.Name -contains 'code') | Should -Be $false `
            -Because 'typed error projection belongs to the TypeScript core'
    }

    It "follows core retry and save decisions while preserving one final result emission" {
        $passRequests = [Collections.Generic.List[object]]::new()
        $saveRequests = [Collections.Generic.List[object]]::new()
        $results = [Collections.Generic.List[object]]::new()
        $script:pass = 0

        $summary = Invoke-VbaImportTransport `
            -Targets @('NeedsDependency', 'Dependency') `
            -Scope explicit `
            -CoreDecision { param($eventName, $payload) Invoke-VbaImportCoreDecision -Event $eventName -Payload $payload } `
            -RunPass {
                param($moduleNames, $rollbackOnMutationFailure, $passNumber, $total)
                $passRequests.Add(@($moduleNames)) | Out-Null
                $script:pass++
                if ($script:pass -eq 1) {
                    return @(
                        [pscustomobject]@{ module = 'NeedsDependency'; ok = $false; durationMs = 1; phase = 'import'; message = 'not ready'; rollbackApplied = $false },
                        [pscustomobject]@{ module = 'Dependency'; ok = $true; durationMs = 1; createdComponentName = 'Dependency' }
                    )
                }
                return [pscustomobject]@{ module = 'NeedsDependency'; ok = $true; durationMs = 1 }
            } `
            -Save { param($moduleNames) $saveRequests.Add(@($moduleNames)) | Out-Null; return $null } `
            -WriteResult { param($result) $results.Add($result) | Out-Null } `
            -WriteStatus { }

        @($passRequests[0]) | Should -Be @('NeedsDependency', 'Dependency')
        @($passRequests[1]) | Should -Be @('NeedsDependency')
        @($saveRequests[0]) | Should -Be @('Dependency')
        $results.Count | Should -Be 1
        @($results[0].status) | Should -Be @('ok', 'ok')
        $summary.HasErrors | Should -Be $false
    }

    It "rolls back successful mutations and emits a terminal result when the post-pass core bridge fails" {
        $script:rollbacks = [Collections.Generic.List[string]]::new()
        $results = [Collections.Generic.List[object]]::new()
        $script:decisionCalls = 0

        $summary = Invoke-VbaImportTransport `
            -Targets @('ModA', 'ModB') `
            -Scope explicit `
            -CoreDecision {
                param($eventName, $payload)
                $script:decisionCalls++
                if ($script:decisionCalls -eq 1) {
                    return [pscustomobject]@{
                        kind = 'run-pass'
                        moduleNames = @('ModA', 'ModB')
                        rollbackOnMutationFailure = $true
                        state = [pscustomobject]@{ pass = 0; targets = @('ModA', 'ModB') }
                    }
                }
                throw 'core bridge unavailable'
            } `
            -RunPass {
                param($moduleNames, $rollbackOnMutationFailure, $passNumber, $total)
                [pscustomobject]@{
                    Attempts = @(
                        [pscustomobject]@{ module = 'ModA'; ok = $true; durationMs = 1 },
                        [pscustomobject]@{ module = 'ModB'; ok = $true; durationMs = 1 }
                    )
                    RollbackActions = @(
                        { $script:rollbacks.Add('ModA') | Out-Null },
                        { $script:rollbacks.Add('ModB') | Out-Null }
                    )
                }
            } `
            -Save { throw 'save must not run' } `
            -WriteResult { param($result) $results.Add($result) | Out-Null } `
            -WriteStatus { }

        @($script:rollbacks) | Should -Be @('ModB', 'ModA')
        $results.Count | Should -Be 1
        $results[0].error.code | Should -Be 'VBA_IMPORT_FAILED'
        $results[0].error.message | Should -Match 'core bridge unavailable'
        $summary.HasErrors | Should -Be $true
    }
}
