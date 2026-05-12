# setup-opencode.ps1
# Auto-genera opencode.json con la config MCP de Access para la worktree actual.
# Uso: pwsh -File scripts/setup-opencode.ps1

$SkillsRoot  = "C:\Proyectos\dysflow\skills"
$WorkflowMcp = "$SkillsRoot\dysflow\mcp.js"
$NodePath    = "$SkillsRoot\access-vba-sync\node_modules"

$scriptDir = Split-Path -Parent $PSCommandPath
$root      = Split-Path -Parent $scriptDir

if (-not $root -or -not (Test-Path $root)) {
  Write-Host "No se pudo resolver la raiz del proyecto - saltando"
  exit 0
}

$allAccdb = @(Get-ChildItem $root -Filter "*.accdb" -ErrorAction SilentlyContinue)
$frontend = $allAccdb | Where-Object { $_.Name -notlike "*_Datos.accdb" -and $_.Name -notlike "*_Backup*" } | Select-Object -First 1
$backend  = $allAccdb | Where-Object { $_.Name -like "*_Datos.accdb" } | Select-Object -First 1

if (-not $frontend) {
  Write-Host "Ningun frontend .accdb encontrado en $root - saltando"
  exit 0
}

$env = [ordered]@{
  ACCESS_VBA_PASSWORD  = "dpddpd"
  ACCESS_DB_PATH       = $frontend.FullName
  ACCESS_FRONTEND_PATH = $frontend.FullName
  NODE_PATH            = $NodePath
}
if ($backend) { $env["ACCESS_BACKEND_PATH"] = $backend.FullName }

$config = [ordered]@{
  mcp = [ordered]@{
    dysflow = [ordered]@{
      command = @("node", $WorkflowMcp)
      type    = "local"
      env     = $env
    }
  }
}

$json = $config | ConvertTo-Json -Depth 5
Set-Content -Path (Join-Path $root "opencode.json") -Value $json -Encoding UTF8

$backendInfo = if ($backend) { $backend.Name } else { "(sin backend)" }
Write-Host "opencode.json actualizado: frontend=$($frontend.Name) backend=$backendInfo"
