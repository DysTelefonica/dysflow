Describe 'Import-VbaModule LoadFromText transient recovery (#1634)' {
    BeforeAll {
        $script:ManagerPath = Join-Path $PSScriptRoot '..' 'dysflow-vba-manager.ps1'
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:ManagerPath).Path, [ref]$null, [ref]$null
        )
        $functionNames = @(
            'Import-VbaModule',
            'Test-AccessDocumentSnapshotEquivalent',
            'Get-ProvenTransientLoadFromTextCancellationEvidence',
            'Resolve-ImportFileForModule',
            'Resolve-FormCodeBehindFile',
            'Get-FormCodeBehindCandidateNames',
            'Resolve-AccessDocumentObjectName',
            'Resolve-AccessDocumentModuleName',
            'Assert-AccessDocumentTextLooksLoadable',
            'Normalize-AccessDocumentTextForLoadFromText',
            'Merge-AccessDocumentWithCanonicalHeader',
            'Ensure-AccessFormAutoResizeMarker',
            'Ensure-CodeBehindFormVbName',
            'Normalize-Newlines',
            'Split-CodeBehindSection',
            'Get-AccessDocumentLayoutNestingDefect',
            'Remove-AccessDocumentRootNameProperty',
            'Normalize-AccessDocumentRootEndMarker',
            'Normalize-AccessDocumentCodeBehindMarker',
            'Normalize-AccessDocumentOrphanCodeBehindSection',
            'Split-VbaHeaderAndBody',
            'Join-VbaHeaderAndBody',
            'Normalize-VbaImportText',
            'Get-PreferredNewline',
            'Test-IsVbaImportMetadataLine',
            'Test-IsVbaImportDroppableMetadataLine',
            'Test-IsVbaOptionDirectiveLine',
            'Get-VbNameFromSourceFile',
            'Assert-SafeVbaModuleName'
        )
        foreach ($name in $functionNames) {
            $definition = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $name },
                $true
            ) | Select-Object -First 1
            if (-not $definition) { throw "$name not found in $($script:ManagerPath)" }
            Invoke-Expression $definition.Extent.Text
        }
        function Invoke-Issue1634Import {
            Import-VbaModule -VbProject $script:VbProject -ModuleName $script:ModuleName `
                -ModulesPath $script:SourceRoot -AccessApplication $script:AccessApp -ImportMode Auto
        }
    }

    BeforeEach {
        $script:SourceRoot = Join-Path ([IO.Path]::GetTempPath()) ("dysflow-1634-{0}" -f [guid]::NewGuid().ToString('N'))
        $formsRoot = Join-Path $script:SourceRoot 'forms'
        [IO.Directory]::CreateDirectory($formsRoot) | Out-Null
        $script:ModuleName = 'Form_frmSplash'
        $script:ObjectName = 'frmSplash'
        $sourcePath = Join-Path $formsRoot "$($script:ModuleName).form.txt"
        [IO.File]::WriteAllText($sourcePath, @(
            'Version =21'
            'Begin Form'
            '    AutoResize = NotDefault'
            '    Caption = "desired-mutated"'
            '    Name = "frmSplash"'
            'End'
            'CodeBehindForm'
            'Attribute VB_Name = "Form_frmSplash"'
            ''
        ) -join "`r`n", [Text.Encoding]::UTF8)

        function script:Get-AccessObjectNames {
            param($AccessApplication, [string]$Kind)
            return @($script:ExistingObjectNames)
        }
        function script:Write-Status { param([string]$Message, $Color) }

        $script:LoadCalls = [Collections.Generic.List[object]]::new()
        $script:LoadFailures = @{}
        $script:SaveCalls = 0
        $script:SaveFailures = @{}
        $script:SaveContentOverrides = @{}
        $script:ExistingObjectNames = @($script:ObjectName)
        $script:ImportLastRollbackAttempted = $false
        $script:ImportLastRollbackApplied = $false
        $script:ImportLastRollbackError = $null
        $script:ImportLastFallbackUsed = $false
        $script:ImportLastFallbackReason = $null
        $script:LastRebuildDiagnostic = $null
        $script:AccessApp = [pscustomobject]@{}
        $script:AccessApp | Add-Member ScriptProperty DoCmd {
            $doCmd = [pscustomobject]@{}
            $doCmd | Add-Member ScriptMethod Close { param($type, $name, $save) }
            $doCmd | Add-Member ScriptMethod SetWarnings { param($enabled) }
            $doCmd
        }
        $script:AccessApp | Add-Member ScriptMethod SaveAsText {
            param($objectType, $objectName, $path)
            $script:SaveCalls++
            if ($script:SaveFailures.ContainsKey($script:SaveCalls)) {
                throw [string]$script:SaveFailures[$script:SaveCalls]
            }
            $saveText = @(
                'Version =21'
                'Begin Form'
                '    AutoResize = NotDefault'
                '    Caption = "canonical-original"'
                "    Name = `"$objectName`""
                'End'
                'CodeBehindForm'
                'Attribute VB_Name = "Form_frmSplash"'
                ''
            ) -join "`r`n"
            if ($script:SaveContentOverrides.ContainsKey($script:SaveCalls)) {
                $saveText = [string]$script:SaveContentOverrides[$script:SaveCalls]
            }
            [IO.File]::WriteAllText($path, $saveText, [Text.Encoding]::GetEncoding(1252))
        }
        $script:AccessApp | Add-Member ScriptMethod LoadFromText {
            param($objectType, $objectName, $path)
            $script:LoadCalls.Add([pscustomobject]@{
                content = [IO.File]::ReadAllText($path, [Text.Encoding]::GetEncoding(1252))
            }) | Out-Null
            $call = $script:LoadCalls.Count
            if ($script:LoadFailures.ContainsKey($call)) {
                throw [string]$script:LoadFailures[$call]
            }
        }
        $script:AccessApp | Add-Member ScriptMethod CurrentDb {
            [pscustomobject]@{ Name = 'C:\fake\db.accdb' }
        }
        $script:VbProject = [pscustomobject]@{}
    }

    AfterEach {
        Remove-Item -LiteralPath $script:SourceRoot -Recurse -Force -ErrorAction SilentlyContinue
    }

    It 'restores and verifies the canonical snapshot before one retry' {
        $script:LoadFailures[1] = 'Canceló la operación anterior.'

        $result = Invoke-Issue1634Import

        $script:LoadCalls.Count | Should -Be 3
        $script:LoadCalls[0].content | Should -Match 'Caption = "desired-mutated"'
        $script:LoadCalls[1].content | Should -Match 'Caption = "canonical-original"'
        $script:LoadCalls[2].content | Should -Match 'Caption = "desired-mutated"'
        $result.FallbackReason | Should -Be 'load_from_text_transient_cancellation_retry'
        $result.Verbose.transientRecovery.outcome | Should -Be recovered
        $result.Verbose.transientRecovery.evidence.phase | Should -Be import
        $result.Verbose.transientRecovery.evidence.member | Should -Be LoadFromText
        $result.Verbose.transientRecovery.evidence.snapshotAvailable | Should -BeTrue
        $result.Verbose.transientRecovery.evidence.exceptionChain[0].hresultHex | Should -Match '^0x[0-9A-F]{8}$'
    }

    It 'does not retry an unknown LoadFromText parser failure' {
        $script:LoadFailures = @{ 1 = "Error en la línea 42. Esperado: 'End'." }

        { Invoke-Issue1634Import } | Should -Throw '*Error en la línea 42*'

        $script:LoadCalls.Count | Should -Be 1
        $script:ImportLastFallbackUsed | Should -BeFalse
    }

    It 'fails closed without retry for the exact cancellation when no canonical snapshot exists' {
        $script:ExistingObjectNames = @()
        $script:LoadFailures = @{ 1 = 'Canceló la operación anterior.' }

        { Invoke-Issue1634Import } | Should -Throw '*Canceló la operación anterior.*'

        $script:LoadCalls.Count | Should -Be 1
        $script:SaveCalls | Should -Be 0
        $script:ImportLastFallbackUsed | Should -BeFalse
    }

    It 'fails closed before retry when restored SaveAsText is not equivalent to the canonical snapshot' {
        $script:LoadFailures = @{ 1 = 'Canceló la operación anterior.' }
        $script:SaveContentOverrides[2] = @(
            'Version =21'
            'Begin Form'
            '    AutoResize = NotDefault'
            '    Caption = "drifted-after-restore"'
            '    Name = "frmSplash"'
            'End'
            'CodeBehindForm'
            'Attribute VB_Name = "Form_frmSplash"'
            ''
        ) -join "`r`n"

        { Invoke-Issue1634Import } | Should -Throw '*not equivalent to the canonical snapshot*'

        $script:LoadCalls.Count | Should -Be 2
        $script:LastRebuildDiagnostic.outcome | Should -Be restore_before_retry_failed
        $script:ImportLastRollbackApplied | Should -BeFalse
    }

    It 'bounds repeated proven cancellation to one retry and terminal restore' {
        $script:LoadFailures = @{
            1 = 'Canceló la operación anterior.'
            3 = "Error en la línea 77. Esperado: 'End'."
        }

        { Invoke-Issue1634Import } | Should -Throw '*Error en la línea 77*'

        $script:LoadCalls.Count | Should -Be 4
        $script:ImportLastRollbackApplied | Should -BeTrue
        $script:LastRebuildDiagnostic.importAttempts | Should -Be 2
        $script:LastRebuildDiagnostic.snapshotRestores | Should -Be 2
        $script:LastRebuildDiagnostic.firstFailure | Should -Match 'Canceló la operación anterior\.'
        $script:LastRebuildDiagnostic.retryFailure | Should -Match 'Error en la línea 77'
    }

    It 'preserves first, retry, and rollback evidence when terminal restore fails' {
        $script:LoadFailures = @{
            1 = 'Canceló la operación anterior.'
            3 = "Error en la línea 88. Esperado: 'End'."
            4 = 'Terminal canonical rollback LoadFromText failed.'
        }

        $thrown = $null
        try { Invoke-Issue1634Import } catch { $thrown = $_ }

        $thrown | Should -Not -BeNullOrEmpty
        $thrown.Exception.Message | Should -Match 'Canceló la operación anterior\.'
        $thrown.Exception.Message | Should -Match 'Error en la línea 88'
        $thrown.Exception.Message | Should -Match 'Terminal canonical rollback LoadFromText failed\.'
        $script:LoadCalls.Count | Should -Be 4
        $script:ImportLastRollbackApplied | Should -BeFalse
        $script:ImportLastRollbackError | Should -Match 'Terminal canonical rollback LoadFromText failed\.'
        $script:LastRebuildDiagnostic.firstFailure | Should -Match 'Canceló la operación anterior\.'
        $script:LastRebuildDiagnostic.retryFailure | Should -Match 'Error en la línea 88'
        $script:LastRebuildDiagnostic.rollbackApplied | Should -BeFalse
        $script:LastRebuildDiagnostic.rollbackError | Should -Match 'Terminal canonical rollback LoadFromText failed\.'
    }

    It 'performs zero desired retries when snapshot restoration cannot be verified' {
        $script:LoadFailures = @{ 1 = 'Canceló la operación anterior.' }
        $script:SaveFailures = @{ 2 = 'SaveAsText verification unavailable.' }

        { Invoke-Issue1634Import } | Should -Throw '*before retry*'

        $script:LoadCalls.Count | Should -Be 2
        $script:ImportLastRollbackApplied | Should -BeFalse
        $script:LastRebuildDiagnostic.outcome | Should -Be restore_before_retry_failed
    }
}
