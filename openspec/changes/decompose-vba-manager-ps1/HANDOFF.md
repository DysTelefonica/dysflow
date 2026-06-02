# HANDOFF — decompose-vba-manager-ps1

> **Propósito**: registro vivo de progreso para que CUALQUIER agente (humano o IA) retome el trabajo
> si la sesión se corta. Se actualiza al cerrar cada fase y cada slice/PR.
> El detalle accionable con checkboxes vive en `tasks.md` (fase tasks).

## Objetivo

Descomponer `scripts/dysflow-vba-manager.ps1` (~3.263 líneas, dispatcher monolítico `if/elseif`) en
funciones `Invoke-*` testeadas, **sin cambiar comportamiento observable**. Es la debilidad #1 del
informe FODA: lógica de negocio crítica con cobertura Pester estructural/pobre. Estrategia: extracción
incremental, TDD-first (Pester de comportamiento por función ANTES de extraer), un grupo de funciones
por PR encadenada ≤400 líneas.

## Configuración de la sesión (cacheada)

| Parámetro | Valor |
|---|---|
| Artifact store | `hybrid` (engram + archivos openspec) |
| Execution mode | `automatic` |
| Delivery strategy | `auto-chain`, PR ≤ 400 líneas |
| Chain strategy | `stacked-to-main` |
| TDD | **estricto** (test primero; ver docs/testing/testing-philosophy.md) |

## RESTRICCIÓN DURA (no negociable)

NUNCA tocar el runtime de producción: `%LOCALAPPDATA%\dysflow` ni el MCP de OpenCode
(`~/.config/opencode/opencode.json`). Build a `test-runtime/`, E2E con `DYSFLOW_E2E_COMMAND`.
Esta máquina ES Windows 11 → `pnpm test:ps1` (Pester) corre localmente para validar cada extracción.

## Principio rector del refactor

North star de testing-philosophy.md: **un test debe sobrevivir cualquier refactor interno que preserve
comportamiento**. La descomposición es exactamente eso: el comportamiento del script NO cambia; solo
se reorganiza en funciones. Cada `Invoke-*` extraído debe quedar cubierto por Pester de comportamiento
(via AST extraction como hizo P6), NO por asserts de texto frágiles.

## Estado de fases SDD

| Fase | Estado | Artefacto | Notas |
|---|---|---|---|
| explore | ✅ HECHO | `sdd/decompose-vba-manager-ps1/explore` | 3263 líneas, 100% monolítico (dispatcher 2924-3263). 7 slices propuestos. Patrón P6 documentado |
| propose | ✅ HECHO | `proposal.md` + engram #10367 | Refactor puro, 7 PRs stacked-to-main, patrón P6 |
| spec | ✅ HECHO | `specs/vba-manager-actions/spec.md` + engram #10368 | Contrato observable de las 10 acciones |
| design | ✅ HECHO | `design.md` + engram #10370 | Tabla de firmas Invoke-*; Import devuelve result object (no flag) |
| tasks | ✅ HECHO | `tasks.md` + engram #10371 | 49 tareas en 7 slices. Forecast: chained=Yes, S7 risk High |
| apply | ✅ Slice 1 | `apply-progress` #10372 | **Slice 1 (Export)** rama `refactor/decompose-vba-manager-s1-export`, 2 commits, sin push. Behavioral delta CORREGIDO → refactor puro (try/catch removido, spec+Pester alineados, verificado vs main por orquestador) |
| verify | ✅ Slice 1 PASS | `verify-report.md` #10376 | 0 CRITICAL/0 WARNING. Behavior-preserving confirmado vs main. vitest 3x verde estable |
| verify | ⏳ pendiente | `verify-report.md` | |
| archive | ⏳ pendiente | `archive-report.md` | |

Leyenda: ✅ hecho · 🔄 en curso · ⏳ pendiente · ⚠️ bloqueado

## Progreso de slices / PRs (propuestos en explore — los confirma tasks)

Dispatcher monolítico en `scripts/dysflow-vba-manager.ps1` líneas 2924-3263 (~340 líneas inline).
Cada slice = 1 PR encadenada (stacked-to-main) ≤400 líneas: extraer `Invoke-*` (vars script-scope → parámetros
explícitos; seams I/O COM/DAO → parámetros) + Pester de comportamiento via AST + reemplazar tests vitest frágiles
(`test/scripts-vba-manager.test.ts`) por wiring change-detectors. Slices 1-3 independientes; 7 (Import) el último.

| # | Slice | Funciones a extraer | Líneas disp. | Est. PR | Riesgo | Estado |
|---|---|---|---|---|---|---|
| 1 | Export | `Invoke-ExportAction` | 2961-3007 | ~250 | Bajo | ✅ verificado — LISTO PARA PR #1 |
| 2 | Read-only | `Invoke-ListObjectsAction`, `Invoke-ExistsAction` | 3128-3158 | ~200 | Muy bajo | ⏳ |
| 3 | ERD | `Invoke-GenerateErdAction` (DAO, sin sesión VBE) | 3204-3240 | ~200 | Bajo | ⏳ |
| 4 | Delete | `Invoke-DeleteAction` | 3099-3126 | ~200 | Bajo | ⏳ |
| 5 | Compile/Run | `Invoke-CompileAction`, `Invoke-RunProcedureAction` | 3160-3202 | ~250 | Bajo | ⏳ |
| 6 | Tests/Encoding | `Invoke-RunTestsAction`, `Invoke-FixEncodingAction` | 3174-3258 | ~250 | Bajo-medio | ⏳ |
| 7 | Import | `Invoke-ImportAction` (retry loop + flag `$importCreatedNewComponents`) | 3008-3097 | ~400 | Medio | ⏳ |

**Riesgos clave** (de explore): (1) vars script-scope implícitas → SIEMPRE pasar como parámetros explícitos;
(2) Import devuelve `CreatedNewComponents` que dispara `Save-VbaProjectModules`; (3) pipeline encoding ANSI↔UTF-8
de `.bas/.cls` no debe regresionar (mojibake); (4) `RotManager` C# (`Close-TargetAccessDbIfOpen` 970-1153) es
session-scoped, no mover/duplicar; (5) baseline `pnpm test:ps1` + `pnpm test` debe estar VERDE antes de cada slice.

## Cómo retomar si te quedás a medias

1. Leé este HANDOFF y la tabla de fases.
2. Contexto SDD: engram `mem_search("sdd/decompose-vba-manager-ps1/<fase>")` → `mem_get_observation(id)`.
3. Init del proyecto: engram `mem_search("sdd-init/dysflow")`.
4. Continuá por la primera fase ⏳ respetando dependencias.
5. En apply: implementá SOLO el siguiente slice autónomo (work-unit commits), PR ≤400, valida con `pnpm test:ps1` + `pnpm test`.
6. Respetá SIEMPRE la RESTRICCIÓN DURA y el TDD estricto.

## Bitácora

- **2026-06-02** — Change creado tras descartar `fix-windows-ci-smoke` (CI ya verde). Lanzada fase explore.
- **2026-06-02** — Pipeline SDD completo: explore→propose→spec→design→tasks (49 tareas/7 slices).
- **2026-06-02** — Slice 1 (Export) implementado con TDD. **Detectado y corregido** un behavioral delta: el primer
  intento envolvió `Export-VbaModule` en try/catch (suprimía errores → cambio de comportamiento). Por decisión del
  usuario se preservó el comportamiento original (abort al primer error). spec + Pester alineados a la conducta real.
- **2026-06-02** — Slice 1 verificado PASS (0 CRITICAL/0 WARNING). Rama `refactor/decompose-vba-manager-s1-export`,
  2 commits, **NO pusheado**. Próximo: crear PR #1 (stacked-to-main, base main) → tras merge, Slice 2 desde main.
- **Nota entorno**: el `exit code 1` de los comandos Bash es ruido del harness (temp-cwd inexistente), NO fallo real.
  Para leer el exit real de un comando, capturar `$?`/`${PIPESTATUS[0]}` antes del wrapper.
