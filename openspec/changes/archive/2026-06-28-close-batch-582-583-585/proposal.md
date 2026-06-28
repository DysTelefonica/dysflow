# Proposal: Close #582, #583, #585 — MCP E2E safety + behavior-contract Pester tests

## Intent

Cerrar tres issues de la rama `main` con scope acotado y contrato claro, todos en un solo change SDD. El release policy de dysflow es `main-only` directo (Engram #14611), así que no hay staging ni PRs en este flujo.

- **#582** `fix(e2e): require explicit test-runtime command for MCP E2E` — `E2E_testing/mcp-e2e.mjs:14` defaultea a `%LOCALAPPDATA%\dysflow\bin\dysflow.cmd` (runtime de PRODUCCIÓN) mientras `:25` setea `DYSFLOW_HOME` al `test-runtime` del repo, mezclando runtimes y rompiendo las reglas de isolation. Aceptación: el E2E rechaza el runtime de producción por default O defaultea al `test-runtime` built; el README documenta el setup; un guard previene el uso accidental de `%LOCALAPPDATA%\dysflow`.
- **#583** `fix(e2e): prevent MCP harness hangs after response cleanup` — el harness de MCP E2E crea un timeout (`:107-109`), lo limpia y mata al proceso tras recibir la respuesta (`:126-130`), pero la promesa sólo se resuelve en el evento `close` (`:134-143`). Si el child no cierra, la promesa cuelga para siempre. Aceptación: no hay hang indefinido tras capturar la respuesta; cleanup sigue siendo best-effort; un regression test cubre el caso de child que no cierra.
- **#585** `refactor(test): replace implementation-coupled PowerShell tests with behavior contracts` — varios Pester tests inspeccionan texto de fuente, orden de sentencias, y nombres de funciones (`scripts/tests/dysflow-vba-manager.Tests.ps1:66-82`, `scripts/tests/dysflow-access-runner-result-coverage.Tests.ps1:248-264`, `scripts/tests/dysflow-access-com.Tests.ps1:50-72`), violando la filosofía de testing del repo (`docs/testing/repo-quality-gates.md:44-57`). Aceptación: ningún behavior test assertea texto/orden del cuerpo de scripts PowerShell; behavior contracts equivalentes cubren los mismos riesgos; la extracción por AST queda sólo como loader.

## Scope

### #582 — explicit test-runtime command

In scope:
- `E2E_testing/mcp-e2e.mjs`: si `DYSFLOW_E2E_COMMAND` está seteado, usarlo; si no, default a `<repoRoot>/test-runtime/bin/dysflow.cmd` cuando exista; si la única ruta disponible apunta a `%LOCALAPPDATA%\dysflow`, abortar con un error claro (`MCP_E2E_REFUSES_PRODUCTION_RUNTIME`); si no hay runtime utilizable, abortar con un error que liste los paths buscados.
- Helper puro extraído a `E2E_testing/_helpers/resolve-mcp-e2e-command.mjs` para mantener el guard testeable sin spawn.
- README sección "MCP E2E — local test-runtime" describiendo `pnpm build` → test-runtime disponible + `DYSFLOW_E2E_COMMAND` opcional para override.
- Quality gate: `test/quality-gates/mcp-e2e-command.test.ts` lee `mcp-e2e.mjs` como texto y verifica que el default NO es la cadena `%LOCALAPPDATA%\dysflow` sin override, que el guard existe, y que la firma del helper es la correcta.

Out of scope:
- Re-arquitectura del runner o del spawn loop.
- Cambiar otros scripts E2E (legacy `e2e-cli`, `e2e-mcp` si existen) — el issue nombra sólo `mcp-e2e.mjs`.

### #583 — MCP harness no-hang

In scope:
- `E2E_testing/mcp-e2e.mjs`: introducir un segundo watchdog (`closeWatchdogMs`, default 5000 ms) que se arma al capturar la respuesta y garantiza que `finish` se llama una vez pasado ese plazo aunque `close` nunca llegue. El timer original (`timeoutMs`) sigue siendo el límite superior de espera de respuesta. `finish` es `settled`-guarded, así que el doble disparo es seguro.
- Helper puro extraído a `E2E_testing/_helpers/extract-mcp-finish-guards.mjs` (o equivalente testeable) que verifica que el código de harness contiene las primitivas necesarias (timer armado tras response, timer armado al inicio, settled guard, kill on settle) sin acoplar al orden textual exacto.
- Quality gate + integration test: `test/e2e/mcp-harness-watchdog.e2e.test.ts` con un child mockeado que NO emite `close`. El test verifica que `callMcp` resuelve dentro de `closeWatchdogMs + slack` y devuelve la respuesta capturada.

Out of scope:
- Cambiar el comportamiento de la respuesta OK o del cleanup del proceso (eso ya está cubierto por tests existentes — `zombie-check`, `lingering-access-check`).
- Cambiar el contrato JSON-RPC o el framing.

### #585 — behavior-contract Pester tests

In scope (1:1 replacement, mantener count Pester en 374):
- `scripts/tests/dysflow-access-com.Tests.ps1:50-72` (8 `It "defines X"`) → 8 `It "X is callable after dot-source"`. Mismo Describe / Context, mismo conteo.
- `scripts/tests/dysflow-vba-manager.Tests.ps1:66-82` (2 text-asserts) → 2 behavior contracts sobre helpers extraídos del script:
  - OutputEncoding → `Set-ScriptOutputEncodingUtf8` (helper en `scripts/dysflow-vba-manager.ps1`): test que lo llama y verifica `[Console]::OutputEncoding.CodePage` es 65001.
  - Name en ambas ramas → `Set-VbComponentNameSafe -Component $mock -Name $name` (helper nuevo en `scripts/dysflow-vba-manager.ps1`): test que lo llama con un PSCustomObject con setter `Name` y verifica que se asignó. `New-VbComponentFromCodeFile` se refactoriza para llamar al helper en ambas ramas (CopyObject y Add) — cambio mínimo, no toca encoding, no toca resolución de paths, no toca loops.
- `scripts/tests/dysflow-access-runner-result-coverage.Tests.ps1:248-264` (1 test de orden textual) → 1+ behavior tests sobre `Resolve-ReadActionTargetPath` (helper puro nuevo extraído de `Resolve-ReadActionDatabase` en `scripts/dysflow-access-runner.ps1`): prioridad `databasePath` > `sourcePath` > `backendPath` > vacío (return `$null` / handled by caller). El orden del bloque textual deja de ser el contrato; el contrato es el comportamiento de la función pura.

Out of scope:
- Re-arquitectura del test runner o de Pester.
- Cambiar las funciones de encoding (protegidas por commit `3fbd60a`).
- Tocar otros archivos de test que NO estén listados en el issue.

## Non-Goals

- No se introduce staging ni PRs. La release policy de dysflow es `main-only` directo (Engram #14611).
- No se reabren los commits del SDD archive previo (`openspec/changes/archive/`).
- No se tocan funciones de encoding (protegidas por el commit `3fbd60a`).
- No se rompen los baselines: Vitest 1687/1687, Pester 374/0/4, branches coverage ≥ 78.
- No se agrega staging, no se abren PRs, no se usa `--no-verify`, `--force`, ni force-push.
- No se introduce dialecto rioplatense en el reply al usuario (output técnico en inglés por defecto; castellano de España si el usuario lo pide explícitamente).

## Approach

Workflow SDD formal con strict TDD, **un commit por issue + un commit de `tasks.md` traceability + un commit de archive** = 5 commits directos a `main`, replicando el patrón del batch previo `close-batch-562-580-591` y `close-batch-575-576-578`.

Para cada issue:

1. **RED**: escribir el test que falla con el código actual.
2. **GREEN**: cambio mínimo que lo hace pasar sin tocar nada fuera del scope.
3. **Triangulación**: si la spec define más de un scenario, agregar tests adicionales que ejercen los otros escenarios.
4. **Refactor**: limpieza sin cambiar contratos observados.
5. **Verificación local**: `pnpm test --run`, `pnpm build`, `pnpm lint`, `pwsh -Command "Invoke-Pester scripts/tests/"`. No debe romper baselines.
6. **Commit + push a main**: convención `fix(<scope>): <descripción> (#<issue>)` con línea `SDD: close-batch-582-583-585` y ref a la issue. **No** Co-Authored-By. **No** --no-verify. **No** --force.

Después de los tres fixes:

7. **Verify CI final**: `gh run list --branch main --limit 1` debe estar verde. Si cualquier run falla, **DETENERSE** y reportar.
8. **Archive**: mover el change a `openspec/changes/archive/2026-06-28-close-batch-582-583-585/`, escribir `archive-report.md`, commit + push.
9. **Close issues**: `gh issue close` con comentario de traceability (commit SHA + test module + manifest path), uno por issue. UTF-8 via `--body-file` para evitar problemas de acentos en PowerShell.

## Affected Capabilities

- `mcp-e2e-test-runtime` — E2E command resolution + guard + README (#582)
- `mcp-e2e-cleanup` — watchdog timer + regression test for non-closing child (#583)
- `pester-test-contract` — behavior contracts sobre helpers extraídos + removal of source-text asserts (#585)
