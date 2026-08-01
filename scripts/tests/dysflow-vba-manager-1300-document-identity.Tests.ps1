Describe "New Access document import identity (issue #1300)" {
    BeforeAll {
        $scriptPath = Join-Path $PSScriptRoot ".." "dysflow-vba-manager.ps1"
        $ast = [System.Management.Automation.Language.Parser]::ParseFile(
            (Resolve-Path $scriptPath).Path,
            [ref]$null,
            [ref]$null
        )
        $script:ResolveDocumentModuleNameAst = $ast.FindAll(
            {
                $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                $args[0].Name -eq "Resolve-AccessDocumentModuleName"
            },
            $true
        ) | Select-Object -First 1
        if ($script:ResolveDocumentModuleNameAst) {
            Invoke-Expression $script:ResolveDocumentModuleNameAst.Extent.Text
        }
        $script:ImportVbaModuleAst = $ast.FindAll(
            {
                $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                $args[0].Name -eq "Import-VbaModule"
            },
            $true
        ) | Select-Object -First 1
    }

    It "gives a newly imported form its canonical document-module identity" {
        $script:ResolveDocumentModuleNameAst | Should -Not -BeNullOrEmpty
        Resolve-AccessDocumentModuleName -ModuleName "FormCPV" -ObjectName "FormCPV" -ObjectType 2 |
            Should -Be "Form_FormCPV"
        Resolve-AccessDocumentModuleName -ModuleName "Form_FormCPV" -ObjectName "FormCPV" -ObjectType 2 |
            Should -Be "Form_FormCPV"
        Resolve-AccessDocumentModuleName -ModuleName "Audit" -ObjectName "Audit" -ObjectType 3 |
            Should -Be "Report_Audit"

        $script:ImportVbaModuleAst.Extent.Text |
            Should -Match 'Normalize-AccessDocumentTextForLoadFromText\s+-DocumentText\s+\$importDocumentText\s+-ModuleName\s+\$documentModuleName'
        $script:ImportVbaModuleAst.Extent.Text |
            Should -Match 'Import-DocumentCodeBehind\s+-VbProject\s+\$VbProject\s+-ModuleName\s+\$documentModuleName'
    }
}
