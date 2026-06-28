# Proposal: Close #562, #580, #591 — integration serial, CI test refs, --help consistency

## Intent

Cerrar tres issues de tipo `bug` / `tech-debt` con scope acotado y contrato claro:

- **#562** `test(integration): run Access COM E2E serially + clean temp sandboxes (flaky parallel contention)` — la suite `vitest.integration.config.ts` falla de forma intermitente por contención del COM de Access (ROT + `.laccdb`) cuando múltiples archivos de test corren en paralelo, y los `dysflow-*` workspaces en `%TEMP%` se acumulan sin limpieza confiable. Aceptación del issue: suite serializada y green en checkout limpio; sandboxes borradas al salir incluso con `.laccdb` bloqueado.
- **#580** `fix(ci): remove or correct references to nonexistent script test files` — `.github/workflows/ci.yml`, `vitest.integration.config.ts` y `vitest.config.ts` referencian `test/scripts-access-runner.test.ts` y `test/scripts-vba-manager.test.ts`, que no existen en el árbol de tests. Aceptación: rutas inexistentes removidas; quality gate que verifique que las rutas referenciadas existen; `pnpm test` y CI consistentes.
- **#591** `fix(cli): make --help consistent and side-effect free across subcommands` — `dysflow mcp --help`, `dysflow doctor --help` y `dysflow access --help` o devuelven error desconocido, o ejecutan diagnósticos, o caen al "unknown subcommand". Aceptación: `--help` / `-h` debe salir 0, imprimir usage por stdout y no tener efectos colaterales para esos tres subcomandos.

## Scope

### #562 — integration serial + temp cleanup

In scope:
- `vitest.integration.config.ts`: añadir `fileParallelism: false` y `poolOptions.forks.singleFork: true` (más estricto que `maxWorkers: 1`) para garantizar un único fork vivo.
- Añadir un `globalSetup` que hace sweep de `os.tmpdir()` para borrar `dysflow-*` workspaces con antigüedad > N horas antes de la suite.
- Quality gate: nuevo test en `test/quality-gates/integration-config.test.ts` que verifica que la config exige serialización y referencia el global setup.

Out of scope:
- Refactor del runner para introducir locks por proyecto (no es la causa inmediata).
- Reescribir e2e tests para usar sandbox por-test con cleanup robusto (siguiente iteración; este change fija la contención y limita la acumulación).

### #580 — CI test refs

In scope:
- Quitar `test/scripts-access-runner.test.ts` y `test/scripts-vba-manager.test.ts` de:
  - `vitest.integration.config.ts` (include)
  - `vitest.config.ts` (include + exclude)
  - `.github/workflows/ci.yml` (línea 85-86, comando Windows integration)
- `test/quality-gates/ci-workflow.test.ts`: actualizar la expectativa del comando Windows y añadir aserción que parsea todos los `*.test.ts` referenciados en `vitest.config.ts`, `vitest.integration.config.ts` y `ci.yml` y verifica que cada archivo existe en disco.

Out of scope:
- Crear `test/scripts-access-runner.test.ts` o `test/scripts-vba-manager.test.ts` (el issue los marcó como inexistentes; la solución es removerlos, no crearlos).

### #591 — CLI --help consistency

In scope:
- `src/cli/index.ts`: detectar `--help` / `-h` como argumento del subcomando después del dispatch y devolver `{ exitCode: 0, stdout: HELP_TEXT, stderr: "" }` antes de invocar el handler del comando.
- Defensa en profundidad: cada uno de `handleMcpCommand`, `handleDoctorCommand`, `handleAccessCommand` debe retornar usage (exit 0, stdout no vacío, sin invocar config/PowerShell/runner) si el primer argumento es `--help` o `-h`.
- Tests: nuevo archivo `test/cli/subcommand-help.test.ts` que cubre los tres subcomandos y ambas variantes (`--help`, `-h`) y verifica exit code 0, stdout no vacío, stderr vacío, y que `doctor` no llama a `diagnosticsService.run` cuando se le pasa `--help`.

Out of scope:
- Cambiar el formato del texto de help (HELP_TEXT existente se mantiene).
- Modificar el resto de subcomandos (`setup`, `install`, `serve`, etc.) — el issue #591 sólo nombra `mcp`, `doctor`, `access`.

## Non-Goals

- No se introduce staging. La release policy de dysflow es `main-only` directo (Engram #14611).
- No se reabren commits del SDD archive previo (`openspec/changes/archive/`).
- No se tocan funciones de encoding (protegidas por el commit `3fbd60a`).
- No se rompen los baselines: Vitest 1674/1674, Pester 374/0/4, branches coverage ≥ 78.

## Approach

Workflow SDD formal con strict TDD, un commit por issue + un commit por update de `tasks.md` + un commit de archive = 5 commits directos a `main` (mismo patrón que `close-batch-575-576-578` previo).

Para cada issue:

1. **RED**: escribir test que falle con el código actual (quality-gate test o unit test).
2. **GREEN**: cambio mínimo para que el test pase, sin tocar nada fuera del scope.
3. **Verificación**: `pnpm test`, `pnpm build`, `pnpm lint`, `pwsh Invoke-Pester scripts/tests/` no rompen baseline.
4. **Commit**: convención `fix(<scope>): <descripción> (#<issue>)` con línea `SDD: close-batch-562-580-591` y ref a la issue.

Después de los tres fixes:

5. **Verify final**: re-correr la suite completa localmente y confirmar CI verde en GitHub Actions.
6. **Archive**: mover el change a `openspec/changes/archive/2026-06-28-close-batch-562-580-591/`, escribir `archive-report.md`, commit.
7. **Close issues**: `gh issue close` con comentario de traceability (commit SHA + test module).

## Affected Capabilities

- `integration-tests` — vitest integration config + global setup + quality gate (#562)
- `ci-workflow` — references a test files en vitest configs + ci.yml + quality gate (#580)
- `cli-help` — runCli dispatch + subcommand handlers + tests (#591)
