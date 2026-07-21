# Round 3 — `Ensure-VbNameAttributeAtTop` no maneja VB_Name con prefijo `Form_` cuando el filename va sin prefijo

## Contexto del round

Round 3 contra DysTelefonica/dysflow. Rounds previos del consumer `EXPEDIENTES` (proyecto `C:\00repos\codigo\00_EXPEDIENTES`):

- Round 1 → issue `#1007` (cerrado en v2.19.0): `Attribute VB_VarHelpID` strippeado en clases con `WithEvents`. Fix mergeado.
- Round 2 → issue `#1013` (abierto, esperando fix): `test_vba` runner crea una temp `.accdb` sandbox con helper distinto al del bin. Sandboxing mystery.
- Round 3 (este): rename canónico de prod (`Form_frmSplash` → `frmSplash` sin prefijo) expone un gap en `Ensure-VbNameAttributeAtTop`: cuando el `.form.txt`/`frmSplash.cls` tiene `Attribute VB_Name = "Form_frmSplash"` (con prefijo, heredado del export inicial), la fix #744 normaliza al `$ModuleName` entrante (`frmSplash` sin prefijo), pero eso **rompe el match** con el componente `Form_frmSplash` que `LoadFromText` ya creó con prefijo.

## Lo que YA funciona (NO tocar)

- `Ensure-VbNameAttributeAtTop` y `Ensure-CodeBehindFormVbName` (introducidos en commit `b7827a8` por issue `#743`) — funcionan perfectamente para el caso "VB_Name AUSENTE en `.form.txt`/`.cls`". El commit `b7827a8` documentado en `#743` resuelve ese round.
- `Resolve-ExistingComponentName` (líneas 2792-2814 de `scripts/dysflow-vba-manager.ps1`) — busca el componente del proyecto con tres variantes del nombre (con prefijo, sin prefijo, con `Report_`). Robusto.
- 152 tests Pester existentes en `scripts/tests/dysflow-vba-manager.Tests.ps1` — siguen verdes. No tocar.
- `Import-DocumentCodeBehind` (`#849` cerrado con workaround `delete + import`) — el workaround sigue siendo necesario como belt-and-suspenders.
- Política `safe-by-default`, gates de writes, gates de `humanCompilePending`. Cross-project: HR-1 (humano compila), HR-2 (`Stop-Process MSACCESS` prohibido).

## Lo que falta en este round

### Bug 1: `Ensure-VbNameAttributeAtTop` normaliza al `$ModuleName` (sin prefijo), rompiendo el match con el componente `Form_<name>` que `LoadFromText` crea

#### Síntoma verificado

`import_modules({ projectId:"expedientes", moduleNames:["frmSplash"], dryRun:false, importMode:"Auto" })` falla con:

```powershell
VBA_IMPORT_FAILED: Import no pudo completar algunos modulos tras 1 pasada(s):
frmSplash: No se encontró el módulo
```

El `.cls` companion contiene `Attribute VB_Name = "frmSplash"` (después de la fix), pero el componente del form se llama `Form_frmSplash` (Access agrega el prefijo `Form_` al crear forms vía `LoadFromText` — no respeta el basename crudo). Match entre módulo y form → falla con "No se encontró el módulo".

#### Evidencia de repro

**Setup del consumer `EXPEDIENTES`:**

1. `src/forms/frmSplash.form.txt` (canonical post-rename) — primera línea sin prefijo: `Begin Form`. VB_Name interno pre-fix: `Attribute VB_Name = "Form_frmSplash"` (con prefijo, heredado del `LoadFromText`/`SaveAsText` original).
2. `src/forms/frmSplash.cls` (canonical post-rename) — contiene `Attribute VB_Name = "frmSplash"` solo si el consumer lo editó a mano. Sin edit, contiene `Attribute VB_Name = "Form_frmSplash"` (mismo VB_Name del form).
3. Bin local `C:\00repos\codigo\00_EXPEDIENTES\Expedientes.accdb` (después de `export_all` + `import_all` reciente) — no contiene `Form_frmSplash` legacy, solo `frmSplash` huérfano.

**Comando exacto que reproduce:**

```js
await tools.dysflow.import_modules({
  projectId: "expedientes",
  moduleNames: ["frmSplash"],
  dryRun: false,
  importMode: "Auto"
});
// Result: {
//   "ok": false,
//   "error": {
//     "code": "VBA_IMPORT_FAILED",
//     "message": "Import no pudo completar algunos modulos tras 1 pasada(s): frmSplash: No se encontró el módulo"
//   }
// }
```

**Salida literal del `delete_module` que normalizó el componente:**

```json
{
  "module": "Form_frmSplash",
  "status": "ok",
  "deleted": "frmSplash",
  "kind": "Form",
  "tempSccObjectsCleaned": []
}
```

El campo `deleted: "frmSplash"` (sin prefijo) confirma que Access internamente normaliza el nombre del componente quitando el prefijo `Form_` para reportarlo. Pero internamente, el componente sigue siendo `Form_frmSplash` (con prefijo) y `Ensure-VbNameAttributeAtTop` se le pasa `"frmSplash"` (sin prefijo) → normaliza el `.cls` a `frmSplash` → mismatch.

#### Diagnóstico preliminar (verificado parcialmente con `file:line`)

**Cadena de llamada exacta:**

1. `import_modules({moduleNames:["frmSplash"]})` MCP caller.
2. `dysflow-vba-manager.ps1:3171-3173` (`Import-VbaModule`) llama a `Import-DocumentCodeBehind -ModuleName "frmSplash"` (propaga el basename crudo sin prefijo).
3. `dysflow-vba-manager.ps1:3258` (`Import-DocumentCodeBehind`) corre `Convert-Utf8CodeImportToAnsiTempFile`.
4. `dysflow-vba-manager.ps1:3265-3267` lee el `.cls` del ANSI temp file y llama `Ensure-VbNameAttributeAtTop -Text $normalizedText -ModuleName "frmSplash"`. La fix #744 (commit `b7827a8`) normaliza el `VB_Name` del `.cls` al valor pasado (`"frmSplash"`). Si el archivo tenía `"Form_frmSplash"` pre-existente, se reemplaza por `"frmSplash"`.
5. `LoadFromText` ya se ejecutó previamente con el `.form.txt`. Creó el componente `Form_frmSplash` (Access agrega `Form_` automáticamente a forms — no respeta el basename crudo en `LoadFromText`).
6. `AddFromFile` con el `.cls` normalizado (`VB_Name = "frmSplash"`) crea un módulo VBA cuyo nombre interno es `frmSplash` (sin prefijo).
7. Access intenta vincular el `.cls` al componente del form `Form_frmSplash`. Busca por VB_Name. Match `Form_frmSplash` ↔ `frmSplash` → falla con `No se encontró el módulo`.

**`Ensure-VbNameAttributeAtTop` (líneas 824-865 de `dysflow-vba-manager.ps1`)** — la lógica actual:

```powershell
$expected = "Attribute VB_Name = `"$ModuleName`""
# ... solo normaliza al $ModuleName entrante; no maneja el prefijo Form_.
```

La fix #744 preserva/añade el VB_Name con el valor pasado. Pero cuando el componente que `LoadFromText` crea tiene prefijo `Form_` y el `$ModuleName` no, el resultado es un mismatch estructural — la fix lo empeora (porque antes el `.cls` tenía `Form_frmSplash` que matcheaba, ahora tiene `frmSplash` que no matchea).

**Hipótesis de fix raíz:** `Ensure-VbNameAttributeAtTop` debería detectar si el componente del form tiene prefijo `Form_` o `Report_` (consultando `$VbProject.VBComponents.Item(...)` antes del `AddFromFile`) y normalizar el VB_Name del `.cls` al **nombre del componente**, no al `$ModuleName` raw. Alternativamente, `Import-VbaModule` debería pasar como `$ModuleName` el **nombre del componente** (`Form_<base>`) ya pre-normalizado, no el basename crudo.

#### Riesgo

- 1 de cada N rename de forms en cualquier consumer de dysflow queda inutilizable tras el sync source→bin. Cuantificación no hecha (mediría pedir correr tests en 11+ consumers del fleet), pero el síntoma es estructural: cualquier proyecto cuyo `src/` contiene `frmX.form.txt` con un componente Access interno `Form_frmX` va a romper.
- En `EXPEDIENTES`: hoy impacta a `frmSplash` solamente (1 forms).
- Cross-fleet: si el round-2 (`#1013`) introduce sync limpio en otros consumers, este gap se amplifica.
- El workaround consumer-side `delete + import` documentado en `#849` aplica también aquí, pero `delete` borra el componente del form (con su layout y linkages) — destructivo.
- El comportamiento documentado de la fix #744 ("normaliza al `$ModuleName`") empeora el bug en este escenario. No hay commit que repare.

#### Tests RED sugeridos (TDD strict)

**Test 1 — unit Pester** (`scripts/tests/dysflow-vba-manager.Tests.ps1`):

```powershell
Describe "Ensure-VbNameAttributeAtTop handles Form_ prefix correctly (round-3 issue, regression of #743)" {
    It "preserves the Form_ prefix in VB_Name when the existing form component has it" {
        $existing = @(
            "Option Compare Database",
            "Option Explicit",
            "",
            "Public Sub Form_Open(Cancel As Integer)",
            "End Sub"
        ) -join "`r`n"
        # ModuleName sin prefijo (lo que pasaria `import_modules({moduleNames:["frmX"]})`),
        # pero el archivo tiene Form_ prefijo que debe preservarse para match con LoadFromText.
        $result = Ensure-VbNameAttributeAtTop -Text $existing -ModuleName "frmX"
        $result | Should -Match 'Attribute VB_Name = "Form_frmX"'
    }
}
```

**Test 2 — integration e2e** (`test/integration/import-modules-form-prefix.e2e.test.ts`):

```ts
describe('import_modules: form with renamed filename matches Form_ component', () => {
  it('binds code-behind to Form_<base> component when filename is <base> without prefix', async () => {
    // Setup: temp .accdb con .form.txt filename 'frmRound3.form.txt' (sin prefijo)
    // y .cls companion con Attribute VB_Name = "frmRound3".
    // El bin post-LoadFromText debe tener el componente 'Form_frmRound3' (con prefijo).
    // El code module debe tener VB_Name 'frmRound3' (sin prefijo).
    // El match component <-> module falla si la fix #744 normaliza ambos a 'frmRound3'
    // porque el componente Access es 'Form_frmRound3'.
    // Test: Access compila sin error "No se encontró el módulo".
  });
});
```

**Test 3 — regression check** — el test del issue #743 (línea 623 de los tests) sigue pasando con `ModuleName = "Form_TestVBNameVerification"`: cubre el caso de prefijo EXPLÍCITO en el `$ModuleName`. Falta cobertura para el caso donde el `$ModuleName` NO tiene prefijo pero el archivo sí.

Cada test debe valer RED por sí solo (no rojo-por-suerte).

## Disciplina

- TDD estricto: RED → GREEN → REFACTOR.
- Conventional commits con scope `vba-manager`: `fix(vba-manager): handle Form_ prefix mismatch between ModuleName and form component name (#<issue>)`.
- Scope del fix: solo el path `Import-DocumentCodeBehind` (`dysflow-vba-manager.ps1:3258-3277`) y/o `Ensure-VbNameAttributeAtTop` (`dysflow-vba-manager.ps1:824-865`). NO tocar `Export-VbaModule` ni el export del `.form.txt`.
- Compatibilidad con fix #743 (`b7827a8`): el caso "VB_Name AUSENTE" debe seguir funcionando con `ModuleName` que no tiene prefijo (compat), el caso "VB_Name PRESENTE con prefijo y ModuleName sin prefijo" debe preservar el prefijo (nuevo).
- NO reintroducir `compile_vba` (regla cross-project HR-1).
- NO tocar `#1013` (round-2 sandbox runner) — eso es independiente.
- Si la fix requiere un nuevo path en `dysflow-usage` skill (consumer-side), coordiná conmigo ANTES de publicar el changelog. El consumer `EXPEDIENTES` ya actualizó la skill `maintainer-prompt-drafter` con Paso 7 obligatorio de abrir issue.

## Acceptance output

- PR con los 3 tests RED → GREEN.
- Changelog en `CHANGELOG.md` con bullet: `fix(vba-manager): Ensure-VbNameAttributeAtTop preserves Form_ prefix when ModuleName lacks it (#<issue>)`.
- Version bump: **minor (`v2.20.0`)** — cambia comportamiento observable de la fix #744 para un sub-tipo de inputs. NO patch: consumers que dependen del comportamiento actual pueden romperse (necesitan re-import).
- (Opcional, PR separado) Si requiere exponer `currentVbName` o `detectedFormComponentName` en alguna API: AR-1 vía `dysflow-codegraph-update`.
- Si la fix toca `references/error-codes.md` o `assets/write-flags-matrix.md`, sincronizar vía `assets/scripts/verify-examples-vs-runtime.ps1` (debe pasar exit 0).
- Cross-session safety: el consumer `EXPEDIENTES` ya archivó este prompt en su `docs/prompts/`. La fix va a permitir que el sync source→bin del round-1 (más el de este round-3) cierre sin requerir workaround manual.

## Quick start

```bash
git clone <repo path>
cd <repo>
git checkout -b fix/ensure-vbname-handle-form-prefix
pnpm install
```

Test RED (extender `scripts/tests/dysflow-vba-manager.Tests.ps1`):

```powershell
Invoke-Pester -Path scripts/tests/dysflow-vba-manager.Tests.ps1 `
    -Output Detailed `
    -FullNameFilter "*Ensure-VbName*round-3*"
# Esperado: 1 RED en el caso nuevo. 152 existentes siguen verdes.
```

Después del fix:

```powershell
Invoke-Pester -Path scripts/tests/dysflow-vba-manager.Tests.ps1 `
    -Output Detailed
# Esperado: 1 nuevo GREEN; 0 regresiones en el resto de la suite.
```

Repro manual desde el consumer (`EXPEDIENTES`):

```js
// Setup: tener .form.txt y .cls con .form.txt filename 'frmSplash.form.txt'
// y .cls 'frmSplash.cls' con VB_Name='frmSplash' (sin prefijo, post-rename canonical).
// Estado actual del bin: huérfano o con legacy Form_frmSplash — el consumer decide.

// Ejecutar:
await tools.dysflow.import_modules({
  projectId: "expedientes",
  moduleNames: ["frmSplash"],
  dryRun: false,
  importMode: "Auto"
});
// Esperado post-fix: ok:true. No error "No se encontró el módulo".
// User abre Access → Debug → Compile VBA Project → compila limpio.
```

## Reinforcement

La regla cross-project "human compiles" significa que el consumer descubre este bug solo cuando compila en Access. En el consumer `EXPEDIENTES`, el test gap surgió durante un flujo de sync limpio (round-2). Si la fix del round-3 require bypass del compile humano para validar, escalá a siguiente round — el compile humano es la única forma de validar match de VB_Name vs componente Access. La fix debe traer test RED automatizable para CI (sin abrir Access), con mocks del COM object que simule el storage de VB_Name.

## Reference

- Round 1 archivado: `docs/prompts/prompt-ia-mantenedora-dysflow-round-1-2026-07-20.md` (`#1007`).
- Round 2 archivado: `docs/prompts/prompt-ia-mantenedora-dysflow-round-2-2026-07-20.md` (`#1013`).
- Round 3 archivado: `docs/prompts/prompt-ia-mantenedora-dysflow-round-3-2026-07-20.md` (este).
- Fix #744 (`b7827a8`) code: `Ensure-VbNameAttributeAtTop` y `Ensure-CodeBehindFormVbName` en `scripts/dysflow-vba-manager.ps1`.
- Tests Pester relacionados: `scripts/tests/dysflow-vba-manager.Tests.ps1:615-700` (Context "Ensure-VbNameAttributeAtTop").
- Line callsite específico: `scripts/dysflow-vba-manager.ps1:3266`.
- Consumer reference: `C:\00repos\codigo\00_EXPEDIENTES\src\forms\frmSplash.form.txt` y `C:\00repos\codigo\00_EXPEDIENTES\src\forms\frmSplash.cls`.
