# Feature: release-v4.4.6 cleanup

**Owner:** el Gentleman orchestrator
**Status:** in progress
**Workspace root:** `C:/00repos/codigo/dysflow`
**Active branch (current):** `fix/quay-auth-placeholder` (commit `698d2beb`, ya en `origin/main` vía #1765)

## Goal

Llevar v4.4.6 a release publicado en GitHub con cola de issues vacía, sin PRs
verdes pendientes y con el E2E gate de `release.yml` en verde.

## Contexto inicial

- **Open PRs:**
  - **#1764** `release/v4.4.6` — v4.4.6 release PR. CI100% verde, MERGEABLE.
    Incluye `feat(mcp)!` (procedure gate opt-in + write gate en `run_vba`) +
    `chore(release): prepare v4.4.6` + los 2 docs commits que #1760 no podía
    mergear sola. ~700 líneas, 60 archivos.
  - **#1760** `docs/release-sync-flow` — docs-only; Quality gates (26) skip-ea
    para docs-only y nunca puede merge-ar sola. Su propio cuerpo de #1764 dice
    "Syncs main with the v4.4.6 tag, and carries the two documentation commits
    that PR #1760 could not land on its own." → cerrarla como superseded.
- **Open issues:**
  - **#1763** `ci: exempt skill-fleet/* propagation PRs from consumer-specific
    gates` — autoaprobada, sin PR. El reciente merge de #1762 (PR skill-fleet)
    funcionó con admin bypass; la issue pide formalizar la exención en CI.
- **Tag v4.4.6:** pusheado a origin (loose `15dcb94` + dereferenced `bd9d024`).
- **Release v4.4.6:** **NO publicada en GitHub**. Run `35524594002` del
  workflow Release → FAILURE en `E2E validation (Windows self-hosted)` →
  `Build & Release Artifacts` SKIPPED.
- **Causa del FAIL de release.yml:** el e2e test `run_vba`
  (`E2E_testing/mcp-e2e.mjs:1270`) espera error al llamar
  `run_vba` con `procedureName:"DysflowMcpE2EMissingProcedure"`, pero el nuevo
  write-gate de #1764 cambió el orden de validación y retorna preview exitoso
  en dryRun. Test desincronizado con el contrato.
- **Historial release.yml:** viene fallando desde v4.4.0 (sólo v4.4.5 pasó).
- **Working tree actual:** branch `fix/quay-auth-placeholder`, clean. El HEAD
  `698d2beb` ya está en `origin/main` vía PR #1765 mergeada.
- **AGENTS.md (este repo):** flujo tag-then-PR. Branch protection con
  `enforce_admins=true` y 5 required checks bloquea push directo. PR es la
  única vía para sincronizar main con el tag.

## Decisiones del usuario

1. **#1763:** Implementar fix y PR propia (no close como obsoleta).
2. **Plan release:** Sí, mergear #1764 ahora.

## Tasks

1. [ ] **Diagnosticar release.yml** — abrir run 35524594002, identificar el
   test que falla, mapear el contrato viejo vs nuevo. _Status: en diagnóstico._
2. [ ] **Arreglar test E2E obsoleto de `run_vba`** — actualizar
   `E2E_testing/mcp-e2e.mjs:1270` (y línea 2747 alias) para reflejar el nuevo
   contrato. Crear PR con el fix.
3. [ ] **Re-tag v4.4.6 con el fix incluido** — tras mergear el fix del test,
   re-correr `chore(release): prepare v4.4.6` con version stamps correctos, pushear
   tag para que `release.yml` re-corra. **Decisión pendiente: usar
   `--force`/`-f` o tag nuevo `v4.4.6-rc2`?**
4. [ ] **Implementar fix #1763** — modificar `.github/workflows/ci.yml`
   para exentar `skill-fleet/*` PRs de `Documentation quality` y otros gates
   no aplicables; PR propia.
5. [ ] **Mergear #1764** — squash o merge commit; close #1760 como
   superseded.
6. [ ] **Verificar release v4.4.6 publicada** — `gh release view v4.4.6`
   debe retornar release válida, no "release not found".
7. [ ] **Higiene de worktrees y ramas locales** — `git worktree list`,
   `git branch --merged main`, eliminar locales, preservar remotas.
8. [ ] **Cerrar #1763** tras merge del fix.
9. [ ] **Reporte final** al usuario con SHA, URLs, evidencia de release
   publicada, summary de la cola.

## Constraints

- AGENTS.md dice: "Agents must not run `pnpm test:e2e:mcp:release`
  locally as a pre-tag gate. That duplicates the same expensive authority
  without controlling whether the GitHub Release publishes." → la autoridad
  es `release.yml` en CI, no local.
- AGENTS.md dice: "Never delete remote branches." → después de merge,
  preservar `origin/<branch>`. Solo limpiar worktrees y ramas locales.
- Hard rule de Release title = tag name (chequeado por
  `release-title-guard.yml`).
- "The tag workflow is the sole heavy release E2E authority" — no
  correr el E2E completo local.

## Verification

- `pnpm build` y `pnpm test` verdes localmente (lo que se pueda sin
  Access COM).
- `pnpm test:e2e:mcp:release` no se corre local (per AGENTS.md).
- `release.yml` re-corre vía tag push → e2e-validation SUCCESS →
  Build & Release Artifacts corre → release visible en
  `gh release view v4.4.6`.
- Cola vacía: `gh issue list --state open` → `[]`.
- PRs verdes mergeadas o cerradas con justificación.
- `git worktree list` muestra sólo el checkout principal.