# Regression Anchor — Feature Traceability Index

> **Purpose**: Navigational index pointing to the canonical feature catalog at `docs/features/`. The data lives in `docs/features/<domain>/<key>.md`; this file is the summary table and process enforcement point.

## Close-Gate Checklist

Before declaring any feature/Spec closed or archived, **all** of these must be true:

1. [ ] Feature file exists at `docs/features/<domain>/<key>.md` with all REQUIRED sections populated.
2. [ ] `required_tests` matches actual procedures in `src/modules/Test_*.bas` (not just the manifest).
3. [ ] `last_known_passing` references a test run against **current HEAD**, not a stale prior run.
4. [ ] `manifest_drift_status` is `clean` or drift is documented with resolution plan.
5. [ ] `access_sync_status` records import/compile evidence (or N/A).
6. [ ] `integration_commits` lists SHAs with `git merge-base --is-ancestor` verification.
7. [ ] **Staging reachability gate**: ALL `integration_commits` SHAs are reachable from `staging`. If ANY commit is not reachable, the feature status **cannot** be `passing` — it must be `not-current` or `regressed` until commits are merged or recreated into `staging`.
8. [ ] **TDD evidence gate**: Fresh `test_vba` run evidence (manifest pass/total against current HEAD or verified staging commit) is required before the feature can be declared `passing` or ready for UAT/release. Commit-message-level evidence is **not sufficient**.
9. [ ] **Post-test documentation gate**: After staging integration and passing tests, the feature ledger Status section is updated with fresh evidence before declaring work complete. Required fields: `last_verified_commit`, `last_verified_at`, `test_evidence`, `staging_integration_commit`, `evidence_updated_at`. Integration is **not done** until this gate is satisfied.
10. [ ] `uat_status` is `approved` or N/A for features not yet in UAT.
11. [ ] **UAT tag gate**: `approved_uat_tag` is recorded (or N/A) — no production promotion without an approved final UAT tag.
12. [ ] This summary table links to the feature file.
13. [ ] `docs/features/README.md` domain listing includes the feature.

If any check fails, the feature is **not closed** — fix the gap first.

---

## How SDD Phases Read/Write the Catalog

| Phase | Read | Write |
|-------|------|-------|
| `sdd-tasks` | Read affected `docs/features/<key>.md` before planning | Note which fields will change |
| `sdd-apply` | Read current state | Update behavior, tests, sync status |
| `sdd-verify` | Read current state | Update `last_known_passing`, `manifest_drift_status` |
| `sdd-archive` | Read current state | Update `integration_commits`, `access_sync_status`, `status` |
| `sdd-propose` | Read existing features to avoid duplication | Create new feature file if introducing new capability |
| **Post-test gate** | Read current Status section | Update `last_verified_commit`, `last_verified_at`, `test_evidence`, `staging_integration_commit`, `evidence_updated_at` |
| UAT gate | Read `uat_tag`, `uat_tag_history` | Update `uat_tag`, `uat_tag_history`, `uat_status`, `uat_evidence` |
| Production gate | Read `approved_uat_tag` | Update `production_release_tag`, `production_release_commit`, `production_date`, `rollback_release_tag` |

---

## Feature Summary

| feature_key | short_description | status | staging_reachability | tdd_evidence | last_known_passing | manifest_drift_status | ledger_link |
|-------------|-------------------|--------|---------------------|--------------|--------------------|-----------------------|-------------|
| `form-ncproyecto-helper-coverage` | NCProyecto listing helper coverage | ✅ `passing` (B3 RESOLVED) | `reachable` (500d6d5/2ca4de7 ancestors) | `fresh` (9/9 at staging HEAD `20b71f64` 2026-06-14) | 2026-06-14, `20b71f64`, 9/9 (form-helper) | `clean` (listado-helper retired) | [link](../docs/features/project-listing/nc-proyecto-gestion-listado.md) |
| `form-fncproyecto-cache-invalidation` | NCProyecto listing cache invalidation | ✅ `passing` (B1 RESOLVED) | `reachable` (export/reimport path; all functional changes at staging HEAD) | `fresh` (8/8 at staging HEAD `20b71f64` 2026-06-14) | 2026-06-14, `20b71f64`, 8/8 | `clean` (proyecto-gestion-helper) | [link](../docs/features/cache-management/form-fncproyecto-cache-invalidation.md) |
| `ncproyecto-seguimiento-tareas-helper` | Deferred project tracking indicators | `passing` | `reachable` (`aa1ef79` ancestor) | `fresh` (9/9 at verified staging commit) | 2026-06-07, `aa1ef79`, 9/9 | `clean` | [link](../docs/features/project-listing/ncproyecto-seguimiento-tareas-helper.md) |
| `audit-backend-list-cache` | Audit list cache schema + read + rebuild + transaction fix | `passing` (pending fix commit traceability) | `reachable` (4 commits ancestors; regression fix pending commit SHA) | `fresh` (11/11 reverified 2026-06-14 after report-path fix) | 2026-06-14, `a2d5ae4` + working tree fix, 11/11 | `clean` | [link](../docs/features/audit/audit-backend-list-cache.md) |
| `ce-fecha-obligatoria-postponement` | Postpone FE gating to NC close | `passing` | `reachable` (`8cb7f0a` ancestor) | `fresh` (13/13 at verified staging commit) | 2026-06-06, `8cb7f0a`, 13/13 | `clean` | [link](../docs/features/compliance/ce-fecha-obligatoria-postponement.md) |
| `trust-ncproyecto-cache-hits` | Cache-first for ACs/ARs/Riesgos | ✅ `passing` (B2 RESOLVED) | `reachable` (`23af345` ancestor) | `fresh` (7/7 at staging HEAD `20b71f64` 2026-06-14; includes 3 cache-trust diagnostics) | 2026-06-14, `20b71f64`, 7/7 | `clean` (found in cache-e2e.json) | [link](../docs/features/cache-management/trust-ncproyecto-cache-hits.md) |
| `indicator-issues-cleanup` | Shared backend indicator cache and Issue #18 cleanup | `active` / `partial verified` | `partial / pending reconciliation` | `mixed` (slices Verified-runtime; 3 contratos divergentes previos resueltos 2026-06-15) | Historical 2026-06-12 archive evidence; 3 contratos divergentes resueltos 2026-06-15 (Issue18_GlobalCache en `Test_IndicadoresCaracterizacion.bas` + Issue38 + Issue50 vía refactor de `Form_FormNCProyectoSeguimiento.cls`); 1 caso pendiente por anomalía runner/COM (`HRESULT 0x800706BE` en `Test_Issue18_ReconstruirTodo_Idempotent_Atomic`); full manifest sigue timeouteando | `pending evidence` (full manifest timeout persiste) | [link](../docs/features/cache-management/indicator-issues-cleanup.md) |

**Issue #67 Documentation Epic (approved)**:

- No feature or business rule in `staging` may remain undocumented.
- Feature docs must support both regression prevention and future web migration.
- Any behavior without a feature ledger page is a gap, not acceptable hidden knowledge.

**Issue #67 + web-migration Feature-TDD coverage epic (change: `issue-67-feature-tdd-coverage`)**:

- Dual objective: migrate `no_conformidades` to a web application AND build the TDD coverage that lets us migrate without dragging Access/VBA debt.
- Bootstrap phase artifacts (Fase 0) created 2026-06-15:
  - Proposal: [`openspec/changes/issue-67-feature-tdd-coverage/proposal.md`](changes/issue-67-feature-tdd-coverage/proposal.md) — 4-phase plan (0 bootstrap, 1 inventory, 2 TDD authoring, 3 closeout) with 8 acceptance criteria.
  - Apply progress: [`openspec/changes/issue-67-feature-tdd-coverage/apply-progress.md`](changes/issue-67-feature-tdd-coverage/apply-progress.md) — live tracker with per-capability status and known gaps (BR-CE-5/6, BR-IND-8, BR-UPN-1..6/8, BR-XCUT-6, BR-DGE-1/2, BR-EXP-6/7, BR-REL-1..5).
- AC-1 (`docs/capabilities/index.md`) and AC-2 (`docs/inventory/feature-matrix.md`) are the next concrete deliverables (Fase 1).

**Phase 4 Blocker Resolution (2026-06-14)**:

- **B1 — form-fncproyecto-cache-invalidation ✅ RESOLVED**: equivalent changes (RebuildNCProyectoListadoCache, audit binding rename, helper seams) integrated into staging via binary export/reimport path (commit `20b71f6` and earlier). Original feat-branch SHAs are NOT ancestors but all functional code is verified present at staging HEAD. Full manifest `test_vba` 8/8 PASSED against staging HEAD `20b71f64`.
- **B2 — trust-ncproyecto-cache-hits ✅ RESOLVED**: cache-trust diagnostics procedures located in `tests/tests.vba.cache-e2e.json` (3 procedures: `Test_CacheTrust_LoadedEmptyARs_NoFallback_Atomic`, `Test_CacheTrust_LoadedEmptyRiesgos_NoFallback_Atomic`, `Test_CacheTrust_ARParentLink_NoFallback_Atomic`). Full manifest `test_vba` 7/7 PASSED against staging HEAD `20b71f64`.
- **B3 — form-ncproyecto-helper-coverage ✅ RESOLVED**: `tests/tests.vba.listado-helper.json` RETIRED (`_retired: true`, cleared test entries, recorded `_replacement_manifest: tests/tests.vba.proyecto-gestion-helper.json`). Full manifest `test_vba` 9/9 PASSED against staging HEAD `20b71f64`. Status `regressed` → `passing`.

**Indicator cache divergence updates (2026-06-15)**:

- **Issue18_GlobalCache ✅ RESOLVED**: `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` ahora 1/1. La query global del propio test se ajustó para sumar recuentos per-domain (`IDCacheIndicadorProyecto=1` + `IDCacheIndicadorProyecto=2`) y esquivar un quirk de caché DAO/Jet con `IN (1, 2)` en `COUNT(*)` sin más predicados. Aserciones por usuario (`QA_User` 3, `Otro_User` 2) ya pasaban; total global 5 filas. Implicación: BR-IND-3 y BR-IND-4 de `CAP-INDICATORS-DASHBOARD` promovidos a `Verified-runtime`.
- **Issue38_SeguimientoProyecto + Issue50_CargaDiferidaHelper ✅ RESOLVED**: `Test_Issue38_SeguimientoProyecto_ActualizarModoProyecto_Contract` y `Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract` ahora 1/1. Refactor de `src/forms/Form_FormNCProyectoSeguimiento.cls` alineado con el patrón de `Form_FormNCAuditoriaSeguimiento.cls`: flags privados (`m_CargaInicialIndicadoresPendiente`, `m_CargandoIndicadores`, `m_UltimaDuracionIndicadores`), sub `Form_Timer`, programación del timer en `Form_Load`, delegación a `NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto` con `p_DuracionSegundos:=m_UltimaDuracionIndicadores`. `OnTimer = "[Event Procedure]"` en el `.form.txt` (línea 369) ya estaba enlazado. No hay regresión en `Test_Issue38_SeguimientoAuditoria`.
- **Issue18_ReconstruirTodo ⏳ PENDIENTE por tooling (no funcional)**: `Test_Issue18_ReconstruirTodo_Idempotent_Atomic` devuelve `HRESULT 0x800706BE` tras ~58s; la auditoría posterior no encontró operación Dysflow viva ni lock activo del frontend. Anomalía de runner/COM, no regresión funcional. No marcar como fallo de comportamiento hasta obtener un retry limpio.

---

## Resolved / Archived Entries

_(Entries move here after the feature is archived and the regression anchor confirms no open gaps.)_

<!-- Future entries go here -->

---

## Active Divergences (2026-06-15)

Business rules that are not implementable today because the source-of-truth is partial or disputed. Each entry links to the affected capability doc, names the product owner that has to resolve it, and tracks the issue/MR.

### D1 — `BR-UPN-7` Matriz completa de permisos por rol × acción × dominio

- **Capability**: [`docs/capabilities/users-permissions-navigation.md`](../docs/capabilities/users-permissions-navigation.md) §2 BR-UPN-7.
- **Conflict**: la BR exige una matriz exhaustiva de "qué rol puede ejecutar qué acción sobre qué dominio" pero el código actual solo conoce 2 perfiles (`Admin` / `Resto`) y no persiste una matriz consultable; `cross-cutting-support` BR-XCUT-6 tiene la misma divergencia con un cross-link recíproco.
- **Confidence**: `Intended` en §7 del capability, con FALTA → autor = product owner.
- **Evidence of gap**:
  - `src/modules/ModuloPermisos.bas` / equivalente solo tiene 2 helpers de chequeo, no la matriz.
  - `docs/inventory/feature-matrix.md` no tiene feature `perm-matrix` con tests.
  - `tests.vba.upn.json` no tiene cobertura de la matriz.
- **Resolution path**: ticket al product owner para que (a) confirme las 2-3 dimensiones de la matriz (perfil, acción, dominio), (b) decida el formato de almacenamiento (¿tabla versionada? ¿Excel cargado? ¿constante en código?), (c) apruebe tests. Issue tracker: `00-no-conformidades-staging-clean#71` (a crear por el humano si la divergencia se mantiene más de 1 sprint).
- **Stop-the-line impact**: ninguna mientras la matriz no sea BR cargada; la app funciona con los 2 perfiles hardcoded.

### D2 — `BR-CE-5/6` Estados canónicos de control de eficacia y ventana de "fechas vs aceptar"

- **Capability**: [`docs/capabilities/control-eficacia-workflow.md`](../docs/capabilities/control-eficacia-workflow.md) §2 BR-CE-5 y BR-CE-6.
- **Conflict**: las BR describen un workflow de control de eficacia con al menos 4 estados canónicos (Planificado, EnEjecución, Cerrado-OK, Cerrado-NO) y una regla de "el FE se completa solo cuando hay fechas en todas las ACs" que aún tiene lagunas:
  - `BR-CE-5`: transición de `EnEjecución` a `Cerrado-OK` exige `EficaciaOK = Sí`. La implementación actual (`Test_CE_Gating_Atomic` y similares) valida el gate, pero la pregunta de qué pasa si `EficaciaOK = No` y `RequiereControlEficacia = Sí` está mal cubierta — ¿el CE se queda abierto para siempre? ¿se cierra como `Cerrado-NO` automáticamente? La respuesta no está en el doc.
  - `BR-CE-6`: "el FE se completa solo cuando todas las ACs tienen fecha real". El gate funciona en test, pero el doc original no resuelve el caso de NCs con cero ACs (¿FE se marca como N/A? ¿se cierra sin gate?).
- **Confidence**: `Intended` en §7 del capability, con FALTA → autor = product owner.
- **Evidence of gap**:
  - `tests.vba.ce.json` cubre BR-CE-1..4 con 13/13 PASS, pero no BR-CE-5/6 (se rehusaron con "FALTA → autor").
  - El commit `8cb7f0a` (Issue #19 CE postpone) solo implementa el gate "no permitir aceptar hasta que FE completo" — no resuelve el workflow post-aceptación.
- **Resolution path**: ticket al product owner que defina explícitamente (a) la matriz de transiciones, (b) el comportamiento en `EficaciaOK = No`, (c) el caso de NCs sin ACs. Issue tracker: `00-no-conformidades-staging-clean#72` (a crear por el humano si la divergencia se mantiene más de 1 sprint).
- **Stop-the-line impact**: ninguna mientras no se exija el workflow post-aceptación; el gate actual (BR-CE-1..4) sigue funcionando.

---

## Resolution Procedure for Active Divergences

1. El product owner cierra la decisión en un issue dedicado (plantilla: "BR-X-N: definir [la regla]" con campos "Contexto", "Opciones", "Recomendación", "Decisión").
2. El humano crea el issue, lo asigna al product owner, y mueve el BR de `Intended` a `Verified-static` (con link al issue como evidencia) o a `Likely` (con link al spec) en el §7 del capability afectado.
3. La implementación de la decisión puede entrar en una nueva change SDD; esta sección de REGRESSION-ANCHOR se actualiza para reflejar la resolución.
4. Cuando D1 y D2 estén cerrados, ambos se mueven a `## Resolved / Archived Entries` con SHA del commit de cierre.
