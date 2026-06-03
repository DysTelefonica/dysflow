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
| apply | ✅ Slice 7 corrective apply HECHO (sin commit) | apply-progress #10372 actualizado | Slice 7 (Import) corregido tras verify FAIL; commit/PR pendiente por instrucción |
| verify | ✅ Slice 4 PASS | verify-report.md #10376 | Slice 4 verificado PASS (0 CRITICAL / 0 WARNING) |
| verify | ✅ Slice 5 PASS | verify-report.md | Slice 5 verificado PASS (0 CRITICAL / 0 WARNING) |
| verify | ⏳ pendiente | verify-report.md | Slice 7 requiere verify formal tras corrective apply |
| archive | ⏳ pendiente | `archive-report.md` | |

Leyenda: ✅ hecho · 🔄 en curso · ⏳ pendiente · ⚠️ bloqueado

## Progreso de slices / PRs (propuestos en explore — los confirma tasks)

Dispatcher monolítico en `scripts/dysflow-vba-manager.ps1` líneas 2924-3263 (~340 líneas inline).
Cada slice = 1 PR encadenada (stacked-to-main) ≤400 líneas: extraer `Invoke-*` (vars script-scope → parámetros
explícitos; seams I/O COM/DAO → parámetros) + Pester de comportamiento via AST + reemplazar tests vitest frágiles
(`test/scripts-vba-manager.test.ts`) por wiring change-detectors. Slices 1-3 independientes; 7 (Import) el último.

| # | Slice | Funciones a extraer | Líneas disp. | Est. PR | Riesgo | Estado |
|---|---|---|---|---|---|---|
| 1 | Export | `Invoke-ExportAction` | 2961-3007 | ~250 | Bajo | ✅ **MERGEADO a main** (PR #386, issue #385, checks verdes) |
| 2 | Read-only | `Invoke-ListObjectsAction`, `Invoke-ExistsAction` | 3128-3158 | ~200 | Muy bajo | ✅ **PR #388 abierta** (stacked-to-main, base: main) |
| 3 | ERD | `Invoke-GenerateErdAction` (DAO, sin sesión VBE) | 3204-3240 | ~200 | Bajo | ✅ **PR #390 abierta** (stacked a PR #388) |
| 4 | Delete | `Invoke-DeleteAction` | 3099-3126 | ~200 | Bajo | ✅ **PR #392 abierta** (stacked a PR #390) |
| 5 | Compile/Run | `Invoke-CompileAction`, `Invoke-RunProcedureAction` | 3160-3202 | ~250 | Bajo | ✅ **S5 implementado en rama `refactor/decompose-vba-manager-s5-compile-run`** |
| 6 | Tests/Encoding | `Invoke-RunTestsAction`, `Invoke-FixEncodingAction` | 3174-3258 | ~250 | Bajo-medio | ✅ **implementado localmente en rama `refactor/decompose-vba-manager-s5-compile-run` (sin commit)** |
| 7 | Import | `Invoke-ImportAction` (retry loop + created-components return signal) | 3008-3097 | ~400 | Medio | ✅ **corrective apply local en main (sin commit); verify formal pendiente** |

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
7. Criterio final pedido por usuario: terminar con PRs/issues cerrados, todo pusheado, nueva release publicada con
   título exactamente igual al tag/name, y E2E real pasando sin dejar zombies de MSACCESS.

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
- **2026-06-02** — Issue #385 creado (type:refactor + status:approved) y **PR #386 abierto** (base main, stacked-to-main).
  Commit docs con artefactos SDD añadido. Checks CI corriendo. Recordá: cero cambios de comportamiento (ver engram
  `decision/refactor-de-descomposici-n-vba-manager-preservar-comportamiento`).
- **2026-06-02** — **PR #386 MERGEADO a main** (`feaffaa`, ambos checks verdes: Quality gates + Windows smoke).
  Rama borrada, main local sincronizado. **Slice 1 ✅ COMPLETO.** Próximo: Slice 2 (`Invoke-ListObjectsAction` +
  `Invoke-ExistsAction`) desde main. Este HANDOFF.md quedó como cambio local (no se puede pushear directo a main por
  branch protection); se incluirá en el commit docs del PR del Slice 2.
- **2026-06-02** — **Slice 2 (Read-only actions) completado**. Implementadas `Invoke-ListObjectsAction` y `Invoke-ExistsAction` usando TDD estricto. Pruebas Pester con extracción AST y stubs añadidas. Pruebas Vitest con wiring change-detectors añadidas. Total de líneas del diff: 223, bien por debajo del límite de 400. Todo verde localmente. Listo para verificar y enviar PR del Slice 2.
- **2026-06-02** — **Slice 2 Verificación completada PASS**. 142 pruebas Pester y 835 pruebas Vitest pasadas con éxito. Se generó el informe de verificación y se guardó en engram y openspec. Próximo paso: abrir PR de Slice 2.
- **2026-06-02** — **PR #388 creada** (Slice 2) vinculada al issue #387. Commits: e76508d (test), d95f21b (refactor), b4139d9 (docs). Pushed y PR abierta.
- **2026-06-02** — **Slice 3 (Generate-ERD) completado**. Implementada `Invoke-GenerateErdAction` usando TDD estricto. Pruebas Pester con extracción AST, mocked stubs, y de-coupling de COM añadidas. Pruebas Vitest con wiring change-detectors añadidas. Total de líneas del diff: 209 (173+, 36-), bien por debajo del límite de 400. Todo verde localmente. Listo para verificar y enviar PR del Slice 3.
- **2026-06-02** — **Slice 3 Verificación completada PASS**. 145 pruebas Pester y 836 pruebas Vitest pasadas con éxito. Se generó el informe de verificación y se guardó en engram y openspec. Próximo paso: abrir PR de Slice 3.
- **2026-06-02** — PR #390 creada (Slice 3) vinculada al issue #389. Commits: b05acca (test), f0c0d5a (refactor), 44fb4d5 (docs). Pushed y PR abierta stacked a `refactor/decompose-vba-manager-s2-list-exists`.
- **2026-06-02** — **Slice 4 (Delete action) completado**. Implementada `Invoke-DeleteAction` usando TDD estricto. Pruebas Pester con extracción AST, stubbing de COM/Remove action, y aserción de acumulación de errores para borrados parciales añadidas. Pruebas Vitest con wiring change-detectors añadidas. Total de líneas del diff: 178 (152+, 26-), bien por debajo del límite de 400. Todo verde localmente. Listo para verificar.
- **2026-06-02** — **Slice 4 Verificación completada PASS**. 148 pruebas Pester and 837 pruebas Vitest pasadas con éxito. Se generó el informe de verificación y se guardó en engram y openspec. Próximo paso: abrir PR de Slice 4.
- **2026-06-02** — **PR #392 creada** (Slice 4) vinculada al issue #391. Commits: 5923f2b (test), 42cf477 (refactor), [docs committed next]. Pushed y PR abierta stacked a `refactor/decompose-vba-manager-s3-generate-erd`.
- **2026-06-02** — **Slice 5 (Compile + Run-Procedure) completado**. Implementadas `Invoke-CompileAction` e `Invoke-RunProcedureAction` usando TDD estricto. Commits: `fd25418` (RED Pester/Vitest) y `43d22be` (refactor). Verificación local PASS: Pester/Vitest verdes; 0 CRITICAL / 0 WARNING. Pendiente inmediato: push + PR stacked a #392, luego re-aplicar WIP S6/S7 preservado en `stash@{0}`.
- **2026-06-02** — **Slice 6 (Run-Tests + Fix-Encoding) implementado localmente sin commit**. Se añadieron fixtures de encoding (`scripts/tests/fixtures/ansi-sample.bas`, `utf8bom-original.bas`, `utf8nobom-expected.bas`), Pester behavior-first para `Invoke-RunTestsAction`/`Invoke-FixEncodingAction`, byte-level UTF-8 NoBOM via `Invoke-FixEncodingAction -Location Src`, y wiring Vitest S6. Se extrajeron ambas funciones con parámetros explícitos y `[ref]$session` para preservar el cierre del router `finally`. Verificación: `pnpm test:ps1` PASS (153/0/4) y `pnpm test` PASS (841/0/3). Diff budget: 248+/78- en 3 tracked files + 3 fixtures pequeñas; commit/PR pendiente por instrucción de no commitear.
- **2026-06-02** — **Slice 6 corrective apply tras verify FAIL**. Corregido `Invoke-RunTestsAction`: `ProceduresJsonFile` no usa `Test-Path`; si viene no vacío intenta `Get-Content` y no cae al JSON inline. Añadida prueba RED→GREEN para esa regresión. `ansi-sample.bas` ahora se ejercita byte-a-byte con `Convert-AnsiToUtf8NoBom`; el spec queda alineado al contrato real de `Fix-Encoding -Location Src` (quita BOM UTF-8, no convierte ANSI). Vitest wiring fortalecido: los checks S1-S6 ahora miran el cuerpo del arm del dispatcher, no definiciones de función. Targeted PASS: Pester 155/0/4, Vitest `test/scripts-vba-manager.test.ts` 14/0.
- **2026-06-02** — **Slice 7 (Import) implementado localmente sin commit tras PR #396 merge a main**. Baseline verde: `pnpm test:ps1` 155/0/4 y `pnpm test` 841/0/3. RED confirmado: Pester falló por `Invoke-ImportAction not found`; Vitest falló porque el arm Import aún no delegaba. Se extrajo `Invoke-ImportAction` con parámetros explícitos, retry loop y `##MODULE_RESULTS`; el router elimina `$importCreatedNewComponents` y usa `CreatedComponentNames` para llamar `Save-VbaProjectModules`. Agregada verificación byte-level de `Convert-Utf8ToAnsiTempFile` para el path Import y limpieza final de `script.split("\n")` en `test/scripts-vba-manager.test.ts`. Final GREEN: `pnpm test:ps1` 160/0/4, `pnpm test` 842/0/3, `git diff --check` limpio excepto warnings LF→CRLF.
- **2026-06-02** — **Slice 7 corrective apply tras verify FAIL**. Verify detectó drift observable: `Invoke-ImportAction` emitía `OK Import completado` antes de que el router intentara `Save-VbaProjectModules`, permitiendo falso OK si fallaba el save de componentes recién creados. Se agregó cobertura RED→GREEN: Pester prueba que `Invoke-ImportAction` devuelve `CreatedComponentNames` sin emitir el OK final; Vitest prueba que el arm Import guarda antes de emitir el OK. Fix: mover el OK final al router después de `Save-VbaProjectModules`. Targeted GREEN: `pnpm test:ps1` 161/0/4 y `pnpm vitest run test/scripts-vba-manager.test.ts` 16/0. Required final apply verification PASS: `pnpm test:ps1` 161/0/4, `pnpm test` 843/0/3, `git diff --check` sin errores (solo warnings LF→CRLF). Formal SDD verify pendiente.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `fd25418` | RED tests for Compile/Run-Procedure extraction | S5.2, S5.3 | Pester/Vitest RED→GREEN cycle completed locally | N/A |
| `43d22be` | Extract `Invoke-CompileAction` + `Invoke-RunProcedureAction` | S5.4, S5.5, S5.6 | Local Pester/Vitest PASS; SDD verify Slice 5 PASS | N/A |
| _uncommitted_ | Extract `Invoke-RunTestsAction` + `Invoke-FixEncodingAction`; corrective verify fixes | S6.1-S6.8 | `pnpm test:ps1` PASS; `pnpm test` PASS; corrective targeted Pester/Vitest PASS | N/A |
| _uncommitted_ | Extract `Invoke-ImportAction`; final wiring cleanup; corrective save-before-OK fix | S7.1-S7.8 + corrective verify FAIL fix | Baseline Pester/Vitest PASS; RED Pester/Vitest confirmed; corrective RED reproduced; targeted GREEN `pnpm test:ps1` PASS (161/0/4) and Vitest PASS (16/0); required final apply verification PASS; formal SDD verify pending | N/A |
