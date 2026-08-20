#Requires -Modules Pester

Describe "issue #1443 - export verbose snapshots reach the public runner result" {
    BeforeAll {
        $managerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $managerPath).Path, [ref]$null, [ref]$null
        )
        $functionAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Invoke-ExportAction' },
            $true
        ) | Select-Object -First 1
        if (-not $functionAst) { throw "Invoke-ExportAction not found in $managerPath" }
        Invoke-Expression $functionAst.Extent.Text
        function script:Write-Status { param([string]$Message, $Color) }
        function script:Write-DysflowResult { param($Result, [int]$Depth = 20) $script:Captured = $Result }
        function script:Resolve-AccessObjectInfo {
            param($AccessApplication, [string]$ModuleName)
            [pscustomobject]@{ Exists = $false }
        }
    }

    BeforeEach {
        $script:Captured = $null
        $components = [pscustomobject]@{ Count = 1 }
        $components | Add-Member -MemberType ScriptMethod -Name Item -Value {
            param($nameOrIndex)
            [pscustomobject]@{ Name = [string]$nameOrIndex; Type = 1 }
        }
        $script:Session = [pscustomobject]@{
            VbProject = [pscustomobject]@{ VBComponents = $components }
            AccessApplication = [pscustomobject]@{}
        }
        function script:Export-VbaModule {
            param($VbProject, [string]$ModuleName, $ModulesPath, $AccessApplication, $AccessObjectName, $VbComponentName)
            [pscustomobject]@{
                module = $ModuleName
                binary = [pscustomobject]@{ lines = 2; bytes = 20; sha256 = ('a' * 64) }
                file = [pscustomobject]@{ lines = 2; bytes = 18; sha256 = ('b' * 64) }
                _binaryText = "Option Explicit`r`n"
                _fileText = "Option Explicit`n"
                fileType = 'bas'
            }
        }
    }

    It "includes one verbose entry for each exported module when requested" {
        $script:ExportVerbose = $true
        Invoke-ExportAction -Session $script:Session -NormalizedModules @('Module1') -ModulesPath 'C:\fake' -Json

        $script:Captured.exported | Should -Contain 'Module1'
        @($script:Captured.verbose).Count | Should -Be 1
        $script:Captured.verbose[0].binary.sha256 | Should -Be ('a' * 64)
        $script:Captured.verbose[0].file.sha256 | Should -Be ('b' * 64)
    }

    It "omits verbose from the public result when not requested" {
        $script:ExportVerbose = $false
        Invoke-ExportAction -Session $script:Session -NormalizedModules @('Module1') -ModulesPath 'C:\fake' -Json

        $script:Captured.PSObject.Properties.Name | Should -Not -Contain 'verbose'
    }
}

Describe "issue #1443 - Export-VbaModule captures both sides" {
    BeforeAll {
        $managerPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $managerPath).Path, [ref]$null, [ref]$null
        )
        $functionAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Export-VbaModule' },
            $true
        ) | Select-Object -First 1
        if (-not $functionAst) { throw "Export-VbaModule not found in $managerPath" }
        Invoke-Expression $functionAst.Extent.Text
        $ensureVbNameAst = $ast.FindAll(
            { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $args[0].Name -eq 'Ensure-VbNameAttributeAtTop' },
            $true
        ) | Select-Object -First 1
        if (-not $ensureVbNameAst) { throw "Ensure-VbNameAttributeAtTop not found in $managerPath" }
        Invoke-Expression $ensureVbNameAst.Extent.Text

        function script:Get-ComponentExtension { param($Component, $ModuleName, $AccessApplication) '.bas' }
        function script:Get-ComponentFolder { param($Component, $ModuleName, $AccessApplication) 'modules' }
        function script:Get-CodeModuleTextSnapshot {
            param($CodeModule)
            [pscustomobject]@{ success = $true; text = [string]$CodeModule.Text }
        }
        function script:Get-VbaTextSizeSnapshot {
            param([AllowEmptyString()][string]$Text)
            [pscustomobject]@{ lines = @($Text -split "`n").Count; bytes = $Text.Length; sha256 = ('a' * 64) }
        }
        function script:Convert-AnsiToUtf8NoBom { param($InputPath, $OutputPath) Copy-Item $InputPath $OutputPath -Force }
    }

    BeforeEach {
        $script:ExportVerbose = $true
        $script:TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dysflow-1443-" + [guid]::NewGuid().ToString('N'))
        New-Item -Path $script:TempRoot -ItemType Directory -Force | Out-Null
        $codeModule = [pscustomobject]@{ Text = "Option Explicit`r`n" }
        $component = [pscustomobject]@{ Name = 'Module1'; CodeModule = $codeModule }
        $component | Add-Member -MemberType ScriptMethod -Name Export -Value {
            param($path)
            [System.IO.File]::WriteAllText($path, "Attribute VB_Name = `"Module1`"`r`nOption Explicit`r`n")
        }
        $components = [pscustomobject]@{}
        $components | Add-Member -MemberType ScriptMethod -Name Item -Value { param($name) $component }.GetNewClosure()
        $script:Project = [pscustomobject]@{ VBComponents = $components }
    }

    AfterEach {
        Remove-Item -Path $script:TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }

    It "returns binary-before and file-after snapshots from the real export helper" {
        $result = Export-VbaModule -VbProject $script:Project -ModuleName 'Module1' -ModulesPath $script:TempRoot

        $result.module | Should -Be 'Module1'
        $result.binary.lines | Should -BeGreaterThan 0
        $result.file.lines | Should -BeGreaterThan 0
        $result._binaryText | Should -Match 'Option Explicit'
        $result._binaryText | Should -Match 'Attribute VB_Name = "Module1"'
        $result._fileText | Should -Match 'Attribute VB_Name'
    }
}
