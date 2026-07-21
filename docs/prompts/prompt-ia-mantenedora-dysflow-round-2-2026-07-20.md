# Round 2 — dysflow `test_vba` runner usa sandbox con helper DIFERENTE al bin

## Resumen

- **Mode:** bug-hunt
- **Variant:** medium
- **Tool:** dysflow MCP (version `v2.19.0`)
- **Repo:** `<repo path>`
- **Branch sugerida:** `fix/runner-sandbox-sync`

## Contexto del round

Round 2 contra DysTelefonica/dysflow. Round 1 (`#1007`) ya cerrado: el fix de `Normalize-VbaImportText` strippeando member-level `Attribute *.VB_VarHelpID` está operativo y verificado por el consumer (`EXPEDIENTES`) — `import_modules({moduleNames:["WebSocket"], dryRun:false})` ya no entra al F16 fallback con `fallbackReason:"add_from_file_truncated"`.

Este Round 2 es un NUEVO gap descubierto cuando el consumer intentó cerrar el gap tests↔código pendiente en `EXPEDIENTES`. NO es regresión del round 1; es comportamiento del **runner de `test_vba`**.

## Lo que YA funciona (NO tocar)

- `verify_code`, `import_all`, `export_all`, `list_vba_modules` funcionando normal en el consumer. Drift source↔bin: 0.
- `import_modules` (round-trip de clases con `WithEvents`): 113/113 verde desde v2.19.0. `fallbackUsed:false`, `fallbackReason:null`.
- `get_capabilities`, `get_procedure`, `query_sql`, `vba_inline_execution` (cuando hay memoria suficiente) funcionando.
- 3 de los 4 atoms del `Test_GetWhereBusqueda.bas` del consumer PASAN con el código actual:
  - Atom 1 (`ResponsableCalidad="Todos"`): assert contiene `Is Null` → matchea con el WHERE generado → **verde**.
  - Atom 2 (`ResponsableCalidad="0"`, renombrado `Cero_Filtra`): assert contiene `'0'` → matchea con WHERE → **verde**.
  - Atom 4 (`ResponsableCalidad=""`): assert contiene `Is Null` → matchea → **verde**.
- Política `safe-by-default`, gates de writes, gates de `humanCompilePending`, allowlist, siguen vigentes.
- Round 1 cerrado (issue `#1007`), patch mergeado en v2.19.0.

## Lo que falta en este round

### Bug 1: `test_vba` runner carga el helper desde un sandbox con código distinto al del bin

#### Síntoma verificado

Al ejecutar `test_vba` con `procedure: "Test_GetWhereBusqueda_ResponsableCalidad_IDLimita"`, el runner devuelve `ok:false` con el assert 5 fallando. El assert 5 busca el InStr de la subcadena `ResponsableCalidad Is Null or Not ResponsableCalidad Is Null` y lo **encuentra** en el WHERE que el sandbox generó. Sin embargo, el mismo input (`m_Exp.ResponsableCalidad = "119"`) ejecutado vía `vba_inline_execution` contra el mismo bin produce un WHERE con `ResponsableCalidad='119'` (sin la subcadena `Is Null`). El bin está correcto; el sandbox del runner no.

#### Evidencia de repro

**Salida literal de `test_vba` (Atom 3):**

```json
{
  "ok": false,
  "procedure": "Test_GetWhereBusqueda_ResponsableCalidad_IDLimita",
  "argsCount": 0,
  "returnValue": "{\"ok\":false,\"value\":null,\"payload\":null,\"error\":\"\",\"logs\":[\"1. Arrange: ExpedienteBusqueda con ResponsableCalidad='119'\",\"2. Act: getWhereBusqueda\",\"3. Assert: el WHERE contiene la clausula '='119' para ResponsableCalidad\",\"4. Assert: el WHERE contiene la clausula '='162' para ResponsableSeguridad\",\"5. Assert: el WHERE NO contiene la clausula IS NULL para ResponsableCalidad (esos campos SI filtran)\"]}",
  "returnType": "System.String",
  "durationMs": 3000,
  "error": null
}
```

Logs llegan hasta "5. Assert" → el InStr del assert 5 fue **TRUE** en el sandbox: el WHERE contiene la subcadena `ResponsableCalidad Is Null...`. El Test_* retornó `BuildFail` con logs hasta el 5 (no aparece "6. Assert", porque BuildFail tiene `Exit Function` antes del 6).

**Salida literal de `vba_inline_execution` con input `"119"` contra el mismo bin:**

```
WHERE (Estado Is Null or Not Estado Is Null) AND (CadenaContratistas Is Null or Not CadenaContratistas Is Null) AND (TbExpedientesConEntidades.CadenaPecal Is Null or Not TbExpedientesConEntidades.CadenaPecal Is Null) AND (Clasificacion Is Null or Not Clasificacion Is Null) AND  AND (CodExp Is Null or Not CodExp Is Null) AND  AND ResponsableCalidad='119'  AND ResponsableSeguridad='162' AND (CadenaComerciales Is Null or Not CadenaComerciales Is Null) AND (CadenaRACs Is Null or Not CadenaRACs Is Null) ;
```

No contiene `ResponsableCalidad Is Null`. Contiene `ResponsableCalidad='119'` y `ResponsableSeguridad='162'`.

**`get_procedure({module:"FUNCIONES UTILES", procedure:"getWhereBusqueda"})` (del bin):**

```vba
If .ResponsableCalidad = "Todos" Or .ResponsableCalidad = "" Then
    m_WhereCalidad = "(ResponsableCalidad Is Null or Not ResponsableCalidad Is Null) "
Else
    m_WhereCalidad = "ResponsableCalidad='" & .ResponsableCalidad & "' "
End If
If .ResponsableSeguridad = "Todos" Or .ResponsableSeguridad = "" Then
    m_WhereRespSeguridad = "(ResponsableSeguridad Is Null or Not ResponsableSeguridad Is Null) "
Else
    m_WhereRespSeguridad = "ResponsableSeguridad='" & .ResponsableSeguridad & "' "
End If
```

**El código del helper en el bin es correcto** (rama explícita Is Null solo para "Todos"/""). El sandbox del runner está usando OTRO código.

#### Diagnóstico preliminar (verificado parcialmente, sin acceso al sandbox)

- Cada atom tarda ~10.6 segundos (tiempo medido para Atom 1 + duración de ~3000ms en Atom 3). Eso es consistente con: crear temp `.accdb` → importar módulos → ejecutar Tests → destruir.
- Tiempo NO escala con cantidad de Tests (un solo atom tarda 10s igual que 4). Eso significa que el costo está en el setup del sandbox, NO en la ejecución.
- Hipótesis 1: el sandbox importa el módulo Test_* + helper desde el bin actual. → **DESCARTADO** porque el vba_inline_execution contra el mismo bin produce WHERE distinto.
- Hipótesis 2: el sandbox usa un cache stale del helper. → **PROBABLE** si el runner cachea al primer import.
- Hipótesis 3: el sandbox tiene su propio código embebido del helper (e.g. embedded test fixture). → Menos probable pero no se puede descartar sin inspeccionar `.dysflow/internal/`.

`ExpedienteBusqueda.cls:20-21` del consumer expone:
```vba
Public ResponsableCalidad As String
Public ResponsableSeguridad As String
```

Y `list_procedures({module:"ExpedienteBusqueda"})` retorna `procedures:[]` (no hay `Class_Initialize`, no hay Property Let/Get custom). Es una variable pública simple; asignar `.ResponsableCalidad = "119"` no debería anularse.

#### Riesgo

- Cualquier consumer con `Test_*` que tenga aserciones sobre cláusulas WHERE exactas puede ver 1 de N atoms rojo sin causa visible desde el consumer.
- En `EXPEDIENTES`: 1 de 4 atoms falla (25% failure rate con código del helper correcto).
- En otros consumers VBA + Access con helpers de WHERE complejos: puede ser peor, hasta 100% si el sandbox tiene un helper de placeholder.
- El flag `humanCompilePending` no atrapa este caso (porque el bin sí está compilado, solo el sandbox tiene el código viejo).
- Tests paralelos: si dos consumers distintos llaman `test_vba` cerca uno del otro, podrían compartir sandbox state.

#### Tests RED sugeridos (TDD)

Test 1 — Sandbox sync (unit e2e del runner):

```ts
it("sandbox getWhereBusqueda matches bin's byte-exact", async () => {
  const binModule = await readModuleFromBin("FUNCIONES UTILES", "getWhereBusqueda");
  const sandboxResult = await client.call("test_vba", {
    procedure: "Test_HelperSandboxSync_GetWhereBusqueda"
  });
  expect(sandboxResult.helperSource).toBe(binModule.source);
  // Actualmente falla: retornan fuentes distintas.
});
```

Test 2 — Helpers de dummy (unit):

```ts
it("Test_DummyAssert_Forzar_Que_GeneraIgual pasa en sandbox y bin", async () => {
  // fixture en sandbox y bin: mismo input → mismo WHERE
  const expected = "ResponsableCalidad='119'";
  const sandboxWhere = await runInSandbox("HelperCapture", "119");
  const binWhere = await runInBin("HelperCapture", "119");
  expect(sandboxWhere).toBe(binWhere);
  // Fallaría porque sandbox.helper es distinto del bin.helper.
});
```

Test 3 — Diagnóstico sandbox-side:

```ts
it("el runner expone el path del sandbox temp .accdb para debugging", async () => {
  const result = await client.call("test_vba", { procedure: "Test_Stub" });
  expect(result.sandboxPath).toBeDefined();
});
```

Cada test debe valer RED por sí solo (no rojo-por-suerte).

## Disciplina

- TDD estricto (RED → GREEN → REFACTOR) sobre el runner, no sobre el consumer.
- Conventional commits con scope `runner` o `test-vba` (e.g. `fix(runner): test_vba sandbox sync el código del helper contra el bin (#<este-issue>)`).
- **NO relajar las aserciones de los Tests del consumer** como workaround. Eso es el camino fácil que esconde el bug. El Round 1 cerró un bug estructural en `Normalize-VbaImportText`; este Round 2 es un bug de runner distinto.
- Cambios mínimos: scope del fix queda dentro del path del runner (probablemente `scripts/dysflow-vba-manager.ps1` o equivalente, o un wrapper nuevo que sincronice el sandbox). Investigar primero qué mecanismo crea el sandbox.
- NO tocar `import_modules`, `export_modules`, `export_all`, `verify_code`, `get_capabilities`, ni los gates. El fix es SOLO del flujo `test_vba`.
- Round 1 (issue #1007) sigue cerrado y mergeado en v2.19.0. No tocar ese commit path.

## Acceptance output

- PR con los 3 tests RED → GREEN.
- `CHANGELOG.md` con bullet: `fix(runner): test_vba sandbox sync el código del helper contra el bin, no usar cache stale (#<este-issue>)`.
- **Version bump: patch (`v2.19.1`)** — fix acotado al runner, sin cambio de contrato.
- (Opcional, PR separado) Si requiere exponer el path del sandbox para debugging: AR-1 vía `dysflow-codegraph-update`.
- Cross-session safety: el consumer `EXPEDIENTES` ya actualizó el manifest `tests.vba.get-where-busqueda.json` y el `.dysflow/project.json` allowlist para el Atom 2 renombrado (`Test_GetWhereBusqueda_ResponsableCalidad_Cero_Filtra`); ningún cambio extra se requiere del consumer-side para el fix del runner.

## Quick start

```bash
git clone <repo path>
cd <repo>
git checkout -b fix/runner-sandbox-sync
pnpm install
```

Test RED (en `scripts/tests/dysflow-vba-manager.Tests.ps1` o nuevo):

```powershell
Invoke-Pester -Path scripts/tests/dysflow-vba-manager.Tests.ps1 `
    -Output Detailed `
    -FullNameFilter "*SandboxSync*|*RunnerHelper*"
# Esperado: 3 REDs (sandbox.getWhereBusqueda !== bin.getWhereBusqueda por contenido)
```

Después del fix:

```powershell
Invoke-Pester -Path scripts/tests/dysflow-vba-manager.Tests.ps1 `
    -Output Detailed
# Esperado: 3 nuevos GREENs; 0 regresiones en el resto de la suite
```

Repro e2e desde el consumer (`EXPEDIENTES`, ya en disco con el bug expuesto):

```bash
# Estado actual: 3/4 verde. Atom 3 falla. Esperado después del fix: 4/4 verde.
gh issue view <numero-de-este-issue>

# Verificacion manual:
gh test_vba --repo expedientes --procedure Test_GetWhereBusqueda_ResponsableCalidad_IDLimita
# Esperado: ok:true.
```

## Reinforcement

Recordatorio cross-project: el fix no debe reintroducir `compile_vba` (HR-1: humano compila). Y el gate `humanCompilePending` se mantiene. Si el fix propone bypass del compile humano para "arreglar" el sandbox, escalar a siguiente round — no compensa.

## Reference

- Round 1 archivado en: `docs/prompts/prompt-ia-mantenedora-dysflow-round-1-2026-07-20.md` (en este repo).
- Manifest del consumer: `C:/00repos/codigo/00_EXPEDIENTES/tests/tests.vba.get-where-busqueda.json`.
- Module: `C:/00repos/codigo/00_EXPEDIENTES/src/modules/Test_GetWhereBusqueda.bas` (4 atoms, 248 líneas).
- Issue linked: <este-issue>.
