# Feature: v4.4.9 release + Lanzadera skill delete

**Owner:** el Gentleman orchestrator
**Status:** in progress
**Workspace root:** `C:/00repos/codigo/dysflow`
**Active branch (current):** `main` @ `418534cd` (fast-forwarded to `origin/main`)
**RDD switch:** on (decided by global)

## Goal

1. Borrar `skills/vba-lanzadera-backend-config/SKILL.md` (commit staged en index) vía PR propio con RDD.
2. Cortar release `v4.4.9` cubriendo los PRs ya merged desde v4.4.8 (#1785, #1786, #1788).
3. Cerrar con el PR efímero de sincronización si el flow de release lo requiere.

## Contexto

- `main` local: `418534cd` (= `origin/main`, fast-forwarded).
- `v4.4.8` tag fue en `6277c711 chore(release): prepare v4.4.8 (#1784)`.
- Commits merged desde `v4.4.8`:
  - `e29c3823` docs: align the release flow and Pi plugin install (#1785)
  - `e843e303` refactor(skills): make the examples audit testable (#1786)
  - `418534cd` fix(run-vba): stop handing Access COM a module-qualified name (#1788)
- Working tree: solo `skills/vba-lanzadera-backend-config/SKILL.md` staged para `deleted`.
- El archivo Lanzadera NO está en el catálogo `docs/skills-catalog.md`, no aparece en `propagate-team-skills.ps1` ni en `personal-skills:slice:dysflow` del AGENTS.md. Existe solo en HEAD, agregado por #1762 (`4de57bf8 chore(fleet): apply personal-skills @ d1c8c32`).
- Sin release prep previo de v4.4.9.
- AGENTS.md "Release flow" manda tag-first con rama efímera post-release.

## Decisiones del usuario

1. El delete staged se commitea **aparte** vía PR con RDD.
2. Release v4.4.9: hacer el flow completo (bump, PR prep, merge, `-Resume`, tag).

## Tasks

### Fase 1 — Delete del skill Lanzadera
- [ ] Crear `odd/tasks/release-v4.4.9-with-lanzadera-delete.md` (este archivo)
- [ ] Branch `chore/delete-lanzadera-skill`
- [ ] Commit `chore(skills): remove vba-lanzadera-backend-config (not in fleet catalog)`
- [ ] Push branch
- [ ] Open PR contra `main` con RDD
- [ ] Inspect + START + collect + acknowledge
- [ ] Esperar CI verde
- [ ] Merge PR

### Fase 2 — Release prep v4.4.9
- [ ] Pull main
- [ ] Branch `release/v4.4.9`
- [ ] Correr `pwsh -File scripts/release-prepare.ps1 -Bump patch -SemanticAuditEvidencePath C:\audit\semantic-audit.json`
- [ ] Push branch
- [ ] Open PR contra `main` con RDD
- [ ] Inspect + START + collect + acknowledge
- [ ] Esperar CI verde (5 checks branch protection)
- [ ] Merge PR
- [ ] Correr `pwsh -File scripts/release-prepare.ps1 -Resume -Version 4.4.9`
- [ ] Esperar release.yml (4 jobs: Build release artifact, Exact-SHA quality authority, E2E validation, Build & Release Artifacts)
- [ ] Si release.yml agregó commits al tag, abrir rama efímera `release-v4.4.9` + PR + merge

## Riesgos

- Si el audit semántico requiere evidencia específica, el `-Bump patch` falla. Backup: correr con `-Version 4.4.9` explícito + `-SemanticAuditEvidencePath`.
- El `-Resume` espera un CI con conclusion:success en el SHA del tag; cualquier fallo requiere investigar antes de reintentar.
- RDD inspect puede pedir un comando de freeze que requiere `git add` específico; seguir exactamente el binding que devuelva.
