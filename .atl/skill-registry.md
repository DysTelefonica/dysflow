# Skill Registry — 00_NO_CONFORMIDADES

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| "proteger un botón", "antispam", "popup de progreso", "frmBusy", "evitar clicks repetidos" | access-vba-antispam | C:\Users\adm1\.config\opencode\skills\access-vba-antispam\SKILL.md |
| "creating a new Access form", "popup", "dialog", "reusable form skeleton" | access-form-creation | C:\Users\adm1\.config\opencode\skills\access-form-creation\SKILL.md |
| "popup anti-spam", "feedback visual", "frmBusy", operaciones >1-2 segundos | vba-antispam-popup | C:\Users\adm1\.config\opencode\skills\vba-antispam-popup\SKILL.md |
| "tests VBA", "TDD Access", "test-vba" | access-vba-tdd | C:\Proyectos\workflow\skills\access-vba-tdd\SKILL.md |
| "consultar backend", "ejecutar SQL", "listar tablas", "ver tablas linked", "schema", "seed/teardown" | access-query | C:\Proyectos\workflow\skills\access-query\SKILL.md |
| "sandbox", "linked tables to local", "sync backends production" | access-sandbox | C:\Proyectos\workflow\skills\access-sandbox\SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### access-vba-antispam
- Usar AntiSpamHelper (capa 1) + frmBusy (capa 2) para operaciones >500ms
- Botón que abre modal: `AntiSpamEnterOperation` + `MostrarPopupProgreso` + loop de barra + `AntiSpamExitOperation`
- Para acceso directo a `Forms("frmBusy")` siempre precede `MostrarPopupProgreso` o `ActualizarEstadoPopup`
- `MostrarPopupProgreso` 2 args: `(p_Titulo, p_Mensaje)` — nunca 4 args
- `CerrarPopupProgreso` sin argumentos

### access-form-creation
- NUNCA escribir `.form.txt` desde cero — copiar seed válido y editar
- `Modal = NotDefault` y `PopUp = NotDefault` (NO `True`)
- Form-level `Height` NO se setea — Access calcula de Section heights
- GUID es opcional — Access lo autogenera
- Importar con `node cli.js import <Form> --access <path>`
- Si solo cambia código: `import-code`; si cambia UI: `import-form`

### vba-antispam-popup
- API canónica: `MostrarPopupProgreso(tit, msg)`, `MostrarEstado(msg)`, `ActualizarProgreso(actual, total)`, `CerrarPopupProgreso`
- `g_BusyFlag` declarado UNA vez en Variables Globales — valor `"running"` cuando activo
- frmBusy controls requeridos: `lblTitulo`, `lblEstado`, `lblProgresoFondo`, `lblProgresoBarra`
- Popup solo UI — sin lógica de negocio
- Loop canónico: `MostrarPopupProgreso` → trabajo → loop barra → `CerrarPopupProgreso`

### access-vba-tdd
- Tests `Public Function` que retornan JSON: `{"ok":true/false,"value":...,"error":null,"logs":[...]}`
- Usar `BuildJsonOk` / `BuildJsonFail` — nunca concatenar JSON a mano
- `AssertLocalBackend()` como guard antes de escribir datos
- Fixtures con `TEST_ID_BASE` ≥ 900000 para aislamiento
- Teardown con `GoTo Teardown` en assert fallido
- Verificar valor concreto, no solo ausencia de error
- Mínimo 80% cobertura sobre métodos dignos de test

### access-query
- `-ListTables` = solo tablas locales; `-LinkedTables` = solo vinculadas
- Primera lectura, después escritura: `-SQL` → `-DryRun` → `-Exec`
- Seed/Teardown requieren `-AllowTable` con lista explícita
- Usar `-File` en PowerShell, nunca `-Command`
- Consultar schema con `-GetSchema -Table` antes de escribir fixtures
- Rutas: absoluta, `%USERPROFILE%`, o relativa al repo

### access-sandbox
- `sync-backends.ps1`: 3 pasos — zip seguridad → limpieza → copia + revinculación
- Si `RefreshLink()` falla, tabla vinculada se elimina (no queda referencia a producción)
- `ConvertLinkedAccessTablesToLocal.ps1`: convierte frontend a autocontenido
- Password obligatoria: `ACCESS_SANDBOX_PW`

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | C:\00repos\codigo\00_NO_CONFORMIDADES\AGENTS.md | Index — proyecto Access/VBA, zero regressions, doble edición .cls+.form.txt |

## Proyecto — 00_NO_CONFORMIDADES

- Frontend: `NoConformidades.accdb` / Backend: `NoConformidades_Datos.accdb`
- Stack: Microsoft Access/VBA/DAO
- SRCEXPORT: `src/` — código exportado, se trabaja fuera del binario
- Workflow: exportar → editar src → importar al binario → compilar en Access
- Reglas: zero regressions, transaccionalidad estricta, workflow inmutable, doble edición formularios
