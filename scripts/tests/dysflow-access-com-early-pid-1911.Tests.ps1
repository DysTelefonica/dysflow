#Requires -Modules Pester
<#
.SYNOPSIS
    Issue #1911: OpenCurrentDatabase can block on a modal dialog until the run is killed. The
    Access PID must therefore be recorded in the operation marker BEFORE the open, so a run that
    times out during the open still knows which Access is its own (and only that one is reaped).
.NOTES
    Pure PowerShell. Open-CanonicalAccess is driven through its injectable seams; the vba-manager
    wiring is loaded from the script AST with the DAO helpers replaced by test doubles. No Access
    is started and no process is killed.
#>

BeforeAll {
    # Safety net: if any path below ever fell through to the default COM spawn, it would get
    # the module's mock Access.Application instead of launching a real MSACCESS.EXE.
    $script:PreviousMockCom = $env:DYSFLOW_MOCK_COM
    $env:DYSFLOW_MOCK_COM = '1'

    $script:ModulePath     = Join-Path $PSScriptRoot ".." "lib" "dysflow-access-com.ps1"
    $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    . (Resolve-Path $script:ModulePath).Path

    function New-TestAccessApplication {
        param([scriptblock]$OnOpen)
        $app = [pscustomobject]@{
            AutomationSecurity = 3
            Visible            = $true
            UserControl        = $true
            hWndAccessApp      = [IntPtr]::new(1234)
            OnOpen             = $OnOpen
        }
        $app | Add-Member -MemberType ScriptMethod -Name OpenCurrentDatabase -Value {
            param($Path, $Exclusive, $Password)
            & $this.OnOpen
        }
        $app | Add-Member -MemberType ScriptMethod -Name Quit -Value { param($opt) }
        return $app
    }
}

AfterAll {
    $env:DYSFLOW_MOCK_COM = $script:PreviousMockCom
}

Describe "Open-CanonicalAccess hands out the owned PID before the open (#1911)" {
    BeforeEach {
        $script:Recorded = @()
        $script:RecordedBeforeOpen = $null
    }

    It "reports the PID before OpenCurrentDatabase runs" {
        $app = New-TestAccessApplication -OnOpen { $script:RecordedBeforeOpen = @($script:Recorded) }

        $session = Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
            -ComSpawnAction { $app } `
            -HwndToPidAction { param([IntPtr]$Hwnd) 4242 } `
            -WmiSnapshotAction { @() } `
            -OwnedPidAction { param([int]$AccessPid) $script:Recorded += $AccessPid }

        $script:RecordedBeforeOpen | Should -Be @(4242)
        $session.OwnedPid | Should -Be 4242
    }

    It "has reported the PID even when the open fails" {
        $app = New-TestAccessApplication -OnOpen { throw "modal dialog dismissed by the kill" }

        { Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
            -ComSpawnAction { $app } `
            -HwndToPidAction { param([IntPtr]$Hwnd) 4242 } `
            -WmiSnapshotAction { @() } `
            -OwnedPidAction { param([int]$AccessPid) $script:Recorded += $AccessPid } } | Should -Throw

        $script:Recorded | Should -Be @(4242)
    }

    It "reports nothing when the PID is not known before the open" {
        $app = New-TestAccessApplication -OnOpen { }

        $null = Open-CanonicalAccess -DbPath "C:\data\front.accdb" `
            -ComSpawnAction { $app } `
            -HwndToPidAction { param([IntPtr]$Hwnd) 0 } `
            -WmiSnapshotAction { @() } `
            -OwnedPidAction { param([int]$AccessPid) $script:Recorded += $AccessPid }

        $script:Recorded.Count | Should -Be 0
    }
}

Describe "Open-AccessDatabase writes the owned PID to the operation marker before the open (#1911)" {
    BeforeAll {
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
        foreach ($fnName in @('Open-AccessDatabase', 'Write-DysflowOperationMarker')) {
            $fnAst = $ast.FindAll(
                { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $fnName },
                $true
            ) | Select-Object -First 1
            if (-not $fnAst) { throw "$fnName not found in $($script:VbaManagerPath)" }
            Invoke-Expression $fnAst.Extent.Text
        }

        # The real canonical open, with only its COM/process seams replaced. Defined here, in
        # the scope Open-AccessDatabase resolves from, so it shadows the module's function.
        $script:RealOpenCanonicalAccess = ${function:Open-CanonicalAccess}
        function Open-CanonicalAccess {
            param([string]$DbPath, [string]$Password, [scriptblock]$OwnedPidAction)
            & $script:RealOpenCanonicalAccess -DbPath $DbPath -Password $Password -OwnedPidAction $OwnedPidAction `
                -ComSpawnAction { $script:App } `
                -HwndToPidAction { param([IntPtr]$Hwnd) $script:OwnPid } `
                -WmiSnapshotAction { @() }
        }
        function Write-Status { param([string]$Message, $Color) }
        function Close-TargetAccessDbIfOpen { param([string]$AccessPath) }
        function Get-AllowBypassKeyState { param([string]$AccessPath, [string]$Password) $null }
        function Enable-AllowBypassKey { param([string]$AccessPath, [string]$Password) $true }
        function Disable-StartupFeatures { param([string]$AccessPath, [string]$Password, $RestoreInfo) $RestoreInfo }
        function Restore-AllowBypassKey { param([string]$AccessPath, [string]$Password, $OriginalState) }
        function Restore-StartupFeatures { param([string]$AccessPath, [string]$Password, $RestoreInfo) }
    }

    BeforeEach {
        $script:Root = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1911-pid-" + [guid]::NewGuid().ToString("N"))
        [System.IO.Directory]::CreateDirectory($script:Root) | Out-Null
        # Script-level parameters Write-DysflowOperationMarker reads.
        $script:OperationFile = Join-Path $script:Root "markers\op.json"
        $script:OperationId = "dysflow-test-op"
        $script:Action = "Run-Tests"
        $script:DestinationRoot = $script:Root
        $script:MarkerAtOpen = $null
        # The test process's own PID: a live process whose start time can be read.
        $script:OwnPid = $PID
        $script:App = New-TestAccessApplication -OnOpen {
            if (Test-Path -LiteralPath $script:OperationFile) {
                $script:MarkerAtOpen = Get-Content -LiteralPath $script:OperationFile -Raw | ConvertFrom-Json
            }
            throw "modal dialog dismissed by the kill"
        }
    }

    AfterEach {
        if (Test-Path -LiteralPath $script:Root) { [System.IO.Directory]::Delete($script:Root, $true) }
    }

    It "the marker carries the Access PID and its start time while the open is in progress" {
        { Open-AccessDatabase -AccessPath "C:\data\front-sandbox.accdb" -Password "" } | Should -Throw

        $script:MarkerAtOpen | Should -Not -BeNullOrEmpty
        $script:MarkerAtOpen.accessPid | Should -Be $script:OwnPid
        $script:MarkerAtOpen.processStartTime | Should -Not -BeNullOrEmpty
    }
}
