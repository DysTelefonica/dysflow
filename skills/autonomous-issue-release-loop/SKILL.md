---
name: autonomous-issue-release-loop
description: "Trigger: cerrar todas las issues, issue queue, release final. Ejecuta issues con worktrees aislados, TDD, CI, merge, limpieza y gates de release."
license: Apache-2.0
metadata:
  author: "ardelperal"
  version: "1.5"
---

# Autonomous Issue Release Loop

## Activation Contract

Load when the user asks to exhaust a GitHub issue queue in Dysflow or codegraph-vba and finish with a release. Also load when continuing an interrupted queue.

## Hard Rules

- Process every open actionable issue; finish only when none remain.
- **Parallelism is the default.** Partition dependency-ready, non-conflicting issues into the largest safe batch allowed by the host thread budget. Assign one issue, agent, branch, and worktree per lane. Serialize dependencies, shared-file or high-conflict work, merge/rebase gates, and release finalization.
- Use one clean worktree and one branch per issue. Never mix issues.
- Use strict TDD: prove RED, implement GREEN, then refactor and run relevant regression tests.
- **A green authorized PR has priority over further issue work.** Poll each PR independently. As soon as its required CI is green and merge authorization exists, merge it to `main` without waiting for slower siblings. Verify the linked issue closed; close it if GitHub did not. Immediately unregister/remove its local worktree and delete its local branch. Never leave a green authorized PR open while starting or continuing other issue work.
- **Preserve every remote branch on `origin`.** Never delete `origin/<branch>` after merge; the PR is the merge artifact and the remote ref is durable history.
- Do not split, delay, or redesign work because of PR line count when the user waived review-size limits.
- Treat newly discovered defects as new issues and append them to the same queue.
- **Existing issue lifecycle gate:** a stable target-host issue identity with matching read-back completes issue creation. Route that published issue directly to execution; never re-run issue-creation gates or require/re-check YAML Issue Forms after publication.
- **New-defect bootstrap:** when a genuinely new tracker is required and the target has no YAML Issue Form, invoke `issue-creation`'s bundled-form bootstrap path and continue. Missing forms alone never block work; only a genuine inability to mutate the target after the bounded authorized attempt is a blocker.
- Never release while an issue remains open or a required gate is red.
- For Dysflow, run `pnpm test:e2e:mcp:release` from the Dysflow repository before release. For every failure, create an issue with reproducible evidence and iterate it through this workflow; rerun the complete suite after fixes.
- Generate exactly one final release after the queue and all release gates are green.
- **Disk hygiene is mandatory and non-skippable.** At every merge AND at every session end, the orchestrator MUST run the full hygiene sweep below. Per-merge cleanup alone is NOT enough — worktrees and branches from prior interrupted sessions accumulate on disk and must be reaped on every run.
  1. **Local branches merged to `main`** — `git branch --merged main` lists them; delete each with `git branch -d <name>` (use `-D` only for branches known to be safely retired but not in the merged list). Never leave a local branch whose tip is reachable from `main`.
  2. **Remote branches are PRESERVED on `origin` after merge** — the remote ref is the permanent history. Never pass `--delete-branch` to `gh pr merge`, never run `git push origin --delete <branch>`, and never ask `gh` to clean up the remote ref on merge, close, or reopen. Confirm a branch's remote ref still exists with `git ls-remote --heads origin <branch>` — the expected answer is `yes, present`, not `gone`. This applies to every branch type (`feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`), including branches whose PR was already merged into `main`.
  3. **Local worktrees are REMOVED after merge** — the loop creates an isolated worktree per issue, so it owns the cleanup. Once the PR lands, run `git worktree remove <path>` and `git worktree prune`. A worktree left behind holds an obsolete branch checked out, and the next iteration can land in it and commit to the wrong place. Confirm with `git worktree list` — the expected answer is that only the main checkout remains. The local branch may be deleted with it; the remote ref stays (rule 2).
  3. **Worktree directories not registered in `git worktree list`** — `git worktree list --porcelain` is the authoritative registry. Anything under the worktree root (default `C:\Proyectos\<repo>-worktrees\`) that is NOT in the porcelain list is an orphan directory. Delete with `Remove-Item -Recurse -Force` (PowerShell) or `rm -rf` (bash). If a file is locked by another process (typical for `.codegraph-vba/codegraph.db*` SQLite WAL files held by the codegraph-vba MCP), do NOT run destructive lifecycle commands on codegraph (`codegraph uninit` etc., see repo AGENTS.md); rename the directory instead (`Rename-Item ... -NewName ".orphaned-<oldname>"`) to unlink it from git's view, then delete the renamed copy once the holding process releases the handle.
  4. **`git worktree prune` and `git remote prune origin`** at session end to clear stale registrations and remote-tracking refs.
  5. **Verify before reporting done**: `git worktree list` should show ONLY active worktrees (currently in use by a sub-agent) plus the main worktree. The local branch list should show ONLY `main` plus any active slice/fix branch. Anything else is a hygiene defect.
- After a Dysflow or codegraph-vba version change, load `dysflow-codegraph-update` and execute its runtime, documentation, pointer, example, and skill-alignment workflow. Update Dysflow on the current machine when requested.

## Decision Gates

| Condition | Action |
|---|---|
| Issues are dependency-ready and non-conflicting | Fill the largest safe parallel batch within the host thread budget; use one isolated lane per issue |
| Issues depend on each other or touch shared/high-conflict files | Serialize them in dependency order; do not parallelize them |
| PR has green required CI and merge authorization | Merge immediately, verify or close the linked issue, remove its local worktree, delete its local branch, and preserve its remote branch |
| PR is still running while a sibling is green and authorized | Merge and clean the green PR immediately; keep polling the slower PR independently |
| Stable target-host issue identity and matching read-back exist | Treat issue creation as complete; route directly to issue execution and never re-evaluate Issue Form availability |
| A genuinely new defect has no target YAML Issue Form | Invoke `issue-creation` bootstrap with its bundled asset; continue after stable read-back, and block only when the bounded authorized mutation cannot occur |
| Issue is duplicate, invalid, or blocked externally | Record evidence in GitHub; close only when justified, otherwise leave blocked and report the hard blocker |
| CI or tests fail | Keep the issue active; diagnose and fix with a new RED test |
| Merge or rebase is required | Serialize the gate against current `main`, resolve it in that issue's lane, then rerun required CI |
| Dysflow E2E fails | Create an issue per independently actionable defect and return to the queue |
| Queue changes during execution | Refresh and continue until empty |
| Queue and required gates are green | Serialize release finalization; create exactly one release |
| Session end (or before reporting completion) | Run the full disk-hygiene sweep per the hard rule above — prune branches merged to main, delete orphan worktree dirs, `git worktree prune`, `git remote prune origin`. Do not skip. |

## Execution Steps

1. Inspect repository state, remotes, latest release, open issues, and existing PRs; preserve unrelated work. Retain target-host identity/read-back for every existing queue item: that identity completes creation, so execute it without loading or re-evaluating issue-creation gates or YAML Issue Form availability.
2. Build the dependency graph. Fill the largest safe batch of dependency-ready, non-conflicting issues within the host thread budget; serialize dependencies and shared/high-conflict files.
3. Give each issue one agent, branch, and isolated worktree. Establish acceptance evidence, execute RED-GREEN-refactor, run regressions, commit, push, and open a linked PR to `main`.
4. Poll every PR independently. Fix a red PR in its own lane. The moment a PR is green and authorized, merge it, verify or close its linked issue, immediately remove its local worktree and local branch, and confirm its remote branch remains on `origin`; do not wait for slower siblings.
5. Refresh the dependency graph and queue after every merge or newly discovered defect. For a genuinely new defect, invoke `issue-creation`; if no target form exists, use its bundled-form bootstrap path rather than stopping. Rebase dependent lanes on current `main` through a serialized merge/rebase gate, then refill safe capacity until no actionable issue remains.
6. Serialize repository release gates. For Dysflow, run all E2E tests from the mandated directory and loop failures back through GitHub issues.
7. Create exactly one final release through the repository's canonical release workflow; verify publication.
8. Run `dysflow-codegraph-update` when either product version changed and perform requested local Dysflow update.

## Output Contract

Return issue-to-PR mappings, RED/GREEN and CI evidence, merge and cleanup evidence, final open-issue count, release URL/version, Dysflow E2E result, local update result, and documentation/skill alignment result. Report only genuine external blockers.

## References

- `../dysflow-codegraph-update/SKILL.md`
- `../branch-pr/SKILL.md`
- `../work-unit-commits/SKILL.md`
- `../issue-creation/SKILL.md`

## Cross-Document Synchronization After Skill Changes

Cuando una skill se mueve entre los límites `personal / repo-local / repo-scope`, se renombra, se divide, se fusiona o se elimina, el cambio debe propagarse a **todos** los documentos que apuntaban a la forma anterior.

### Por qué esta sección existe

Los punteros desactualizados son una clase de bug que sobrevive a compilación y runtime. Decaen en silencio y desvían a futuros agentes hacia ficheros equivocados. Perder este sincronizado es perder trazabilidad sin error visible.

### Cuándo aplica

Active este procedimiento ante cualquiera de:

- La ubicación de la skill cambió (catálogo personal → repo-local, o repo-local → catálogo personal).
- La skill se renombró o se dividió en varias con nombres nuevos.
- La skill desapareció y su funcionalidad se movió a otro lugar.
- El contrato de activación cambió (ahora dispara con una señal distinta).
- Las dependencias de la skill cambiaron (ya no apunta a los mismos ficheros).

### Procedimiento (MANDATORY, ejecute todos los pasos)

1. **Levante el inventario de documentos afectados antes de editar.** Ejecute `grep -r "<skill-name>" --include="*.md" --include="AGENTS.md" --include="CLAUDE.md"` en el repo afectado **y** en `~/.opencode/skills/`, `~/.config/opencode/skills/` y `~/.agents/skills/`. Registre cada hit. No omita ninguno; un solo puntero perdido basta para que el siguiente agente cargue la skill equivocada.
2. **Determine el repo canónico.** Dónde vive ahora el `SKILL.md` autoritativo:
   - ¿Catálogo personal? Actualice el canónico en `~/.opencode/skills/<skill>/SKILL.md` y sus symlinks/mirrors.
   - ¿Repo-local? Actualice solo dentro del repo dueño, en `skills/<skill>/SKILL.md`.
   - ¿Mixto? Elija un canónico. El otro pasa a ser un puntero `Repo-scope pointer` (ver paso 4).
3. **Actualice el `SKILL.md` mismo.** Si cambió el scope o la ubicación, el frontmatter `description` y cualquier nota "Where this lives" deben reflejar la realidad nueva. No deje comentarios rancios como `# moved to <old location>`.
4. **Actualice el `AGENTS.md` / `CLAUDE.md` del repo dueño.** Agregue la skill a la sección apropiada:

   | Ubicación de la skill | Sección del AGENTS.md |
   |---|---|
   | Catálogo personal | Sin cambios en AGENTS.md |
   | Repo-local | Sección "Repo-local skills" con scope de activación |
   | Repo-scope pointer (la skill vive en otro sitio) | Sección "Repo-scoped skills (not part of personal catalog)" con la ruta canónica |

   Estas secciones **no** deben duplicarse entre sí. Si una skill está en el catálogo personal, no la liste también en "Repo-local skills" de un `AGENTS.md`; eso es drift.
5. **Espeje en punteros cross-repo.** Si una skill se usa entre repos (por ejemplo, el bloque global `dysflow-arnes` está embebido en varios `AGENTS.md` de repos distintos), cada copia embebida debe apuntar al mismo canónico. Las copias desalineadas son la fuente más común de drift cross-repo.
6. **Verifique re-buscando.** Ejecute el mismo `grep` del paso 1 contra el **nombre / ruta nuevo**. Todos los hits deben apuntar a la ubicación correcta. Ejecútelo contra el **nombre / ruta antiguo**. Cero hits esperados. Si quedan hits antiguos, la propagación está incompleta: vuelva al paso 1.
7. **Forma del commit**: un commit por grupo de ficheros (el cambio del `SKILL.md` puede commitearse con el cambio del `AGENTS.md`), pero nunca envíe el cambio del `SKILL.md` sin los updates de documentación, ni envíe updates de documentación sin el cambio del `SKILL.md`. Viajan juntos.
8. **Después del commit**: empuje conforme a `git-push-policy`. La reconciliación debe estar completa antes de reportar terminado; véase `git-reconciliation-policy`: "Local and remote deben reconciliarse ASAP".

### Derivas habituales a vigilar

- `AGENTS.md` del repo A sigue listando la skill como catálogo personal cuando ya pasó a repo-local.
- `AGENTS-shared.md` sigue afirmando "todas las skills son catálogo personal" después de mover una a repo-local.
- Un symlink en `~/.opencode/skills/<old-name>` queda tras la mudanza y rompe `codegraph` u otras herramientas que siguen enlaces.
- Un puntero dentro de un bloque markdown usa rutas estilo `link-personal-skills.ps1` apuntando a un path que ya no existe.
- El frontmatter `description:` sigue disparando con keywords del scope antiguo (por ejemplo, "Trigger: team-skills" cuando la skill es ahora solo de Dysflow).

### Lo que esta sección no hace

- No sustituye las Hard Rules de arriba. Disk hygiene, paralelización y TDD no se ven afectadas.
- No prescribe **qué** hacer con el contenido de la skill. Eso lo gobierna el cambio mismo.
- No cubre refactors dentro de una sola skill: es un cambio de código normal gobernado por el flujo usual.

### Core invariants

- **El `SKILL.md` canónico y los punteros viajan juntos.** Nunca se envía uno sin los otros.
- **Toda afirmación sobre la ubicación de la skill se ancla en la ruta del fichero.** Si no la puede probar con ruta, bórrela.
- **La verificación por `grep` es obligatoria.** Sin verificación, el procedimiento está incompleto.

---

*Touched 2026-08-31 — version 1.5: added "Cross-Document Synchronization After Skill Changes" section. Establishes a mandatory procedure for keeping docs in sync when a skill changes scope, location, or shape. Avoids the silent-decay bug class where out-of-date pointers steer future agents to the wrong files.*

*Touched 2026-08-07 by ardelperal — inverted remote-branch policy per user decision: remote branches are preserved on `origin` after merge; only the worktree and local branch are cleaned. Aligns with dysflow AGENTS.md "Never delete remote branches" hard rule; version 1.1 → 1.2.*

*Touched 2026-08-09 — made worktree removal an explicit hard rule of its own (rule 3). The loop creates one worktree per issue, so it owns the cleanup: a worktree left behind holds an obsolete branch checked out and the next iteration can land in it and commit to the wrong place. Retaining the remote ref and removing the worktree are two halves of one policy, and only the first half was written down.*

*Touched 2026-08-27 — version 1.3 makes safe parallel batching the default and gives every green authorized PR immediate merge-and-cleanup priority.*

*Touched 2026-08-31 — version 1.4: a stable target-host issue read-back completes creation permanently; existing issues bypass Issue Form gates. New defects bootstrap the bundled Issue Form instead of stopping when a repository has none.*
