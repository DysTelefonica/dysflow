# Round 5 — `import_modules` (importMode `Auto`, compile `false`) sobre un form completo (.cls + .form.txt) renombra silenciosamente el form preexistente a `TempSccObjN`, devuelve `status: "ok"` y deja el binario con postcondición inválida: form canónico perdido, document module huérfano, `SaveAsText` posterior falla. No hay rollback.

## Contexto del round

Round 5 contra DysTelefonica/dysflow. Rounds previos del consumer `EXPEDIENTES` (proyecto `C:\00repos\codigo\00_EXPEDIENTES`, Engram project `expedientes`):

- Round 1 → issue `#1007` (cerrado en v2.19.0): `Attribute VB_VarHelpID` strippeado en clases con `WithEvents`. Fix mergeado.
- Round 2 → issue `#1013` (cerrado): `test_vba` runner usa helper distinto al del bin en el sandbox.
- Round 3 → issue `#1020` (cerrado): `Ensure-VbNameAttributeAtTop` no preservaba el prefijo `Form_` en el `Attribute VB_Name`. **Este PR es la regresión que vuelve a aparecer hoy**, ver §"Lo que falta".
- Round 4 → issue `#1037` (cerrado): `writeExecutionPolicy: "developer"` declarado en `.dysflow/project.json` no se propaga al `get_capabilities` en v2.20.0.

Round 5 es **regression** porque la fix de `#1020` no cubrió el path `Auto` con `.cls + .form.txt` para un form completo: el form preexistente se renombra a `TempSccObj1` igual que antes, el `status: "ok"` se reporta igual que antes, y no hay rollback. **No es un caso nuevo del mismo bug; es el mismo bug con la mitad del fix aplicado.**

## Lo que YA funciona (NO tocar)

- `get_capabilities` en v2.20.0 devuelve `adapterVersion: "2.20.0"`, `projectConfig.status: "valid"`, `writeReady: true` y el `commitFlag`/`noWriteAlias`/`defaultBehavior` por tool. La introspección del runtime no tiene gaps.
- `delete_module` con `force: true, dryRun: false` para forms funciona (lo usé el 2026-07-20 para limpiar `TempSccObj1` que dejó una corrida previa de este mismo bug, observación Engram `#20962`). Confirmado `status: "ok"`, `kind: "Form"`, `tempSccObjectsCleaned: []`.
- HR-1 (humano compila) intacto: el consumer no pasó `compile: true` ni llamó a `compile_vba`.
- HR-2 (no `Stop-Process MSACCESS` genérico) intacto.
- HR-6 (tests en `tests/*.json`, no en allowlist) intacto.
- `resolve_project`, `link_tables`, `query_sql`, `verify_code`, `validate_manifest` funcionan para sus casos.

## Lo que falta en este round

### Bug 1 (único, REGRESIÓN de #1020 + gap meta de false-success/no-rollback)

#### Síntoma verificado

`import_modules({moduleNames: ["frmSplash"], importMode: "Auto", dryRun: false, compile: false})` sobre un `.cls` + `.form.txt` cuyo basename es `frmSplash` (sin prefijo `Form_`) **y** un binario que ya tiene el form `Form_frmSplash` (con prefijo, legacy) produce:

1. El form canónico `Form_frmSplash` desaparece del binario (Access lo renombra internamente a `TempSccObj1` durante el import).
2. Aparece un document module `frmSplash` huérfano (sin form UI asociado, sin code-behind).
3. **No** queda el document module esperado `Form_frmSplash` (lo que el bin tendría que tener post-import si el match hubiera sido correcto).
4. La respuesta del tool reporta `status: "ok"` y `ok: true`.
5. Un `SaveAsText` posterior sobre el form esperado falla porque el form ya no existe.
6. No hay rollback: ni la fuente ni el binario vuelven al estado previo al import fallido.

Reproducido en `C:\00repos\codigo\00_EXPEDIENTES\Expedientes.accdb` (frontend de EXPEDIENTES, ~15 MB, 41 forms antes del bug, 41 forms después — pero uno de ellos es el huérfano `frmSplash` y el canónico `Form_frmSplash` está perdido). Observación Engram `expedientes/#21034` (2026-07-21 09:00:28, type `bugfix`, scope `project`).

#### Evidencia de repro

Setup mínimo (no requiere Access abierto, se reproduce desde un MCP client):

```json
// Estado del binario antes del import (precondición):
//  - Form preexistente: Form_frmSplash  (kind: Form, con código asociado)
//  - Sin ningún TempSccObj1
//  - Sin ningún document module frmSplash huérfano

// Source en disco:
//  - src/forms/frmSplash.cls       (Attribute VB_Name = "frmSplash"  sin prefijo)
//  - src/forms/frmSplash.form.txt  (Begin Form { ... } sin sección CodeBehindForm con prefijo Form_)

// Llamada dysflow:
{
  "tool": "import_modules",
  "arguments": {
    "projectId": "expedientes",
    "moduleNames": ["frmSplash"],
    "importMode": "Auto",
    "dryRun": false,
    "compile": false
  }
}

// Respuesta observada (literal):
{
  "ok": true,
  "result": [
    { "module": "frmSplash", "status": "ok", "imported": true }
  ]
}
```

Postcondición del binario (verificada con `list_objects`):
- Form `Form_frmSplash` → **ausente** (Access lo renombró a `TempSccObj1` durante el import; `TempSccObj1` aparece listado).
- Aparece un document module `frmSplash` sin form UI (huérfano).
- **No** existe el document module `Form_frmSplash` (que es lo que correspondería si el match `Form_frmSplash` ↔ `Form_frmSplash` hubiera ocurrido).
- `saveAsText` sobre el form esperado falla (no se puede serializar lo que no existe).

#### Diagnóstico preliminar (NO verificado por el consumer — a confirmar por el maintainer)

El fix de `#1020` (`Ensure-VbNameAttributeAtTop` en `scripts/dysflow-vba-manager.ps1`, commit referenciado en la issue) normaliza el `Attribute VB_Name` dentro del `.cls` para que conserve el prefijo `Form_` cuando corresponde. Pero:

1. **Hipótesis A (más probable)**: el path `importMode: "Auto"` con `.cls + .form.txt` completos no pasa por la rama de `Import-DocumentCodeBehind` que invoca `Ensure-VbNameAttributeAtTop`. La fix de `#1020` solo cubrió el path de "cls solo" o "form.txt solo", no el path de "form completo con Auto que detecta ambos y decide el orden". El consumer reproduce el bug trayendo ambos archivos con el basename sin prefijo; Auto decide importar primero el form (lo que crea `Form_frmSplash` con prefijo, y al chocar con el legacy lo renombra a `TempSccObj1`) y después intenta importar el `.cls` (que ya no puede matchear porque el form original fue renombrado).

2. **Hipótesis B (también plausible)**: el `postcondition check` que debería correr tras el import (verificar que `Form_frmSplash` exista y `frmSplash` huérfano no exista) no se ejecuta o se ejecuta pero no falla el status. Esto explica el `status: "ok"` con postcondición inválida.

3. **Hipótesis C (rollback)**: no existe path de rollback para `import_modules` sobre forms. Una vez que Access renombra `Form_frmSplash` → `TempSccObj1`, el estado no se restaura aunque el import termine en estado inválido.

Las tres hipótesis son consistentes con la evidencia. El maintainer confirma o descarta leyendo `scripts/dysflow-vba-manager.ps1` y los `tests/*.Tests.ps1` actuales.

#### Cadena exacta de fallo esperada (a verificar)

`scripts/dysflow-vba-manager.ps1` (lineas referenciadas en #1020):
- `Import-VbaModule` (≈ `3171-3173`).
- `Import-DocumentCodeBehind` (≈ `3258-3272`) — rama que llama `Ensure-VbNameAttributeAtTop`.
- **Rama faltante / no cubierta por la fix de #1020**: cuando `importMode: "Auto"` detecta `.cls + .form.txt` y los procesa, hay un punto donde `LoadFromText` (form) corre antes que `AddFromFile` (cls), y el form preexistente se renombra sin que el cls posterior pueda re-vincularse.

#### Riesgo

1. **Pérdida silenciosa de forms preexistentes** en cualquier consumer que sincronice `.form.txt` con basenames sin prefijo contra un bin con componentes `Form_<base>` legacy. Cross-fleet: aplicable a cualquier proyecto dysflow-consumer con forms que vinieron de `SaveAsText` (que siempre usa prefijo `Form_`) y que el consumer está re-normalizando al basename sin prefijo.

2. **False-success amplificado**: el tool devuelve `ok: true` cuando el postcondition es claramente inválido. Esto es el mismo anti-pattern que `#560` ("import_modules status:ok for forms doesn't guarantee UI was actually refreshed"), `#732` ("import_modules reports per-module success even when compile:true fails project-wide") y `#745` ("export_modules/export_all return success but write 0 files"). La fix de `#958` ("import path must self-heal legacy .form.txt metadata and fail-closed on structural damage") **debería** cubrir este caso pero no lo cubre para `Auto` con form completo.

3. **No rollback**: cualquier `delete_module force: true dryRun: false` posterior que el consumer haga para limpiar `TempSccObj1` es destructivo y borra el form preexistente. Si el rollback existiera, no haría falta esa limpieza.

4. **Bloqueante para round-2 (sandbox)**: si un consumer intenta el sync limpio `export_all` → `import_all` esperando el comportamiento documentado, este gap rompe el flujo entero. En `EXPEDIENTES` (CFE, entorno de producción con 15MB de binario y 80+ forms) el blast radius es alto.

5. **Consumidor afectado hoy**: `EXPEDIENTES` (este round), `GESTION_RIESGOS` (potencial, mismo patrón de SaveAsText legacy), cualquier consumer con `Form_<base>` legacy en bin + `.cls/.form.txt` con basename `<base>` en source.

#### Tests RED sugeridos (TDD estricto, RED → GREEN)

**Test 1 (cubrir hipótesis A)**: `import_modules` con `Auto` sobre `.cls + .form.txt` con basename sin prefijo `Form_` debe rechazar **antes de mutar** el binario, o normalizar de forma segura según contrato (decisión que el maintainer documenta en CHANGELOG).

```ts
it('rechaza import Auto de form con .cls VB_Name sin prefijo Form_ y form legacy Form_<base> preexistente (fail-closed antes de mutar)', async () => {
  // Setup: temp .accdb con un form preexistente Form_frmSplash (legacy SaveAsText).
  // Source: src/forms/frmSplash.cls (VB_Name = "frmSplash") + frmSplash.form.txt.

  // Pre-condición snapshot del binario
  const before = await client.call('list_objects', { kind: 'Form' });
  expect(before.forms).toContain('Form_frmSplash');
  expect(before.orphans).not.toContain('TempSccObj1');
  expect(before.orphans).not.toContain('frmSplash');

  // Acción
  const result = await client.call('import_modules', {
    moduleNames: ['frmSplash'],
    importMode: 'Auto',
    dryRun: false,
    compile: false
  });

  // Esperado: el tool rechaza con un código tipado (ej. FORM_VBNAME_PREFIX_MISMATCH o FORM_LEGACY_CONFLICT)
  // y el binario queda EXACTAMENTE igual al snapshot pre-condición.
  expect(result.ok).toBe(false);
  expect(['FORM_VBNAME_PREFIX_MISMATCH', 'FORM_LEGACY_CONFLICT', 'AUTO_MODE_AMBIGUOUS'])
    .toContain(result.error?.code);

  const after = await client.call('list_objects', { kind: 'Form' });
  expect(after.forms).toEqual(before.forms);   // no mutó
  expect(after.orphans).toEqual(before.orphans); // no creó TempSccObj1 ni huérfanos
});
```

**Test 2 (cubrir hipótesis B)**: si por contrato se decide **normalizar** en vez de rechazar (auto-prefix `Form_` al `VB_Name` antes de mutar), entonces el `status: "ok"` NUNCA debe reportarse si la postcondición del binario es inválida.

```ts
it('nunca reporta status:ok si postcondición forms/documentModules es inválida', async () => {
  // Mismo setup que Test 1.
  // Pero asumiendo que el maintainer eligió la rama "normalizar" en vez de "rechazar".
  const result = await client.call('import_modules', {
    moduleNames: ['frmSplash'],
    importMode: 'Auto',
    dryRun: false,
    compile: false
  });

  // Si el import "exitoso" renombró el form a TempSccObj1 o dejó huérfano,
  // el status NO puede ser ok:true.
  if (result.ok === true) {
    const after = await client.call('list_objects', { kind: 'Form' });
    const originalFormStillPresent = after.forms.includes('Form_frmSplash');
    const noOrphanCreated = !after.forms.includes('TempSccObj1')
                         && !after.orphans.includes('frmSplash');
    expect(originalFormStillPresent).toBe(true);
    expect(noOrphanCreated).toBe(true);
  }
});
```

**Test 3 (cubrir hipótesis C — rollback)**: si la postcondición falla, el rollback restaura el form original.

```ts
it('rollback restaura form original ante SaveAsText/import failure', async () => {
  // Setup: temp .accdb con Form_frmSplash legacy.
  // Forzar un fallo durante el import (ej. .form.txt malformado o .cls con syntax error)
  // y verificar que el form preexistente sigue intacto en el binario.

  const before = await client.call('list_objects', { kind: 'Form' });
  expect(before.forms).toContain('Form_frmSplash');

  // Forzamos fallo con un .form.txt intencionalmente corrupto
  // (o un .cls con Attribute VB_Name apuntando a un módulo inexistente)
  await fs.writeFile('src/forms/frmSplash.form.txt.bak', await fs.readFile('src/forms/frmSplash.form.txt'));
  await fs.writeFile('src/forms/frmSplash.form.txt', 'Begin Form\nCORRUPTED\nEnd Form\n');

  try {
    await client.call('import_modules', {
      moduleNames: ['frmSplash'],
      importMode: 'Auto',
      dryRun: false,
      compile: false
    });
  } catch (e) {
    // esperado: falle
  }

  // Postcondición: el form original sigue en el binario, NO hay TempSccObj1 nuevo,
  // y un SaveAsText del form funciona igual que antes.
  const after = await client.call('list_objects', { kind: 'Form' });
  expect(after.forms).toContain('Form_frmSplash');
  expect(after.forms.filter(f => f.startsWith('TempSccObj'))).toEqual([]);

  // SaveAsText funciona
  const saveResult = await client.call('saveAsText', { formName: 'Form_frmSplash' });
  expect(saveResult.ok).toBe(true);

  // Restaurar
  await fs.writeFile('src/forms/frmSplash.form.txt', await fs.readFile('src/forms/frmSplash.form.txt.bak'));
});
```

**Test 4 (no-regresión de #1020)**: el caso original de #1020 sigue arreglado.

```ts
it('no regresa el caso original de #1020 (Ensure-VbNameAttributeAtTop con Form_ prefijo)', async () => {
  // Setup: .cls con VB_Name="Form_TestVBNameVerification" (caso prefijo explícito).
  // Esperado: import funciona ok, no "No se encontró el módulo".
  const result = await client.call('import_modules', {
    moduleNames: ['TestVBNameVerification'],
    importMode: 'Class',
    dryRun: false,
    compile: false
  });
  expect(result.ok).toBe(true);
  expect(result.result[0].status).toBe('ok');
});
```

**Test 5 (regresión específica del path Auto)**: cubrir el path que `#1020` no cubrió.

```ts
it('Auto con .cls + .form.txt donde .cls VB_Name=basename sin prefijo + form legacy Form_<base> queda en estado consistente', async () => {
  // Variante del Test 1 pero con validaciones de contrato más explícitas.
  // El maintainer elige: rechazar o normalizar.
  // Cualquiera de las dos debe producir un binario donde:
  //   1) Existe exactamente un form frmSplash (o Form_frmSplash, según contrato)
  //   2) Existe exactamente un document module frmSplash (o Form_frmSplash) con código
  //   3) No existe TempSccObj1
  //   4) SaveAsText del form funciona
  //   5) Un import posterior del mismo form es idempotente
});
```

## Disciplina

- TDD estricto: Tests 1-5 RED → GREEN → REFACTOR. PR no se abre sin los 5 verdes.
- Conventional commits. Scope sugerido: `fix(import-modules): form-auto-fail-closed-on-vbname-mismatch`.
- **NO tocar el fix de #1020** (`Ensure-VbNameAttributeAtTop`) — ya mergeado y verificado, no regresa (Test 4 lo cubre).
- **NO tocar el fix de #958** (self-heal legacy .form.txt metadata) — el bug de hoy está en el path `Auto` con form completo, no en metadata.
- **NO tocar `delete_module`** — funciona correctamente para limpiar TempSccObj1 (lo usé el 2026-07-20, ver Engram #20962).
- Mantener HR-1, HR-2, HR-3, HR-6 del consumer cross-project.
- Mantener `safe-by-default` y `dryRunDefault: true` por defecto.
- Si el fix requiere un nuevo error code tipado (ej. `FORM_VBNAME_PREFIX_MISMATCH`), documentarlo en `references/error-codes.md` con `remediation` claro.

## Acceptance output

- **PR con los 5 tests RED → GREEN** (Tests 1-5 de §"Tests RED sugeridos").
- **Changelog en `CHANGELOG.md`** con bullets:
  - `fix(import-modules): Auto con .cls + .form.txt completos no renombra form preexistente a TempSccObj1; fail-closed con FORM_VBNAME_PREFIX_MISMATCH si la normalización no es segura`.
  - `fix(import-modules): postcondición del binario se valida antes de reportar status:ok; nunca false-success`.
  - `fix(import-modules): rollback restaura form original ante SaveAsText/import failure en path Auto`.
  - `test: cubrir path Auto de #1020 con form completo (no-regresión)`.
- **Version bump: minor (`v2.21.0`)** — cambia comportamiento de un sub-tipo de inputs (`Auto` con form completo), introduce rollback en `import_modules`, agrega nuevo error code. Patch no es suficiente (cambia contrato), major no (no rompe compat hacia atrás para casos válidos).
- **Documentación**:
  - `references/error-codes.md`: agregar `FORM_VBNAME_PREFIX_MISMATCH` con `remediation` claro.
  - `assets/examples/import-modules.md`: agregar sección "Auto mode + form completo (.cls + .form.txt)" con el contrato exacto (rechazar vs normalizar) que el maintainer eligió.
  - Skill consumer `dysflow-usage`: actualizar tabla de effectiveDryRunDefault si aplica.
- **No-regression statement explícito** en el body del PR: "Tests 4 confirma que el caso de #1020 sigue arreglado. Tests 1-3 + 5 confirman que el path Auto con form completo ahora falla de forma segura o normaliza según contrato."

## Quick start

```bash
git clone <repo>
cd <repo>
git checkout -b fix/import-modules-form-auto-fail-closed

# Setup del fixture de regresión (script de Pester o TS integration)
# Crea temp .accdb con Form_frmSplash legacy, .cls VB_Name=frmSplash, .form.txt con basename frmSplash
pnpm install
pnpm run dev  # o npm run dev — arranca el MCP localmente
```

Test repro contra el dev (idéntico al del consumer, sin HR-2):

```bash
# Estado pre-condición
dysflow.list_objects({ kind: "Form" })
# Esperado: contiene Form_frmSplash, no contiene TempSccObj1, no contiene frmSplash huérfano

# Acción que reproduce el bug
dysflow.import_modules({
  moduleNames: ["frmSplash"],
  importMode: "Auto",
  dryRun: false,
  compile: false
})
# Antes del fix: { ok: true, result: [{ module: "frmSplash", status: "ok", imported: true }] }
# Después del fix: { ok: false, error: { code: "FORM_VBNAME_PREFIX_MISMATCH", remediation: "..." } }
#   o (si se eligió normalizar): { ok: true, result: [{ module: "Form_frmSplash", status: "ok", imported: true }] }
#     y el binario tiene Form_frmSplash intacto, sin TempSccObj1, sin huérfanos

# Estado post-condición
dysflow.list_objects({ kind: "Form" })
# Esperado (ambas ramas del fix): Form_frmSplash presente, sin TempSccObj1, sin huérfanos

dysflow.export_modules({ moduleNames: ["Form_frmSplash"] })
# Equivalente a un SaveAsText del form preexistente
# Esperado: ok: true (el form se puede serializar, no fue destruido)
```

Comandos de verificación reproducibles (consumer-side, para confirmar post-merge):

```bash
# 1. Pre-condición: temp .accdb con Form_frmSplash legacy
# 2. import_modules con los args del repro
# 3. list_objects: confirmar Form_frmSplash presente
# 4. export_modules: confirmar saveAsText funciona
# 5. Repetir el import una vez más: confirmar idempotencia (Test 5)
```

## Reinforcement

Regla cross-project que el fix debe mantener: **"Toda mutación del binario debe ser atómica, validada postcondición, y reversible. Un `status: ok` del tool implica que la postcondición del binario es válida (form canónico presente, sin huérfanos, sin TempSccObj, SaveAsText funciona). Si la postcondición no se cumple, el tool reporta error tipado y rollbacks al estado pre-import."**

Esta regla ya está implícita en las issues cerradas `#887` ("form_set_property silent corruption, no rollback"), `#951` ("applyGuardedFormWrite not atomic, no rollback"), `#958` ("fail-closed on structural damage") y `#975` ("feature request — transactional mode for write-tools"). El fix de este round debe consolidar esas direcciones en el path `Auto` de `import_modules` que es el más usado en fleet.

Si el fix requiere scope-reduction (ej. ofrecer un opt-in `legacyFormAutoNormalize: true` en `.dysflow/project.json` para proyectos que SÍ quieren el comportamiento legacy destructivo), documentar el rationale y ofrecerlo como opt-in, NO como default. Default = fail-closed.

## Referencias cruzadas

- **Round-3 issue `#1020`**: fix mergeado para `Ensure-VbNameAttributeAtTop` con prefijo `Form_`. NO regresa (Test 4 lo cubre). Este round es la **mitad faltante** del fix: el path `Auto` con form completo nunca pasó por la misma rama de normalización.
- **Round-4 issue `#1037`**: `writeExecutionPolicy: "developer"` no se propaga a `get_capabilities` en v2.20.0. Independiente de este round, pero ambos son gaps de v2.20.0.
- **Issues cerradas relacionadas (mismo anti-pattern)**:
  - `#560` "import_modules status:ok for forms doesn't guarantee UI was actually refreshed" — false-success.
  - `#732` "import_modules reports per-module success even when compile:true fails project-wide" — false-success.
  - `#745` "export_modules/export_all return success but write 0 files" — false-success.
  - `#887` "form_set_property apply:true leaves .form.txt with PARTIAL source mutations when the import gate fails" — silent corruption, no rollback.
  - `#951` "applyGuardedFormWrite not atomic - source mutates before binary gate, no rollback" — atomicity gap.
  - `#958` "import path must self-heal legacy .form.txt metadata and fail-closed on structural damage" — fail-closed contracto (este round lo extiende al path Auto).
  - `#975` "feature request — transactional mode for write-tools (atomic commit + rollback)" — feature abierta.
- **Observación Engram `expedientes/#21034`**: cross-session evidence del repro (2026-07-21 09:00:28, type `bugfix`).
- **Observación Engram `expedientes/#20962`**: cross-session evidence del workaround temporal (delete_module TempSccObj1 el 2026-07-20).
- **Cross-fleet impact**: aplicable a cualquier dysflow-consumer con forms que vinieron de `SaveAsText` (prefijo `Form_`) y que está normalizando al basename sin prefijo. `EXPEDIENTES` confirmado; `GESTION_RIESGOS` probable.
