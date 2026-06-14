# audit-backend-list-cache — Audit list cache schema, read, rebuild, and transaction fix

> Backfilled from archive report `2026-06-06-audit-backend-list-cache/archive-report.md`. Sources: archive report, test manifest `audit-gestion-helper.json`, git history.

## Status

| Field | Value |
|-------|-------|
| **Current** | `passing` |
| **Last verified** | 2026-06-06 |
| **Manifest drift** | `clean` |
| **Staging reachability** | `reachable` — all 4 integration commits are ancestors of `staging` |
| **TDD evidence** | `fresh` — 11/11 pass in manifest at verified staging commits |
| **Last verified commit** | `3c4692f` (final commit) |
| **Last verified at** | 2026-06-06 |
| **Test evidence** | `tests/tests.vba.audit-gestion-helper.json` 11/11 |
| **Staging integration commit** | `3c4692f` |
| **Evidence updated at** | 2026-06-06 |

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
| `Test_NCAuditoriaGestionListadoHelper_*` (all tests) | `tests/tests.vba.audit-gestion-helper.json` | PASS (11/11 final) |

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | 2026-06-06 |
| **Commits** | `e119189`, `31977af`, `7e27db8`, `3c4692f` |
| **Manifest** | `tests/tests.vba.audit-gestion-helper.json` |
| **Result** | 11/11 |

## Integration Commits

| SHA | Message | Ancestor of staging |
|-----|---------|---------------------|
| `e119189` | `feat(cache): add audit backend list cache schema` | Yes — verified 2026-06-14 |
| `31977af` | `feat(cache): read valid audit list cache` | Yes — verified 2026-06-14 |
| `7e27db8` | `feat(cache): rebuild audit list cache` | Yes — verified 2026-06-14 |
| `3c4692f` | `fix(cache): use workspace transaction for audit rebuild` | Yes — verified 2026-06-14 |

## Access Sync Status

- **Import method**: Dysflow `import_modules` — `Test_NCAuditoriaGestionListadoHelper`, `NCAuditoriaListadoCache`, `NCAuditoriaGestionListadoHelper`
- **Manual compile**: confirmed per commit bodies
- **verify_binary**: not run

## Rollback Anchor

Revert to commit before `e119189` to restore pre-cache state.

## Business Rules

- Audit list cache must reflect current backend audit data
- Cache rebuild must be atomic (workspace transaction)
- Cache invalidation must force full reload
- Schema must support audit listing pipe columns

## Legacy Not to Copy

- `Screen.ActiveForm` coupling for cache trigger detection
- Non-transactional cache rebuild (source/binary parity warning from verify-report)

## Migration Notes

_Web migration considerations — to be populated when migration work begins._

## Open Decisions

1. **Source/binary parity warning**: `verify-report.md` notes Access casing/export-normalization differences between source and binary, although runtime behavior passed.
2. **Manifest count discrepancy**: `tests.vba.audit-gestion-helper.json` lists 11 procedures; `config.yaml` may reference fewer. Reconciliation pending.

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-06-audit-backend-list-cache/archive-report.md)
- [Test manifest: audit-gestion-helper](../../../tests/tests.vba.audit-gestion-helper.json)
- [Spec](../../../openspec/specs/audit-backend-list-cache/spec.md)

## Post-Test Documentation Gate

> **Rule**: Integration is not done until this section is updated. After staging integration and passing tests, update the Status section fields before declaring the work complete.

| Step | Action | Done |
|------|--------|------|
| 1 | Tests pass against staging HEAD | [x] (11/11 at `3c4692f`) |
| 2 | `last_verified_commit` updated with SHA | [x] |
| 3 | `last_verified_at` updated with ISO datetime | [x] |
| 4 | `test_evidence` updated with manifest + pass/total | [x] |
| 5 | `staging_integration_commit` updated with merge SHA | [x] |
| 6 | `evidence_updated_at` updated with current datetime | [x] |
| 7 | Feature status reflects current state | [x] (`passing`) |
