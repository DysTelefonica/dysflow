# Apply Progress: ce-fecha-obligatoria-postponement

## Change identity

- **SDD key**: `ce-fecha-obligatoria-postponement`
- **Executed by**: sdd-apply sub-agent
- **Date**:2026-06-06
- **Mode**: auto | Artifacts: both | TDD: strict active

---

## Phase completion

| Phase | Description | Status | Notes |
|-------|-------------|--------|-------|
| 1 | NCProyectoOperaciones p_MenosCef bypass | ✅ COMPLETE | Tasks 1.1–1.4: implementation already present in source (commit8cb7f0a) |
| 2 | NCAuditoriaOperaciones p_MenosCef bypass | ✅ COMPLETE | Tasks 2.1–2.2: implementation already present in source (commit 8cb7f0a) |
| 3.1 | Form_FormNCProyectoGeneral CE button bypass | ✅ COMPLETE | Already calls `DatosGeneralesOK(EnumSino.Sí)` at line 254 — no edit needed |
| 3.2 | Form_FormNCAuditoriaGeneral CE button | ⏸️ DEFERRED | Requires `NCAuditoria.DatosGeneralesOK(p_MenosCef)` — entity does not yet accept p_MenosCef; tracked as separate issue |
| 4 | Tests + registration | ✅ COMPLETE | Tasks 4.1–4.6:5 test procedures exist in Test_Issue19_CEGating.bas and are registered in tests.vba.json |

---

## TDD cycle evidence

### RED phase
Tests were written in `Test_Issue19_CEGating.bas` targeting the bypass scenarios. The source already contained the implementation when this apply ran — tests were executed against the committed binary in 8cb7f0a (dated 2026-05-30).

### GREEN phase
Full `issue-19` filtered run via `dysflow.test_vba` with `testsPath=tests\tests.vba.json` and `filter=issue-19` on 2026-06-06: **13/13 PASS** (5 new bypass + 8 pre-existing #19 tests). Sandbox: `C:\00repos\datos\NoConformidades_Datos.accdb`.

| Test | Result | Duration |
|------|--------|----------|
| `Test_Issue19_CE_Alta_Si_SinDetalle_NoBloquea` | ✅ ok | 2840ms |
| `Test_Issue19_CE_Alta_Si_ConDetalle_Pasa` | ✅ ok | 2681ms |
| `Test_Issue19_CE_Alta_No_IgnoraDetalle` | ✅ ok | 2582ms |
| `Test_Issue19_CE_Cierre_SinDetalle_Bloquea` | ✅ ok | 2612ms |
| `Test_Issue19_CE_Cierre_ConDetalle_PermiteCierre` | ✅ ok | 2568ms |
| `Test_Issue19_CE_EstadoCalculado_Pendiente` | ✅ ok | 2569ms |
| `Test_Issue19_CE_EstadoCalculado_SinPendiente` | ✅ ok | 2661ms |
| `Test_Issue19_Paridad_UI_Dominio` | ✅ ok | 2579ms |
| `Test_Issue19_CE_Alta_MotivoAlta_Bypass_Si` | ✅ ok | 2544ms |
| `Test_Issue19_CE_Alta_MotivoAlta_Bypass_BlankRequereCE` | ✅ ok | 2605ms |
| `Test_Issue19_CE_Edicion_MotivoDatosUnicos_Bypass` | ✅ ok | 2452ms |
| `Test_Issue19_CE_Auditoria_MotivoDatosUnicos_Bypass` | ✅ ok | 2658ms |
| `Test_Issue19_CE_EficaciaOK_SinCambios` | ✅ ok | 2511ms |

The first 8 are pre-existing #19 tests in the same module; the last 5 are the new bypass procedures added in 8cb7f0a.

---

## Deferred task

**Task 3.2**: `Form_FormNCAuditoriaGeneral.ComandoControlEficaciaDatos_Click` (line 56 of `src/forms/Form_FormNCAuditoriaGeneral.cls`) calls `m_ObjNCAuditoriaActiva.DatosGeneralesOK` without the bypass parameter. This requires `NCAuditoria.DatosGeneralesOK` to first accept `p_MenosCef As EnumSino` — a pre-requisite tracked as a separate issue/SDD. **Do not close this SDD until the NCAuditoria entity supports the bypass.**

---

## Access sync

- **projectId**: `00-no-conformidades-staging-clean`
- **Access context**: opened ✅ (dysflow doctor check passed)
- **Import required**: No — source and binary are in sync; no pending edits in this session
- **Compile required**: No — user compile not triggered (no import performed). Compile was confirmed in commit 8cb7f0a body: `Access: ... user manual compile confirmed`.
- **Tests run**: 13/13 GREEN via `dysflow.test_vba` with `testsPath=tests\tests.vba.json` and `filter=issue-19` on 2026-06-06
- **Regression**: focused `issue-19` filter succeeded with no failures

---

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|--------|-----------|-----------|--------------|-------------|
| `8cb7f0a` | feat(NC): postpone FechaPrevistaControlEficacia gating to NC close (closes #45) | 1.1–1.4, 2.1–2.2, 3.1, 4.1–4.6 | 13/13 tests GREEN (issue-19 filter); EficaciaOK invariance confirmed; bypass scenarios for alta/edición/auditoría all pass | Source committed; binary unchanged (same size) in this session; previous Access import + user manual compile per commit body |

### Commit body (8cb7f0a)
```
feat(NC): postpone FechaPrevistaControlEficacia gating to NC close (closes #45)

SDD: ce-fecha-obligatoria-postponement
Tests: Test_Issue19_CE_Alta_MotivoAlta_Bypass_Si, Test_Issue19_CE_Alta_MotivoAlta_Bypass_BlankRequereCE, Test_Issue19_CE_Edicion_MotivoDatosUnicos_Bypass, Test_Issue19_CE_Auditoria_MotivoDatosUnicos_Bypass, Test_Issue19_CE_EficaciaOK_SinCambios
Access: NCProyectoOperaciones, NCaUDITORIAOperaciones, Test_Issue19_CEGating; user manual compile confirmed
```

---

## Source verification (line-exact)

| File | Method | Line | Finding |
|------|--------|------|---------|
| `src/classes/NCProyectoOperaciones.cls` | `MotivoAltaDatosUnicosNoOK` | 21 | `Optional ByVal p_MenosCef As EnumSino = EnumSino.No` ✅ |
| `src/classes/NCProyectoOperaciones.cls` | `MotivoAltaDatosUnicosNoOK` |112–124 | `If p_MenosCef <> EnumSino.Sí Then` wrapper ✅ |
| `src/classes/NCProyectoOperaciones.cls` | `MotivoDatosUnicosNoOK` | 206 | `Optional ByVal p_MenosCef As EnumSino = EnumSino.No` ✅ |
| `src/classes/NCProyectoOperaciones.cls` | `MotivoDatosUnicosNoOK` | 294–306 | `If p_MenosCef <> EnumSino.Sí Then` wrapper ✅ |
| `src/classes/NCProyectoOperaciones.cls` | `RegistrarDatosUnicos` | 333 | `Optional ByVal p_MenosCef As EnumSino = EnumSino.No` ✅ |
| `src/classes/NCProyectoOperaciones.cls` | `RegistrarDatosUnicos` | 347 | passes `p_MenosCef` to `MotivoDatosUnicosNoOK` ✅ |
| `src/classes/NCProyectoOperaciones.cls` | `RegistrarAltaDatosUnicosConVinculoNC` | 600 | `Optional ByVal p_MenosCef As EnumSino = EnumSino.No` ✅ |
| `src/classes/NCProyectoOperaciones.cls` | `RegistrarAltaDatosUnicosConVinculoNC` | 618 | passes `p_MenosCef` to `MotivoAltaDatosUnicosNoOK` ✅ |
| `src/classes/NCaUDITORIAOperaciones.cls` | `MotivoDatosUnicosNoOK` | 21 | `Optional ByVal p_MenosCef As EnumSino = EnumSino.No` ✅ |
| `src/classes/NCaUDITORIAOperaciones.cls` | `MotivoDatosUnicosNoOK` | 80–92 | `If p_MenosCef <> EnumSino.Sí Then` wrapper ✅ |
| `src/classes/NCaUDITORIAOperaciones.cls` | `RegistrarDatosUnicos` | 113 | `Optional ByVal p_MenosCef As EnumSino = EnumSino.No` ✅ |
| `src/classes/NCaUDITORIAOperaciones.cls` | `RegistrarDatosUnicos` | 127 | passes `p_MenosCef` to `MotivoDatosUnicosNoOK` ✅ |
| `src/forms/Form_FormNCProyectoGeneral.cls` | `ComandoControlEficaciaDatos_Click` | 254 | `m_ObjNCProyectoActiva.DatosGeneralesOK(EnumSino.Sí)` ✅ — no edit needed |
| `src/forms/Form_FormNCAuditoriaGeneral.cls` | `ComandoControlEficaciaDatos_Click` | 56 | `m_ObjNCAuditoriaActiva.DatosGeneralesOK` (no bypass) — DEFERRED |

---

## Notes

- The implementation was already present in staging when this apply ran (commit `8cb7f0a`,2026-05-30). The SDD artifacts (`proposal.md`, `SPEC.md`, `DESIGN.md`, `TASKS.md`) were created on 2026-05-29 — one day before the implementation commit, suggesting the SDD preceded implementation as expected.
- No source edits were required in this session; git working tree was clean.
- No `dysflow.import_modules` call was needed — source and binary are in sync.
- Task 3.2 remains open as a pre-requisite gap: `NCAuditoria.DatosGeneralesOK` does not accept `p_MenosCef`, blocking the NCAuditoria form button bypass.
