# Feature Catalog

> **Business-first entry point**: start in [`docs/capabilities/`](../capabilities/) when you need to understand what the app does. This directory is the technical/regression evidence layer that supports those capabilities.

> **Purpose**: First-class, stable, versioned source of truth for every No Conformidades feature. Each file documents what a feature is, whether it works today, how to recover from regression, and what to preserve during migration.

**Canonical location**: `docs/features/` — this directory, not `openspec/`, is the permanent home.

> **Nota de trazabilidad**: este índice referencia `openspec/REGRESSION-ANCHOR.md` como ancla documental; ese archivo está presente en este checkout y reconciliado por `f122d9a chore(sdd): reconcile openspec config for capability catalog`. Para trazabilidad operativa, las páginas de `docs/features/`, [`docs/capabilities/release-uat-rollback-traceability.md`](../capabilities/release-uat-rollback-traceability.md) y los commits/manifests citados siguen siendo la fuente primaria de evidencia.

## How to use

| Audience | Action |
|----------|--------|
| SDD `sdd-tasks` | Read the relevant feature file before planning implementation |
| SDD `sdd-apply` | Update behavior, tests, sync status after implementation |
| SDD `sdd-verify` | Update `last_known_passing`, `manifest_drift_status` |
| SDD `sdd-archive` | Update `integration_commits`, `access_sync_status`, `status` |
| Anyone | Read any feature file to understand current state |

## Schema summary (REQUIRED fields)

Every feature file MUST populate these fields. Empty = close-gate fails.

| Field | Description |
|-------|-------------|
| `feature_key` | Stable identifier (e.g. `form-ncproyecto-helper-coverage`) |
| `short_description` | One-line business capability |
| `acceptance_criteria` | Bullet list defining "done" |
| `required_tests` | Procedure names + manifest file paths |
| `last_known_passing` | Date, commit SHA, manifest, pass/total |
| `integration_commits` | SHAs reaching `staging` with `is-ancestor` evidence |
| `access_sync_status` | Import method, manual compile, `verify_binary` result |
| `rollback_anchor` | Commit to revert to, or "no rollback needed" |
| `business_rules` | Preserved functional capabilities |
| `legacy_not_to_copy` | Access anti-patterns web migration must NOT replicate |
| `migration_notes` | Web migration considerations (empty until migration begins) |
| `status` | `active` / `passing` / `regressed` / `archived` |
| `last_verified` | ISO date of most recent verification |
| `manifest_drift_status` | `clean` / `drifted` / `unregistered` |
| `staging_reachability` | `reachable` / `not-reachable` — ALL `integration_commits` must be ancestors of `staging` |
| `tdd_evidence` | `fresh` / `thin` / `none` — fresh = manifest/test_vba run against current HEAD or verified staging commit; thin = commit-message-level only; none = no evidence |

## Domains

| Domain | Features | Description |
|--------|----------|-------------|
| `project-listing` | 2 | NCProyecto listing, helpers, form integration, tracking indicators |
| `cache-management` | 3 | Cache invalidation, rebuild, trust, shared indicator cache |
| `audit` | 1 | Audit list cache, transaction fixes |
| `compliance` | 1 | CE gating, date enforcement |

## How to add a feature

1. Copy `_template.md` to `docs/features/<domain>/<feature-key>.md`
2. Fill every REQUIRED field (see schema above)
3. Cross-reference at least 2 independent evidence sources (archive report + test manifest, or git history + source module)
4. Add a row to `openspec/REGRESSION-ANCHOR.md` summary table when that artifact is present/reconciled; if it is absent in the checkout, record the gap in the feature page and in the release/UAT capability instead of inventing anchor content.
5. Add the feature to the domain listing above

## Manifest-to-feature mapping

The following `tests/*.json` manifests are mapped to features. Manifests not listed here are **unmapped** (either out of scope or pending feature file).

| Manifest | Feature key | Status |
|----------|-------------|--------|
| `tests.vba.form-helper.json` | `form-ncproyecto-helper-coverage` | mapped |
| `tests.vba.listado-helper.json` | `form-ncproyecto-helper-coverage` | mapped (drift documented; resolution pending) |
| `tests.vba.seguimiento-tareas-helper.json` | `ncproyecto-seguimiento-tareas-helper` | mapped |
| `tests.vba.proyecto-gestion-helper.json` | `form-fncproyecto-cache-invalidation` | mapped |
| `tests.vba.audit-gestion-helper.json` | `audit-backend-list-cache` | mapped |
| `tests.vba.json` (filter=issue-19) | `ce-fecha-obligatoria-postponement` | mapped |
| `tests.vba.cache-e2e.json` | `trust-ncproyecto-cache-hits` | mapped — cache trust diagnostics live here |
| `tests.vba.indicadores-caracterizacion.json` | `indicator-issues-cleanup` | mapped — Issue #18 shared indicator cache characterization |
| `tests.vba.indicator-fast-counts.json` | `indicator-issues-cleanup` | mapped — fast-count runtime coverage |
| `tests.vba.cache-materialized.json` | `indicator-issues-cleanup` | mapped — materialized indicator cache coverage |
| `tests.vba.cache-acar.json` | `indicator-issues-cleanup` | adjacent mapped coverage — AC/AR cache/listing invalidation |
| `tests.vba.cache-readiness.json` | `indicator-issues-cleanup` | adjacent mapped coverage — kill-switch/readiness/warm-up state |
| `tests.vba.cache-warmup.json` | `indicator-issues-cleanup` | adjacent mapped coverage — operator warm-up evidence |

**Manifest reconciliation notes**:

- `tests.vba.audit-gestion-helper.json` reconciliado en `staging:openspec/config.yaml` con 11 procedimientos; salvedad del checkout local: `openspec/config.yaml` está ausente.
- `tests.vba.listado-helper.json` marked retired in `openspec/config.yaml` with replacement `tests/tests.vba.proyecto-gestion-helper.json`.
- `tests.vba.proyecto-gestion-helper.json` registered in `openspec/config.yaml` as 8 procedures.
- `tests.vba.indicadores-caracterizacion.json` registered in `openspec/config.yaml` as 46 procedures and mapped to `indicator-issues-cleanup`.
- Remaining issue #67 work: prove all feature pages against fresh evidence, then remove any feature-level `pending evidence` / `pending traceability` markers.

## Bloqueos de cierre descubiertos

| Feature | Bloqueo/deuda | Dónde seguir |
|---|---|---|
| `indicator-issues-cleanup` | Evidencia mixta: hay slices verdes y focused PASS para reconstrucción completa/fallo post-escritura, pero no hay manifest completo verde; commits Phase 3 no reconciliados con `staging` y faltan UAT/release. | [`cache-management/indicator-issues-cleanup.md`](cache-management/indicator-issues-cleanup.md) |
| `audit-backend-list-cache` | SHA de regresión resuelto (`ad96b95` en `staging`; equivalente `c2026f5` en la rama documental) y manifest/config reconciliado por `staging:openspec/config.yaml`; faltan filas UAT/release. | [`audit/audit-backend-list-cache.md`](audit/audit-backend-list-cache.md) |
| Anchor transversal | `openspec/REGRESSION-ANCHOR.md` presente y reconciliado por `f122d9a`; copia externa en `C:\00repos\documentacion\OPENSPEC\00_No_Conformidades` pendiente de verificación. | [`../capabilities/release-uat-rollback-traceability.md`](../capabilities/release-uat-rollback-traceability.md) |

## Release & Branching Policy

| Branch | Role | Rules |
|--------|------|-------|
| `main` | Current production state | Updated only after UAT approval; never direct commits |
| `staging` | UAT / integration candidate | All feature work targets this branch |

### UAT → Production flow

1. Feature work targets `staging` (all SDD changes, PRs, merges).
2. After UAT with colleagues passes on `staging`, production release = `main` updated to exactly the approved `staging` state.
3. If production goes badly, rollback = revert `main` to the previous production release commit.

### UAT Tag Policy

Each UAT round against staging produces an **immutable UAT tag**. Tags are sequential and never reused.

| Rule | Detail |
|------|--------|
| **Naming** | `PRUEBAS-001`, `PRUEBAS-002`, `PRUEBAS-003`, … (increment on each UAT round) |
| **When created** | Every time staging is promoted to UAT, create the next tag before testing begins |
| **Immutability** | Once created, a UAT tag points to an exact commit and never moves |
| **Issue found** | Fix staging → create next UAT tag for the new round |
| **All approved** | The final approved UAT tag is the release gate — production promotion records this tag |
| **Production release** | `main` is updated to the approved staging state; a production release tag/record is created |
| **Rollback** | Revert `main` to the previous production release commit/tag |

**Close-gate rule**: No feature may be promoted to production without a recorded, approved final UAT tag in its Release Tracking section.

---

## Close-gate checklist

Before declaring any feature closed:

- [ ] Feature file exists with all REQUIRED sections populated
- [ ] `required_tests` matches actual procedures in source modules
- [ ] `last_known_passing` references test run against current HEAD
- [ ] `manifest_drift_status` is `clean` or drift is documented with resolution plan
- [ ] `access_sync_status` records import/compile evidence (or N/A)
- [ ] `integration_commits` lists SHAs with `is-ancestor` verification
- [ ] **Staging reachability gate**: ALL `integration_commits` SHAs must be reachable from `staging` (`git merge-base --is-ancestor <sha> staging` = true). If ANY commit is not reachable, the feature status **cannot** be `passing` — it must be `not-current` or `regressed` until the commits are merged or recreated into `staging`.
- [ ] **TDD evidence gate**: Fresh `test_vba` run evidence (manifest pass/total against current HEAD or a verified staging commit) is required before the feature can be declared `passing` or ready for UAT/release. Commit-message-level evidence ("3/3 green" in a commit body) is **not sufficient** for this gate — it must be a manifest result or Dysflow test run output.
- [ ] **Post-test documentation gate**: After staging integration and passing tests, the feature ledger Status section is updated with fresh evidence before declaring work complete. Required fields: `last_verified_commit`, `last_verified_at`, `test_evidence`, `staging_integration_commit`, `evidence_updated_at`. Integration is **not done** until this gate is satisfied.
- [ ] **UAT tag gate**: `approved_uat_tag` is recorded (or N/A for features not yet in UAT)
- [ ] `openspec/REGRESSION-ANCHOR.md` summary table links to the feature file, or the checkout explicitly records that the anchor is absent/pending reconciliation
- [ ] This README domain listing includes the feature

## Post-Test Documentation Gate (mandatory workflow rule)

> **Integration is not done until the docs are updated with passing evidence.**

When missing work is integrated into staging and tests pass, the feature ledger must be updated **immediately** before declaring the work complete. This is required so any future regression can be detected quickly from the ledger: last passing commit, tests/manifests, evidence, UAT tag/release status, rollback anchor.

| Step | Gate | Required field(s) |
|------|------|-------------------|
| 1 | Tests pass against staging HEAD | — |
| 2 | Feature ledger Status section updated | `last_verified_commit`, `last_verified_at` |
| 3 | Test evidence recorded | `test_evidence` |
| 4 | Staging integration commit recorded | `staging_integration_commit` |
| 5 | Evidence timestamp recorded | `evidence_updated_at` |
| 6 | Feature status reflects current state | `Current` |

**Why this matters**: Without this gate, a regression can go undetected because the ledger still shows stale evidence from a previous run. The `evidence_updated_at` field creates a clear audit trail: if evidence is older than the latest integration commit, the feature is not verified against current code.
