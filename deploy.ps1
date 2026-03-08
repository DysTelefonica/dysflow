# ==============================================================================
# VBA-SDD Framework - Script de Despliegue v2.1
# Repo fuente: configurable (se guarda en %USERPROFILE%\.vba-sdd-repo)
#
# USO:
#   .\deploy.ps1              → Proyecto nuevo desde cero
#   .\deploy.ps1 -UpdateOnly  → Actualizar solo skills y rules (proyecto existente)
# ==============================================================================

param(
    [switch]$UpdateOnly
)

# --- CONFIGURACIÓN DEL REPO FUENTE ---
$RepoConfigFile = "$env:USERPROFILE\.vba-sdd-repo"

if (Test-Path $RepoConfigFile) {
    $RepoConfig = Get-Content $RepoConfigFile -Raw | ConvertFrom-Json
    $Usuario    = $RepoConfig.Usuario
    $Repo       = $RepoConfig.Repo
    $Rama       = $RepoConfig.Rama
    Write-Host "  Repo fuente: github.com/$Usuario/$Repo ($Rama)" -ForegroundColor Gray
} else {
    Write-Host "`n--- 📦 CONFIGURACIÓN DEL REPO FUENTE ---" -ForegroundColor Yellow
    Write-Host "  (Solo se pregunta una vez. Se guarda en $RepoConfigFile)" -ForegroundColor Gray
    $Usuario = Read-Host "Usuario de GitHub (ej: ardelperal)"
    $Repo    = Read-Host "Nombre del repo   (ej: SDD-Core-VBA)"
    $Rama    = Read-Host "Rama              [main]"
    if ([string]::IsNullOrWhiteSpace($Rama)) { $Rama = "main" }
    @{ Usuario = $Usuario; Repo = $Repo; Rama = $Rama } | ConvertTo-Json | Set-Content $RepoConfigFile -Encoding UTF8
    Write-Host "  [✓] Configuración guardada en $RepoConfigFile" -ForegroundColor Green
}

$RepoSource = "https://raw.githubusercontent.com/$Usuario/$Repo/$Rama"

# ==============================================================================
# FUNCIÓN DE DESCARGA (común a ambos modos)
# ==============================================================================
function Download-File($RelPath, $LocalPath = $RelPath) {
    $Header = @{
        "Authorization" = "token $($env:GITHUB_TOKEN)"
        "User-Agent"    = "VBA-SDD-Deploy"
    }
    try {
        $Dir = Split-Path -Parent $LocalPath
        if ($Dir -and !(Test-Path $Dir)) {
            New-Item -ItemType Directory -Path $Dir -Force | Out-Null
        }
        Invoke-WebRequest -Uri "$RepoSource/$RelPath" -OutFile $LocalPath -Headers $Header -ErrorAction Stop
        Write-Host "  [✓] $LocalPath" -ForegroundColor Gray
    } catch {
        Write-Host "  [✗] Error descargando: $RelPath" -ForegroundColor Red
    }
}

# ==============================================================================
# FUNCIÓN DE ACTUALIZACIÓN DE SKILLS (común a ambos modos)
# ==============================================================================
function Update-Skills($SkillsDir, $RulesDir) {

    # Rules
    Write-Host "`n--- 📜 ACTUALIZANDO RULES ---" -ForegroundColor Yellow
    Download-File ".trae/rules/user_rules.md" "$RulesDir/user_rules.md"

    # Skills de protocolo
    Write-Host "`n--- 🧠 ACTUALIZANDO SKILLS ---" -ForegroundColor Yellow
    @(
        ".trae/skills/sdd-protocol/SKILL.md",
        ".trae/skills/spec-writer/SKILL.md",
        ".trae/skills/prd-writer/SKILL.md",
        ".trae/skills/rfc-writer/SKILL.md",
        ".trae/skills/diario-sesion/SKILL.md"
    ) | ForEach-Object {
        $LocalPath = $_ -replace "^\.trae/skills/", "$SkillsDir/"
        Download-File $_ $LocalPath
    }

    # access-vba-sync (skill + herramientas)
    @(
        ".trae/skills/access-vba-sync/SKILL.md",
        ".trae/skills/access-vba-sync/VBAManager.ps1",
        ".trae/skills/access-vba-sync/cli.js",
        ".trae/skills/access-vba-sync/handler.js",
        ".trae/skills/access-vba-sync/package.json"
    ) | ForEach-Object {
        $LocalPath = $_ -replace "^\.trae/skills/", "$SkillsDir/"
        Download-File $_ $LocalPath
    }

    # Plantillas (sobreescribir también — pueden haber mejorado)
    Write-Host "`n--- 📄 ACTUALIZANDO PLANTILLAS ---" -ForegroundColor Yellow
    @(
        "docs/templates/AGENTS_template.md",
        "docs/templates/rfc_template.md",
        "docs/templates/diario_template.md",
        "docs/templates/spec_template.md",
        "docs/templates/prd_template.md",
        "docs/templates/prompt_discovery.md"
    ) | ForEach-Object { Download-File $_ }
}

# ==============================================================================
# GESTIÓN DE TOKEN GITHUB (común a ambos modos)
# ==============================================================================
$TokenVar         = "GITHUB_TOKEN"
$env:GITHUB_TOKEN = [System.Environment]::GetEnvironmentVariable($TokenVar, "User")

if ([string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) {
    $env:GITHUB_TOKEN = Read-Host "`n🔑 Introduce tu Token de GitHub (PAT)"
    [System.Environment]::SetEnvironmentVariable($TokenVar, $env:GITHUB_TOKEN, "User")
    Write-Host "  Token guardado para futuras sesiones." -ForegroundColor Gray
}

# ==============================================================================
# MODO: UPDATE ONLY
# ==============================================================================
if ($UpdateOnly) {

    Write-Host "`n🔄 VBA-SDD FRAMEWORK — ACTUALIZACIÓN DE FRAMEWORK" -ForegroundColor Cyan
    Write-Host "====================================================" -ForegroundColor Cyan

    # Detectar IDE por las carpetas existentes
    if (Test-Path ".trae/skills") {
        $RulesDir  = ".trae/rules"
        $SkillsDir = ".trae/skills"
        Write-Host "  IDE detectado: Trae (.trae/skills)" -ForegroundColor Gray
    } elseif (Test-Path "skills") {
        $RulesDir  = ".rules"
        $SkillsDir = "skills"
        Write-Host "  IDE detectado: Estándar (skills/)" -ForegroundColor Gray
    } else {
        Write-Host "`n  [!] No se detectó estructura de skills." -ForegroundColor Yellow
        Write-Host "       Ejecuta .\deploy.ps1 sin -UpdateOnly para un proyecto nuevo." -ForegroundColor Yellow
        exit
    }

    # Verificar que es un proyecto existente válido
    if (!(Test-Path "AGENTS.md")) {
        Write-Host "`n  [!] No se encontró AGENTS.md." -ForegroundColor Yellow
        Write-Host "       Ejecuta .\deploy.ps1 sin -UpdateOnly para un proyecto nuevo." -ForegroundColor Yellow
        exit
    }

    # Actualizar skills, rules y plantillas
    Update-Skills $SkillsDir $RulesDir

    # Resumen
    Write-Host "`n=====================================================" -ForegroundColor Cyan
    Write-Host "✅ FRAMEWORK ACTUALIZADO" -ForegroundColor Cyan
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host "  Skills   : $SkillsDir (sobreescritas)" -ForegroundColor White
    Write-Host "  Rules    : $RulesDir (sobreescritas)" -ForegroundColor White
    Write-Host "  Plantillas: docs/templates/ (sobreescritas)" -ForegroundColor White
    Write-Host "  AGENTS.md : sin cambios (es específico del proyecto)" -ForegroundColor White
    Write-Host "`n  Nota: reinicia Trae para que cargue las skills actualizadas.`n" -ForegroundColor Yellow
    exit
}

# ==============================================================================
# MODO: DEPLOY COMPLETO (proyecto nuevo)
# ==============================================================================

Write-Host "`n🛠️  VBA-SDD FRAMEWORK — DESPLIEGUE DE PROYECTO NUEVO" -ForegroundColor Cyan
Write-Host "======================================================`n"

# 1. DIAGNÓSTICO LOCAL
$Files    = Get-ChildItem -Path (Get-Location) -File
$Frontend = $Files | Where-Object { $_.Extension -match "acc" -and $_.Name -notmatch "_datos" } | Select-Object -First 1

if ($null -eq $Frontend) {
    Write-Host "❌ ERROR: No se encontró ningún .accdb principal en el directorio actual." -ForegroundColor Red
    exit
}
Write-Host "✅ Proyecto detectado: $($Frontend.Name)" -ForegroundColor Green

# 2. CONFIGURACIÓN DEL PROYECTO
Write-Host "`n--- 📋 DATOS DEL PROYECTO ---" -ForegroundColor Yellow

$ProjectName   = Read-Host "Nombre del proyecto (ej: CONDOR)"
$ProjectStack  = Read-Host "Stack tecnológico   (ej: Access + VBA + SQL Server)"
$ProjectDomain = Read-Host "Dominio del proyecto (ej: Gestión de solicitudes técnicas)"
$ProjectPhase  = Read-Host "Fase actual          (ej: Desarrollo, QA, Producción)"

Write-Host "`n--- 🤖 SELECCIÓN DE IDE ---" -ForegroundColor Yellow
$Choice = Read-Host "IDE (1: Trae | 2: Cursor | 3: VS Code | 4: Codex/TUI)"

if ($Choice -eq "1") {
    $RulesDir  = ".trae/rules"
    $SkillsDir = ".trae/skills"
    Write-Host "  → Trae: reglas en $RulesDir, skills en $SkillsDir" -ForegroundColor Gray
} else {
    $RulesDir  = ".rules"
    $SkillsDir = "skills"
    Write-Host "  → Estándar: reglas en $RulesDir, skills en $SkillsDir" -ForegroundColor Gray
}

# 3. CREAR ESTRUCTURA DE CARPETAS
Write-Host "`n--- 📂 CREANDO ESTRUCTURA DE DIRECTORIOS ---" -ForegroundColor Yellow

$Folders = @(
    $RulesDir,
    "$SkillsDir/sdd-protocol",
    "$SkillsDir/spec-writer",
    "$SkillsDir/prd-writer",
    "$SkillsDir/rfc-writer",
    "$SkillsDir/access-vba-sync",
    "$SkillsDir/diario-sesion",
    "docs/PRD",
    "docs/specs/active",
    "docs/specs/completed",
    "docs/rfcs",
    "docs/templates",
    "docs/lecciones-aprendidas",
    "docs/sdd",
    "src/modules",
    "src/classes",
    "src/forms",
    "ERD",
    ".engram"
)

foreach ($f in $Folders) {
    if (!(Test-Path $f)) {
        New-Item -ItemType Directory -Path $f -Force | Out-Null
        Write-Host "  [+] $f" -ForegroundColor Gray
    }
}

# 4. DESCARGAR SKILLS, RULES Y PLANTILLAS
Update-Skills $SkillsDir $RulesDir

# 5. GENERAR AGENTS.MD PERSONALIZADO
Write-Host "`n--- 🤖 GENERANDO AGENTS.MD ---" -ForegroundColor Yellow

$AgentsTemplatePath = "docs/templates/AGENTS_template.md"

if (Test-Path $AgentsTemplatePath) {
    $AgentsContent = Get-Content $AgentsTemplatePath -Raw -Encoding UTF8
    $AgentsContent = $AgentsContent -replace "\{\{PROJECT_NAME\}\}", $ProjectName
    $AgentsContent = $AgentsContent -replace "\{\{STACK\}\}",        $ProjectStack
    $AgentsContent = $AgentsContent -replace "\{\{DOMAIN\}\}",       $ProjectDomain
    $AgentsContent = $AgentsContent -replace "\{\{PHASE\}\}",        $ProjectPhase
    $AgentsContent = $AgentsContent -replace "\{\{SKILLS_DIR\}\}",   $SkillsDir
    Set-Content -Path "AGENTS.md" -Value $AgentsContent -Encoding UTF8
    Write-Host "  [✓] AGENTS.md generado para '$ProjectName'" -ForegroundColor Green
} else {
    Write-Host "  [✗] No se encontró AGENTS_template.md — AGENTS.md NO generado" -ForegroundColor Red
    Write-Host "       Créalo manualmente o añádelo al repo $Repo" -ForegroundColor Yellow
}

# 6. PERSONALIZAR PLANTILLAS CON NOMBRE DE PROYECTO
Write-Host "`n--- 🎨 PERSONALIZANDO PLANTILLAS ---" -ForegroundColor Yellow

$FilesToUpdate = Get-ChildItem -Path $RulesDir, "docs/templates" -Recurse -Filter "*.md" -ErrorAction SilentlyContinue

foreach ($File in $FilesToUpdate) {
    if (Test-Path $File.FullName) {
        $Content = Get-Content $File.FullName -Raw -Encoding UTF8
        if ($Content -match "\{\{PROJECT_NAME\}\}") {
            $Content = $Content -replace "\{\{PROJECT_NAME\}\}", $ProjectName
            Set-Content -Path $File.FullName -Value $Content -Encoding UTF8
            Write-Host "  [✓] $($File.Name)" -ForegroundColor Gray
        }
    }
}

# 7. CONFIGURACIÓN ESPECIAL PARA CODEX/TUI
if ($Choice -eq "4") {
    Write-Host "`n--- 🤖 GENERANDO .rules-codex.md ---" -ForegroundColor Yellow
    $RulesFiles   = Get-ChildItem $RulesDir -Filter "*.md"
    $TotalContent = ""
    foreach ($file in $RulesFiles) {
        $TotalContent += "`n# --- $($file.BaseName) ---`n" + (Get-Content $file.FullName -Raw)
    }
    Set-Content -Path ".rules-codex.md" -Value $TotalContent -Force
    Write-Host "  [✓] .rules-codex.md generado" -ForegroundColor Green
}

# 8. NPM INSTALL EN ACCESS-VBA-SYNC
Write-Host "`n--- 📦 INSTALANDO DEPENDENCIAS NODE ---" -ForegroundColor Yellow

$SyncDir = "$SkillsDir/access-vba-sync"
if (Test-Path "$SyncDir/package.json") {
    Push-Location $SyncDir
    npm install --silent
    Pop-Location
    Write-Host "  [✓] npm install completado en $SyncDir" -ForegroundColor Green
} else {
    Write-Host "  [!] package.json no encontrado en $SyncDir — omitiendo npm install" -ForegroundColor Yellow
}

# 9. ARTEFACTOS INICIALES (ERD + DISCOVERY)
Write-Host "`n--- 📊 GENERACIÓN DE ARTEFACTOS INICIALES ---" -ForegroundColor Yellow

$GenERD = Read-Host "¿Generar ERD ahora? (S/N)"
if ($GenERD -match "S|s") {
    $Backend = $Files | Where-Object { $_.Extension -match "acc" -and $_.Name -match "_datos" } | Select-Object -First 1
    $Target  = if ($Backend) { $Backend.FullName } else { $Frontend.FullName }
    if (!$Backend) { Write-Host "  [!] Sin _datos.accdb — usando frontend" -ForegroundColor Yellow }
    node "$SyncDir/cli.js" generate-erd --backend "$Target"
    Write-Host "  [✓] ERD generado en ERD/" -ForegroundColor Green
}

$GenDoc = Read-Host "¿Generar prompt de Discovery Map? (S/N)"
if ($GenDoc -match "S|s") {
    $EntryForm = Read-Host "Formulario de inicio (ej: Form_frmSplash)"
    if ([string]::IsNullOrWhiteSpace($EntryForm)) { $EntryForm = "Form_frmSplash" }

    $PromptFile = "docs/templates/prompt_discovery.md"
    if (Test-Path $PromptFile) {
        $PromptContent = Get-Content $PromptFile -Raw -Encoding UTF8
        $PromptContent = $PromptContent -replace "\{\{ENTRY_FORM\}\}",   $EntryForm
        $PromptContent = $PromptContent -replace "\{\{PROJECT_NAME\}\}", $ProjectName

        Write-Host "`n📋 COPIA ESTE PROMPT AL AGENTE EN TRAE:" -ForegroundColor Green
        Write-Host "----------------------------------------------------------------" -ForegroundColor Green
        Write-Host $PromptContent
        Write-Host "----------------------------------------------------------------" -ForegroundColor Green
    }
}

# RESUMEN FINAL
Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "🏁 DESPLIEGUE COMPLETADO" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Proyecto : $ProjectName" -ForegroundColor White
Write-Host "  IDE      : $(if ($Choice -eq '1') {'Trae'} elseif ($Choice -eq '2') {'Cursor'} elseif ($Choice -eq '3') {'VS Code'} else {'Codex/TUI'})" -ForegroundColor White
Write-Host "  Rules    : $RulesDir" -ForegroundColor White
Write-Host "  Skills   : $SkillsDir" -ForegroundColor White
Write-Host "`n  Próximos pasos:" -ForegroundColor Yellow
Write-Host "  1. Abre AGENTS.md y revisa que los datos son correctos" -ForegroundColor Gray
Write-Host "  2. Abre Trae y verifica que las rules y skills se cargan" -ForegroundColor Gray
Write-Host "  3. Ejecuta mem_context en Trae para iniciar la sesión" -ForegroundColor Gray
Write-Host "  4. Lanza el prompt de Discovery Map si no lo has hecho`n" -ForegroundColor Gray
