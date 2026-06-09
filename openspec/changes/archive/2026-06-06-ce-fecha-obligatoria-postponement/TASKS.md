# Tasks: ce-fecha-obligatoria-postponement

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~200 (ops ~130 + tests ~70) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR — all changes are additive parameter/wrapper work |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | NCProyectoOperaciones bypass + NCAuditoriaOperaciones bypass | PR 1 | Both ops classes + all new tests |

## Phase 1: NCProyectoOperaciones — add p_MenosCef bypass

- [ ] 1.1 `MotivoAltaDatosUnicosNoOK`: add `Optional p_MenosCef As EnumSino = EnumSino.No` param; wrap CE fecha checks (lines 111-121) with `If p_MenosCef <> EnumSino.Sí Then`
- [ ] 1.2 `MotivoDatosUnicosNoOK`: add `Optional p_MenosCef As EnumSino = EnumSino.No` param; wrap CE fecha checks (lines 290-300) with `If p_MenosCef <> EnumSino.Sí Then`
- [ ] 1.3 `RegistrarDatosUnicos`: add `Optional p_MenosCef As EnumSino = EnumSino.No` param; pass it to `MotivoDatosUnicosNoOK`
- [ ] 1.4 `RegistrarAltaDatosUnicosConVinculoNC`: add `Optional p_MenosCef As EnumSino = EnumSino.No` param; pass it to `MotivoAltaDatosUnicosNoOK`

## Phase 2: NCAuditoriaOperaciones — add p_MenosCef bypass

File: `src/classes/NCaUDITORIAOperaciones.cls` (note mixed-case filename)

- [ ] 2.1 `MotivoDatosUnicosNoOK`: add `Optional p_MenosCef As EnumSino = EnumSino.No` param; wrap CE fecha checks (lines 79-88) with `If p_MenosCef <> EnumSino.Sí Then`
- [ ] 2.2 `RegistrarDatosUnicos`: add `Optional p_MenosCef As EnumSino = EnumSino.No` param; pass it to `MotivoDatosUnicosNoOK`

## Phase 3: Forms — thread bypass through CE navigation flows

- [ ] 3.1 `Form_FormNCProyectoGeneral.ComandoControlEficaciaDatos_Click`: already calls `m_ObjNCProyectoActiva.DatosGeneralesOK(EnumSino.Sí)` — entity already supports bypass; no change needed
- [ ] 3.2 `Form_FormNCAuditoriaGeneral.ComandoControlEficaciaDatos_Click`: change `m_ObjNCAuditoriaActiva.DatosGeneralesOK` → `m_ObjNCAuditoriaActiva.DatosGeneralesOK(EnumSino.Sí)` (DEFERRED: requires `NCAuditoria.DatosGeneralesOK` to first accept `p_MenosCef` — see Open Issues)

## Phase 4: Tests — add bypass scenarios to Test_Issue19_CEGating.bas

- [ ] 4.1 Add `Test_Issue19_CE_Alta_MotivoAlta_Bypass_Si` — `MotivoAltaDatosUnicosNoOK` with `p_MenosCef=EnumSino.Sí` + RequiereCE="Sí" + empty CE fecha → returns ""
- [ ] 4.2 Add `Test_Issue19_CE_Alta_MotivoAlta_Bypass_BlankRequereCE` — `MotivoAltaDatosUnicosNoOK` with `p_MenosCef=EnumSino.Sí` + RequereCE="" → still returns blocking reason
- [ ] 4.3 Add `Test_Issue19_CE_Edicion_MotivoDatosUnicos_Bypass` — `MotivoDatosUnicosNoOK` (NCProyecto) with `p_MenosCef=EnumSino.Sí` + RequiereCE="Sí" + empty CE fecha → returns ""
- [ ] 4.4 Add `Test_Issue19_CE_Auditoria_MotivoDatosUnicos_Bypass` — `MotivoDatosUnicosNoOK` (NCAuditoria) with `p_MenosCef=EnumSino.Sí` + RequiereCE="Sí" + empty CE fecha → returns ""
- [ ] 4.5 Add test asserting `EficaciaOK` is NOT affected by bypass — closure still requires CE fecha
- [ ] 4.6 Register 4 new test procedures in `tests/tests.vba.json`

## Implementation Order

1. NCProyectoOperaciones cls changes first (foundation)
2. NCAuditoriaOperaciones cls changes (parallel, same nature)
3. NCAuditoria form button change (DEFERRED — blocked on NCAuditoria.DatosGeneralesOK p_MenosCef support)
4. Tests last — depend on both ops classes being updated

## Open Issues

- **NCAuditoria.DatosGeneralesOK p_MenosCef**: Form button `ComandoControlEficaciaDatos_Click` on NCAuditoriaGeneral should call `DatosGeneralesOK(EnumSino.Sí)`, but `NCAuditoria.DatosGeneralesOK` does not yet accept `p_MenosCef`. This is a pre-requisite for the form button to open the CE form at postpone time. Recommend tracking as a separate issue or SDD to add `p_MenosCef` to `NCAuditoria.DatosGeneralesOK`.

## Backward Compatibility

- All existing callers of `MotivoAltaDatosUnicosNoOK`, `MotivoDatosUnicosNoOK`, `RegistrarDatosUnicos`, `RegistrarAltaDatosUnicosConVinculoNC` without `p_MenosCef` retain strict CE fecha enforcement (default `= EnumSino.No`).
- `EficaciaOK` is untouched — closure still requires CE fecha.
- No schema, form layout, or binary structural changes.

## Files Changed

| File | Change |
|------|--------|
| `src/classes/NCProyectoOperaciones.cls` | Modify — add p_MenosCef to MotivoAlta, MotivoDatos, Registrar*, RegistrarAlta* |
| `src/classes/NCaUDITORIAOperaciones.cls` | Modify — add p_MenosCef to MotivoDatos, RegistrarDatos |
| `src/forms/Form_FormNCAuditoriaGeneral.cls` | Modify — pass EnumSino.Sí to DatosGeneralesOK (DEFERRED entity change needed first) |
| `src/modules/Test_Issue19_CEGating.bas` | Modify — add bypass + EficaciaOK invariance tests |
| `tests/tests.vba.json` | Modify — register 4 new test procedures |
