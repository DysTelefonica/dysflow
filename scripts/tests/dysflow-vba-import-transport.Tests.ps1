#Requires -Modules Pester

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot ".." "lib" "dysflow-vba-import-transport.psm1") -Force
}

Describe "dysflow VBA import transport module (#1463)" {
    It "accepts an import orchestration payload through stdin (#1661)" {
        $coreCliPath = Join-Path $PSScriptRoot '..\..\dist\cli\vba-import-orchestration.js'
        $json = [ordered]@{ targets = @('LargeModule'); scope = 'explicit' } | ConvertTo-Json -Compress
        $payloadBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))

        $lines = @($payloadBase64 | & node $coreCliPath --event start --payload-stdin 2>&1)

        $LASTEXITCODE | Should -Be 0
        @($lines | Where-Object { [string]$_ -like 'DYSFLOW_IMPORT_DECISION *' }).Count | Should -Be 1
    }

    It "rejects an oversized legacy argv payload with a typed pre-mutation error (#1661)" {
        $coreCliPath = Join-Path $PSScriptRoot '..\..\dist\cli\vba-import-orchestration.js'
        $json = [ordered]@{ targets = @(('x' * 7000)); scope = 'explicit' } | ConvertTo-Json -Compress
        $payloadBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))

        $lines = @(& node $coreCliPath --event start --payload-base64 $payloadBase64 2>&1)

        $LASTEXITCODE | Should -Be 1
        ($lines -join [Environment]::NewLine) | Should -Match 'PAYLOAD_TOO_LARGE_FOR_ARGV'
    }

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
        $results = [Collections.Generic.List[object]]::new()
        $passResult = Invoke-VbaImportPrimitivePass `
            -Session $session `
            -ModuleNames @('BadMod') `
            -ModulesPath 'C:\src' `
            -ImportMode 'Auto' `
            -RollbackOnMutationFailure $true `
            -Total 1 `
            -ResolveExisting { 'BadMod' } `
            -ImportModule { throw 'LoadFromText retry and terminal canonical restore failed.' } `
            -ResetDiagnostics { } `
            -ReadDiagnostics {
                [pscustomobject]@{
                    phase = 'import'
                    data = [pscustomobject]@{
                        firstFailure = 'Canceló la operación anterior.'
                        retryFailure = "Error en la línea 88. Esperado: 'End'."
                        rollbackApplied = $false
                        rollbackError = 'Terminal canonical rollback LoadFromText failed.'
                    }
                    rollbackAttempted = $true
                    rollbackApplied = $false
                    rollbackError = 'Terminal canonical rollback LoadFromText failed.'
                    fallbackUsed = $true
                    fallbackReason = 'load_from_text_transient_cancellation_retry'
                }
            } `
            -InspectLockOwner { [pscustomobject]@{ databaseLocked = $false; machine = $null; user = $null } } `
            -WriteStatus { }
        $attempt = @($passResult.Attempts)

        $attempt.ok | Should -Be $false
        $attempt.message | Should -Be 'LoadFromText retry and terminal canonical restore failed.'
        $attempt.phase | Should -Be 'import'
        $attempt.data.firstFailure | Should -Be 'Canceló la operación anterior.'
        $attempt.data.retryFailure | Should -Be "Error en la línea 88. Esperado: 'End'."
        $attempt.data.rollbackError | Should -Be 'Terminal canonical rollback LoadFromText failed.'
        $attempt.rollbackApplied | Should -BeFalse
        ($attempt.PSObject.Properties.Name -contains 'code') | Should -Be $false `
            -Because 'typed error projection belongs to the TypeScript core'

        $summary = Invoke-VbaImportTransport `
            -Targets @('BadMod') `
            -Scope explicit `
            -CoreDecision { param($eventName, $payload) Invoke-VbaImportCoreDecision -Event $eventName -Payload $payload } `
            -RunPass { $passResult } `
            -Save { throw 'save must not run after a failed import' } `
            -WriteResult { param($result) $results.Add($result) | Out-Null } `
            -WriteStatus { }

        $emitted = $results[0].modules[0]
        $emitted.error.code | Should -Be 'VBA_IMPORT_PHASE_FAILED'
        $emitted.error.data.firstFailure | Should -Be 'Canceló la operación anterior.'
        $emitted.error.data.retryFailure | Should -Be "Error en la línea 88. Esperado: 'End'."
        $emitted.error.data.rollbackError | Should -Be 'Terminal canonical rollback LoadFromText failed.'
        $emitted.error.rollbackApplied | Should -BeFalse
        $emitted.error.rollbackError | Should -Be 'Terminal canonical rollback LoadFromText failed.'
        $summary.HasErrors | Should -BeTrue
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
        @($results[0].modules.status) | Should -Be @('ok', 'ok')
        $summary.HasErrors | Should -Be $false
    }

    It "transports a large post-mutation decision without rolling back successful imports (#1661)" {
        $script:rollbacks = [Collections.Generic.List[string]]::new()
        $results = [Collections.Generic.List[object]]::new()
        $largeEvidence = 'x' * 40000

        $summary = Invoke-VbaImportTransport `
            -Targets @('LargeModule') `
            -Scope explicit `
            -CoreDecision { param($eventName, $payload) Invoke-VbaImportCoreDecision -Event $eventName -Payload $payload } `
            -RunPass {
                [pscustomobject]@{
                    Attempts = @(
                        [pscustomobject]@{
                            module = 'LargeModule'
                            ok = $true
                            durationMs = 1
                            verbose = [pscustomobject]@{ source = $largeEvidence }
                        }
                    )
                    RollbackActions = @(
                        { $script:rollbacks.Add('LargeModule') | Out-Null }
                    )
                }
            } `
            -Save { throw 'save must not run for an existing module' } `
            -WriteResult { param($result) $results.Add($result) | Out-Null } `
            -WriteStatus { }

        @($script:rollbacks) | Should -Be @()
        $results.Count | Should -Be 1
        $results[0].ok | Should -Be $true
        $results[0].modules[0].status | Should -Be 'ok'
        $results[0].modules[0].verbose.source.Length | Should -Be 40000
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
