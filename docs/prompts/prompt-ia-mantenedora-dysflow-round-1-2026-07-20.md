# Round 1 — dysflow `import_all`/`import_modules` corrompe round-trip de `.cls` con `WithEvents`

## Resumen

- **Mode:** bug-hunt
- **Variant:** medium
- **Tool:** dysflow MCP (version `v2.17.1`)
- **Repo:** `<repo path>` (tu fork de dysflow)
- **Branch sugerida:** `fix/import-with-events-attr-preservation`

## Contexto del round

Round 1 = un único gap bloqueante para el round-trip binario ↔ source de cualquier `.cls` que use `WithEvents` + `Attribute *.VB_VarHelpID`.

Rounds previos en este consumer: ninguno registrado.

## Lo que YA funciona (NO tocar)

- `export_all` con `dryRun:true` (previsualización) sigue funcionando — devuelve plan de 113 módulos en el caso de prueba.
- `verify_code` reporta `ok:true`, `recommendedAction:no_action` cuando source y binario están en sync.
- `import_all` con `dryRun:true` produce un plan correcto (113 módulos).
- `get_capabilities`, `list_vba_modules`, `test_vba` allowlist, capacity-registry, despistaje de stale markers, `humanCompilePending`, `writesProcess.enabled`, `writesProject.allowWrites`, `projectConfig.status:"valid"` — todos en verde.
- Round-trip binario ↔ source funciona **para `.cls` / `.bas` que NO usan `WithEvents`**. El proyecto EXPEDIENTES tiene 112 `.cls` que pasan el round-trip sin problema y compilan; solo 1 (`WebSocket.cls`) lo rompe.
- El propio round-trip vía `import_all.apply:true` **reporta success** (`status:"ok"`) — el binary-side bug NO se detecta desde la respuesta del tool, solo aparece en compile humano del VBE.
- Política `effectiveDryRunDefault[import_all]==true` (plan-by-default), gate de writes, gate de compile humano — todo se mantiene.

Comportamiento intencional que NO se debe cambiar:
- NO reintroducir `compile_vba` (regla cross-project "human compiles").
- NO reintroducir el campo `compile:true` en `import_modules`/`import_all` (eliminado en v1.19.0 por #759).
- NO tocar el flujo `import_all` para `.form.txt` / `.report.txt` (usa `LoadFromText`, no `AddFromFile`) — es ortogonal a este gap.

## Lo que falta en este round

### Bug 1: `Normalize-VbaImportText` stripp `Attribute *.VB_VarHelpID = -1` al importar `.cls`

#### Síntoma verificado

`import_all({ projectId:"expedientes", dryRun:false })` con un `.cls` que declara `Private WithEvents X As Y` + `Attribute X.VB_VarHelpID = -1` (caso real: `src/classes/WebSocket.cls`) escribe un binario Access que **NO compila** en el VBE: cada línea `WithEvents` reporta "Error de sintaxis". El `.cls` en disco queda idéntico al original; el daño está en el binario.

Verificación de la no-compilación por el consumer: el consumer abrió el `.accdb` en Access, abrió el módulo `WebSocket` en el VBE, hizo `Debug → Compile`. La captura de pantalla del VBE muestra las 5 declaraciones `WithEvents` subrayadas en rojo con "Error de sintaxis" en la línea del primer `Attribute doc.VB_VarHelpID = -1`.

#### Evidencia de repro

**1. Salida literal del `import_all` para el módulo afectado** (el path `result[]` filtrado al módulo `WebSocket`):

```json
{
  "module": "WebSocket",
  "status": "ok",
  "phase": null,
  "error": null,
  "durationMs": 77,
  "rollbackApplied": false,
  "fallbackUsed": true,
  "fallbackReason": "add_from_file_truncated"
}
```

`fallbackReason: "add_from_file_truncated"` indica que `CodeModule.AddFromFile()` se ejecutó pero `CountOfLines` post-import fue inferior al source visible, y dysflow entró al F16 fallback (`AddFromString`). El binario final termina con el resultado de `AddFromString`, NO con el source en disco. Esto ya es un flag operacional: la combinación `status:"ok"` + `fallbackUsed:true` debe documentar truncation visible para el consumer.

**2. Contenido de `src/classes/WebSocket.cls`** (1142 bytes, 37 líneas, mtime `2026-07-20 08:58:57`, **NO modificado** por el round-trip — el disco está limpio):

```vba
VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "WebSocket"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private WithEvents doc As HTMLDocument
Attribute doc.VB_VarHelpID = -1
Private WithEvents browser As WebBrowserControl
Attribute browser.VB_VarHelpID = -1
Private WithEvents notificacion As TextBox
Attribute notificacion.VB_VarHelpID = -1
Private WithEvents webscript As HTMLScriptElement
Attribute webscript.VB_VarHelpID = -1
Private WithEvents webExe As HTMLScriptElement
Attribute webExe.VB_VarHelpID = -1

Public Sub Inicializar(wbc As WebBrowserControl, txt As TextBox)
    Set browser = wbc.Object
    Set notificacion = txt
    wbc.ControlSource = """about:blank"""
    EsperarACargar
    Set webscript = doc.createElement("script")
    webscript.src = "https://www.gstatic.com/firebasejs/4.12.1/firebase.js"


End Sub
Public Sub EsperarACargar()
    Do While browser.ReadyState <> acComplete
        DoEvents
    Loop

End Sub
```

**3. Vista del VBE post-import_all** (captura tomada por el consumer): `WebSocket (Código)` se muestra con todo el código visible y el diálogo "Microsoft Visual Basic para Aplicaciones — Error de compilación: Error de sintaxis" sobre la línea destacada en azul `Attribute doc.VB_VarHelpID = -1`.

#### Diagnóstico preliminar (verificado, con `file:line`)

**Root cause location:** `scripts/dysflow-vba-manager.ps1`, función `Test-IsVbaImportDroppableMetadataLine`, **línea 991**:

```powershell
return (
    $trim -match '^VERSION\s+\d+(\.\d+)?\s+CLASS$' -or
    $trim -match '^BEGIN\b' -or
    $trim -match '^END$' -or
    $trim -match '^(MultiUse|Persistable|DataBindingBehavior|DataSourceBehavior|MTSTransactionMode)\s*=' -or
    $trim -match '^Attribute\s+VB_(?!Name\b)'      # <-- BUG: matchea `Attribute doc.VB_VarHelpID = -1`
)
```

La heurística asume que cualquier `Attribute VB_*` (excepto `VB_Name`) es "file-level metadata" regenerable por Access al reimportar. Pero los `Attribute *.VB_VarHelpID = -1` **NO** son file-level metadata — son **member-level attributes** atados a una declaración `Private WithEvents X As Y` o `Public WithEvents X As Y` previa. Access los emite automáticamente cuando compila un módulo que tiene `WithEvents`, y los REQUIERE presentes al re-importar para mantener la asociación `WithEvents → ID de VB_VarHelpID`. Si no están, Access descarta los `WithEvents` y los `Select Case`/`RaiseEvent` que los siguen no resuelven.

**Cadena de llamada que dispara el bug:**

1. `Import-VbaModule` (línea 3163) llama a `Convert-Utf8CodeImportToAnsiTempFile` (línea 3347) para producir `$tmpAnsiSanitized`.
2. Esa función (línea 1439) llama a `Normalize-VbaImportText` (línea 1361) sobre el texto UTF-8 antes de escribir el ANSI temp file.
3. `Normalize-VbaImportText` (líneas 1407-1417) hace un loop sobre las líneas del header; cuando una línea es `Attribute VB_Name` la conserva; cualquier otra línea `Attribute VB_*` la envía a `Test-IsVbaImportDroppableMetadataLine`, que devuelve `true` para `Attribute doc.VB_VarHelpID = -1`, y la función la descarta.
4. El ANSI temp file que llega a `AddFromFile` y al F16 fallback `AddFromString` ya no contiene los `Attribute *.VB_VarHelpID = -1`.
5. Binario Access los pierde. Compile humano falla con "Error de sintaxis".

**Por qué el `status:"ok"` del `import_all` no atrapa el problema:** el `result.result[]` del consumer reporta `fallbackReason: "add_from_file_truncated"` y `fallbackUsed: true` para WebSocket, pero la respuesta agregada es `ok:true` porque el código del consumer no trata el flag `fallbackUsed:true` como fallo. Hay un gap secundario de UX (no es el bug primario, ver "Riesgo").

**Versión de introducción verificada por `git blame`:**

```
^da1a3366 (aroman 2026-07-06 18:42:03 +0200 1410)             if ($trim -match '^Attribute\s+VB_Name\b') {
^da1a3366 (aroman 2026-07-06 18:42:03 +0200 1415)             if (Test-IsVbaImportDroppableMetadataLine -Line $line) {
```

El commit `da1a3366` (autor `aroman`, fecha 2026-07-06, hace ~2 semanas) introdujo esas líneas. El release `v2.17.1` es posterior (`package.json: version "2.17.1"`). Probable regresión introducida en 2.17.x. Confirmar bisección contra `v2.16.x` si hay tag.

#### Riesgo

- **EXPEDIENTES**: 1 archivo afectado (`src/classes/WebSocket.cls`). El proyecto queda sin compilar hasta corregir.
- **Cualquier otro consumer VBA con eventos**: `MSHTML.WebBrowser` (como este), `MSComm`, `WithEvents` con controles Access, `Outlook.Application` events, etc. Pueden ser docenas de archivos por consumer. Estimación cuantitativa: cualquier `.cls` que tenga `WithEvents` (>50% de proyectos VBA medianos) está corrupto al primer `import_all`.
- **Tests del propio dysflow** no cubren este caso: `dysflow-vba-manager.Tests.ps1` referencia `Normalize-VbaImportText` (línea 361) pero sus fixtures no incluyen `WithEvents`. `dysflow-vba-manager-f16-string-fallback.Tests.ps1` cubre el F16 fallback con átomos genéricos, no con `WithEvents`.
- **Gap secundario de UX**: el campo `result[].fallbackReason: "add_from_file_truncated"` debería ascender a un warning surface (no solo a un internal flag). El consumer lo descubrió leyendo la respuesta cruda.

#### Tests RED sugeridos

Test 1 — Unit (en `scripts/tests/dysflow-vba-manager.Tests.ps1`):

```powershell
Describe "Normalize-VbaImportText preserves WithEvents member-level attributes" {
    It "keeps Attribute <var>.VB_VarHelpID tied to a WithEvents declaration" {
        $src = @(
            'VERSION 1.0 CLASS',
            'BEGIN',
            '  MultiUse = -1  ''True',
            'END',
            'Attribute VB_Name = "WebSocketFixture"',
            'Option Explicit',
            '',
            'Private WithEvents doc As HTMLDocument',
            'Attribute doc.VB_VarHelpID = -1',
            'Public Sub Foo()',
            'End Sub'
        ) -join "`r`n"
        $out = Normalize-VbaImportText -Text $src
        $out | Should -Match 'Attribute doc\.VB_VarHelpID\s*=\s*-1' `
            -Because "Attribute *.VB_VarHelpID must reach AddFromFile/AddFromString (file:1411-1417 / 991)"
    }
}
```

Test 2 — Integration (en `scripts/tests/dysflow-vba-manager.Tests.ps1` o nuevo `dysflow-vba-manager-with-events.Tests.ps1`):

```powershell
It "round-trips a WebSocket-shaped class without losing WithEvents attribute lines" {
    # Use a temp .accdb (e.g. via dysflow-mock-com.ps1) with a class module
    # whose body has Private WithEvents doc As HTMLDocument + Attribute doc.VB_VarHelpID = -1.
    # Call Import-VbaModule against a module fixture file containing that body.
    # Then call Save-VbaProjectModules.
    # Then re-export via Export-VbaProjectModules and assert:
    $reExported.Lines | Should -Contain 'Attribute doc.VB_VarHelpID = -1' `
        -Because "the file persisted into the binary must round-trip out with the member-level attr intact"
}
```

Test 3 — Regresión para el F16 fallback (cubre `fallbackUsed:true` + `WithEvents`):

```powershell
It "F16 AddFromString fallback does not silently drop WithEvents member-level attributes" {
    # Force the truncated-cap path: source > existing component's CountOfLines.
    # Source contains `Private WithEvents ... + Attribute *.VB_VarHelpID = -1`.
    # Re-export and assert those member-level attribute lines survive.
}
```

Cada test debe valer RED por sí solo (no rojo-por-suerte).

## Disciplina

- TDD estricto: RED (los 3 tests nuevos arriba) → GREEN (fix mínimo en `Test-IsVbaImportDroppableMetadataLine` que preserve member-level attributes) → REFACTOR.
- Conventional commits con scope `vba-sync` o `import` (siguiendo el log: `fix(import): preserve WithEvents member-level Attribute VB_VarHelpID lines (#<issue>)`).
- NO relajar el `issue #752` defensive validation ni el F16 fallback — esos son correctos; el bug está **aguas arriba** en `Test-IsVbaImportDroppableMetadataLine`.
- Cambios mínimos: scope del fix = solo `Test-IsVbaImportDroppableMetadataLine` (y posiblemente las dos fixtures de test). NO tocar `Normalize-VbaImportText`, `Convert-Utf8CodeImportToAnsiTempFile`, `Import-VbaModule`, ni el fallback F16.
- **Acceptance criteria del fix (propuesta de regex):** preservar líneas que matcheen `^Attribute\s+[\w]+\.VB_VarHelpID\s*=\s*-?\d+` (member-level `*.VB_VarHelpID`) además de `^Attribute\s+VB_Name\b`. Mantener el drop de los 5 file-level attrs (`VB_GlobalNameSpace`, `VB_Creatable`, `VB_PredeclaredId`, `VB_Exposed`, y los `VERSION`/`BEGIN`/`END`/`MultiUse`/`Persistable`/`DataBindingBehavior`/`DataSourceBehavior`/`MTSTransactionMode` que ya están bien). Si quitan más member-level attrs (e.g. `Attribute <var>.VB_ProcData.VB_Invoke_*` de controles), preservarlos también.

## Acceptance output

- PR con los 3 tests RED → GREEN.
- Changelog en `CHANGELOG.md` con bullet: `fix(vba-sync): preserve WithEvents member-level Attribute *.VB_VarHelpID lines through import normalization (#<issue>)`.
- Version bump: **minor** (`v2.18.0`) — cambia comportamiento de normalización para una clase de archivos `.cls`. NO patch — cualquier consumer con clases `WithEvents` que acaba de hacer `import_all` necesita re-import.
- (Opcional pero recomendado) Mejora secundaria en el envelope `import_all` para que `result[].fallbackUsed:true + fallbackReason:"add_from_file_truncated"` produzca un warning surface (`warnings[]`) explícito además del flag. Esto sí puede ser un PR separado, no bloquea el fix principal.
- Actualizar `docs/` con una nota sobre qué `.cls` patterns requieren member-level attributes (no es obligatorio, sólo nice-to-have).

## Quick start

```bash
git clone <repo path>
cd <repo>
git checkout -b fix/import-with-events-attr-preservation
pnpm install
```

Test RED (en `scripts/tests/dysflow-vba-manager.Tests.ps1`):

```powershell
Invoke-Pester -Path scripts/tests/dysflow-vba-manager.Tests.ps1 `
    -Output Detailed `
    -FullNameFilter "*WithEvents*"
# Esperado: 3 REDs
# Actual (sin fix): 3 REDs, fallbackReason stripp confirmado
```

Después del fix (modificar `Test-IsVbaImportDroppableMetadataLine:991`):

```powershell
Invoke-Pester -Path scripts/tests/dysflow-vba-manager.Tests.ps1 `
    -Output Detailed
# Esperado: 3 nuevos GREENs; 0 regresiones en el resto de la suite
```

E2E del consumer (EXPEDIENTES, ya en disco con el bug expuesto):

```bash
# 1. Restaurar el binario desde el backup defensivo del consumer
copy /Y "C:\00repos\codigo\_backup_pre-export_20260720_085618\Expedientes.accdb" `
        "C:\00repos\codigo\00_EXPEDIENTES\Expedientes.accdb"

# 2. Cerrar MSACCESS con disflow (nunca Stop-Process genérico por HR-2)
#    Use access_force_cleanup_orphaned con confirmPid explícito.

# 3. Aplicar el fix de dysflow, reinstalar runtime, re-importar WebSocket.cls.
# 4. Compilar en Access: Debug > Compile VBA Project.
# 5. Esperado: WebSocket compila sin "Error de sintaxis".
# 6. Re-correr tests.vba.* del proyecto para confirmar regresión cero.
```

## Reinforcement

Recordatorio cross-project: el fix no debe reintroducir `compile_vba` ni relajar el gate de `humanCompilePending` del `test_vba`. HR-1 (humano compila) sigue vigente. Si el fix propone un atajo que bypassee el compile humano, escalar a siguiente round.
