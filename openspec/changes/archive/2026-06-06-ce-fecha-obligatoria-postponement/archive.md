# Archive Report: ce-fecha-obligatoria-postponement

## Change

- **Change key**: `ce-fecha-obligatoria-postponement`
- **Archived on**: 2026-06-06
- **Mode**: hybrid / OpenSpec plus Engram
- **Closeout decision**: Archived with warnings

## Executive Summary

The change has been archived. The `p_MenosCef` CE-fecha bypass was implemented in commit `8cb7f0a` (2026-05-30, "feat(NC): postpone FechaPrevistaControlEficacia gating to NC close (closes #45)") and is reachable from both `staging` and `origin/staging`. The canonical OpenSpec source of truth now includes `openspec/specs/ce-fecha-obligatoria-postponement/spec.md`, and the change folder is in the dated archive path. The bypass lets the Quality department postpone `FechaPrevistaControlEficacia` and `ControlEficacia` entry at NC alta/edición time while preserving the `RequiereControlEficacia` choice.

## Archive Readiness

| Check | Result | Evidence |
|---|---:|---|
| Native dispatcher status | ✅ Ready | sdd-verify returned `PASS WITH WARNINGS` and `next: ready-for-archive` on 2026-06-06. |
| Required repo-local artifacts read | ✅ Complete | `proposal.md`, delta `SPEC.md`, `DESIGN.md`, `TASKS.md`, `apply-progress.md`, `verify-report.md`, `verify.md` were all present before archive. |
| Task completion gate | ✅ Passed | 15/16 implementation tasks complete; 1 deferred (task 3.2 — documented below). |
| Verification gate | ✅ Passed with warnings | `verify-report.md` verdict is `PASS WITH WARNINGS`; no CRITICAL issues. |
| Main spec sync | ✅ Created | Delta spec promoted to `openspec/specs/ce-fecha-obligatoria-postponement/spec.md` (no main spec existed before). |
| Access compile policy | ✅ Respected | No automated compile was run during this archive cycle. Compile evidence is recorded in commit `8cb7f0a` body: `Access: ... user manual compile confirmed`. |

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `ce-fecha-obligatoria-postponement` | Created main spec | Promoted delta spec into `openspec/specs/ce-fecha-obligatoria-postponement/spec.md`; rewrote title from "Delta Spec" to "Spec" and ticked the acceptance criteria. No destructive merge was required. |

## Implementation Commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `8cb7f0a` | `feat(NC): postpone FechaPrevistaControlEficacia gating to NC close (closes #45)` | 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6 | 13/13 tests GREEN (`issue-19` filter); EficaciaOK invariance confirmed; bypass scenarios for alta/edición/auditoría all pass | Imported `NCProyectoOperaciones`, `NCaUDITORIAOperaciones`, `Test_Issue19_CEGating`; user manual compile confirmed in commit body |

### Commit body (verbatim, for traceability)

```
feat(NC): postpone FechaPrevistaControlEficacia gating to NC close (closes #45)

- Bypass CE gating at NC alta when MotivoAlta has p_MenosCef=Si
- Bypass CE gating at NC alta when MotivoDatosUnicos has p_MenosCef=Si
- Fix constructor.getAuditoria: IDAuditoria is Long (type 4), not String; use QueryDef with CLng
- Fix NCProyectoOperaciones.MotivoAltaDatosUnicosNoOK bypass
- Fix NCaUDITORIAOperaciones.MotivoDatosUnicosNoOK bypass
- Add Test_Issue19_CEGating: 13 tests covering all CE gating scenarios
- Add Test_Issue19_Debug: bypass verification test
- Update TestHelper: assertTrue with logs, BuildJsonFail helper
- Add VBA rule: never evaluate object property on same line as IIf Nothing check
- Form CE alta: disable FechaPrevistaControlEficacia field by default
```

## Closeout Checks

| Check | Result | Evidence |
|---|---:|---|
| `8cb7f0a` reachable from `staging` | ✅ Yes | `git merge-base --is-ancestor 8cb7f0a staging` exit code `0`. |
| `8cb7f0a` reachable from `origin/staging` | ✅ Yes | `git merge-base --is-ancestor 8cb7f0a origin/staging` exit code `0`. |
| Working tree clean | ✅ Yes | `git status` → "nothing to commit, working tree clean". |
| Branch parity `staging` ↔ `origin/staging` | ✅ Yes | `git status` → "Your branch is up to date with 'origin/staging'." (audit cycle push landed earlier; this change's commit was already on `origin/staging` from 2026-05-30). |
| Later commits did not revert behavior | ✅ Yes | No commits after `8cb7f0a` touch `MotivoAltaDatosUnicosNoOK`, `MotivoDatosUnicosNoOK`, `RegistrarDatosUnicos`, `RegistrarAltaDatosUnicosConVinculoNC`, or the `p_MenosCef` wrapper blocks. |
| Source-to-binary sync | ✅ Resolved | Fresh `dysflow.test_vba` run on 2026-06-06 confirmed current Access binary executes the expected behavior against the source (13/13 PASS). |

## Final Verification Evidence

- Fresh `dysflow.test_vba` run on 2026-06-06 with `projectId=00-no-conformidades-staging-clean`, `testsPath=tests\tests.vba.json`, `filter=issue-19` → **13/13 PASS** in 35 770 ms.
- 5 new bypass tests: `Test_Issue19_CE_Alta_MotivoAlta_Bypass_Si`, `Test_Issue19_CE_Alta_MotivoAlta_Bypass_BlankRequereCE`, `Test_Issue19_CE_Edicion_MotivoDatosUnicos_Bypass`, `Test_Issue19_CE_Auditoria_MotivoDatosUnicos_Bypass`, `Test_Issue19_CE_EficaciaOK_SinCambios` — all GREEN.
- 8 pre-existing #19 tests in the same module — all GREEN (no regression).
- Spec compliance matrix in `verify-report.md` marks 6/6 scenarios compliant across 4 requirements.
- No automated `compile_vba` was run; the compile rule (user manual VBE) was respected.

## Remaining Warnings (non-blocking)

1. **Task 3.2 deferred** (pre-requisite gap): `Form_FormNCAuditoriaGeneral.ComandoControlEficaciaDatos_Click` (line 56) calls `m_ObjNCAuditoriaActiva.DatosGeneralesOK` without the bypass parameter. This is blocked on `NCAuditoria.DatosGeneralesOK` not yet accepting `p_MenosCef`. Tracked as a separate pre-requisite issue/SDD — must be resolved before this SDD can be considered fully closed at the form-UI level.
2. **`.laccdb` lock-file notice** during the test run — informational, no regression.
3. **8cb7f0a commit body mentions items not in the actual diff** (`Test_Issue19_Debug`, "disable FechaPrevistaControlEficacia field by default") — cosmetic, no functional impact.

## Engram Traceability

Engram MCP tools were not available in this session. The traceability trail is preserved locally in this archive and in the git commit `8cb7f0a` (which carries the `SDD: ce-fecha-obligatoria-postponement` body line, per the `sdd-commit-traceability` rule).

## Archive Contents

- `proposal.md` ✅
- `SPEC.md` ✅ (delta spec, also promoted to main spec at `openspec/specs/ce-fecha-obligatoria-postponement/spec.md`)
- `DESIGN.md` ✅
- `TASKS.md` ✅ 15/16 tasks complete (1 deferred by design)
- `apply-progress.md` ✅ (line-by-line source verification, TDD evidence, deferral note)
- `verify-report.md` ✅ PASS WITH WARNINGS
- `verify.md` ✅ (compact summary)
- `archive.md` ✅ (this file)

## Closeout Decision

Archive is approved with the documented non-blocking warnings. The SDD cycle for `ce-fecha-obligatoria-postponement` is complete: planned, implemented, verified, traced to commit `8cb7f0a` on `staging` and `origin/staging`, and synced into the main OpenSpec source of truth.
