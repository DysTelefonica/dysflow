# ==============================================================================
# VBA-SDD Framework - Script de Despliegue (Versión Completa con Plantillas)
# ==============================================================================

# --- CONFIGURACIÓN HARDCODEADA ---
$Usuario = "ardelperal"
$Repo    = "SDD-Core-VBA"
$Rama    = "main"
$RepoSource = "https://raw.githubusercontent.com/$Usuario/$Repo/$Rama"

Write-Host "`n🛠️  CONFIGURACIÓN DE ENTORNO DE INGENIERÍA VBA" -ForegroundColor Cyan
Write-Host "----------------------------------------------------"

# 1. 🔍 DIAGNÓSTICO LOCAL
$Files = Get-ChildItem -Path (Get-Location) -File
$Frontend = $Files | Where-Object { $_.Extension -match "acc" -and $_.Name -notmatch "_datos" } | Select-Object -First 1

if ($null -eq $Frontend) { Write-Host "❌ ERROR: No hay .accdb principal." -ForegroundColor Red; exit }

# 2. 🔑 GESTIÓN DE TOKEN
$TokenVar = "GITHUB_TOKEN"
$env:GITHUB_TOKEN = [System.Environment]::GetEnvironmentVariable($TokenVar, "User")
if ([string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) {
    $env:GITHUB_TOKEN = Read-Host "🔑 Introduce tu Token de GitHub (PAT)"
    [System.Environment]::SetEnvironmentVariable($TokenVar, $env:GITHUB_TOKEN, "User")
}

# 3. ⚙️ SELECCIÓN DE IDE Y PROYECTO (ANTES DE DESCARGAS)
Write-Host "`n--- 🤖 CONFIGURACIÓN DEL AGENTE ---" -ForegroundColor Yellow
$ProjectName = Read-Host "Introduce el nombre del Proyecto"
$Choice = Read-Host "IDE (1: Trae | 2: Cursor | 3: VS Code | 4: Codex/TUI)"

# Configurar rutas dinámicas según IDE
if ($Choice -eq "1") {
    $RulesDir = ".trae/rules"
    Write-Host "  🤖 Configurando entorno para Trae (Reglas en $RulesDir)..." -ForegroundColor Magenta
} else {
    $RulesDir = ".rules"
    Write-Host "  🤖 Configurando entorno Estándar (Reglas en $RulesDir)..." -ForegroundColor Magenta
}

# 4. 📂 ESTRUCTURA Y DESCARGA
$Folders = @($RulesDir, "skills", "access-vba-sync", "src", "docs/PRD", "docs/specs", "docs/development/templates", "ERD")
foreach ($f in $Folders) { if (!(Test-Path $f)) { New-Item -ItemType Directory -Path $f -Force | Out-Null } }

function Download-File($RelPath, $LocalPath = $RelPath) {
    $Header = @{ "Authorization" = "token $($env:GITHUB_TOKEN)"; "User-Agent" = "VBA-Deploy" }
    try {
        # Asegurar que el directorio destino existe
        $Dir = Split-Path -Parent $LocalPath
        if (!(Test-Path $Dir)) { New-Item -ItemType Directory -Path $Dir -Force | Out-Null }

        Invoke-WebRequest -Uri "$RepoSource/$RelPath" -OutFile $LocalPath -Headers $Header -ErrorAction Stop
        Write-Host "  [*] Descargado: $RelPath -> $LocalPath" -ForegroundColor Gray
    } catch { Write-Host "  [❌] Error en $RelPath" -ForegroundColor Red }
}

# --- DESCARGA DE COMPONENTES ---

# 4.1 Reglas (Destino dinámico)
# Descargamos los archivos de reglas individuales al directorio elegido
@("identity.md", "vba-standards.md", "sdd-protocol.md") | ForEach-Object { 
    Download-File ".rules/$_" "$RulesDir/$_" 
}

# Si es Trae, descargar también project_rules_template.md como project_rules.md (Resumen Ejecutivo)
if ($Choice -eq "1") {
    Download-File "docs/development/templates/project_rules_template.md" "$RulesDir/project_rules.md"
}

# 4.2 Skills y Herramientas (Comunes)
@("skills/sdd-init.md", "skills/vba-sync-watch.md", "skills/sdd-consolidate.md", "skills/sdd-audit-quality.md", "skills/universal-logic-explorer.md") | ForEach-Object { Download-File $_ }
@("access-vba-sync/cli.js", "access-vba-sync/handler.js", "access-vba-sync/VBAManager.ps1", "access-vba-sync/package.json") | ForEach-Object { Download-File $_ }

# 4.3 Plantillas de Desarrollo
$Templates = @(
    "diario_template.md",
    "BLOCKED_BY_templated.md",
    "PARENT_BY_templated.md",
    "RolMap_template.md",
    "spec_template.md",
    "User_Story_template.md",
    "prompt_discovery.md"
)

foreach ($t in $Templates) {
    Download-File "docs/development/templates/$t" "docs/development/templates/$t"
}


# 5. 🔄 PERSONALIZACIÓN DEL PROYECTO
if (![string]::IsNullOrWhiteSpace($ProjectName)) {
    Write-Host "`n  🎨 Personalizando plantillas para: $ProjectName..." -ForegroundColor Cyan
    
    # Buscar en reglas (ruta dinámica) y plantillas
    $FilesToUpdate = Get-ChildItem -Path $RulesDir, "docs/development/templates" -Recurse -Filter "*.md"
    
    foreach ($File in $FilesToUpdate) {
        if (Test-Path $File.FullName) {
            $Content = Get-Content $File.FullName -Raw -Encoding UTF8
            if ($Content -match "\{\{PROJECT_NAME\}\}") {
                $Content = $Content -replace "\{\{PROJECT_NAME\}\}", $ProjectName
                Set-Content -Path $File.FullName -Value $Content -Encoding UTF8
                Write-Host "    -> Actualizado: $($File.Name)" -ForegroundColor Gray
            }
        }
    }
}

# 6. CONFIGURACIÓN FINAL IDE
if ($Choice -eq "4") {
    Write-Host "  🤖 Configurando entorno para Codex/TUI (Desatendido)..." -ForegroundColor Magenta
    # Para Codex, unificar las reglas
    $RulesFiles = Get-ChildItem $RulesDir -Filter "*.md"
    $TotalContent = ""
    foreach ($file in $RulesFiles) {
        $TotalContent += "`n# --- $($file.BaseName) ---`n" + (Get-Content $file.FullName -Raw)
    }
    Set-Content -Path ".rules-codex.md" -Value $TotalContent -Force
    Write-Host "  ✅ Archivo .rules-codex.md generado para alimentación del TUI." -ForegroundColor Green
}

# 7. 🛠️ FINALIZACIÓN
Push-Location "access-vba-sync"; npm install; Pop-Location
if ((Get-ChildItem "src" -File).Count -eq 0) {
    node access-vba-sync/cli.js start --access "$($Frontend.FullName)"
}

# 8. 🧠 INTELIGENCIA INICIAL
Write-Host "`n--- 📊 GENERACIÓN DE ARTEFACTOS ---" -ForegroundColor Yellow

# 8.1 ERD
$GenERD = Read-Host "¿Generar Diagrama Entidad-Relación (ERD)? (S/N)"
if ($GenERD -match "S|s") {
    $Backend = $Files | Where-Object { $_.Extension -match "acc" -and $_.Name -match "_datos" } | Select-Object -First 1
    if ($Backend) {
        Write-Host "  🔍 Backend detectado: $($Backend.Name)" -ForegroundColor Gray
        node access-vba-sync/cli.js generate-erd --backend "$($Backend.FullName)"
    } else {
        Write-Host "  ⚠️ No se detectó Backend (_datos). Intentando con Frontend..." -ForegroundColor Yellow
        node access-vba-sync/cli.js generate-erd --backend "$($Frontend.FullName)"
    }
}

# 8.2 DOCUMENTACIÓN
$GenDoc = Read-Host "¿Generar Documentación de Arquitectura (Universal Logic Explorer)? (S/N)"
if ($GenDoc -match "S|s") {
    $EntryForm = Read-Host "Introduce el nombre del Formulario de Inicio (ej: Form_frmSplash)"
    if ([string]::IsNullOrWhiteSpace($EntryForm)) { $EntryForm = "Form_frmSplash" }

    $PromptFile = "docs/development/templates/prompt_discovery.md"
    if (Test-Path $PromptFile) {
        $PromptContent = Get-Content $PromptFile -Raw -Encoding UTF8
        $PromptContent = $PromptContent -replace "\{\{ENTRY_FORM\}\}", $EntryForm
        
        Write-Host "`n📋 COPIA Y PEGA ESTE PROMPT AL AGENTE:" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Green
        Write-Host $PromptContent
        Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Green
    } else {
        Write-Host "⚠️ No se encontró la plantilla del prompt ($PromptFile)." -ForegroundColor Yellow
    }
}

Write-Host "`n🏁 DESPLIEGUE COMPLETO" -ForegroundColor Cyan
