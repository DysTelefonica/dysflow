# Round 4 — `capabilities.writeExecutionPolicy: "developer"` se ignora: el runtime devuelve `safe-by-default` y `effectiveDryRunDefault[*] = true` aunque la config declare lo contrario

## Contexto del round

Round 4 contra DysTelefonica/dysflow. Rounds previos del consumer `EXPEDIENTES` (proyecto `C:\00repos\codigo\00_EXPEDIENTES`):

- Round 1 → issue `#1007` (cerrado en v2.19.0): `Attribute VB_VarHelpID` strippeado en clases con `WithEvents`. Fix mergeado.
- Round 2 → issue `#1013` (cerrado): `test_vba` runner crea una temp `.accdb` sandbox con helper distinto al del bin. Sandbox mystery resuelto.
- Round 3 → issue `#1020` (cerrado): `Ensure-VbNameAttributeAtTop` no maneja `VB_Name` con prefijo `Form_`. Fix mergeado.
- Round 4 (este): en `v2.20.0`, el campo `capabilities.writeExecutionPolicy: "developer"` declarado en `.dysflow/project.json` no se refleja en `get_capabilities`. El runtime sigue reportando `writeExecutionPolicy: "safe-by-default"` y `effectiveDryRunDefault[*] = true` para todos los write-class tools, aunque la resolución del project config confirma el archivo exacto y `status: "valid"` + `writeReady: true`.

Esto rompe el contrato documentado en `dysflow-usage` §"Write-execution-policy": cuando un consumer opt-in por `developer` con intención de "zero-friction local dev loop", el adapter debería devolver `effectiveDryRunDefault[tool] = false` para los `routine-dev-write`. Hoy eso no pasa.

## Lo que YA funciona (NO tocar)

- `get_capabilities.projectConfig` reconoce el path exacto del config, devuelve `status:"valid"` y `writeReady:true` — la lectura del archivo es correcta.
- La función de `dryRun:false` explícito en el input **commitea igual** — el override del consumidor funciona como workaround. Eso es lo que hizo que los 4 tests de `Test_GetWhereBusqueda` (manifest `tests/tests.vba.get-where-busqueda.json`, este round-post en el consumer) pasaran sin tocar la skill `vba-run-tests`.
- Resolución de worktree, gates de writes, gates de `humanCompilePending`, project id propagation, capabilities.procedures.allow, passwordEnv. Cross-project: HR-1 (humano compila), HR-2 (`Stop-Process MSACCESS` prohibido), HR-3 (no escribir backend de prod), HR-6 (tests en `tests/*.json`, no en allowlist).
- 89 tools visibles (toolsVisible), `humanCompilePending:false`. `projectConfig.diagnostics:[]` — el config no reporta nada raro.

## Lo que falta en este round

### Bug 1: `writeExecutionPolicy` declarado en `.dysflow/project.json` no se propaga al campo `writeExecutionPolicy` y al map `effectiveDryRunDefault[*]` que `get_capabilities` reporta

#### Síntoma verificado

`get_capabilities` reporta valores que contradicen la configuración declarada por el consumer:

```json
{
  "adapterVersion": "2.20.0",
  "writeExecutionPolicy": "safe-by-default",
  "effectiveDryRunDefault": {
    "import_modules":       true,
    "import_all":           true,
    "test_vba":             true,
    "export_modules":       true,
    "export_all":           true,
    "form_set_property":    true,
    "form_delete_control":  true,
    "apply_form_design_plan": true,
    "sync_binary":          true,
    "vba_inline_execution": true
  },
  "humanCompilePending": false,
  "projectConfig": {
    "status": "valid",
    "writeReady": true,
    "configPath": "C:/00repos/codigo/00_EXPEDIENTES/.dysflow/project.json",
    "projectId": "expedientes"
  }
}
```

Pero el `.dysflow/project.json` que el adapter cita como `configPath` declara explícitamente `developer`:

```json
{
  "id": "expedientes",
  "projectRoot": "C:/00repos/codigo/00_EXPEDIENTES",
  "accessPath": "C:/00repos/codigo/00_EXPEDIENTES/Expedientes.accdb",
  "backendPath": "C:/00repos/datos/Expedientes_datos.accdb",
  "destinationRoot": "C:/00repos/codigo/00_EXPEDIENTES/src",
  "timeoutMs": 60000,
  "capabilities": {
    "writeExecutionPolicy": "developer",
    ...
  }
}
```

`projectConfig.status="valid"` + `writeReady=true` + `configPath` apuntando al archivo correcto demuestran que la config SE CARGÓ; lo que NO se propaga es la lectura del campo `capabilities.writeExecutionPolicy` hacia el resolver que arma `writeExecutionPolicy` y `effectiveDryRunDefault`.

#### Evidencia de repro

**Setup del consumer `EXPEDIENTES`:** sin cambios estructurales al bin ni al `.dysflow/project.json` durante el round. La drift aparece en cuanto se consulta `get_capabilities` contra este proyecto.

**Comando exacto que reproduce:**

```js
const raw = await tools.dysflow.get_capabilities({});
const snap = typeof raw === "string" ? JSON.parse(raw) : raw;
console.log({
  adapterVersion: snap.adapterVersion,
  declaredInConfig: "developer", // ← capabilities.writeExecutionPolicy en project.json
  reportedByRuntime: snap.writeExecutionPolicy, // ← debería ser "developer"
  importModulesDefault: snap.effectiveDryRunDefault["import_modules"],
  testVbaDefault: snap.effectiveDryRunDefault["test_vba"],
});
// Output:
// {
//   adapterVersion: "2.20.0",
//   declaredInConfig: "developer",
//   reportedByRuntime: "safe-by-default",   // ← GAP: ignora la config
//   importModulesDefault: true,              // ← debería ser false en modo developer
//   testVbaDefault: true                     // ← debería ser false en modo developer
// }
```

**Snapshots literales side-by-side para auditoría:**

| Fuente | Campo | Valor |
| --- | --- | --- |
| `C:\00repos\codigo\00_EXPEDIENTES\.dysflow\project.json` línea 9 | `capabilities.writeExecutionPolicy` | `"developer"` |
| `get_capabilities(...).writeExecutionPolicy` | (runtime) | `"safe-by-default"` |
| `get_capabilities(...).effectiveDryRunDefault["import_modules"]` | (runtime) | `true` |
| `get_capabilities(...).effectiveDryRunDefault["test_vba"]` | (runtime) | `true` |
| `get_capabilities(...).projectConfig.status` | (runtime) | `"valid"` |
| `get_capabilities(...).projectConfig.writeReady` | (runtime) | `true` |
| `get_capabilities(...).projectConfig.configPath` | (runtime) | `"C:/00repos/codigo/00_EXPEDIENTES/.dysflow/project.json"` |

La fila `projectConfig.configPath` apunta exactamente al archivo donde la fila 1 declara `"developer"`. **Runtime encuentra la config, ignora la política.**

#### Workaround que oculta el gap (NO es fix)

Pasar `dryRun:false` explícito en el call site commitea:

```js
await tools.dysflow.import_modules({
  projectId: "expedientes",
  moduleNames: ["m_Where", "Test_GetWhereBusqueda"],
  dryRun: false,   // ← override manual; el runtime ya estaba en safe-by-default
});
await tools.dysflow.test_vba({
  testsPath: "tests/tests.vba.get-where-busqueda.json",
  dryRun: false,   // ← mismo workaround
});
```

Resultado verificado: `test_vba` corrió los 4 átomos de `Test_GetWhereBusqueda_*` y pasaron (3 verdes + 1 verde de cobertura). **Pero el override del consumidor NO es la solución** — cualquier tool, agente o integration que lea `get_capabilities` para decidir `dryRun` automáticamente va a tomar la decisión equivocada.

#### Diagnóstico preliminar (verificado parcialmente con `file:line`)

**Cadena de llamada exacta (resolución basada en `dysflow-usage` §"Write-execution-policy"):**

1. `get_capabilities({})` MCP caller.
2. Adapter resuelve project config (valida OK: `status:"valid"`, `writeReady:true`, `configPath` apunta al archivo correcto).
3. Adapter lee `capabilities.writeExecutionPolicy` del archivo — debería copiar este valor a `get_capabilities.writeExecutionPolicy`. **No lo hace (queda `safe-by-default`)**.
4. Adapter arma `effectiveDryRunDefault[tool]` consultando `writeExecutionPolicy` resuelto + `tools[tool].risk`. En modo `developer` + `risk:"routine-dev-write"` el valor esperado es `false`. **Todos los tools devuelven `true`** (default `safe-by-default`).
5. Consumers que leen `effectiveDryRunDefault[toolName]` para decidir si pasan `dryRun:false` automáticamente (per skill `vba-run-tests` y `vba-binary-sync`) van a planificar en lugar de commitear.

**Hipótesis:** el resolver de policy (`scripts/dysflow-vba-manager.ps1` o su equivalente TS post-port) está retornando el default `"safe-by-default"` antes de leer `capabilities.writeExecutionPolicy`, o ignora el campo por mismatch de casing / path. La fix #785 cerró un bug parecido ("connect risk-based write policy to real import/test execution path", commit referenciado en el changelog), pero algo en la cadena de resolución se rompió o nunca conectó para el campo `writeExecutionPolicy` propagado a `get_capabilities`.

**Búsqueda de duplicados en el repo maintainer:** cero issues abiertos con `writeExecutionPolicy` o `effectiveDryRunDefault` (verificado vía `gh api search/issues?q=repo:DysTelefonica/dysflow+writeExecutionPolicy` y `...+effectiveDryRunDefault`, retorno vacío). Tampoco aparece label `round-4` aplicada al consumer `EXPEDIENTES` en el maintainer — round-N es numeración interna del consumer.

#### Riesgo

- **Todos los consumers de dysflow que opt-in por `"developer"` en su `.dysflow/project.json` para dev-loop sin fricción están funcionando en `safe-by-default` sin saberlo.** El contrato documentado en `dysflow-usage` está mintiendo sobre el estado del runtime.
- AI agents que lean `effectiveDryRunDefault[tool]` para construir calls (skills `vba-binary-sync`, `vba-run-tests`, `access-form-ui-builder`, `sdd-apply`, etc.) van a pasar `dryRun:true` por error, planificando en lugar de commiteando. El consumer tiene que recordar el workaround `dryRun:false` explícito manualmente en cada tool.
- En `EXPEDIENTES`: este round-post pasó los 4 tests usando el workaround. Mañana cualquier feature nueva va a heredar el gap.
- Cross-fleet: cualquier consumer con `"developer"` declarado está afectado — el campo parece escrito pero no leído.
- Cross-project: el round-2 (`#1013`) introduce sync limpio en otros consumers; el workaround `dryRun:false` explícito que el consumer `EXPEDIENTES` aplica a mano no escala a automation.

#### Tests RED sugeridos (TDD strict)

**Test 1 — unit resolver** (extender `scripts/tests/dysflow-vba-manager.Tests.ps1` o el archivo de tests del resolver en TS):

```powershell
Describe "get_capabilities propagates writeExecutionPolicy from .dysflow/project.json (round-4 issue, regression of #785)" {
    It "reports writeExecutionPolicy='developer' when capabilities.writeExecutionPolicy='developer' in config" {
        $tmpRoot = New-Item -ItemType Directory -Path "TestDrive:/round4project" -Force
        @{ capabilities = @{ writeExecutionPolicy = "developer" } } |
            ConvertTo-Json | Set-Content -LiteralPath "$tmpRoot/project.json" -Encoding UTF8
        $result = Get-Capabilities -ProjectRoot $tmpRoot.FullName
        $result.writeExecutionPolicy | Should -Be "developer"
    }

    It "reports effectiveDryRunDefault['import_modules']=false in developer mode for routine-dev-write tools" {
        $tmpRoot = New-Item -ItemType Directory -Path "TestDrive:/round4project2" -Force
        @{ capabilities = @{ writeExecutionPolicy = "developer" } } |
            ConvertTo-Json | Set-Content -LiteralPath "$tmpRoot/project.json" -Encoding UTF8
        $result = Get-Capabilities -ProjectRoot $tmpRoot.FullName
        $result.effectiveDryRunDefault["import_modules"] | Should -Be $false
    }

    It "keeps safe-by-default semantics when project.json omits the field or sets safe-by-default explicitly (no regression)" {
        $tmpRoot = New-Item -ItemType Directory -Path "TestDrive:/round4project3" -Force
        @{} | ConvertTo-Json | Set-Content -LiteralPath "$tmpRoot/project.json" -Encoding UTF8
        $result = Get-Capabilities -ProjectRoot $tmpRoot.FullName
        $result.writeExecutionPolicy | Should -Be "safe-by-default"
        $result.effectiveDryRunDefault["import_modules"] | Should -Be $true
    }
}
```

**Test 2 — integration e2e con `.dysflow/project.json` real** (extender `test/integration/get-capabilities-policy.test.ts` o crear `round4-propagation.e2e.test.ts`):

```ts
describe('get_capabilities: writeExecutionPolicy propagates end-to-end', () => {
  it('reads capabilities.writeExecutionPolicy="developer" from .dysflow/project.json and reports it back', async () => {
    // Setup: temp project root con .dysflow/project.json que declare
    // { capabilities: { writeExecutionPolicy: "developer" } }.
    // Llamada: getCapabilities con ese projectRoot.
    // Assert: result.writeExecutionPolicy === "developer".
    // Assert: result.effectiveDryRunDefault['import_modules'] === false.
    // Assert: result.effectiveDryRunDefault['test_vba'] === false.
    // Assert: result.effectiveDryRunDefault['form_delete_control'] === false (routine-dev-write).
    // Assert: result.effectiveDryRunDefault['compact_repair'] === true (destructive-write, no toca).
    // Assert: result.effectiveDryRunDefault['test_vba'] en safe-by-default mode === true (no regresión).
  });

  it('falls back to safe-by-default silently when the field is missing (no error, just default)', async () => {
    // Setup: temp project root con .dysflow/project.json SIN el campo capabilities.
    // Assert: writeExecutionPolicy === "safe-by-default".
    // Assert: effectiveDryRunDefault[*] === true para write-class tools.
  });
}
```

**Test 3 — regression check sobre #785.** El test del issue #785 sigue pasando: `import_modules` con `dryRun:undefined` en modo `developer` debe commitear. La fix de este round-4 debe **NO romper** ese contrato ya cerrado.

Cada test debe valer RED por sí solo (no rojo-por-suerte).

## Disciplina

- TDD estricto: RED → GREEN → REFACTOR.
- Conventional commits con scope `runtime` o `dispatch`: `fix(runtime): propagate capabilities.writeExecutionPolicy to get_capabilities (round-4)`.
- Scope del fix: el resolver que arma `get_capabilities` lee `capabilities.writeExecutionPolicy` del config cargado y lo usa para calcular `writeExecutionPolicy` (string) + `effectiveDryRunDefault` (map por tool). NO tocar la lectura de `capabilities.procedures.allow`, `passwordEnv`, `accessPath`, `backendPath`, `destinationRoot`, `projectId` (todos funcionan OK según `projectConfig`).
- Compatibilidad con fix #785 (`connect risk-based write policy to real import/test execution path`): el caso "modo `developer` + `routine-dev-write` + `dryRun:undefined` → commitea" debe seguir funcionando (no regresión). El gap nuevo es que `get_capabilities` reporta el modo equivocado, no que la ejecución falle — pero los consumers que confían en el reporte se rompen.
- Compatibilidad con fix #783 (`wire v2.1.0 risk-based write policy through dispatch + export-source guard`): la policy export-source guard (`EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`) sigue aplicándose igual; este round no toca ese path.
- NO reintroducir `compile_vba` (regla cross-project HR-1).
- Si la fix requiere exponer un campo nuevo (ej. `sourceResolution`, `policyResolverVersion`) en `get_capabilities`: coordiná con el consumer `EXPEDIENTES` ANTES de publicar el changelog.

## Acceptance output

- PR con los 3 tests RED → GREEN.
- Changelog en `CHANGELOG.md` con bullet: `fix(runtime): propagate capabilities.writeExecutionPolicy to get_capabilities.writeExecutionPolicy and effectiveDryRunDefault (#<issue>)`.
- Version bump: **minor (`v2.21.0`)** — cambia un campo observable del contrato público de `get_capabilities` que consumers existentes pueden parsear distinto. NO patch: comportamiento documentado en `dysflow-usage` §"Write-execution-policy" deja de mentir.
- Si la fix toca `dysflow-usage` skill (consumer-side), sincronizar vía `assets/scripts/verify-examples-vs-runtime.ps1` (debe pasar exit 0).
- Cross-session safety: el consumer `EXPEDIENTES` ya archivó este prompt en su `docs/prompts/`. La fix va a permitir que el dev-loop sea zero-friction como la policy documenta, eliminando el workaround `dryRun:false` explícito manual.

## Quick start

```bash
git clone <repo path>
cd <repo>
git checkout -b fix/get-capabilities-propagate-write-execution-policy
pnpm install
```

Test RED (extender el archivo de tests del resolver; ubicación exacta a confirmar con `rg "writeExecutionPolicy|effectiveDryRunDefault" --type ts -l` en el repo):

```powershell
pnpm test -- round4-propagation
# Esperado: 1 RED en el caso nuevo. Tests existentes (incluido el de #785) siguen verdes.
```

Después del fix:

```powershell
pnpm test
# Esperado: 1+ nuevo GREEN; 0 regresiones en el resto de la suite.
pnpm build
```

Repro manual desde el consumer (`EXPEDIENTES`):

```js
// Setup: .dysflow/project.json con capabilities.writeExecutionPolicy="developer"
// (línea 9 del archivo, ya commiteado en este consumer).

await tools.dysflow.get_capabilities({});
// Esperado post-fix:
// result.adapterVersion: "2.21.0" (o +1 minor)
// result.writeExecutionPolicy: "developer"
// result.effectiveDryRunDefault["import_modules"]: false
// result.effectiveDryRunDefault["test_vba"]: false
// result.effectiveDryRunDefault["form_delete_control"]: false
// result.effectiveDryRunDefault["compact_repair"]: true (destructive, no cambia)
// result.projectConfig.status: "valid" (intacto)
// result.projectConfig.writeReady: true (intacto)
```

Sin fix, además puede verificarse el workaround del consumer:

```js
await tools.dysflow.test_vba({
  testsPath: "tests/tests.vba.get-where-busqueda.json",
  dryRun: false,  // workaround manual mientras la fix no está
});
// Pasa los 4 tests pero NO debería necesitarse si writeExecutionPolicy se respeta.
```

## Reinforcement

**Cross-project reminder:** El contrato documentado en `dysflow-usage` §"Write-execution-policy" dice textualmente:

> "When `.dysflow/project.json` is not configured, the runtime defaults to `"safe-by-default"` — every write call without an explicit `apply: true` plans. The `developer` mode is opt-in per-project (set `capabilities.writeExecutionPolicy: "developer"` in `.dysflow/project.json`)."

Y la tabla dice:

> `developer` mode + omitted `dryRun` → `false` (commit) for `routine-dev-write` tools.

El consumer `EXPEDIENTES` cumple el opt-in (`capabilities.writeExecutionPolicy: "developer"` declarado); el runtime incumple ambos lados del contrato. La fix tiene que cerrar el gap completo: leer config → propagar a `writeExecutionPolicy` → propagar a `effectiveDryRunDefault[*]` para los tools clasificados como `routine-dev-write`.

## Reference

- Round 1 archivado: `docs/prompts/prompt-ia-mantenedora-dysflow-round-1-2026-07-20.md` (`#1007`).
- Round 2 archivado: `docs/prompts/prompt-ia-mantenedora-dysflow-round-2-2026-07-20.md` (`#1013`).
- Round 3 archivado: `docs/prompts/prompt-ia-mantenedora-dysflow-round-3-2026-07-20.md` (`#1020`).
- Round 4 archivado: `docs/prompts/prompt-ia-mantenedora-dysflow-round-4-2026-07-21.md` (este).
- Fix relacionada: `#785` ("connect risk-based write policy to real import/test execution path") cerrada en commit referenciado en CHANGELOG.
- Línea del config que declara `developer`: `C:\00repos\codigo\00_EXPEDIENTES\.dysflow\project.json` líneas 8-10.
- Adapter verificado: `dysflow 2.20.0` (toolsVisible: 89, adapterVersion: "2.20.0").
- Manifest de tests usado en este consumer para verificar el workaround: `C:\00repos\codigo\00_EXPEDIENTES\tests\tests.vba.get-where-busqueda.json`.
- Skill consumer-side a sincronizar si hay cambio de contrato: `C:\Users\adm1\.agents\skills\dysflow-usage\SKILL.md` §"Write-execution-policy" (no tocar a menos que el contrato cambie).
