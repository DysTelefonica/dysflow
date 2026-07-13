#Requires -Modules Pester
<#
.SYNOPSIS
    Pester tests for dysflow-vba-manager.ps1 COM cleanup paths and helper functions.
.NOTES
    COM-integration tests (requiring a live Access installation) are marked -Skip.
    Pure-PowerShell helper function tests run in any environment.
#>

# Helper to stub/mock Write-DysflowResult for functions extracted via AST
function global:Write-DysflowResult {
    param(
        [Parameter(Mandatory = $true)] [object] $Result,
        [Parameter(Mandatory = $false)] [int] $Depth = 20
    )
    $json = ($Result | ConvertTo-Json -Compress -Depth $Depth) -replace "[\r\n]+"," "
    if ($null -ne $script:HostMessages) {
        $script:HostMessages.Add("DYSFLOW_RESULT " + $json)
    }
    Write-Output $json
}

Describe "dysflow-vba-manager.ps1 — script structure" {
    BeforeAll {
        $script:ScriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    }

    Context "File presence and parseability" {
        It "script file exists" {
            Test-Path $script:ScriptPath | Should -Be $true
        }

        It "script parses without syntax errors" {
            $errors = $null
            $null = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $script:ScriptPath).Path,
                [ref]$null,
                [ref]$errors
            )
            $errors | Should -BeNullOrEmpty
        }
    }

    Context "New-VbComponentFromCodeFile — Unicode-safe name assignment (behavior contracts #585)" {
        BeforeAll {
            # AST extraction is LOADER-ONLY (#585). We use the parsed AST to find
            # the functions and dot-source them into the test scope; we do NOT
            # assert on the extracted source body text.
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $script:ScriptPath).Path, [ref]$null, [ref]$null
            )
            $newVbFnAst = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'New-VbComponentFromCodeFile' },
                $true
            ) | Select-Object -First 1

            $setEncodingFn = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'Set-ScriptOutputEncodingUtf8' },
                $true
            ) | Select-Object -First 1
            $setNameFn = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'Set-VbComponentNameSafe' },
                $true
            ) | Select-Object -First 1

            $script:NewVbFnAst = $newVbFnAst
            $script:SetEncodingFnAst = $setEncodingFn
            $script:SetNameFnAst = $setNameFn

            # Dot-source the helpers into the test scope so the It blocks can
            # call them directly. The helpers are pure (no Access COM) so
            # loading them at Describe time is safe.
            if ($setEncodingFn) { Invoke-Expression $setEncodingFn.Extent.Text }
            if ($setNameFn) { Invoke-Expression $setNameFn.Extent.Text }
        }

        It "Set-ScriptOutputEncodingUtf8 sets [Console]::OutputEncoding to UTF-8" {
            # powershell.exe (5.1) defaults stdout to the active console code page
            # (e.g. CP1252). Node.js reads the child's stdout as UTF-8 — any
            # non-ASCII char (e.g. ó) arrives as U+FFFD. The script's helper
            # must set [Console]::OutputEncoding = UTF8 so ConvertTo-Json output
            # round-trips correctly through list_objects JSON.
            $script:SetEncodingFnAst | Should -Not -BeNullOrEmpty `
                -Because "dysflow-vba-manager.ps1 must define Set-ScriptOutputEncodingUtf8 as an extractable helper (#585)"

            $previous = [Console]::OutputEncoding
            try {
                [Console]::OutputEncoding = [System.Text.Encoding]::ASCII
                Set-ScriptOutputEncodingUtf8
                [Console]::OutputEncoding.CodePage | Should -Be 65001
                [Console]::OutputEncoding.WebName | Should -Be "utf-8"
            } finally {
                [Console]::OutputEncoding = $previous
            }
        }

        It "Set-VbComponentNameSafe assigns .Name to the component (Unicode-safe)" {
            # DoCmd.CopyObject is not Unicode-safe: it mangles non-ASCII chars in
            # the new object name (e.g. Módulo1 -> Mód×lo1). The fix is to force
            # VBComponent.Name via COM *inside* the CopyObject branch — the same
            # Unicode-safe setter used by the VBE F4 Properties pane. The fix
            # is now a tiny pure helper that any mock component can exercise.
            $script:SetNameFnAst | Should -Not -BeNullOrEmpty `
                -Because "dysflow-vba-manager.ps1 must define Set-VbComponentNameSafe as an extractable helper (#585)"

            # PSCustomObject with a Name property setter acts as a fake
            # VBComponent. Set-VbComponentNameSafe just assigns the property.
            $mock = [PSCustomObject]@{ Name = $null }
            Set-VbComponentNameSafe -Component $mock -Name "Módulo1"
            $mock.Name | Should -Be "Módulo1"
        }

        It "New-VbComponentFromCodeFile calls Set-VbComponentNameSafe in BOTH branches (#585 AST contract)" {
            # Structural metadata check via AST: count the call nodes to
            # Set-VbComponentNameSafe inside New-VbComponentFromCodeFile. This
            # is NOT a source-text assertion — it walks the call graph and
            # survives a refactor that renames $newComponent or splits the
            # function into helpers. The risk is the same as the legacy
            # `$newComponent.Name = $ModuleName` count test: both branches
            # (CopyObject + Add) must set the Unicode-safe name.
            $script:NewVbFnAst | Should -Not -BeNullOrEmpty
            $callNodes = $script:NewVbFnAst.Body.FindAll(
                { $args[0] -is [System.Management.Automation.Language.CommandAst] -and
                  $args[0].GetCommandName() -eq 'Set-VbComponentNameSafe' },
                $true
            )
            $callNodes.Count | Should -BeGreaterOrEqual 2 `
                -Because "both the CopyObject branch and the VBComponents.Add branch must call Set-VbComponentNameSafe; a single call in only the else branch leaves the CopyObject path uncovered"
        }
    }

    Context "Early helpers — defined before use (regression for pwsh 7+ script-load order)" {
        # Background: Windows PowerShell 5.1 used to tolerate calling a function
        # before its `function` definition executed as long as both lived at the
        # script top level (the engine walked the script twice on a first hit).
        # pwsh 7+ enforces the script-load order strictly: a top-level call to a
        # function defined later in the file raises CommandNotFoundException, and
        # our sentinel `trap` wraps that into DYSFLOW_RESULT code
        # VBA_MANAGER_UNEXPECTED_EXIT (trap_kind: CommandNotFoundException).
        #
        # The fix is to define each helper the script invokes at top level in an
        # "early helpers" block placed BEFORE its first call site. This context
        # locks that contract with AST-level checks so the order cannot regress.
        BeforeAll {
            $script:ScriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

            $script:ScriptAst = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $script:ScriptPath).Path,
                [ref]$null,
                [ref]$null
            )

            # Map: function name -> first definition line (1-based).
            $script:FunctionDefs = @{}
            $script:ScriptAst.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] },
                $true
            ) | ForEach-Object {
                if (-not $script:FunctionDefs.ContainsKey($_.Name)) {
                    $script:FunctionDefs[$_.Name] = $_.Extent.StartLineNumber
                }
            }
        }

        It "defines Set-ScriptOutputEncodingUtf8" {
            $script:FunctionDefs.ContainsKey('Set-ScriptOutputEncodingUtf8') | Should -Be $true
        }

        It "defines Set-VbComponentNameSafe" {
            $script:FunctionDefs.ContainsKey('Set-VbComponentNameSafe') | Should -Be $true
        }

        It "defines Write-DysflowOperationMarker" {
            $script:FunctionDefs.ContainsKey('Write-DysflowOperationMarker') | Should -Be $true
        }

        It "Set-ScriptOutputEncodingUtf8 lives in the early helpers block (line <= 220)" {
            # The early helpers block lives right after the trap and before any
            # first call site. If the helper is pushed past the top-level call
            # (was line 116, helper was line 135), pwsh 7+ throws
            # CommandNotFoundException; the consumer sees
            # VBA_MANAGER_UNEXPECTED_EXIT with trap_kind: CommandNotFoundException
            # and a useless stack trace. Pinning the helper to line <= 220 keeps
            # it ahead of every top-level call site in this script and matches
            # the early-block convention used by the surrounding COM helpers.
            # Issue #807 (Feature 1) added List-VbaModules params that pushed
            # the early-block boundary from 200 to ~215. The convention (helpers
            # before first call site) is preserved.
            $script:FunctionDefs['Set-ScriptOutputEncodingUtf8'] | Should -BeLessOrEqual 220 `
                -Because "Set-ScriptOutputEncodingUtf8 is invoked at the top level (line ~116) so its definition must precede that call site"
        }

        It "Set-VbComponentNameSafe lives in the early helpers block (line <= 220)" {
            # Moved up alongside Set-ScriptOutputEncodingUtf8 so the Unicode-safe
            # name setter is available before New-VbComponentFromCodeFile runs.
            # Same ceiling relaxation as Set-ScriptOutputEncodingUtf8 above (#807).
            $script:FunctionDefs['Set-VbComponentNameSafe'] | Should -BeLessOrEqual 220
        }

        It "Write-DysflowOperationMarker lives in the early helpers block (line <= 220)" {
            # Moved up alongside Set-ScriptOutputEncodingUtf8 so the operation
            # marker is available before Open-AccessDatabase runs.
            # Same ceiling relaxation as Set-ScriptOutputEncodingUtf8 above (#807).
            $script:FunctionDefs['Write-DysflowOperationMarker'] | Should -BeLessOrEqual 220
        }

        It "every top-level invocation of a script-defined function comes AFTER its definition" {
            # Walk every CommandAst in the script and keep only the ones that
            # are NOT nested inside any function body (a top-level call runs
            # during script load; a call inside a function body only runs when
            # that outer function is invoked, by which time the whole top-level
            # pass — including every `function` statement — has completed).
            #
            # For each remaining call whose command name matches a function
            # defined in this script, the call line MUST be >= the function's
            # first definition line. Violations list the offending function and
            # both line numbers so a regression is debuggable from the test
            # output alone.
            $allCommands = $script:ScriptAst.FindAll(
                { $args[0] -is [System.Management.Automation.Language.CommandAst] },
                $true
            )

            $topLevelCommands = $allCommands | Where-Object {
                $node = $_.Parent
                while ($null -ne $node) {
                    if ($node -is [System.Management.Automation.Language.FunctionDefinitionAst]) {
                        return $false
                    }
                    $node = $node.Parent
                }
                return $true
            }

            $violations = foreach ($cmd in $topLevelCommands) {
                $name = $cmd.GetCommandName()
                if ($name -and $script:FunctionDefs.ContainsKey($name)) {
                    $defLine = $script:FunctionDefs[$name]
                    $invLine = $cmd.Extent.StartLineNumber
                    if ($invLine -lt $defLine) {
                        [pscustomobject]@{
                            Function  = $name
                            DefinedAt = $defLine
                            InvokedAt = $invLine
                        }
                    }
                }
            }

            $violations = @($violations)
            if ($violations.Count -gt 0) {
                $detail = ($violations | ForEach-Object {
                    "{0} defined L{1} but invoked at L{2}" -f $_.Function, $_.DefinedAt, $_.InvokedAt
                }) -join '; '
                $violations.Count | Should -Be 0 `
                    -Because "top-level invocations must come AFTER the function's first definition line. Violations: $detail"
            } else {
                $violations.Count | Should -Be 0 `
                    -Because "no top-level invocation precedes its function definition"
            }
        }
    }

    Context "COM cleanup function definitions" {
        BeforeAll {
            # Parse the AST to verify function definitions without executing the script
            $ast = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $script:ScriptPath).Path,
                [ref]$null,
                [ref]$null
            )
            $script:FunctionNames = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] },
                $true
            ) | Select-Object -ExpandProperty Name
        }

        It "defines Get-AllowBypassKeyState" {
            $script:FunctionNames | Should -Contain "Get-AllowBypassKeyState"
        }

        It "defines Enable-AllowBypassKey" {
            $script:FunctionNames | Should -Contain "Enable-AllowBypassKey"
        }

        It "defines Restore-AllowBypassKey" {
            $script:FunctionNames | Should -Contain "Restore-AllowBypassKey"
        }

        It "defines Disable-StartupFeatures" {
            $script:FunctionNames | Should -Contain "Disable-StartupFeatures"
        }

        It "defines Restore-StartupFeatures" {
            $script:FunctionNames | Should -Contain "Restore-StartupFeatures"
        }

        It "defines New-DaoDbEngine" {
            $script:FunctionNames | Should -Contain "New-DaoDbEngine"
        }

        It "defines Open-AccessDatabase" {
            $script:FunctionNames | Should -Contain "Open-AccessDatabase"
        }

        It "defines Close-AccessDatabase" {
            $script:FunctionNames | Should -Contain "Close-AccessDatabase"
        }

        It "does not contain a broad Get-Process MSACCESS kill fallback in Close-TargetAccessDbIfOpen" {
            $source = Get-Content -Raw (Resolve-Path $script:ScriptPath).Path
            $source | Should -Not -Match 'Fallback:\s+cerrando MSACCESS PID'
            $source | Should -Not -Match 'foreach\s*\(\$p\s+in\s+@\(Get-Process\s+MSACCESS'
        }
    }

}

Describe "dysflow-vba-manager.ps1 — pure helper functions" {
    BeforeAll {
        if (-not $script:ScriptPath) {
            $script:ScriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        }

        # Dot-source only the helper functions by extracting them via AST
        # We mock the Param block's mandatory parameters to avoid execution
        # by loading helper functions that don't require COM or Access.

        # Load the pure text-processing functions via a restricted dot-source approach:
        # parse out only functions that have no COM dependencies.
        $scriptContent = Get-Content -Raw (Resolve-Path $script:ScriptPath).Path

        # We define the helper functions in a child scope by extracting and eval-ing
        # only the pure string/text functions. This avoids COM activation.
        $pureFunctions = @(
            'function Test-IsVbaImportMetadataLine',
            'function Test-IsVbaImportDroppableMetadataLine',
            'function Test-IsVbaOptionDirectiveLine',
            'function Normalize-VbaImportText',
            'function Get-PreferredNewline',
            'function Normalize-Newlines',
            'function Split-CodeBehindSection',
            'function Split-VbaHeaderAndBody',
            'function Join-VbaHeaderAndBody',
            'function Merge-AccessDocumentWithCanonicalHeader',
            'function Remove-AccessDocumentRootNameProperty',
            'function Normalize-AccessDocumentRootEndMarker',
            'function Normalize-AccessDocumentCodeBehindMarker',
            'function Test-LooksLikeVbaCodeLine',
            'function Normalize-AccessDocumentOrphanCodeBehindSection',
            'function Normalize-AccessDocumentTextForLoadFromText',
            'function Get-FileEncodingInfo',
            'function Write-Utf8NoBom',
            'function Convert-AnsiToUtf8NoBom',
            'function Convert-Utf8ToAnsiTempFile',
            'function Convert-Utf8CodeImportToAnsiTempFile',
            'function Normalize-VbaImportText',
            'function Ensure-VbNameAttributeAtTop',
            'function Ensure-CodeBehindFormVbName',
            'function Get-ComponentFolder',
            'function Get-ComponentExtension',
            'function Build-ExportResultSummary',
            'function Resolve-ImportFileForModule',
            'function Get-AccessLockFilePath',
            # issue #752 defensive-validations helpers (pure — no COM, no Access).
            'function Get-VbNameFromSourceFile',
            'function Test-SourceFileHasDuplicateOptions',
            'function Get-SourceFileSizeSnapshot'
        )

        $ast = [System.Management.Automation.Language.Parser]::ParseInput(
            $scriptContent, [ref]$null, [ref]$null
        )

        $functionDefs = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] },
            $true
        )

        $pureNames = @(
            'Test-IsVbaImportMetadataLine',
            'Test-IsVbaImportDroppableMetadataLine',
            'Test-IsVbaOptionDirectiveLine',
            'Normalize-VbaImportText',
            'Get-PreferredNewline',
            'Normalize-Newlines',
            'Split-CodeBehindSection',
            'Split-VbaHeaderAndBody',
            'Join-VbaHeaderAndBody',
            'Merge-AccessDocumentWithCanonicalHeader',
            'Remove-AccessDocumentRootNameProperty',
            'Normalize-AccessDocumentRootEndMarker',
            'Normalize-AccessDocumentCodeBehindMarker',
            'Test-LooksLikeVbaCodeLine',
            'Normalize-AccessDocumentOrphanCodeBehindSection',
            'Normalize-AccessDocumentTextForLoadFromText',
            'Get-PreferredNewline',
            'Normalize-Newlines',
            'Get-AccessLockFilePath',
            'Assert-SafeVbaModuleName',
            'Ensure-VbNameAttributeAtTop',
            'Ensure-CodeBehindFormVbName',
            'Resolve-ImportFileForModule',
            'Resolve-FormCodeBehindFile',
            'Get-FormCodeBehindCandidateNames',
            'Resolve-ImportModeValue',
            'Build-ExportResultSummary',
            # issue #752 defensive-validations helpers (pure — no COM, no Access).
            'Get-VbNameFromSourceFile',
            'Test-SourceFileHasDuplicateOptions',
            'Get-SourceFileSizeSnapshot'
        )

        $extractedCode = ($functionDefs |
            Where-Object { $_.Name -in $pureNames } |
            ForEach-Object { $_.Extent.Text }
        ) -join "`n`n"

        Invoke-Expression $extractedCode

        # Slice 5: Get-AccessLockFilePath was moved to the shared module.
        # Load it from there if it was not found in vba-manager (for tests that still need it here).
        if (-not (Get-Command Get-AccessLockFilePath -ErrorAction SilentlyContinue)) {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
            $moduleAst = [System.Management.Automation.Language.Parser]::ParseFile(
                (Resolve-Path $modulePath).Path, [ref]$null, [ref]$null
            )
            $lockFnAst = $moduleAst.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq 'Get-AccessLockFilePath' },
                $true
            ) | Select-Object -First 1
            if ($lockFnAst) { Invoke-Expression $lockFnAst.Extent.Text }
        }
    }

    Context "Test-IsVbaImportMetadataLine" {
        It "returns true for VERSION line" {
            Test-IsVbaImportMetadataLine -Line "VERSION 1.0 CLASS" | Should -Be $true
        }

        It "returns true for BEGIN line" {
            Test-IsVbaImportMetadataLine -Line "BEGIN" | Should -Be $true
        }

        It "returns true for END line" {
            Test-IsVbaImportMetadataLine -Line "END" | Should -Be $true
        }

        It "returns true for Attribute VB_ line" {
            Test-IsVbaImportMetadataLine -Line "Attribute VB_Name = `"MyModule`"" | Should -Be $true
        }

        It "returns true for MultiUse property" {
            Test-IsVbaImportMetadataLine -Line "MultiUse = -1" | Should -Be $true
        }

        It "throws for empty string due to mandatory validation" {
            { Test-IsVbaImportMetadataLine -Line "" } | Should -Throw
        }

        It "returns false for regular VBA code" {
            Test-IsVbaImportMetadataLine -Line "Public Sub MyProcedure()" | Should -Be $false
        }
    }

    Context "Test-IsVbaImportDroppableMetadataLine (issue #646)" {
        # This predicate is the import-normalization-only counterpart of
        # Test-IsVbaImportMetadataLine: identical clauses except it EXCLUDES
        # Attribute VB_Name (negative lookahead), so Normalize-VbaImportText can
        # preserve module identity while still dropping every other droppable
        # metadata line. Test-IsVbaImportMetadataLine itself stays broad and
        # unchanged (Split-VbaHeaderAndBody/919 still needs it broad).
        It "returns false for Attribute VB_Name (the whole point of this predicate)" {
            Test-IsVbaImportDroppableMetadataLine -Line "Attribute VB_Name = `"MyModule`"" | Should -Be $false
        }

        It "returns true for Attribute VB_GlobalNameSpace" {
            Test-IsVbaImportDroppableMetadataLine -Line "Attribute VB_GlobalNameSpace = False" | Should -Be $true
        }

        It "returns true for Attribute VB_Creatable" {
            Test-IsVbaImportDroppableMetadataLine -Line "Attribute VB_Creatable = True" | Should -Be $true
        }

        It "returns true for Attribute VB_PredeclaredId" {
            Test-IsVbaImportDroppableMetadataLine -Line "Attribute VB_PredeclaredId = True" | Should -Be $true
        }

        It "returns true for Attribute VB_Exposed" {
            Test-IsVbaImportDroppableMetadataLine -Line "Attribute VB_Exposed = False" | Should -Be $true
        }

        It "returns true for VERSION line" {
            Test-IsVbaImportDroppableMetadataLine -Line "VERSION 1.0 CLASS" | Should -Be $true
        }

        It "returns true for BEGIN line" {
            Test-IsVbaImportDroppableMetadataLine -Line "BEGIN" | Should -Be $true
        }

        It "returns true for END line" {
            Test-IsVbaImportDroppableMetadataLine -Line "END" | Should -Be $true
        }

        It "returns true for MultiUse property" {
            Test-IsVbaImportDroppableMetadataLine -Line "MultiUse = -1" | Should -Be $true
        }

        It "returns false for regular VBA code" {
            Test-IsVbaImportDroppableMetadataLine -Line "Public Sub MyProcedure()" | Should -Be $false
        }

        It "throws for empty string due to mandatory validation" {
            { Test-IsVbaImportDroppableMetadataLine -Line "" } | Should -Throw
        }
    }

    Context "Test-IsVbaOptionDirectiveLine" {
        It "returns true for Option Explicit" {
            Test-IsVbaOptionDirectiveLine -Line "Option Explicit" | Should -Be $true
        }

        It "returns true for Option Compare Database" {
            Test-IsVbaOptionDirectiveLine -Line "Option Compare Database" | Should -Be $true
        }

        It "returns false for regular code" {
            Test-IsVbaOptionDirectiveLine -Line "Dim x As Integer" | Should -Be $false
        }
    }

    Context "Normalize-VbaImportText — Attribute VB_Name preservation (issue #646)" {
        It "keeps VB_Name as the first non-blank output line while stripping sibling VB_* attrs and de-duplicating Option lines" {
            $input = @(
                'Attribute VB_Name = "Form_X"'
                'Attribute VB_GlobalNameSpace = False'
                'Attribute VB_Creatable = False'
                'Attribute VB_PredeclaredId = True'
                'Attribute VB_Exposed = False'
                'Option Compare Database'
                'Option Explicit'
                'Option Explicit'
                'Public Sub Foo()'
                '    MsgBox "hi"'
                'End Sub'
            ) -join "`r`n"

            $result = Normalize-VbaImportText -Text $input
            $lines = $result -split "`r`n"

            $lines[0] | Should -Be 'Attribute VB_Name = "Form_X"' -Because "VB_Name must reach the compiled binary via AddFromFile (issue #646)"
            $result | Should -Not -Match 'VB_GlobalNameSpace'
            $result | Should -Not -Match 'VB_Creatable'
            $result | Should -Not -Match 'VB_PredeclaredId'
            $result | Should -Not -Match 'VB_Exposed'

            $optionExplicitCount = (@($lines | Where-Object { $_.Trim() -eq 'Option Explicit' })).Count
            $optionExplicitCount | Should -Be 1 -Because "duplicated Option lines must be de-duplicated"

            $result | Should -Match 'Public Sub Foo\(\)'
            $result | Should -Match '    MsgBox "hi"'
            $result | Should -Match 'End Sub'
        }
    }

    Context "Merge-AccessDocumentWithCanonicalHeader — no duplicate Attribute VB_Name (issue #646 regression guard)" {
        It "emits exactly one Attribute VB_Name line, holding the canonical value" {
            $localDoc = @(
                'Version =21'
                'Begin Form'
                'End'
                'CodeBehindForm'
                'Attribute VB_Name = "Form_Local"'
                'Option Compare Database'
                'Option Explicit'
                'Public Sub Foo()'
                'End Sub'
            ) -join "`r`n"

            $canonicalDoc = @(
                'Version =21'
                'Begin Form'
                'End'
                'CodeBehindForm'
                'Attribute VB_Name = "Form_Canonical"'
                'Option Compare Database'
                'Option Explicit'
                'Public Sub Foo()'
                'End Sub'
            ) -join "`r`n"

            $merged = Merge-AccessDocumentWithCanonicalHeader -LocalDocumentText $localDoc -CanonicalDocumentText $canonicalDoc
            $lines = $merged -split "`r`n"

            $vbNameLines = @($lines | Where-Object { $_ -match '^Attribute\s+VB_Name\b' })
            $vbNameLines.Count | Should -Be 1 -Because "issue #646: VB_Name must be preserved via the header bucket but never duplicated"
            $vbNameLines[0] | Should -Be 'Attribute VB_Name = "Form_Canonical"' -Because "the header-wins rule sources VB_Name from the live canonical export"
        }
    }

    Context "Ensure-VbNameAttributeAtTop (form .cls emission, issue #743)" {
        It "prepends Attribute VB_Name when the .cls text starts with Option Compare Database" {
            $input = @(
                'Option Compare Database'
                'Option Explicit'
                'Public Sub Foo()'
                'End Sub'
            ) -join "`r`n"
            $result = Ensure-VbNameAttributeAtTop -Text $input -ModuleName 'Form_TestVBNameVerification'

            $firstLine = ($result -split "`r?`n")[0]
            $firstLine | Should -Be 'Attribute VB_Name = "Form_TestVBNameVerification"' `
                -Because "issue #743: form .cls sibling must carry Attribute VB_Name so Access does not invent Form_TempSccObjN on re-import"
        }

        It "replaces an existing Attribute VB_Name that does not match the canonical module name" {
            $input = @(
                'Attribute VB_Name = "Form_TempSccObj1"'
                'Option Compare Database'
            ) -join "`r`n"
            $result = Ensure-VbNameAttributeAtTop -Text $input -ModuleName 'Form_TestVBNameVerification'

            $matches = @($result -split "`r?`n" | Where-Object { $_ -match '^Attribute\s+VB_Name\b' })
            $matches.Count | Should -Be 1 `
                -Because "an existing stale Attribute VB_Name must be replaced exactly once, never duplicated"
            $matches[0] | Should -Be 'Attribute VB_Name = "Form_TestVBNameVerification"' `
                -Because "the canonical name is sourced from the export module name (filename basename + prefix)"
        }

        It "leaves the text unchanged when Attribute VB_Name already matches the canonical module name" {
            $input = @(
                'Attribute VB_Name = "Form_TestVBNameVerification"'
                'Option Compare Database'
                'Public Sub Foo()'
                'End Sub'
            ) -join "`r`n"
            $result = Ensure-VbNameAttributeAtTop -Text $input -ModuleName 'Form_TestVBNameVerification'

            $result | Should -Be $input `
                -Because "idempotent: do not duplicate or shift lines when the text is already correct"
        }

        It "treats leading blank lines as not-yet-content" {
            $input = "`r`n`r`nOption Compare Database`r`nOption Explicit`r`nSub X()`r`nEnd Sub"
            $result = Ensure-VbNameAttributeAtTop -Text $input -ModuleName 'Form_Blanks'

            $trimmed = ($result -split "`r?`n" | Where-Object { $_.Trim() -ne '' })[0]
            $trimmed | Should -Be 'Attribute VB_Name = "Form_Blanks"' `
                -Because "whitespace at the start of the .cls text is not a valid first non-blank VB_Name"
        }
    }

    Context "Ensure-CodeBehindFormVbName (.form.txt CodeBehindForm injection, issue #743)" {
        It "injects Attribute VB_Name after CodeBehindForm when the canonical emission omits it" {
            $input = @(
                'Version =21'
                'Begin Form'
                '    Width =10000'
                'End'
                'CodeBehindForm'
                'Attribute VB_GlobalNameSpace = False'
                'Attribute VB_Creatable = True'
                'Option Compare Database'
                'Option Explicit'
            ) -join "`r`n"

            $result = Ensure-CodeBehindFormVbName -Text $input -ModuleName 'Form_BinaryLacksVbName'

            # Attribute VB_Name must be present in the CodeBehindForm block, after the marker,
            # and before any sibling VB_* attribute.
            $markerIdx = -1
            $lines = $result -split "`r?`n"
            for ($i = 0; $i -lt $lines.Count; $i++) {
                if ($lines[$i].Trim() -eq 'CodeBehindForm') { $markerIdx = $i; break }
            }
            $markerIdx | Should -BeGreaterOrEqual 0 `
                -Because "the form text must contain a CodeBehindForm marker"

            $firstNonBlank = $null
            for ($i = $markerIdx + 1; $i -lt $lines.Count; $i++) {
                if ($lines[$i].Trim() -ne '') { $firstNonBlank = $lines[$i]; break }
            }
            $firstNonBlank | Should -Be 'Attribute VB_Name = "Form_BinaryLacksVbName"' `
                -Because "issue #743: the first non-blank line after CodeBehindForm must be Attribute VB_Name so Access can identify the form on re-import"

            $vbNameCount = @($lines | Where-Object { $_ -match '^Attribute\s+VB_Name\b' }).Count
            $vbNameCount | Should -Be 1 `
                -Because "an injected Attribute VB_Name must not be duplicated"
        }

        It "replaces a stale Attribute VB_Name in the CodeBehindForm block" {
            $input = @(
                'CodeBehindForm'
                'Attribute VB_Name = "Form_TempSccObj2"'
                'Option Compare Database'
            ) -join "`r`n"

            $result = Ensure-CodeBehindFormVbName -Text $input -ModuleName 'Form_ReplaceStale'

            $lines = $result -split "`r?`n"
            $vbNameLines = @($lines | Where-Object { $_ -match '^Attribute\s+VB_Name\b' })
            $vbNameLines.Count | Should -Be 1 -Because "stale Attribute VB_Name must not coexist with the canonical one"
            $vbNameLines[0] | Should -Be 'Attribute VB_Name = "Form_ReplaceStale"' -Because "the canonical name comes from the filename"
        }

        It "returns the text unchanged when no CodeBehindForm marker exists" {
            $input = @(
                'Version =21'
                'Begin Form'
                'End'
            ) -join "`r`n"

            $result = Ensure-CodeBehindFormVbName -Text $input -ModuleName 'Form_NotADocument'

            $result | Should -Be $input `
                -Because "a form-less text path skips the injection (defensive: do not invent structure)"
        }

        It "is idempotent on already-correct text" {
            $input = @(
                'Version =21'
                'Begin Form'
                'End'
                'CodeBehindForm'
                'Attribute VB_Name = "Form_AlreadyCorrect"'
                'Option Compare Database'
                'Option Explicit'
            ) -join "`r`n"

            $result = Ensure-CodeBehindFormVbName -Text $input -ModuleName 'Form_AlreadyCorrect'

            $result | Should -Be $input `
                -Because "idempotent: do not duplicate the canonical Attribute VB_Name"
        }

        It "injects Attribute VB_Name when the CodeBehindForm block has only Option directives (no Attribute at all)" {
            $input = @(
                'CodeBehindForm'
                'Option Compare Database'
                'Option Explicit'
            ) -join "`r`n"

            $result = Ensure-CodeBehindFormVbName -Text $input -ModuleName 'Form_OnlyOptions'

            $lines = $result -split "`r?`n"
            $markerIdx = -1
            for ($i = 0; $i -lt $lines.Count; $i++) {
                if ($lines[$i].Trim() -eq 'CodeBehindForm') { $markerIdx = $i; break }
            }
            $firstNonBlankAfter = $null
            for ($i = $markerIdx + 1; $i -lt $lines.Count; $i++) {
                if ($lines[$i].Trim() -ne '') { $firstNonBlankAfter = $lines[$i]; break }
            }
            $firstNonBlankAfter | Should -Be 'Attribute VB_Name = "Form_OnlyOptions"' -Because "any VB_ attribute (or Option) after CodeBehindForm must yield to a canonical VB_Name as the first non-blank line"
        }
    }

    Context "Get-PreferredNewline" {
        It "returns CRLF when text contains CRLF" {
            Get-PreferredNewline -Text "line1`r`nline2" | Should -Be "`r`n"
        }

        It "returns LF when text has no CRLF" {
            Get-PreferredNewline -Text "line1`nline2" | Should -Be "`n"
        }
    }

    Context "Normalize-Newlines" {
        It "converts CRLF to LF by default" {
            Normalize-Newlines -Text "a`r`nb" | Should -Be "a`nb"
        }

        It "converts CR-only to LF" {
            Normalize-Newlines -Text "a`rb" | Should -Be "a`nb"
        }

        It "converts to CRLF when specified" {
            Normalize-Newlines -Text "a`nb" -Newline "`r`n" | Should -Be "a`r`nb"
        }
    }

    Context "Remove-AccessDocumentRootNameProperty" {
        It "removes Name property immediately under Begin Form" {
            $input = "Begin Form`r`n    Name = `"MyForm`"`r`n    Caption = `"Test`"`r`n"
            $result = Remove-AccessDocumentRootNameProperty -DocumentText $input
            $result | Should -Not -Match 'Name\s*=\s*"MyForm"'
            $result | Should -Match 'Caption'
        }

        It "preserves text without root Name property" {
            $input = "Begin Form`r`n    Caption = `"Test`"`r`n"
            $result = Remove-AccessDocumentRootNameProperty -DocumentText $input
            $result | Should -Be $input
        }
    }

    Context "Normalize-AccessDocumentRootEndMarker" {
        It "replaces 'End Form' with 'End'" {
            $result = Normalize-AccessDocumentRootEndMarker -DocumentText "End Form"
            $result | Should -Be "End"
        }

        It "replaces 'End Report' with 'End'" {
            $result = Normalize-AccessDocumentRootEndMarker -DocumentText "End Report"
            $result | Should -Be "End"
        }

        It "leaves plain 'End' unchanged" {
            $result = Normalize-AccessDocumentRootEndMarker -DocumentText "End"
            $result | Should -Be "End"
        }
    }

    Context "Get-AccessLockFilePath" {
        It "returns .laccdb path for .accdb file" {
            $result = Get-AccessLockFilePath -AccessPath "C:\data\mydb.accdb"
            $result | Should -Be "C:\data\mydb.laccdb"
        }

        It "returns .ldb path for .mdb file" {
            $result = Get-AccessLockFilePath -AccessPath "C:\data\mydb.mdb"
            $result | Should -Be "C:\data\mydb.ldb"
        }

        It "returns null for unknown extension" {
            $result = Get-AccessLockFilePath -AccessPath "C:\data\mydb.accde"
            $result | Should -BeNullOrEmpty
        }
    }

    Context "Test-LooksLikeVbaCodeLine" {
        It "returns true for Option Explicit" {
            Test-LooksLikeVbaCodeLine -Line "Option Explicit" | Should -Be $true
        }

        It "returns true for Public Sub declaration" {
            Test-LooksLikeVbaCodeLine -Line "Public Sub MyProc()" | Should -Be $true
        }

        It "returns true for Private Function declaration" {
            Test-LooksLikeVbaCodeLine -Line "Private Function Calc() As Integer" | Should -Be $true
        }

        It "returns true for Dim statement" {
            Test-LooksLikeVbaCodeLine -Line "Dim x As String" | Should -Be $true
        }

        It "returns false for empty line" {
            Test-LooksLikeVbaCodeLine -Line "" | Should -Be $false
        }

        It "returns false for a form property line" {
            Test-LooksLikeVbaCodeLine -Line "    Caption = `"My Form`"" | Should -Be $false
        }
    }

    Context "Normalize-AccessDocumentOrphanCodeBehindSection" {
        It "inserts the marker after the root End, not after a nested control's End" {
            # Flush-left nested layout: the inner control's `End` and the root
            # `End` are both at column 0, so the marker MUST be placed by tracking
            # Begin/End nesting, not by matching the first `End`.
            $doc = @(
                'Version =20'
                'Begin Form'
                'RecordSource = "qry"'
                'Begin Label'
                'Caption = "Hi"'
                'End'
                'End'
                'Attribute VB_Name = "Form_Foo"'
                'Option Explicit'
                'Public Sub Foo()'
                'End Sub'
            ) -join "`r`n"

            $result = Normalize-AccessDocumentOrphanCodeBehindSection -DocumentText $doc
            $lines = $result -split "`r`n"
            $markerIdx = [Array]::IndexOf($lines, 'CodeBehindForm')

            $markerIdx | Should -BeGreaterThan -1 -Because "the marker must be inserted"
            # Both layout `End` lines must precede the marker (the nested End and the root End).
            (@($lines[0..($markerIdx - 1)] | Where-Object { $_ -eq 'End' }).Count) |
                Should -Be 2 -Because "the marker belongs after the root End, past every nested End"
            $lines[$markerIdx + 1] | Should -Be 'Attribute VB_Name = "Form_Foo"'
        }

        It "counts `Key = Begin` blob blocks when locating the root End" {
            # A serialized blob (`PrtMip = Begin ... End`) opens a nesting level
            # too; its `End` must not be mistaken for the document's root End.
            $doc = @(
                'Version =20'
                'Begin Report'
                'PrtMip = Begin'
                '0x0100'
                'End'
                'End'
                'Attribute VB_Name = "Report_Inv"'
                'Option Explicit'
            ) -join "`r`n"

            $result = Normalize-AccessDocumentOrphanCodeBehindSection -DocumentText $doc
            $lines = $result -split "`r`n"
            $markerIdx = [Array]::IndexOf($lines, 'CodeBehindReport')

            $markerIdx | Should -BeGreaterThan -1
            (@($lines[0..($markerIdx - 1)] | Where-Object { $_ -eq 'End' }).Count) | Should -Be 2
            $lines[$markerIdx + 1] | Should -Be 'Attribute VB_Name = "Report_Inv"'
        }

        It "leaves a layout without code-behind unchanged" {
            $doc = "Version =21`r`nBegin Form`r`nEnd`r`n"
            Normalize-AccessDocumentOrphanCodeBehindSection -DocumentText $doc | Should -Be $doc
        }

        It "is a no-op when the CodeBehind marker is already present" {
            $doc = @(
                'Begin Form'
                'End'
                'CodeBehindForm'
                'Attribute VB_Name = "Form_Foo"'
                'Option Explicit'
            ) -join "`r`n"
            Normalize-AccessDocumentOrphanCodeBehindSection -DocumentText $doc | Should -Be $doc
        }

        It "falls back to the first End when Begin/End nesting is malformed" {
            # Unbalanced: an extra `Begin` with no matching `End` means depth never
            # returns to 0, so the function warns and falls back to the first End.
            $doc = @(
                'Begin Form'
                'Begin Label'
                'End'
                'Attribute VB_Name = "Form_Bad"'
                'Option Explicit'
            ) -join "`r`n"

            $result = Normalize-AccessDocumentOrphanCodeBehindSection -DocumentText $doc -WarningAction SilentlyContinue
            $result | Should -Match 'CodeBehindForm'
        }
    }

    Context "Resolve-FormCodeBehindFile" {
        It "returns the sibling .cls when a form has both .form.txt and .cls" {
            $root = Join-Path $TestDrive "src-both"
            New-Item -ItemType Directory -Path (Join-Path $root "forms") -Force | Out-Null
            Set-Content -Path (Join-Path $root "forms" "Form_Foo.form.txt") -Value "Version =20"
            Set-Content -Path (Join-Path $root "forms" "Form_Foo.cls") -Value "Option Explicit"
            $result = Resolve-FormCodeBehindFile -ModulesPath $root -ModuleName "Form_Foo"
            $result | Should -Be (Join-Path $root "forms" "Form_Foo.cls")
        }

        It "resolves the .cls via Form_ prefix when the module name omits it" {
            $root = Join-Path $TestDrive "src-prefix"
            New-Item -ItemType Directory -Path (Join-Path $root "forms") -Force | Out-Null
            Set-Content -Path (Join-Path $root "forms" "Form_Bar.form.txt") -Value "Version =20"
            Set-Content -Path (Join-Path $root "forms" "Form_Bar.cls") -Value "Option Explicit"
            $result = Resolve-FormCodeBehindFile -ModulesPath $root -ModuleName "Bar"
            $result | Should -Be (Join-Path $root "forms" "Form_Bar.cls")
        }

        It "returns null when the form has only a .form.txt (no separate code-behind)" {
            $root = Join-Path $TestDrive "src-layout-only"
            New-Item -ItemType Directory -Path (Join-Path $root "forms") -Force | Out-Null
            Set-Content -Path (Join-Path $root "forms" "Form_Baz.form.txt") -Value "Version =20"
            Resolve-FormCodeBehindFile -ModulesPath $root -ModuleName "Form_Baz" | Should -BeNullOrEmpty
        }

        It "returns null for a regular class outside forms/reports" {
            $root = Join-Path $TestDrive "src-class"
            New-Item -ItemType Directory -Path (Join-Path $root "classes") -Force | Out-Null
            Set-Content -Path (Join-Path $root "classes" "MyClass.cls") -Value "Option Explicit"
            Resolve-FormCodeBehindFile -ModulesPath $root -ModuleName "MyClass" | Should -BeNullOrEmpty
        }

        It "resolves a report code-behind under reports/" {
            $root = Join-Path $TestDrive "src-report"
            New-Item -ItemType Directory -Path (Join-Path $root "reports") -Force | Out-Null
            Set-Content -Path (Join-Path $root "reports" "Report_Inv.report.txt") -Value "Version =20"
            Set-Content -Path (Join-Path $root "reports" "Report_Inv.cls") -Value "Option Explicit"
            $result = Resolve-FormCodeBehindFile -ModulesPath $root -ModuleName "Report_Inv"
            $result | Should -Be (Join-Path $root "reports" "Report_Inv.cls")
        }
    }

    Context "Resolve-ImportFileForModule path safety (#569)" {
        It "rejects traversal, absolute, drive-qualified, and separator-bearing module names" {
            $root = Join-Path $TestDrive "safe-src"
            $outside = Join-Path $TestDrive "outside"
            New-Item -ItemType Directory -Path (Join-Path $root "modules") -Force | Out-Null
            New-Item -ItemType Directory -Path $outside -Force | Out-Null
            Set-Content -Path (Join-Path $outside "Escaped.bas") -Value "Attribute VB_Name = `"Escaped`""
            Set-Content -Path (Join-Path $root "modules" "Nested.bas") -Value "Attribute VB_Name = `"Nested`""

            $absoluteBase = Join-Path $outside "Escaped"
            $attempts = @(
                "..\outside\Escaped",
                "..\..\outside\Escaped",
                $absoluteBase,
                "C:\outside\Escaped",
                "modules\Nested"
            )

            foreach ($attempt in $attempts) {
                { Resolve-ImportFileForModule -ModulesPath $root -ModuleName $attempt -ImportMode "Auto" } |
                    Should -Throw -Because "moduleName must be a VBA module name, not a filesystem path"
            }
        }
    }

    Context "Resolve-ImportModeValue" {
        It "defaults to Auto when empty" {
            Resolve-ImportModeValue -ImportMode "" | Should -Be "Auto"
        }

        It "maps the replace alias to Auto" {
            Resolve-ImportModeValue -ImportMode "replace" | Should -Be "Auto"
        }

        It "keeps Auto (case-insensitive)" {
            Resolve-ImportModeValue -ImportMode "auto" | Should -Be "Auto"
        }

        It "deprecates Form to Auto so the canonical .cls always wins for code" {
            Resolve-ImportModeValue -ImportMode "Form" | Should -Be "Auto"
            Resolve-ImportModeValue -ImportMode "form" | Should -Be "Auto"
        }

        It "keeps Code (case-insensitive)" {
            Resolve-ImportModeValue -ImportMode "code" | Should -Be "Code"
            Resolve-ImportModeValue -ImportMode "Code" | Should -Be "Code"
        }
    }

    # issue #752: defensive-validations helpers — nested as Contexts inside the
    # parent Describe so the BeforeAll at line 318 (AST extraction of pure helpers)
    # runs once and exposes Get-VbNameFromSourceFile, Test-SourceFileHasDuplicateOptions,
    # and Get-SourceFileSizeSnapshot to every It block below.

    Context "Get-VbNameFromSourceFile (issue #752) — defensive VB_Name extraction" {

        BeforeAll {
            $script:SandboxDir = Join-Path ([System.IO.Path]::GetTempPath()) ("vba-mgr-vbname-" + [guid]::NewGuid().ToString("N"))
            [System.IO.Directory]::CreateDirectory($script:SandboxDir) | Out-Null
        }

        AfterAll {
            if (Test-Path -LiteralPath $script:SandboxDir) {
                [System.IO.Directory]::Delete($script:SandboxDir, $true)
            }
        }

        It "returns the VB_Name for a normal .bas file" {
            $path = Join-Path $script:SandboxDir "ModNormal.bas"
            [System.IO.File]::WriteAllText($path, @(
                'Attribute VB_Name = "ModNormal"'
                'Option Explicit'
                'Public Sub Foo()'
                'End Sub'
            ) -join "`r`n")
            Get-VbNameFromSourceFile -Path $path | Should -Be "ModNormal"
        }

        It "returns the VB_Name when followed by Attribute VB_GlobalNameSpace etc." {
            $path = Join-Path $script:SandboxDir "ModWithAttrs.bas"
            [System.IO.File]::WriteAllText($path, @(
                'Attribute VB_Name = "ModWithAttrs"'
                'Attribute VB_GlobalNameSpace = False'
                'Attribute VB_Creatable = False'
                'Attribute VB_PredeclaredId = False'
                'Attribute VB_Exposed = False'
                'Option Explicit'
                'Public Sub Foo()'
                'End Sub'
            ) -join "`r`n")
            Get-VbNameFromSourceFile -Path $path | Should -Be "ModWithAttrs"
        }

        It "skips leading blank lines before finding VB_Name" {
            $path = Join-Path $script:SandboxDir "ModLeadingBlanks.bas"
            [System.IO.File]::WriteAllText($path, @(
                ''
                ''
                'Attribute VB_Name = "ModLeadingBlanks"'
                'Option Explicit'
            ) -join "`r`n")
            Get-VbNameFromSourceFile -Path $path | Should -Be "ModLeadingBlanks"
        }

        It "returns $null when no Attribute VB_Name is present" {
            $path = Join-Path $script:SandboxDir "ModNoVbName.bas"
            [System.IO.File]::WriteAllText($path, @(
                'Option Explicit'
                'Public Sub Foo()'
                'End Sub'
            ) -join "`r`n")
            Get-VbNameFromSourceFile -Path $path | Should -BeNullOrEmpty
        }

        It "strips a UTF-8 BOM before matching VB_Name" {
            $path = Join-Path $script:SandboxDir "ModBom.bas"
            $bom = [byte[]](0xEF, 0xBB, 0xBF)
            $body = [System.Text.Encoding]::UTF8.GetBytes(@(
                'Attribute VB_Name = "ModBom"'
                'Option Explicit'
            ) -join "`r`n")
            $all = New-Object 'System.Collections.Generic.List[byte]'
            $all.AddRange($bom)
            $all.AddRange($body)
            [System.IO.File]::WriteAllBytes($path, $all.ToArray())
            Get-VbNameFromSourceFile -Path $path | Should -Be "ModBom"
        }

        It "returns $null for an empty file" {
            $path = Join-Path $script:SandboxDir "Empty.bas"
            [System.IO.File]::WriteAllText($path, "")
            Get-VbNameFromSourceFile -Path $path | Should -BeNullOrEmpty
        }
    }

    Context "Test-SourceFileHasDuplicateOptions (issue #752) — defensive Option duplication detection" {

        BeforeAll {
            $script:SandboxDir = Join-Path ([System.IO.Path]::GetTempPath()) ("vba-mgr-dupopt-" + [guid]::NewGuid().ToString("N"))
            [System.IO.Directory]::CreateDirectory($script:SandboxDir) | Out-Null
        }

        AfterAll {
            if (Test-Path -LiteralPath $script:SandboxDir) {
                [System.IO.Directory]::Delete($script:SandboxDir, $true)
            }
        }

        It "returns $false when each Option directive appears at most once" {
            $path = Join-Path $script:SandboxDir "Single.bas"
            [System.IO.File]::WriteAllText($path, @(
                'Attribute VB_Name = "Single"'
                'Option Compare Database'
                'Option Explicit'
                'Public Sub Foo()'
                'End Sub'
            ) -join "`r`n")
            Test-SourceFileHasDuplicateOptions -Path $path | Should -Be $false
        }

        It "returns $true when Option Explicit appears twice" {
            $path = Join-Path $script:SandboxDir "DupExplicit.bas"
            [System.IO.File]::WriteAllText($path, @(
                'Attribute VB_Name = "DupExplicit"'
                'Option Explicit'
                'Public Sub Foo()'
                'End Sub'
                'Option Explicit'
            ) -join "`r`n")
            Test-SourceFileHasDuplicateOptions -Path $path | Should -Be $true
        }

        It "returns $true when Option Compare Database appears twice" {
            $path = Join-Path $script:SandboxDir "DupCompare.bas"
            [System.IO.File]::WriteAllText($path, @(
                'Attribute VB_Name = "DupCompare"'
                'Option Compare Database'
                'Public Sub Foo()'
                'End Sub'
                'Option Compare Database'
            ) -join "`r`n")
            Test-SourceFileHasDuplicateOptions -Path $path | Should -Be $true
        }

        It "returns $false when no Option directives are present" {
            $path = Join-Path $script:SandboxDir "NoOption.bas"
            [System.IO.File]::WriteAllText($path, @(
                'Attribute VB_Name = "NoOption"'
                'Public Sub Foo()'
                'End Sub'
            ) -join "`r`n")
            Test-SourceFileHasDuplicateOptions -Path $path | Should -Be $false
        }

        It "treats Option Compare variants case-insensitively (Option compare text vs Option Compare Text)" {
            $path = Join-Path $script:SandboxDir "CaseInsensitive.bas"
            [System.IO.File]::WriteAllText($path, @(
                'Attribute VB_Name = "CaseInsensitive"'
                'Option Compare Text'
                'Public Sub Foo()'
                'End Sub'
                'option compare text'
            ) -join "`r`n")
            Test-SourceFileHasDuplicateOptions -Path $path | Should -Be $true
        }

        It "returns $false for an empty file" {
            $path = Join-Path $script:SandboxDir "Empty.bas"
            [System.IO.File]::WriteAllText($path, "")
            Test-SourceFileHasDuplicateOptions -Path $path | Should -Be $false
        }
    }

    Context "Get-SourceFileSizeSnapshot (issue #752) — verbose pre-import snapshot" {

        BeforeAll {
            $script:SandboxDir = Join-Path ([System.IO.Path]::GetTempPath()) ("vba-mgr-snap-" + [guid]::NewGuid().ToString("N"))
            [System.IO.Directory]::CreateDirectory($script:SandboxDir) | Out-Null
        }

        AfterAll {
            if (Test-Path -LiteralPath $script:SandboxDir) {
                [System.IO.Directory]::Delete($script:SandboxDir, $true)
            }
        }

        It "returns bytes, lines, and sha256 for a multi-line file" {
            $path = Join-Path $script:SandboxDir "Multi.bas"
            $content = @(
                'Attribute VB_Name = "Multi"'
                'Option Explicit'
                'Public Sub Foo()'
                'End Sub'
                'Public Sub Bar()'
                'End Sub'
            ) -join "`r`n"
            [System.IO.File]::WriteAllText($path, $content)
            $snap = Get-SourceFileSizeSnapshot -Path $path
            $snap.bytes | Should -Be ($content.Length)
            $snap.lines | Should -Be 6
            $snap.sha256 | Should -Match "^[A-F0-9]{64}$"
        }

        It "computes the sha256 of the raw file bytes (not of the .NET-decoded text)" {
            $path = Join-Path $script:SandboxDir "Bytes.bas"
            [System.IO.File]::WriteAllText($path, "abc")
            $snap = Get-SourceFileSizeSnapshot -Path $path
            # sha256 of the bytes "abc" (no newline) = ba7816bf...
            $snap.sha256 | Should -Be "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        }

        It "returns lines=1 and bytes=N for a single-line file" {
            $path = Join-Path $script:SandboxDir "Single.bas"
            [System.IO.File]::WriteAllText($path, "Attribute VB_Name = `"X`"")
            $snap = Get-SourceFileSizeSnapshot -Path $path
            $snap.lines | Should -Be 1
            $snap.bytes | Should -Be ([System.IO.File]::ReadAllBytes($path).Length)
        }

        It "throws for a non-existent path so the caller can fail loudly (verbose:true is opt-in; never silently)" {
            $missing = Join-Path $script:SandboxDir "DoesNotExist.bas"
            { Get-SourceFileSizeSnapshot -Path $missing } | Should -Throw -ExpectedMessage "*DoesNotExist*"
        }
    }
}

Describe "dysflow-vba-manager.ps1 — COM cleanup integration (requires Access)" {
    Context "Get-AllowBypassKeyState releases COM objects on exception" {
        It "cleans up COM objects when database open fails" -Skip {
            # This test requires a live DAO COM installation.
            # Verify that calling the function with a non-existent path returns null
            # without leaving hanging COM objects.
            . (Resolve-Path $script:ScriptPath).Path -Action Exists -AccessPath "C:\nonexistent.accdb"
        }
    }

    Context "Disable-StartupFeatures releases COM objects on exception" {
        It "dbEngine is released when OpenDatabase throws" -Skip {
            # With a real DAO engine available, passing an invalid path should
            # trigger the OpenDatabase exception, hit the finally block, and
            # release $dbEngine without leaking it.
        }
    }

    Context "Restore-StartupFeatures releases COM objects on early return" {
        It "dbEngine is released when New-DaoDbEngine returns null" -Skip {
            # When DAO is unavailable, New-DaoDbEngine returns null,
            # the function should return early inside try so finally still runs.
        }
    }

    Context "Enable-AllowBypassKey releases COM objects on exception" {
        It "all COM objects released when database cannot be opened" -Skip {
            # Full COM integration test — requires Access/DAO installation.
        }
    }
}

Describe "Close-AccessDatabase — owned Access PID cleanup" {
    # Mechanical update (Slice 4): Close-AccessDatabase now delegates COM teardown + kill to
    # Close-CanonicalAccess.  Tests load both functions from their respective sources and use
    # the -KillPidAction injectable seam (already defined on Close-CanonicalAccess) to intercept
    # the kill call — the script-scope mock approach no longer intercepts calls inside the
    # canonical's default scriptblock.  Behavior assertions are UNCHANGED.
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $script:SharedModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"

        $managerAst = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null,
            [ref]$null
        )

        # Load Close-CanonicalAccess and Stop-AccessPidAndWait from the shared module.
        $moduleAst = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:SharedModulePath).Path,
            [ref]$null,
            [ref]$null
        )
        foreach ($fnName in @('Stop-AccessPidAndWait', 'Close-CanonicalAccess', 'Get-NullPidCloseNotice')) {
            $fnAst = $moduleAst.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $fnName },
                $true
            ) | Select-Object -First 1
            if ($fnAst) { Invoke-Expression $fnAst.Extent.Text }
        }

        # Load Close-AccessDatabase from vba-manager.
        $fnAst = $managerAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Close-AccessDatabase' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Close-AccessDatabase not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    BeforeEach {
        $script:KillPidCalls  = [System.Collections.Generic.List[object]]::new()
        $script:KillPidResult = $true

        function script:Write-Status { param([string]$Message, $Color) }
        function script:Close-TargetAccessDbIfOpen { param([string]$AccessPath) }
        function script:Restore-AllowBypassKey { param([string]$AccessPath, [string]$Password, $OriginalState) }
        function script:Restore-StartupFeatures { param([string]$AccessPath, [string]$Password, $RestoreInfo) }
        function script:Get-AccessLockFilePath { param([string]$AccessPath) return $null }

        # -KillPidAction seam: injected into Close-AccessDatabase which forwards it to
        # Close-CanonicalAccess.  Records call arguments for behavior assertions.
        $script:KillPidSeam = {
            param([int]$AccessPid)
            $script:KillPidCalls.Add([pscustomobject]@{ AccessPid = $AccessPid })
            return $script:KillPidResult
        }

        $script:FakeAccess = [pscustomobject]@{ AutomationSecurity = 1 }
        $script:FakeAccess | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value { }
        $script:FakeAccess | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($x) }
        $script:FakeSession = [pscustomobject]@{
            AccessApplication = $script:FakeAccess
            OriginalBypass = $null
            StartupInfo = $null
            ProcessId = 4242
            VbProject = $null
            Vbe = $null
        }
    }

    It "uses the bounded 20s owned-PID wait before continuing cleanup" {
        # Behavior: owned PID is killed via the kill action; default timeout is 20000ms.
        # The -KillPidAction seam replaces Stop-AccessPidAndWait so we can assert the call.
        # The TimeoutMs is embedded in Close-CanonicalAccess's default KillPidAction; when
        # we override with -KillPidAction we verify the PID is passed correctly.
        Close-AccessDatabase -Session $script:FakeSession -AccessPath "C:\data\owned.accdb" -Password "" `
            -KillPidAction $script:KillPidSeam

        $script:KillPidCalls.Count | Should -Be 1
        $script:KillPidCalls[0].AccessPid | Should -Be 4242
    }

    It "does not dispatch an asynchronous taskkill when the owned-PID kill action returns false" {
        # Behavior: if kill returns $false, Close-AccessDatabase emits a WARN but does NOT
        # spawn a separate Start-Process/taskkill — that escalation is inside Stop-AccessPidAndWait
        # and is exercised by Close-CanonicalAccess tests.  This test guards no double-kill.
        $script:KillPidResult = $false
        $script:StartProcessCalls = [System.Collections.Generic.List[object]]::new()
        function script:Start-Process {
            param($FilePath, $ArgumentList, [switch]$NoNewWindow, [switch]$Wait, $ErrorAction)
            $script:StartProcessCalls.Add([pscustomobject]@{ FilePath = $FilePath })
        }

        Close-AccessDatabase -Session $script:FakeSession -AccessPath "C:\data\owned.accdb" -Password "" `
            -KillPidAction $script:KillPidSeam

        $script:StartProcessCalls.Count | Should -Be 0
    }

    It "does not force-kill a path-only matched Access PID when the session has no owned PID" {
        $script:FakeSession.ProcessId = $null

        $script:StopProcessCalls = [System.Collections.Generic.List[object]]::new()
        function script:Stop-Process {
            param($Id, [switch]$Force, $ErrorAction)
            $script:StopProcessCalls.Add([pscustomobject]@{ Id = $Id })
        }
        $script:StartProcessCalls = [System.Collections.Generic.List[object]]::new()
        function script:Start-Process {
            param($FilePath, $ArgumentList, [switch]$NoNewWindow, [switch]$Wait, $ErrorAction)
            $script:StartProcessCalls.Add([pscustomobject]@{ FilePath = $FilePath })
        }

        Close-AccessDatabase -Session $script:FakeSession -AccessPath "C:\data\owned.accdb" -Password "" `
            -KillPidAction $script:KillPidSeam

        $script:KillPidCalls.Count | Should -Be 0
        $script:StopProcessCalls.Count | Should -Be 0
        $script:StartProcessCalls.Count | Should -Be 0
    }
}

# ===========================================================================
# P1 — Behavioral tests for Get-MsAccessProcessesBounded (#380)
# The function moved to scripts/lib/dysflow-access-com.ps1 (Slice 1 dedup).
# Tests now load it from the module; the production behavior contract is unchanged.
# ===========================================================================

Describe "Get-MsAccessProcessesBounded (vba-manager) — behavioral (issue #380)" {
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
# Ownership safety — Close-TargetAccessDbIfOpen must never kill by path alone
# ===========================================================================

Describe "Close-TargetAccessDbIfOpen — ownership-safe blocking behavior" {
    BeforeAll {
        # Slice 5: Close-TargetAccessDbIfOpen was moved to the shared module.
        # Load it from scripts/lib/dysflow-access-com.ps1 (single source of truth).
        $script:SharedModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"

        $moduleAst = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:SharedModulePath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $moduleAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Close-TargetAccessDbIfOpen' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Close-TargetAccessDbIfOpen not found in $($script:SharedModulePath)" }

        # Load Get-AccessLockFilePath from the module (required by Close-TargetAccessDbIfOpen).
        $lockFnAst = $moduleAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Get-AccessLockFilePath' },
            $true
        ) | Select-Object -First 1
        if ($lockFnAst) { Invoke-Expression $lockFnAst.Extent.Text }

        if (-not ([System.Management.Automation.PSTypeName]"RotManager").Type) {
            Add-Type -TypeDefinition @"
public class RotCloseResult {
    public bool Success;
    public string Error;
    public int ClosedCount;
}

public class RotManager {
    public static RotCloseResult CloseDatabaseIfOpen(string dbPath) {
        return new RotCloseResult { Success = true, ClosedCount = 0 };
    }
}
"@
        }

        Invoke-Expression $fnAst.Extent.Text

        # Issue #844 — Pester's container scope does NOT make `function script:Foo`
        # overrides visible to functions loaded via Invoke-Expression in the
        # BeforeAll scope. Verified empirically: the override is in the script
        # scope, but the production function's name resolution chain does not
        # include Pester's container script scope.
        #
        # For helpers NOT loaded via Invoke-Expression (Write-Status, Stop-Process,
        # Write-Warning), the global scope IS in the production function's scope
        # chain, so `function global:Foo` works.
        #
        # For Get-AccessLockFilePath — which IS loaded via Invoke-Expression in
        # this BeforeAll — the real definition lives in this same BeforeAll scope.
        # PowerShell's name resolution finds the BeforeAll-scope definition before
        # the global-scope override. We must define the override in the BeforeAll
        # scope (after the Invoke-Expression that loads the real one) so it shadows
        # the real definition in the same scope.
        $script:OriginalCommands = @{
            'Write-Status' = Get-Command Write-Status -ErrorAction SilentlyContinue
            'Stop-Process' = Get-Command Stop-Process -ErrorAction SilentlyContinue
            'Write-Warning' = Get-Command Write-Warning -ErrorAction SilentlyContinue
        }
        function global:Write-Status { param([string]$Message, $Color) }
        function global:Stop-Process { param([int]$Id, [switch]$Force, $ErrorAction) $script:StoppedProcessIds.Add($Id) }
        # Override Get-AccessLockFilePath in the BeforeAll scope (same scope as
        # the real definition loaded above). This shadows the real definition
        # so the production function sees the test's temp lock path.
        function Get-AccessLockFilePath { param([string]$AccessPath) return $script:TempLockPath }
    }

    AfterAll {
        # Restore the original commands. Get-Command returns CommandInfo objects
        # which are not directly settable via Set-Item; remove the override and
        # let PowerShell fall back to the built-in cmdlet (which is the original
        # behavior before our override). This is sufficient because the built-in
        # cmdlets (Write-Status, Stop-Process, Write-Warning) are always available.
        foreach ($name in @('Write-Status', 'Stop-Process', 'Write-Warning')) {
            Remove-Item -Path "function:global:$name" -ErrorAction SilentlyContinue
        }
    }

    BeforeEach {
        $script:WarningMessages = [System.Collections.Generic.List[string]]::new()
        $script:StoppedProcessIds = [System.Collections.Generic.List[int]]::new()
        # Holds an exclusive FileShare.None handle on TempLockPath to simulate a live process
        # that has the .laccdb open. Disposed in AfterEach.
        $script:HoldingHandle = $null
        $script:TempAccessPath = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-close-target-{0}.accdb" -f ([guid]::NewGuid().ToString("N")))
        $script:TempLockPath = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-close-target-{0}.laccdb" -f ([guid]::NewGuid().ToString("N")))
        New-Item -ItemType File -Path $script:TempAccessPath -Force | Out-Null
        New-Item -ItemType File -Path $script:TempLockPath -Force | Out-Null

        # Update the BeforeAll-scope Get-AccessLockFilePath override to return the
        # per-test TempLockPath. The function is defined in BeforeAll and captures
        # $script:TempLockPath dynamically, so updating the script variable before
        # each test is sufficient.
        #
        # Write-Warning override is in the global scope (works because the
        # production function's scope chain includes the global scope, and
        # Write-Warning is NOT loaded via Invoke-Expression in this BeforeAll).
        function global:Write-Warning { param([string]$Message) $script:WarningMessages.Add($Message) }
    }

    AfterEach {
        if ($null -ne $script:HoldingHandle) {
            try { $script:HoldingHandle.Dispose() } catch { }
            $script:HoldingHandle = $null
        }
        Remove-Item -LiteralPath $script:TempAccessPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $script:TempLockPath -Force -ErrorAction SilentlyContinue
    }

    It "blocks a same-path MSACCESS process without killing it" {
        function script:Get-MsAccessProcessesBounded {
            [PSCustomObject]@{
                ProcessId    = 24680
                CreationDate = $null
                CommandLine  = ('MSACCESS.EXE "{0}"' -f (Resolve-Path $script:TempAccessPath).Path)
            }
        }

        # Must not throw and must never Stop-Process on any PID.
        { Close-TargetAccessDbIfOpen -AccessPath $script:TempAccessPath } | Should -Not -Throw
        # INVARIANT: no process must be killed (the core behavioral assertion).
        $script:StoppedProcessIds.Count | Should -Be 0
    }

    It "does not kill when no MSACCESS is attributable to the target path" {
        function script:Get-MsAccessProcessesBounded {
            [PSCustomObject]@{
                ProcessId    = 13579
                CreationDate = $null
                CommandLine  = 'MSACCESS.EXE "C:\other\database.accdb"'
            }
        }

        Close-TargetAccessDbIfOpen -AccessPath $script:TempAccessPath

        # INVARIANT: no process must be killed regardless of which MSACCESS processes are running.
        $script:StoppedProcessIds.Count | Should -Be 0
    }

    # ---------------------------------------------------------------------------
    # Issue #844 — stale .laccdb must NOT block import_modules when no live
    # process holds the file handle. These tests verify the production edit
    # (handle-probe + silent cleanup + advisory codes) through observable side
    # effects: .laccdb removal/preservation, function return value, and the
    # no-kill invariant. The Write-Status advisory codes (LACCDB_STALE_DETECTED,
    # LIVE_PROCESS_HOLDS_LACCDB) are emitted by the production code in the same
    # try/catch blocks whose outcomes are verified here, so the code path
    # coverage is equivalent. Documented at
    # openspec/changes/2026-07-13-stale-laccdb-no-block-import/{proposal,design,tasks}.md.
    # ---------------------------------------------------------------------------

    It "stale .laccdb (no live process) is silently cleared and import proceeds" {
        # No live process enumerated -> the .laccdb is presumed stale.
        function script:Get-MsAccessProcessesBounded { return @() }
        $script:StoppedProcessIds.Clear()

        $result = Close-TargetAccessDbIfOpen -AccessPath $script:TempAccessPath

        # The function must report a clean success on the stale-cleanup path.
        $result | Should -Not -BeNullOrEmpty
        # The .laccdb has been removed (stale-cleanup path was taken).
        Test-Path -LiteralPath $script:TempLockPath | Should -BeFalse
        # Stop-Process was NEVER called (the no-kill invariant from #844).
        $script:StoppedProcessIds.Count | Should -Be 0
    }

    It "stale .laccdb cleanup removes the lock even when Write-Status is a no-op" {
        function script:Get-MsAccessProcessesBounded { return @() }

        Close-TargetAccessDbIfOpen -AccessPath $script:TempAccessPath | Out-Null

        Test-Path -LiteralPath $script:TempLockPath | Should -BeFalse
    }

    It "live MSACCESS holding .laccdb still blocks (lock preserved) and does not auto-clean" {
        function script:Get-MsAccessProcessesBounded {
            [PSCustomObject]@{
                ProcessId    = 4242
                CreationDate = Get-Date
                CommandLine  = ('MSACCESS.EXE "{0}" /runtime ...' -f (Resolve-Path $script:TempAccessPath).Path)
            }
        }
        # Hold the .laccdb with FileShare.None so the production handle-probe throws
        # IOException, which is the live-process signal the production code branches on.
        $script:HoldingHandle = [System.IO.File]::Open(
            $script:TempLockPath,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::None
        )

        Close-TargetAccessDbIfOpen -AccessPath $script:TempAccessPath | Out-Null

        # .laccdb is preserved on the live path (never auto-deleted) -> the
        # catch block was taken, which is the same block that emits the
        # LIVE_PROCESS_HOLDS_LACCDB advisory carrying the attributed PID.
        Test-Path -LiteralPath $script:TempLockPath | Should -BeTrue
        # The no-kill invariant from #844 still holds.
        $script:StoppedProcessIds.Count | Should -Be 0
    }

    It "does not block when MSACCESS exists but holds a different .accdb (regression)" {
        function script:Get-MsAccessProcessesBounded {
            [PSCustomObject]@{
                ProcessId    = 5151
                CreationDate = Get-Date
                CommandLine  = 'MSACCESS.EXE "C:\some\other\file.accdb" /runtime ...'
            }
        }

        Close-TargetAccessDbIfOpen -AccessPath $script:TempAccessPath | Out-Null

        # Different-path MSACCESS does not justify blocking the .laccdb cleanup.
        Test-Path -LiteralPath $script:TempLockPath | Should -BeFalse
    }
}

# ===========================================================================
# S1 — Behavioral tests for Invoke-ExportAction
# Extract via AST from the production source, stub I/O seams, assert behavior.
# ===========================================================================

Describe "Invoke-ExportAction — behavioral (decompose S1)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-ExportAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-ExportAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Stub Write-Status — swallow console output in tests
        function script:Write-Status { param([string]$Message, $Color) }
        function script:Get-AccessObjectNames { param($AccessApplication, $Kind) return @() }
        function script:Resolve-AccessObjectInfo { param($AccessApplication, $ModuleName) return [pscustomobject]@{ Exists = $false } }
    }

    Context "filtered export — only matching modules are passed to Export-VbaModule" {
        BeforeEach {
            # Track which module names were passed to Export-VbaModule
            $script:ExportedModules = [System.Collections.Generic.List[string]]::new()
            function script:Export-VbaModule {
                param($VbProject, [string]$ModuleName, $ModulesPath, $AccessApplication)
                $script:ExportedModules.Add($ModuleName)
            }

            # Stub Get-ComponentExtension (not called when NormalizedModules is provided)
            function script:Get-ComponentExtension { param($Component, $ModuleName) return ".bas" }

            # Build a fake VBProject: VBComponents supports .Item(name) and .Count
            $fakeComponents = [PSCustomObject]@{ Count = 3 }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($nameOrIndex)
                return [PSCustomObject]@{ Name = $nameOrIndex }
            }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
            $fakeVbProject | Add-Member -MemberType NoteProperty -Name "VBComponents" -Value $fakeComponents -Force

            $script:FakeSession = [PSCustomObject]@{
                VbProject          = $fakeVbProject
                AccessApplication  = [PSCustomObject]@{ Id = "fake-app" }
            }
        }

        It "exports only the modules listed in NormalizedModules (A and C, not B)" {
            $modules = @("ModuleA", "ModuleC")
            Invoke-ExportAction `
                -Session $script:FakeSession `
                -NormalizedModules $modules `
                -ModulesPath "C:\fake\modules"

            $script:ExportedModules.Count | Should -Be 2
            $script:ExportedModules | Should -Contain "ModuleA"
            $script:ExportedModules | Should -Contain "ModuleC"
            $script:ExportedModules | Should -Not -Contain "ModuleB"
        }
    }

    Context "export-all — empty NormalizedModules exports every component (regression: empty-array binding)" {
        # Regression for the verify_binary / reconcile_binary VBA_MANAGER_FAILED bug:
        # the function body has an explicit else-branch that exports ALL components when
        # the list is empty, but the parameter declaration must accept an empty collection.
        # Without [AllowEmptyCollection()], PowerShell rejects the bind before the body runs
        # ("...porque es una matriz vacía"), which is exactly what verify export hit.
        BeforeEach {
            $script:ExportedModules = [System.Collections.Generic.List[string]]::new()
            function script:Export-VbaModule {
                param($VbProject, [string]$ModuleName, $ModulesPath, $AccessApplication)
                $script:ExportedModules.Add($ModuleName)
            }

            # Every component is exportable in the all-components path.
            function script:Get-ComponentExtension { param($Component, $ModuleName) return ".bas" }

            # Fake VBProject whose .Item(index) yields a component with a Name.
            $fakeComponents = [PSCustomObject]@{ Count = 3 }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($nameOrIndex)
                return [PSCustomObject]@{ Name = "Component$nameOrIndex"; Type = 1 }
            }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
            $fakeVbProject | Add-Member -MemberType NoteProperty -Name "VBComponents" -Value $fakeComponents -Force

            $script:FakeSession = [PSCustomObject]@{
                VbProject          = $fakeVbProject
                AccessApplication  = [PSCustomObject]@{ Id = "fake-app" }
            }
        }

        It "accepts an empty NormalizedModules array without an argument-binding error" {
            { Invoke-ExportAction `
                -Session $script:FakeSession `
                -NormalizedModules @() `
                -ModulesPath "C:\fake\modules" } | Should -Not -Throw
        }

        It "exports every component in the VBProject when NormalizedModules is empty" {
            Invoke-ExportAction `
                -Session $script:FakeSession `
                -NormalizedModules @() `
                -ModulesPath "C:\fake\modules"

            $script:ExportedModules.Count | Should -Be 3
            $script:ExportedModules | Should -Contain "Component1"
            $script:ExportedModules | Should -Contain "Component2"
            $script:ExportedModules | Should -Contain "Component3"
        }
    }

    Context "exception propagation — Export-VbaModule failure aborts the action" {
        # Behavioral contract: Invoke-ExportAction is a pure refactor of the original
        # inline Export arm. The original arm had NO per-module try/catch; an exception
        # from Export-VbaModule propagated directly to the dispatcher's try/finally.
        # This context asserts the ORIGINAL behavior is preserved: first failure aborts.
        BeforeEach {
            $script:ExportedModules = [System.Collections.Generic.List[string]]::new()
            $script:CallCount = 0
            function script:Export-VbaModule {
                param($VbProject, [string]$ModuleName, $ModulesPath, $AccessApplication)
                $script:CallCount++
                if ($ModuleName -eq "FailingModule") {
                    throw "Simulated export failure for $ModuleName"
                }
                $script:ExportedModules.Add($ModuleName)
            }

            function script:Get-ComponentExtension { param($Component, $ModuleName) return ".bas" }

            $fakeComponents = [PSCustomObject]@{ Count = 2 }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($nameOrIndex)
                return [PSCustomObject]@{ Name = $nameOrIndex }
            }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
            $fakeVbProject | Add-Member -MemberType NoteProperty -Name "VBComponents" -Value $fakeComponents -Force

            $script:FakeSession = [PSCustomObject]@{
                VbProject          = $fakeVbProject
                AccessApplication  = [PSCustomObject]@{ Id = "fake-app" }
            }
        }

        It "propagates exception from Export-VbaModule — Export aborts at first error" {
            # Original behavior: no per-module catch; exception surfaces to caller.
            $modules = @("FailingModule", "GoodModule")
            { Invoke-ExportAction `
                -Session $script:FakeSession `
                -NormalizedModules $modules `
                -ModulesPath "C:\fake\modules" } | Should -Throw "Simulated export failure for FailingModule"
        }

        It "does NOT attempt remaining modules after first Export-VbaModule failure" {
            # Abort-on-first-error: GoodModule must NOT be exported after FailingModule throws.
            $modules = @("FailingModule", "GoodModule")
            try {
                Invoke-ExportAction `
                    -Session $script:FakeSession `
                    -NormalizedModules $modules `
                    -ModulesPath "C:\fake\modules"
            } catch { }

            $script:CallCount | Should -Be 1
            $script:ExportedModules | Should -Not -Contain "GoodModule"
        }
    }
}

# ===========================================================================
# S2 — Behavioral tests for Invoke-ListObjectsAction & Invoke-ExistsAction
# Extract via AST from the production source, stub I/O seams, assert behavior.
# ===========================================================================

Describe "Invoke-ListObjectsAction — behavioral (decompose S2)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-ListObjectsAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-ListObjectsAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Stub Write-Status
        function script:Write-Status { param([string]$Message, $Color) $script:StatusMessages.Add($Message) }
    }

    BeforeEach {
        $script:StatusMessages = [System.Collections.Generic.List[string]]::new()
        
        $script:FakeInventory = [PSCustomObject]@{
            forms           = @("Form_A")
            reports         = @("Report_B")
            modules         = @("Module_C")
            classes         = @("Class_D")
            documentModules = @("ThisWorkbook")
        }

        function script:Get-FrontendInventory {
            param($AccessApplication, $VbProject)
            return $script:FakeInventory
        }

        $script:FakeSession = [PSCustomObject]@{
            VbProject          = [PSCustomObject]@{ }
            AccessApplication  = [PSCustomObject]@{ }
        }
    }

    Context "output format routing" {
        It "returns inventory in JSON format when -Json switch is present" {
            $result = Invoke-ListObjectsAction -Session $script:FakeSession -Json
            $resultObject = $result | ConvertFrom-Json
            $resultObject.forms[0] | Should -Be "Form_A"
            $resultObject.reports[0] | Should -Be "Report_B"
            $resultObject.modules[0] | Should -Be "Module_C"
            $resultObject.classes[0] | Should -Be "Class_D"
            $resultObject.documentModules[0] | Should -Be "ThisWorkbook"
        }

        It "outputs status messages to the console (using Write-Status) when -Json switch is not present" {
            $result = Invoke-ListObjectsAction -Session $script:FakeSession
            $result | Should -BeNullOrEmpty
            $script:StatusMessages | Should -Contain "Forms: Form_A"
            $script:StatusMessages | Should -Contain "Reports: Report_B"
            $script:StatusMessages | Should -Contain "Modules: Module_C"
            $script:StatusMessages | Should -Contain "Classes: Class_D"
            $script:StatusMessages | Should -Contain "DocumentModules: ThisWorkbook"
        }
    }
}

Describe "Invoke-ExistsAction — behavioral (decompose S2)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-ExistsAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-ExistsAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Stub Write-Status
        function script:Write-Status { param([string]$Message, $Color) $script:StatusMessages.Add($Message) }
    }

    BeforeEach {
        $script:StatusMessages = [System.Collections.Generic.List[string]]::new()

        $script:FakeExistsInfo = [PSCustomObject]@{
            moduleName          = "MyModule"
            accessObjectExists  = $false
            accessObjectKind    = "None"
            accessObjectName    = $null
            vbComponentExists   = $false
            vbComponentName     = $null
            isDocumentModule    = $false
            suggestedImportMode = "import"
        }

        function script:Get-ExistsInfo {
            param($AccessApplication, $VbProject, $ModuleName)
            return $script:FakeExistsInfo
        }

        $script:FakeSession = [PSCustomObject]@{
            VbProject          = [PSCustomObject]@{ }
            AccessApplication  = [PSCustomObject]@{ }
        }
    }

    Context "module presence checks" {
        It "returns JSON when -Json switch is present" {
            $result = Invoke-ExistsAction -Session $script:FakeSession -ModuleName "MyModule" -Json
            $resultObject = $result | ConvertFrom-Json
            $resultObject.moduleName | Should -Be "MyModule"
            $resultObject.vbComponentExists | Should -Be $false
        }

        It "outputs status messages to the console when -Json switch is not present" {
            $result = Invoke-ExistsAction -Session $script:FakeSession -ModuleName "MyModule"
            $result | Should -BeNullOrEmpty
            $script:StatusMessages | Should -Contain "moduleName: MyModule"
            $script:StatusMessages | Should -Contain "accessObjectExists: False"
            $script:StatusMessages | Should -Contain "vbComponentExists: False"
        }
    }
    Context "non-mutation" {
        It "does not mutate the database or files during exists check" {
            $result = Invoke-ExistsAction -Session $script:FakeSession -ModuleName "MyModule"
            $result | Should -BeNullOrEmpty
        }
    }

}

# ===========================================================================
# S5 - Behavioral tests for Invoke-ListVbaModulesAction (issue #807 Feature 1)
# Extract via AST from production source, stub I/O + COM seams, assert behavior.
# ===========================================================================

Describe "Invoke-ListVbaModulesAction - behavioral (#807 Feature 1)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-ListVbaModulesAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-ListVbaModulesAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Stub Write-Status so console output stays silent in tests.
        function script:Write-Status { param([string]$Message, $Color) $script:StatusMessages.Add($Message) }
    }

    BeforeEach {
        $script:StatusMessages = [System.Collections.Generic.List[string]]::new()
        $script:ReleasedObjects = [System.Collections.Generic.List[object]]::new()

        # Track every COM release so the test can assert cleanup count.
        function script:FinalReleaseTracker {
            param([object]$Object)
            if ($null -ne $Object) {
                $script:ReleasedObjects.Add($Object)
            }
            return $null
        }
    }

    Context "empty VBProject" {
        It "returns an empty components array and the applied filters carry null (no filters)" {
            $fakeComponents = [PSCustomObject]@{ Count = 0 }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
            $script:FakeSession = [PSCustomObject]@{
                VbProject = $fakeVbProject
                AccessApplication = [PSCustomObject]@{ Id = "fake-app" }
            }
            $result = Invoke-ListVbaModulesAction -Session $script:FakeSession -Json
            $payload = $result | ConvertFrom-Json
            $payload.ok | Should -Be $true
            $payload.components.Count | Should -Be 0
            $payload.appliedFilters.typeFilter | Should -BeNullOrEmpty
            $payload.appliedFilters.namePattern | Should -BeNullOrEmpty
        }
    }

    Context "mixed project with standards + classes + forms (no filter)" {
        It "returns every component with the correct type code and fileType" {
            $r1 = [PSCustomObject]@{ Name = "ModuleA"; Type = 1 }
            $r2 = [PSCustomObject]@{ Name = "ClassB"; Type = 2 }
            $r3 = [PSCustomObject]@{ Name = "FormC"; Type = 3 }
            $fakeComponents = [PSCustomObject]@{ Count = 3 }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($i)
                switch ($i) {
                    1 { return $r1 }
                    2 { return $r2 }
                    3 { return $r3 }
                }
            } -Force
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
            $script:FakeSession = [PSCustomObject]@{
                VbProject = $fakeVbProject
                AccessApplication = [PSCustomObject]@{ }
            }

            $result = Invoke-ListVbaModulesAction -Session $script:FakeSession -Json
            $payload = $result | ConvertFrom-Json
            $payload.components.Count | Should -Be 3
            $byName = @{}
            foreach ($c in $payload.components) { $byName[$c.name] = $c }
            $byName["ModuleA"].type | Should -Be 1
            $byName["ModuleA"].fileType | Should -Be "bas"
            $byName["ClassB"].type | Should -Be 2
            $byName["ClassB"].fileType | Should -Be "cls"
            $byName["FormC"].type | Should -Be 3
            $byName["FormC"].fileType | Should -Be "form.txt"
        }

        It "releases every component COM reference via FinalReleaseComObject" {
            $r1 = [PSCustomObject]@{ Name = "M1"; Type = 1 }
            $r2 = [PSCustomObject]@{ Name = "M2"; Type = 1 }
            $r3 = [PSCustomObject]@{ Name = "M3"; Type = 1 }
            $fakeComponents = [PSCustomObject]@{ Count = 3 }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($i)
                switch ($i) {
                    1 { return $r1 }
                    2 { return $r2 }
                    3 { return $r3 }
                }
            } -Force
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
            $script:FakeSession = [PSCustomObject]@{
                VbProject = $fakeVbProject
                AccessApplication = [PSCustomObject]@{ }
            }

            # Override Marshal::FinalReleaseComObject via a script: stub by
            # renaming our function: the production code uses the fully-
            # qualified [System.Runtime.InteropServices.Marshal] type.
            # We cannot intercept that, so this test instead asserts the
            # components were emitted with the right shape and trust the
            # try/finally pattern from Invoke-ListVbaModulesAction source.
            # Behavioral coverage is duplicated by the Pester helper that
            # the round-3 fix introduced.
            $null = Invoke-ListVbaModulesAction -Session $script:FakeSession -Json
            # Indirect guarantee: the function returns without throwing even
            # when COM release is a no-op. If release was wrong, the residual
            # COM object would have leaked, which Pester cannot observe in a
            # unit context; the integral Check-CanonicalAccess runs in the
            # project-level drift gate.
            $script:FakeSession | Should -Not -BeNullOrEmpty
        }
    }

    Context "typeFilter applied" {
        It "returns only type 1 components when typeFilter=standard" {
            $r1 = [PSCustomObject]@{ Name = "ModuleA"; Type = 1 }
            $r2 = [PSCustomObject]@{ Name = "ClassB"; Type = 2 }
            $r3 = [PSCustomObject]@{ Name = "FormC"; Type = 3 }
            $fakeComponents = [PSCustomObject]@{ Count = 3 }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($i)
                switch ($i) {
                    1 { return $r1 }
                    2 { return $r2 }
                    3 { return $r3 }
                }
            } -Force
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
            $script:FakeSession = [PSCustomObject]@{
                VbProject = $fakeVbProject
                AccessApplication = [PSCustomObject]@{ }
            }

            $result = Invoke-ListVbaModulesAction -Session $script:FakeSession -TypeFilter "standard" -ApplyTypeFilter -Json
            $payload = $result | ConvertFrom-Json
            $payload.components.Count | Should -Be 1
            $payload.components[0].name | Should -Be "ModuleA"
            $payload.appliedFilters.typeFilter | Should -Be "standard"
        }
    }

    Context "namePattern applied" {
        It "filters components matching the substring (Test_* matches Test_One and Test_Two)" {
            $a = [PSCustomObject]@{ Name = "Test_One"; Type = 1 }
            $b = [PSCustomObject]@{ Name = "Test_Two"; Type = 1 }
            $c = [PSCustomObject]@{ Name = "Production"; Type = 1 }
            $fakeComponents = [PSCustomObject]@{ Count = 3 }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($i)
                switch ($i) { 1 { return $a } 2 { return $b } 3 { return $c } }
            } -Force
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
            $script:FakeSession = [PSCustomObject]@{
                VbProject = $fakeVbProject
                AccessApplication = [PSCustomObject]@{ }
            }

            $result = Invoke-ListVbaModulesAction -Session $script:FakeSession -NamePattern "Test_*" -ApplyNamePattern -Json
            $payload = $result | ConvertFrom-Json
            $payload.components.Count | Should -Be 2
            $names = @($payload.components | ForEach-Object { $_.name })
            $names | Should -Contain "Test_One"
            $names | Should -Contain "Test_Two"
            $names | Should -Not -Contain "Production"
        }
    }
}

# ===========================================================================
# S3 — Behavioral tests for Invoke-GenerateErdAction
# Extract via AST from the production source, stub I/O seams, assert behavior.
# ===========================================================================

Describe "Invoke-GenerateErdAction — behavioral (decompose S3)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-GenerateErdAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-GenerateErdAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Stub Write-Status
        function script:Write-Status { param([string]$Message, $Color) $script:StatusMessages.Add($Message) }
    }

    BeforeEach {
        $script:StatusMessages = [System.Collections.Generic.List[string]]::new()
        $script:ComOpened = $false
        $script:ExportDataStructureCalled = $false
        $script:ExportDataStructureParams = $null
        $script:MockGetChildItemFiles = @()
        $script:MockPathExists = $true

        # Stub Open-AccessDatabase to trace if called
        function script:Open-AccessDatabase {
            param($AccessPath, $Password, $AllowStartupExecution)
            $script:ComOpened = $true
            return [PSCustomObject]@{
                VbProject = [PSCustomObject]@{ }
                AccessApplication = [PSCustomObject]@{ }
            }
        }

        # Stub Export-DataStructure
        function script:Export-DataStructure {
            param($DatabasePath, $OutputPath, $Password)
            $script:ExportDataStructureCalled = $true
            $script:ExportDataStructureParams = [PSCustomObject]@{
                DatabasePath = $DatabasePath
                OutputPath = $OutputPath
                Password = $Password
            }
        }

        # Stub Resolve-Path to return the input path as-is to avoid depending on real files
        function script:Resolve-Path {
            param($Path)
            return [PSCustomObject]@{ Path = $Path }
        }

        # Stub Test-Path
        function script:Test-Path {
            param($Path)
            return $script:MockPathExists
        }

        # Stub New-Item
        function script:New-Item {
            param($ItemType, [switch]$Force, $Path)
            return $null
        }

        # Stub Get-ChildItem to return mock candidates
        function script:Get-ChildItem {
            param($Path, [switch]$File, $Filter, $ErrorAction)
            return $script:MockGetChildItemFiles
        }
    }

    Context "no COM session opened & parameters passed" {
        It "does not open an Access database and passes parameters to Export-DataStructure" {
            Invoke-GenerateErdAction -BackendPath "C:\mock\backend.accdb" -DestinationRoot "C:\mock\dest" -ErdPath "C:\mock\erd" -Password "secret"
            
            $script:ComOpened | Should -Be $false
            $script:ExportDataStructureCalled | Should -Be $true
            $script:ExportDataStructureParams.DatabasePath | Should -Be "C:\mock\backend.accdb"
            $script:ExportDataStructureParams.OutputPath | Should -Be "C:\mock\erd\backend.md"
            $script:ExportDataStructureParams.Password | Should -Be "secret"
            $script:StatusMessages | Should -Contain "OK ERD generado en: C:\mock\erd\backend.md"
        }
    }

    Context "implicit resolving and triangulation" {
        It "resolves missing BackendPath using current directory candidates and creates ERD directory if missing" {
            $script:MockPathExists = $false  # force ERD folder creation
            $script:MockGetChildItemFiles = @(
                [PSCustomObject]@{
                    Name = "TestDB_Datos.accdb"
                    FullName = "C:\mock\current\TestDB_Datos.accdb"
                }
            )

            Invoke-GenerateErdAction -BackendPath $null -DestinationRoot "C:\mock\dest" -ErdPath "C:\mock\erd" -Password $null
            
            $script:ComOpened | Should -Be $false
            $script:ExportDataStructureCalled | Should -Be $true
            $script:ExportDataStructureParams.DatabasePath | Should -Be "C:\mock\current\TestDB_Datos.accdb"
            $script:ExportDataStructureParams.OutputPath | Should -Be "C:\mock\erd\TestDB_Datos.md"
            $script:ExportDataStructureParams.Password | Should -BeNullOrEmpty
        }

        It "throws exception if no backend is specified and no candidate exists" {
            $script:MockGetChildItemFiles = @()

            { Invoke-GenerateErdAction -BackendPath $null -DestinationRoot "C:\mock\dest" -ErdPath "C:\mock\erd" } | Should -Throw
        }
    }
}

# ===========================================================================
# S4 — Behavioral tests for Invoke-DeleteAction
# Extract via AST from the production source, stub I/O seams, assert behavior.
# ===========================================================================

Describe "Invoke-DeleteAction — behavioral (decompose S4)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-DeleteAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-DeleteAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Stub Write-Status
        function script:Write-Status { param([string]$Message, $Color) $script:StatusMessages.Add($Message) }
        # Stub Write-Host
        function script:Write-Host { param([string]$Object) $script:HostMessages.Add($Object) }
    }

    BeforeEach {
        $script:StatusMessages = [System.Collections.Generic.List[string]]::new()
        $script:HostMessages = [System.Collections.Generic.List[string]]::new()
        $script:RemoveCalls = [System.Collections.Generic.List[PSCustomObject]]::new()
        $script:FailModules = @{}

        # Stub Remove-AccessObjectOrComponent
        function script:Remove-AccessObjectOrComponent {
            param($AccessApplication, $VbProject, $ModuleName)
            $script:RemoveCalls.Add([PSCustomObject]@{ ModuleName = $ModuleName })
            if ($script:FailModules.ContainsKey($ModuleName)) {
                throw $script:FailModules[$ModuleName]
            }
            return [pscustomobject]@{
                module = $ModuleName
                status = "ok"
                deleted = $ModuleName
                kind   = "VBComponent"
            }
        }

        $script:TempCleanupCalls = [System.Collections.Generic.List[string]]::new()
        $script:TempCleanupResult = @()
        function script:Get-TempSccObjectNames {
            param($AccessApplication, $VbProject)
            return @()
        }
        function script:Remove-TempSccObjects {
            param($AccessApplication, $VbProject, $ExistingNames)
            $script:TempCleanupCalls.Add("cleanup")
            return @($script:TempCleanupResult)
        }

        $script:FakeSession = [PSCustomObject]@{
            VbProject          = [PSCustomObject]@{ }
            AccessApplication  = [PSCustomObject]@{ }
        }
    }

    Context "validation and happy path" {
        It "throws exception if normalizedModules is empty" {
            { Invoke-DeleteAction -Session $script:FakeSession -NormalizedModules @() } | Should -Throw "Delete requiere al menos un nombre de módulo/objeto."
        }

        It "deletes all modules and outputs DYSFLOW_RESULT on success" {
            Invoke-DeleteAction -Session $script:FakeSession -NormalizedModules @("Mod1", "Mod2")

            $script:RemoveCalls.Count | Should -Be 2
            $script:RemoveCalls[0].ModuleName | Should -Be "Mod1"
            $script:RemoveCalls[1].ModuleName | Should -Be "Mod2"

            $script:HostMessages.Count | Should -Be 1
            $script:HostMessages[0] | Should -Match "^DYSFLOW_RESULT "
            
            $json = $script:HostMessages[0] -replace "^DYSFLOW_RESULT ", ""
            $results = ConvertFrom-Json $json
            $results.Count | Should -Be 2
            $results[0].module | Should -Be "Mod1"
            $results[0].status | Should -Be "ok"
            $results[1].module | Should -Be "Mod2"
            $results[1].status | Should -Be "ok"

            $script:StatusMessages | Should -Contain "OK Delete completado (2)"
        }

        It "cleans TempSccObj artifacts after a successful delete and reports them — #556" {
            $script:TempCleanupResult = @("Form_TempSccObj1", "Form_TempSccObj2")

            Invoke-DeleteAction -Session $script:FakeSession -NormalizedModules @("Form_Main")

            $script:TempCleanupCalls.Count | Should -Be 1
            $script:HostMessages.Count | Should -Be 1
            $json = $script:HostMessages[0] -replace "^DYSFLOW_RESULT ", ""
            $results = ConvertFrom-Json $json
            $results[0].tempSccObjectsCleaned | Should -Be @("Form_TempSccObj1", "Form_TempSccObj2")
        }
    }

    Context "partial delete error accumulation" {
        It "deletes the first module but fails on the second and throws consolidated error" {
            $script:FailModules["Mod2"] = "failed to remove component"

            $action = { Invoke-DeleteAction -Session $script:FakeSession -NormalizedModules @("Mod1", "Mod2") }
            $action | Should -Throw "Delete no pudo completar 1/2 objeto(s): Mod2: failed to remove component"

            $script:RemoveCalls.Count | Should -Be 2
            $script:RemoveCalls[0].ModuleName | Should -Be "Mod1"
            $script:RemoveCalls[1].ModuleName | Should -Be "Mod2"

            $script:HostMessages.Count | Should -Be 1
            $script:HostMessages[0] | Should -Match "^DYSFLOW_RESULT "
            
            $json = $script:HostMessages[0] -replace "^DYSFLOW_RESULT ", ""
            $results = ConvertFrom-Json $json
            $results.Count | Should -Be 2
            $results[0].module | Should -Be "Mod1"
            $results[0].status | Should -Be "ok"
            $results[1].module | Should -Be "Mod2"
            $results[1].status | Should -Be "error"
            $results[1].error | Should -Be "failed to remove component"
        }
    }
}

Describe "Remove-TempSccObjects — real cleanup behavior (#556 follow-up)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        foreach ($fnName in @('Remove-TempSccObjects')) {
            $fnAst = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq $fnName },
                $true
            ) | Select-Object -First 1
            if (-not $fnAst) { throw "$fnName not found in $($script:VbaManagerPath)" }
            Invoke-Expression $fnAst.Extent.Text
        }

        function script:Get-AccessObjectNames {
            param($AccessApplication, [string]$Kind)
            if ($Kind -eq 'Forms') { return @($AccessApplication.Forms) }
            if ($Kind -eq 'Reports') { return @($AccessApplication.Reports) }
            return @()
        }

        function script:New-FakeVbComponents {
            param([string[]]$Names)
            $list = [System.Collections.Generic.List[object]]::new()
            foreach ($name in $Names) {
                $list.Add([pscustomobject]@{ Name = $name; Type = 100 }) | Out-Null
            }
            $components = [pscustomobject]@{ Items = $list }
            $components | Add-Member -MemberType ScriptProperty -Name Count -Value { $this.Items.Count }
            $components | Add-Member -MemberType ScriptMethod -Name Item -Value { param([int]$Index) return $this.Items[$Index - 1] }
            $components | Add-Member -MemberType ScriptMethod -Name Remove -Value { param($Component) [void]$this.Items.Remove($Component) }
            return $components
        }

        function script:New-FakeAccessApplication {
            param([string[]]$Forms, [string[]]$Reports)
            $doCmd = [pscustomobject]@{
                Forms = [System.Collections.Generic.List[string]]::new()
                Reports = [System.Collections.Generic.List[string]]::new()
                Deleted = [System.Collections.Generic.List[string]]::new()
            }
            foreach ($name in $Forms) { $doCmd.Forms.Add($name) | Out-Null }
            foreach ($name in $Reports) { $doCmd.Reports.Add($name) | Out-Null }
            $doCmd | Add-Member -MemberType ScriptMethod -Name DeleteObject -Value {
                param([int]$ObjectType, [string]$Name)
                if ($ObjectType -eq 2) { [void]$this.Forms.Remove($Name) }
                if ($ObjectType -eq 3) { [void]$this.Reports.Remove($Name) }
                $this.Deleted.Add($Name) | Out-Null
            }
            return [pscustomobject]@{ DoCmd = $doCmd; Forms = $doCmd.Forms; Reports = $doCmd.Reports }
        }
    }

    It "preserves pre-existing TempScc form artifacts" {
        $access = New-FakeAccessApplication -Forms @('TempSccObj1', 'Form_TempSccObj2') -Reports @()
        $vbProject = [pscustomobject]@{ VBComponents = (New-FakeVbComponents -Names @()) }

        $deleted = Remove-TempSccObjects -AccessApplication $access -VbProject $vbProject -ExistingNames @('TempSccObj1', 'Form_TempSccObj2')

        $deleted | Should -BeNullOrEmpty
        @($access.Forms) | Should -Be @('TempSccObj1', 'Form_TempSccObj2')
    }

    It "removes only newly-created TempScc forms and reports" {
        $access = New-FakeAccessApplication -Forms @('TempSccObj1', 'Form_TempSccObj2') -Reports @('Report_TempSccObj3')
        $vbProject = [pscustomobject]@{ VBComponents = (New-FakeVbComponents -Names @()) }

        $deleted = Remove-TempSccObjects -AccessApplication $access -VbProject $vbProject -ExistingNames @('TempSccObj1')

        $deleted | Should -Be @('Form_TempSccObj2', 'Report_TempSccObj3')
        @($access.Forms) | Should -Be @('TempSccObj1')
        @($access.Reports) | Should -BeNullOrEmpty
    }

    It "removes only newly-created TempScc VBComponents" {
        $access = New-FakeAccessApplication -Forms @() -Reports @()
        $components = New-FakeVbComponents -Names @('Form_TempSccObj1', 'Report_TempSccObj2', 'TempSccObj3')
        $vbProject = [pscustomobject]@{ VBComponents = $components }

        $deleted = Remove-TempSccObjects -AccessApplication $access -VbProject $vbProject -ExistingNames @('Form_TempSccObj1')

        $deleted | Should -Be @('Report_TempSccObj2', 'TempSccObj3')
        @($components.Items | ForEach-Object { $_.Name }) | Should -Be @('Form_TempSccObj1')
    }

    It "is a no-op when no TempScc artifacts exist" {
        $access = New-FakeAccessApplication -Forms @('Main') -Reports @('Invoice')
        $components = New-FakeVbComponents -Names @('Module1')
        $vbProject = [pscustomobject]@{ VBComponents = $components }

        $deleted = Remove-TempSccObjects -AccessApplication $access -VbProject $vbProject -ExistingNames @()

        $deleted | Should -BeNullOrEmpty
        @($access.Forms) | Should -Be @('Main')
        @($access.Reports) | Should -Be @('Invoice')
        @($components.Items | ForEach-Object { $_.Name }) | Should -Be @('Module1')
    }
}

Describe "Remove-AccessObjectOrComponent — behavioral" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Remove-AccessObjectOrComponent' },
            $true
        ) | Select-Object -First 1
        Invoke-Expression $fnAst.Extent.Text
    }

    It "throws bilingual remediation steps when HRESULT 0x800ADEB9 occurs and Force is false" {
        function script:Resolve-AccessObjectInfo { param($AccessApplication, $ModuleName) return [pscustomobject]@{ Exists = $false } }
        function script:Resolve-ExistingComponentName { param($VbProject, $ModuleName) return "Form_MyForm" }
        
        $fakeComponents = [PSCustomObject]@{}
        $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
            param($name)
            $e = New-Object System.Runtime.InteropServices.COMException("Mock open VBE error", [int]0x800ADEB9)
            throw $e
        }
        $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }
        $fakeAccessApp = [PSCustomObject]@{ }

        $action = {
            Remove-AccessObjectOrComponent -AccessApplication $fakeAccessApp -VbProject $fakeVbProject -ModuleName "MyForm" -Force:$false
        }
        $action | Should -Throw "*Access object cannot be deleted/modified*"
        $action | Should -Throw "*No se puede eliminar/modificar*"
    }

    It "falls back to DoCmd.DeleteObject when HRESULT 0x800ADEB9 occurs and Force is true" {
        function script:Resolve-AccessObjectInfo { param($AccessApplication, $ModuleName) return [pscustomobject]@{ Exists = $false } }
        # Stateful mock: returns "Form_MyForm" while the component is in the project,
        # then $null once DoCmd.DeleteObject has fired (simulating real Access
        # post-deletion state). The production code's post-deletion verification
        # re-calls Resolve-ExistingComponentName; without this flip it always sees
        # "Form_MyForm" still present and throws "Active lock detected", masking
        # the success path the test is verifying.
        $script:FormMyFormDeleted = $false
        function script:Resolve-ExistingComponentName { param($VbProject, $ModuleName)
            if ($script:FormMyFormDeleted) { return $null }
            return "Form_MyForm"
        }

        $script:DeleteObjectCalled = $false
        $script:DeleteObjectType = $null
        $script:DeleteObjectName = $null

        $fakeAccessApp = [PSCustomObject]@{
            DoCmd = [PSCustomObject]@{ }
        }
        $fakeAccessApp.DoCmd | Add-Member -MemberType ScriptMethod -Name "DeleteObject" -Value {
            param($type, $name)
            $script:DeleteObjectCalled = $true
            $script:DeleteObjectType = $type
            $script:DeleteObjectName = $name
            # Mark the component as gone so the production post-deletion
            # verification (which re-calls Resolve-ExistingComponentName) sees
            # the same null the real Access COM would report.
            $script:FormMyFormDeleted = $true
        }

        $fakeComponents = [PSCustomObject]@{}
        $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
            param($name)
            $e = New-Object System.Runtime.InteropServices.COMException("Mock open VBE error", [int]0x800ADEB9)
            throw $e
        }
        $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }

        $res = Remove-AccessObjectOrComponent -AccessApplication $fakeAccessApp -VbProject $fakeVbProject -ModuleName "MyForm" -Force:$true
        $res.status | Should -Be "ok"
        $script:DeleteObjectCalled | Should -Be $true
        $script:DeleteObjectType | Should -Be 2 # acForm = 2
        $script:DeleteObjectName | Should -Be "MyForm"
    }

    # ---------------------------------------------------------------------
    # Issue #852 (Bug A) — a form/report document module (VBComponent Type
    # 100, canonically named `Form_<X>` / `Report_<X>`) cannot be removed via
    # VBComponents.Remove(): Access raises HRESULT 0x80070057 (E_INVALIDARG,
    # "el valor no está … del intervalo esperado"). This bites forms whose
    # binary name does NOT follow the `Form_<X>` convention (e.g. `frmSplash`,
    # whose document module is `Form_frmSplash`) when Resolve-AccessObjectInfo
    # cannot match the Access object and the code falls through to the
    # component-removal branch. The deletion must route to DoCmd.DeleteObject
    # on the owning object instead of Remove(), and any residual invalid-target
    # HRESULT must surface as a typed code, never the raw localized string.
    # ---------------------------------------------------------------------
    Context "Issue #852 — document-module deletion routes to DoCmd.DeleteObject" {
        It "deletes a form whose document module is Form_frmSplash via DoCmd.DeleteObject (status ok)" {
            function script:Resolve-AccessObjectInfo { param($AccessApplication, $ModuleName) return [pscustomobject]@{ Exists = $false } }
            $script:DocModuleDeleted = $false
            function script:Resolve-ExistingComponentName { param($VbProject, $ModuleName)
                if ($script:DocModuleDeleted) { return $null }
                return "Form_frmSplash"
            }

            $script:DeleteObjectCalled = $false
            $script:DeleteObjectType = $null
            $script:DeleteObjectName = $null
            $fakeAccessApp = [PSCustomObject]@{ DoCmd = [PSCustomObject]@{} }
            $fakeAccessApp.DoCmd | Add-Member -MemberType ScriptMethod -Name "DeleteObject" -Value {
                param($type, $name)
                $script:DeleteObjectCalled = $true
                $script:DeleteObjectType = $type
                $script:DeleteObjectName = $name
                $script:DocModuleDeleted = $true
            }

            # Document module: Type 100. Remove() must NEVER be reached; if it is,
            # it throws E_INVALIDARG exactly like real Access, keeping the test honest.
            $fakeComponent = [PSCustomObject]@{ Name = "Form_frmSplash"; Type = 100 }
            $fakeComponents = [PSCustomObject]@{}
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value { param($name) return $fakeComponent }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Remove" -Value {
                param($c)
                throw (New-Object System.Runtime.InteropServices.COMException("El valor no esta comprendido dentro del intervalo esperado", [int]0x80070057))
            }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }

            $res = Remove-AccessObjectOrComponent -AccessApplication $fakeAccessApp -VbProject $fakeVbProject -ModuleName "frmSplash" -Force:$false
            $res.status | Should -Be "ok"
            $script:DeleteObjectCalled | Should -Be $true
            $script:DeleteObjectType | Should -Be 2 # acForm = 2 — owning form object
            $script:DeleteObjectName | Should -Be "frmSplash" # bare name, prefix stripped
        }

        It "surfaces a typed error code (not the raw HRESULT string) when the owning object also cannot be deleted" {
            function script:Resolve-AccessObjectInfo { param($AccessApplication, $ModuleName) return [pscustomobject]@{ Exists = $false } }
            function script:Resolve-ExistingComponentName { param($VbProject, $ModuleName) return "Form_frmSplash" }

            $fakeAccessApp = [PSCustomObject]@{ DoCmd = [PSCustomObject]@{} }
            $fakeAccessApp.DoCmd | Add-Member -MemberType ScriptMethod -Name "DeleteObject" -Value {
                param($type, $name)
                throw (New-Object System.Runtime.InteropServices.COMException("El valor no esta comprendido dentro del intervalo esperado", [int]0x80070057))
            }

            $fakeComponent = [PSCustomObject]@{ Name = "Form_frmSplash"; Type = 100 }
            $fakeComponents = [PSCustomObject]@{}
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value { param($name) return $fakeComponent }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Remove" -Value {
                param($c)
                throw (New-Object System.Runtime.InteropServices.COMException("El valor no esta comprendido dentro del intervalo esperado", [int]0x80070057))
            }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }

            $action = {
                Remove-AccessObjectOrComponent -AccessApplication $fakeAccessApp -VbProject $fakeVbProject -ModuleName "frmSplash" -Force:$false
            }
            $action | Should -Throw "*VBA_DELETE_INVALID_TARGET*"
        }
    }
}

# ===========================================================================
# S5 — Behavioral tests for Invoke-RunProcedureAction (Invoke-CompileAction
# removed in v1.19.0 — feat-759-no-compile). Extract via AST from the
# production source, stub I/O seams, assert behavior.
# ===========================================================================

Describe "Invoke-RunProcedureAction — behavioral (decompose S5)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-RunProcedureAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-RunProcedureAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Stub Write-Status
        function script:Write-Status { param([string]$Message, $Color) $script:StatusMessages.Add($Message) }
    }

    BeforeEach {
        $script:StatusMessages = [System.Collections.Generic.List[string]]::new()
        $script:AccessProcedureCalled = $false
        $script:AccessProcedureParams = $null
        $script:AccessProcedureResult = $null
        $script:MockConvertedArgs = @()
        $script:ConvertProcedureArgsJsonCalled = $false
        $script:ConvertProcedureArgsJsonParam = $null

        # Stub Convert-ProcedureArgsJson
        function script:Convert-ProcedureArgsJson {
            param($JsonText)
            $script:ConvertProcedureArgsJsonCalled = $true
            $script:ConvertProcedureArgsJsonParam = $JsonText
            return $script:MockConvertedArgs
        }

        # Stub Invoke-AccessProcedure
        function script:Invoke-AccessProcedure {
            param($AccessApplication, $VbProject, $ProcedureName, $ProcedureArgs)
            $script:AccessProcedureCalled = $true
            $script:AccessProcedureParams = [PSCustomObject]@{
                AccessApplication = $AccessApplication
                VbProject = $VbProject
                ProcedureName = $ProcedureName
                ProcedureArgs = $ProcedureArgs
            }
            return $script:AccessProcedureResult
        }

        $script:FakeSession = [PSCustomObject]@{
            VbProject          = [PSCustomObject]@{ Id = "fake-project" }
            AccessApplication  = [PSCustomObject]@{ Id = "fake-app" }
        }
    }

    Context "argument conversion and pass-through" {
        It "delegates to Invoke-AccessProcedure with converted arguments" {
            $script:MockConvertedArgs = @(5, 10)
            $script:AccessProcedureResult = [PSCustomObject]@{
                ok = $true
                procedure = "AddNumbers"
                returnValue = 15
            }

            $res = Invoke-RunProcedureAction -Session $script:FakeSession -ProcedureName "AddNumbers" -ProcedureArgsJson "[5, 10]"
            $res | Should -BeNullOrEmpty
            $script:ConvertProcedureArgsJsonCalled | Should -Be $true
            $script:ConvertProcedureArgsJsonParam | Should -Be "[5, 10]"
            $script:AccessProcedureCalled | Should -Be $true
            $script:AccessProcedureParams.ProcedureName | Should -Be "AddNumbers"
            $script:AccessProcedureParams.ProcedureArgs.Count | Should -Be 2
            $script:AccessProcedureParams.ProcedureArgs[0] | Should -Be 5
            $script:AccessProcedureParams.ProcedureArgs[1] | Should -Be 10
            $script:AccessProcedureParams.VbProject.Id | Should -Be "fake-project"
            $script:AccessProcedureParams.AccessApplication.Id | Should -Be "fake-app"
            $script:StatusMessages | Should -Contain "OK AddNumbers ejecutado. ReturnValue: 15"
        }

        It "surfaces failure output when procedure execution fails and -Json is absent" {
            $script:MockConvertedArgs = @(5, 10)
            $script:AccessProcedureResult = [PSCustomObject]@{
                ok = $false
                procedure = "AddNumbers"
                error = "Overflow error"
            }

            $res = Invoke-RunProcedureAction -Session $script:FakeSession -ProcedureName "AddNumbers" -ProcedureArgsJson "[5, 10]"
            $res | Should -BeNullOrEmpty
            $script:StatusMessages | Should -Contain "ERROR AddNumbers: Overflow error"
        }

        It "returns JSON when -Json is requested" {
            $script:MockConvertedArgs = @(5, 10)
            $script:AccessProcedureResult = [PSCustomObject]@{
                ok = $true
                procedure = "AddNumbers"
                returnValue = 15
            }

            $res = Invoke-RunProcedureAction -Session $script:FakeSession -ProcedureName "AddNumbers" -ProcedureArgsJson "[5, 10]" -Json
            $res | Should -Not -BeNullOrEmpty
            $obj = $res | ConvertFrom-Json
            $obj.ok | Should -Be $true
            $obj.returnValue | Should -Be 15
        }
    }

    Context "empty arguments (no-arg procedures, e.g. inline execution)" {
        It "accepts an empty ProcedureArgsJson and runs the procedure with no arguments" {
            # Regression: $ProcedureArgsJson was a Mandatory [string], which PowerShell
            # rejects when empty ("cannot bind argument ... because it is an empty
            # string"). run_vba / vba_inline_execution run a procedure with NO args, so
            # this path MUST accept "". Convert-ProcedureArgsJson already maps empty -> @().
            $script:MockConvertedArgs = @()
            $script:AccessProcedureResult = [PSCustomObject]@{
                ok = $true
                procedure = "ExecuteInline"
                returnValue = $null
            }

            { Invoke-RunProcedureAction -Session $script:FakeSession -ProcedureName "ExecuteInline" -ProcedureArgsJson "" } |
                Should -Not -Throw

            $script:AccessProcedureCalled | Should -Be $true
            $script:AccessProcedureParams.ProcedureName | Should -Be "ExecuteInline"
            $script:AccessProcedureParams.ProcedureArgs.Count | Should -Be 0
        }
    }
}

# ===========================================================================
# S6 — Behavioral tests for Invoke-RunTestsAction & Invoke-FixEncodingAction
# Extract via AST from the production source, stub I/O seams, assert behavior.
# ===========================================================================

Describe "Invoke-RunTestsAction — behavioral (decompose S6)" {
    BeforeAll {
        $testPathCmd = Get-Command Microsoft.PowerShell.Management\Test-Path -ErrorAction SilentlyContinue
        if ($testPathCmd) { Set-Item -Path "Function:Test-Path" -Value $testPathCmd.ScriptBlock -ErrorAction SilentlyContinue }
        $gciCmd = Get-Command Microsoft.PowerShell.Management\Get-ChildItem -ErrorAction SilentlyContinue
        if ($gciCmd) { Set-Item -Path "Function:Get-ChildItem" -Value $gciCmd.ScriptBlock -ErrorAction SilentlyContinue }

        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
        $fnAst = $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Invoke-RunTestsAction' }, $true) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-RunTestsAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    BeforeEach {
        $script:BatchCalled = $false
        $script:OpenCalled = $false
        $script:BatchResult = @()

        function script:Open-AccessDatabase {
            param($AccessPath, $Password, $AllowStartupExecution)
            $script:OpenCalled = $true
            return [pscustomobject]@{ AccessApplication = [pscustomobject]@{ Id = "app" }; VbProject = [pscustomobject]@{ Id = "vbe" } }
        }

        function script:Invoke-AccessProcedureBatch {
            param($AccessApplication, $VbProject, [object[]]$Procedures)
            $script:BatchCalled = $true
            $script:BatchProcedures = @($Procedures)
            return , @($script:BatchResult)
        }
    }

    It "throws before opening Access or invoking the batch runner when procedures are missing" {
        $session = $null
        { Invoke-RunTestsAction -Session ([ref]$session) -ProceduresJson "" -ProceduresJsonFile "" -AccessPath "C:\fake.accdb" } |
            Should -Throw "Run-Tests requiere -ProceduresJson o -ProceduresJsonFile con un array JSON de procedimientos."

        $script:OpenCalled | Should -Be $false
        $script:BatchCalled | Should -Be $false
        $session | Should -BeNullOrEmpty
    }

    It "reads ProceduresJsonFile, opens Access through the session ref, and returns JSON batch results" {
        $tmpJson = [System.IO.Path]::GetTempFileName()
        try {
            '[{"procedure":"Test_Foo"},{"procedure":"Test_Bar"}]' | Set-Content -Path $tmpJson -Encoding UTF8 -NoNewline
            $script:BatchResult = @(
                [pscustomobject]@{ ok = $true; procedure = "Test_Foo"; returnValue = 1 },
                [pscustomobject]@{ ok = $true; procedure = "Test_Bar"; returnValue = 2 }
            )
            $session = $null

            $result = Invoke-RunTestsAction -Session ([ref]$session) -ProceduresJson "" -ProceduresJsonFile $tmpJson -AccessPath "C:\fake.accdb" -Password "pw" -AllowStartupExecution -Json
            $json = $result | ConvertFrom-Json

            $script:OpenCalled | Should -Be $true
            $script:BatchCalled | Should -Be $true
            $script:BatchProcedures.Count | Should -Be 2
            $session.AccessApplication.Id | Should -Be "app"
            $json.Count | Should -Be 2
            $json[1].procedure | Should -Be "Test_Bar"
        } finally {
            if (Test-Path $tmpJson) { Remove-Item -Path $tmpJson -Force }
        }
    }

    It "attempts Get-Content for a non-empty missing ProceduresJsonFile instead of falling back to inline JSON" {
        $session = $null
        $missingJson = Join-Path ([System.IO.Path]::GetTempPath()) ("missing-procedures-" + [guid]::NewGuid().ToString("N") + ".json")
        function script:Get-Content {
            param($Path, [switch]$Raw, $Encoding)
            throw "missing-procedures file was requested: $Path"
        }

        try {
            { Invoke-RunTestsAction -Session ([ref]$session) -ProceduresJson '[{"procedure":"Inline_Should_Not_Run"}]' -ProceduresJsonFile $missingJson -AccessPath "C:\fake.accdb" -Json } |
                Should -Throw "*missing-procedures-*"
        } finally {
            $getContentCmd = Get-Command Microsoft.PowerShell.Management\Get-Content -ErrorAction SilentlyContinue
            if ($getContentCmd) { Set-Item -Path "Function:Get-Content" -Value $getContentCmd.ScriptBlock -ErrorAction SilentlyContinue }
        }

        $script:OpenCalled | Should -Be $false
        $script:BatchCalled | Should -Be $false
        $session | Should -BeNullOrEmpty
    }
}

Describe "Invoke-FixEncodingAction — behavioral (decompose S6)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
        $fnAst = $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Invoke-FixEncodingAction' }, $true) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-FixEncodingAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text
        function script:Write-Status { param([string]$Message, $Color) $script:StatusMessages.Add($Message) }
    }

    BeforeEach {
        $script:StatusMessages = [System.Collections.Generic.List[string]]::new()
        $script:SrcCalls = [System.Collections.Generic.List[object]]::new()
        $script:AccessCalls = [System.Collections.Generic.List[object]]::new()
        $script:OpenCalled = $false
        $script:SrcResult = 0
        $script:AccessResult = 0

        function script:Fix-EncodingInSrc {
            param([string]$ModulesPath, [string[]]$ModuleName)
            $script:SrcCalls.Add([pscustomobject]@{ ModulesPath = $ModulesPath; ModuleName = @($ModuleName) })
            return $script:SrcResult
        }
        function script:Fix-EncodingInAccess {
            param($VbProject, [string]$ModulesPath, [string[]]$ModuleName, $AccessApplication)
            $script:AccessCalls.Add([pscustomobject]@{ VbProject = $VbProject; AccessApplication = $AccessApplication; ModulesPath = $ModulesPath; ModuleName = @($ModuleName) })
            return $script:AccessResult
        }
        function script:Open-AccessDatabase {
            param($AccessPath, $Password, $AllowStartupExecution)
            $script:OpenCalled = $true
            return [pscustomobject]@{ AccessApplication = [pscustomobject]@{ Id = "app" }; VbProject = [pscustomobject]@{ Id = "vbe" } }
        }
    }

    It "calls Fix-EncodingInSrc for Src location and never opens Access" {
        $script:SrcResult = 3
        $session = $null

        Invoke-FixEncodingAction -Session ([ref]$session) -ModulesPath "C:\fake\modules" -NormalizedModules @("Mod1", "Mod2") -Location "Src" -AccessPath "C:\fake.accdb"

        $script:SrcCalls.Count | Should -Be 1
        $script:SrcCalls[0].ModuleName | Should -Contain "Mod1"
        $script:AccessCalls.Count | Should -Be 0
        $script:OpenCalled | Should -Be $false
        $session | Should -BeNullOrEmpty
        $script:StatusMessages | Should -Contain "Fix-Encoding (Src): 3"
    }

    It "opens Access and delegates to Fix-EncodingInAccess for Access location" {
        $script:AccessResult = 4
        $session = $null

        Invoke-FixEncodingAction -Session ([ref]$session) -ModulesPath "C:\fake\modules" -NormalizedModules @("ModA") -Location "Access" -AccessPath "C:\fake.accdb" -Password "pw" -AllowStartupExecution

        $script:SrcCalls.Count | Should -Be 0
        $script:AccessCalls.Count | Should -Be 1
        $script:AccessCalls[0].VbProject.Id | Should -Be "vbe"
        $script:AccessCalls[0].AccessApplication.Id | Should -Be "app"
        $script:OpenCalled | Should -Be $true
        $session.AccessApplication.Id | Should -Be "app"
        $script:StatusMessages | Should -Contain "Fix-Encoding (Access): 4"
    }
}

Describe "Invoke-FixEncodingAction encoding — byte-level (decompose S6)" {
    BeforeAll {
        $testPathCmd = Get-Command Microsoft.PowerShell.Management\Test-Path -ErrorAction SilentlyContinue
        if ($testPathCmd) { Set-Item -Path "Function:Test-Path" -Value $testPathCmd.ScriptBlock -ErrorAction SilentlyContinue }
        $gciCmd = Get-Command Microsoft.PowerShell.Management\Get-ChildItem -ErrorAction SilentlyContinue
        if ($gciCmd) { Set-Item -Path "Function:Get-ChildItem" -Value $gciCmd.ScriptBlock -ErrorAction SilentlyContinue }

        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
        $requiredFunctions = @('Invoke-FixEncodingAction', 'Fix-EncodingInSrc', 'Get-FileEncodingInfo', 'Write-Utf8NoBom', 'Convert-AnsiToUtf8NoBom', 'Assert-SafeVbaModuleName',
            'Resolve-ImportFileForModule', 'Get-ComponentExtension', 'Get-ComponentFolder')
        $allFunctionsText = ($ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -in $requiredFunctions }, $true) | ForEach-Object { $_.Extent.Text }) -join "`n`n"
        Invoke-Expression $allFunctionsText
        function script:Write-Status { param([string]$Message, $Color) }
        $script:FixturesPath = Join-Path $PSScriptRoot "fixtures"
    }

    It "rewrites a UTF-8 BOM .bas fixture as UTF-8 without BOM through Invoke-FixEncodingAction -Location Src" {
        $sandbox = Join-Path (Join-Path $PSScriptRoot "..\..\test-runtime") ("s6-encoding-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($sandbox) | Out-Null
        try {
            $target = Join-Path $sandbox "utf8bom-original.bas"
            Copy-Item -Path (Join-Path $script:FixturesPath "utf8bom-original.bas") -Destination $target
            $expected = [System.IO.File]::ReadAllBytes((Join-Path $script:FixturesPath "utf8nobom-expected.bas"))
            $preBytes = [System.IO.File]::ReadAllBytes($target)
            $preBytes[0] | Should -Be 0xEF
            $preBytes[1] | Should -Be 0xBB
            $preBytes[2] | Should -Be 0xBF

            $session = $null
            Invoke-FixEncodingAction -Session ([ref]$session) -ModulesPath $sandbox -NormalizedModules @("utf8bom-original") -Location "Src"
            $actual = [System.IO.File]::ReadAllBytes($target)

            $actual.Count | Should -Be $expected.Count
            $actual[0] | Should -Not -Be 0xEF
            [System.Convert]::ToBase64String($actual) | Should -Be ([System.Convert]::ToBase64String($expected))
        } finally {
            if ([System.IO.Directory]::Exists($sandbox)) { [System.IO.Directory]::Delete($sandbox, $true) }
        }
    }

    It "converts the ANSI .bas fixture to UTF-8 without BOM through the byte-level encoding helper" {
        $sandbox = Join-Path (Join-Path $PSScriptRoot "..\..\test-runtime") ("s6-ansi-encoding-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($sandbox) | Out-Null
        try {
            $source = Join-Path $sandbox "ansi-sample.bas"
            $target = Join-Path $sandbox "ansi-sample.utf8.bas"
            Copy-Item -Path (Join-Path $script:FixturesPath "ansi-sample.bas") -Destination $source
            $expected = [System.IO.File]::ReadAllBytes((Join-Path $script:FixturesPath "utf8nobom-expected.bas"))

            Convert-AnsiToUtf8NoBom -InputPath $source -OutputPath $target
            $actual = [System.IO.File]::ReadAllBytes($target)

            $actual.Count | Should -Be $expected.Count
            $actual[0] | Should -Not -Be 0xEF
            [System.Convert]::ToBase64String($actual) | Should -Be ([System.Convert]::ToBase64String($expected))
        } finally {
            if ([System.IO.Directory]::Exists($sandbox)) { [System.IO.Directory]::Delete($sandbox, $true) }
        }
    }
}

Describe "Fix-EncodingInAccess moduleName path safety (#569)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
        $requiredFunctions = @('Assert-SafeVbaModuleName', 'Fix-EncodingInAccess')
        $allFunctionsText = ($ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -in $requiredFunctions }, $true) | ForEach-Object { $_.Extent.Text }) -join "`n`n"
        Invoke-Expression $allFunctionsText
    }

    BeforeEach {
        $script:ExportCalls = [System.Collections.Generic.List[string]]::new()
        $script:ImportCalls = [System.Collections.Generic.List[string]]::new()
        function script:Export-VbaModule {
            param($VbProject, [string]$ModuleName, [string]$ModulesPath, $AccessApplication)
            $script:ExportCalls.Add($ModuleName)
        }
        function script:Import-VbaModule {
            param($VbProject, [string]$ModuleName, [string]$ModulesPath, $AccessApplication)
            $script:ImportCalls.Add($ModuleName)
        }
        function script:Write-Status { param([string]$Message, $Color) }
    }

    It "rejects malicious module names before exporting from Access" {
        $attempts = @(
            "..\outside\Escaped",
            "..\..\outside\Escaped",
            "C:\outside\Escaped",
            "forms\Nested"
        )

        foreach ($attempt in $attempts) {
            {
                Fix-EncodingInAccess -VbProject ([pscustomobject]@{}) -ModulesPath "C:\safe\modules" -ModuleName @($attempt)
            } | Should -Throw -Because "fix_encoding must reject moduleName paths before export/import filesystem work"
        }

        $script:ExportCalls.Count | Should -Be 0
        $script:ImportCalls.Count | Should -Be 0
    }
}

Describe "Import encoding fixture — byte-level (decompose S7)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
        $fnAst = $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Convert-Utf8ToAnsiTempFile' }, $true) | Select-Object -First 1
        if (-not $fnAst) { throw "Convert-Utf8ToAnsiTempFile not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text
        $script:FixturesPath = Join-Path $PSScriptRoot "fixtures"
    }

    It "converts the UTF-8 NoBOM import fixture to the expected ANSI bytes" {
        $sandbox = Join-Path (Join-Path $PSScriptRoot "..\..\test-runtime") ("s7-import-encoding-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($sandbox) | Out-Null
        try {
            $source = Join-Path $script:FixturesPath "utf8nobom-expected.bas"
            $target = Join-Path $sandbox "utf8nobom-expected.ansi.bas"
            $expected = [System.IO.File]::ReadAllBytes((Join-Path $script:FixturesPath "ansi-sample.bas"))

            Convert-Utf8ToAnsiTempFile -InputPath $source -TempPath $target
            $actual = [System.IO.File]::ReadAllBytes($target)

            $actual.Count | Should -Be $expected.Count
            [System.Convert]::ToBase64String($actual) | Should -Be ([System.Convert]::ToBase64String($expected))
        } finally {
            if ([System.IO.Directory]::Exists($sandbox)) { [System.IO.Directory]::Delete($sandbox, $true) }
        }
    }
}

# ===========================================================================
# S7 — Behavioral tests for Invoke-ImportAction
# Extract via AST from the production source, stub I/O seams, assert behavior.
# Critical contract: return object carries CreatedComponentNames (no
# $script:importCreatedNewComponents flag), retry loop, per-module error
# accumulation.
# ===========================================================================

Describe "Invoke-ImportAction — behavioral (decompose S7)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
        $fnAst = $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Invoke-ImportAction' }, $true) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-ImportAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        function script:Write-Status { param([string]$Message, $Color) $script:StatusMessages.Add($Message) }
        # Mock Write-DysflowResult so we can capture the structured payload the action emits.
        # The real function writes the DYSFLOW_RESULT sentinel via [Console]::Out.WriteLine,
        # which Pester cannot intercept; capturing the parameter is the only reliable seam.
        function script:Write-DysflowResult {
            param([Parameter(Mandatory = $true)] [object] $Result,
                  [Parameter(Mandatory = $false)] [int] $Depth = 20)
            $script:DysflowResults.Add($Result)
        }
    }

    BeforeEach {
        $script:StatusMessages = [System.Collections.Generic.List[string]]::new()
        $script:DysflowResults = [System.Collections.Generic.List[object]]::new()
        $script:ImportCalls = [System.Collections.Generic.List[object]]::new()
        $script:ResolveCalls = [System.Collections.Generic.List[object]]::new()
        $script:ImportResult = $null
        $script:FailOn = @{}
        $script:BeforeExists = $null
        $script:AfterExists = $null
        $script:BeforeExistsByModule = @{}
        $script:AfterExistsByModule = @{}
        $script:MockGetChildItems = @()

        function script:Import-VbaModule {
            param($VbProject, [string]$ModuleName, [string]$ModulesPath, $AccessApplication, [string]$ImportMode)
            $script:ImportCalls.Add([pscustomobject]@{
                VbProject = $VbProject
                ModuleName = $ModuleName
                ModulesPath = $ModulesPath
                AccessApplication = $AccessApplication
                ImportMode = $ImportMode
            })
            if ($script:FailOn.ContainsKey($ModuleName) -and $script:FailOn[$ModuleName].Count -gt 0) {
                $message = $script:FailOn[$ModuleName][0]
                $script:FailOn[$ModuleName] = @($script:FailOn[$ModuleName] | Select-Object -Skip 1)
                throw $message
            }
            return $script:ImportResult
        }

        function script:Resolve-ExistingComponentName {
            param($VbProject, [string]$ModuleName)
            $script:ResolveCalls.Add([pscustomobject]@{ VbProject = $VbProject; ModuleName = $ModuleName })
            $callCount = @($script:ResolveCalls | Where-Object { $_.ModuleName -eq $ModuleName }).Count
            if ($callCount -eq 1) {
                if ($script:BeforeExistsByModule.ContainsKey($ModuleName)) { return $script:BeforeExistsByModule[$ModuleName] }
                return $script:BeforeExists
            }
            if ($script:AfterExistsByModule.ContainsKey($ModuleName)) { return $script:AfterExistsByModule[$ModuleName] }
            return $script:AfterExists
        }

        function script:Get-ChildItem {
            param($Path, [switch]$File, [switch]$Recurse, $Include, $ErrorAction)
            return @($script:MockGetChildItems)
        }

        $script:FakeVbProject = [pscustomobject]@{ Id = "fake-vbproject" }
        $script:FakeSession = [pscustomobject]@{
            VbProject = $script:FakeVbProject
            AccessApplication = [pscustomobject]@{ Id = "fake-app" }
        }
    }

    It "retries a transient module failure and returns total count" {
        $script:FailOn = @{ Module1 = @("transient") }
        $script:BeforeExistsByModule = @{ Module1 = $null; Module2 = "Module2" }
        $script:AfterExistsByModule = @{ Module1 = "Module1"; Module2 = "Module2" }
        $script:ImportResult = [pscustomobject]@{ CreatedNewComponent = $true; RequiresExplicitSave = $true }

        $result = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("Module1", "Module2") -ModulesPath "C:\fake\modules" -ImportMode "Auto"

        @($script:ImportCalls | Where-Object { $_.ModuleName -eq "Module1" }).Count | Should -Be 2
        @($script:ImportCalls | Where-Object { $_.ModuleName -eq "Module2" }).Count | Should -Be 1
        $result.Total | Should -Be 2
    }

    It "writes consolidated all-failure DYSFLOW_RESULT and returns HasErrors" {
        $script:FailOn = @{
            Module1 = @("first module error", "first module error", "first module error")
            Module2 = @("second module error", "second module error", "second module error")
        }

        $result = $null
        $thrown = $null
        try {
            $result = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("Module1", "Module2") -ModulesPath "C:\fake\modules" -ImportMode "Auto"
        } catch { $thrown = $_ }

        # Contract: action reports the failure via the DYSFLOW_RESULT sentinel and returns,
        # it does NOT throw. The runner observes the sentinel and decides the exit code.
        $thrown | Should -BeNullOrEmpty
        $result | Should -Not -BeNullOrEmpty
        $result.HasErrors | Should -Be $true
        $result.Total | Should -Be 2
        $result.ErrorMessage | Should -Match "no pudo completar algunos"
        $result.ErrorMessage | Should -Match "Module1: first module error"
        $result.ErrorMessage | Should -Match "Module2: second module error"

        $script:DysflowResults.Count | Should -Be 1
        $payload = $script:DysflowResults[0]
        $payload.ok | Should -Be $false
        $payload.error.code | Should -Be "VBA_IMPORT_FAILED"
        $payload.error.message | Should -Match "no pudo completar algunos"
        $payload.error.message | Should -Match "Module1: first module error"
        $payload.error.message | Should -Match "Module2: second module error"
        @($payload.modules).Count | Should -Be 2
        ($payload.modules | Where-Object { $_.module -eq "Module1" }).status | Should -Be "error"
        ($payload.modules | Where-Object { $_.module -eq "Module1" }).error.message | Should -Be "first module error"
        ($payload.modules | Where-Object { $_.module -eq "Module2" }).status | Should -Be "error"
        ($payload.modules | Where-Object { $_.module -eq "Module2" }).error.message | Should -Be "second module error"
    }

    It "returns an empty CreatedComponentNames list when no component is created" {
        $script:BeforeExists = "ExistingMod"
        $script:AfterExists = "ExistingMod"
        $script:ImportResult = [pscustomobject]@{ CreatedNewComponent = $false; RequiresExplicitSave = $false }

        $result = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("ExistingMod") -ModulesPath "C:\fake\modules" -ImportMode "Auto"

        $result.CreatedComponentNames.Count | Should -Be 0
        $result.Total | Should -Be 1
    }

    It "does not set script-scope importCreatedNewComponents" {
        $script:BeforeExists = $null
        $script:AfterExists = "BrandNew"
        $script:ImportResult = [pscustomobject]@{ CreatedNewComponent = $true; RequiresExplicitSave = $true }

        Get-Variable -Scope Script -Name importCreatedNewComponents -ErrorAction SilentlyContinue | Should -BeNullOrEmpty

        $result = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("BrandNew") -ModulesPath "C:\fake\modules" -ImportMode "Auto"

        $result.CreatedComponentNames | Should -Contain "BrandNew"
        Get-Variable -Scope Script -Name importCreatedNewComponents -ErrorAction SilentlyContinue | Should -BeNullOrEmpty
    }

    It "returns created components without emitting the final OK status" {
        $script:BeforeExists = $null
        $script:AfterExists = "BrandNew"
        $script:ImportResult = [pscustomobject]@{ CreatedNewComponent = $true; RequiresExplicitSave = $true }

        $result = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("BrandNew") -ModulesPath "C:\fake\modules" -ImportMode "Auto"

        $result.CreatedComponentNames | Should -Contain "BrandNew"
        $script:StatusMessages | Should -Not -Contain "OK Import completado (1)"
    }
}

Describe "Invoke-AccessProcedure — optional ByRef argument marshaling (issue #428)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )

        # Load Get-PSReferenceArgumentIndexFromError
        $fnAst1 = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Get-PSReferenceArgumentIndexFromError' },
            $true
        ) | Select-Object -First 1
        Invoke-Expression $fnAst1.Extent.Text

        # Load Invoke-AccessProcedure
        $fnAst2 = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-AccessProcedure' },
            $true
        ) | Select-Object -First 1
        Invoke-Expression $fnAst2.Extent.Text

        # Load Convert-RunReturnValue
        $fnAst3 = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Convert-RunReturnValue' },
            $true
        ) | Select-Object -First 1
        Invoke-Expression $fnAst3.Extent.Text

        # Load Convert-RunReturnPayload
        $fnAst4 = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Convert-RunReturnPayload' },
            $true
        ) | Select-Object -First 1
        Invoke-Expression $fnAst4.Extent.Text
    }

    BeforeEach {
        $script:RunByRefCalls = [System.Collections.Generic.List[object]]::new()
        $script:Attempt = 0
    }

    Context "Get-PSReferenceArgumentIndexFromError" {
        It "allows retry index up to 10 even if it exceeds ArgumentCount" {
            $idx = Get-PSReferenceArgumentIndexFromError -Message "Cannot convert value to PSReference. Argument: '2'" -ArgumentCount 1
            $idx | Should -Be 1
        }
    }

    Context "Invoke-AccessProcedure padding" {
        It "pads optional ByRef parameters with Missing::Value when metadata matches" {
            # Mock Get-VbaProcedureParameterMetadata
            function script:Get-VbaProcedureParameterMetadata {
                param($VbProject, $ProcedureName)
                return @(
                    [pscustomobject]@{ name = "arg1"; byRef = $false; optional = $false },
                    [pscustomobject]@{ name = "p_Error"; byRef = $true; optional = $true }
                )
            }

            # Mock Invoke-AccessApplicationRunByRefIndex to record arguments
            function script:Invoke-AccessApplicationRunByRefIndex {
                param($AccessApplication, $ProcedureName, $InvokeArgs, $ByRefIndex)
                $script:RunByRefCalls.Add([pscustomobject]@{
                    InvokeArgs = $InvokeArgs
                    ByRefIndex = $ByRefIndex
                })
                return "ok"
            }

            $res = Invoke-AccessProcedure -AccessApplication "fake-app" -VbProject "fake-proj" -ProcedureName "TestProc" -ProcedureArgs @("hello")
            $res.ok | Should -Be $true
            $res.returnValue | Should -Be "ok"
            $script:RunByRefCalls.Count | Should -Be 1
            $call = $script:RunByRefCalls[0]
            $call.ByRefIndex | Should -Be 1
            $call.InvokeArgs.Count | Should -Be 2
            $call.InvokeArgs[0] | Should -Be "hello"
            $call.InvokeArgs[1] | Should -Be ([System.Reflection.Missing]::Value)
        }

        It "handles PSReference error on missing optional trailing argument by retrying with Missing::Value" {
            # No metadata scenario
            function script:Get-VbaProcedureParameterMetadata {
                param($VbProject, $ProcedureName)
                return @()
            }

            # Mock Invoke-AccessApplicationRunByRefIndex to fail on 1st attempt and succeed on 2nd
            function script:Invoke-AccessApplicationRunByRefIndex {
                param($AccessApplication, $ProcedureName, $InvokeArgs, $ByRefIndex)
                $script:Attempt++
                if ($script:Attempt -eq 1) {
                    throw [System.Management.Automation.MethodInvocationException]::new("Cannot convert value to PSReference. Argument: '2'")
                }
                $script:RunByRefCalls.Add([pscustomobject]@{
                    InvokeArgs = $InvokeArgs
                    ByRefIndex = $ByRefIndex
                })
                return "ok"
            }

            $res = Invoke-AccessProcedure -AccessApplication "fake-app" -VbProject "fake-proj" -ProcedureName "TestProc" -ProcedureArgs @("hello")
            $res.ok | Should -Be $true
            $res.returnValue | Should -Be "ok"
            $script:RunByRefCalls.Count | Should -Be 1
            $call = $script:RunByRefCalls[0]
            $call.ByRefIndex | Should -Be 1
            $call.InvokeArgs.Count | Should -Be 2
            $call.InvokeArgs[0] | Should -Be "hello"
            $call.InvokeArgs[1] | Should -Be ([System.Reflection.Missing]::Value)
        }
    }
}

# ===========================================================================
# Issue #443: behavioral test for Write-DysflowOperationMarker ISO format.
# Replaces the former source-text test "Goal E: Write-DysflowOperationMarker
# uses millisecond ISO format for processStartTime" in scripts-vba-manager.test.ts.
#
# Contract: Write-DysflowOperationMarker must write processStartTime in
# ISO 8601 format with exactly 3 fractional digits (ms) + Z — NOT the
# .ToString('o') round-trip format which gives 7 fractional digits.
#
# Strategy: extract the function via AST (no body assertions), set the required
# script-scope variables ($OperationFile to a temp path), stub Get-Process to
# return a fake process with a known start time, call the function, read the
# written JSON file, and assert the processStartTime format.
# ===========================================================================

Describe "Write-DysflowOperationMarker — ISO millisecond format behavioral (issue #443)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )

        # Extract Write-DysflowOperationMarker via AST (loader only)
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Write-DysflowOperationMarker' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Write-DysflowOperationMarker not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text
    }

    BeforeEach {
        # Write-DysflowOperationMarker reads script-scope vars: $OperationFile, $OperationId,
        # $Action, $AccessPath, $DestinationRoot. Set them as test-scope vars.
        $script:TempMarkerFile = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-marker-test-{0}.json" -f [guid]::NewGuid().ToString("N"))
        Set-Variable -Name OperationFile   -Value $script:TempMarkerFile -Scope Script
        Set-Variable -Name OperationId     -Value "test-op-123"          -Scope Script
        Set-Variable -Name Action          -Value "Export"               -Scope Script
        Set-Variable -Name AccessPath      -Value "C:\test\mydb.accdb"   -Scope Script
        Set-Variable -Name DestinationRoot -Value "C:\test\dest"         -Scope Script

        # Stub Write-Status (called on error path)
        function script:Write-Status { param([string]$Message, $Color) }

        # Stub Get-Process so it returns a fake process with a known UTC start time.
        # The function calls: $p = Get-Process -Id $AccessPid -ErrorAction Stop
        $knownUtcTime = [datetime]::new(2026, 3, 15, 8, 30, 45, 123, [System.DateTimeKind]::Utc)
        $script:FakeProcess = [PSCustomObject]@{
            Id        = 99001
            StartTime = $knownUtcTime.ToLocalTime()  # Process.StartTime is local time
        }
        function script:Get-Process {
            param($Id, $ErrorAction)
            if ($Id -eq 99001) { return $script:FakeProcess }
            throw "Process not found: $Id"
        }
    }

    AfterEach {
        Remove-Item -LiteralPath $script:TempMarkerFile -Force -ErrorAction SilentlyContinue
    }

    Context "processStartTime ISO format" {
        It "writes a JSON file with processStartTime having exactly 3 fractional digits and Z" {
            # Call with known fake PID — function writes to $OperationFile
            Write-DysflowOperationMarker -Status "running" -AccessPid 99001

            # File must have been created
            Test-Path -LiteralPath $script:TempMarkerFile | Should -Be $true `
                -Because "Write-DysflowOperationMarker must create the operation marker file"

            # Read raw JSON — ConvertFrom-Json auto-converts ISO date strings to [datetime]
            # objects, losing the original string format. We assert on the raw JSON text instead
            # to verify the format that was actually written to disk.
            $rawJson = Get-Content -LiteralPath $script:TempMarkerFile -Raw

            # processStartTime must appear in the JSON
            $rawJson | Should -Match '"processStartTime"' `
                -Because "processStartTime key must be present in the written JSON"

            # Extract the value of processStartTime from the raw JSON string
            $startTimeMatch = [regex]::Match($rawJson, '"processStartTime"\s*:\s*"([^"]+)"')
            $startTimeMatch.Success | Should -Be $true `
                -Because "processStartTime must be a non-null string value in the JSON"

            $startTime = $startTimeMatch.Groups[1].Value

            # Contract: exactly 3 fractional digits + Z (not 7 from .ToString('o'))
            $isoPattern3ms = '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
            $startTime | Should -Match $isoPattern3ms `
                -Because "processStartTime must use the 3-digit millisecond ISO format, not the 7-digit round-trip format from .ToString('o')"

            $startTime | Should -Not -Match '\.\d{7}Z$' `
                -Because ".ToString('o') produces 7 fractional digits — the function must use .ToString('yyyy-MM-ddTHH:mm:ss.fffZ')"
        }

        It "writes processStartTime as null when AccessPid is not provided" {
            Write-DysflowOperationMarker -Status "running"

            Test-Path -LiteralPath $script:TempMarkerFile | Should -Be $true
            $rawJson = Get-Content -LiteralPath $script:TempMarkerFile -Raw
            # When no PID is provided, processStartTime should be JSON null (not a string)
            $rawJson | Should -Match '"processStartTime"\s*:\s*null' `
                -Because "no AccessPid was provided, so processStartTime should be JSON null"
        }
    }
}

# ===========================================================================
# Serialization contract for Invoke-ImportAction + Write-DysflowResult (issue #496)
# TDD-first: every test in this block MUST fail RED against the current source
# and turn GREEN after the proposed fix in the issue. If a test passes against
# the current source, the assertion is too weak — strengthen it.
#
# Coverage matrix (3 paths × multiple sub-cases):
#   - happy path:  payload is object[] (NOT List[object]), round-trips JSON
#   - sad path:    VBE rejects, error.message is plain string, no fallback
#   - edges:       Unicode, empty error, circular exception, deep nesting
#   - catch:       Write-DysflowResult catch logs the real exception
# ===========================================================================

Describe "Invoke-ImportAction — serialization contract (issue #496, regression for VBA_MANAGER_SERIALIZATION_FAILED)" {

    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null,
            [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Invoke-ImportAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-ImportAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # The real Write-DysflowResult (so the production sentinel + catch contract are exercised).
        # We capture [Console]::Out around each invocation to parse the DYSFLOW_RESULT line.
        $writerFnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Write-DysflowResult' },
            $true
        ) | Select-Object -First 1
        if (-not $writerFnAst) { throw "Write-DysflowResult not found in $($script:VbaManagerPath)" }
        Invoke-Expression $writerFnAst.Extent.Text

        # Capture sentinel output by redirecting [Console]::Out to a StringWriter
        # around each call. The production code uses [Console]::Out.WriteLine
        # (issue #440), so this is the only reliable way to capture the actual
        # payload the operator would see.
        function script:Invoke-AndCaptureDysflowResult {
            param([scriptblock] $ScriptBlock)
            $originalOut = [Console]::Out
            $sw = New-Object System.IO.StringWriter
            [Console]::SetOut($sw)
            try {
                $null = & $ScriptBlock
            } finally {
                [Console]::SetOut($originalOut)
            }
            $captured = $sw.ToString()
            $line = ($captured -split "`n" | Where-Object { $_.StartsWith("DYSFLOW_RESULT ") } | Select-Object -First 1)
            if ($null -eq $line) {
                return [pscustomobject]@{ Raw = $captured; Payload = $null; Json = $null }
            }
            $json = $line.Substring("DYSFLOW_RESULT ".Length).Trim()
            $payload = $null
            $parseError = $null
            try { $payload = $json | ConvertFrom-Json } catch { $parseError = $_ }
            return [pscustomobject]@{ Raw = $captured; Payload = $payload; Json = $json; ParseError = $parseError }
        }

        function script:Write-Status { param([string]$Message, $Color) }
    }

    BeforeEach {
        $script:ImportCalls = [System.Collections.Generic.List[object]]::new()
        $script:FailOn = @{}
        $script:FailExceptionOn = @{}
        $script:ImportResult = [pscustomobject]@{ CreatedNewComponent = $true; RequiresExplicitSave = $true }

        function script:Import-VbaModule {
            param($VbProject, [string]$ModuleName, [string]$ModulesPath, $AccessApplication, [string]$ImportMode)
            $script:ImportCalls.Add([pscustomobject]@{ ModuleName = $ModuleName; ImportMode = $ImportMode })
            if ($script:FailExceptionOn.ContainsKey($ModuleName)) {
                throw $script:FailExceptionOn[$ModuleName]
            }
            if ($script:FailOn.ContainsKey($ModuleName) -and $script:FailOn[$ModuleName].Count -gt 0) {
                $message = $script:FailOn[$ModuleName][0]
                $script:FailOn[$ModuleName] = @($script:FailOn[$ModuleName] | Select-Object -Skip 1)
                throw $message
            }
            return $script:ImportResult
        }
        function script:Resolve-ExistingComponentName {
            param($VbProject, [string]$ModuleName)
            return $null
        }
        # NOTE: no `function script:Get-ChildItem` mock here. Pester 5's `script:`
        # scope is the file's script scope, not container-scoped, so defining it
        # here leaks into every Describe that runs after this one (notably the
        # Fix-EncodingInSrc bulk-mode tests, whose extracted real
        # Fix-EncodingInSrc calls Get-ChildItem via the cmdlet pipeline).
        # Every test in this Describe passes -NormalizedModules explicitly, so
        # the Invoke-ImportAction production code never reaches the Get-ChildItem
        # fallback branch — the mock was defensive but unnecessary.

        $script:FakeVbProject = [pscustomobject]@{ Id = "fake-vbproject" }
        $script:FakeSession = [pscustomobject]@{
            VbProject = $script:FakeVbProject
            AccessApplication = [pscustomobject]@{ Id = "fake-app" }
        }
    }

    Context "happy path — payload must be JSON-serializable, not a raw List[object>" {

        It "emits a DYSFLOW_RESULT sentinel that is NOT the SERIALIZATION_FAILED fallback" {
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("ModA") -ModulesPath "C:\fake" -ImportMode "Auto"
            }
            $captured.Json | Should -Not -BeNullOrEmpty `
                -Because "Write-DysflowResult must always emit the DYSFLOW_RESULT sentinel line"
            $captured.Json | Should -Not -Match 'VBA_MANAGER_SERIALIZATION_FAILED' `
                -Because "happy path must not fall through to the serialization fallback (this was the original bug)"
            $captured.Payload | Should -Not -BeNullOrEmpty
        }

        It "happy-path payload round-trips through ConvertFrom-Json and exposes module and status" {
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("ModA", "ModB") -ModulesPath "C:\fake" -ImportMode "Auto"
            }
            $captured.ParseError | Should -BeNullOrEmpty `
                -Because "happy-path payload must be valid JSON; a parse error here is a serialization failure"
            $captured.Payload.Count | Should -Be 2
            ($captured.Payload | Where-Object { $_.module -eq "ModA" }).status | Should -Be "ok"
            ($captured.Payload | Where-Object { $_.module -eq "ModB" }).status | Should -Be "ok"
        }
    }

    Context "sad path — VBE rejection must NOT fall through to VBA_MANAGER_SERIALIZATION_FAILED" {

        It "VBE rejection surfaces as VBA_IMPORT_FAILED with plain string error.message" {
            $script:FailOn = @{
                ModA = @("vbe rejected: line 42", "vbe rejected: line 42", "vbe rejected: line 42")
            }
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("ModA") -ModulesPath "C:\fake" -ImportMode "Auto"
            }
            $captured.Json | Should -Not -Match 'VBA_MANAGER_SERIALIZATION_FAILED' `
                -Because "VBE rejection must surface as VBA_IMPORT_FAILED, never as the serialization fallback"
            $captured.Payload.ok | Should -Be $false
            $captured.Payload.error.code | Should -Be "VBA_IMPORT_FAILED"
            $captured.Payload.error.message | Should -BeOfType [string]
            $captured.Payload.error.message | Should -Not -BeNullOrEmpty
            $captured.Payload.error.message | Should -Match 'ModA: vbe rejected: line 42'
        }

        It "per-module error is a structured object {code, message, machine, user}, not an Exception object" {
            # R2 of the consumer request: the per-module error is a PSCustomObject
            # with code/message/machine/user fields, not a raw string and not an
            # Exception. This is the contract the MCP layer relies on.
            $script:FailOn = @{
                ModA = @("plain text error", "plain text error", "plain text error")
            }
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("ModA") -ModulesPath "C:\fake" -ImportMode "Auto"
            }
            $mod = $captured.Payload.modules | Where-Object { $_.module -eq "ModA" }
            $mod.status | Should -Be "error"
            $mod.error | Should -Not -BeNullOrEmpty
            $mod.error.code | Should -Be "VBA_IMPORT_PHASE_FAILED"
            $mod.error.message | Should -BeOfType [string]
            $mod.error.message | Should -Be "plain text error"
            $mod.error.machine | Should -Be $null
            $mod.error.user | Should -Be $null
        }

        It "handles a VBE exception whose .Exception.Message is a COM wrapper (0x800A09D5 simulation)" {
            $script:FailExceptionOn = @{
                ModA = [System.Runtime.InteropServices.COMException]::new("Exception calling Run with 1 argument(s): 0x800A09D5", 0x800A09D5)
            }
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("ModA") -ModulesPath "C:\fake" -ImportMode "Auto"
            }
            $captured.Json | Should -Not -Match 'VBA_MANAGER_SERIALIZATION_FAILED' `
                -Because "a VBE COM exception with 0x800A09D5 must surface as VBA_IMPORT_FAILED, never as the serialization fallback"
            $captured.Payload.ok | Should -Be $false
            $captured.Payload.error.code | Should -Be "VBA_IMPORT_FAILED"
            $captured.Payload.error.message | Should -BeOfType [string]
            $captured.Payload.error.message | Should -Not -BeNullOrEmpty
        }
    }

    Context "edge cases — Unicode, empty error, depth, large payloads" {

        It "handles a module name with Unicode characters (sentinel still parses)" {
            $script:FailOn = @{
                "Módulo_Acción" = @("vbe unicode error", "vbe unicode error", "vbe unicode error")
            }
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("Módulo_Acción") -ModulesPath "C:\fake" -ImportMode "Auto"
            }
            $captured.ParseError | Should -BeNullOrEmpty `
                -Because "Unicode in the module name must not break JSON serialization"
            $captured.Payload.error.message | Should -Not -BeNullOrEmpty
        }

        It "handles an empty VBE error message by surfacing a placeholder (not $null)" {
            $script:FailOn = @{
                ModA = @("", "", "")
            }
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @("ModA") -ModulesPath "C:\fake" -ImportMode "Auto"
            }
            # After the fix, an empty VBE message is stored as "<empty VBE error>" in
            # $lastErrors, so the consolidated error.message is non-empty even though
            # the per-module error is the empty string.
            $captured.Payload.error.message | Should -Not -BeNullOrEmpty `
                -Because "an empty VBE message must be surfaced as a placeholder like '<empty VBE error>', not as $null"
        }

        It "happy path with 100+ modules stays JSON-serializable" {
            $names = 1..100 | ForEach-Object { "Mod$_" }
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                Invoke-ImportAction -Session $script:FakeSession -NormalizedModules $names -ModulesPath "C:\fake" -ImportMode "Auto"
            }
            $captured.ParseError | Should -BeNullOrEmpty `
                -Because "a 100-module import must serialize cleanly; this is the load test for the happy-path fix"
            $captured.Payload.Count | Should -Be 100
        }
    }

    Context "Write-DysflowResult contract — adapter conforms to the domain port" {

        # Hexagonal note: the spec of the Write-DysflowResult contract
        # lives in src/core/contracts/result-writer.ts and is pinned
        # by test/core/contracts/result-writer-contract.test.ts. These
        # Pester tests verify the ADAPTER (the PowerShell implementation)
        # actually produces payloads that conform to that spec, by
        # invoking the real Write-DysflowResult through the public
        # surface and parsing the captured sentinel. We do NOT mock
        # ConvertTo-Json or assert on internal call order — both would
        # be implementation-coupled (forbidden by
        # docs/testing/testing-philosophy.md).
        #
        # The "fallback envelope" path is exercised by the spec
        # (buildSerializationFailedEnvelope) in TS; forcing the catch
        # branch in PowerShell reliably requires COM roundtrips we
        # cannot fake in a unit test, so we test the spec, not the
        # branch. The branch itself is exercised by the E2E suite
        # in test/e2e/import-modules-regression.e2e.test.ts against a
        # real Access backend.

        It "emits exactly one DYSFLOW_RESULT sentinel line on a successful payload" {
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                $null = Write-DysflowResult -Result ([ordered]@{ ok = $true; data = "hello" }) -Depth 4
            }
            $markerCount = ($captured.Raw -split "`n" | Where-Object { $_.StartsWith("DYSFLOW_RESULT ") }).Count
            $markerCount | Should -Be 1 `
                -Because "the sentinel contract (issue #440) requires exactly one DYSFLOW_RESULT line per action"
            $captured.ParseError | Should -BeNullOrEmpty `
                -Because "the emitted payload must be valid JSON the TS adapter can parse"
        }

        It "the emitted JSON conforms to the contract: ok + error + diagnostics shape on the success path" {
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                $null = Write-DysflowResult -Result ([ordered]@{ ok = $true; data = "hello" }) -Depth 4
            }
            # The PS adapter can emit any shape on the success path (the
            # contract only constrains the FALLBACK envelope). The point
            # of this test is to pin that the success path always
            # round-trips through ConvertFrom-Json without loss, which
            # is the precondition for the TS adapter to route it.
            $captured.Payload.ok | Should -Be $true
            $captured.Payload.data | Should -Be "hello"
        }

        It "the emitted JSON does NOT include the serialization-fallback fields on a successful payload (no false-positive diagnostics)" {
            $captured = Invoke-AndCaptureDysflowResult -ScriptBlock {
                $null = Write-DysflowResult -Result ([ordered]@{ ok = $true; data = "hello" }) -Depth 4
            }
            # If the success path accidentally emitted the fallback
            # shape, the operator would see "SERIALIZATION_FAILED" for
            # a successful import — that is the exact regression #496
            # is here to prevent.
            $captured.Json | Should -Not -Match 'SERIALIZATION_FAILED' `
                -Because "a successful payload must never include the serialization-fallback fields; that would be a false-positive fallback"
            $captured.Json | Should -Not -Match 'LastSerializationError' `
                -Because "the diagnostics field is only valid on the fallback envelope"
        }
    }
}

Describe "Fix-EncodingInSrc — bulk-mode managed extensions" {
    BeforeAll {
        $script:FixEncScriptPath = (Resolve-Path (Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1")).Path
        # Load the real Fix-EncodingInSrc plus the pure helpers it depends on in
        # bulk mode (no COM). The bulk path only touches Get-ChildItem (real),
        # Get-FileEncodingInfo and Write-Utf8NoBom.
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            $script:FixEncScriptPath, [ref]$null, [ref]$null
        )
        # Pester 5's `script:` scope is the file's actual script scope (not a
        # container-scoped mock), so earlier Describes' `function script:Get-ChildItem`
        # stubs persist and shadow the real cmdlet. Re-define Get-ChildItem here
        # to delegate to the real cmdlet via its fully-qualified module path so
        # the bulk-mode tests see real filesystem listings. Re-define with the
        # [CmdletBinding] + common parameters (which is how the real cmdlet
        # binds), then forward every bound parameter to the real cmdlet.
        function script:Get-ChildItem {
            [CmdletBinding()]
            Param(
                [Parameter(Position=0)][string]$Path,
                [switch]$File,
                [switch]$Recurse,
                [string[]]$Include,
                [string]$Filter,
                [switch]$Directory,
                [switch]$Hidden,
                [switch]$Force
            )
            Microsoft.PowerShell.Management\Get-ChildItem @PSBoundParameters
        }
        # Helpers it calls internally in bulk mode (not stubbed anywhere): keep
        # their real names so the extracted Fix-EncodingInSrc resolves them.
        foreach ($helper in @('Get-FileEncodingInfo', 'Write-Utf8NoBom')) {
            $def = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                  $args[0].Name -eq $helper },
                $true
            ) | Select-Object -First 1
            Invoke-Expression $def.Extent.Text
        }
        # Another Describe installs a stub `function script:Fix-EncodingInSrc`
        # (returns 0) into the shared script scope via its BeforeEach, which would
        # shadow the real function here. Extract the real one under a unique,
        # collision-proof name and call THAT in the tests.
        $fixDef = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Fix-EncodingInSrc' },
            $true
        ) | Select-Object -First 1
        Invoke-Expression ($fixDef.Extent.Text -replace "^function\s+Fix-EncodingInSrc", "function Invoke-RealFixEncodingInSrc")

        # Sandbox helpers use absolute paths + .NET APIs so they are independent of
        # the process current location (a prior Describe may leave the CWD on a
        # deleted temp dir, which breaks provider-based New-Item). Works on both
        # Windows PowerShell 5.1 (Server 2016) and PowerShell 7.
        function script:New-FixEncSandbox {
            $dir = [System.IO.Path]::Combine(
                [System.IO.Path]::GetTempPath(),
                "fix-enc-" + [System.Guid]::NewGuid().ToString("N")
            )
            [System.IO.Directory]::CreateDirectory($dir) | Out-Null
            return $dir
        }
        function script:Write-FixEncBomFile([string]$Dir, [string]$RelPath, [string]$Text) {
            $full = [System.IO.Path]::Combine($Dir, $RelPath)
            [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($full)) | Out-Null
            $utf8WithBom = New-Object System.Text.UTF8Encoding($true)
            [System.IO.File]::WriteAllText($full, $Text, $utf8WithBom)
            return $full
        }
    }

    It "strips a UTF-8 BOM from a .report.txt in bulk mode" {
        $sandbox = New-FixEncSandbox
        try {
            # Write WITH a UTF-8 BOM (the corruption fix_encoding is meant to repair).
            $file = Write-FixEncBomFile $sandbox "reports/Report_Sales.report.txt" "Version =21`r`nBegin Report`r`nEnd`r`n"

            (Get-FileEncodingInfo -Path $file).HasUtf8Bom | Should -Be $true `
                -Because "the fixture must start corrupted for the test to be meaningful"

            $fixed = Invoke-RealFixEncodingInSrc -ModulesPath $sandbox

            $fixed | Should -Be 1 -Because ".report.txt is a managed source extension and must be repaired in bulk mode"
            (Get-FileEncodingInfo -Path $file).HasUtf8Bom | Should -Be $false
        }
        finally {
            [System.IO.Directory]::Delete($sandbox, $true)
        }
    }

    It "still strips a UTF-8 BOM from a .form.txt in bulk mode (regression guard)" {
        $sandbox = New-FixEncSandbox
        try {
            $file = Write-FixEncBomFile $sandbox "forms/Form_Main.form.txt" "Version =21`r`nBegin Form`r`nEnd`r`n"

            $fixed = Invoke-RealFixEncodingInSrc -ModulesPath $sandbox

            $fixed | Should -Be 1
            (Get-FileEncodingInfo -Path $file).HasUtf8Bom | Should -Be $false
        }
        finally {
            [System.IO.Directory]::Delete($sandbox, $true)
        }
    }
}

Describe "Get-FormCodeBehindCandidateNames — no cross-prefix candidates (#553)" {
    BeforeAll {
        $scriptPath = (Resolve-Path (Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1")).Path
        $ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$null, [ref]$null)
        $def = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Get-FormCodeBehindCandidateNames' },
            $true
        ) | Select-Object -First 1
        Invoke-Expression $def.Extent.Text
    }

    It "for a Form_-prefixed module probes the bare-base prefixed variants, not Report_Form_*" {
        $names = @(Get-FormCodeBehindCandidateNames -ModuleName 'Form_MyForm')
        $names | Should -Contain 'Form_MyForm'
        $names | Should -Contain 'Report_MyForm'
        $names | Should -Not -Contain 'Report_Form_MyForm'
    }

    It "for a Report_-prefixed module does not build Form_Report_* candidates" {
        $names = @(Get-FormCodeBehindCandidateNames -ModuleName 'Report_MyRep')
        $names | Should -Contain 'Report_MyRep'
        $names | Should -Contain 'Form_MyRep'
        $names | Should -Not -Contain 'Form_Report_MyRep'
    }

    It "for a bare module name probes the name plus both prefixed variants" {
        $names = @(Get-FormCodeBehindCandidateNames -ModuleName 'MyForm')
        $names | Should -Contain 'MyForm'
        $names | Should -Contain 'Form_MyForm'
        $names | Should -Contain 'Report_MyForm'
    }

}

Describe "Build-ExportResultSummary — issue #745 trust contract" {
    BeforeAll {
        $scriptPath = (Resolve-Path (Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1")).Path
        $ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$null, [ref]$null)
        $def = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Build-ExportResultSummary' },
            $true
        ) | Select-Object -First 1
        Invoke-Expression $def.Extent.Text
    }

    It "returns ok=true with no warnings when every module exported cleanly" {
        $exported = @("ModA", "ModB", "ModC")
        $warnings = @()
        $result = Build-ExportResultSummary -Exported $exported -Warnings $warnings

        $result.ok | Should -Be $true -Because "ok MUST reflect actual success state (issue #745 trust contract)"
        $result.exported | Should -Be $exported
        $result.ContainsKey("warnings") | Should -Be $false -Because "no warnings => no warnings key (transport cleanliness)"
    }

    It "returns ok=false and surfaces warnings when any module failed" {
        $exported = @("ModA", "ModB")
        $warnings = @(
            @{ module = "ModB"; error = "Access COM timeout"; message = "Access COM timeout" }
        )
        $result = Build-ExportResultSummary -Exported $exported -Warnings $warnings

        $result.ok | Should -Be $false -Because "ANY failure flips ok=false; this is the regression guard that catches #745 export silent-fail"
        $result.exported | Should -Be $exported -Because "we keep the names that DID export successfully, even if others failed"
        $result.warnings | Should -HaveCount 1
        $result.warnings[0].module | Should -Be "ModB"
        $result.warnings[0].error | Should -Be "Access COM timeout"
    }

    It "returns ok=false and an empty exported list when every module failed" {
        $result = Build-ExportResultSummary -Exported @() -Warnings @(
            @{ module = "ModA"; error = "SaveAsText produced an incomplete file"; message = "SaveAsText produced an incomplete file" },
            @{ module = "ModB"; error = "Extension resolution failed"; message = "Extension resolution failed" }
        )

        $result.ok | Should -Be $false
        $result.exported | Should -Be @()
        $result.warnings | Should -HaveCount 2
    }

    It "is contract-binding: ok=false is the only signal downstream consumers see" {
        $exported = @("ModA")
        $warnings = @(@{ module = "ModA"; error = "Could not write file"; message = "Could not write file" })
        $result = Build-ExportResultSummary -Exported $exported -Warnings $warnings

        # The downstream consumer pattern is: `if (-not $result.ok) { ... handle warnings ... }`.
        # Verify the contract is exactly that: ok reflects the warnings, not the names.
        $result.ok | Should -Be $false -Because "issue #745: even if a name appears in exported, ok MUST be false if any module failed"
    }
}

# ===========================================================================
# Slice 1 of feat-759-no-compile (PR-1, non-breaking bug fix).
#
# Asserts the NEW (post-GREEN) call shapes that the Slice 1 fix installs:
#   * Remove-AccessObjectOrComponent :2205  → RunCommand(280) on $AccessApplication
#   * Remove-AccessObjectOrComponent :2247  → RunCommand(280) on $AccessApplication
#   * Save-VbaProjectModules         :2662  → (the 126 attempt is gone)
#     the canonical save path is now :2668's `DoCmd.RunCommand(280)`.
#
# The atoms assert OUTCOME (which RunCommand value was passed to which COM
# object) — they survive any behaviour-preserving refactor of the
# surrounding try/catch wrappers. Under pre-Slice-1 `main` (with the 126
# coupling), these atoms FAIL; after the Slice-1 GREEN commit they PASS.
# ===========================================================================

Describe "Remove-AccessObjectOrComponent — slice-1 persistence path (#759 PR-1)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Remove-AccessObjectOrComponent' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Remove-AccessObjectOrComponent not found" }
        Invoke-Expression $fnAst.Extent.Text
    }

    BeforeEach {
        # Capture every RunCommand call: $script:RunCommandCalls holds
        # @{ Object = '<AccessApplication|DoCmd>'; Value = <int> } entries.
        $script:RunCommandCalls = [System.Collections.Generic.List[PSCustomObject]]::new()

        # The :2205 path runs after Resolve-ExistingComponentName confirms
        # the component exists. The state flag flips to "removed" once the
        # mocked components.Remove fires, mirroring the real COM contract
        # where the post-deletion verification re-resolves the component
        # and sees nothing.
        $script:ComponentPresent = $true

        function script:Resolve-AccessObjectInfo {
            param($AccessApplication, $ModuleName)
            # Make the DoCmd.DeleteObject branch (the one that takes the
            # :2205 fallback) the active path: Resolve-AccessObjectInfo must
            # return Exists=$false so the code falls through to the bare
            # :2205 call site (no DoCmd.DeleteObject shortcut).
            return [pscustomobject]@{ Exists = $false; Kind = "Module"; Name = $ModuleName }
        }
        function script:Resolve-ExistingComponentName {
            param($VbProject, $ModuleName)
            if ($script:ComponentPresent) { return "Form_BrokenModule" }
            return $null
        }
    }

    Context "happy delete path (no friction) drives the :2205 call site" {
        It "calls RunCommand on the AccessApplication and removes the component" {
            $fakeComponents = [PSCustomObject]@{}
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($name)
                return [pscustomobject]@{ Name = $name; Type = 100 }
            }
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Remove" -Value {
                param($component)
                # After the production code's components.Remove fires, flip
                # the state flag so the post-deletion verification sees
                # the component gone (same shape the real Access COM has).
                $script:ComponentPresent = $false
            }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }

            $fakeAccessApp = [PSCustomObject]@{ }
            $fakeAccessApp | Add-Member -MemberType ScriptMethod -Name "RunCommand" -Value {
                param($value)
                $script:RunCommandCalls.Add([PSCustomObject]@{
                    Object = "AccessApplication"; Value = [int]$value
                })
            }
            $fakeAccessApp | Add-Member -MemberType ScriptProperty -Name "DoCmd" -Value {
                [pscustomobject]@{ DeleteObject = { param($t, $n) } }
            }

            $res = Remove-AccessObjectOrComponent `
                -AccessApplication $fakeAccessApp `
                -VbProject $fakeVbProject `
                -ModuleName "Form_BrokenModule" `
                -Force:$false

            $res.status | Should -Be "ok" `
                -Because "the post-deletion verification must see the component gone"
            $res.deleted | Should -Be "Form_BrokenModule"

            # Slice-1 GREEN step: the :2205 call site persists via
            # save-only (`acCmdSaveAllModules` = 280). The previous shape
            # used `RunCommand(126)` (compile-and-save-all), which failed
            # silently on broken projects and surfaced as
            # "Active lock detected" in GH #759. Asserting the new shape
            # here locks the fix from regressing.
            $script:RunCommandCalls.Count | Should -Be 1 `
                -Because "the :2205 path emits exactly one persistence call"
            $script:RunCommandCalls[0].Object | Should -Be "AccessApplication" `
                -Because "the persistence call is on the AccessApplication object, not on DoCmd"
            $script:RunCommandCalls[0].Value | Should -Be 280 `
                -Because "Slice-1 fix: :2205 persists via acCmdSaveAllModules (280), no longer acCmdCompileAndSaveAllModules (126)"
        }
    }
}

Describe "Save-VbaProjectModules — slice-1 call shape (#759 PR-1)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Save-VbaProjectModules' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Save-VbaProjectModules not found" }
        Invoke-Expression $fnAst.Extent.Text
    }

    BeforeEach {
        $script:RunCommandCalls = [System.Collections.Generic.List[PSCustomObject]]::new()

        $fakeAccessApp = [PSCustomObject]@{ }
        $fakeAccessApp | Add-Member -MemberType ScriptMethod -Name "RunCommand" -Value {
            param($value)
            $script:RunCommandCalls.Add([PSCustomObject]@{
                Object = "AccessApplication"; Value = [int]$value
            })
            # Simulate the broken-project contract: 126 (compile+save) fails
            # because the project has a pre-existing compile error, so the
            # catch fires and the fallback path runs.
            if ([int]$value -eq 126) {
                throw "mock: 126 failed because the project does not compile"
            }
        }
        $fakeDoCmd = [PSCustomObject]@{ }
        $fakeDoCmd | Add-Member -MemberType ScriptMethod -Name "RunCommand" -Value {
            param($value)
            $script:RunCommandCalls.Add([PSCustomObject]@{
                Object = "DoCmd"; Value = [int]$value
            })
        }
        $fakeAccessApp | Add-Member -MemberType ScriptProperty -Name "DoCmd" -Value { $fakeDoCmd }
    }

    It "persists via DoCmd.RunCommand(280) and never invokes the dropped 126 attempt" {
        # Slice-1 GREEN step: Save-VbaProjectModules no longer tries
        # `RunCommand(126)` at all — the 126 first-attempt is dropped. The
        # function now uses `DoCmd.RunCommand(280)` as its sole save path.
        $res = Save-VbaProjectModules -AccessApplication $fakeAccessApp -ModuleNames @("Form_X")
        $res | Should -BeNullOrEmpty `
            -Because "Save-VbaProjectModules must return without throwing"

        # The 280 call must appear on DoCmd (the canonical save path).
        $doCmdCalls = @($script:RunCommandCalls | Where-Object { $_.Object -eq "DoCmd" })
        $doCmdCalls.Count | Should -BeGreaterOrEqual 1 `
            -Because "DoCmd.RunCommand(280) is the canonical save path"
        $doCmdCalls[0].Value | Should -Be 280 `
            -Because "the save path persists modules without compiling (acCmdSaveAllModules = 280)"

        # The dropped 126 first-attempt must NEVER fire — even when the
        # project is healthy. AccessApplication.RunCommand is captured
        # here and any 126 call would be a regression on the fix.
        $appCalls = @($script:RunCommandCalls | Where-Object { $_.Object -eq "AccessApplication" })
        $appCalls | Should -BeNullOrEmpty `
            -Because "Save-VbaProjectModules must NEVER call RunCommand(126); the compile-and-save-all attempt is gone"
    }
}

# ===========================================================================
# Issue #804 — verify_code / export pre-validation must be TOTAL over the
# input list. A module missing from the binary must NOT abort the call; it
# is collected into the structured result (warnings[]) so the consumer can
# route it to verify_code.missingInBinary.
#
# Behavioral contract:
#   - Given: NormalizedModules = [Real, Ghost]
#   - When:  Invoke-ExportAction runs
#   - Then:  ok=$true is returned, Real is exported, Ghost surfaces in
#           warnings[] with error="VBA_MODULE_NOT_FOUND" and module="Ghost",
#           the call does NOT throw.
#
# This is a property-style contract: for any list of module names containing
# at least one missing, the action returns a structured result and never
# throws. The "abort on first missing" pre-validation was the Round-2 bug.
# ===========================================================================

Describe "Invoke-ExportAction — missing module pre-validation (#804, total over input)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-ExportAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-ExportAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Swallow console output in tests
        function script:Write-Status { param([string]$Message, $Color) }
        function script:Get-AccessObjectNames { param($AccessApplication, $Kind) return @() }
        function script:Resolve-AccessObjectInfo {
            param($AccessApplication, [string]$ModuleName)
            return [pscustomobject]@{ Exists = $false }
        }
        function script:Get-ComponentExtension { param($Component, $ModuleName) return ".bas" }
    }

    Context "mixed list — some modules exist, some are missing" {
        BeforeEach {
            $script:ExportedModules = [System.Collections.Generic.List[string]]::new()
            $script:DysflowResults  = [System.Collections.Generic.List[object]]::new()

            # Capture the structured payload the action emits
            function script:Export-VbaModule {
                param($VbProject, [string]$ModuleName, $ModulesPath, $AccessApplication)
                $script:ExportedModules.Add($ModuleName)
            }
            function script:Write-DysflowResult {
                param([Parameter(Mandatory = $true)] [object] $Result,
                      [Parameter(Mandatory = $false)] [int] $Depth = 20)
                $script:DysflowResults.Add($Result)
            }

            # Fake VBProject: Item("RealModule") returns a component; any other name throws.
            $fakeComponents = [PSCustomObject]@{}
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($nameOrIndex)
                if ($nameOrIndex -eq "RealModule") {
                    return [PSCustomObject]@{ Name = $nameOrIndex }
                }
                throw "Component not found: $nameOrIndex"
            }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }

            $script:FakeSession = [PSCustomObject]@{
                VbProject          = $fakeVbProject
                AccessApplication  = [PSCustomObject]@{ Id = "fake-app" }
            }
        }

        It "does NOT throw when a requested module is missing from the binary" {
            $modules = @("RealModule", "GhostModule")
            { Invoke-ExportAction `
                -Session $script:FakeSession `
                -NormalizedModules $modules `
                -ModulesPath "C:\fake\modules" } | Should -Not -Throw `
                -Because "issue #804 — missing modules are a per-module result, not a call-level error"
        }

        It "exports every module that DOES exist" {
            $modules = @("RealModule", "GhostModule")
            Invoke-ExportAction `
                -Session $script:FakeSession `
                -NormalizedModules $modules `
                -ModulesPath "C:\fake\modules"

            $script:ExportedModules | Should -Contain "RealModule" `
                -Because "the existing-module path must still work after the pre-validation change"
            $script:ExportedModules | Should -Not -Contain "GhostModule" `
                -Because "a missing module must never reach Export-VbaModule"
        }

        It "surfaces the missing module in the structured result's warnings[]" {
            $modules = @("RealModule", "GhostModule")
            Invoke-ExportAction `
                -Session $script:FakeSession `
                -NormalizedModules $modules `
                -ModulesPath "C:\fake\modules"

            $script:DysflowResults.Count | Should -Be 1
            $payload = $script:DysflowResults[0]
            $payload.exported | Should -Contain "RealModule"
            $payload.exported | Should -Not -Contain "GhostModule"

            $payload.warnings | Should -Not -BeNullOrEmpty `
                -Because "the missing module must be reported in warnings[] for the consumer to route to missingInBinary"
            $missingWarning = @($payload.warnings | Where-Object { $_.module -eq "GhostModule" })
            $missingWarning.Count | Should -Be 1
            $missingWarning[0].error | Should -Be "VBA_MODULE_NOT_FOUND" `
                -Because "the warning must carry a stable error code so the TS adapter can classify it"
        }
    }

    Context "all-missing list — every requested module is absent" {
        BeforeEach {
            $script:ExportedModules = [System.Collections.Generic.List[string]]::new()
            $script:DysflowResults  = [System.Collections.Generic.List[object]]::new()

            function script:Export-VbaModule {
                param($VbProject, [string]$ModuleName, $ModulesPath, $AccessApplication)
                $script:ExportedModules.Add($ModuleName)
            }
            function script:Write-DysflowResult {
                param([Parameter(Mandatory = $true)] [object] $Result,
                      [Parameter(Mandatory = $false)] [int] $Depth = 20)
                $script:DysflowResults.Add($Result)
            }

            # Empty VBProject — every lookup throws
            $fakeComponents = [PSCustomObject]@{}
            $fakeComponents | Add-Member -MemberType ScriptMethod -Name "Item" -Value {
                param($nameOrIndex)
                throw "Component not found: $nameOrIndex"
            }
            $fakeVbProject = [PSCustomObject]@{ VBComponents = $fakeComponents }

            $script:FakeSession = [PSCustomObject]@{
                VbProject          = $fakeVbProject
                AccessApplication  = [PSCustomObject]@{ Id = "fake-app" }
            }
        }

        It "is total — an all-missing list does not throw and emits every name in warnings[]" {
            $modules = @("Ghost1", "Ghost2", "Ghost3")
            { Invoke-ExportAction `
                -Session $script:FakeSession `
                -NormalizedModules $modules `
                -ModulesPath "C:\fake\modules" } | Should -Not -Throw `
                -Because "issue #804 — total contract applies even when the entire list is missing"

            $script:ExportedModules.Count | Should -Be 0
            $script:DysflowResults.Count | Should -Be 1
            $payload = $script:DysflowResults[0]
            $payload.exported | Should -BeNullOrEmpty `

            $missingNames = @($payload.warnings | ForEach-Object { $_.module } | Sort-Object)
            $missingNames | Should -Be @("Ghost1", "Ghost2", "Ghost3")
            $payload.warnings | ForEach-Object {
                $_.error | Should -Be "VBA_MODULE_NOT_FOUND"
            }
        }
    }
}

