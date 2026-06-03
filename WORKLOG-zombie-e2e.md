# WORKLOG — Investigación zombies E2E (post fix-msaccess-zombies)

> Handoff para que otra IA continúe sin perder contexto. Última actualización: 2026-06-02.
> Owner anterior: agente Claude (Opus 4.8). Idioma de notas: español.

## Objetivo

Determinar si los 7 fallos de zombie-check del reporte E2E `E2E_testing/.dysflow/e2e-report-FAILED-run2.md`
siguen presentes en el código ACTUAL (post commit `881888b` — "restrict MSACCESS cleanup to owned processes",
SDD `fix-msaccess-zombies`), o si ya están resueltos.

## Contexto imprescindible

- Repo: `C:\Proyectos\dysflow`. Runtime MCP+CLI TypeScript que maneja MS Access vía PowerShell.
- Arquitectura hexagonal: `src/core` (dominio), `src/adapters` (mcp/http/vba-sync), `src/cli`.
- El fix de zombies cambió la política: **NO matar `MSACCESS.EXE` no atribuible**; solo limpiar PIDs
  que el runtime es dueño (tracked vía operation registry + marker files `-OperationId`/`-OperationFile`).
- Reglas duras (AGENTS.md): NUNCA build/install al runtime productivo `%LOCALAPPDATA%\dysflow`.
  Buildear a `test-runtime/` y apuntar E2E con `DYSFLOW_E2E_COMMAND`.
- E2E real: `node E2E_testing/mcp-e2e.mjs` — requiere Windows + Access COM + env `ACCESS_VBA_PASSWORD`.

## Hallazgos hasta ahora

1. **El reporte FAILED es PRE-fix.** mtime del reporte = `2026-06-02 17:01`; commit del fix `881888b` = `2026-06-02 20:29`.
   → Los zombies del reporte son el problema original, NO una regresión nueva introducida por el fix.

2. **Los 7 fallos probablemente cascadean desde UN solo leak.** El zombie-check corre después de CADA tool
   y chequea estado GLOBAL (`no MSACCESS.EXE`). Primer FAIL = `run_script:zombie-check` (línea 70 del reporte).
   Todo lo posterior (`list_objects`, `exists`, `run_vba`, `cleanup_access_operation`, `list_access_operations`,
   y el `lingering-access-check` final) falla en cascada porque el proceso leakeado de un tool previo sigue vivo.
   Tools que NO deberían abrir Access (`cleanup_access_operation`, `list_access_operations`) aparecen como FAIL
   → confirma que es estado global heredado, no que esos tools abran Access.

3. Reportes FAIL (líneas del .md): 70 run_script, 78 list_objects, 80 exists, 110 run_vba,
   112 cleanup_access_operation, 114 list_access_operations, 115 lingering-access-check final.

## Pendiente de verificar (siguiente IA: empezá por acá)

- [ ] **¿Los tools `run_script` / `list_objects` / `exists` pasan `-OperationId` y `-OperationFile`
      al lanzar `dysflow-vba-manager.ps1`?** El apply-progress menciona un "VbaSync operation tracking follow-up"
      que cableó `VbaSyncAdapter.executeMappedTool()` para registrar y pasar el marker. Verificar en
      `src/adapters/vba-sync/vba-sync-adapter.ts` (617 líneas) y `src/adapters/mcp/stdio.ts` (wiring del registry).
- [ ] **¿`Close-AccessDatabase` (en `scripts/dysflow-vba-manager.ps1`) mata el PID propio dentro de la ventana
      del check (~5s)?** El follow-up cambió de "wait 5s + taskkill async" a `Stop-AccessPidAndWait` con default 20s.
      OJO: si el wait default es 20s pero el zombie-check del E2E es 5s, el proceso PODRÍA seguir vivo cuando
      el check corre → falso/real positivo. ESTO ES SOSPECHOSO. Confirmar el timeout del check en `mcp-e2e.mjs`
      vs el wait de cleanup.
- [ ] **Correr el E2E post-fix** para confirmar: `node E2E_testing/mcp-e2e.mjs` con `DYSFLOW_E2E_COMMAND`
      apuntando a un runtime buildeado en `test-runtime/` (NUNCA al productivo). Requiere `ACCESS_VBA_PASSWORD`.
      Pedir al usuario el password / que lo corra con `! node E2E_testing/mcp-e2e.mjs`.

## ✅ E2E REAL CORRIDO POST-FIX — 2026-06-02 (RESULTADO)

Corrido con build local a `test-runtime/`, NO el productivo:
- `pnpm build` → `dist/` (bin `dist/cli/index.js`).
- Wrapper creado: `test-runtime/dysflow-e2e.cmd` → `node ..\dist\cli\index.js %*`.
- Comando: `DYSFLOW_E2E_COMMAND=...\test-runtime\dysflow-e2e.cmd node E2E_testing/mcp-e2e.mjs`
  (`ACCESS_VBA_PASSWORD` ya estaba en env).

**Resultado: 98 passed / 6 failed** (antes: 97/7).

### ✅ La cascada ORIGINAL está RESUELTA
Todos los tools del reporte FAILED-run2 ahora dan zombie-check CLEAN:
`run_script` (180ms), `list_objects` (171ms), `exists` (175ms), `run_vba` (210ms),
`cleanup_access_operation` (170ms), `list_access_operations` (212ms). El fix `881888b` funcionó.

### ⚠️ HALLAZGO NUEVO: otra familia leakea (6 fallos, DISTINTOS a los originales)
Zombie-check FAIL en (todos ~5.1-5.4s, o sea pegan el timeout de 5s):
- `list_tables` (query)        — línea 32 del nuevo reporte
- `list_linked_tables` (query) — línea 40
- `link_tables` (links)        — línea 56
- `relink_tables` (links)      — línea 58
- `unlink_table` (links)       — línea 62
- `relink_directory` (links)   — línea 64

**CLAVE: NO son leaks permanentes.** El `lingering-access-check` FINAL pasó (no está en la lista
de FAIL). Entre estos tools, otros (`localize_backend_links` 218ms, `create_table` 197ms) dan clean.
→ El proceso MUERE, pero DESPUÉS de la ventana de 5s del check y antes de que termine la suite.
Es CLEANUP LENTO / asincrónico, no un leak que persiste.

Nota: `list_tables` y `list_linked_tables` daban CLEAN en el reporte viejo (pre-fix) y ahora fallan.
Posible: el fix cambió el orden/forma de cleanup en el path de query/links, o estos tools no capturan
el PID propio (caen al branch else = WARN sin kill sincrónico) y el proceso muere solo unos segundos
después.

### PENDIENTE para próxima IA (siguiente chunk de trabajo)
- [ ] Identificar el CODE PATH de `list_tables` / `list_linked_tables` / `link_tables` /
      `relink_tables` / `unlink_table` / `relink_directory`. ¿Van por `dysflow-access-runner.ps1`,
      por un adapter de relink (`src/cli/commands/access/relink-directory.ts`, 309 líneas), o por otro?
- [ ] Verificar si ESE path captura el PID propio y hace kill SINCRÓNICO (como vba-manager y
      access-runner) o si cae al else (WARN sin kill) → proceso muere solo tarde.
- [ ] Decidir si es un bug real a arreglar (hacer el cleanup sincrónico/esperar al PID propio) o si
      el zombie-check de 5s del E2E es demasiado estricto para estas ops largas (frontend+backend).
      Pista: relink abre PROBABLEMENTE 2 instancias (frontend + backend); quizás solo 1 PID se trackea.
- [ ] Re-correr E2E tras el fix con el mismo comando de arriba.

### Artefactos creados esta sesión (limpiar si no se usan)
- `test-runtime/dysflow-e2e.cmd` (wrapper de build local — útil, dejar)
- `dist/` (build local, gitignored)
- Reporte: `E2E_testing/.dysflow/mcp-e2e-temp/mcp-e2e-report.md`

## ROOT CAUSE confirmado (estático) — 2026-06-02

Mecanismo del leak en `Close-AccessDatabase` (`scripts/dysflow-vba-manager.ps1:1334`):
- Si `$Session.ProcessId` (PID propio capturado al abrir) existe → `Stop-AccessPidAndWait`
  (`:1314`, default 20s) lo mata SINCRÓNICAMENTE dentro de la llamada al tool. Cuando el
  zombie-check de 5s corre, ya murió. ✅ OK.
- Si NO hay PID propio → branch `else`: **deliberadamente NO mata**, solo cierre por ROT +
  WARN. El proceso queda vivo → zombie → cascada en todos los checks siguientes. ❌

La captura de PID en `Open-AccessDatabase` (`:1136`) tiene 3 capas y es ROBUSTA post-fix:
  1. `hWndAccessApp` → `Get-ProcessIdFromHwnd` antes de OpenCurrentDatabase (`:1190`)
  2. reintento de hWnd después de abrir (`:1201`)
  3. fallback diff pre/post de `Get-Process MSACCESS` — SOLO si aparece exactamente 1 nueva (`:1208`).
     Si aparecen >1 → NO fija PID (evita ambigüedad) → posible zombie.

Conclusión estática: para tools vba-manager (`list_objects`, `exists`, etc.) el código ACTUAL
debería capturar el PID y matarlo sincrónicamente. Los zombies del reporte (PRE-fix) eran del
código viejo antes de esta captura de 3 capas + kill de PID propio.

### Verificación de timing (descartado el conflicto 20s vs 5s)
`mcp-e2e.mjs:142` usa `waitForNoZombies(5000, 200)` DESPUÉS de que el tool retorna. Como
`Close-AccessDatabase` corre sincrónicamente DENTRO del tool, el wait de 20s ya terminó antes
de que arranque el check de 5s. NO hay race de timing. El problema es binario: o capturó el PID
(y lo mató) o no lo capturó (y lo dejó vivo).

### PENDIENTE crítico para la próxima IA
- [ ] **`run_script` es el PRIMER FAIL (línea 70) y origen de la cascada.** NO va por vba-manager:
      va por `scripts/dysflow-access-runner.ps1` (1953 líneas), que tiene su PROPIO open/close y
      captura de PID. El commit `881888b` tocó ese archivo (42 líneas). HAY QUE VERIFICAR que
      access-runner tenga la misma captura de 3 capas + kill de PID propio. Si access-runner
      quedó con captura más débil, ahí está el leak real que cascadea. ← EMPEZAR ACÁ.
- [ ] Confirmar corriendo el E2E real (necesita `ACCESS_VBA_PASSWORD` + Access COM en Windows).

## CONCLUSIÓN del análisis estático — 2026-06-02

**Ambos scripts (`vba-manager.ps1` y `access-runner.ps1`) tienen ahora cleanup ownership-safe
CONSISTENTE y robusto:**
- Captura de PID propio de 3 capas (hWnd determinístico + reintento + diff pre/post de 1 instancia).
- Kill SOLO del PID propio, SINCRÓNICO dentro de la llamada al tool (wait 20s + taskkill último recurso).
- Si la atribución de PID falla → NO mata por ruta/CommandLine, loguea WARN y sigue (decisión de seguridad correcta).
- access-runner cleanup: `scripts/dysflow-access-runner.ps1:1908-1935`.
- vba-manager cleanup: `scripts/dysflow-vba-manager.ps1:1334-1398`.

→ **Veredicto estático:** los zombies del reporte FAILED-run2 eran del código PRE-fix. El código
ACTUAL debería resolverlos. El único leak residual posible es cuando la atribución de PID falla
genuinamente (hWnd=0 Y aparecen >1 instancias nuevas de MSACCESS) — por diseño se dejan vivas con
WARN en vez de arriesgar matar un Access del usuario. Es el tradeoff seguridad/limpieza correcto.

**NO se pudo confirmar end-to-end** porque el E2E real necesita `ACCESS_VBA_PASSWORD` + Access COM
en Windows + un runtime buildeado en `test-runtime/` apuntado por `DYSFLOW_E2E_COMMAND`. Esto requiere
input del usuario (password / que lo corra). Estado: BLOQUEADO esperando decisión del usuario.

## Hipótesis principal (CONFIRMADA estáticamente)

El leak original (pre-fix) venía de operaciones que abrían Access sin capturar/atribuir el PID propio;
tras quitar el kill broad, quedaban vivas. La captura de PID de 3 capas + kill de PID propio (presente
en AMBOS scripts post-fix) lo cierra. Riesgo de timing 20s vs 5s: DESCARTADO (el cleanup es sincrónico
dentro del tool, termina antes de que arranque el check de 5s).

## 🔎 SESIÓN 2026-06-03 — Rastreo del code path de la familia relink/links (EN CURSO)

> Owner: agente Claude (Opus 4.8). Continúa el punto 1 del "PENDIENTE para próxima IA".

### Plan de esta sesión (en orden)
1. **[EN CURSO]** Rastrear el code path de los 6 tools que leakean lento:
   `list_tables`, `list_linked_tables`, `link_tables`, `relink_tables`, `unlink_table`, `relink_directory`.
   Mapear: MCP tool name → adapter (`src/adapters/mcp/*`) → comando CLI / script PS1 → open/close de Access.
2. Verificar si ese path captura el PID propio y hace kill SINCRÓNICO (como vba-manager/access-runner)
   o si cae al `else` (WARN sin kill) → proceso muere solo tarde.
3. Decidir: bug real (cleanup sincrónico) vs. check de 5s demasiado estricto para ops frontend+backend.

### Hallazgos — code path mapeado (COMPLETO)

**Routing MCP → core → PS1 (todos los 6 tools):**
- Registro: `src/adapters/mcp/mcp-tool-registry.ts` (`QUERY_TOOL_NAMES`).
- Clasificación: `src/adapters/mcp/tools.ts` `MCP_TOOL_ROUTES` (457-507):
  `list_tables`/`list_linked_tables` = `query-read` (mode `read`); `link_tables`/`relink_tables`/
  `unlink_table`/`relink_directory` = `query-maintenance` (mode `write`).
- Servicio: `src/core/services/query-service.ts` → `src/core/runner/access-runner.ts` →
  spawnea **`scripts/dysflow-access-runner.ps1`** (`-Operation query -PayloadJson ...`). NO usa vba-manager.

**En `scripts/dysflow-access-runner.ps1` hay (HOY) ~4 formas distintas de abrir Access — ESTO ES EL PROBLEMA DE FONDO:**
1. **Early-dispatch DAO read** (1463-1536): `New-DaoDbEngine` (`DAO.DBEngine.160`, motor ACE
   **in-process**) + `Open-DatabaseWithBackendPassword`. Cleanup en `finally` (1529-1535): solo
   `Close()` + `FinalReleaseComObject`, **sin** `[GC]::Collect()`. → `list_tables`, `list_linked_tables`,
   `get_schema`, `count_rows`, `distinct_values`, `get_relationships`, `compare_backends`, `query_sql` (read).
2. **`Invoke-WithDaoDatabase`** (51-78): mismo patrón DAO pero CON `[GC]::Collect()` +
   `WaitForPendingFinalizers()` (comentario: sin esto el DLL del engine queda cargado). Usado por
   `Disable-StartupFeatures`/`Restore-StartupFeatures`.
3. **`relink_directory`**: early dispatch propio (1427-1437) → `Invoke-RelinkDirectory`, DAO puro.
4. **Full COM** (1540-1638): `New-Object -ComObject Access.Application` (**ÚNICO que spawnea
   MSACCESS.EXE**) + captura de PID de 3 capas (hWnd 1605-1611, fallback WMI diff 1612-1615, reintento
   tras OpenCurrentDatabase 1623-1636). Cleanup en `finally` (1892-1948): mata `$script:accessPid`
   SINCRÓNICO (Stop-Process + poll 20s + taskkill). → `link_tables`, `relink_tables`, `unlink_table`
   (todos `mode:write` → NO entran al early-dispatch).
   Y la vba-manager (`scripts/dysflow-vba-manager.ps1`) tiene SU PROPIA `Open-AccessDatabase`/
   `Close-AccessDatabase` → 5ta forma.

### CONCLUSIÓN — dos clases de fallo distintas

**Clase A — leak REAL (link_tables / relink_tables / unlink_table):**
Estos van por el path Full COM (4). Spawnean MSACCESS de verdad. El leak ocurre en el branch
**PID-null / WARN** del `finally` (`dysflow-access-runner.ps1:1912-1914`): si la captura de PID
falla (hWnd=0 Y el diff WMI no ve exactamente 1 instancia nueva), `$script:accessPid` queda `$null`,
se emite WARN y **NO se mata el proceso** (decisión de seguridad post-fix de zombies). El proceso muere
solo en el teardown de COM ~5s después → zombie-check (ventana 5s) lo agarra vivo. Confirmado por los
timings: link_tables 13137ms, relink_tables 12226ms, unlink_table 5889ms (ops largas, abren COM).

**Clase B — artefacto de timing/atribución (list_tables / list_linked_tables / relink_directory):**
Estos van por paths DAO **in-process que NO spawnean MSACCESS.EXE** (verificado: `New-DaoDbEngine`
crea `DAO.DBEngine`, no `Access.Application`; `Invoke-ListTablesAction`/`Invoke-ListLinkedTablesAction`
solo iteran `$Database.TableDefs`). PRUEBA DECISIVA: en `mcp-e2e.mjs`, `get_schema` usa el MISMO
`...backendTarget` que `list_tables` y el MISMO path DAO → **get_schema da CLEAN, list_tables da FAIL**.
Mismo código de apertura, distinto resultado = NO es el tool quien spawnea el proceso.
  - `relink_directory` (64) falla JUSTO después de `unlink_table` (62) que también falló → **cascada**:
    el MSACCESS que dejó vivo unlink_table sigue muriendo cuando corre el check de relink_directory.
  - `list_tables` (32) y `list_linked_tables` (40) fallan "solos" (el check siguiente da CLEAN) →
    proceso de muerte lenta de una op COM previa que el WMI global atribuye al tool equivocado, o
    race del `waitForNoZombies(5000,200)` global. NO hay en su código una apertura de MSACCESS.

→ El zombie-check del E2E es GLOBAL ("no MSACCESS.EXE") y se atribuye al tool que justo corrió. Eso
  hace que un proceso de muerte lenta de la Clase A contamine el reporte de tools DAO inocentes.

### Decisión del usuario (2026-06-03) — DIRECTRIZ DE ARQUITECTURA
**"Apertura canónica y clausura canónica, siempre que se pueda. Que NO haya un tipo de apertura de
Access por cada funcionalidad — no tiene sentido."**
→ El fix correcto NO es parchear el branch WARN. Es **consolidar las ~5 formas de abrir/cerrar Access
en UNA apertura canónica + UNA clausura canónica** (con captura de PID de 3 capas + kill sincrónico del
PID propio) y que TODAS las operaciones (read DAO, write COM, vba-manager, relink) pasen por ahí cuando
abran Access. Una sola puerta de entrada y una sola de salida.

### PENDIENTE próxima IA (orden sugerido)
- [ ] Diseñar la apertura/clausura canónica única (helper compartido). Decidir: ¿read-only DAO también
      pasa por ella, o la canónica cubre solo el path que spawnea MSACCESS (Access.Application)?
      Ojo: DAO in-process NO deja zombie, así que el valor está en unificar el path COM y matar la
      duplicación vba-manager vs access-runner.
- [ ] Para Clase A: garantizar que la captura de PID NUNCA caiga al WARN sin kill en el caso normal
      (o que la clausura canónica espere/mate de forma fiable). Revisar por qué hWnd=0 + diff>1 pasa.
- [ ] Para Clase B: confirmar con instrumentación (snapshot de PIDs por tool, no check global) que
      list_tables/list_linked_tables NO crean MSACCESS — y si es así, considerar que el zombie-check
      del harness sea por-delta (procesos nuevos atribuibles) en vez de global, para no culpar al
      tool equivocado.
- [ ] Re-correr E2E tras consolidar.

### ▶️ PUNTO 1 EN CURSO (2026-06-03) — Apertura/clausura canónica COM única
Decisión tomada (usuario): arrancar por consolidar el path que abre `Access.Application` en UNA
apertura canónica + UNA clausura canónica compartida entre `dysflow-access-runner.ps1` y
`dysflow-vba-manager.ps1`. NO meter los reads DAO in-process en la canónica COM (no spawnean MSACCESS;
forzarlos sería más lento y crearía zombies donde hoy no hay). Diseño detallado abajo ⬇️

#### Diseño de la canónica COM (COMPLETO — 2026-06-03)

**Estado de duplicación HOY (no hay módulo compartido):**
- Los dos scripts son standalone, no se dot-sourcean nada en común.
- `Get-ProcessIdFromHwnd` duplicado byte-a-byte: runner `:222` y vba-manager `:948`.
- `Get-MsAccessProcessesBounded`/`Get-MsAccessProcesses` duplicado: runner `:242/:262`, vba `:1260`.
- `Stop-AccessPidAndWait` solo en vba `:1314`; el runner INLINEA el mismo loop en `:1916-1939`.
- Impedancia central: runner es un SCRIPT top-to-bottom (usa `$script:accessPid`, main try/finally
  `:1540-1949`); vba-manager es FUNCIONAL (`Open-AccessDatabase` devuelve un `$Session`, `Close-AccessDatabase`
  lo consume).

**A. Dónde difieren las 4 implementaciones (open x2, close x2):**
- Open: layer-3 de captura de PID difiere (runner = marker WMI bounded; vba = diff `Get-Process` id pre/post
  y BAILA si aparecen >1 nuevas → elección más segura, vba `:1216-1218`). Runner guarda/restaura
  `AutomationSecurity` (`:1600/:1901`), vba lo hard-setea a 1 y no restaura. Runner tiene el short-circuit
  `isDirectTargetQuery` que saltea `OpenCurrentDatabase`.
- Close: runner INLINEA el kill + tiene `taskkill /F` last-resort que vba NO tiene. vba tiene el fallback
  null-PID SEGURO (diagnóstico `Find-AccessPidByDatabase` SIN matar + ROT close + chequeo de `.laccdb`) que
  runner NO tiene. **EL BUG**: runner `:1912-1914` con PID null = WARN y NO mata → zombie ~5s.
- Ambos codifican la MISMA regla de seguridad: matar SOLO el PID capturado al abrir (hWnd o diff sin
  ambigüedad). Match por path/name/CommandLine = diagnóstico, NUNCA autoridad de kill.

**B. Contrato canónico (forma PAIRED, no wrapper scriptblock):**
Se eligió par `Open-CanonicalAccess`/`Close-CanonicalAccess` (no `Invoke-WithCanonicalAccess`) porque los
dos call sites tienen lifecycles muy distintos (runner dispatcha N ops entre open y close; vba interleavea
trabajo VBE). La canónica posee SOLO el ciclo COM-spawn + PID propio; NO posee startup hardening,
AllowBypassKey ni DAO (eso queda en cada call site).
```
Open-CanonicalAccess -DbPath -Password -OpenDatabase($true) -SetAutomationSecurityLow($true)
  -> Session { AccessApplication, OwnedPid([int]|$null), OriginalAutomationSecurity, PidAttributed }
     Captura PID con la escalera de 3 capas (hWnd pre-open → hWnd post-open retry → diff bounded;
     si >1 nueva ambigua → OwnedPid=$null, NO adivina).
Close-CanonicalAccess -Session -DbPath
  -> { OwnedPidKilled, PidWasAttributed, UnattributedKilled(invariante $false) }
     Teardown COM fijo (release secundarios → CloseCurrentDatabase → Quit → FinalRelease → GC).
     Si OwnedPid != null: SIEMPRE kill SINCRÓNICO (Stop-Process + poll 20s + taskkill last-resort).
     Si OwnedPid == null: NUNCA mata por path; diagnóstico WARN + ROT close (Close-TargetAccessDbIfOpen)
     + verificación de lock. Devuelve OwnedPidKilled=$false.
```
INVARIANTE de seguridad (única, central): kill autorizado SOLO contra PID capturado al abrir vía hWnd o
diff sin ambigüedad. Path/name/CommandLine = diagnóstico, jamás autoridad de kill.

**C. Dónde vive:** nuevo módulo compartido `scripts/lib/dysflow-access-com.ps1`, dot-sourceado por ambos
scripts (`. (Join-Path $PSScriptRoot 'lib/dysflow-access-com.ps1')`). Exporta `Get-ProcessIdFromHwnd`,
`Get-MsAccessProcesses(Bounded)`, `Stop-AccessPidAndWait`, `Open-/Close-CanonicalAccess`. Dot-source
mantiene un solo runspace scope (necesario para el `Add-Type` Win32 idempotente vía guard PSTypeName).

**D. Plan de adopción (slices chicos, ninguno >400 líneas):**
1. Extraer módulo compartido, sin cambio de comportamiento (~120 ln): mover helpers duplicados, dot-source
   en ambos, borrar duplicados. Tests existentes verdes sin tocar.
2. Folding del `taskkill` last-resort dentro de `Stop-AccessPidAndWait` compartido (~30 ln) → vba gana el
   last-resort. Primer cambio de comportamiento (cubrir con port test).
3. Crear `Open-/Close-CanonicalAccess` en el módulo, sin usar aún (~150 ln) + tests de puerto.
4. Migrar vba-manager a la canónica (~120 ln) — es la impl más segura, migra primero (prueba el contrato).
5. **Migrar el path Full-COM de access-runner Y ARREGLAR EL LEAK (~140 ln):** reemplazar open inline
   (`:1596-1638`) y el finally (`:1913-1939`) por `Open-/Close-CanonicalAccess`. ESTE slice elimina la
   ventana de zombie (el branch null ahora corre ROT/lock en vez de WARN pelado).
6. Limpieza final (~20 ln) + suite completa + E2E smoke (`E2E_testing/mcp-e2e.mjs`).

**E. Puntos de test TDD (behavior at the ports — mockear SOLO el seam COM/spawn):**
1. PID propio se mata SINCRÓNICO antes de que close retorne (assert post-condición, no cuántos Stop-Process).
2. MSACCESS NO atribuido NUNCA se mata (guard de regresión de seguridad; `UnattributedKilled=$false`).
3. hWnd OK ⇒ no se invoca el seam WMI/diff (assert que el scriptblock WMI inyectado no se llamó).
4. diff ambiguo (>1 nueva) ⇒ `OwnedPid=$null`, no adivina, close toma el fallback no-kill.
5. close con PID null NO tira excepción, no force-kill, corre ROT, devuelve `OwnedPidKilled=$false`
   (el fix observable del bug).
6. modo spawn-only (`-OpenDatabase:$false`) no llama `OpenCurrentDatabase` pero igual captura/mata PID.
Wire: `test/scripts-access-runner.test.ts` (`vitest.integration.config.ts`) + Pester para la escalera pura.

**F. Riesgos / decisiones abiertas para quien implemente:**
1. AutomationSecurity asimétrico (runner restaura, vba no) → decidir si la canónica siempre captura+restaura.
2. GC antes vs después del kill (runner después `:1946`, vba antes `:1359`) → elegir una; recomendado antes.
3. `isDirectTargetQuery` con `-OpenDatabase:$false`: confirmar que el hWnd se puebla a tiempo para atribuir
   PID sin `OpenCurrentDatabase`; si no, la escalera debe llegar al layer diff.
4. Emisión de markers (`DYSFLOW_ACCESS_PROCESS` runner vs `DYSFLOW_OPERATION` vba): recomendado que la
   canónica devuelva el PID y cada caller emita su marker (no acoplar el protocolo stderr).
5. `Close-TargetAccessDbIfOpen` vive solo en vba `:970` → moverlo al módulo o inyectarlo como scriptblock
   para que access-runner gane el fallback sin duplicar el bloque ROT.
6. Forma del return de bounded-WMI difiere (runner proyecta, vba raw) → canonicalizar shape y confirmar
   consumidores (`Write-AccessProcessMarker`, `Find-AccessPidByDatabase`).

**Archivos críticos:** `scripts/dysflow-access-runner.ps1`, `scripts/dysflow-vba-manager.ps1`,
`scripts/lib/dysflow-access-com.ps1` (nuevo), `test/scripts-access-runner.test.ts`,
`docs/testing/testing-philosophy.md`.

→ ~~PRÓXIMO PASO concreto: implementar **Slice 1**~~ **✅ Slice 1 COMPLETADO (2026-06-03)**. Ver resultado abajo.

## ✅ Slice 1 — COMPLETADO (2026-06-03)

### Qué se movió al módulo compartido `scripts/lib/dysflow-access-com.ps1`
- `Get-ProcessIdFromHwnd` — eliminado de **runner** `:222` y de **vba-manager** `:948`. Idénticos byte-a-byte.
- `Get-MsAccessProcessesBounded` — eliminado de **runner** `:242` y de **vba-manager** `:1260`.
- `Get-MsAccessProcesses` — eliminado de **runner** `:262` (no existía en vba-manager).
- `Stop-AccessPidAndWait` — eliminado de **vba-manager** `:1314` (en runner solo existía como loop inlineado en finally; ese loop NO se tocó en este slice — se mantiene para Slice 2).

### Decisión de shape — `Get-MsAccessProcessesBounded`
Las dos copias diferían: **runner** hacía `Select-Object ProcessId, CreationDate, CommandLine` (projected PSCustomObject), **vba-manager** retornaba raw CIM objects.

**Decisión: shape proyectado (runner)** como canónico en el módulo.
- Callers de runner (`Write-AccessProcessMarker`) necesitan `CreationDate` → requieren los 3 campos.
- Callers de vba-manager (`Find-AccessPidByDatabase`, lock-check en `Close-TargetAccessDbIfOpen`) solo usan `.ProcessId` y `.CommandLine` → ambos presentes en el shape proyectado. **Sin rotura.**
- El `Select-Object` además elimina el riesgo de que campos inesperados de CIM varíen entre versiones de PowerShell.
- Cambio menor de logging: vba-manager usaba `Write-Status -Color DarkYellow` en el timeout; el módulo usa `Write-Debug`. El comportamiento observable al puerto (retorno de array vacío) es idéntico.

### Dot-source añadido
En ambos scripts, inmediatamente después de `$ErrorActionPreference = 'Stop'`:
```
. (Join-Path $PSScriptRoot 'lib/dysflow-access-com.ps1')
```

### Archivos tocados
| Archivo | Cambio |
|---------|--------|
| `scripts/lib/dysflow-access-com.ps1` | **NUEVO** — módulo compartido (~120 ln) |
| `scripts/dysflow-access-runner.ps1` | dot-source añadido; 3 funciones removidas y reemplazadas por comentario |
| `scripts/dysflow-vba-manager.ps1` | dot-source añadido; `Get-ProcessIdFromHwnd`, `Get-MsAccessProcessesBounded`, `Stop-AccessPidAndWait` removidas |
| `scripts/tests/dysflow-access-com.Tests.ps1` | **NUEVO** — 14 tests de caracterización del módulo |
| `scripts/tests/dysflow-access-runner.Tests.ps1` | P1 actualizado: extrae función del módulo en vez del runner |
| `scripts/tests/dysflow-vba-manager.Tests.ps1` | P1 actualizado: extrae función del módulo en vez del vba-manager |
| `test/scripts-vba-manager.test.ts` | "Goal B" test actualizado para verificar módulo + dot-source |

### Resultados de tests
| Suite | Baseline | Post-Slice 1 | Delta |
|-------|----------|--------------|-------|
| Pester (`scripts/tests/`) | 170 ✅ / 4 skip / 0 ❌ | 184 ✅ / 4 skip / 0 ❌ | +14 (módulo tests) |
| TypeScript (`pnpm test`) | 843 ✅ / 3 skip / 0 ❌ | 845 ✅ / 3 skip / 0 ❌ | +2 (test actualizado) |

### Pendiente de este slice
- La integración Access-COM E2E (`node E2E_testing/mcp-e2e.mjs`) no se corrió (fuera de scope para un dedup puro; requiere live Access + `ACCESS_VBA_PASSWORD`).
- El loop inline de kill en el finally de runner (`:1916-1939`) NO se tocó — se mueve en Slice 2.
- Slice F.6 (forma del return) está **resuelto**: el módulo usa siempre el shape proyectado.

### Decisión warning (cerrada 2026-06-03)
El cambio de logging `Write-Status -Color DarkYellow` → `Write-Debug` en el timeout de WMI se **ACEPTA** tal cual. Es un path raro (provider WMI colgado), el comportamiento observable al puerto es idéntico (array vacío), y ramificar el logging por caller sería sobre-ingeniería. NO se restaura. Cerrado.

## ✅ Slice 2 — COMPLETADO (2026-06-03)

**Objetivo:** consolidar el kill en `Stop-AccessPidAndWait` del módulo compartido, incorporando el `taskkill /F` last-resort, y hacer que el `finally` del runner USE esa función en vez de su loop inline.

**Estado HOY (pre-Slice-2):**
- `Stop-AccessPidAndWait` ya vive en `scripts/lib/dysflow-access-com.ps1` (movido en Slice 1, lifteado de vba `:1314`). Hace `Stop-Process -Force` + poll (default 20s) + warn si no terminó. **NO tenía `taskkill /F` last-resort.**
- El runner tenía un loop INLINE en su `finally` (`dysflow-access-runner.ps1:~1880-1903`): `Stop-Process` + poll 20s + **`taskkill /F /PID` last-resort**. Ese loop seguía inline (no se tocó en Slice 1).
- vba-manager ya llamaba `Stop-AccessPidAndWait` (del módulo) en `Close-AccessDatabase`.

### Qué cambió

**`scripts/lib/dysflow-access-com.ps1` — `Stop-AccessPidAndWait`:**
- Añadido parámetro `-UseTaskkillLastResort [switch]` con default `$true`.
- Después de agotar el poll sin que el proceso muera: chequea si sigue vivo y lanza
  `Start-Process -FilePath "taskkill" -ArgumentList "/F", "/PID", $AccessPid -NoNewWindow -Wait:$false`.
- Invariante preservado: el `taskkill` se lanza SOLO contra `$AccessPid` (el PID atribuido
  que se pasó al entrar); NUNCA se resuelve por path/name/CommandLine.

**`scripts/dysflow-access-runner.ps1` — `finally` (antes `:1880-1903`, ahora `:1880-1884`):**
- El loop inline de kill (Stop-Process + poll 20s + taskkill last-resort) fue REEMPLAZADO
  por: `Stop-AccessPidAndWait -AccessPid $pidToKill -TimeoutMs 20000 | Out-Null`
- TODO lo demás del `finally` quedó INTACTO:
  - `$db` release (`:1859-1863`)
  - `$access` COM teardown + `originalAutomationSecurity` restore (`:1864-1871`)
  - branch null-PID WARN (`:1877-1879`) — **NO TOCADO** (se arregla en Slice 5)
  - `startupInfo` + sentinel restore (`:1885-1888`)
  - GC (`:1890-1891`)

**`scripts/tests/dysflow-access-com.Tests.ps1`:**
- Añadidos 3 port tests en el contexto `taskkill last-resort — observable post-condition (Slice 2 behavior change)`:
  1. Invoca el seam `Start-Process`/taskkill contra el owned PID cuando el poll se agota y el proceso sigue vivo.
  2. NO invoca taskkill cuando el proceso muere antes de que se agote el poll.
  3. NO invoca taskkill cuando `-UseTaskkillLastResort:$false`.

### Cambio de comportamiento observable

**Antes de Slice 2:** `vba-manager`'s `Close-AccessDatabase` → `Stop-AccessPidAndWait` → NO tenía `taskkill` last-resort. Si el proceso sobrevivía los 20s de poll, función retornaba `$false` y el proceso podía seguir vivo.

**Después de Slice 2:** `vba-manager`'s `Close-AccessDatabase` → `Stop-AccessPidAndWait` → AHORA tiene `taskkill /F /PID` last-resort si el proceso sobrevive los 20s de poll.

El runner ya tenía el `taskkill` last-resort (inline); ahora lo delega al módulo — comportamiento equivalente.

### Confirmación null-PID branch

El branch null-PID (`dysflow-access-runner.ps1:1877-1879`):
```powershell
if ($null -eq $pidToKill -and $null -ne $access) {
  [Console]::Error.WriteLine("WARN: Access PID attribution was unavailable; skipped force cleanup instead of killing by database path/CommandLine only.")
}
```
**NO fue tocado.** Se preserva para Slice 5.

### Resultados de tests

| Suite | Baseline (pre-Slice-2) | Post-Slice-2 | Delta |
|-------|------------------------|--------------|-------|
| Pester (`scripts/tests/`) | 184 ✅ / 4 skip / 0 ❌ | 187 ✅ / 4 skip / 0 ❌ | +3 (port tests taskkill) |
| TypeScript (`pnpm test`) | 845 ✅ / 3 skip / 0 ❌ | 845 ✅ / 3 skip / 0 ❌ | sin cambio |

## ✅ Slice 3 — COMPLETADO (2026-06-03)

**Objetivo:** crear `Open-CanonicalAccess` / `Close-CanonicalAccess` en `scripts/lib/dysflow-access-com.ps1`, SIN que nadie las use todavía (adopción en Slices 4-5). Solo contrato + tests de puerto. CERO cambios en runner/vba-manager en este slice.

**Contrato (del diseño, sección B):**
```
Open-CanonicalAccess -DbPath -Password -OpenDatabase($true) -SetAutomationSecurityLow($true)
  -> Session { AccessApplication, OwnedPid([int]|$null), OriginalAutomationSecurity, PidAttributed([bool]) }
     Escalera de captura de PID de 3 capas (NO sobreescribir una capa más fuerte):
       1. hWnd pre-open (hWndAccessApp → Get-ProcessIdFromHwnd)
       2. hWnd post-open retry (solo si capa 1 vacía)
       3. diff bounded de procesos (solo si 1+2 vacías); si aparecen >1 nuevas ambiguas → OwnedPid=$null (NO adivina)
     -OpenDatabase $false = spawnea COM pero NO llama OpenCurrentDatabase (caso isDirectTargetQuery del runner).
Close-CanonicalAccess -Session -DbPath
  -> { OwnedPidKilled([bool]), PidWasAttributed([bool]), UnattributedKilled(invariante SIEMPRE $false) }
     Teardown COM fijo: release secundarios → CloseCurrentDatabase → Quit → FinalReleaseComObject → GC.Collect+WaitForPendingFinalizers.
     Si OwnedPid != null  → SIEMPRE Stop-AccessPidAndWait (kill sincrónico, ya tiene taskkill last-resort de Slice 2).
     Si OwnedPid == null  → NUNCA mata por path; WARN diagnóstico + ROT close (Close-TargetAccessDbIfOpen) + verificación de lock (.laccdb).
```
**INVARIANTE:** autoridad de kill SOLO desde PID capturado al abrir (hWnd o diff sin ambigüedad). Path/CommandLine = diagnóstico, jamás kill.

**Decisiones abiertas a resolver en este slice (del diseño, sección F):**
- AutomationSecurity: la canónica SIEMPRE captura `OriginalAutomationSecurity` y lo restaura en close (recomendado).
- GC: hacerlo ANTES del kill (recomendado; liberar RCWs para que `Quit` complete) — verificar que no reintroduce handles colgados.
- Markers stderr (`DYSFLOW_ACCESS_PROCESS` runner vs `DYSFLOW_OPERATION` vba): la canónica NO emite markers; devuelve el PID y cada caller emite el suyo (no acoplar protocolo stderr). 
- `Close-TargetAccessDbIfOpen` vive solo en vba-manager `:970`. Para que `Close-CanonicalAccess` haga el fallback ROT sin duplicar el bloque: INYECTARLO como scriptblock opcional `-RotCloseAction` (si no se pasa, el fallback solo hace WARN + lock-check). Así Slice 3 no obliga a mover ese bloque grande todavía.

### Firmas finales implementadas

```powershell
Open-CanonicalAccess
  -DbPath [string, mandatory]
  -Password [string, default ""]
  -OpenDatabase [bool, default $true]
  -SetAutomationSecurityLow [bool, default $true]
  # Injectable seams (testing only):
  -ComSpawnAction [scriptblock, default: New-Object -ComObject "Access.Application"]
  -HwndToPidAction [scriptblock, default: Get-ProcessIdFromHwnd -Hwnd $Hwnd]
  -WmiSnapshotAction [scriptblock, default: Get-MsAccessProcessesBounded]
  -> [PSCustomObject] { AccessApplication, OwnedPid([int]|$null), OriginalAutomationSecurity([int]), PidAttributed([bool]) }

Close-CanonicalAccess
  -Session [PSCustomObject, mandatory]   # result of Open-CanonicalAccess
  -DbPath [string, default ""]
  -RotCloseAction [scriptblock, optional]   # { param($DbPath) } — ROT close for null-PID path
  # Injectable seams (testing only):
  -KillPidAction [scriptblock, default: Stop-AccessPidAndWait -AccessPid $AccessPid -TimeoutMs 20000]
  -LockFileAction [scriptblock, default: Test-Path -LiteralPath $LockPath]
  -> [PSCustomObject] { OwnedPidKilled([bool]), PidWasAttributed([bool]), UnattributedKilled([bool]=always $false) }
```

### Decisiones abiertas cerradas en este slice

| # | Decisión | Resolución |
|---|----------|------------|
| F.1 | AutomationSecurity | Siempre captura OriginalAutomationSecurity; siempre restaura en Close (en finally, antes del kill). |
| F.2 | GC timing | GC **ANTES** del kill (libera RCWs para que Quit complete antes del taskkill). |
| F.3 | Markers stderr | La canónica NO emite markers; devuelve el PID y cada caller emite el suyo. |
| F.4 | RotCloseAction | Inyectado como `-RotCloseAction [scriptblock]` opcional. Si no se pasa, el fallback solo hace WARN + lock-check. |

### Seam design (clave para testabilidad)

El problema central: las funciones en módulos dot-sourceados resuelven nombres de función en su propio scope chain, no en el script scope del test. Por tanto, mocks tipo `function script:Get-ProcessIdFromHwnd { ... }` no funcionan para funciones llamadas internamente.

**Solución:** scriptblocks inyectables como parámetros (patrón del mismo módulo: `Get-MsAccessProcessesBounded -WmiScriptBlock`):
- `Open-CanonicalAccess`: `-ComSpawnAction`, `-HwndToPidAction`, `-WmiSnapshotAction`
- `Close-CanonicalAccess`: `-KillPidAction`, `-LockFileAction`

**Gotcha de scoping PowerShell:** scriptblocks que referencian variables externas por nombre tienen la variable resuelta en el scope donde se EJECUTAN (no donde se definen). Si la función usa `$ownedPid` internamente, el scriptblock `{ param($Hwnd) $ownedPid }` resuelve al `$ownedPid` DE LA FUNCIÓN, no del test. Solución: usar retornos literales en los scriptblocks de test (`{ param($Hwnd) 42000 }`) y listas .NET para contadores (reference semántics, no copy-on-write).

### Tests agregados (10 nuevos en `scripts/tests/dysflow-access-com.Tests.ps1`)

Port tests para los 6 comportamientos observables:
- **(a)** KillPidAction llamado con PID propio + OwnedPidKilled=$true
- **(b)** UnattributedKilled=$false (invariante), incluso con OwnedPid=$null
- **(c)** WmiSnapshotAction no invocado cuando hWnd resuelve el PID (≤1 call total = solo pre-open)
- **(d)** Diff ambiguo (>1 nuevo) → OwnedPid=$null, PidAttributed=$false, KillPidAction no invocado
- **(e)** Close con null PID no tira, OwnedPidKilled=$false, sin force-kill
- **(f)** `-OpenDatabase:$false` no llama OpenCurrentDatabase pero igual captura y mata PID

Más 2 tests de shape (session + result), más 2 tests de AST (módulo define las funciones por nombre). Total: **10 tests**.

### Resultados de tests

| Suite | Baseline (pre-Slice-3) | Post-Slice-3 | Delta |
|-------|------------------------|--------------|-------|
| Pester (`scripts/tests/`) | 187 ✅ / 4 skip / 0 ❌ | 197 ✅ / 4 skip / 0 ❌ | +10 (Slice 3 tests) |
| TypeScript (`pnpm test`) | 845 ✅ / 3 skip / 0 ❌ | 845 ✅ / 3 skip / 0 ❌ | sin cambio |

### Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `scripts/lib/dysflow-access-com.ps1` | +`Open-CanonicalAccess` y `Close-CanonicalAccess` (~180 ln) |
| `scripts/tests/dysflow-access-com.Tests.ps1` | +10 port tests Slice 3 (~260 ln) |

`scripts/dysflow-access-runner.ps1` y `scripts/dysflow-vba-manager.ps1` **NO TOCADOS** en este slice. ✅

## ✅ Slice 4 — COMPLETADO (2026-06-03)

**Objetivo:** migrar `dysflow-vba-manager.ps1` para que use `Open-CanonicalAccess`/`Close-CanonicalAccess`
del módulo, SIN cambiar el comportamiento observable.

### Qué se delegó a la canónica vs qué quedó en vba-manager

**`Open-AccessDatabase` — delegado a `Open-CanonicalAccess`:**
- `New-Object -ComObject Access.Application` (ComSpawnAction)
- `AutomationSecurity = 1`
- Escalera de PID de 3 capas (hWnd pre-open → hWnd post-open retry → WMI diff bounded)
- `OpenCurrentDatabase`

**`Open-AccessDatabase` — se mantiene alrededor del canónico:**
- `Close-TargetAccessDbIfOpen` (pre-open)
- AllowBypassKey handling (`Get-AllowBypassKeyState` + `Enable-AllowBypassKey`)
- `Disable-StartupFeatures` / `$AllowStartupExecution` handling
- `$access.Visible = $false` / `UserControl = $false` (set post-spawn en el `AccessApplication` retornado)
- `$access.DoCmd.SetWarnings($false)`
- Emisión del marker `DYSFLOW_OPERATION` (la canónica NO emite markers)
- VBE / VbProject acquisition
- Catch local (release VbProject/Vbe → Close-CanonicalAccess si canonical disponible → restore AllowBypassKey + startup → rethrow)

**`Close-AccessDatabase` — delegado a `Close-CanonicalAccess`:**
- `CloseCurrentDatabase` → `Quit` → `FinalReleaseComObject`
- `GC.Collect` + `WaitForPendingFinalizers` (ANTES del kill)
- `AutomationSecurity` restore
- Kill del PID propio: `Stop-AccessPidAndWait` (sincrónico, con `taskkill` last-resort de Slice 2)
- Null-PID fallback: WARN + `RotCloseAction` + lock-file check vía `LockFileAction`

**`Close-AccessDatabase` — se mantiene alrededor del canónico:**
- Release de `VbProject` / `Vbe` ANTES de llamar `Close-CanonicalAccess`
- Construcción del canonical session (de `$Session.CanonicalSession` si presente, fallback desde `ProcessId`)
- Inyección de `-RotCloseAction { Close-TargetAccessDbIfOpen -AccessPath $p }`
- `Restore-AllowBypassKey` + `Restore-StartupFeatures` (después del cierre canónico)
- Lock-file check adicional post-restore (cubre el path owned-PID donde el lock puede persistir brevemente)
- WARN si el kill retornó `$false`

### Session mapping (Open → Close)

`Open-AccessDatabase` ahora guarda el canonical session en el `$Session` pscustomobject:
```
$Session = {
    AccessApplication = $canonical.AccessApplication   # sin cambio downstream
    Vbe, VbProject, OriginalBypass, StartupInfo        # sin cambio downstream
    ProcessId = $canonical.OwnedPid                    # sin cambio downstream
    CanonicalSession = $canonical                      # NUEVO — usado por Close-AccessDatabase
}
```
`Close-AccessDatabase` usa `$Session.CanonicalSession` si está presente; si no (sesión pre-Slice-4),
construye un canonical session inline desde `ProcessId` con `OriginalAutomationSecurity = 1` (safe default).

### RotCloseAction / LockFileAction wiring

- `RotCloseAction`: inyectado como `{ param($p) Close-TargetAccessDbIfOpen -AccessPath $p }`.
  Esto preserva el comportamiento previo: en el path null-PID, `Close-CanonicalAccess` llama
  `Close-TargetAccessDbIfOpen` con el `$DbPath` recibido.
- `LockFileAction`: NO sobreescrito (usa el default `Test-Path` de la canónica).
  El lock-check adicional post-restore en vba-manager usa `Get-AccessLockFilePath` + `Test-Path` / `Close-TargetAccessDbIfOpen`
  directamente (comportamiento previo preservado).

### Seams inyectables añadidos a `Close-AccessDatabase`

Parámetros opcionales nuevos (production callers omiten → defaults reales):
- `-KillPidAction [scriptblock]` — forwarded a `Close-CanonicalAccess`
- `-LockFileAction [scriptblock]` — forwarded a `Close-CanonicalAccess`

Necesarios para testabilidad: el script-scope mock de `Stop-AccessPidAndWait` no intercepta el
default scriptblock de `Close-CanonicalAccess` (que está en el módulo dot-sourceado).

### Ediciones mecánicas en tests

`scripts/tests/dysflow-vba-manager.Tests.ps1` — describe `Close-AccessDatabase — owned Access PID cleanup`:
- `BeforeAll`: ahora carga también `Close-CanonicalAccess` y `Stop-AccessPidAndWait` del módulo (necesarios
  porque `Close-AccessDatabase` los invoca); sigue usando AST extraction + `Invoke-Expression`.
- `BeforeEach`: reemplaza `function script:Stop-AccessPidAndWait { ... }` por `$script:KillPidSeam`
  (scriptblock pasado como `-KillPidAction`).
- Tests 1/2/3: actualizados para pasar `-KillPidAction $script:KillPidSeam`; assertions de comportamiento
  (PID killed / no taskkill / null-PID no kill) **IDÉNTICAS**, solo cambia el mecanismo de intercepción.
- Test "uses the bounded 20s owned-PID wait": ya no verifica `TimeoutMs` directamente (eso está en el
  default de la canónica, cubierto por los tests de Slice 3); verifica que el PID 4242 llega al kill action.

### Baseline vs post-Slice-4

| Suite | Baseline (pre-Slice-4) | Post-Slice-4 | Delta |
|-------|------------------------|--------------|-------|
| Pester (`scripts/tests/`) | 197 ✅ / 4 skip / 0 ❌ | 197 ✅ / 4 skip / 0 ❌ | 0 (mismos tests, mismo resultado) |
| TypeScript (`pnpm test`) | 844 ✅ / 1 ❌ / 3 skip | 845 ✅ / 0 ❌ / 3 skip | +1 (test timeout pre-existente pasó en esta run) |

Nota: el TS baseline real en este entorno era 844/1 fail (test de COM real que necesita Access+password
entra en timeout de 30s); en la run post-Slice-4 salió 845/0 fail — fluctuación de timing no relacionada
con los cambios. El test de COM real es fuera de scope (Slice 6).

### `access-runner.ps1` — NO TOCADO ✅

`scripts/dysflow-access-runner.ps1` no fue modificado en este slice (confirmado con `git diff --name-only`
mostrando solo cambios de Slices 1-3 pre-existentes).

## ✅ Slice 5 — COMPLETADO (2026-06-03) — ⭐ EL SLICE QUE ARREGLA EL LEAK

**Objetivo:** migrar el path Full-COM de `dysflow-access-runner.ps1` a `Open-/Close-CanonicalAccess` Y
reemplazar el branch null-PID WARN (que dejaba el zombie ~5s) por el fallback ROT/lock de la canónica.
Este slice CIERRA la ventana de zombie de la Clase A (link_tables/relink_tables/unlink_table).

**Estado HOY (pre-Slice-5)** — buscar por contenido, las líneas se corrieron tras Slices 1-2:
- Open inline Full-COM: bloque que hace `New-Object -ComObject Access.Application` (era ~`:1596`) + Visible/
  UserControl=$false + save `$originalAutomationSecurity` + set AutomationSecurity LOW + escalera PID 3 capas
  (hWnd pre, OpenCurrentDatabase, hWnd retry, diff WMI marker) + emite `DYSFLOW_ACCESS_PROCESS` por stderr.
  Tiene el short-circuit `isDirectTargetQuery` que SALTEA `OpenCurrentDatabase`.
- Close inline: `finally` (era `:1892-1948`) con release `$db` + restore AutomationSecurity + CloseCurrentDatabase
  + Quit + FinalRelease + GC + (Slice 2) `Stop-AccessPidAndWait` para PID no-null.
- **EL BUG:** branch null-PID `dysflow-access-runner.ps1:1877-1879` (post-slices): emite WARN y NO mata
  → MSACCESS muere solo ~5s después → zombie-check FAIL.

**Pasos Slice 5 (TDD estricto):**
1. Baseline: `Invoke-Pester scripts/tests/` (197/4skip/0) + `pnpm test` (845/3skip/0).
2. Open: reemplazar el bloque spawn COM + escalera PID por `Open-CanonicalAccess -DbPath -Password
   -OpenDatabase:(-not $isDirectTargetQuery)`. Guardar `OwnedPid` donde estaba `$script:accessPid`.
   MANTENER: emisión del marker `DYSFLOW_ACCESS_PROCESS` (la canónica NO emite — el runner emite con el
   PID devuelto), Visible/UserControl, y el `Disable-StartupFeatures` que corre fuera del bloque.
3. Close: reemplazar el cuerpo de kill del `finally` (incluido el branch null-PID WARN) por
   `Close-CanonicalAccess -Session -DbPath` **inyectando `-RotCloseAction`** con el ROT close que
   corresponda al runner. OJO: `Close-TargetAccessDbIfOpen` vive en vba-manager `:970`, NO en el runner.
   → DECISIÓN: o se mueve `Close-TargetAccessDbIfOpen` al módulo compartido (mejor, single source), o el
   runner pasa un `-RotCloseAction` que haga el equivalente mínimo. PREFERIR mover al módulo si es limpio;
   si arriesga, pasar un scriptblock runner-local. Documentar la decisión.
   MANTENER alrededor: release `$db` (DAO), restore startup sentinel, restore AutomationSecurity (o dejar
   que la canónica lo haga vía OriginalAutomationSecurity del Session — preferir la canónica).
4. **El fix observable:** con OwnedPid=$null, el close ahora corre ROT + lock-check en vez de WARN pelado.
   Añadir/ajustar port test que pinee: null-PID ⇒ no force-kill por path PERO corre el ROT fallback y no tira.
5. NO tocar los paths DAO early-dispatch (list_tables etc.) — esos NO abren MSACCESS, fuera de scope.
6. Verificar Pester + `pnpm test` verdes. (E2E Access-COM real → Slice 6.)
7. Actualizar WORKLOG (Slice 5 done, decisión ROT, qué se delegó, tests) + engram
   `topic_key zombie-e2e/slice5-runner-fix`.

**Invariante:** kill SOLO del PID propio; null-PID NUNCA mata por path (solo ROT close + lock + WARN).

### Implementación (completada 2026-06-03)

#### ROT-close decision
**MOVIDO al módulo compartido** (`scripts/lib/dysflow-access-com.ps1`). Se movieron:
- `Get-AccessLockFilePath` — antes en vba-manager:1229. Ahora en el módulo.
- `Close-TargetAccessDbIfOpen` — antes en vba-manager:955. Ahora en el módulo.
  - `Write-Status` → `Write-Warning`/`Write-Debug` (vba-manager specific → genérico).
  - El runner puede usar `Close-TargetAccessDbIfOpen` via el módulo dot-sourced sin necesitar una copia local.

**Justificación:** Mover fue limpio. La función solo depende de `Get-AccessLockFilePath` y `Get-MsAccessProcessesBounded`, ambos ya en el módulo. No hay dependencia circular. El cambio de `Write-Status` a `Write-Warning` es un detalle de logging (mismo comportamiento observable). Alternativa (scriptblock runner-local) hubiera duplicado ~150 líneas de C# — innecesario.

#### Qué delegó a la canónica vs qué quedó en el runner

**`Open-CanonicalAccess` ahora maneja en el runner:**
- `New-Object -ComObject Access.Application`
- `AutomationSecurity` capture + set to LOW + restore en close
- Escalera PID de 3 capas (hWnd pre-open, hWnd post-open retry, WMI diff bounded)
- `OpenCurrentDatabase` (cuando `-OpenDatabase:$true`)

**Qué se MANTIENE en el runner (no lo hace la canónica):**
- `Visible = $false` / `UserControl = $false` (runner-specific headless hardening)
- Emisión del marker `DYSFLOW_ACCESS_PROCESS` por stderr (protocolo específico del runner)
- `Disable-StartupFeatures` / `Restore-StartupFeatures` + sentinel
- `$db` DAO release (en finally, antes del cierre canónico)
- `DoCmd.SetWarnings($false)` (solo para el path no-isDirectTargetQuery)

#### isDirectTargetQuery — manejado correctamente
El runner pasa `-OpenDatabase:(-not $isDirectTargetQuery)`. Con `$false`, la canónica spawna COM pero NO llama `OpenCurrentDatabase`. La escalera de PID de 3 capas sigue corriendo (hWnd pre-open, layer 3 diff). El PID se captura y se mata en el close. El DAO engine (`access.DBEngine`) se usa directamente en el runner para la query.

#### Marker `DYSFLOW_ACCESS_PROCESS` — preservado
```powershell
if ($script:accessPid) {
  Write-AccessProcessMarkerFromPid -AccessPid $script:accessPid
} else {
  Write-AccessProcessMarker -Before $before -AccessDbPath $AccessDbPath
}
```
El runner emite el marker usando el PID devuelto por `Open-CanonicalAccess` (`$script:canonicalSession.OwnedPid`). Si es null, cae al fallback WMI diff (Write-AccessProcessMarker), mismo comportamiento que antes.

#### THE FIX — branch null-PID
Antes: `if ($null -eq $pidToKill) { WARN }` — proceso quedaba vivo ~5s.
Ahora: `Close-CanonicalAccess -Session -DbPath -RotCloseAction { Close-TargetAccessDbIfOpen -AccessPath $p }` corre el ROT close + lock-check + WARN en lugar del WARN pelado.

#### Test que pinea el fix
Nuevo describe en `scripts/tests/dysflow-access-runner.Tests.ps1`:
`"Slice 5 fix — null-PID close runs ROT fallback (behavior at the port)"` — verifica:
- OwnedPidKilled=$false (nada se mata)
- UnattributedKilled=$false (invariante)
- RotCloseAction invocada ≥1 vez (el fallback ROT corre)
- No throw

#### Ediciones mecánicas en tests
- `dysflow-access-runner.Tests.ps1` — describe `"Access runner final cleanup ownership guard"`:
  - Test 1 "keeps force cleanup limited to runner-owned PID" → actualizado a verificar que el runner delega a `Close-CanonicalAccess` vía `$script:canonicalSession` y que NO usa el patrón `$pidToKill = $script:accessPid`.
  - Test 2 "warns instead of killing when PID attribution is missing" → actualizado para verificar que el módulo tiene `UnattributedKilled = $false` y el runner pasa `-RotCloseAction`.
  - Test 3 (Write-AccessProcessMarker) → **sin cambio** (función intacta).
- `dysflow-access-com.Tests.ps1` — añadidos 2 tests en "Exported function definitions" verificando que el módulo define `Get-AccessLockFilePath` y `Close-TargetAccessDbIfOpen`.
- `dysflow-vba-manager.Tests.ps1` — describe `"Close-TargetAccessDbIfOpen"`: ahora extrae la función del módulo compartido en vez de vba-manager. BeforeAll del describe de "pure helper functions": carga `Get-AccessLockFilePath` desde el módulo si no está en vba-manager AST.
- `test/scripts-vba-manager.test.ts` — test "Goal B: Close-TargetAccessDbIfOpen delegates to bounded helper": ahora busca en `sharedModule` (ya existía la variable) en vez de `script`.

### Baseline vs post-Slice-5

| Suite | Baseline (pre-Slice-5) | Post-Slice-5 | Delta |
|-------|------------------------|--------------|-------|
| Pester (`scripts/tests/`) | 197 ✅ / 4 skip / 0 ❌ | 200 ✅ / 4 skip / 0 ❌ | +3 (Slice 5 fix test + 2 module struct tests) |
| TypeScript (`pnpm test`) | 845 ✅ / 3 skip / 0 ❌ | 845 ✅ / 3 skip / 0 ❌ | 0 (mecánico actualizado) |

### Estado: LEAK FIX EN PLACE — pendiente confirmación E2E (Slice 6)
El zombie de Clase A (`link_tables`/`relink_tables`/`unlink_table`) ahora corre `Close-CanonicalAccess` con ROT fallback en el path null-PID. Slice 6 debe confirmar end-to-end con Access COM real.
**No se corrió el E2E** (`node E2E_testing/mcp-e2e.mjs`) — requiere `ACCESS_VBA_PASSWORD` + Access COM + build a `test-runtime/`. Ese es el scope de Slice 6.

### Próximos (post-Slice-5)
- Slice 6: limpieza de duplicados muertos + **E2E smoke real** (`node E2E_testing/mcp-e2e.mjs` con build a
  `test-runtime/`, requiere `ACCESS_VBA_PASSWORD` + Access COM). Confirmar que los 6 zombie-check FAIL bajan
  (esperado: link/relink/unlink limpios; list_tables/list_linked_tables/relink_directory eran artefactos de
  atribución Clase B → deberían limpiarse al no quedar proceso lento de Clase A contaminando el check global).

## Comandos útiles

- Ver fallos del reporte: `grep -nE "^\| FAIL" E2E_testing/.dysflow/e2e-report-FAILED-run2.md`
- Funciones del monolito ps1: `grep -nE "^function (Invoke-|Get-|Close-)" scripts/dysflow-vba-manager.ps1`
- Estado SDD: `ls openspec/changes/fix-msaccess-zombies/`

## Nota de proceso

`fix-msaccess-zombies` está mergeado pero NO archivado (sigue en `openspec/changes/`, falta `archive-report.md`).
Si se confirma resuelto, corresponde `/sdd-archive fix-msaccess-zombies`.
