#Requires -Version 5.1
$paths = @(
    "$env:APPDATA\Claude",
    "$env:APPDATA\Code\User",
    "$env:LOCALAPPDATA\Claude",
    "$env:USERPROFILE\.claude",
    "C:\00repos\codigo"
)
foreach ($base in $paths) {
    if (-not (Test-Path $base)) { continue }
    Get-ChildItem $base -Recurse -Filter '*.json' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match 'mcp|claude|opencode|settings' } |
        ForEach-Object { Write-Host $_.FullName }
}
