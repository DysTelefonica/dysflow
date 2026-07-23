# Round 14 — Dysflow v2.20.0: dysflow MCP anclado al CWD del proceso opencode, no permite apuntar a otro worktree sin relanzar

## Contexto del round

Round 14 contra `DysTelefonica/dysflow`. Una sola brecha operacional: cuando un consumer opera múltiples worktrees del mismo proyecto (en el caso de este consumer, `C:/00repos/codigo/00_EXPEDIENTES` main + `C:/00repos/codigo/00_EXPEDIENTES_staging` staging), el MCP dysflow cachea el `.dysflow/project.json` del CWD del proceso opencode al startup y rechaza cualquier `accessPath` que caiga fuera del `projectRoot` cacheado, aunque el worktree destino tenga su propio `.dysflow/project.json` con `id`/`projectRoot`/`accessPath`/`destinationRoot`/`backendPath` únicos (cumple Hard Rule #10 de `vba-binary-sync`). Repro en este consumer el 2026-07-23, durante la validación de issue Expedientes #71 (PR #72 mergeado a staging).

Rounds previos del consumer `EXPEDIENTES` (todos archivados en `docs/prompts/`):

- Round 1 → issue `#1007` (cerrado en v2.19.0): `Attribute VB_VarHelpID` strippeado en `.cls` con `WithEvents`.
- Round 2 → issue `#1013` (cerrado): `test_vba` runner usa helper distinto al del bin en el sandbox.
- Round 3 → issue `#1020` (cerrado): `Ensure-VbNameAttributeAtTop` no preservaba el prefijo `Form_` en `Attribute VB_Name`.
- Round 4 → issue `#1037` (cerrado): `capabilities.writeExecutionPolicy` declarado no se propagaba al runtime en v2.20.0.
- Round 5 → issue `#1040` (abierto): `import_modules` Auto sobre form completo renombra `Form_<base>` a `TempSccObj1`, `status:ok`, sin rollback.
- Round 6 → (archivado, número consumido por el consumer): cuatro brechas de coherencia en el contrato `test_vba` ↔ `get_capabilities.tools[*]` ↔ taxonomía de error codes ↔ `validate_manifest`.
- Round 11 → issue `#1044` (abierto): `run_vba` rechaza aliases Windows equivalentes.
- Round 13 → issue `#1045` (abierto): `run_vba` aplana procedure faltante y corrompe diagnóstico.

Este round NO reabre ninguno de los anteriores. Cubre exclusivamente la fricción operacional multi-worktree.

## Lo que YA funciona (NO tocar)

- Resolución del project config desde el CWD: `get_capabilities.projectConfig` resuelve correctamente cuando el proceso corre desde el directorio del worktree target.
- Override `dryRun:false` explícito commitea (workaround del round 4 sigue funcionando).
- `validate_manifest` reporta JSON-shape válido y `count` correcto de átomos.
- Allowlist gate, TDD, capabilities flags, lint gate, codegraph reindex post-sync.
- TDD: `Test_ResponsableFiltroHelper` (18 átomos) y `Test_ResponsablePorRolHelper` (8 átomos) son la disciplina que el maintainer DEBE respetar en sus tests del fix.
- HR-1 (humano compila), HR-2 (no `Stop-Process MSACCESS` genérico), HR-3 (no escribir backend de prod), HR-6 (tests en `tests/*.json`, no en allowlist). Sin cambios.
- Pattern cross-project "human compiles" (HR-1): NO reintroducir `compile_vba` ni `compile:true` en `import_modules` como workaround para sortear el guard de project-root.
- Comportamiento intencional que NO se debe cambiar: el guard de project-root en sí mismo (la seguridad contra escribir en un binario equivocado es valiosa). Este round pide AMPLIAR la superficie de configuración, no eliminar la protección.

## Lo que falta en este round

### Feature 1: dysflow MCP debe poder operar contra un worktree que NO es el del CWD del proceso

#### Síntoma verificado

Cuando el proceso opencode corre desde `C:/00repos/codigo/00_EXPEDIENTES` (main), el MCP cachea el `.dysflow/project.json` de ese worktree. Cualquier intento de escribir al staging binary `C:/00repos/codigo/00_EXPEDIENTES_staging/Expedientes.accdb` — aunque el worktree destino tenga su propio `.dysflow/project.json` con `id="expedientes-staging"`, `projectRoot`, `accessPath`, `destinationRoot`, `backendPath` todos únicos y absolutos — retorna `OUTSIDE_PROJECT_ROOT`. El consumer tiene que cerrar el proceso opencode, abrir otro shell con `cd C:/00repos/codigo/00_EXPEDIENTES_staging`, y relanzar opencode desde ahí. Eso destruye el contexto de la sesión activa y rompe el flujo de trabajo continuo cuando el consumer alterna entre worktrees.

#### Evidencia de repro

Repro literal del 2026-07-23, proyecto `EXPEDIENTES`, worktree staging con `.dysflow/project.json` corregido a Hard Rule #10:

```text
# Estado del staging config (Hard Rule #10 compliant):
$ cat C:/00repos/codigo/00_EXPEDIENTES_staging/.dysflow/project.json | head -8
{
  "id": "expedientes-staging",
  "projectRoot": "C:/00repos/codigo/00_EXPEDIENTES_staging",
  "accessPath": "C:/00repos/codigo/00_EXPEDIENTES_staging/Expedientes.accdb",
  "backendPath": "C:/00repos/datos/Expedientes_datos.accdb",
  "destinationRoot": "C:/00repos/codigo/00_EXPEDIENTES_staging/src",
  "timeoutMs": 60000,
  ...

# MCP corre desde main (CWD del proceso opencode = C:/00repos/codigo/00_EXPEDIENTES):
$ dysflow get_capabilities
{
  "projectConfig": {
    "id": "expedientes",
    "projectRoot": "C:/00repos/codigo/00_EXPEDIENTES",
    "accessPath": "C:/00repos/codigo/00_EXPEDIENTES/Expedientes.accdb",
    ...
  },
  "toolsVisible": 89
}

# Intento de escribir al staging binary con accessPath override:
$ dysflow import_modules \
    --moduleNames Form_FormExpedientesGestion \
    --accessPath "C:/00repos/codigo/00_EXPEDIENTES_staging/Expedientes.accdb" \
    --apply true
{
  "result": { "module": "Form_FormExpedientesGestion", "status": "error", ... },
  "operation": "import_modules",
  "error": {
    "code": "OUTSIDE_PROJECT_ROOT",
    "message": "Requested target 'C:/00repos/codigo/00_EXPEDIENTES_staging/Expedientes.accdb' is outside this worktree.",
    "legacyCode": "PROJECT_CONFIG_NOT_WRITE_READY"
  }
}

# Expected: el MCP debería poder operar contra el staging binary
# (cuyo .dysflow/project.json tiene id/projectRoot/accessPath únicos).
# Actual: el MCP rechaza con OUTSIDE_PROJECT_ROOT y exige relanzar el proceso.
```

Repro secundario — el override de accessPath por llamada NO bypasea el guard aunque venga con un projectRoot válido:

```text
# El guard compara accessPath contra projectRoot cacheado (main),
# no contra el projectRoot del .dysflow/project.json que matchearía
# el accessPath destino. No hay forma de indicarle al MCP "usá el
# config cuyo projectRoot contiene este accessPath".
```

#### Diagnóstico preliminar

Posibles root causes (preliminar, no verificado):

1. El MCP carga `.dysflow/project.json` una sola vez al startup y lo cachea en memoria. No hay mecanismo de recarga por llamada ni de selección entre múltiples configs descubiertos.
2. El guard de project-root hace `startsWith(accessPath, projectRoot)` (o equivalente) sobre el `projectRoot` cacheado. No consulta si el `accessPath` pertenece a OTRO `.dysflow/project.json` en otro directorio.
3. La superficie de herramientas (`import_modules`, `export_modules`, `verify_code`, `validate_manifest`, `test_vba`, etc.) no acepta un parámetro `projectId` o `projectRoot` que permita seleccionar un config distinto al cacheado por CWD.

El diseño actual obliga al consumer a una de tres opciones, todas malas:

- (a) Relanzar el proceso desde el worktree target cada vez que se cambia de worktree. Pierde contexto de sesión.
- (b) Operar solo desde un worktree (generalmente main). Viola políticas de delivery tipo "staging-only" en el fleet Expedientes.
- (c) Editar manualmente el `.dysflow/project.json` del worktree donde corre el proceso para apuntar al otro. Corrompe configs, race conditions entre consumers paralelos, riesgo de escribir en el binario equivocado.

#### Comportamiento esperado (spec mínima)

El maintainer elija una (o combinación) de estas opciones. Las tres son aceptables; el maintainer decide según la complejidad de implementación:

**Opción A — Parámetro `projectId` por llamada**: cada tool del MCP acepta un parámetro opcional `projectId` que, si está presente, selecciona el config correspondiente al `.dysflow/project.json` con ese `id` (descubierto en el cwd o en worktrees siblings). El MCP debe poder descubrir configs en runtime sin recargar el proceso.

**Opción B — Descubrimiento automático por `accessPath`**: el guard de project-root, antes de rechazar, busca si el `accessPath` pertenece a algún `.dysflow/project.json` descubrible en el filesystem (cwd + worktrees siblings del mismo repo). Si lo encuentra, usa ese config para la operación. Si no, mantiene el rechazo.

**Opción C — Contexto múltiple activo**: el MCP mantiene un mapa de configs descubiertos al startup (uno por cada `.dysflow/project.json` accesible desde el cwd). Cada tool acepta `projectId` para elegir; default = el del CWD (comportamiento actual).

Cualquiera de las tres debe:
- Mantener la protección: si el `accessPath` no pertenece a NINGÚN `.dysflow/project.json` conocido, sigue rechazando.
- No requerir relanzar el proceso.
- Reportar en `get_capabilities` la lista de configs descubiertos y cuál está activo.

#### Riesgo

Cualquier consumer del fleet DysTelefonica que trabaje con múltiples worktrees del mismo proyecto está obligado a relanzar el proceso entre operaciones, perdiendo contexto de sesión y rompiendo flujos continuos. En el caso concreto de Expedientes, esto bloqueó la validación del issue #71 el 2026-07-23 — el fix de REFAC-1a quedó aplicado en el source pero no se pudo re-importar al staging binary porque el MCP estaba anclado al main. Workaround aplicado: el usuario cerró la sesión y reabrirá opencode desde el staging worktree, perdiendo ~30 min de contexto.

Otros consumers afectados (los que mantienen rama `develop` + `staging` + hotfix paralelo, o feature branches múltiples): mismo bloqueo. Estimación conservadora: 5-10 consumers del fleet.

#### Tests RED sugeridos

```ts
it('import_modules con accessPath explícito a staging binary (projectRoot distinto al CWD) acepta cuando el config destino tiene id único', async () => {
  // 1. Set up: dos worktrees con .dysflow/project.json únicos
  //    - main/.dysflow/project.json: id=expedientes, projectRoot=main/
  //    - staging/.dysflow/project.json: id=expedientes-staging, projectRoot=staging/
  // 2. MCP corre con CWD=main (carga config main)
  // 3. Call: import_modules({moduleNames: [...], accessPath: "staging/.accdb", apply: true})
  // 4. Assert: status:ok, escribe al staging binary
  // Actualmente falla con: OUTSIDE_PROJECT_ROOT
});

it('get_capabilities reporta lista de project configs descubiertos y cuál está activo', async () => {
  // 1. Set up: dos worktrees con .dysflow/project.json únicos
  // 2. MCP corre con CWD=main
  // 3. Call: get_capabilities()
  // 4. Assert: projectConfig.discovered[] contiene [expedientes, expedientes-staging]
  //    y projectConfig.active = "expedientes"
  // Actualmente falla con: projectConfig solo contiene el del CWD
});

it('import_modules con projectId explícito selecciona el config correspondiente', async () => {
  // 1. Set up: dos worktrees
  // 2. MCP corre con CWD=main
  // 3. Call: import_modules({moduleNames: [...], projectId: "expedientes-staging", apply: true})
  // 4. Assert: status:ok, escribe al staging binary, el response.resolvedProjectId == "expedientes-staging"
  // Actualmente falla con: projectId no es parámetro reconocido o se ignora
});

it('guard de project-root sigue activo cuando el accessPath no pertenece a ningún config conocido', async () => {
  // 1. MCP corre con CWD=main
  // 2. Call: import_modules({accessPath: "C:/otro/path/random.accdb", apply: true})
  // 3. Assert: error code OUTSIDE_PROJECT_ROOT preservado (no se introduce regresión)
  //    en la protección contra escribir en un binario no registrado
});

it('relaunching del MCP no es necesario para alternar entre worktrees del mismo proyecto', async () => {
  // 1. MCP corre con CWD=main
  // 2. import_modules al staging binary (con el fix aplicado): status:ok
  // 3. import_modules de vuelta al main binary: status:ok
  // 4. Sin relaunching del proceso entremedio
  // Assert: ambas operaciones succeed sin restart del MCP server
});
```

## Disciplina

- TDD estricto (RED → GREEN → REFACTOR). Los 5 tests RED sugeridos arriba son el contrato.
- Conventional commits con scope apropiado (`mcp-context` o `mcp-config-discovery`).
- NO tocar las tools `get_*` ni las capabilities flags en sí mismas (citá "Lo que YA funciona" si dudás).
- NO reintroducir `compile_vba` ni `compile:true` como workaround.
- NO debilitar el guard de project-root en sí: la spec pide AMPLIAR la selección de configs, no eliminar la protección. El test RED #4 cubre que la protección sigue activa para accessPaths no registrados.
- Si el fix requiere tocar el discovery de `.dysflow/project.json`, agregar tests para: (a) worktrees hermanos del mismo repo (`git worktree list`), (b) paths absolutos en `projectRoot`, (c) paths relativos con resolución contra cwd, (d) `id` duplicado entre worktrees (debe seguir siendo error de config, no fallback silencioso).
- Si el fix requiere que el MCP consulte el filesystem en cada llamada (para descubrir configs), considerar caché con TTL para no degradar performance.

## Acceptance output

- PR con 5+ tests verdes (los tests RED sugeridos arriba).
- Changelog en `docs/changelog.md` con bullet: `feat(mcp-context): dysflow MCP supports multi-worktree via projectId or automatic accessPath-based config selection (#<issue>)`.
- Version bump: minor (`v2.21.0`) si la superficie de tools acepta un parámetro nuevo (`projectId`). Patch (`v2.20.1`) si solo agrega auto-discovery sin cambiar signatures.
- Documentación: actualizar `docs/mcp.md` con la nueva sección "Multi-worktree operations" mostrando un ejemplo end-to-end con dos worktrees hermanos.
- Hard rule: el fix NO debe romper el comportamiento actual del single-worktree consumer (regression test sobre CWD=projectRoot debe seguir funcionando idéntico).
- Hard rule: si el fix introduce un nuevo error code (ej. `PROJECT_NOT_FOUND` cuando se pide un projectId que no existe), debe agregarse a la taxonomía documentada y al `get_capabilities.errorCodes[]`.

## Quick start

```bash
git clone https://github.com/DysTelefonica/dysflow
cd dysflow
git checkout -b feat/mcp-multi-worktree-context
pnpm install
pnpm run dev
```

Test repro contra el dev (asumiendo que el repo tiene fixtures o el consumer `EXPEDIENTES` como worktree):

```bash
# Set up minimal: crear dos directorios con .dysflow/project.json distintos
mkdir -p /tmp/wt-main/.dysflow /tmp/wt-staging/.dysflow
cat > /tmp/wt-main/.dysflow/project.json <<EOF
{ "id": "test-main", "projectRoot": "/tmp/wt-main",
  "accessPath": "/tmp/wt-main/app.accdb", "destinationRoot": "/tmp/wt-main/src" }
EOF
cat > /tmp/wt-staging/.dysflow/project.json <<EOF
{ "id": "test-staging", "projectRoot": "/tmp/wt-staging",
  "accessPath": "/tmp/wt-staging/app.accdb", "destinationRoot": "/tmp/wt-staging/src" }
EOF

# Lanzar MCP con CWD=/tmp/wt-main
cd /tmp/wt-main
dysflow mcp &

# Repro del gap
dysflow import_modules \
  --moduleNames SomeModule \
  --accessPath "/tmp/wt-staging/app.accdb" \
  --apply true
# Esperado (post-fix): status:ok, escribe al staging binary
# Actual (pre-fix): OUTSIDE_PROJECT_ROOT
```

## Reinforcement

El fix debe mantener el patrón cross-project "human compiles" (HR-1): cualquier cambio de comportamiento en import/export debe continuar requiriendo que el humano compile manualmente en Access. NO reintroducir `compile_vba` ni `compile:true` como workaround. Si el fix es "relanzar opencode es tan ruidoso que mejor auto-compilamos", escalar a siguiente round con justificación detallada.

El fix debe mantener la protección contra escribir en binarios no registrados (Hard Rule de `vba-binary-sync` §10). El comportamiento actual de OUTSIDE_PROJECT_ROOT es valioso; este round pide AMPLIAR la selección, no relajar la protección. Si el fix la debilita, escalar.