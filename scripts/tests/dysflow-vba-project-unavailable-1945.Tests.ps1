# Issue #1945 - when Access exposes no VBA project for the opened database
# (VBE.ActiveVBProject is Nothing), the session's VbProject was $null and the
# first import reached Resolve-ExistingComponentName as a raw parameter-binding
# error ("No se puede enlazar el argumento al parametro 'VbProject' porque es
# nulo"). The open must resolve the project or fail with a classified code.

BeforeAll {
    $script:VbaManagerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
    $script:ManagerAst = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path $script:VbaManagerPath).Path, [ref]$null, [ref]$null)
    function script:Import-ManagerFunction([string]$Name) {
        $fn = $script:ManagerAst.FindAll({
            $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq $Name
        }, $true) | Select-Object -First 1
        if (-not $fn) { throw "$Name not found in $($script:VbaManagerPath)" }
        return $fn.Extent.Text
    }
    # Load single functions by AST, never the whole COM library, and fail
    # loudly if anything in this file tries to create a real COM object.
    function script:New-Object {
        if ($args -contains '-ComObject') { throw 'REAL_COM_BLOCKED: this test must never create a COM object.' }
        Microsoft.PowerShell.Utility\New-Object @args
    }

    function script:New-FakeVbe($Active, [object[]]$Projects = @()) {
        $collection = [pscustomobject]@{ Count = $Projects.Count; Items = $Projects }
        $collection | Add-Member -MemberType ScriptMethod -Name Item -Value { param($i) $this.Items[$i - 1] }
        [pscustomobject]@{ ActiveVBProject = $Active; VBProjects = $collection }
    }
}

Describe "Open-AccessDatabase - VBA project resolution (#1945)" {
    BeforeAll {
        . ([scriptblock]::Create((Import-ManagerFunction 'Open-AccessDatabase')))
        . ([scriptblock]::Create((Import-ManagerFunction 'Resolve-AccessVbProject')))
        function script:Close-TargetAccessDbIfOpen { param([string]$AccessPath) }
        function script:Get-AllowBypassKeyState { param([string]$AccessPath, [string]$Password) }
        function script:Enable-AllowBypassKey { param([string]$AccessPath, [string]$Password) $true }
        function script:Disable-StartupFeatures { param([string]$AccessPath, [string]$Password, $RestoreInfo) $RestoreInfo }
        function script:Restore-AllowBypassKey { param($AccessPath, $Password, $OriginalState) }
        function script:Restore-StartupFeatures { param($AccessPath, $Password, $RestoreInfo) }
        function script:Write-DysflowOperationMarker { param([string]$Status, $AccessPid) }
        function script:Write-Status { param([string]$Message, $Color) }
        function script:Close-CanonicalAccess { param($Session, [string]$DbPath, $RotCloseAction) $script:Closed++ }
        function script:Open-CanonicalAccess {
            param([string]$DbPath, [string]$Password)
            [pscustomobject]@{ AccessApplication = [pscustomobject]@{ VBE = $script:Vbe }; OwnedPid = 1 }
        }
    }
    BeforeEach {
        $script:Closed = 0
        $script:Db = Join-Path ([IO.Path]::GetTempPath()) 'dysflow-1945\front.accdb'
    }

    It "keeps the active VBA project when Access exposes one" {
        $script:Vbe = New-FakeVbe -Active 'active-project'
        (Open-AccessDatabase -AccessPath $script:Db -Password 'x').VbProject | Should -Be 'active-project'
    }

    It "falls back to the VBProjects entry of the opened database when no project is active" {
        $other = [pscustomobject]@{ FileName = 'C:\elsewhere\addin.accda'; Name = 'addin' }
        $own = [pscustomobject]@{ FileName = $script:Db; Name = 'front' }
        $script:Vbe = New-FakeVbe -Active $null -Projects @($other, $own)
        (Open-AccessDatabase -AccessPath $script:Db -Password 'x').VbProject.Name | Should -Be 'front'
    }

    It "fails with VBA_PROJECT_UNAVAILABLE and closes Access when no project belongs to the database" {
        $script:Vbe = New-FakeVbe -Active $null -Projects @([pscustomobject]@{ FileName = 'C:\elsewhere\addin.accda' })
        { Open-AccessDatabase -AccessPath $script:Db -Password 'x' } |
            Should -Throw -ExpectedMessage 'VBA_PROJECT_UNAVAILABLE:*Nothing was changed*'
        $script:Closed | Should -Be 1
    }

    It "fails with VBA_PROJECT_UNAVAILABLE when Access exposes no VBE at all" {
        $script:Vbe = $null
        { Open-AccessDatabase -AccessPath $script:Db -Password 'x' } |
            Should -Throw -ExpectedMessage 'VBA_PROJECT_UNAVAILABLE:*'
    }
}

Describe "Manager failure envelope - VBA_PROJECT_UNAVAILABLE (#1945)" {
    BeforeAll {
        . ([scriptblock]::Create((Import-ManagerFunction 'Get-ClassifiedManagerError')))
    }

    It "classifies the open refusal with retry guidance instead of VBA_MANAGER_FAILED" {
        $error1945 = Get-ClassifiedManagerError -Message "VBA_PROJECT_UNAVAILABLE: Access opened 'front.accdb' but exposed no VBA project. Nothing was changed."
        $error1945.code | Should -Be 'VBA_PROJECT_UNAVAILABLE'
        $error1945.message | Should -BeLike 'VBA_PROJECT_UNAVAILABLE:*'
        $error1945.remediation | Should -BeLike '*safe to retry*'
        $error1945.remediation | Should -BeLike '*list_access_operations*'
    }

    It "leaves an unrelated failure unclassified" {
        Get-ClassifiedManagerError -Message 'something else broke' | Should -BeNullOrEmpty
    }
}
