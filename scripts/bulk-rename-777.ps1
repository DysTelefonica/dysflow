#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"
$root = "C:/Proyectos/dysflow-canonical-rename-2026-07-07"
Set-Location $root

$renames = @{
  "dysflow_query_execute"  = "query_execute"
  "dysflow_doctor"         = "doctor"
  "dysflow_access_operations_list" = "list_access_operations"
  "dysflow_access_cleanup" = "cleanup_access_operation"
  "dysflow_access_force_cleanup_orphaned" = "access_force_cleanup_orphaned"
  "dysflow_list_procedures" = "list_procedures"
  "dysflow_get_procedure"   = "get_procedure"
  "dysflow_find_references" = "find_references"
  "dysflow_detect_dead_code" = "detect_dead_code"
  "dysflow_validate_manifest" = "validate_manifest"
}

# We do NOT bulk-replace dysflow_vba_execute; that one was committed
# in commit 1 and only specific references should update it.

$extensions = @("*.ts", "*.tsx", "*.mjs", "*.js", "*.json", "*.cjs", "*.md")
$dirs = @("src", "test", "E2E_testing", "docs", "scripts")
$files = @()
foreach ($dir in $dirs) {
  foreach ($ext in $extensions) {
    $files += Get-ChildItem -Path $dir -Recurse -Include $ext -ErrorAction SilentlyContinue
  }
}
function Get-TopLevelFile($path) { Get-ChildItem -Path $path -ErrorAction SilentlyContinue | Select-Object -First 1 }
$topFiles = @()
foreach ($name in @("README.md", "AGENTS.md", "CHANGELOG.md")) {
  $f = Join-Path $root $name
  if (Test-Path $f) { $topFiles += Get-Item $f }
}
$files += $topFiles

foreach ($file in $files) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
  if ($null -eq $content) { continue }
  $original = $content
  foreach ($k in $renames.Keys) {
    $v = $renames[$k]
    # Match the bare legacy name with word boundaries; refuse to edit
    # when the legacy name appears inside a longer identifier (just
    # to be safe in tests).
    $pattern = "\b" + [Regex]::Escape($k) + "\b"
    $content = [Regex]::Replace($content, $pattern, $v)
  }
  if ($content -ne $original) {
    Set-Content -LiteralPath $file.FullName -Value $content -NoNewline -Encoding UTF8
    Write-Host "updated: $($file.FullName)"
  }
}
Write-Host "bulk replace done."
