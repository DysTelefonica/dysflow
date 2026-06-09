# Delta Spec: ce-fecha-obligatoria-postponement

## Background

Quality dept requires postponing `FechaPrevistaControlEficacia` and `ControlEficacia` entry at NC/NCA `Alta` time while preserving the `RequiereControlEficacia` choice. Currently `MotivoAltaDatosUnicosNoOK` and `MotivoDatosUnicosNoOK` in both `NCProyectoOperaciones` and `NCAuditoriaOperaciones` block `Alta` when `RequiereControlEficacia="Sí"` but CE fecha is empty. The existing `p_MenosCef` bypass in `NCProyecto.DatosGeneralesOK` proves the pattern; this change mirrors it into the three `Motivo*` functions.

---

## ADDED Requirements

### Requirement: p_MenosCef bypass on NCProyectoOperaciones.MotivoAltaDatosUnicosNoOK

The function `MotivoAltaDatosUnicosNoOK` SHALL accept an optional `p_MenosCef As EnumSino = EnumSino.No` parameter. When `p_MenosCef = EnumSino.Sí`, the checks for `FechaPrevistaControlEficacia` and `ControlEficacia` presence SHALL be skipped, while the `RequiereControlEficacia` choice check (Sí/No/"") SHALL still be enforced. When `p_MenosCef = EnumSino.No` (default), behavior is unchanged.

#### Scenario: Alta with RequiereCE="Sí" and CE fecha bypassed via p_MenosCef

- GIVEN an NCProyecto with `RequiereControlEficacia = "Sí"`, `FechaPrevistaControlEficacia = ""`, `ControlEficacia = ""`
- WHEN `MotivoAltaDatosUnicosNoOK` is called with `p_MenosCef = EnumSino.Sí`
- THEN the function returns `""` (no blocking reason)
- AND the `RequiereControlEficacia` choice check still executes

#### Scenario: Alta with RequiereCE="Sí" and no bypass — strict mode

- GIVEN an NCProyecto with `RequiereControlEficacia = "Sí"`, `FechaPrevistaControlEficacia = ""`, `ControlEficacia = ""`
- WHEN `MotivoAltaDatosUnicosNoOK` is called with `p_MenosCef = EnumSino.No` (default)
- THEN the function returns `"Si requiere el control de eficacia se ha de indicar la fecha prevista del mismo"`

#### Scenario: Alta with RequiereCE="" — always blocked

- GIVEN an NCProyecto with `RequiereControlEficacia = ""`
- WHEN `MotivoAltaDatosUnicosNoOK` is called with `p_MenosCef = EnumSino.Sí`
- THEN the function returns `"Se ha de indicar si requiere control de eficacia"`

---

### Requirement: p_MenosCef bypass on NCProyectoOperaciones.MotivoDatosUnicosNoOK

The function `MotivoDatosUnicosNoOK` SHALL accept an optional `p_MenosCef As EnumSino = EnumSino.No` parameter. When `p_MenosCef = EnumSino.Sí`, the checks for `FechaPrevistaControlEficacia` and `ControlEficacia` presence SHALL be skipped; the `RequiereControlEficacia` choice check still runs. Default `EnumSino.No` preserves existing strict behavior.

#### Scenario: Edición with RequiereCE="Sí" and CE fecha bypassed

- GIVEN an NCProyecto with `RequiereControlEficacia = "Sí"`, empty CE detalle
- WHEN `MotivoDatosUnicosNoOK(p_MenosCef:=EnumSino.Sí)` is called
- THEN returns `""`
- AND the RequiereCE choice check still executes

---

### Requirement: p_MenosCef bypass on NCAuditoriaOperaciones.MotivoDatosUnicosNoOK

The function `MotivoDatosUnicosNoOK` in `NCAuditoriaOperaciones` SHALL accept the same `p_MenosCef` parameter with identical semantics. No `MotivoAlta` variant exists for NCAuditoria — the single function covers both alta and edición.

#### Scenario: NCAuditoria edición with RequiereCE="Sí" and CE fecha bypassed

- GIVEN an NCAuditoria with `RequiereControlEficacia = "Sí"`, `FechaPrevistaControlEficacia = ""`, `ControlEficacia = ""`
- WHEN `MotivoDatosUnicosNoOK(p_MenosCef:=EnumSino.Sí)` is called
- THEN returns `""`
- AND `RequiereControlEficacia` choice check still runs

---

## MODIFIED Requirements

### Requirement: EficaciaOK — closure gate unchanged

(Previously: EficaciaOK always required FechaPrevistaControlEficacia and ControlEficacia for RequiereCE="Sí")

EficaciaOK SHALL continue to require both `FechaPrevistaControlEficacia` and `ControlEficacia` when `RequiereControlEficacia = "Sí"`. This requirement is NOT modified — the `p_MenosCef` bypass does NOT affect closure validation.

#### Scenario: Cannot close NC with RequiereCE="Sí" and missing CE fecha

- GIVEN an NCProyecto with `RequiereControlEficacia = "Sí"`, `FechaPrevistaControlEficacia = ""`, `ControlEficacia = ""`
- WHEN `EficaciaOK` is evaluated
- THEN `EficaciaOK = EnumSino.No`

---

## Requirements Summary

| # | Requirement | Domain | Strength | Scenarios |
|---|-----------|--------|----------|-----------|
| 1 | `MotivoAltaDatosUnicosNoOK` accepts `p_MenosCef` | NCProyecto | SHALL | 3 |
| 2 | `MotivoDatosUnicosNoOK` accepts `p_MenosCef` | NCProyecto | SHALL | 1 |
| 3 | `NCAuditoria.MotivoDatosUnicosNoOK` accepts `p_MenosCef` | NCAuditoria | SHALL | 1 |
| 4 | `EficaciaOK` closure gate unchanged | NCProyecto | SHALL NOT | 1 |

---

## Acceptance Criteria

- [ ] `NCProyectoOperaciones.MotivoAltaDatosUnicosNoOK(Optional p_MenosCef As EnumSino = EnumSino.No)` — CE fecha checks wrapped in `If p_MenosCef <> EnumSino.Sí Then`
- [ ] `NCProyectoOperaciones.MotivoDatosUnicosNoOK(Optional p_MenosCef As EnumSino = EnumSino.No)` — same wrapper
- [ ] `NCAuditoriaOperaciones.MotivoDatosUnicosNoOK(Optional p_MenosCef As EnumSino = EnumSino.No)` — same wrapper
- [ ] Existing callers without `p_MenosCef` retain strict CE fecha enforcement (backward compatible)
- [ ] `EficaciaOK` is untouched — closure still requires CE fecha
- [ ] No schema, form, or binary changes

---

## Non-Functional

- **TDD**: Tests in `Test_Issue19_CEGating.bas` cover `DatosGeneralesOK` (already has bypass). New tests needed for the three `Motivo*` functions with `p_MenosCef`.
- **No schema changes**: No new fields, no new tables.
- **No binary changes**: Only source files under `src/classes/` are modified.