[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Require-Match {
    param([string]$Path, [string]$Pattern, [string]$Contract)
    $content = Get-Content -LiteralPath (Join-Path $repoRoot $Path) -Raw
    if ($content -notmatch $Pattern) {
        throw "$Contract drifted in $Path"
    }
}

Require-Match 'skills/dysflow-usage/SKILL.md' 'MUST-LOAD[\s\S]*\.dysflow/project\.json[\s\S]*get_capabilities' 'dysflow-usage discoverability'
Require-Match 'skills/dysflow-arnes/SKILL.md' 'MUST-LOAD ORDER:[\s\S]*dysflow-usage.*first' 'dysflow-arnes load order'
Require-Match 'skills/dysflow-pointer-rollout/assets/pointer.md' 'dysflow-usage[\s\S]*MUST-LOAD' 'consumer pointer discoverability'
Require-Match 'src/adapters/mcp/result-translation.ts' 'skill: "dysflow-usage"[\s\S]*tool: "describe_tool"' 'typed remediation guidance'

Write-Output 'PASS: skill discoverability, pointer alignment, and typed remediation hints match the runtime sources.'
