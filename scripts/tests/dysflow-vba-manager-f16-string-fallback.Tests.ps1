#Requires -Modules Pester
<#
.SYNOPSIS
    Pester tests for the F16 import_modules grow-in-place fallback.
.NOTES
    These tests exercise pure PowerShell helper contracts only. They do not open Access.
#>

Describe "dysflow-vba-manager.ps1 — F16 source-larger import fallback helpers" {
    BeforeAll {
        $script:ScriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $script:Ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:ScriptPath).Path,
            [ref]$null,
            [ref]$null
        )

        foreach ($functionName in @(
            'Assert-SafeVbaModuleName',
            'Resolve-ImportFileForModule',
            'Resolve-ExistingComponentName',
            'Get-VbNameFromSourceFile',
            'Test-SourceFileHasDuplicateOptions',
            'Get-SourceFileSizeSnapshot',
            'Test-SourceContainsWithEventsDeclaration',
            'Test-ShouldUseCodeModuleStringFallback',
            'Convert-VbaTextForCodeModuleString',
            'Get-VbaTextLineCount',
            'Get-VbaTextSizeSnapshot',
            'Get-CodeModuleTextSnapshot',
            'Restore-CodeModuleTextSnapshot',
            'Test-IsVbaImportDroppableMetadataLine',
            'Test-IsVbaOptionDirectiveLine',
            'Normalize-VbaImportText',
            'Convert-Utf8ToAnsiTempFile',
            'Convert-Utf8CodeImportToAnsiTempFile',
            'Get-FormCodeBehindCandidateNames',
            'Resolve-FormCodeBehindFile',
            'Test-LooksLikeDocumentCodeTarget',
            'New-VbComponentFromCodeFile',
            'Import-VbaModule'
        )) {
            $fnAst = $script:Ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq $functionName },
                $true
            ) | Select-Object -First 1
            if ($fnAst) { Invoke-Expression $fnAst.Extent.Text }
        }

        function script:Write-Status { param([string]$Message, $Color) }

        function script:New-FakeCodeModule {
            param(
                [string]$InitialText,
                [switch]$ThrowOnLines,
                [switch]$ThrowAfterDelete,
                [int]$AddFromFileLineCap = 0
            )
            $state = [pscustomobject]@{
                Text               = $InitialText
                ThrowOnLines       = [bool]$ThrowOnLines
                ThrowAfterDelete   = [bool]$ThrowAfterDelete
                AddFromFileLineCap = [int]$AddFromFileLineCap
                DeleteCalls        = 0
                AddFromFileCalls   = 0
                AddFromStringCalls = 0
            }
            $codeModule = [pscustomobject]@{ State = $state }
            $codeModule | Add-Member -MemberType ScriptProperty -Name CountOfLines -Value {
                if ([string]::IsNullOrEmpty($this.State.Text)) { return 0 }
                return @($this.State.Text -split "`r?`n").Count
            }
            $codeModule | Add-Member -MemberType ScriptMethod -Name Lines -Value {
                param($start, $count)
                if ($this.State.ThrowOnLines) { throw "simulated Lines failure" }
                $lines = @($this.State.Text -split "`r?`n")
                $from = [int]$start - 1
                $to = [Math]::Min(([int]$start + [int]$count - 2), ($lines.Count - 1))
                if ($from -gt $to) { return @() }
                return $lines[$from..$to]
            }
            $codeModule | Add-Member -MemberType ScriptMethod -Name DeleteLines -Value {
                param($start, $count)
                $this.State.DeleteCalls++
                $this.State.Text = ""
                if ($this.State.ThrowAfterDelete) { throw "simulated DeleteLines failure after mutation" }
            }
            $codeModule | Add-Member -MemberType ScriptMethod -Name AddFromFile -Value {
                param($path)
                $this.State.AddFromFileCalls++
                $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::GetEncoding(1252))
                $visible = Convert-VbaTextForCodeModuleString -Text $raw
                $lines = @($visible -split "`r?`n" | Where-Object { $_ -ne "" })
                if ($this.State.AddFromFileLineCap -gt 0 -and $lines.Count -gt $this.State.AddFromFileLineCap) {
                    $lines = @($lines | Select-Object -First $this.State.AddFromFileLineCap)
                }
                $this.State.Text = ($lines -join "`r`n")
            }
            $codeModule | Add-Member -MemberType ScriptMethod -Name AddFromString -Value {
                param($text)
                $this.State.AddFromStringCalls++
                $this.State.Text = ([string]$text).TrimEnd("`r", "`n")
            }
            return $codeModule
        }

        function script:New-FakeVbProject {
            param($CodeModule, [string]$Name = "Test_Foo")
            $component = [pscustomobject]@{ Name = $Name; CodeModule = $CodeModule }
            $components = [pscustomobject]@{ Component = $component }
            $components | Add-Member -MemberType ScriptMethod -Name Item -Value {
                param($itemName)
                if ([string]$itemName -ieq [string]$this.Component.Name) { return $this.Component }
                throw "component not found: $itemName"
            }
            return [pscustomobject]@{ VBComponents = $components }
        }
    }

    It "uses the string fallback only when the source has more lines than the existing component" {
        Test-ShouldUseCodeModuleStringFallback -SourceLines 11 -ExistingLines 10 | Should -Be $true
        Test-ShouldUseCodeModuleStringFallback -SourceLines 10 -ExistingLines 10 | Should -Be $false
        Test-ShouldUseCodeModuleStringFallback -SourceLines 9 -ExistingLines 10 | Should -Be $false
        Test-ShouldUseCodeModuleStringFallback -SourceLines 0 -ExistingLines 10 | Should -Be $false
    }

    It "strips hidden Attribute lines before using CodeModule.AddFromString" {
        $source = @(
            'Attribute VB_Name = "Test_Foo"',
            'Attribute VB_GlobalNameSpace = False',
            'Option Explicit',
            'Public Sub Sanity()',
            'End Sub'
        ) -join "`r`n"

        $converted = Convert-VbaTextForCodeModuleString -Text $source

        $converted | Should -Be ((@(
            'Option Explicit',
            'Public Sub Sanity()',
            'End Sub'
        ) -join "`r`n") + "`r`n")
    }

    It "preserves comments and string literals that mention Attribute VB_" {
        $source = @(
            'Attribute VB_Name = "Test_Foo"',
            ''' Attribute VB_Name = "CommentOnly"',
            'Public Function Text() As String',
            '    Text = "Attribute VB_Name = literal"',
            'End Function'
        ) -join "`r`n"

        $converted = Convert-VbaTextForCodeModuleString -Text $source

        $converted | Should -Match "CommentOnly"
        $converted | Should -Match "literal"
        $converted | Should -Not -Match '^Attribute VB_Name = "Test_Foo"'
    }

    It "counts logical VBA text lines without treating the trailing newline as an extra code line" {
        Get-VbaTextLineCount -Text "" | Should -Be 0
        Get-VbaTextLineCount -Text "Option Explicit" | Should -Be 1
        Get-VbaTextLineCount -Text "Option Explicit`r`nPublic Sub A()`r`nEnd Sub`r`n" | Should -Be 3
    }

    It "builds a size snapshot from visible VBA text for verbose fallback comparison" {
        $snapshot = Get-VbaTextSizeSnapshot -Text "Option Explicit`r`nPublic Sub A()`r`nEnd Sub`r`n"
        $snapshot.lines | Should -Be 3
        $snapshot.bytes | Should -BeGreaterThan 0
        $snapshot.sha256 | Should -Match '^[a-f0-9]{64}$'
    }

    It "does not call VBComponents.Remove in the production import path" {
        $fnAst = $script:Ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Import-VbaModule' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Import-VbaModule not found in $($script:ScriptPath)" }

        $removeCalls = @($fnAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and
              $args[0].Member.Value -eq 'Remove' },
            $true
        ))

        $removeCalls.Count | Should -Be 0
    }

    It "restores the original CodeModule text after a post-deletion failure" {
        $state = [pscustomobject]@{ Text = "Option Explicit`r`nPublic Sub Original()`r`nEnd Sub" }
        $codeModule = [pscustomobject]@{}
        $codeModule | Add-Member -MemberType ScriptProperty -Name CountOfLines -Value {
            if ([string]::IsNullOrEmpty($this.State.Text)) { return 0 }
            return @($this.State.Text -split "`r?`n").Count
        }
        $codeModule | Add-Member -NotePropertyName State -NotePropertyValue $state
        $codeModule | Add-Member -MemberType ScriptMethod -Name Lines -Value {
            param($start, $count)
            $from = [int]$start - 1
            $to = [int]$start + [int]$count - 2
            return @($this.State.Text -split "`r?`n")[$from..$to]
        }
        $codeModule | Add-Member -MemberType ScriptMethod -Name DeleteLines -Value {
            param($start, $count)
            $this.State.Text = ""
        }
        $codeModule | Add-Member -MemberType ScriptMethod -Name AddFromString -Value {
            param($text)
            $this.State.Text = $text
        }

        $snapshot = Get-CodeModuleTextSnapshot -CodeModule $codeModule
        $codeModule.DeleteLines(1, $codeModule.CountOfLines)

        try { throw "simulated AddFromString failure after deletion" }
        catch { $rollback = Restore-CodeModuleTextSnapshot -CodeModule $codeModule -Snapshot $snapshot }

        $snapshot.success | Should -Be $true
        $snapshot.text | Should -Be "Option Explicit`r`nPublic Sub Original()`r`nEnd Sub"
        $snapshot.originalLineCount | Should -Be 3
        $rollback.applied | Should -Be $true
        $rollback.error | Should -BeNullOrEmpty
        $state.Text | Should -Be $snapshot.text
    }

    It "distinguishes an empty module snapshot from snapshot capture failure" {
        $emptyState = [pscustomobject]@{ Text = "" }
        $emptyModule = [pscustomobject]@{}
        $emptyModule | Add-Member -NotePropertyName State -NotePropertyValue $emptyState
        $emptyModule | Add-Member -MemberType ScriptProperty -Name CountOfLines -Value { 0 }
        $emptyModule | Add-Member -MemberType ScriptMethod -Name DeleteLines -Value { param($start, $count) $this.State.Text = "" }
        $emptyModule | Add-Member -MemberType ScriptMethod -Name AddFromString -Value { param($text) $this.State.Text = $text }

        $emptySnapshot = Get-CodeModuleTextSnapshot -CodeModule $emptyModule
        $emptyRollback = Restore-CodeModuleTextSnapshot -CodeModule $emptyModule -Snapshot $emptySnapshot

        $emptySnapshot.success | Should -Be $true
        $emptySnapshot.text | Should -Be ""
        $emptySnapshot.originalLineCount | Should -Be 0
        $emptyRollback.applied | Should -Be $true
        $emptyRollback.error | Should -BeNullOrEmpty

        $failingModule = [pscustomobject]@{ CountOfLines = "not-a-number" }

        $failedSnapshot = Get-CodeModuleTextSnapshot -CodeModule $failingModule
        $failedRollback = Restore-CodeModuleTextSnapshot -CodeModule $emptyModule -Snapshot $failedSnapshot

        $failedSnapshot.success | Should -Be $false
        $failedSnapshot.error | Should -Match 'not-a-number'
        $failedRollback.applied | Should -Be $false
        $failedRollback.error | Should -Match 'not-a-number'
    }

    It "can rollback when DeleteLines mutates and then throws after rollback is armed" {
        $state = [pscustomobject]@{ Text = "Option Explicit`r`nPublic Sub Original()`r`nEnd Sub" }
        $codeModule = [pscustomobject]@{}
        $codeModule | Add-Member -NotePropertyName State -NotePropertyValue $state
        $codeModule | Add-Member -MemberType ScriptProperty -Name CountOfLines -Value {
            if ([string]::IsNullOrEmpty($this.State.Text)) { return 0 }
            return @($this.State.Text -split "`r?`n").Count
        }
        $codeModule | Add-Member -MemberType ScriptMethod -Name Lines -Value {
            param($start, $count)
            $from = [int]$start - 1
            $to = [int]$start + [int]$count - 2
            return @($this.State.Text -split "`r?`n")[$from..$to]
        }
        $codeModule | Add-Member -MemberType ScriptMethod -Name DeleteLines -Value {
            param($start, $count)
            $this.State.Text = ""
            throw "DeleteLines failed after mutation"
        }
        $codeModule | Add-Member -MemberType ScriptMethod -Name AddFromString -Value {
            param($text)
            $this.State.Text = $text
        }

        $snapshot = Get-CodeModuleTextSnapshot -CodeModule $codeModule
        $mutationStarted = $false
        $rollback = $null
        try {
            $mutationStarted = $true
            $codeModule.DeleteLines(1, $codeModule.CountOfLines)
        } catch {
            if ($mutationStarted) {
                $rollback = Restore-CodeModuleTextSnapshot -CodeModule $codeModule -Snapshot $snapshot
            }
        }

        $rollback.applied | Should -Be $true
        $rollback.error | Should -BeNullOrEmpty
        $state.Text | Should -Be $snapshot.text
    }

    It "fails before mutation when a non-empty module rollback snapshot cannot be captured" {
        $root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-f16-snapshot-{0}" -f [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $root | Out-Null
        try {
            $source = Join-Path $root "Test_Foo.bas"
            [System.IO.File]::WriteAllText($source, "Attribute VB_Name = `"Test_Foo`"`r`nOption Explicit`r`nPublic Sub Newer()`r`nEnd Sub`r`n", [System.Text.Encoding]::UTF8)
            $codeModule = New-FakeCodeModule -InitialText "Option Explicit`r`nPublic Sub Original()`r`nEnd Sub" -ThrowOnLines
            $project = New-FakeVbProject -CodeModule $codeModule -Name "Test_Foo"

            $thrown = $null
            try { Import-VbaModule -VbProject $project -ModuleName "Test_Foo" -ModulesPath $root -ImportMode "Auto" } catch { $thrown = $_ }

            $thrown.Exception.Message | Should -Match '^VBA_IMPORT_ROLLBACK_SNAPSHOT_FAILED:'
            $codeModule.State.Text | Should -Be "Option Explicit`r`nPublic Sub Original()`r`nEnd Sub"
            $codeModule.State.DeleteCalls | Should -Be 0
            $script:ImportLastRollbackAttempted | Should -Be $false
        } finally {
            Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "attempts rollback when DeleteLines mutates and then throws" {
        $root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-f16-delete-rollback-{0}" -f [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $root | Out-Null
        try {
            $source = Join-Path $root "Test_Foo.bas"
            [System.IO.File]::WriteAllText($source, "Attribute VB_Name = `"Test_Foo`"`r`nOption Explicit`r`nPublic Sub Newer()`r`nEnd Sub`r`n", [System.Text.Encoding]::UTF8)
            $original = "Option Explicit`r`nPublic Sub Original()`r`nEnd Sub"
            $codeModule = New-FakeCodeModule -InitialText $original -ThrowAfterDelete
            $project = New-FakeVbProject -CodeModule $codeModule -Name "Test_Foo"

            $thrown = $null
            try { Import-VbaModule -VbProject $project -ModuleName "Test_Foo" -ModulesPath $root -ImportMode "Auto" } catch { $thrown = $_ }

            $thrown.Exception.Message | Should -Match 'simulated DeleteLines failure after mutation'
            $script:ImportLastRollbackAttempted | Should -Be $true
            $script:ImportLastRollbackApplied | Should -Be $true
            $script:ImportLastRollbackError | Should -BeNullOrEmpty
            $codeModule.State.Text | Should -Be $original
        } finally {
            Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "does not use fallback when raw Attribute lines make the file larger but visible lines fit" {
        $root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-f16-visible-gate-{0}" -f [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $root | Out-Null
        try {
            $source = Join-Path $root "Test_Foo.bas"
            [System.IO.File]::WriteAllText($source, "Attribute VB_Name = `"Test_Foo`"`r`nOption Explicit`r`nPublic Sub Newer()`r`nEnd Sub`r`n", [System.Text.Encoding]::UTF8)
            $codeModule = New-FakeCodeModule -InitialText "Option Explicit`r`nPublic Sub Original()`r`nEnd Sub"
            $project = New-FakeVbProject -CodeModule $codeModule -Name "Test_Foo"

            $result = Import-VbaModule -VbProject $project -ModuleName "Test_Foo" -ModulesPath $root -ImportMode "Auto"

            $result.FallbackUsed | Should -Be $false
            $result.FallbackReason | Should -BeNullOrEmpty
            $codeModule.State.AddFromStringCalls | Should -Be 0
            $codeModule.State.Text | Should -Be "Option Explicit`r`nPublic Sub Newer()`r`nEnd Sub"
        } finally {
            Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "reports fallback diagnostics when AddFromFile truncates a source-larger update" {
        $root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-f16-fallback-diagnostics-{0}" -f [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $root | Out-Null
        try {
            $source = Join-Path $root "Test_Foo.bas"
            [System.IO.File]::WriteAllText($source, "Attribute VB_Name = `"Test_Foo`"`r`nOption Explicit`r`nPublic Sub Newer()`r`nEnd Sub`r`n", [System.Text.Encoding]::UTF8)
            $codeModule = New-FakeCodeModule -InitialText "Option Explicit`r`nPublic Sub Original()" -AddFromFileLineCap 2
            $project = New-FakeVbProject -CodeModule $codeModule -Name "Test_Foo"

            $result = Import-VbaModule -VbProject $project -ModuleName "Test_Foo" -ModulesPath $root -ImportMode "Auto"

            $result.FallbackUsed | Should -Be $true
            $result.FallbackReason | Should -Be "add_from_file_truncated"
            $codeModule.State.AddFromFileCalls | Should -Be 1
            $codeModule.State.AddFromStringCalls | Should -Be 1
            $codeModule.State.Text | Should -Be "Option Explicit`r`nPublic Sub Newer()`r`nEnd Sub"
        } finally {
            Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
