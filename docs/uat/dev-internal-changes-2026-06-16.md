# Dev Internal Changes — Release batch staging→producción 2026-06-16

> Complemento de `docs/uat/PRUEBAS-002/uat-acceptance.html`. Este documento lista los cambios **internos** del batch que NO se validan en oficina porque no son user-visible (refactors, tests, schema, infra, docs, security). Solo el dev los necesita.
>
> **Audiencia**: desarrolladores + mantenedor de dysflow. NO enviar al firmante de calidad.

## 1. Épica #67 — Capability + feature catalog (Issue #67, PRs #69 + #70, MERGED)

Épica completa de documentación + cobertura TDD. Cierre de i→f con 22/22 tests verdes y AC-5/AC-7 promovidos a ✅.

- `1396a0f docs(catalog): add v2-aligned capability + feature catalog (Issue #67)` — núcleo de la épica.
- `f122d9a chore(sdd): reconcile openspec config for capability catalog`.
- `531c9f3 docs(capabilities): add v2-aligned capability catalog (issue #67)`.
- `d9ba01e docs(features): align feature pages with fresh runtime evidence`.
- `7297ad7 docs(capabilities): promote 3 indicator divergences to Verified-runtime`.
- `3baddbf fix(issue-18-38-50): resolve 3 divergences in indicadores manifest`.
- `a2d5ae4 chore(sdd): archive feature-traceability-ledger change`.
- `35b508b Merge pull request #66` — chore/sdd-record-feature-traceability-ledger.
- `f1b2575 docs(sdd): record implementation commits for feature-traceability-ledger`.
- `1829f3f Merge pull request #65` — feat/feature-traceability-ledger-pr4.
- `ddbca6e docs(features): PR 4 — close B1/B2/B3 blockers (Phase 4)`.
- `d5c009c feat(cache-invalidation): integrate equivalent changes into staging (Phase 4 B1)`.
- `42e342a Merge pull request #64` — feat/feature-traceability-ledger-pr3.
- `71112e1 docs(features): PR 3 — index, manifest mapping, release/UAT policy, staging/TDD/post-test gates (Phase 3)`.
- `18680b2 Merge pull request #63` — feat/feature-traceability-ledger-pr2.
- `792e14d docs(features): PR 2 — backfill 5 archived features (Phase 2)`.
- `f8c6b82 Merge pull request #62` — feat/feature-traceability-ledger-pr1.
- `af13d02 docs(features): PR 1 — feature catalog structure + first backfill (Phase 1)`.
- `20b71f6 fix(src): export 22 missing modules from binary to src` — crítico: 22 módulos faltantes exportados del binario a `src/`. Sin este commit, los commits siguientes no tenían fuente para modificar.

### Test coverage (Fase 2 de la épica)

22 tests VBA nuevos en 5 manifests, todos verdes al cierre de la épica:

| Capability | Manifest | Tests | BR cubiertos |
|---|---|---|---|
| CAP-CAT | `tests/tests.vba.cap-cat.json` | 2 | BR-CAT-5/6 (Registrar+Eliminar contra sandbox) |
| CAP-EXP | `tests/tests.vba.cap-exp.json` | 5 | BR-EXP-4/5 (TextoExpediente formato + cache memoization + 13 propiedades round-trip) |
| CAP-NCA-AF | `tests/tests.vba.cap-nca-af.json` | 5 | BR-NCA-AF-1 (Particula NC/OB/OP + edge cases) |
| CAP-UPN | `tests/tests.vba.cap-upn.json` | 5 | BR-UPN-1..5 (EsAdministrador, PermisoPruebas, UsuarioRed, Matricula/Correo, flags booleanos) |
| CAP-COM | `tests/tests.vba.cap-com.json` | 5 | BR-COM-1/2/4 (Correo round-trip + IDCorreoCalculado + destinatarios independientes) |
| **Total** | | **22** | 5 capabilities con BRs verificados |

Lección operativa (engram `bug/tests-vba-dcount-dlookup-no-funcionan-contra-sandbox-van-por-currentdb`): en tests VBA con sandbox, `DCount`/`DLookup` van por `CurrentDb` (frontend linkeado) y no ven las fixtures del sandbox. Usar SIEMPRE `db.OpenRecordset` contra el mismo handle que devuelve `getdb()`. Aplicado en `Test_CAT_MaestrosCatalogos.bas` (commit `e386a8b`).

### Binary sync post-merge

- `5f17e50 chore(binary): import 5 test modules after issue-67 e386a8b / 2c8ee54` — binary Access actualizado con los 5 módulos Test_* importados (3 MB de incremento).
- `8f59630 chore(binary): delete dead class InformeNCAuditorias from frontend` — retire del binary Access de la clase muerta `InformeNCAuditorias` (retirada del source en `53acb24`).
- `3fe801e chore(binary): sync frontend after rebase on staging post-merge #69` — rebase del binary post-merge del PR #69.

## 2. Issue #18 — Indicator cache (múltiples commits)

Implementación de cache de indicadores con sync per-NC, resolvers AC/AR, full rebuild y read/filter API. + Tests PHASE 2.1-2.7.

- `834d0de fix(issue-18): persist cache metadata in indicators` — persistencia de metadata.
- `53a0e03 feat(issue-18): add PHASE 2.1-2.7 tests + extend main test plan` — plan de tests extendido.
- `457eae1 test(issue-18): add indicadores-caracterizacion test plan`.
- `caac121 test(issue-18): add indicadores-caracterizacion test plan`.
- `c80f7bb fix(issue-18): test helpers InsertHeaderEstado and InsertFixtureRow set required IDCacheConfig and Dominio`.
- `276e2bc feat(issue-18): ModuloCacheIndicadoresIssue18 — per-NC sync, AC/AR resolvers, full rebuild, read/filter API` — el módulo principal.
- `7f7d15f docs(issue-18): document wu1 migration helper and pending phases`.
- `b7eaa86 feat(issue-18): add shared cache config table and idempotent migration helper` — **schema change**: nueva tabla `TbConfiguracionCacheIndicadores` (idempotente).
- `6cbd8f9 docs(issue-18): refresh indicator cleanup trace`.
- `12facba docs(issue-18): record manifest merge resolution`.
- `ff0eae8 merge(issue-18): reconcile remote manifest duplicate`.

**Impacto en performance**: los indicadores ya no recalculan en cada apertura del formulario. Carga bajo demanda con invalidación por NC. Cubierto en `Form_Form0BDOpcionesAuditorias` y `Form_Form0BDOpcionesParteProyectos`.

## 3. Issue #39 — NCProyecto cache-first (1 commit)

- `23af345 fix(cache): NCProyecto cache-first for ACs/ARs/Riesgos (closes #39)` — migrar el formulario `Form_FormNCProyecto` a lectura cache-first para acciones correctivas, acciones realizadas y riesgos. **Performance**: las acciones/riesgos ya no hacen N queries al backend en cada apertura.

## 4. Issue #45 — Backend del postpone (1 commit, complementario al #45 user-visible)

- `5db9ba3 fix(issue-45): NCAuditoria.DatosGeneralesOK supports p_MenosCef bypass` — agrega el parámetro `p_MenosCef` a `NCAuditoria.DatosGeneralesOK` para soportar el bypass del gate de control de eficacia. El cambio user-visible (commit `8cb7f0a`) está en el front-end; este es el back-end que lo habilita.

## 5. Issue #55 — Project seguimiento tareas helper (1 commit)

- `aa1ef79 feat(issue-55): add project seguimiento tareas helper` — nuevo helper `NCProyectoSeguimientoTareasListadoHelper.bas` para el listado de tareas de seguimiento de proyecto. Usado por `Form_FormNCProyectoSeguimiento` y `Test_NCProyectoSeguimientoTareasListadoHelper.bas` (11/11 tests PASS).

## 6. Cache infrastructure (audit list + project list)

- `3c4692f fix(cache): use workspace transaction for audit rebuild` — usar `DBEngine.Workspaces(0).BeginTrans` para el rebuild de cache de auditoría. Antes fallaba parcialmente si la tabla tenía > 1000 filas.
- `7e27db8 feat(cache): rebuild audit list cache` — implementa `RebuildNCAuditoriaListadoCache` con paths full + stale.
- `31977af feat(cache): read valid audit list cache` — implementa `ReadNCAuditoriaListadoCacheValid` con fallback observable.
- `e119189 feat(cache): add audit backend list cache schema` — **schema change**: nueva tabla `TbCacheListadoNCAuditoria` con índices idempotentes.
- `4b6cb64 refactor(forms): delegate audit gestion list workflow` — refactor de `Form_FormNCAuditoriaGestion` para delegar el listado al helper.
- `ea33758 fix(cache): preserve audit keyword fallback parity` — fix de paridad keyword/fallback en el helper de auditoría.
- `0aaec93 feat(cache): implement audit gestion helper fallback` — fallback observable cuando cache no disponible.
- `d77f0be test(cache): add audit gestion helper RED contracts` — tests RED para los contratos del helper.
- `2ca4de7 perf(forms): defer project tracking indicators` — diferir indicadores de seguimiento de proyecto.
- `500d6d5 perf(cache): route project listing form through helper` — enrutar `Form_FormNCProyectoGestion` por el helper.
- `07d3ff8 fix(cache): sync NC list cache updates` — fix de sync al actualizar entries del cache de listado de NCs.

## 7. Tests + manifest hygiene

- `4ff8f4f refactor(tests): split stateful indicator suites into dedicated manifests` — split de suites stateful en manifests dedicados para evitar el timeout del manifest de 55 procedimientos.
- `33b24e0 fix(tests): remove 8 conflicting E2E cache tests from manifest; add BeginTestSession stale recovery` — fix de tests E2E conflictivos + recovery de sesiones stale en `BeginTestSession`.
- `3e09db8 fix(vba): restore cache fixtures and config compatibility` — fix de compat de fixtures y config de cache.

## 8. Source binary sync (chore)

- `a6c4427 chore(access): sync compiled frontend binary`.
- `5c89e67 chore(access): sync compiled staging binary`.

## 9. Security

- `7ef58fa chore(security): ignore opencode.json (contains hardcoded ACCESS_VBA_PASSWORD)` — **importante**: previene commit del `ACCESS_VBA_PASSWORD` hardcodeado en `opencode.json`. Verificar con `git ls-files | grep opencode.json` que NO esté tracked.
- `b3e193d chore(security): remove backends.json (hardcoded credential)` — purge de `backends.json` del repo (tenía la password inline).
- `992122e chore(security): add backends.json.example template and gitignore rule` — template + gitignore para que el próximo dev no caiga en lo mismo.

## 10. Skill registry / SDD hygiene

- `15cca92 chore(skills): register access-vba-tdd in skill registry`.
- `c6d7c17 chore(skills): reinforce access-vba-tdd registry path`.
- `0c4a5fe docs(indicator-issues-cleanup): SDD closure section (#61)`.
- `5880861 docs(indicator-issues-cleanup): post-merge traceability update (#60)`.
- `ec6b4d0 chore(indicator-issues-cleanup): close Phase 3 + archive SDD (#59)`.
- `255e327 docs(closeout): audit open/closed issues vs origin/staging and origin/main`.
- `687a822 docs(indicator-issues-cleanup): refresh reachability after staging ff-merge`.
- `8cfb047 docs(ncproyecto-seguimiento-tareas-helper): correct implementation commit ref`.
- `08bd2a3 docs(incidents): log dysflow_verify_binary VBA_MANAGER_FAILED failure`.
- `1537749 Track 2 of the SDD-hygiene sweep`.
- `743ce99 chore(agents): align AGENTS.md with global + v1.2.32 reality`.
- `d702e37 chore(docs): add / refresh dysflow section in AGENTS.md`.
- `e4824d8 chore(agents): lock no_conformidades skill injection list`.
- `d8e3975 chore: aplicar gitignore para las bases de datos de Access`.

## 11. Operational checklist post-merge a `main`

- [ ] Tag de producción (formato sugerido: `v2026.06.staging-batch-2`).
- [ ] Cerrar los 11 issues abiertos en GitHub que se correspondan con governance resuelto (no los que son producto ausente).
- [ ] PR #58: decidir merge o close (actualmente OPEN con 8 commits únicos, archivado en `openspec/changes/archive/2026-06-12-form-fncproyecto-cache-invalidation/`).
- [ ] Archivar `docs/uat/PRUEBAS-002/` → `docs/uat/archive/` después de la aceptación.
- [ ] Si la aceptación es `ACEPTADO`: actualizar `docs/capabilities/*.md` §5 con el veredicto, fecha y tag de producción.

## 12. MCP gap observado (para el mantenedor de dysflow)

Re-iterando la lista del commit `09afaaf` (o de la sesión del fix e386a8b):

1. **Pre-flight estático de tests**: regex `DCount\(|DLookup\(` en `src/modules/Test_*.bas` antes de ejecutar `test_vba`. Hubiera ahorrado el ciclo de la sesión de #67.
2. **Inspector "qué tablas son linked y a qué backend"**: hoy hay que abrir Access VBE para saber si una tabla es local o linked.
3. **Wrapper `TestHelper.CountOnDb / LookupOnDb`**: boilerplate de `db.OpenRecordset` se repite en cada test.
4. **Mensaje específico de `RESULT_TABLES_MISMATCH`** cuando un test escribe vía sandbox pero assertea vía `CurrentDb`.

Mandá el #1 si solo mandás uno — es el que más impacto tiene.
