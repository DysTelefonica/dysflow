# Batería E2E MCP contra Access real

> Documento de referencia para la **batería automatizada** `E2E_testing/mcp-e2e.mjs`.
> Si necesitas la **checklist manual** de regresión tras reinstalar Dysflow en un puesto,
> consulta [`mcp-access-e2e.md`](./mcp-access-e2e.md). Son documentos distintos: este
> automatiza, el otro es una guía paso a paso para humanos.

## Resumen rápido

La batería E2E es el **gate de release**: lanza el servidor MCP real (`dysflow mcp`) contra
un `.accdb` real y ejecuta cada herramienta visible. Coste: 5–15 minutos en una máquina
Windows con Access. **Una sola fila FAIL aborta la batería** — la regla STOP-ON-FAIL existe
para que una herramienta rota no acumule procesos `MSACCESS.EXE` huérfanos.

| Capa | Comando | Coste | Cuándo |
|---|---|---|---|
| Unit (Vitest) | `pnpm test` | segundos | en cada cambio |
| Integración (Vitest + Access) | `pnpm test:integration` | segundos–minuto | en cada PR o rama |
| **E2E MCP (Node + Access real)** | `pnpm test:e2e:mcp` | **5–15 min** | **solo en release** |
| Pester (PowerShell runner) | `pnpm test:ps1` | segundos | cuando cambias scripts `*.ps1` |

El E2E **no se ejecuta en CI por defecto** porque necesita Microsoft Access instalado, lo
cual solo está disponible en la máquina de desarrollo. La cobertura barata del E2E vive en
los **cheap-gates** de `test/quality-gates/mcp-e2e-*.test.ts` (ver [§ Relación con la suite unit (cheap gates)](#relación-con-la-suite-unit-cheap-gates)).

## Qué prueba y dónde vive

El script canónico es `E2E_testing/mcp-e2e.mjs`. Es el **único** harness que corre la
batería completa. Hace **una** cosa: arrancar `dysflow mcp` vía stdio JSON-RPC y ejecutar
cada herramienta visible contra el fixture real, midiendo zombie-check por herramienta y
un control final de procesos vivos.

```
E2E_testing/
├── mcp-e2e.mjs                         # Harness canónico (lo único que corre la batería)
├── NoConformidades.accdb               # Frontend fixture (copia → sandbox antes de writes)
├── NoConformidades_Datos.accdb         # Backend fixture (copia → sandbox)
├── src/                                # Árbol fuente VBA fixture (copy → sandbox)
├── _helpers/
│   ├── mcp-e2e-record.mjs              # Driver `record()` con REFUSE-START + STOP-ON-FAIL
│   ├── mcp-harness.mjs                 # Cliente JSON-RPC por llamada (timeout + close watchdog)
│   ├── mcp-e2e-sandbox.mjs             # Plan de sandbox (%TEMP%\dysflow-mcp-e2e-{pid}-{ts}\)
│   └── resolve-mcp-e2e-command.mjs     # Qué `dysflow.cmd` puede spawnear (ver § Runtime)
└── forms/, tests/                      # Assets auxiliares (form specs, manifests)
```

**Áreas cubiertas** (etiquetas en la columna `area` del informe):

- `protocol` — `tools/list`, `advertised-tool-count`, `:zombie-check` por herramienta
- `diagnostics` — `dysflow_doctor`
- `query` — `query_sql`, `list_tables`, `get_schema`, `count_rows`, `get_relationships`, etc.
- `security` — guardia de solo-lectura contra `DROP`/`DELETE`
- `vba` — `dysflow_vba_execute` con allowlist
- `vba-introspection` — `dysflow_list_procedures` + `dysflow_get_procedure` (#701):
  - inline `source` happy path para los dos tools
  - inline `source` con `procedure` inexistente (camino de error tipado)
  - `destinationRoot` externo rechazado por source-root containment
  - resolución desde disco contra el árbol fuente del sandbox (happy path)
- `vba-manifest` — `dysflow_validate_manifest` (#703): validación previa del manifest de tests VBA sin ejecutar `test_vba`
- `operations` — `dysflow_access_operations_list` / `cleanup` / `force_cleanup_orphaned`
- `capabilities` — `dysflow_get_capabilities` snapshot + cross-check vs `advertised.length`
- `maintenance` — `compact_repair` (dry-run + apply con password real)
- `links` — `link_tables`, `relink_tables`, `localize_backend_links`, `unlink_table`, `relink_directory`
- `write` — `create_table`, `exec_sql`, `run_script`, `seed_fixture`, `teardown_fixture`, `drop_table`
- `vba-sync` — `export_modules`, `export_all` (incl. `--prune`), `import_modules`, `import_all`,
  `verify_code`, `delete_module`, `fix_encoding`, `generate_erd`
  (feat-759-no-compile v1.19.0: `compile_vba` was removed)
- `forms` — `validate_form_spec`, `generate_form`, `catalog_add_control`, `harvest_form_catalog`
- `legacy` — `run_vba`, `cleanup_access_operation`, `list_access_operations` (alias pre-1.4)
- `zombies` — `lingering-access-check` (la fila final; ver [§ Zombie check](#zombie-check))

**Baseline actual (v1.14.0):** 91 passed / 0 failed. Cualquier valor por debajo es una
regresión o un drift entre el harness y el contrato — investiga antes de fusionar.
Con la batería de `vba-introspection` (issue #701), el baseline sube a **96 passed
/ 0 failed** — los 5 rows nuevos cubren inline source (3), source-root containment
(1) y resolución desde disco contra el módulo del fixture (1).

## Dependencias

Necesitas lo siguiente antes de poder ejecutar la batería:

| Dependencia | Por qué |
|---|---|
| **Windows + Microsoft Access** | El runner PowerShell abre `Access.Application` por COM; no hay ruta headless sin Access. |
| **Node 20+** | El harness usa `node:child_process`, `node:fs/promises` y JSON-RPC sobre stdio. |
| **pnpm 10+** | El binario `dysflow.cmd` que arranca el harness sale de `pnpm build`. |
| **`ACCESS_VBA_PASSWORD`** en entorno de usuario | Password del fixture `NoConformidades.accdb`. El harness **rechaza arrancar sin él**. Acepta también `DYSFLOW_ACCESS_PASSWORD` / `DYSFLOW_BACKEND_PASSWORD`. |
| **Runtime de prueba en `test-runtime/bin/`** | El harness **no puede** usar el runtime de producción en `%LOCALAPPDATA%\dysflow` salvo override explícito (`DYSFLOW_E2E_COMMAND`). Ver [§ Runtime resuelto](#runtime-resuelto). |
| **Fixtures en `E2E_testing/`** | El harness aborta con `Missing E2E fixture` si falta cualquiera de los tres assets (`NoConformidades.accdb`, `NoConformidades_Datos.accdb`, `src/`). |

> Importante: nunca construyas ni instales sobre el runtime de producción
> (`%LOCALAPPDATA%\dysflow` o `~/.config/opencode/opencode.json`) durante el desarrollo.
> El harness se niega a usarlo sin un override explícito, precisamente para evitar esa
> mezcla. Usa `test-runtime/` como destino.

## Cómo ejecutar la batería completa

### Paso a paso

```powershell
# Desde la raíz del repositorio.
$env:ACCESS_VBA_PASSWORD = "<password del fixture>"

# 1. Pull + build.
git pull --ff-only origin main
pnpm build

# 2. Sincroniza el build al runtime de prueba (NO %LOCALAPPDATA%\dysflow).
#    El wrapper .cmd expande %SCRIPT_DIR% a la carpeta del script (bin\),
#    de modo que ejecuta bin\dist\cli\index.js. Si sincronizas a otro path,
#    el harness spawnea un binario viejo.
Remove-Item .\test-runtime\bin\dist -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item .\dist .\test-runtime\bin\dist -Recurse -Force

# 3. Ejecuta.
pnpm test:e2e:mcp    # equivalente a: node E2E_testing/mcp-e2e.mjs
```

### Salida esperada

Por cada herramienta el harness imprime una línea tabular:

```text
PASS   dysflow_query_execute            142ms   {"RowCount":1534}
PASS   query_sql                        128ms   {"RowCount":1534}
PASS   compact_repair                   2415ms  {"dryRun":true,...}
# feat-759-no-compile (v1.19.0) — the legacy "FAIL compile_vba"
# entry above was removed; compile_vba is no longer a tool. The
# fixture still has mojibake in some modules, but the compile
# step is now manual (Debug > Compile in Access), so the suite
# no longer asserts a structured compile failure.
```

Tras la batería, el informe Markdown aterriza en
`%TEMP%\dysflow-mcp-e2e-{pid}-{ts}\mcp-e2e-report.md` con una tabla completa de filas,
el resumen y la lista de herramientas advertised.

### Sandbox y cleanup

El harness crea un sandbox fresco en `%TEMP%\dysflow-mcp-e2e-{pid}-{ts}\` y copia los
fixtures allí. **Todo write destructivo ocurre sobre la copia**, nunca sobre los assets
del repositorio.

| Estado de la batería | Sandbox |
|---|---|
| Éxito (sin FAIL, sin abortar) | Borrado automáticamente al final. |
| Cualquier fila FAIL o STOP-ON-FAIL | **Preservado** y se imprime la ruta. |
| Siempre quieres conservarlo | `DYSFLOW_E2E_PRESERVE_SANDBOX=1`. |

### Knobs de runtime

```powershell
# Usar un runtime distinto al test-runtime local.
$env:DYSFLOW_E2E_COMMAND = "C:\ruta\a\otro\dysflow.cmd"

# Timeout por herramienta (default 30000 ms = 30 s).
$env:DYSFLOW_E2E_TIMEOUT_MS = "30000"

# Conservar sandbox siempre (incluso en éxito).
$env:DYSFLOW_E2E_PRESERVE_SANDBOX = "1"

# Raíz determinista para el sandbox (el harness crea un hijo bajo ella).
$env:DYSFLOW_E2E_SANDBOX_ROOT = "D:\diagnostics"

# Fijar el conteo global de MSACCESS.EXE al inicio (en CI o cuando ya hay Access ajenos).
$env:DYSFLOW_E2E_PRE_MSACCESS_COUNT = "0"
```

Si el harness aborta antes de la primera herramienta, el mensaje nombra el código de
resolución: `MCP_E2E_REFUSES_PRODUCTION_RUNTIME`, `MCP_E2E_NO_RUNTIME_AVAILABLE` o
`MCP_E2E_OVERRIDE_NOT_FOUND`. Cada uno indica qué variable de entorno o build falta.

## Cómo ejecutar un subconjunto

> La batería completa es el release gate. Durante trabajo de feature o bug **no pagues
> los 5–15 minutos del E2E entero**. Usa las capas más baratas; reserva el E2E para los
> caminos que las demás no cubren.

### Estrategia por capas

1. **Unit (`pnpm test`).** Filtra por nombre de test. Cubre lógica de dominio pura, parsers,
   contratos. Coste: segundos. Es el primer gate.

   ```bash
   pnpm test -- -t "export_all"
   pnpm test -- -t "mcp-e2e record"
   ```

2. **Integración (`pnpm test:integration`).** Levanta Access contra fixtures. Cubre
   adapters I/O con seams reales. Coste: segundos a un minuto. Es la capa intermedia.

   ```bash
   pnpm test:integration -- -t "compact_repair"
   ```

3. **E2E manual dirigido.** Si ninguna capa cubre el cambio, ejecuta **una** herramienta
   del E2E de forma aislada. El patrón es: poner un `DYSFLOW_E2E_COMMAND` que apunte a tu
   build fresco, lanzar el harness y leer solo la fila que te interesa del informe.

   ```powershell
   $env:DYSFLOW_E2E_COMMAND = "C:\Proyectos\dysflow\test-runtime\bin\dysflow.cmd"
   $env:DYSFLOW_HOME = "C:\Proyectos\dysflow\test-runtime"
   pnpm test:e2e:mcp    # luego abre el informe y mira solo las filas que tocan tu cambio
   ```

   Para ejecutar **una sola herramienta** (por ejemplo `form_add_control`), edita
   temporalmente `E2E_testing/mcp-e2e.mjs`, comenta todas las filas de `runBattery()` excepto
   la que necesitas, y re-ejecuta. **No comitees esa edición.**

4. **Full E2E.** Solo al cortar release (`scripts/release-prepare.ps1`). Si quieres ver
   todas las áreas de un vistazo, ejecuta la batería entera y lee el informe Markdown.

### Cómo añadir cobertura para una herramienta nueva

Cuando añadas o modifiques una herramienta MCP, actualiza el harness **en el mismo PR**
(regla de mantenimiento, no opcional):

```javascript
// Happy path.
await record("capabilities", "dysflow_new_tool", { projectId, ...args });

// Camino de fallo, si es una cara visible al usuario.
await record("capabilities", "dysflow_new_tool", { projectId, ...badArgs }, { expected: "error" });
```

Si la herramienta es visible (no la ocultas con `buildHiddenToolRegistry`), también debes
actualizar el pin de **61 herramientas** (ver [§ Pin de herramientas advertised](#pin-de-herramientas-advertised)).

## Contrato STOP-ON-FAIL

La batería implementa tres invariantes duras que viven en
`E2E_testing/_helpers/mcp-e2e-record.mjs`:

1. **REFUSE-START** antes de cada herramienta — si hay un `MSACCESS.EXE` del suite todavía
   vivo al inicio de la siguiente herramienta, abortar con `process.exitCode = 1` y un
   error `mcp-e2e: REFUSE-START before <tool>`. Esto evita empezar herramientas sobre un
   estado ya corrupto.
2. **Zombie-check por herramienta** — tras cada `record()`, se añade automáticamente una
   fila `${tool}:zombie-check` cuyo `pass` refleja `isOwnPidAlive(result.childPid)`. Si
   el hijo queda vivo, esa fila es FAIL y dispara STOP-ON-FAIL.
3. **STOP-ON-FAIL** — si la fila de la herramienta es FAIL **o** el zombie-check es FAIL,
   la batería lanza `mcp-e2e: STOP-ON-FAIL after <tool>`, fija `process.exitCode = 1` y
   aborta. **No continúa con la siguiente herramienta.** Esto es por regla del usuario:
   continuar solo acumularía más huérfanos.

> **Por qué abortar, no parchear.** Una herramienta rota que deja un zombie vivo significa
> que el control de PID del suite está comprometido. Seguir invocando herramientas solo
> multiplica los procesos huérfanos. La solución es arreglar la herramienta que dejó el
> zombie, no relajar el harness.

### ¿Qué significa "suite-owned MSACCESS.EXE"?

El harness mantiene un `Set<number>` con los `childPid` que él mismo ha spawneado a través
de `callMcp`. Las comprobaciones de zombies **solo** consultan esos PIDs y sus descendientes
(no un escaneo global de `Get-Process -Name MSACCESS`). Esto es deliberado:

- Otros consumidores de Dysflow (`gestion_riesgos`, `condor`, scripts personales) que
  abran Access legítimamente en la misma máquina están **fuera de alcance**.
- Si el harness spawnea PowerShell y ese PowerShell lanza un `MSACCESS.EXE`, ese nieto
  se detecta vía `walkDescendantsPids` (helper exportado por `_helpers/mcp-e2e-record.mjs`),
  que usa `wmic process get ProcessId,ParentProcessId` para un BFS padre→hijos. Si
  `wmic` no está disponible, el walker degrada a "solo el padre" en lugar de fallar.

### Zombie-check

- **Preflight** (antes de cada herramienta): `waitForNoOwnPids(500, 100)` — 4 polls de 100 ms.
- **Post-tool** (después de cada herramienta): `waitForNoOwnPids(1000, 100)` y una fila
  `${tool}:zombie-check` cuyo `pass` es `!isOwnPidAlive(result.childPid)`.
- **Final** (al terminar la batería): un retardo prudente de 1 s y `waitForNoOwnPids(2000, 100)`
  + un delta global de `MSACCESS.EXE` (start vs end). Si el delta es > 0, **alguien
  spawneó un `MSACCESS.EXE` fuera del watchlist** — esto se reporta como FAIL incluso si
  los zombie-checks por herramienta pasaron.

> Nunca ejecutes `Stop-Process -Name MSACCESS -Force` para "limpiar" antes del E2E. Si
> hay un `MSACCESS.EXE` que pertenece al suite, déjalo terminar por sí solo o usa
> `dysflow_access_force_cleanup_orphaned` con el PID explícito. La regla está vigente
> en `dysflow-msaccess-cleanup-only` (ver bloque en el AGENTS raíz).

## Relación con la suite unit (cheap gates)

La suite `test/quality-gates/mcp-e2e-*.test.ts` **no reemplaza** el E2E real: lo **adelanta**.
Cada uno de esos tests cuesta <100 ms y atrapa una clase entera de regresión que el E2E
pesado descubriría 5–15 minutos después.

| Test | Lo que pina | Coste |
|---|---|---|
| `mcp-e2e-stop-on-fail.test.ts` | Driver `record()`: H3a/b/c (expected error/success vs isError), H7a/b/c (zombie-check, REFUSE-START, PID eviction). Inyecta fakes al helper real, **no re-implementa la regla**. | <100 ms |
| `mcp-e2e-suite-contracts.test.ts` | Contratos estructurales del harness: timeout ≥ 180 000 ms en `verify_code`, secuencia `tools/list → advertised-tool-count`, sandbox aislado, fila final `lingering-access-check`. | <100 ms |
| `mcp-e2e-tool-existence.test.ts` | Cada `record(..., "<tool>", ...)` en el harness apunta a una herramienta que existe en `createDysflowMcpTools`. | <100 ms |
| `mcp-e2e-subprocess-preflight.test.ts` | REFUSE-START con subprocess real (no fakes): un spawn externo deja un nieto, la siguiente herramienta aborta. | <1 s |
| `mcp-e2e-grandchild-zombie.test.ts` | H5 descendant walk: el walker detecta nietos vía `wmic` cuando el padre ya cerró. | <1 s |
| `mcp-e2e-final-lingering-check.test.ts` | H6 retardo prudente de 1 s antes del primer poll (issue #574). | <2 s |
| `mcp-e2e-global-zombie-pin.test.ts` | Delta global de `MSACCESS.EXE` start vs end; atrapa fugas fuera del watchlist. | <2 s |
| feat-759-no-compile (v1.19.0) — `mcp-e2e-compile-vba-mojibake-pin.test.ts` was deleted. The mojibake pin is no longer relevant: compile_vba is gone, so the harness no longer asserts a structured compile failure against the fixture. | — |
| `resolve-mcp-e2e-command.test.ts` + `-esm` | `resolveMcpE2eCommand`: prioridad `DYSFLOW_E2E_COMMAND → test-runtime → production (rechazado) → none`. Inyecta `fs` fake; el `-esm` valida el comportamiento con ESM subprocess real. | <1 s |

Si tocas `E2E_testing/mcp-e2e.mjs` o `_helpers/mcp-e2e-record.mjs`, espera a que estos
tests sigan verdes antes de fusionar. Si añades una herramienta visible, recuerda añadir
el `record(...)` correspondiente.

### Cuándo correr qué

| Trabajo | Comando mínimo | Notas |
|---|---|---|
| Cambiar parser puro, helper de dominio | `pnpm test` | El unit ya cubre. |
| Cambiar un adapter I/O (filesystem, COM) | `pnpm test` + `pnpm test:integration` | Cubre los seams. |
| Cambiar lógica del runner PowerShell | `pnpm test` + `pnpm test:ps1` | Pester valida el contrato. |
| Añadir una herramienta MCP visible | `pnpm test` + `pnpm test:e2e:mcp` (release) | Actualiza el pin de herramientas advertised. |
| Cambiar un parámetro de `mcp-e2e.mjs` | `pnpm test -- test/quality-gates/mcp-e2e` + `pnpm test:e2e:mcp` | Cheap-gates primero. |
| Cortar release | Todo lo anterior + `pnpm test:e2e:mcp` | El E2E es el gate final. |

## Contrato MCP: pins vivos

La batería y los unit tests pinan tres contratos del MCP que, si cambian, indican drift
entre el código y el servidor.

### Pin de versión de protocolo (90 días)

`MCP_PROTOCOL_VERSION_REVIEW` en `src/adapters/mcp/stdio.ts:74` registra cuándo se revisó
por última vez la especificación upstream del MCP. El pin:

- `version` — copia derivada de `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` (la SDK negocia; el
  valor nunca se mantiene a mano).
- `reviewedAt` — fecha del último cruce con el changelog upstream.
- `specRef` — URL de la revisión que justifica el bump.

El gate de edad vive en `test/adapters/mcp/stdio-protocol-review.test.ts`. Si
`reviewedAt` tiene más de **90 días**, el test falla con un mensaje que nombra este
documento (`docs/testing/mcp-protocol-maintenance.md`) y la URL de mantenimiento.

**Qué hacer cuando salta:**

1. Lee el changelog upstream del MCP en `https://modelcontextprotocol.io/specification/`.
2. Actualiza `reviewedAt` a la fecha de hoy y `specRef` a la nueva revisión si aplica.
3. Si subes la versión del SDK (`@modelcontextprotocol/sdk`), confirma que
   `MCP_PROTOCOL_VERSION` cambia en consecuencia y revisa el changelog para ajustes
   (p. ej. initialize, `structuredContent`).
4. Si hay cambios visibles, añade o ajusta tests en `test/adapters/mcp/stdio.test.ts`.

Mantener el `reviewedAt` actualizado es la diferencia entre "el binario está sincronizado
con la spec" y "el binario está congelado en una revisión vieja". Más detalles en
[`mcp-protocol-maintenance.md`](./mcp-protocol-maintenance.md).

### Pin de herramientas advertised (67)

El número de herramientas visibles (no ocultas) del MCP está pinado en **tres** sitios que
deben moverse juntos:

| Pin | Fichero | Función |
|---|---|---|
| Unit | `test/adapters/mcp/advertised-tool-count.test.ts:25` | `expect(advertised).toHaveLength(67)` |
| E2E runtime | `E2E_testing/mcp-e2e.mjs:158` | `pass: advertised.length === 67` |
| Meta-guard | `test/quality-gates/mcp-e2e-suite-contracts.test.ts` | El harness importa el contador compartido `EXPECTED_ADVERTISED_TOOL_COUNT` |

`dysflow_get_capabilities` (PR #656) emite un snapshot con `toolsVisible`, que la batería
cruza con `advertised.length` para detectar drift entre el pin unit y el servidor en vivo
(fila `dysflow_get_capabilities:toolsVisible-matches-advertised`). Si el snapshot dice
`toolsVisible=66` y el pin dice 67, el cross-check falla aunque las herramientas
individuales pasen.

**Qué hacer cuando añades una herramienta visible:**

1. Añade el `record(...)` correspondiente en el área adecuada del harness.
2. Sube el contador compartido de herramientas advertised en el mismo commit.
3. Confirma con `pnpm test -- test/adapters/mcp/advertised-tool-count` y con el E2E
   antes del release.

Si la herramienta debe ser **oculta** (no aparece en `tools/list`), regístrala en
`buildHiddenToolRegistry` en `src/adapters/mcp/stdio-wrappers.ts`. No cuenta hacia los
61 y no necesita bump.

## Runtime resuelto

El helper `E2E_testing/_helpers/resolve-mcp-e2e-command.mjs` decide qué `dysflow.cmd`
puede spawnear el harness. **El orden es estricto**:

1. `DYSFLOW_E2E_COMMAND` (override del operador; siempre respetado).
2. `<repoRoot>/test-runtime/bin/dysflow.cmd` (build local; default preferido).
3. `%LOCALAPPDATA%\dysflow/bin/dysflow.cmd` (runtime de producción — **rechazado sin override explícito**).
4. Nada → `MCP_E2E_NO_RUNTIME_AVAILABLE`.

El motivo del rechazo del runtime de producción: mezclar el build local con el install del
usuario arrastra scripts viejos, una `DYSFLOW_HOME` heredada y un Update path incorrecto
dentro del entorno de test. Si quieres probarlo contra el install estable, exporta
`DYSFLOW_E2E_COMMAND` con la ruta absoluta.

Adicionalmente, `mcp-e2e.mjs` fuerza `process.env.DYSFLOW_HOME = <repo>/test-runtime`
antes de spawnear, para evitar que una `DYSFLOW_HOME` heredada del shell del operador
redirija al install de producción (issue #475). Si necesitas otra, usa
`DYSFLOW_E2E_COMMAND`, no `DYSFLOW_HOME`.

## Qué hacer cuando algo falla

1. **Lee la fila FAIL completa**, incluido `summary`. Suele contener `code` y
   `error.message` estructurados.
2. **Mira el sandbox preservado** (la ruta se imprime al final). Contiene copias de los
   fixtures, los artefactos exportados y el informe Markdown.
3. **Revisa los cheap gates** (`pnpm test -- test/quality-gates/mcp-e2e`). Si han
   quedado obsoletos (un cambio en el harness los rompe), el contrato real es lo que
   ejecuta el harness, no lo que los tests afirman.
4. **No "arregles" STOP-ON-FAIL** relajando el driver. La regla existe porque una
   herramienta rota puede acumular zombies; la solución es arreglar la herramienta.
5. **No elimines `MSACCESS.EXE` huérfanos con `Stop-Process -Name MSACCESS`.** Si
   necesitas forzar, usa `dysflow_access_force_cleanup_orphaned` con el `confirmPid`
   que el informe te da.

## Documentos relacionados

- [`mcp-access-e2e.md`](./mcp-access-e2e.md) — checklist manual de regresión tras reinstalar
  Dysflow en un puesto. **Distinta** de la batería automatizada que cubre este documento.
- [`mcp-protocol-maintenance.md`](./mcp-protocol-maintenance.md) — cómo mantener el pin
  `MCP_PROTOCOL_VERSION_REVIEW` y qué cambia al bumpear la versión del SDK.
- [`testing-philosophy.md`](./testing-philosophy.md) — norte de cómo escribir tests que
  sobrevivan refactors. La batería E2E es la capa más cara de la testing trophy; este
  documento asume esa filosofía.
- [`repo-quality-gates.md`](./repo-quality-gates.md) — gates de cobertura y lint que
  aplican al repo completo.
- `E2E_testing/README.md` — referencia operativa del harness (cómo construir el
  `test-runtime`, prerrequisitos Windows, lista de áreas). Este documento es la versión
  narrativa; el README es la versión "haz esto".

## Resumen del contrato

- **Qué es.** Batería Node.js que lanza `dysflow mcp` por JSON-RPC contra un `.accdb`
  real, ejecutando cada herramienta visible y midiendo zombies por llamada.
- **Cuándo correrla.** Solo en release. Durante feature/bug, usa `pnpm test`,
  `pnpm test:integration` y los cheap-gates `test/quality-gates/mcp-e2e-*.test.ts`.
- **Cómo se aborta.** STOP-ON-FAIL: cualquier fila FAIL (herramienta o zombie-check)
  lanza y termina el proceso. REFUSE-START: si un zombie del suite sobrevive al
  preflight, no se inicia la siguiente herramienta.
- **Qué pinan los cheap gates.** Versión de protocolo (90 días), 61 herramientas
  advertised, secuencia de invocaciones, sandbox aislado, contrato STOP-ON-FAIL,
  retardo prudente de 1 s, delta global de MSACCESS.EXE.
- **Qué pasa si los cheap gates quedan obsoletos.** El E2E los descubre en 5–15 min;
  toca los tres pines en el mismo commit cuando muevas un número de contrato.
