# Round 6 — Dysflow v2.20.0: cuatro brechas de coherencia en el contrato `test_vba` ↔ `get_capabilities.tools[*]` ↔ taxonomía de error codes ↔ coherencia `validate_manifest` vs plan de ejecución

## Contexto del round

Round 6 contra `DysTelefonica/dysflow`. Las 4 brechas verificadas en este consumer (proyecto `EXPEDIENTES`, Engram project `expedientes`, repo `C:\00repos\codigo\00_EXPEDIENTES`) **comparten un mismo contrato** — la superficie observable por AI agents que decide automáticamente cómo invocar `test_vba` — y por eso van en UNA sola issue (no son issues separadas porque el contrato afectado es uno solo). Las 4 son verificadas en `v2.20.0` (`adapterVersion: "2.20.0"`, `toolsVisible: 89`).

Rounds previos del consumer `EXPEDIENTES` (todos cerrados en `DysTelefonica/dysflow`, archivados en `docs/prompts/`):

- Round 1 → issue `#1007` (cerrado en v2.19.0): `Attribute VB_VarHelpID` strippeado en `.cls` con `WithEvents`. Fix mergeado.
- Round 2 → issue `#1013` (cerrado): `test_vba` runner usa helper distinto al del bin en el sandbox. Sandbox resuelto.
- Round 3 → issue `#1020` (cerrado): `Ensure-VbNameAttributeAtTop` no preservaba el prefijo `Form_` en el `Attribute VB_Name`. Fix mergeado.
- Round 4 → issue `#1037` (cerrado): `capabilities.writeExecutionPolicy: "developer"` declarado en `.dysflow/project.json` no se propagaba al `get_capabilities` en v2.20.0. (Este round **NO** reabre el caso; referencia `#1037` solo como antecedente de la familia "config declarada vs runtime reportado".)
- Round 5 → issue `#1040` (abierto en el momento de redactar este prompt): `import_modules` Auto sobre form completo renombra `Form_<base>` a `TempSccObj1`, `status:ok`, sin rollback. Independiente de este round.

Subagentes (no son rounds del consumer `EXPEDIENTES`, referenciados solo para numeración libre):

- Round 11 → issue `#1044` (abierto): `run_vba` rechaza aliases Windows equivalentes. Familia `run_vba`, no `test_vba`.
- Round 13 → issue `#1045` (abierto): `run_vba` aplana procedure faltante y corrompe diagnóstico. Familia `run_vba`, no `test_vba`.

Próximo round libre del consumer después del 5 → **round 6** (este). Los subagentes usan numeración disjunta (11, 13) pero NO consumen el slot 6.

## Lo que YA funciona (NO tocar)

- Resolución del project config: `get_capabilities.projectConfig.status="valid"`, `writeReady=true`, `configPath` apunta al archivo que declara `"developer"` (todo OK según issue cerrada `#1037`).
- Override del consumer `dryRun:false` explícito en el call site **commitea igual** — el workaround del round 4 sigue funcionando. **Este round NO toca el camino funcional de `test_vba`**; toca el contrato observable alrededor del camino.
- `validate_manifest` reporta JSON-shape válido y `count` correcto de átomos (ej. 4/4 cuando el manifest tiene 4 átomos bien formados).
- `humanCompilePending:false` cuando el binario fue compilado manualmente. `toolsVisible: 89`, `writesProcess.enabled:true`, `writesProject.allowWrites:true`. `projectConfig.diagnostics:[]`.
- Round-trip binario ↔ source: `import_modules` con `dryRun:false` ejecuta los átomos (los 4 átomos `Test_GetWhereBusqueda_*` corrieron verde en este consumer usando el workaround `dryRun:false` explícito; el manifest `tests/tests.vba.get-where-busqueda.json` los referencia por nombre).
- HR-1 (humano compila), HR-2 (no `Stop-Process MSACCESS` genérico), HR-3 (no escribir backend de prod), HR-6 (tests en `tests/*.json`, no en allowlist). Sin cambios.
- Comportamiento intencional que NO se debe cambiar:
  - NO reintroducir `compile_vba` ni `compile:true`.
  - NO relajar el gate de allowlist (la gate sí debe existir; lo que está mal es que `dryRun:true` se anuncie como opt-out cuando no lo es, y que `validate_manifest` no la exponga).
  - NO tocar el fix de `#1037` (propagación de `writeExecutionPolicy`) ni el fix de `#1040` (rollback de `Auto` sobre form completo).
  - NO renombrar la gate de allowlist; el bug es de docs/clasificación, no de existencia de gate.

## Lo que falta en este round

Cuatro brechas agrupadas. Cada una tiene su evidencia literal. El contrato afectado es uno solo: **"lo que `get_capabilities` reporta sobre `test_vba` debe coincidir con lo que el schema acepta, lo que el runtime ejecuta, lo que la docs declara y lo que `validate_manifest` informa".** Hoy las 4 fuentes se contradicen entre sí para el mismo input.

### Bug A — `get_capabilities.tools.test_vba` reporta `commitFlag:"apply"` + `defaultBehavior:"noop"`, pero el schema rechaza `apply:true` con `MCP_INPUT_INVALID: apply is not allowed`. El camino funcional real es `dryRun:false`.

#### Síntoma verificado

`get_capabilities({})` devuelve para `test_vba`:

```json
{
  "test_vba": {
    "commitFlag": "apply",
    "noWriteAlias": "dryRun",
    "defaultBehavior": "noop"
  }
}
```

Pero invocar `test_vba({apply: true})` devuelve (verbatim):

```
MCP_INPUT_INVALID: apply is not allowed
```

Mientras que `test_vba({dryRun: false})` ejecuta el plan. Hay **dos contradicciones internas** en una sola línea de la registry: (i) `commitFlag:"apply"` ↔ schema que rechaza `apply:true`; (ii) `defaultBehavior:"noop"` ↔ `dryRun:false` que sí escribe.

#### Evidencia de repro

```js
const caps = await tools.dysflow.get_capabilities({});
console.log(caps.tools.test_vba);
// {
//   commitFlag: "apply",
//   noWriteAlias: "dryRun",
//   defaultBehavior: "noop"
// }

// Camino A (sigue el registry):
await tools.dysflow.test_vba({ testsPath: "tests/tests.vba.X.json", apply: true });
// Resultado: { ok: false, error: { code: "MCP_INPUT_INVALID", message: "apply is not allowed" } }

// Camino B (esquiva el registry, sigue el schema real):
await tools.dysflow.test_vba({ testsPath: "tests/tests.vba.X.json", dryRun: false });
// Resultado: { ok: true, result: { ... executed atoms ... } }
```

Esto NO afecta a otros write-class tools que también reportan `commitFlag:"apply"` (`import_modules`, `import_all`, etc.) — ver issue cerrada `#1014` / `#1031` que cubrió `import_modules + delete_module` y los 8 sibling tools en v2.19.0. La regresión es específica de `test_vba` (que en la registry histórica era `commitFlag:"dryRun"` y migró a `apply` sin migrar el schema), o es un `defaultBehavior:"noop"` mal copiado. El maintainer confirma cuál.

#### Riesgo

- AI agents que leen `caps.tools.test_vba.commitFlag` para construir el call automáticamente (skills `vba-run-tests`, `vba-binary-sync`, `sdd-apply`) van a armar `apply:true` por defecto → `MCP_INPUT_INVALID`.
- AI agents que leen `defaultBehavior:"noop"` van a omitir toda flag → `dryRun` resuelve al default del `writeExecutionPolicy` actual (que en este consumer es `safe-by-default` después del round 4 cerrado en `#1037`, o `developer` después del fix). El `noop` miente sobre el comportamiento real.
- Cross-fleet: cualquier consumer que automatice `test_vba` lee la misma línea del registry y arma el call igual de mal.

### Bug B — La skill `dysflow-usage/assets/examples/test-vba.md` líneas 31-35 promete que `dryRun:true` valida el manifest sin ejecutar y sin levantar `MCP_PROCEDURE_NOT_ALLOWED` / `MCP_ALLOWLIST_NOT_CONFIGURED`. El runtime rechaza con `PROCEDURE_NOT_ALLOWED: Refusing to execute test_vba plan` incluso con `dryRun:true`.

#### Síntoma verificado

Documentación verbatim (`C:\Users\adm1\.agents\skills\dysflow-usage\assets\examples\test-vba.md:31-35`):

> "When the manifest references a procedure that is not yet declared in `allowedProcedures`, pass `dryRun:true` once. The runtime validates the manifest shape without executing the atoms, and does not raise `MCP_PROCEDURE_NOT_ALLOWED` / `MCP_ALLOWLIST_NOT_CONFIGURED`."

Reproducción en este consumer (`EXPEDIENTES`) — el manifest `tests/tests.vba.get-where-busqueda.json` referencia `Test_GetWhereBusqueda_ResponsableCalidad_Cero_NoLimita` (nombre nuevo) mientras el allowlist en `.dysflow/project.json` aún tiene `Test_GetWhereBusqueda_ResponsableCalidad_Cero_Filtra` (nombre viejo):

```json
// tests/tests.vba.get-where-busqueda.json
[
  { "procedure": "Test_GetWhereBusqueda_ResponsableCalidad_Cero_NoLimita" },
  { "procedure": "Test_GetWhereBusqueda_ResponsableCalidad_Uno_Filtra" },
  { "procedure": "Test_GetWhereBusqueda_ResponsableCalidad_Muchos_Filtra" },
  { "procedure": "Test_GetWhereBusqueda_ResponsableCalidad_Vacio_NoLimita" }
]
```

Invocación `dryRun:true`:

```js
await tools.dysflow.test_vba({
  testsPath: "tests/tests.vba.get-where-busqueda.json",
  dryRun: true,
});
// Resultado observado:
// {
//   ok: false,
//   error: { code: "PROCEDURE_NOT_ALLOWED",
//            message: "Refusing to execute test_vba plan: ..."
//          }
// }
```

La docs dice explícitamente "does not raise `MCP_PROCEDURE_NOT_ALLOWED`". El runtime SÍ lo levanta, además con un código distinto del documentado (ver Bug C).

#### Riesgo

- El "opt-out temporal con `dryRun:true`" que la docs promete como flujo de escape ya no funciona. Consumers que arrastran manifests parcialmente fuera del allowlist (escenario normal durante refactors: el manifest se renombra antes que el allowlist) **no pueden validar el manifest con `dryRun:true`** — necesitan commitear el cambio en `.dysflow/project.json` antes de poder siquiera previsualizar el plan.
- Cross-fleet: la skill `dysflow-usage` (single source of truth) está mintiendo sobre el comportamiento real; todos los consumers que consultan este ejemplo van a armar un plan que falla.
- Cross-round: el round 4 cerrado en `#1037` ya reconoció que "AI agents que lean `effectiveDryRunDefault[tool]` para construir calls van a tomar la decisión equivocada". Este round es el mismo anti-pattern pero en otra superficie: la docs de `dryRun` opt-out también está mintiendo.

### Bug C — El código de error real `PROCEDURE_NOT_ALLOWED` no coincide con el documentado `MCP_PROCEDURE_NOT_ALLOWED` en `dysflow-usage/references/error-codes.md`.

#### Síntoma verificado

Documentación literal (`C:\Users\adm1\.agents\skills\dysflow-usage\references\error-codes.md:28-32`):

> ### `MCP_PROCEDURE_NOT_ALLOWED`
> **Trigger:** `procedureName` is not in `allowedProcedures`. Allowlist IS configured but the symbol is not listed.
> **Action:** Surface `error.allowedProcedures` to the user; ask whether to add the procedure to the allowlist or pick a different one.

Runtime real (ver Bug B): emite código `PROCEDURE_NOT_ALLOWED`, sin prefijo `MCP_`, sin campo `error.allowedProcedures` en el envelope.

Historia: el issue cerrado `#659` ("split `MCP_INPUT_INVALID` into `PROCEDURE_NOT_ALLOWED` with remediation and currently-allowed list") ya hizo el split en el runtime y agregó `remediation`. Pero la skill `dysflow-usage/references/error-codes.md` (y el ejemplo `test-vba.md` arriba) **no se actualizaron** — siguen citando `MCP_PROCEDURE_NOT_ALLOWED` como nombre canónico, sin `MCP_` prefix, y prometen un campo `error.allowedProcedures` que el runtime nunca emitió (sí emite `error.remediation` y posiblemente un `error.details.allowedProcedures[]` según el PR de `#659`; el maintainer confirma el shape actual).

#### Riesgo

- Consumers que matchean el código con `=== "MCP_PROCEDURE_NOT_ALLOWED"` (string exacta) van a no matchear y tratar el error como "error desconocido" / log-and-skip, perdiendo la remediación tipada que el runtime sí provee.
- La skill `dysflow-usage` está mintiendo sobre el nombre canónico. El script `assets/scripts/verify-examples-vs-runtime.ps1` debería detectar esta drift pero aparentemente no la detecta (¿regex permisiva?, ¿filtra solo `references/`? — el maintainer confirma).
- Cross-fleet: cualquier consumer que importe la tabla de error codes de la skill para construir un dispatcher de errores está trabajando con códigos desactualizados.

### Bug D — `validate_manifest` y el plan de `test_vba` no exponen coherentemente el drift entre el manifest y el allowlist: `validate_manifest` dice "valid 4/4", `test_vba` bloquea 1 átomo porque su nombre no está en el allowlist (el manifest fue renombrado y el allowlist no se actualizó en sincronía).

#### Síntoma verificado

Mismo fixture que Bug B. `validate_manifest` (con `testsPath` apuntando al manifest de 4 átomos) devuelve:

```
{ ok: true, result: { valid: 4, invalid: 0, atoms: 4 } }
```

(forma exacta a verificar contra runtime — el campo `result.invalid=0` es lo que el consumer infiere; el maintainer confirma la shape canónica.)

Pero `test_vba` con el mismo `testsPath` (incluso con `dryRun:true` por la docs) levanta `PROCEDURE_NOT_ALLOWED` para **uno** de los 4 átomos: `Test_GetWhereBusqueda_ResponsableCalidad_Cero_NoLimita`. Los otros 3 átomos del mismo manifest (`Test_GetWhereBusqueda_ResponsableCalidad_Uno_Filtra`, etc.) están en el allowlist porque su nombre NO cambió.

#### Diagnóstico preliminar

`validate_manifest` valida el JSON-shape del manifest (parseo, lista de átomos, tipos de campo `procedure`/`args`/`tags`) pero **NO** resuelve cada nombre de átomo contra `allowedProcedures`. La gate de allowlist corre solo en el dispatch layer de `test_vba`, después de que `validate_manifest` ya marcó "valid".

Esto significa: `validate_manifest` no puede usarse para predecir si `test_vba` va a pasar la gate de allowlist. La pre-flight contract que `validate_manifest` promete (los issues cerrados `#613` y `#703` lo agregaron como feature explícita: "catch missing test procedures pre-test_vba") **no se cumple para drift de allowlist** — solo para drift de schema y drift de procedure-not-exported. El nombre "validate_manifest" sugiere que valida TODO lo que el runtime va a chequear; en realidad valida solo subconjunto.

#### Riesgo

- Consumers que usan `validate_manifest` como pre-flight de `test_vba` (el caso del round 4 en `EXPEDIENTES` cuando los átomos se renombraron) **reciben un falso verde** y descubren el allowlist drift solo cuando `test_vba` falla con `PROCEDURE_NOT_ALLOWED`.
- Cross-fleet: cualquier consumer que automatiza "manifest listo → `validate_manifest` → commit → `test_vba`" asume que el primer paso detecta el drift. Hoy no lo hace.
- Cross-round: `#613` y `#703` prometieron cerrar este gap y cerraron solo el schema-drift side. El allowlist-drift side quedó abierto.

### Anti-regresión

- El fix de `#1037` (`writeExecutionPolicy` propagation) **NO debe regresar**. El round 4 fue cerrado contra este contrato y se re-verificó con este consumer. Test de regresión: con `capabilities.writeExecutionPolicy="developer"` declarado, `get_capabilities.writeExecutionPolicy="developer"` y `effectiveDryRunDefault["test_vba"]=false`.
- El fix de `#1040` (`import_modules` Auto rollback) **NO debe regresar**. El round 5 está abierto pero ya identificó el camino.
- Los fixes `#1014` / `#1031` (apply:true convention drift en 8 tools) — tampoco deben regresar.
- El gate de allowlist de `test_vba` debe seguir existiendo. NO relajar la gate. El bug NO es "la gate existe"; el bug es "la docs dice que `dryRun:true` esquiva la gate y no la esquiva; `validate_manifest` no la expone".

## Disciplina

- TDD estricto: RED → GREEN → REFACTOR por cada uno de los 4 bugs. Tests deben valer RED por sí solos (no rojo-por-suerte).
- Conventional commits con scope apropiado. Sugerencia de prefijos:
  - `fix(capabilities): align test_vba registry with schema and runtime default` (Bug A)
  - `fix(docs): correct dryRun:true opt-out semantics for test_vba allowlist gate` (Bug B)
  - `fix(docs+errors): rename PROCEDURE_NOT_ALLOWED to MCP_PROCEDURE_NOT_ALLOWED in references and verify-examples` (Bug C) — o la dirección inversa si el maintainer prefiere mantener el código runtime como `PROCEDURE_NOT_ALLOWED` y actualizar la skill (decisión del maintainer).
  - `fix(validate-manifest): expose allowlist drift as invalid atom, not just shape drift` (Bug D)
- NO relajar la gate de allowlist (`run_vba` / `test_vba` allowlist gate per HR-6 cross-project). El fix debe **endurecer** la coherencia docs↔runtime↔validator, NO eliminar la gate.
- NO renombrar el código `PROCEDURE_NOT_ALLOWED` sin avisar al consumer. Si la decisión es alinearlo a `MCP_PROCEDURE_NOT_ALLOWED` (dirección inversa), los skills `vba-run-tests`, `vba-validate-manifest`, `dysflow-usage` y los fixtures del consumer `EXPEDIENTES` tienen que sincronizarse en el mismo PR.
- NO reintroducir `compile_vba` ni `compile:true` (HR-1 cross-project).
- Si el fix requiere exponer campos nuevos en `get_capabilities.tools[*]` (ej. `effectiveDryRunDefault.test_vba`, `dryRunHonorAllowlist`, etc.), coordiná con el consumer `EXPEDIENTES` ANTES de publicar el changelog para sincronizar skills.
- Si el fix requiere un nuevo código de error tipado (ej. `MANIFEST_ALLOWLIST_DRIFT` para Bug D), documentarlo en `references/error-codes.md` con `remediation` claro y agregarlo a `verify-examples-vs-runtime.ps1`.

## Acceptance output

- PR con **mínimo 5 tests RED → GREEN** (uno por bug + 1 cross-coherence test que falla si los 4 contratos se desincronizan de nuevo en cualquier combinación de A/B/C/D).
- Changelog en `CHANGELOG.md` con bullets:
  - `fix(capabilities): test_vba registry commitFlag/defaultBehavior consistent with schema and runtime (round-6)`
  - `fix(docs): test_vba dryRun:true opt-out semantics reflect actual allowlist gate behavior (round-6)`
  - `fix(docs+errors): align error code naming between references/error-codes.md and runtime envelope (round-6)`
  - `fix(validate-manifest): expose allowlist drift as typed invalid atom (round-6)`
  - `test: contract coherence — get_capabilities, schema, runtime, docs, validate_manifest all agree on test_vba semantics (round-6)`
- Version bump: **minor (`v2.21.0`)** — cambia campos observables del contrato público (`get_capabilities.tools[*]`, `references/error-codes.md` nombres canónicos, shape de `validate_manifest`). NO patch: tres de los cuatro bugs cambian contrato documentado.
- Si la dirección del fix es "renombrar runtime a `MCP_PROCEDURE_NOT_ALLOWED`" (alinear runtime a docs):
  - Actualizar `verify-examples-vs-runtime.ps1` para que el código figure en el set válido.
  - Sincronizar `dysflow-usage/references/error-codes.md` y `assets/examples/test-vba.md`.
  - Avisar al consumer `EXPEDIENTES` para que actualice sus fixtures (`tests/*.json`) y skills (`vba-run-tests`, `vba-validate-manifest`).
- Si la dirección del fix es "actualizar docs a `PROCEDURE_NOT_ALLOWED`" (alinear docs a runtime):
  - Reemplazar `MCP_PROCEDURE_NOT_ALLOWED` por `PROCEDURE_NOT_ALLOWED` en la skill y los ejemplos.
  - Documentar la decisión de nomenclatura (sin prefijo `MCP_`) en `CHANGELOG.md` y avisar al consumer.
- Si Bug D requiere un campo `manifest.allowlistDrift[]` en `validate_manifest`: agregarlo como opt-in con default `false` para no romper consumers que parsean la shape actual.
- **No-regression statement explícito** en el body del PR: "Tests de regresión para `#1037`, `#1014`, `#1031` y la gate de allowlist siguen verdes. Los 4 bugs de este round cierran sin tocar el camino funcional de `test_vba` (los átomos siguen ejecutándose cuando están en el allowlist)."

## Tests RED sugeridos (TDD estricto)

**Test 1 — Registry ↔ schema consistency (Bug A):**

```ts
describe('get_capabilities.tools.test_vba registry contract (round-6)', () => {
  it('test_vba registry commitFlag matches the schema-accepted flag', async () => {
    const caps = await getCapabilities();
    const meta = caps.tools.test_vba;
    // Si meta.commitFlag === 'apply', entonces apply:true debe ser aceptado.
    // Si meta.commitFlag === 'dryRun', entonces dryRun:false debe ser el camino de commit.
    const sample = { testsPath: 'tests/manifest.fixture.json' };
    if (meta.commitFlag === 'apply') {
      const r = await callTool('test_vba', { ...sample, apply: true });
      expect(r.ok).not.toBe(false);
      // No MCP_INPUT_INVALID con "apply is not allowed"
    } else {
      const r = await callTool('test_vba', { ...sample, dryRun: false });
      expect(r.ok).not.toBe(false);
    }
  });
  it('test_vba defaultBehavior describes real behavior (not noop if it actually executes)', async () => {
    const caps = await getCapabilities();
    const meta = caps.tools.test_vba;
    // Si meta.defaultBehavior === 'noop', entonces ningún call sin flag debe ejecutar nada.
    // Hoy: meta.defaultBehavior === 'noop' pero dryRun:false SÍ ejecuta. RED.
    if (meta.defaultBehavior === 'noop') {
      const r = await callTool('test_vba', { testsPath: 'tests/manifest.fixture.json' });
      // Esperamos que NO ejecute y devuelva un envelope de plan-only.
      expect(['plan', 'noop']).toContain(r.defaultBehavior || 'noop');
    }
  });
});
```

**Test 2 — `dryRun:true` opt-out docs vs runtime (Bug B):**

```ts
it('test_vba with dryRun:true validates manifest without executing and without raising allowlist gate', async () => {
  // Setup: temp project con allowlist que NO incluye el átomo "Test_DriftedName".
  // Manifest referencia "Test_DriftedName" (drift intencional).
  const result = await callTool('test_vba', {
    testsPath: 'tests/manifest.drifted.json',
    dryRun: true,
  });
  // Esperado per docs: el runtime valida el shape del manifest y NO levanta
  // MCP_PROCEDURE_NOT_ALLOWED / PROCEDURE_NOT_ALLOWED.
  expect(result.error?.code).not.toMatch(/PROCEDURE_NOT_ALLOWED|ALLOWLIST_NOT_CONFIGURED/);
  expect(result.ok).toBe(true);
  expect(result.dryRun).toBe(true);
});
```

**Test 3 — Error code taxonomy (Bug C):**

```ts
it('runtime error code for allowlist miss matches the canonical name in references/error-codes.md', async () => {
  // Forzar el path de error con un manifest que referencia un átomo fuera del allowlist.
  const result = await callTool('test_vba', {
    testsPath: 'tests/manifest.not-allowed.json',
    dryRun: false,
  });
  // El código emitido por el runtime debe matchear EXACTAMENTE el código canónico
  // declarado en references/error-codes.md.
  const canonical = readCanonicalErrorCodes(); // fuente: assets/references/error-codes.md parseado
  expect(canonical).toContain(result.error.code);
});
```

**Test 4 — `validate_manifest` allowlist coherence (Bug D):**

```ts
it('validate_manifest reports allowlist drift as invalid atoms (not just shape drift)', async () => {
  // Setup: temp project con allowlist ["Test_InAllowlist"].
  // Manifest: [{ procedure: "Test_InAllowlist" }, { procedure: "Test_DriftedName" }].
  const result = await callTool('validate_manifest', {
    testsPath: 'tests/manifest.allowlist-drift.json',
  });
  // Hoy: result.valid = 2 (cuenta ambos átomos, ambos shape-OK). RED.
  // Esperado: result.invalid incluye "Test_DriftedName" como fuera-de-allowlist.
  expect(result.invalid.map(a => a.procedure)).toContain('Test_DriftedName');
  expect(result.invalid.find(a => a.procedure === 'Test_DriftedName').reason)
    .toMatch(/allowlist|allowedProcedures/i);
});
```

**Test 5 — Cross-coherence (regression net para los 4 bugs en cualquier combinación):**

```ts
describe('test_vba contract coherence (round-6 cross-coherence)', () => {
  it('registry, schema, runtime, docs, validate_manifest all agree on test_vba semantics', async () => {
    // Para un manifest con UN átomo en el allowlist y UN átomo fuera:
    // 1) registry.tools.test_vba debe describir el flag de commit correctamente.
    // 2) schema debe aceptar el flag que registry dice.
    // 3) runtime con dryRun:true (per docs) NO debe levantar allowlist gate.
    // 4) runtime con dryRun:false debe levantar EXACTAMENTE el código canónico
    //    declarado en references/error-codes.md.
    // 5) validate_manifest debe reportar el átomo fuera-del-allowlist como invalid.
    // Cualquier falla en cualquiera de los 5 lados hace RED este test.
    const manifestDrift = { testsPath: 'tests/manifest.cross-coherence.json' };
    const caps = await getCapabilities();
    const meta = caps.tools.test_vba;

    // (1)+(2): registry vs schema
    expect(['apply', 'dryRun']).toContain(meta.commitFlag);

    // (3): dryRun:true opt-out
    const dry = await callTool('test_vba', { ...manifestDrift, dryRun: true });
    expect(dry.error?.code).not.toMatch(/PROCEDURE_NOT_ALLOWED|ALLOWLIST_NOT_CONFIGURED/);

    // (4): canonical error code
    const commit = await callTool('test_vba', { ...manifestDrift, dryRun: false });
    const canonical = readCanonicalErrorCodes();
    expect(canonical).toContain(commit.error.code);

    // (5): validate_manifest expone el drift
    const val = await callTool('validate_manifest', manifestDrift);
    expect(val.invalid.length).toBeGreaterThan(0);
  });
});
```

Cada test vale RED por sí solo, no rojo-por-suerte. El Test 5 cubre regresión: cualquier drift futura en A/B/C/D hace RED este test.

## Quick start

```bash
git clone <repo>
cd <repo>
git checkout -b fix/test-vba-contract-coherence-round-6
pnpm install
pnpm run dev  # arranca el MCP localmente para repro manual
```

Repro desde un MCP client (idéntico al del consumer `EXPEDIENTES`):

```js
// (1) Verifica el gap de registry vs schema:
const caps = await tools.dysflow.get_capabilities({});
console.log(caps.tools.test_vba);
// Hoy: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "noop" }
await tools.dysflow.test_vba({ testsPath: "tests/manifest.drifted.json", apply: true });
// Hoy: { ok: false, error: { code: "MCP_INPUT_INVALID", message: "apply is not allowed" } }

// (2) Verifica el gap de dryRun:true opt-out:
await tools.dysflow.test_vba({ testsPath: "tests/manifest.drifted.json", dryRun: true });
// Hoy: { ok: false, error: { code: "PROCEDURE_NOT_ALLOWED", message: "Refusing to execute test_vba plan" } }
// Docs prometen: NO debe levantar allowlist gate.

// (3) Verifica el gap de error code:
const err = (await tools.dysflow.test_vba({ testsPath: "tests/manifest.drifted.json", dryRun: false })).error;
console.log(err.code, "vs docs MCP_PROCEDURE_NOT_ALLOWED");
// Hoy: "PROCEDURE_NOT_ALLOWED" vs docs "MCP_PROCEDURE_NOT_ALLOWED"

// (4) Verifica el gap de validate_manifest:
const val = await tools.dysflow.validate_manifest({ testsPath: "tests/manifest.drifted.json" });
console.log(val);
// Hoy: { ok: true, valid: 2, invalid: 0 } — NO expone el drift del allowlist.
// Esperado: invalid incluye el átomo fuera-del-allowlist con reason tipado.
```

Después del fix, los 5 tests RED → GREEN y el consumer `EXPEDIENTES` puede:

1. Quitar el workaround `dryRun:false` explícito del call site (no debería hacer falta si Bug A se cierra).
2. Confiar en `validate_manifest` como pre-flight completo (incluyendo allowlist drift, Bug D).
3. Matchear el código de error por nombre canónico (Bug C).
4. Usar `dryRun:true` como opt-out real durante refactors de manifests (Bug B).

## Reinforcement

Regla cross-project que el fix debe mantener: **"Todo lo que `get_capabilities` reporta sobre un tool debe ser verdad operacional: el flag de commit que dice el registry debe ser el que el schema acepta; el defaultBehavior debe describir lo que pasa cuando no se pasa flag; el código de error que el runtime emite debe ser el que la docs declara; el pre-flight (`validate_manifest`) debe exponer TODO lo que el dispatch layer va a chequear, no solo subconjunto."**

Esta regla ya está implícita en:

- `#621` ("mcp-contract-safety: read-only mislabel + modern/legacy alias drift + CI release title check") — cerró el lado de read-only mislabel y alias drift.
- `#659` ("split `MCP_INPUT_INVALID` into `PROCEDURE_NOT_ALLOWED`") — cerró el split del código, pero dejó la docs y el resto del contrato sin sincronizar.
- `#613` y `#703` ("dysflow_validate_manifest to catch missing test procedures pre-test_vba") — cerraron el lado de schema-drift, pero no el de allowlist-drift.
- `#1037` ("writeExecutionPolicy propagation") — cerró el lado de policy-drift, pero no el resto.

Este round 6 cierra la **familia completa** de contract coherence gaps para `test_vba`. Después de este PR, ningún consumer que automatice `test_vba` debería poder caer en estos 4 anti-patterns.

Si el fix requiere scope-reduction (ej. ofrecer un opt-in `validateManifestIncludesAllowlistCheck: true` en `.dysflow/project.json` para proyectos que SÍ quieren la validación completa), documentar el rationale y ofrecerlo como opt-in con default `false` por compatibilidad, hasta que `v3.0` lo suba a default. NO romper la shape actual de `validate_manifest` sin avisar.

## Referencias cruzadas

- **Rounds previos del consumer `EXPEDIENTES`**: ver §"Contexto del round".
- **Issues cerradas relacionadas (mismo anti-pattern "registry/runtime/docs desincronizados")**:
  - `#621` — read-only mislabel + alias drift + CI release title check. Cerró lado read-only.
  - `#659` — split `MCP_INPUT_INVALID` en `PROCEDURE_NOT_ALLOWED`. Cerró el split del código; la docs NO se sincronizó.
  - `#613` / `#703` — `validate_manifest` para catch missing procedures. Cerró schema-drift; allowlist-drift quedó abierto (este round lo cierra).
  - `#1037` — `writeExecutionPolicy` propagation. Cerró policy-drift; este round cubre los demás ejes del mismo contrato.
  - `#1014` / `#1031` — `apply:true` convention drift en 8 sibling tools. Cubrió `import_modules + delete_module` y 8 tools; `test_vba` específicamente queda fuera (este round lo cubre).
  - `#980` (Round-12 19/19) — "extend error code taxonomy to ALL dysflow tools (read + write)". Cubrió la taxonomía general; este round cierra la taxonomía para `test_vba` específicamente (código que ya se emite pero no está documentado).
- **Skills consumer-side a sincronizar si cambia la shape**:
  - `C:\Users\adm1\.agents\skills\dysflow-usage\SKILL.md` §"Write-execution-policy" + §"Quick start"
  - `C:\Users\adm1\.agents\skills\dysflow-usage\assets\examples\test-vba.md` (líneas 31-35 del opt-out)
  - `C:\Users\adm1\.agents\skills\dysflow-usage\references\error-codes.md` (códigos `MCP_PROCEDURE_NOT_ALLOWED`, `MCP_ALLOWLIST_NOT_CONFIGURED`)
  - `C:\Users\adm1\.agents\skills\vba-run-tests\SKILL.md` (cómo decide si pasar `dryRun:false`)
  - `C:\Users\adm1\.agents\skills\vba-validate-manifest\SKILL.md` (cómo trata la respuesta de `validate_manifest`)
  - `C:\Users\adm1\.agents\skills\access-vba-tdd-loop\SKILL.md` (loop de TDD que usa `validate_manifest` como pre-flight)
- **Cross-fleet impact**: cualquier dysflow-consumer que automatice `test_vba` lee el mismo `get_capabilities.tools.test_vba` y la misma `references/error-codes.md`. Aplica a toda la flota, no solo a `EXPEDIENTES`.
- **Observación Engram del consumer**: pendiente de crear al cierre de este round (`expedientes/#<nuevo>`, type `bugfix`, scope `project`).