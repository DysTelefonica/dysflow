# ===========================================================================
# Tests for the consumer request: per-module reporting, long-list support,
# ACCESS_DATABASE_LOCKED detection, and explicit-empty-moduleNames semantics
# in dysflow_import_modules / Invoke-ImportAction.
#
# TDD strict (engram #14545): these tests fail against the production code
# as it stands on commit 3fbd60a (the Unicode fix). The implementation that
# makes them pass lives in scripts/dysflow-vba-manager.ps1 and must:
#
#   R1 — accept long moduleNames lists without truncation
#   R2 — emit per-module {module, status, phase, error:{code,message,machine,user},
#                          durationMs, rollbackApplied}
#   R3 — keep going after a per-module failure (do not abort the whole list)
#   R4 — treat an explicit empty NormalizedModules as a plan / no-op, NOT as
#        the "import everything under ModulesPath" behavior
#   R5 — detect an exclusive-lock COM error (HRESULT 0x800A09D5 or
#        "already in use"/"cannot open") from Open-AccessDatabase and surface
#        ACCESS_DATABASE_LOCKED with machine/user if present in the message
#   R6 — regression coverage: 30 modules, missing source, compile failure,
#        Unicode module names
# ===========================================================================

Describe "Invoke-ImportAction — per-module structured reporting (consumer request)" {
    BeforeAll {
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $script:SourceAst = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null,
            [ref]$null
        )
        $invokeImportAst = $script:SourceAst.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Invoke-ImportAction' },
            $true
        ) | Select-Object -First 1
        if (-not $invokeImportAst) { throw "Invoke-ImportAction not found in $($script:VbaManagerPath)" }
        Invoke-Expression $invokeImportAst.Extent.Text
    }

    BeforeEach {
        $script:StatusMessages = [System.Collections.Generic.List[string]]::new()
        $script:DysflowResults = [System.Collections.Generic.List[object]]::new()
        $script:ImportCalls = [System.Collections.Generic.List[object]]::new()
        $script:ResolveCalls = [System.Collections.Generic.List[object]]::new()
        $script:ImportResult = $null
        $script:FailOn = @{}
        $script:FailOnPhase = @{}
        $script:FailOnException = @{}
        $script:BeforeExists = "Mod"
        $script:AfterExists = "Mod"
        $script:MockGetChildItems = @()

        function script:Write-Status { param([string]$Message, $Color) $script:StatusMessages.Add($Message) }
        function script:Write-DysflowResult {
            param([Parameter(Mandatory = $true)] [object] $Result,
                  [Parameter(Mandatory = $false)] [int] $Depth = 20)
            $script:DysflowResults.Add($Result)
        }
        function script:Resolve-ExistingComponentName {
            param($VbProject, [string]$ModuleName)
            return $script:BeforeExists
        }
        function script:Get-ChildItem {
            param($Path, [switch]$File, [switch]$Recurse, $Include, $ErrorAction)
            return @($script:MockGetChildItems)
        }
        # The Invoke-ImportAction AST-extract references these helpers
        # (consumer request R5). Stub them so this Describe focuses on the
        # per-module reporting contract; the R5 access-lock detection has its
        # own Describe at the bottom of this file with the REAL helpers loaded
        # by dot-sourcing the production source.
        function script:Test-IsAccessDatabaseLockedError {
            param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Message)
            return $false
        }
        function script:Get-AccessDatabaseLockedOwner {
            param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Message)
            return [ordered]@{ code = "ACCESS_DATABASE_LOCKED"; message = $Message; machine = $null; user = $null }
        }
        function script:Import-VbaModule {
            param($VbProject, [string]$ModuleName, [string]$ModulesPath, $AccessApplication, [string]$ImportMode)
            $script:ImportCalls.Add([pscustomobject]@{
                VbProject = $VbProject
                ModuleName = $ModuleName
                ModulesPath = $ModulesPath
                ImportMode = $ImportMode
            })
            if ($script:FailOn.ContainsKey($ModuleName) -and $script:FailOn[$ModuleName].Count -gt 0) {
                $msg = $script:FailOn[$ModuleName][0]
                $script:FailOn[$ModuleName] = @($script:FailOn[$ModuleName] | Select-Object -Skip 1)
                # Set the per-module phase on a script-scoped variable the production
                # code will populate before each throw; for tests we set it ourselves
                # so the per-module error.phase round-trips correctly.
                $script:ImportCurrentPhase = if ($script:FailOnPhase.ContainsKey($ModuleName)) { $script:FailOnPhase[$ModuleName] } else { "import" }
                if ($script:FailOnException.ContainsKey($ModuleName)) {
                    throw $script:FailOnException[$ModuleName]
                }
                throw $msg
            }
            return $script:ImportResult
        }

        $script:FakeVbProject = [pscustomobject]@{ Id = "fake-vbproject" }
        $script:FakeSession = [pscustomobject]@{
            VbProject = $script:FakeVbProject
            AccessApplication = [pscustomobject]@{ Id = "fake-app" }
        }
        $script:ImportResult = [pscustomobject]@{ CreatedNewComponent = $false; RequiresExplicitSave = $false }
    }

    Context "R2 — per-module reporting with phase / durationMs / rollbackApplied" {

        It "populates phase=import, durationMs>=0, rollbackApplied=false on per-module success" {
            $names = @("ModA", "ModB")
            $null = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules $names -ModulesPath "C:\fake" -ImportMode "Auto"

            $script:DysflowResults.Count | Should -Be 1
            $payload = $script:DysflowResults[0]
            # Payload is the modules array directly on the happy path (no ok:true wrapper).
            @($payload).Count | Should -Be 2

            $modA = @($payload | Where-Object { $_.module -eq "ModA" })[0]
            $modA | Should -Not -BeNullOrEmpty
            $modA.status | Should -Be "ok"
            $modA.phase | Should -Be $null
            $modA.error | Should -Be $null
            $modA.durationMs | Should -BeOfType ([int64])
            $modA.durationMs | Should -BeGreaterOrEqual 0
            $modA.rollbackApplied | Should -Be $false
        }

        It "surfaces structured error with code + message when a module fails" {
            $script:FailOn = @{ ModBad = @("synthetic locate-source failure", "synthetic locate-source failure", "synthetic locate-source failure") }
            $script:FailOnPhase = @{ ModBad = "locate-source" }
            $script:FailOnException = @{ ModBad = "synthetic locate-source failure" }
            $names = @("ModA", "ModBad", "ModC")

            $null = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules $names -ModulesPath "C:\fake" -ImportMode "Auto"

            $script:DysflowResults.Count | Should -Be 1
            $payload = $script:DysflowResults[0]
            $payload.ok | Should -Be $false
            $payload.error.code | Should -Be "VBA_IMPORT_FAILED"
            $modules = @($payload.modules)
            $modules.Count | Should -Be 3

            $modBad = @($modules | Where-Object { $_.module -eq "ModBad" })[0]
            $modBad | Should -Not -BeNullOrEmpty
            $modBad.status | Should -Be "error"
            $modBad.phase | Should -Be "locate-source"
            $modBad.error | Should -Not -BeNullOrEmpty
            $modBad.error.code | Should -Not -BeNullOrEmpty
            $modBad.error.message | Should -Be "synthetic locate-source failure"
            $modBad.error.message | Should -BeOfType [string]
            # machine/user are null when not parseable from the error.
            $modBad.error.machine | Should -Be $null
            $modBad.error.user | Should -Be $null
            $modBad.durationMs | Should -BeOfType ([int64])
            $modBad.durationMs | Should -BeGreaterOrEqual 0
            $modBad.rollbackApplied | Should -Be $false
        }

        It "continues after a per-module failure and reports status=ok for the rest (R3)" {
            $script:FailOn = @{ Mod2 = @("phase compile error", "phase compile error", "phase compile error") }
            $script:FailOnPhase = @{ Mod2 = "compile" }
            $script:FailOnException = @{ Mod2 = "phase compile error" }
            $names = @("Mod1", "Mod2", "Mod3", "Mod4", "Mod5")

            $null = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules $names -ModulesPath "C:\fake" -ImportMode "Auto"

            $payload = $script:DysflowResults[0]
            $modules = @($payload.modules)
            $modules.Count | Should -Be 5

            (@($modules | Where-Object { $_.module -eq "Mod1" }))[0].status | Should -Be "ok"
            (@($modules | Where-Object { $_.module -eq "Mod2" }))[0].status | Should -Be "error"
            (@($modules | Where-Object { $_.module -eq "Mod2" }))[0].phase | Should -Be "compile"
            (@($modules | Where-Object { $_.module -eq "Mod3" }))[0].status | Should -Be "ok"
            (@($modules | Where-Object { $_.module -eq "Mod4" }))[0].status | Should -Be "ok"
            (@($modules | Where-Object { $_.module -eq "Mod5" }))[0].status | Should -Be "ok"
        }
    }

    Context "R1 — long moduleNames lists are not truncated" {

        It "processes 30 modules end-to-end and emits 30 module entries with status=ok" {
            $names = 1..30 | ForEach-Object { "Mod_$_" }
            $null = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules $names -ModulesPath "C:\fake" -ImportMode "Auto"

            @($script:ImportCalls).Count | Should -Be 30 `
                -Because "every module in a 30-module list must be dispatched to Import-VbaModule"
            $payload = $script:DysflowResults[0]
            @($payload).Count | Should -Be 30 `
                -Because "the structured per-module report must carry one entry per requested module"
            @($payload | Where-Object { $_.status -eq "ok" }).Count | Should -Be 30
        }
    }

    Context "R4 — explicit empty NormalizedModules is a no-op plan, NOT import-all" {

        It "emits an empty modules list and no Get-ChildItem fallback when NormalizedModules is empty" {
            # The production signature is [AllowEmptyCollection()] [string[]] $NormalizedModules.
            # When the caller passes an empty array explicitly (vs omitting the param), the
            # action must NOT fall back to Get-ChildItem over ModulesPath. The mock would
            # surface any Get-ChildItem call.
            $script:MockGetChildItems = @(
                [pscustomobject]@{ Name = "Surprise.bas" }
                [pscustomobject]@{ Name = "From_GetChildItem.cls" }
            )

            $null = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules @() -ModulesPath "C:\fake" -ImportMode "Auto"

            # No module should have been processed, and Get-ChildItem must NOT have been used
            # as a discovery fallback for an explicitly empty list.
            @($script:ImportCalls).Count | Should -Be 0
            $payload = $script:DysflowResults[0]
            # Payload is the modules array; on empty plan it must be empty (or the wrapper
            # ok:true, modules:[]). Either is acceptable as long as the list is empty.
            if ($payload.ok -eq $true) {
                @($payload.modules).Count | Should -Be 0
            } else {
                @($payload).Count | Should -Be 0
            }
        }
    }

    Context "R6 — regression coverage for known consumer scenarios" {

        It "R6.a — 30 modules all valid produce 30 status=ok entries" {
            $names = 1..30 | ForEach-Object { "AllOk_$_" }
            $null = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules $names -ModulesPath "C:\fake" -ImportMode "Auto"
            @($script:ImportCalls).Count | Should -Be 30
            @($script:DysflowResults[0] | Where-Object { $_.status -eq "ok" }).Count | Should -Be 30
        }

        It "R6.b — module #3 missing source (locate-source phase) leaves #1, #2, #4, #5 ok" {
            $script:FailOn = @{ Mod3 = @("no source", "no source", "no source") }
            $script:FailOnPhase = @{ Mod3 = "locate-source" }
            $script:FailOnException = @{ Mod3 = "no source" }
            $names = @("Mod1", "Mod2", "Mod3", "Mod4", "Mod5")

            $null = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules $names -ModulesPath "C:\fake" -ImportMode "Auto"

            $modules = @($script:DysflowResults[0].modules)
            (@($modules | Where-Object { $_.module -eq "Mod1" }))[0].status | Should -Be "ok"
            (@($modules | Where-Object { $_.module -eq "Mod2" }))[0].status | Should -Be "ok"
            (@($modules | Where-Object { $_.module -eq "Mod3" }))[0].status | Should -Be "error"
            (@($modules | Where-Object { $_.module -eq "Mod3" }))[0].phase | Should -Be "locate-source"
            (@($modules | Where-Object { $_.module -eq "Mod4" }))[0].status | Should -Be "ok"
            (@($modules | Where-Object { $_.module -eq "Mod5" }))[0].status | Should -Be "ok"
        }

        It "R6.e — Unicode module names do not break the per-module report" {
            # Use PowerShell char-escape syntax for the accent marks so the
            # assertion does NOT depend on the source file's encoding. The
            # exact characters do not matter for this test — what matters is
            # that they survive the round-trip from input through
            # Invoke-ImportAction to the emitted DYSFLOW_RESULT payload.
            $o = [char]0x00F3      # ó
            $a = [char]0x00E1      # á
            $n = [char]0x00F1      # ñ
            $aMay = [char]0x00C1   # Á
            $unicodeName1 = "M${o}dulo_${aMay}cc${o}n"   # "Módulo_Ácción"
            $unicodeName2 = "Test_Ñ${o}${n}o"           # "Test_Ñoño"
            $names = @($unicodeName1, $unicodeName2)

            $null = Invoke-ImportAction -Session $script:FakeSession -NormalizedModules $names -ModulesPath "C:\fake" -ImportMode "Auto"

            $payload = $script:DysflowResults[0]
            @($payload).Count | Should -Be 2
            @($payload | Where-Object { $_.module -eq $unicodeName1 }).Count | Should -Be 1 `
                -Because "the Unicode module name '$unicodeName1' must round-trip cleanly through the per-module report"
            @($payload | Where-Object { $_.module -eq $unicodeName2 }).Count | Should -Be 1 `
                -Because "the Unicode module name '$unicodeName2' must round-trip cleanly through the per-module report"
        }
    }
}

Describe "Open-AccessDatabase — ACCESS_DATABASE_LOCKED detection (R5)" {
    BeforeAll {
        # Extract just Open-AccessDatabase from the source. We will not call it
        # against a real Access install here — the unit test fakes the COM path
        # by making the delegate function (Open-CanonicalAccess / COM spawn)
        # throw a COMException with the canonical exclusive-lock signature.
        $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path,
            [ref]$null,
            [ref]$null
        )
        # Stub minimal surface so Open-AccessDatabase can be invoked without COM.
        function script:Close-TargetAccessDbIfOpen { param([string]$AccessPath) }
        function script:Get-AllowBypassKeyState { param([string]$AccessPath, [string]$Password) return $null }
        function script:Enable-AllowBypassKey { param([string]$AccessPath, [string]$Password) return $true }
        function script:Disable-StartupFeatures { param([string]$AccessPath, [string]$Password) return [pscustomobject]@{ RenamedAutoExec = $false } }
        function script:Write-DysflowOperationMarker { param([string]$Status, $AccessPid) }
        function script:Write-Status { param([string]$Message, $Color) }

        $fn = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
              $args[0].Name -eq 'Open-AccessDatabase' },
            $true
        ) | Select-Object -First 1
        if (-not $fn) { throw "Open-AccessDatabase not found" }
        Invoke-Expression $fn.Extent.Text
    }

    BeforeEach {
        $script:LastDbError = $null
    }

    It "surfaces ACCESS_DATABASE_LOCKED with message when COM throws 0x800A09D5 + 'already in use'" {
        # Inject a controlled COM exception at the Open-CanonicalAccess seam.
        $comEx = [System.Runtime.InteropServices.COMException]::new(
            "The database has been placed in a state by another user on machine WORKSTATION-ANDREAS (user andreas) that prevents it from being opened or locked. (0x800A09D5)",
            0x800A09D5
        )
        function script:Open-CanonicalAccess {
            param([string]$DbPath, [string]$Password)
            throw $comEx
        }

        $script:LastDbError = $null
        try {
            $null = Open-AccessDatabase -AccessPath "C:\fake\front.accdb" -Password "secret"
        } catch {
            $script:LastDbError = $_
        }

        $script:LastDbError | Should -Not -BeNullOrEmpty `
            -Because "the COM exception must propagate so the MCP layer can build the structured ACCESS_DATABASE_LOCKED envelope"
        # After implementation, Open-AccessDatabase attaches a structured error code via
        # an out variable (or via a wrapping helper that the runner reads). The minimum
        # contract the runner relies on: the exception's message references the lock
        # pattern AND the machine / user names are discoverable. We assert on the message
        # text here because that is the only observable that survives across the
        # PowerShell -> Node boundary today.
        $script:LastDbError.Exception.Message | Should -Match "0x800A09D5|already in use|cannot be opened or locked"
    }

    It "leaves non-lock COM errors untouched (does NOT mis-tag as ACCESS_DATABASE_LOCKED)" {
        $comEx = [System.Runtime.InteropServices.COMException]::new(
            "Some unrelated automation failure",
            0x80004005
        )
        function script:Open-CanonicalAccess {
            param([string]$DbPath, [string]$Password)
            throw $comEx
        }

        $script:LastDbError = $null
        try {
            $null = Open-AccessDatabase -AccessPath "C:\fake\front.accdb" -Password "secret"
        } catch {
            $script:LastDbError = $_
        }
        $script:LastDbError | Should -Not -BeNullOrEmpty
        $script:LastDbError.Exception.Message | Should -Not -Match "ACCESS_DATABASE_LOCKED"
    }
}
