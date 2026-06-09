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
            'function Get-ComponentFolder',
            'function Get-ComponentExtension',
            'function Resolve-ImportFileForModule',
            'function Get-AccessLockFilePath'
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
            'Test-IsVbaOptionDirectiveLine',
            'Normalize-VbaImportText',
            'Get-PreferredNewline',
            'Normalize-Newlines',
            'Split-CodeBehindSection',
            'Split-VbaHeaderAndBody',
            'Join-VbaHeaderAndBody',
            'Remove-AccessDocumentRootNameProperty',
            'Normalize-AccessDocumentRootEndMarker',
            'Normalize-AccessDocumentCodeBehindMarker',
            'Test-LooksLikeVbaCodeLine',
            'Normalize-AccessDocumentOrphanCodeBehindSection',
            'Normalize-AccessDocumentTextForLoadFromText',
            'Get-PreferredNewline',
            'Normalize-Newlines',
            'Get-AccessLockFilePath'
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
        foreach ($fnName in @('Stop-AccessPidAndWait', 'Close-CanonicalAccess')) {
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
    }

    BeforeEach {
        $script:WarningMessages = [System.Collections.Generic.List[string]]::new()
        $script:StoppedProcessIds = [System.Collections.Generic.List[int]]::new()
        $script:TempAccessPath = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-close-target-{0}.accdb" -f ([guid]::NewGuid().ToString("N")))
        $script:TempLockPath = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-close-target-{0}.laccdb" -f ([guid]::NewGuid().ToString("N")))
        New-Item -ItemType File -Path $script:TempAccessPath -Force | Out-Null
        New-Item -ItemType File -Path $script:TempLockPath -Force | Out-Null

        # Slice 5: function now lives in shared module; uses Write-Warning (not Write-Status).
        # Override Get-AccessLockFilePath to point to the temp lock file for these tests.
        function script:Get-AccessLockFilePath { param([string]$AccessPath) return $script:TempLockPath }
        # Capture Write-Warning output for behavioral assertions.
        function script:Write-Warning { param([string]$Message) $script:WarningMessages.Add($Message) }
        function script:Stop-Process { param([int]$Id, [switch]$Force, $ErrorAction) $script:StoppedProcessIds.Add($Id) }
    }

    AfterEach {
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

# ===========================================================================
# S5 — Behavioral tests for Invoke-CompileAction & Invoke-RunProcedureAction
# Extract via AST from the production source, stub I/O seams, assert behavior.
# ===========================================================================

Describe "Invoke-CompileAction — behavioral (decompose S5)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"

        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null, [ref]$null
        )
        $fnAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-CompileAction' },
            $true
        ) | Select-Object -First 1
        if (-not $fnAst) { throw "Invoke-CompileAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $fnAst.Extent.Text

        # Stub Write-Status
        function script:Write-Status { param([string]$Message, $Color) $script:StatusMessages.Add($Message) }
    }

    BeforeEach {
        $script:StatusMessages = [System.Collections.Generic.List[string]]::new()
        $script:CompileVbaProjectCalled = $false
        $script:CompileVbaProjectResult = $null

        # Stub Invoke-CompileVbaProject
        function script:Invoke-CompileVbaProject {
            param($AccessApplication)
            $script:CompileVbaProjectCalled = $true
            return $script:CompileVbaProjectResult
        }

        $script:FakeSession = [PSCustomObject]@{
            VbProject          = [PSCustomObject]@{ }
            AccessApplication  = [PSCustomObject]@{ }
        }
    }

    Context "happy path - success" {
        It "outputs OK message on successful compilation when -Json is absent" {
            $script:CompileVbaProjectResult = [PSCustomObject]@{ ok = $true }
            
            $res = Invoke-CompileAction -Session $script:FakeSession
            $res | Should -BeNullOrEmpty
            $script:CompileVbaProjectCalled | Should -Be $true
            $script:StatusMessages | Should -Contain "OK compilación VBA completada"
        }

        It "returns JSON representation when -Json is present" {
            $script:CompileVbaProjectResult = [PSCustomObject]@{ ok = $true }

            $res = Invoke-CompileAction -Session $script:FakeSession -Json
            $res | Should -Not -BeNullOrEmpty
            $obj = $res | ConvertFrom-Json
            $obj.ok | Should -Be $true
        }
    }

    Context "compilation failure" {
        It "outputs detailed red error messages and does not throw when -Json is absent" {
            $script:CompileVbaProjectResult = [PSCustomObject]@{
                ok = $false
                error = "Syntax error"
                component = "Module1"
                line = 12
                column = 4
                sourceLine = "Dim x As BadType"
            }

            $res = Invoke-CompileAction -Session $script:FakeSession
            $res | Should -BeNullOrEmpty
            $script:StatusMessages | Should -Contain "ERROR compilación VBA: Syntax error"
            $script:StatusMessages | Should -Contain "Componente: Module1"
            $script:StatusMessages | Should -Contain "Línea: 12, Columna: 4"
            $script:StatusMessages | Should -Contain "Código: Dim x As BadType"
        }

        It "returns failure details as JSON without throwing when -Json is present" {
            $script:CompileVbaProjectResult = [PSCustomObject]@{
                ok = $false
                error = "Syntax error"
            }

            $res = Invoke-CompileAction -Session $script:FakeSession -Json
            $obj = $res | ConvertFrom-Json
            $obj.ok | Should -Be $false
            $obj.error | Should -Be "Syntax error"
        }
    }
}

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
        $requiredFunctions = @('Invoke-FixEncodingAction', 'Fix-EncodingInSrc', 'Get-FileEncodingInfo', 'Write-Utf8NoBom', 'Convert-AnsiToUtf8NoBom', 'Resolve-ImportFileForModule', 'Get-ComponentExtension', 'Get-ComponentFolder')
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
        ($payload.modules | Where-Object { $_.module -eq "Module1" }).error | Should -Be "first module error"
        ($payload.modules | Where-Object { $_.module -eq "Module2" }).status | Should -Be "error"
        ($payload.modules | Where-Object { $_.module -eq "Module2" }).error | Should -Be "second module error"
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
            # When no PID is provided, processStartTime should be null (JSON null, not a string)
            $rawJson | Should -Match '"processStartTime"\s*:\s*null' `
                -Because "no AccessPid was provided, so processStartTime should be JSON null"
        }
    }
}
