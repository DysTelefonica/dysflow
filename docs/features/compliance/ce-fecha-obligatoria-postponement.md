# ce-fecha-obligatoria-postponement — Postpone FechaPrevistaControlEficacia gating to NC close

> Backfilled from archive report `2026-06-06-ce-fecha-obligatoria-postponement/archive-report.md`. Sources: archive report, test manifest `tests.vba.json` (filter=issue-19), git history.

## Status

| Field | Value |
|-------|-------|
| **Current** | `passing` |
| **Last verified** | 2026-06-06 |
| **Manifest drift** | `clean` |
| **Staging reachability** | `reachable` — commit `8cb7f0a` is ancestor of `staging` |
| **TDD evidence** | `fresh` — 13/13 pass in manifest at verified staging commit |
| **Last verified commit** | `8cb7f0a` |
| **Last verified at** | 2026-06-06 |
| **Test evidence** | `tests/tests.vba.json` (filter=issue-19) 13/13 |
| **Staging integration commit** | `8cb7f0a` |
| **Evidence updated at** | 2026-06-06 |

## Business Behavior

Compliance gating for `FechaPrevistaControlEficacia` — postponed from NC creation/edit to NC close. The change ensures:
- `FechaPrevistaControlEficacia` is not enforced during NC alta or edicion
- Gating is enforced only when the NC is closed
- Bypass scenarios for alta, edicion, and auditoria all pass
- `EficaciaOK` invariance is preserved

## Acceptance Criteria

- [ ] `FechaPrevistaControlEficacia` is not enforced during NC alta
- [ ] `FechaPrevistaControlEficacia` is not enforced during NC edicion
- [ ] `FechaPrevistaControlEficacia` gating is enforced at NC close
- [ ] Bypass scenarios for alta/edicion/auditoria all pass
- [ ] `EficaciaOK` invariance is preserved

## Required Tests

| Procedure | Manifest | Status |
|-----------|----------|--------|
| `Test_Issue19_*` (13 procedures, filter=issue-19) | `tests/tests.vba.json` | PASS (13/13) |

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | 2026-06-06 |
| **Commit** | `8cb7f0a` |
| **Manifest** | `tests/tests.vba.json` (filter=issue-19) |
| **Result** | 13/13 |

## Integration Commits

| SHA | Message | Ancestor of staging |
|-----|---------|---------------------|
| `8cb7f0a` | `feat(NC): postpone FechaPrevistaControlEficacia gating to NC close (closes #45)` | Yes — verified 2026-06-14 |

## Access Sync Status

- **Import method**: Dysflow `import_modules` — `NCProyectoOperaciones`, `NCaUDITORIAOperaciones`, `Test_Issue19_CEGating`
- **Manual compile**: confirmed 2026-06-06 (per commit body)
- **verify_binary**: not run

## Rollback Anchor

Revert to commit before `8cb7f0a` to restore original FE gating behavior.

## Business Rules

- `FechaPrevistaControlEficacia` must not block NC creation or editing
- Gating must be enforced only at NC close
- Bypass must work for alta, edicion, and auditoria contexts
- `EficaciaOK` must remain invariant

## Legacy Not to Copy

- Tempvar-based gating state across form events
- Direct form-field gating logic instead of service-layer enforcement

## Migration Notes

_Web migration considerations — to be populated when migration work begins._

## Open Decisions

1. **Deferred task 3.2**: `Form_FormNCAuditoriaGeneral.ComandoControlEficaciaDatos_Click` needs `NCAuditoria.DatosGeneralesOK(p_MenosCef)` before it can pass the bypass. Not blocking current status.

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-06-ce-fecha-obligatoria-postponement/archive-report.md)
- [Test manifest: tests.vba.json](../../../tests/tests.vba.json) (filter=issue-19)
- [Spec](../../../openspec/specs/ce-fecha-obligatoria-postponement/spec.md)

## Post-Test Documentation Gate

> **Rule**: Integration is not done until this section is updated. After staging integration and passing tests, update the Status section fields before declaring the work complete.

| Step | Action | Done |
|------|--------|------|
| 1 | Tests pass against staging HEAD | [x] (13/13 at `8cb7f0a`) |
| 2 | `last_verified_commit` updated with SHA | [x] |
| 3 | `last_verified_at` updated with ISO datetime | [x] |
| 4 | `test_evidence` updated with manifest + pass/total | [x] |
| 5 | `staging_integration_commit` updated with merge SHA | [x] |
| 6 | `evidence_updated_at` updated with current datetime | [x] |
| 7 | Feature status reflects current state | [x] (`passing`) |
