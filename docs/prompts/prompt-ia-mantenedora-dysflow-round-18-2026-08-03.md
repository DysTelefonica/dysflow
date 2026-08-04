# Round 18 — Auditoría de código vivo

Sos la IA mantenedora de dysflow MCP. Repo: `DysTelefonica/dysflow`. Versión actual: **2.34.0** (`main` @ `8e1f6b81`).

Este round **es un bug-hunt**, no una épica. Seis hallazgos atómicos salidos de leer el código y correr los gates, cada uno con su issue y su evidencia. Épica paraguas: **#1359**.

Todo lo que sigue está verificado contra `main` @ `8e1f6b81`. Nada es especulación.

---

## 0. Baseline medido antes de filar

```
pnpm test (unit)   →  422 files, 5144 passed, 1 skipped, 1 todo, 276.22s
tsc -p tsconfig.json --noEmit        →  clean
tsc -p tsconfig.test.json --noEmit   →  clean
check-core-adapter-boundary.mjs      →  pass
check-optional-presence-guards.mjs   →  pass
report-ts-import-cycles.mjs --check  →  pass
```

Si tu primera corrida no reproduce estos números, pará y decilo antes de tocar nada.

---

## 1. Lo que YA funciona — NO romper

Esto se verificó en la auditoría y es la base sobre la que trabajás:

**Arquitectura**
- `src/core` tiene **cero** imports de `src/adapters`. Verificado por `scripts/check-core-adapter-boundary.mjs` (checker AST, corre en `pnpm lint`). Debe seguir siendo cero.
- Dependencias: `@modelcontextprotocol/sdk` + `zod`. **No sumar ninguna** en este round.
- Baseline de ciclos de import no crece nunca. Achicarlo va por el flag guardado `--update-baseline` (#1137) con `reviewedAt` refrescado.

**Política de escritura (núcleo de #1353 — tocalo con cuidado)**
- `DEFAULT_DRY_RUN_TABLE` como única tabla de verdad (modo × riesgo), y `effectiveDryRunDefaultForTool` como su único lector (`mcp-tool-risks.ts:329-342`). El guard anti-divergencia de #790 se queda.
- La intención explícita del caller siempre gana: `Object.hasOwn(record, "dryRun") || Object.hasOwn(record, "apply")` devuelve verbatim (`write-execution-dispatch.ts:117`).
- `apply` como commit flag canónico (#1167). Gate `allowWrites` y semántica de `MCP_WRITES_DISABLED`.
- `get_capabilities.effectiveDryRunDefault` debe seguir reportando exactamente lo que el dispatch aplica (contrato #785 capa 5).
- El guard build-time `_everyContractCovered` (`mcp-tool-risks.ts:349-359`).

**Testing**
- `maxWorkers: 1` para todo lo que pueda spawnear. El `spawn UNKNOWN` / errno `-4094` que previene está documentado en `vitest.config.ts` y no es teórico.
- `testTimeout` / `hookTimeout` de 15s (GH #375). `forbidOnly: true`.
- Umbrales de coverage y el buffer de `branches: 78` — no los subas de oportunidad en este round.

**Contratos y reglas cross-project**
- `compile_vba` no existe y no vuelve. El humano compila.
- Nunca matar `MSACCESS.EXE` genéricamente.
- `.gitattributes`: `*.accdb binary` y los `-text` de `.bas`/`.cls`/`.frm`/`.form.txt`/`.form.json`. **No tocar** — el clasificador semántico y el read-back comparan bytes.
- Ningún nombre de tool, input schema ni result contract cambia en este round. El único efecto visible al consumidor es el de #1353: que un preview siga siendo un preview.

---

## 2. Los seis hallazgos

### #1353 — `high` · el único con consecuencia de runtime

El invariante que decide **si una llamada pensada como preview escribe de verdad en el `.accdb`** vive en tres listas paralelas mantenidas a mano:

1. `BASE_MCP_TOOL_ROUTES` — `src/adapters/mcp/dispatch-routes.ts:63`
2. `isDryRunCapableBinaryWrite` — `src/adapters/mcp/dispatch-factory.ts:160-202` (cadena de `name === "…"`)
3. `POLICY_EXEMPT_TOOLS` — `src/adapters/mcp/write-execution-dispatch.ts:52-93`

El código documenta el peligro **cuatro veces** (`dispatch-routes.ts:273`, `:299`, `:323`; `vba-forms-adapter.ts:101`). **#813, #872, #816 y #809 son el mismo defecto cayendo cuatro veces en cuatro tools distintas.**

Y ningún test lo deriva del route table: `write-execution-dispatch.test.ts:77` y `:134` iteran arrays literales; `capabilities-effective-default-consistency.test.ts:27-36` usa un `samples` explícito; `dispatch-routes-risk.test.ts:49+` es un `Record` hardcodeado.

Hallazgo secundario, en el issue: el comentario de `write-execution-dispatch.ts:48-51` afirma espejar la lista 2 y **no lo hace** (le faltan `fix_encoding` y `vba_inline_execution`). Hoy es inocuo, y **la razón importa para el fix**: solo `routine-dev-write` se voltea, así que `POLICY_EXEMPT_TOOLS` no es "el espejo de la lista 2" sino *"las `routine-dev-write` que igual deben planificar por default"* — una propiedad **derivable**. No parchees el comentario: hacé desaparecer la lista.

**Palanca del fix:** `BASE_MCP_TOOL_ROUTES` ya es un `Record<GeneratedDispatchToolName, McpToolRouteBase>` exhaustivo. Agregar un campo **requerido** a la variante `vba-sync` convierte cada omisión en **error de compilación**. El nombre lo elegís vos; la restricción es *un solo sitio de declaración, verificado por el compilador*.

### #1354 — `medium` · seis `catch {}` mudos en el descubrimiento de worktrees

`src/core/config/dysflow-config.ts` líneas 357, 406, 456, 502, 556, 660. Sin comentario que registre intención. Es el camino detrás de `resolve_project`, `get_capabilities().projectConfig` y la recuperación HR-11: un ACL denegado o un `project.json` corrupto hace desaparecer el candidato sin causa, y puede rutear al agente hacia `setup_project` bootstrap **sobre un directorio que ya tenía config**. Prior art: #327, #478.

### #1355 — `low` · gemelos sync/async en `dysflow-config.ts`

`discoverWorktreeProjectConfigs` (`:318`) / `…Async` (`:414`), y `loadDysflowConfigWith` (`:515`) / `loadDysflowConfigAsyncWith` (`:619`). ~400 de 1426 líneas duplicadas, difieren solo en `await` y `existsSync`/`existsAsync`. Tres de los seis catches de #1354 están en el gemelo sync y tres en el async — arreglás uno y el otro queda roto en silencio.

### #1356 — `medium` · ciclo de 18 módulos en `adapters/mcp`

El baseline (`reviewedAt: 2026-07-27`) acepta un SCC de 18 módulos en `adapters/mcp` y otro de 14 en `vba-sync`. Costos medidos: agregar **una** tool toca ~11 archivos de `src` (medido sobre `form_duplicate_control` y `form_list_controls`); los `feat` recientes cambiaron 31, 30, 15 y 12 archivos; el churn top de los últimos 200 commits está todo dentro del componente. #1119 ya estableció el patrón de fachada acíclica.

### #1357 — `medium` · 2.6 GB de `.git` — **solo medición y plan**

59 commits con revisiones de `NoConformidades.accdb` (58/57/54/44 MB). **La fuga ya está cerrada**: `git ls-files '*.accdb'` no devuelve nada, `.gitignore:26` y `:30` lo cubren. Queda el peso histórico. **No reescribas historia.** Medí, verificá que nada vivo referencie commits a reescribir, escribí el plan y la checklist de coordinación, y recomendá — incluido "no hacer nada" si esa es la conclusión honesta.

### #1358 — `low` · 276s de unit run

`maxWorkers: 1` se aplica hoy a los 422 archivos, incluidos los que nunca spawnean. Referencia: `test/architecture` + `test/quality-gates` = 37 archivos / 257 tests / 27.79s. `import` solo son 58.84s de los 276. Partí en shard puro (paralelo) + shard serial (sin cambios), con **membresía derivada y verificada por un gate**, no listada a mano — si no, es otra lista que driftea. Secundario: la suite filtra stderr suelto (`HTTP server starting in degraded mode`, `sendProgress error`); afirmá el diagnóstico donde se provoca, no silencies la consola global.

---

## 3. Disciplina

- **TDD.** Test RED primero, commiteado **antes** del fix, en commit separado.
- **Un refactor no cambia comportamiento.** #1355 y #1356 son movimientos puros. Si la suite se pone roja en un movimiento puro, reportá el test acoplado como hallazgo — no lo edites para que entre en el mismo PR. El criterio de `docs/testing/testing-philosophy.md` manda.
- **Un PR por issue.** #1356 puede partirse en varios cortes; preferí varios PRs revisables a uno de 40 archivos.
- Conventional commits. Sin líneas de atribución a IA.
- Branch sugerida por issue (confirmala vos): `fix/plan-by-default-single-source`, `fix/surface-worktree-discovery-io-errors`, `refactor/dedupe-config-sync-async-twins`, `refactor/mcp-adapter-cycle-decomposition`, `docs/git-history-size-assessment`, `test/split-spawn-free-shard`.
- Todo cambio de superficie de runtime alinea skills, ejemplos, punteros y `AGENTS.md` (regla desde round 14). En este round solo #1353 podría calificar.

## 4. Orden sugerido

1. **#1353 primero** — único riesgo de correctitud, y autocontenido.
2. **#1355, después #1354** — tocan los mismos cuerpos. El harness de paridad de #1355 es la red que hace demostrable el fix de #1354 en ambos caminos. Harness primero, cambio de comportamiento después, commits separados.
3. **#1356**, **#1358**, **#1357** — independientes, en el orden que prefieras.

Nada bloquea a nada. El orden es economía de revisión, no dependencia.

## 5. Contexto cross-round

- Round 17 (épica Runtime Autonomy) y **#1230** siguen abiertos. Este round **no** los toca ni depende de ellos.
- #1351 y #1352 (`setup_project`) abiertos y no relacionados.
- #1118 / #1137 / #1119 establecieron el gate de ciclos y el patrón de fachada que #1356 extiende.

## 6. Quick start

```bash
gh issue view 1359 --repo DysTelefonica/dysflow          # épica del round
gh issue view 1353 --repo DysTelefonica/dysflow          # arrancá por acá

pnpm install
pnpm lint
pnpm test                                                 # baseline: 5144 passed, ~276s

# Evidencia del hallazgo principal:
rg -n "isDryRunCapableBinaryWrite|POLICY_EXEMPT_TOOLS" src
rg -n "in lockstep" src
node scripts/report-ts-import-cycles.mjs
```

## 7. Acceptance output

Por cada issue:

- Rama propia, tests RED en commit separado y previo.
- Suite completa verde con los mismos totales (`5144 passed | 1 skipped | 1 todo`) salvo los tests nuevos.
- `pnpm lint` limpio (incluye los tres gates estructurales + biome + doble `tsc`).
- Entrada de CHANGELOG.
- Version bump según la política de release del repo.
- PR que cierra su issue y referencia **#1359**.

Si algo de este round está mal diagnosticado, **decilo antes de implementar**. El objetivo es el arreglo correcto, no validar el borrador.
