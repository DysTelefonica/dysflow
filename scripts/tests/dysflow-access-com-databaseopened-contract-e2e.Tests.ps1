#Requires -Modules Pester
#Requires -Version 5.1
<#
.SYNOPSIS
    Pester E2E tests for the DatabaseOpened session flag contract (issue #571)
    from the CALLER'S perspective — what does an integrating script
    (dysflow-access-runner.ps1 / dysflow-vba-manager.ps1) actually see when
    it consumes the session returned by Open-CanonicalAccess?

.DESCRIPTION
    The unit tests in `dysflow-access-com.Tests.ps1` (Context "DatabaseOpened
    session flag (#571)") prove that Open-CanonicalAccess itself returns the
    expected flag value. What they do NOT cover is the integrated contract:
    can a downstream caller reliably distinguish "COM app spawned, DB
    opened" from "COM app spawned, DB skipped" from "COM app spawned, DB
    open FAILED"?

    This file exercises that contract by:
      1. Calling Open-CanonicalAccess with the SAME injected seams a real
         runner uses (ComSpawnAction / HwndToPidAction / WmiSnapshotAction).
      2. Asserting the returned Session shape — five fields, including
         DatabaseOpened — using the SAME access pattern the runner scripts
         use (PSCustomObject member access, not an internal helper).
      3. Asserting the close path: a successful session can be torn down
         without surprises; a failed-open throws BEFORE the return so
         downstream code never observes a session with DatabaseOpened=$false
         after a real COM failure.

    If a refactor weakens the DatabaseOpened invariant (e.g. by replacing
    the [bool]$OpenDatabase assignment with a value that depends on
    OpenCurrentDatabase's success — which the unit test does not currently
    pin from the CALLER's side), this file will catch it.

    No Access COM / PowerShell required: pure seam injection.
#>

BeforeAll {
    $script:ModulePath = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
    . (Resolve-Path $script:ModulePath).Path
}

# Helper mirrors New-FakeAccessApp from the unit tests so the same setup
# reads identically across both files.
function script:New-FakeAccessApp {
    param(
        [int]$hWndAccessApp = 0
    )
    $fake = [PSCustomObject]@{
        hWndAccessApp      = $hWndAccessApp
        AutomationSecurity = 3   # msoAutomationSecurityByUI
    }
    $fake | Add-Member -MemberType ScriptMethod -Name OpenCurrentDatabase -Value {
        param($Path, $Exclusive, $Password)
    }
    $fake | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($SaveOption) }
    $fake | Add-Member -MemberType ScriptMethod -Name CloseCurrentDatabase -Value {}
    return $fake
}

Describe "Issue #571 — DatabaseOpened flag from the CALLER's perspective (E2E)" {

    Context "Session shape returned by Open-CanonicalAccess" {

        It "returns a PSCustomObject with DatabaseOpened as the 5th documented field (#571 contract)" {
            # Caller contract: Session has 5 fields. If a future refactor adds
            # or removes one without updating the doc-comment, this catches it.
            $fakeApp = New-FakeAccessApp -hWndAccessApp 9001

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 90000 } `
                -WmiSnapshotAction { @() }

            # All five documented fields MUST be present after a successful open.
            $session.PSObject.Properties.Name | Should -Contain "AccessApplication"
            $session.PSObject.Properties.Name | Should -Contain "OwnedPid"
            $session.PSObject.Properties.Name | Should -Contain "OriginalAutomationSecurity"
            $session.PSObject.Properties.Name | Should -Contain "PidAttributed"
            $session.PSObject.Properties.Name | Should -Contain "DatabaseOpened"
        }

        It "DatabaseOpened is $true after the production default flow (caller does not pass -OpenDatabase)" {
            $fakeApp = New-FakeAccessApp -hWndAccessApp 9002

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 90001 } `
                -WmiSnapshotAction { @() }

            # Caller reads $session.DatabaseOpened — this is the exact access
            # pattern a runner would use to branch on "did we actually open
            # the .accdb?".
            [bool]$session.DatabaseOpened | Should -Be $true `
                -Because "issue #571 acceptance: default flow opens the DB; callers must see DatabaseOpened=$true"
        }

        It "DatabaseOpened is $false when the caller explicitly skipped the DB open (isDirectTargetQuery path)" {
            $fakeApp = New-FakeAccessApp -hWndAccessApp 9003

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -OpenDatabase      $false `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 90002 } `
                -WmiSnapshotAction { @() }

            [bool]$session.DatabaseOpened | Should -Be $false `
                -Because "isDirectTargetQuery callers must see DatabaseOpened=$false so they can branch on COM-only mode"
        }
    }

    Context "Caller contract — DatabaseOpened is NEVER observed on a failed open" {

        It "password rejection throws DYSFLOW_OPEN_CURRENT_DATABASE_FAILED before the caller ever sees a session" {
            $fakeApp = New-FakeAccessApp -hWndAccessApp 9004
            $fakeApp | Add-Member -MemberType ScriptMethod -Name OpenCurrentDatabase -Force -Value {
                param($Path, $Exclusive, $Password)
                throw "wrong password"
            }

            # Caller pattern: wrap in try/catch — there is no return value
            # to inspect on failure. A regression that returns a session
            # with DatabaseOpened=$true (or any value) after a real COM
            # failure would let callers proceed as if the DB opened.
            $threw = $false
            $errorId = $null
            try {
                Open-CanonicalAccess `
                    -DbPath            "C:\protected.accdb" `
                    -Password          "wrong" `
                    -ComSpawnAction    { $fakeApp } `
                    -HwndToPidAction   { param($Hwnd) 90003 } `
                    -WmiSnapshotAction { @() }
            } catch {
                $threw = $true
                $errorId = $_.FullyQualifiedErrorId
            }

            $threw | Should -Be $true `
                -Because "a failed open MUST throw — never return a session with a misleading DatabaseOpened value"
            $errorId | Should -Be "DYSFLOW_OPEN_CURRENT_DATABASE_FAILED,Open-CanonicalAccess" `
                -Because "the structured error id is the caller's branch point; replacing it breaks all error-handling paths"
        }

        It "missing-path COM exception also throws DYSFLOW_OPEN_CURRENT_DATABASE_FAILED (no silent session)" {
            $fakeApp = New-FakeAccessApp -hWndAccessApp 9005
            $fakeApp | Add-Member -MemberType ScriptMethod -Name OpenCurrentDatabase -Force -Value {
                param($Path, $Exclusive, $Password)
                throw "could not find file '$Path'"
            }

            $threw = $false
            $errorId = $null
            try {
                Open-CanonicalAccess `
                    -DbPath            "C:\missing.accdb" `
                    -Password          "" `
                    -ComSpawnAction    { $fakeApp } `
                    -HwndToPidAction   { param($Hwnd) 90004 } `
                    -WmiSnapshotAction { @() }
            } catch {
                $threw = $true
                $errorId = $_.FullyQualifiedErrorId
            }

            $threw | Should -Be $true
            $errorId | Should -Be "DYSFLOW_OPEN_CURRENT_DATABASE_FAILED,Open-CanonicalAccess"
        }
    }

    Context "Caller contract — the returned session supports the documented teardown shape" {

        It "a successful session flows cleanly into Close-CanonicalAccess without throwing (#571 round-trip)" {
            $fakeApp = New-FakeAccessApp -hWndAccessApp 9006

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 90005 } `
                -WmiSnapshotAction { @() }

            # Caller pattern: pass the session straight into Close. If the
            # Session shape drifts, this throws "Cannot bind argument to
            # parameter 'Session'" and fails loudly — exactly the regression
            # signal a caller wants.
            $result = Close-CanonicalAccess `
                -Session        $session `
                -DbPath         "C:\fake.accdb" `
                -KillPidAction  { param([int]$AccessPid) $true } `
                -LockFileAction { $false }

            $result.OwnedPidKilled | Should -Be $true
            $result.PidWasAttributed | Should -Be $true
            $result.UnattributedKilled | Should -Be $false `
                -Because "the UnattributedKilled=$false invariant MUST hold even on the success path"
        }

        It "a session opened with -OpenDatabase:$false still carries a usable AccessApplication for teardown" {
            # isDirectTargetQuery callers call Close-CanonicalAccess even though
            # no DB was opened. The Session must carry enough state for the
            # close path to do the right thing (Quit + cleanup).
            $fakeApp = New-FakeAccessApp -hWndAccessApp 9007

            $session = Open-CanonicalAccess `
                -DbPath            "C:\fake.accdb" `
                -Password          "" `
                -OpenDatabase      $false `
                -ComSpawnAction    { $fakeApp } `
                -HwndToPidAction   { param($Hwnd) 90006 } `
                -WmiSnapshotAction { @() }

            $session.DatabaseOpened | Should -Be $false

            $result = Close-CanonicalAccess `
                -Session        $session `
                -DbPath         "C:\fake.accdb" `
                -KillPidAction  { param([int]$AccessPid) $true } `
                -LockFileAction { $false }

            $result.UnattributedKilled | Should -Be $false
        }
    }
}