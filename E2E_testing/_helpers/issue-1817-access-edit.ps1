param(
    [Parameter(Mandatory)][string]$Root,
    [ValidateSet('create', 'ui', 'form-code', 'class-code', 'snapshot')][string]$Action = 'create',
    [string]$Marker = 'INITIAL_1817'
)
$ErrorActionPreference = 'Stop'
$rootPath = [IO.Path]::GetFullPath($Root)
$tempPath = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $rootPath.StartsWith($tempPath, [StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath (Join-Path $rootPath '.issue-1817-fixture'))) {
    throw 'Refusing Access edits outside the marked disposable fixture.'
}
if ($Marker -notmatch '^[A-Z0-9_]+$') { throw 'Invalid fixture marker.' }
$database = Join-Path $rootPath 'Fixture.accdb'
# The PID of this run's Access, for the runner to stop it if a spawn timeout kills this
# script first (a DCOM-launched MSACCESS.EXE outlives its PowerShell caller).
$pidFile = Join-Path $rootPath '.issue-1817-access.pid'
$accessPid = 0
$application = $null
try {
    $application = New-Object -ComObject Access.Application
    try {
        if (-not ([System.Management.Automation.PSTypeName]'Issue1817.NativeMethods').Type) {
            Add-Type -Namespace Issue1817 -Name NativeMethods -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);
'@
        }
        [uint32]$windowPid = 0
        [void][Issue1817.NativeMethods]::GetWindowThreadProcessId([IntPtr]$application.hWndAccessApp(), [ref]$windowPid)
        $owner = Get-Process -Id ([int]$windowPid) -ErrorAction SilentlyContinue
        if ($null -ne $owner -and $owner.ProcessName -eq 'MSACCESS') {
            $accessPid = [int]$windowPid
            Set-Content -LiteralPath $pidFile -Value $accessPid -Encoding ascii
        }
    } catch { Write-Warning "Could not attribute the Access PID: $_" }
    $application.Visible = $false
    $application.AutomationSecurity = 3
    if ($Action -eq 'create') {
        if (Test-Path -LiteralPath $database) { throw 'Fixture database already exists.' }
        $application.NewCurrentDatabase($database)
        $form = $application.CreateForm()
        $originalName = $form.Name
        $form.HasModule = $true
        $label = $application.CreateControl($originalName, 100, 0, '', '', 240, 240, 2400, 300)
        $label.Name = 'Issue1817Label'
        $label.Caption = 'INITIAL_1817'
        $form.Module.AddFromString('Private Const Issue1817Marker As String = "INITIAL_1817"')
        $application.DoCmd.Save(2, $originalName)
        $application.DoCmd.Close(2, $originalName, 1)
        $application.DoCmd.Rename('Issue1817Form', 2, $originalName)
        $component = $application.VBE.ActiveVBProject.VBComponents.Add(2)
        $component.Name = 'Issue1817Class'
        $component.CodeModule.AddFromString("Private Const Issue1817Marker As String = `"INITIAL_1817`"")
        $application.DoCmd.Save(5, 'Issue1817Class')
    } elseif ($Action -eq 'snapshot') {
        $application.OpenCurrentDatabase($database)
        $control = Join-Path $rootPath 'control'
        New-Item -ItemType Directory -Force -Path (Join-Path $control 'forms'), (Join-Path $control 'classes') | Out-Null
        $application.SaveAsText(2, 'Issue1817Form', (Join-Path $control 'forms/Form_Issue1817Form.form.txt'))
        $application.DoCmd.OpenForm('Issue1817Form', 1)
        $module = $application.Forms.Item('Issue1817Form').Module
        [IO.File]::WriteAllText((Join-Path $control 'forms/Form_Issue1817Form.cls'), $module.Lines(1, $module.CountOfLines))
        $application.DoCmd.Close(2, 'Issue1817Form', 2)
        $module = $application.VBE.ActiveVBProject.VBComponents.Item('Issue1817Class').CodeModule
        [IO.File]::WriteAllText((Join-Path $control 'classes/Issue1817Class.cls'), $module.Lines(1, $module.CountOfLines))
    } else {
        $application.OpenCurrentDatabase($database)
        if ($Action -eq 'class-code') {
            $module = $application.VBE.ActiveVBProject.VBComponents.Item('Issue1817Class').CodeModule
        } else {
            $application.DoCmd.OpenForm('Issue1817Form', 1)
            $form = $application.Forms.Item('Issue1817Form')
            if ($Action -eq 'ui') {
                $form.Controls.Item('Issue1817Label').Caption = $Marker
            } else {
                $module = $form.Module
            }
        }
        if ($Action -ne 'ui') {
            $found = $false
            for ($line = 1; $line -le $module.CountOfLines; $line++) {
                if ($module.Lines($line, 1) -match '^Private Const Issue1817Marker ') {
                    $module.DeleteLines($line, 1)
                    $module.InsertLines($line, "Private Const Issue1817Marker As String = `"$Marker`"")
                    $found = $true
                    break
                }
            }
            if (-not $found) { throw 'Fixture marker declaration not found.' }
        }
        if ($Action -eq 'class-code') {
            $application.DoCmd.Save(5, 'Issue1817Class')
        } else {
            $application.DoCmd.Save(2, 'Issue1817Form')
            $application.DoCmd.Close(2, 'Issue1817Form', 1)
        }
    }
    $application.CloseCurrentDatabase()
    Write-Output 'ISSUE_1817_EDIT_SAVED'
} finally {
    if ($null -ne $application) {
        try { $application.Quit(2) } catch { Write-Warning "Quit failed: $_" }
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($application)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    # Same close as dysflow's Close-CanonicalAccess: a bounded wait for this run's own
    # Access to exit, then a kill of that PID only.
    if ($accessPid -gt 0) {
        $owned = Get-Process -Id $accessPid -ErrorAction SilentlyContinue
        if ($null -ne $owned -and -not $owned.WaitForExit(10000)) {
            Stop-Process -Id $accessPid -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
