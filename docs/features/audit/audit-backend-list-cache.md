# audit-backend-list-cache — Audit list cache schema, read, rebuild, and transaction fix

> Backfilled from archive report `2026-06-06-audit-backend-list-cache/archive-report.md`. Sources: archive report, test manifest `audit-gestion-helper.json`, git history.

## Status

| Field | Value |
|-------|-------|
| **Current** | `passing / pending UAT-release` |
| **Last verified** | 2026-06-15 actualización documental con evidencia ya recogida; sin ejecución nueva de Dysflow/Access |
| **Manifest drift** | `clean` |
| **Scope note** | Evidencia `11/11` histórica de `staging` HEAD (no de este branch). El manifest `tests/tests.vba.audit-gestion-helper.json` NO está en este checkout. Ver [`docs/inventory/anomalies-investigation.md` Anexo A](../inventory/anomalies-investigation.md#anexo-a--cross-check-de-duplicación-a4-ejecutado-2026-06-15). Para reproducir, cherry-pick desde `origin/staging`. |
| **Staging reachability** | `reachable` — los 4 commits de integración de caché y el commit de corrección de regresión `ad96b95` son ancestros de `staging` |
| **TDD evidence** | `fresh` — 11/11 pass in manifest after audit report-path regression fix |
| **Last verified commit** | `ad96b95` — corrección de regresión registrada en `staging`; commit equivalente en la rama documental actual `c2026f5` |
| **Last verified at** | 2026-06-14 |
| **Test evidence** | `tests/tests.vba.audit-gestion-helper.json` 11/11 |
| **Staging integration commit** | `ad96b95` para la corrección de regresión de la ruta de informe; los commits de implementación de caché siguen siendo `e119189`, `31977af`, `7e27db8`, `3c4692f` |
| **Evidence updated at** | 2026-06-15 |

## Bloqueos de cierre

Aunque la evidencia runtime citada indica 11/11, esta página mantiene deuda de trazabilidad antes de cerrar release/UAT:

| Bloqueo/deuda | Estado actual | Siguiente evidencia requerida |
|---|---|---|
| SHA del arreglo de regresión | Resuelto: `ad96b95` en `staging`; existe commit equivalente `c2026f5` en la rama documental actual. | No requiere nueva ejecución runtime; conservar ambos SHAs como evidencia Git. |
| Discrepancia manifest/config | Resuelto por evidencia de Git: `staging:openspec/config.yaml` registra `tests/tests.vba.audit-gestion-helper.json` con 11 procedimientos, igual que el manifest citado. En este checkout no existe `openspec/config.yaml`, por lo que la evidencia disponible es histórica/de rama, no un archivo local. | Reconciliar físicamente `openspec/config.yaml` si se restaura `openspec/` en este checkout. |
| UAT/release | No hay tag UAT ni release de producción registrado en esta página. | Registrar `PRUEBAS-###`, estado UAT, release y rollback cuando existan. |

## Business Behavior

Audit list cache for the NC auditoria listing. The feature provides:
- Backend schema for audit list cache storage
- Cache read with valid/invalid detection
- Cache rebuild from backend source
- Transaction fix: workspace-level `BeginTrans`/`CommitTrans` for rebuild atomicity
- Invalidation to force full reload

## Acceptance Criteria

- [ ] Audit list cache schema is created in backend
- [ ] Cache read returns valid data when cache is fresh
- [ ] Cache read falls back to rebuild when cache is stale or missing
- [ ] Rebuild operation is atomic (workspace transaction)
- [ ] Invalidation forces next-access full reload

## Required Tests

| Procedure | Manifest | Status |
|-----------|----------|--------|
| `Test_NCAuditoriaGestionListadoHelper_*` (schema tests) | `tests/tests.vba.audit-gestion-helper.json` | PASS (7/7 initial) |
| `Test_NCAuditoriaGestionListadoHelper_*` (read tests) | `tests/tests.vba.audit-gestion-helper.json` | PASS (9/9 after read commit) |
| `Test_NCAuditoriaGestionListadoHelper_*` (all tests) | `tests/tests.vba.audit-gestion-helper.json` | PASS (11/11 final; reverified 2026-06-14) |
| `Test_AuditGestionForm_ReportConstructorPath_Characterization` | `tests/tests.vba.audit-gestion-helper.json` | PASS — report path delegates through audit selection helper |

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | 2026-06-14 |
| **Commits** | `e119189`, `31977af`, `7e27db8`, `3c4692f`; corrección de regresión `ad96b95` en `staging` (commit equivalente en la rama documental actual `c2026f5`) |
| **Manifest** | `tests/tests.vba.audit-gestion-helper.json` |
| **Result** | 11/11 |

## Integration Commits

| SHA | Message | Ancestor of staging |
|-----|---------|---------------------|
| `e119189` | `feat(cache): add audit backend list cache schema` | Yes — verified 2026-06-14 |
| `31977af` | `feat(cache): read valid audit list cache` | Yes — verified 2026-06-14 |
| `7e27db8` | `feat(cache): rebuild audit list cache` | Yes — verified 2026-06-14 |
| `3c4692f` | `fix(cache): use workspace transaction for audit rebuild` | Yes — verified 2026-06-14 |
| `ad96b95` | `fix(audit): ComandoInforme_Click routes through EnsureNCAuditoriaGestionSelected` | Yes — verificado 2026-06-15 con `git merge-base --is-ancestor ad96b95 staging` exit `0`; el commit equivalente de la rama documental actual `c2026f5` es ancestro del `HEAD` actual, no de `staging` |

## Access Sync Status

- **Import method**: Dysflow `import_modules` — `Test_NCAuditoriaGestionListadoHelper`, `NCAuditoriaListadoCache`, `NCAuditoriaGestionListadoHelper`; regression fix reimported `Form_FormNCAuditoriaGestion`
- **Manual compile**: confirmed per commit bodies; regression fix manually compiled by user on 2026-06-14 after import
- **verify_binary**: `Form_FormNCAuditoriaGestion` source and Access binary matched on 2026-06-14 (`verify_binary ok=true`, `.cls` + `.form.txt` matched)

## Rollback Anchor

Revert to commit before `e119189` to restore pre-cache state.

## Business Rules

- Audit list cache must reflect current backend audit data
- Cache rebuild must be atomic (workspace transaction)
- Cache invalidation must force full reload
- Schema must support audit listing pipe columns
- Audit report generation from `Form_FormNCAuditoriaGestion.ComandoInforme_Click` must hydrate selected NCs through the audit path (`ResolveNCAuditoriaGestionSelection` / `constructor.getNCAuditoria`), never the project constructor path (`constructor.getNCProyecto`)

## Legacy Not to Copy

- `Screen.ActiveForm` coupling for cache trigger detection
- Non-transactional cache rebuild (source/binary parity warning from verify-report)

## Migration Notes

_Web migration considerations — to be populated when migration work begins._

## Open Decisions

1. **Source/binary parity warning**: resolved for `Form_FormNCAuditoriaGestion` on 2026-06-14; `verify_binary` reported matched `.cls` and `.form.txt` after reimport/export sync.
2. **Manifest count discrepancy**: resolved from Git evidence. `staging:openspec/config.yaml` lists `tests/tests.vba.audit-gestion-helper.json` with 11 procedures, matching this page and the manifest evidence. Local caveat: this checkout has no `openspec/config.yaml` file.
3. **Regression-fix commit**: resolved as `ad96b95` on `staging`; the current documentation branch carries equivalent commit `c2026f5`.

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-06-audit-backend-list-cache/archive-report.md)
- [Test manifest: audit-gestion-helper](../../../tests/tests.vba.audit-gestion-helper.json)
- [Spec](../../../openspec/specs/audit-backend-list-cache/spec.md)

## Post-Test Documentation Gate

> **Rule**: Integration is not done until this section is updated. After staging integration and passing tests, update the Status section fields before declaring the work complete.

| Step | Action | Done |
|------|--------|------|
| 1 | Tests pass against staging HEAD | [x] (11/11 at `3c4692f`; 11/11 evidence carried by regression-fix commit `ad96b95` on `staging`) |
| 2 | `last_verified_commit` updated with SHA | [x] `ad96b95` |
| 3 | `last_verified_at` updated with ISO datetime | [x] |
| 4 | `test_evidence` updated with manifest + pass/total | [x] |
| 5 | `staging_integration_commit` updated with merge SHA | [x] `ad96b95` |
| 6 | `evidence_updated_at` updated with current datetime | [x] |
| 7 | Feature status reflects current state | [x] (`passing`, pending UAT/release) |

## Regression Evidence — 2026-06-14

| Field | Evidence |
|-------|----------|
| **Regression caught** | `ComandoInforme_Click` used the project constructor path instead of the audit selection/report path |
| **Failing test before fix** | `Test_AuditGestionForm_ReportConstructorPath_Characterization` — `Expected report path to delegate selected audit NC resolution` |
| **Fix** | `ComandoInforme_Click` now calls `EnsureNCAuditoriaGestionSelected`, which delegates through `ResolveNCAuditoriaGestionSelection` and `constructor.getNCAuditoria` |
| **Import evidence** | Dysflow `import_modules` for `Form_FormNCAuditoriaGestion` |
| **Compile evidence** | User manually compiled in Access VBE after import |
| **Runtime evidence** | `tests/tests.vba.audit-gestion-helper.json` passed 11/11 |
| **Sync evidence** | Dysflow `verify_binary` for `Form_FormNCAuditoriaGestion` returned `ok=true`, matched `.cls` and `.form.txt` |
| **Failure-detail harness check** | Controlled slice failure returned `VBA_TESTS_FAILED: 1 VBA test(s) failed: Test_AuditGestionForm_ReportConstructorPath_Characterization — Expected report path to delegate selected audit NC resolution` |

## Actualización documental — 2026-06-15

- No se ejecutaron tests, compilación ni importación en esta actualización documental.
- Evidencia runtime ya recogida: `tests/tests.vba.audit-gestion-helper.json` pasó 11/11 después del arreglo de selección de informe de auditoría.
- El arreglo ya importado en `src/forms/Form_FormNCAuditoriaGestion.cls` hace que `ComandoInforme_Click` use `EnsureNCAuditoriaGestionSelected`.
- El usuario compiló manualmente después de la importación y `dysflow_verify_binary` fue correcto para `Form_FormNCAuditoriaGestion.cls` y `.form.txt`.
- Evidencia adyacente de indicadores del lado Auditoría: `CacheIndicadoresAuditoriaMaterializado` 3/3; `Issue38_SeguimientoAuditoria` 1/1; `Issue38_ResetearColTareas` 1/1; slices de Issue #18 con Auditoria AC->NC, Auditoria AR hook y `CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio`.
- No afirmar que `tests/tests.vba.indicadores-caracterizacion.json` esté verde completo: la evidencia de indicadores es por slices y conserva las salvedades documentadas en otros sitios.
- Caveat de runner: la operación obsoleta `dysflow-51869803-608b-44bc-8792-ef9ca837b894`, posteriormente movida a `status=timed_out`, procede de una interrupción no relacionada de `proyecto-gestion-helper`; no es un fallo funcional de auditoría ni una prueba pendiente de gestión de proyecto.
