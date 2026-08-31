$ErrorActionPreference = 'Stop'

BeforeAll {
    $script:Audit = Resolve-Path (Join-Path $PSScriptRoot '..\..\..\dysflow-codegraph-update\assets\scripts\Invoke-DysflowSemanticAudit.ps1')
    $script:Source = Get-Content -Raw -LiteralPath $script:Audit
}

Describe 'semantic token coverage' {
    It 'positively validates preferredAgentWorkflows' {
        $script:Source | Should -Match 'preferredAgentWorkflows'
        $script:Source | Should -Match 'validPhases'
    }

    It 'positively validates compositionConstraints' {
        $script:Source | Should -Match 'compositionConstraints'
        $script:Source | Should -Match 'inputSchema.anyOf'
    }

    It 'does not maintain a manual tool registry' {
        $script:Source | Should -Not -Match 'CANONICAL_(READ|WRITE|TOOLS)'
    }
}
