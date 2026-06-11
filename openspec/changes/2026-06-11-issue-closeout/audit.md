# Issue Closeout Audit — 2026-06-11

**Project:** `no_conformidades`
**Audit date:** 2026-06-11
**Staging tip at audit time:** `8cfb047` (after fast-forward merge of `track3-issue-18`)
**Main tip at audit time:** `aabc636`
**Method:** `gh issue list --state all`, `gh pr list --state merged --search "#N"`, `git log --all --grep="#N"`, and `git merge-base --is-ancestor <sha> origin/<branch>` for each candidate closing commit.
**Scope:** Every open and closed GitHub issue in `DysTelefonica/No_conformidades` is classified, with a best-effort closing evidence (PR or commit) and reachability from `origin/staging` and `origin/main`.

## Rule (user-stated)

> No issue may remain without checking the implementation commit is reachable in `staging` or that no commit is needed; no SDD change may remain unarchived.

## Summary

| Bucket | Count | Notes |
|---|---|---|
| OPEN issues | 6 | #56, #54, #53, #52, #48, #43 — all are real implementation/audit work, not yet started or in flight. |
| CLOSED issues with closing evidence in `origin/staging` | 9 | #28, #24, #19, #18, #16, #13, #11, #8, #3, #1 — work is in `staging` and presumably awaiting next release. |
| CLOSED issues with closing evidence in `origin/main` only (not yet in `staging`) | 3 | #45, #4 — work is already in `main` (released), not yet promoted to `staging`. |
| CLOSED issues with closing evidence in neither branch (in local/other) | many | See table. Some "no commit ref found" cases are doc-only closes (e.g. #44 closed the external `rutas-usuario-windows` OpenSpec change, no code in this repo) or pre-traceability closes (#1, #3, #5, #6, #7, #8, #10, #12, #14, #15, #17, #20, #40, #41, #42). |

## OPEN issues (6)

| # | Title | Status analysis |
|---|---|---|
| 56 | perf(indicators): audit FormIndicadores cache/service path with strict TDD | Pure investigation/design audit. No code change requested; need characterization tests to confirm `IndicadorServicio` uses cache/materialized path. No PR/commit evidence. |
| 54 | perf(cache): extract project seguimiento NC list helper with strict TDD | Real implementation work. `Form_FormNCProyectoSeguimientoNC.cls` still calls legacy `constructor.getNCsDeProyectoBusqueda`. No PR/commit evidence. |
| 53 | perf(cache): extract audit seguimiento tareas helper with strict TDD | Real implementation work. `Form_FormNCAuditoriaSeguimientoTareas.cls` still calls legacy `constructor.getARsDeAuditoriaBusqueda`. No PR/commit evidence. |
| 52 | perf(cache): extract audit seguimiento NC list helper with strict TDD | Real implementation work. `Form_FormNCAuditoriaSeguimientoNC.cls` still calls legacy `constructor.getNCsDeAuditoriaBusqueda`. No PR/commit evidence. |
| 48 | feat(form-FNCProyecto): ComandoActualizarLista should invalidate list cache and refill combos from cache | Real implementation work. Sibling of closed #49 (audit-form version). Detailed proposal already drafted. No PR/commit evidence. |
| 43 | fix(cache): verify and enforce CRUD/cache transaction boundaries | Hardening work. Plan-002 still lists Spec-008 / Spec-015 as open. Not yet addressed. |

## CLOSED issues (35) — closing evidence and reachability

| # | Title | Closing evidence | stg | main |
|---|---|---|---|---|
| 57 | feat(cache): add audit list cache table to backend | `7e27db8 feat(cache): rebuild audit list cache`; `31977af feat(cache): read valid audit list cache`; `e119189 feat(cache): add audit backend list cache schema`; `3c4692f fix(cache): use workspace transaction for audit rebuild` (in 1537749 SDD-hygiene sweep) | Y | N |
| 55 | perf(cache): extract project seguimiento tareas helper with strict TDD | `aa1ef79 feat(issue-55): add project seguimiento tareas helper`; archive-report re-anchored in `8cfb047` | Y | N |
| 51 | perf(cache): extract audit seguimiento indicator helper with strict TDD | `3243f65 fix(issue-51): defer auditoría indicators refresh via timer` | Y | N |
| 50 | perf(cache): make NC project listing form use canonical cache-aware service | `500d6d5 perf(cache): route project listing form through helper`; `2ca4de7 perf(forms): defer project tracking indicators` | Y | N |
| 49 | feat(form-FNCAuditoria): ComandoActualizarLista should invalidate audit list cache and refill combos from cache | `4b6cb64 refactor(forms): delegate audit gestion list workflow`; `ea33758 fix(cache): preserve audit keyword fallback parity`; `0aaec93 feat(cache): implement audit gestion helper fallback`; `d77f0be test(cache): add audit gestion helper RED contracts` | Y | N |
| 47 | feat(estados): bootstrap oficial de catálogo y warm-up de caché | `746a339 test(cache-form-filter-coverage): W1 RED tests + PipeFlatten stub (PR 1)`; `d6c2e54 feat(estado-cache-bootstrap): runtime dictionary reload + guarded cache warm-up (PR 3)`; `198123f feat(estado-cache-bootstrap): production catalogue DAO foundation (PR 2)` | N | N |
| 45 | feat(NC): posponer validacion FechaPrevistaControlEficacia hasta cierre [GLPI-566] | PR #46 merge=`2ed53fb`; SDD archive `ce-fecha-obligatoria-postponement`; also `5db9ba3 fix(issue-45)` on current branch | N | Y |
| 44 | docs(config): close rutas-usuario-windows OpenSpec verification | Doc-only close. External OpenSpec change `C:\00repos\documentacion\OPENSPEC\00_No_Conformidades\openspec\changes\rutas-usuario-windows`. No code in this repo. | n/a | n/a |
| 42 | feat(cache): add runtime kill-switch toggle and persistence validation | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 41 | feat(cache): add explicit NC cache warmup operator flow | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 40 | feat(forms): integrate NCProyecto ViewModel/cache paths | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 39 | fix(cache): make NCProyecto cache hits fully in-memory | `23af345 fix(cache): NCProyecto cache-first for ACs/ARs/Riesgos (closes #39)` | Y | N |
| 38 | fix(indicators): ComandoActualizar de seguimiento debe regenerar caché completa | `bf97614 fix(indicators): restore staging regression fixes`; same body as #36/#20 group | Y | N |
| 37 | fix(indicators): error al abrir Auditorías por cache materializado sin cabecera | `4ff8f4f refactor(tests): split stateful indicator suites into dedicated manifests`; same body as #36/#20 group | Y | N |
| 36 | fix(indicators): error al abrir Parte Proyectos por cache materializado sin cabecera | `4ff8f4f refactor(tests): split stateful indicator suites into dedicated manifests`; `bf97614 fix(indicators): restore staging regression fixes` | Y | N |
| 28 | test(vba): endurecer fixtures E2E con datos locales determinísticos | Multiple PRs: #30, #29, #31, #34, #33, #32, #35, #21 (all `refs #28` slices) | Y | Y |
| 24 | ui(forms): restaurar icono en botón de motivos NR | PR #25 merge=`be57b90`; `27a2e6a merge: promote staging release 2026-008`; `6b84ffb docs(release): document 2026-008` | Y | Y |
| 20 | feat(config): sanitizar rutas locales por usuario Windows | `bf97614 fix(indicators): restore staging regression fixes` (group fix); main evidence in `2ed53fb` (PR #46). External OpenSpec change `rutas-usuario-windows`. | Y | N |
| 19 | feat(NC): Control de Eficacia - campos obligatorios condicionales [GLPI-566] | `448d8cc fix(issue-19): update tests to call real domain methods`; `47900cf feat(issue-19): implement CE gating domain logic`; `425ef08 feat(issue-19): add RED tests for CE gating validation` | Y | Y |
| 18 | perf(indicators): cache backend compartida para Proyecto y Auditoría | Multiple wu1/wu2 commits: `276e2bc`, `c80f7bb`, `834d0de`, `457eae1`, `53a0e03`, `caac121`, `ff0eae8`, `12facba`, `b7eaa86`, `7f7d15f`, `5db9ba3` (issue-45), `687a822`, `8cfb047` (audit refresh); PR #21 `f22c14e4`, PR #26 `ef5ab28` | Y | N |
| 17 | test(vba): normalizar batería contra access-vba-tdd | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 16 | feat(access): mostrar progreso al calcular indicadores | PR #26 merge=`ef5ab28` | Y | Y |
| 15 | test(indicators): characterize Seguimiento calculations before optimization | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 14 | feat(cache): cache Proyecto indicators for UAT startup | PR #26 merge=`ef5ab28` (group with #16/#18) | Y | Y |
| 13 | perf(indicators): add fast Proyecto summary counts | PR #27 merge=`dc46b53`; also PR #26, PR #46 (group) | Y | Y |
| 12 | perf(indicators): split Proyecto and Auditoría indicator loading | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 11 | perf(uat): instrument Parte Proyectos indicator startup | PR #21 merge=`f22c14e4` (group telemetry with #18) | Y | Y |
| 10 | fix(tests): force local backend during VBA test runs | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 8 | feat(config): unificar getdb y eliminar hardcodes de configuración | PR #9 merge=`e2ede756` | Y | Y |
| 7 | fix(config): validar infraestructura configurada al arrancar | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 6 | fix(vba): align backend routing with BackendActivo | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 5 | feat(cache): completar implementación operativa para staging | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 4 | test: clean up VBA suite to keep only automatable tests | No commit ref found in body search. Pre-traceability close. | n/a | n/a |
| 3 | feat(nc): motivo obligatorio cuando RequiereControlEficacia='No' | PR #31 merge=`bc3b2011` (group) | Y | Y |
| 1 | feat(config): sistema de cambio de backend por tabla de configuración | PR #31 merge=`bc3b2011`; PR #30 merge=`d8ea4c2` (group) | Y | Y |

## Reachability legend

- **Y / N** = `git merge-base --is-ancestor <sha> origin/<branch>` returned exit 0 / non-zero.
- **n/a** = no candidate commit found in the current branch graph for that issue. The work was either pre-traceability (no `Closes #N` or `Refs #N` in commit/PR body) or done in a path that is not in `origin/staging` or `origin/main` (e.g. external OpenSpec folders).
- A "Y in stg" closing evidence is the strongest verification under the user's closeout rule. A "Y in main only" is a release-pending case (work is in production, not yet in the next staging cut). A "n/a" case needs manual confirmation by the user.

## Recommended follow-ups (out of scope for this audit)

1. **#45**: work is in `main` but not in `staging`. If the user wants the next `staging` cut to include it, a `git cherry-pick 2ed53fb` (or re-merge) into `staging` is needed.
2. **#47**: closing evidence is reachable from neither `staging` nor `main` (the `cache-form-filter-coverage` and `estado-cache-bootstrap` PR branches were never merged). Either re-merge the branches or document the close as "pre-traceability" and move on.
3. **Pre-traceability CLOSED issues** (#1, #3, #5, #6, #7, #8, #10, #12, #14, #15, #17, #20, #40, #41, #42): no body text reference exists; the work predates the project-wide traceability rule. The user can decide whether to backfill references or accept them as historical.
4. **OPEN issues** (#56, #54, #53, #52, #48, #43): all are real pending work and need their own SDD/branch before they can be closed.
