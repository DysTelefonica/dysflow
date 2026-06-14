# ncproyecto-seguimiento-tareas-helper — Deferred project tracking indicators

> Backfilled from archive report `2026-06-07-ncproyecto-seguimiento-tareas-helper/archive-report.md`. Sources: archive report, test manifest `seguimiento-tareas-helper.json`, git history.

## Status

| Field | Value |
|-------|-------|
| **Current** | `passing` |
| **Last verified** | 2026-06-07 |
| **Manifest drift** | `clean` |

## Business Behavior

Deferred project tracking indicators for NCProyecto follow-up. The helper module `NCProyectoSeguimientoHelper` provides:
- Tracking indicator calculation for deferred project tasks
- Status display on the NCProyecto follow-up form
- Helper seams for UI-free testability

## Acceptance Criteria

- [ ] Tracking indicators correctly reflect deferred project task status
- [ ] Helper module provides UI-free seams for testability
- [ ] All 9 test procedures pass

## Required Tests

| Procedure | Manifest | Status |
|-----------|----------|--------|
| `Test_NCProyectoSeguimientoHelper_*` (9 procedures) | `tests/tests.vba.seguimiento-tareas-helper.json` | PASS (9/9) |

## Last Known Passing

| Field | Value |
|-------|-------|
| **Date** | 2026-06-07 |
| **Commit** | `aa1ef79` |
| **Manifest** | `tests/tests.vba.seguimiento-tareas-helper.json` |
| **Result** | 9/9 |

## Integration Commits

| SHA | Message | Ancestor of staging |
|-----|---------|---------------------|
| `aa1ef79` | `feat(issue-55): add project seguimiento tareas helper` | Yes — verified 2026-06-14 |

## Access Sync Status

- **Import method**: Dysflow `import_modules` (per archive evidence)
- **Manual compile**: confirmed 2026-06-07 (per archive evidence)
- **verify_binary**: not run

## Rollback Anchor

Revert to commit before `aa1ef79` to restore pre-seguimiento state.

## Business Rules

- Tracking indicators must correctly reflect deferred project task status
- Helper must provide UI-free seams for testability
- Form integration must preserve tracking indicator display

## Legacy Not to Copy

- `Screen.ActiveForm` coupling for form state detection
- Direct DAO access from form code-behind

## Migration Notes

_Web migration considerations — to be populated when migration work begins._

## Open Decisions

1. **Review-size exception**: SDD review budget was exceeded and explicitly accepted as `size:exception`.
2. **Manual UI validation**: Final Access UI validation remains manual by user boundary; automated verification covers helper/form-called logic through UI-free seams only.

## Evidence Sources

- [Archive report](../../../openspec/changes/archive/2026-06-07-ncproyecto-seguimiento-tareas-helper/archive-report.md)
- [Test manifest: seguimiento-tareas-helper](../../../tests/tests.vba.seguimiento-tareas-helper.json)
- [Spec](../../../openspec/specs/seguimiento-tareas-helper/spec.md)
