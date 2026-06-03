# HANDOFF — fix-windows-ci-smoke

> **Propósito de este documento**: registro vivo de progreso para que CUALQUIER agente (humano o IA)
> pueda retomar el trabajo si la sesión se corta. Se actualiza al cerrar cada fase SDD.
> El detalle accionable con checkboxes vive en `tasks.md` (se crea en la fase de tasks).

## Objetivo

El job de CI **`windows-integration-smoke`** (`.github/workflows/ci.yml`) está **ROJO** por drift
entre los tests Pester (`scripts/tests/*.Tests.ps1`) y los scripts PowerShell de producción
(`scripts/dysflow-access-runner.ps1`, `scripts/dysflow-vba-manager.ps1`). El job de Ubuntu (`quality`)
está verde, así que medio CI está ciego justo en la plataforma que es la razón de ser del producto.
Hay que devolver el job de Windows a verde **sin debilitar la protección** (no borrar asserts para
"pasar"; arreglar la causa raíz del drift).

## Configuración de la sesión (cacheada)

| Parámetro | Valor |
|---|---|
| Artifact store | `hybrid` (engram + archivos openspec) |
| Execution mode | `automatic` (fases back-to-back) |
| Delivery strategy | `auto-chain`, PR ≤ 400 líneas |
| Chain strategy | `stacked-to-main` (cada PR mergea a main en orden) |
| TDD | **estricto** (test primero, ver docs/testing/testing-philosophy.md) |

## RESTRICCIÓN DURA (no negociable)

NUNCA tocar el runtime de producción: `%LOCALAPPDATA%\dysflow` ni el MCP de OpenCode
(`~/.config/opencode/opencode.json`). Build a `test-runtime/` y E2E con `DYSFLOW_E2E_COMMAND`.
Esta máquina ES Windows 11 → Pester (`pnpm test:ps1`) se puede correr localmente para reproducir.

## ⚠️ CHANGE CERRADO — OBJETIVO YA CUMPLIDO (OBE)

**2026-06-02**: La fase explore reveló que **el CI de Windows ya está VERDE**. El rojo lo causaba un
assert de texto frágil en `test/scripts-access-runner.test.ts` que driftó cuando el SQL dispatch se
extrajo a `Invoke-QuerySqlReadAction`. **PR #383 (P6), merged 2026-06-01, ya lo arregló** reemplazando
los asserts de texto por 28 tests Pester de comportamiento (AST extraction).

Verificación autoritativa (fuente de verdad, no el WORKLOG):
```
gh run view 26773468644 --json jobs  # último run en main, sha fb51686
→ "Quality gates": success
→ "Windows PowerShell/Access smoke": success
```

El `docs/WORKLOG_dysflow-hardening_2026-05-31.md` está **STALE** — sigue diciendo que el CI está rojo.
Este change SDD no tiene trabajo de código que hacer. Pendiente: redefinir objetivo con el usuario.

## Estado de fases SDD

| Fase | Estado | Artefacto | Notas |
|---|---|---|---|
| explore | ✅ HECHO | `sdd/fix-windows-ci-smoke/explore` | Causa raíz hallada → YA arreglada por P6 |
| propose | ⏳ pendiente | `proposal.md` | |
| spec | ⏳ pendiente | `specs/*/spec.md` | |
| design | ⏳ pendiente | `design.md` | |
| tasks | ⏳ pendiente | `tasks.md` | Aquí van los checkboxes accionables |
| apply | ⏳ pendiente | `apply-progress` | TDD estricto |
| verify | ⏳ pendiente | `verify-report.md` | |
| archive | ⏳ pendiente | `archive-report.md` | |

Leyenda: ✅ hecho · 🔄 en curso · ⏳ pendiente · ⚠️ bloqueado

## Cómo retomar si te quedás a medias

1. Leé este HANDOFF y la tabla de fases de arriba.
2. Recuperá el contexto SDD: engram `mem_search("sdd/fix-windows-ci-smoke/<fase>")` → `mem_get_observation(id)`.
3. Recuperá el init del proyecto: engram `mem_search("sdd-init/dysflow")`.
4. Continuá por la primera fase en estado ⏳ respetando dependencias (explore→propose→spec/design→tasks→apply→verify→archive).
5. Respetá SIEMPRE la RESTRICCIÓN DURA y el TDD estricto.

## Bitácora

- **2026-06-02** — Init SDD del proyecto persistido (`sdd-init/dysflow`). Change creado. Lanzada fase explore.
