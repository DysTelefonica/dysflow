# Design: CE-Fecha-Obligatoria-Postponement

## Technical Approach

Mirror the existing `DatosGeneralesOK(p_MenosCef As EnumSino)` bypass pattern into the three `Motivo*` validation functions in the operaciones layer. Add an optional `p_MenosCef As EnumSino = EnumSino.No` parameter; when `EnumSino.Sí`, the CE-fecha/CE-control presence checks are skipped while the `RequiereControlEficacia` choice (Sí/No/blank) is still enforced. `RegistrarDatosUnicos` and `RegistrarAltaDatosUnicosConVinculoNC` thread the parameter through to the Motivo functions so callers that navigate to CE detail can pass `EnumSino.Sí` without changing call signatures.

## Architecture Decisions

### Decision: Where to implement the CE-fecha bypass

**Choice**: Add `p_MenosCef` to the three `Motivo*` functions in the operaciones layer, not to `DatosGeneralesOK` on the entity.
**Alternatives considered**: Adding `p_MenosCef` to `NCAuditoria.DatosGeneralesOK` (NCAuditoria has no bypass there today), or adding a new `EficaciaOK`-style guard in the CE-detail forms.
**Rationale**: The NCProyecto entity already has the bypass on `DatosGeneralesOK`; adding it to the operaciones layer gives the same flexibility to the NCAuditoria flow without modifying the entity class. Form-level guards (CE-detail forms) already validate their own fields independently. Threading through `Registrar*` functions preserves existing call signatures via Optional default.

### Decision: Bypass scope — CE-fecha checks only, not RequiereCE choice

**Choice**: When `p_MenosCef = EnumSino.Sí`, skip `FechaPrevistaControlEficacia` and `ControlEficacia` presence checks but still validate that `RequiereControlEficacia` is "Sí" or "No" (not blank).
**Alternatives considered**: Bypass everything including the RequiereCE choice; bypass nothing.
**Rationale**: The business rule postpones CE-fecha entry, not the decision of whether CE is required. Users must still choose "Sí" or "No" at alta/edición time.

### Decision: Backward compatibility via Optional default

**Choice**: All new parameters use `Optional p_MenosCef As EnumSino = EnumSino.No` — callers that omit the argument get the current strict behavior.
**Alternatives considered**: Mandatory new parameter; overloads.
**Rationale**: Zero-breaking change to existing callers. Existing tests, forms, and workflows are unaffected unless explicitly migrated.

## Data Flow

```
Form_FormNCProyectoGeneral / Form_FormNCAuditoriaGeneral
    │
    ├──[ComandoControlEficaciaDatos_Click]──→ DatosGeneralesOK(EnumSino.Sí)  ← existing gate
    │                                                        (already bypasses CE-fecha on NCProyecto)
    │
    └──[ComandoGrabar_Click]──→ RegistrarDatosUnicos ──→ MotivoDatosUnicosNoOK(p_MenosCef)
                                  (strict by default)        (CE-fecha enforced unless bypassed)

FormNCProyectoControlEficaciaAlta / FormNCAuditoriaControlEficaciaAlta
    │
    └──[ComandoGrabar_Click]──→ Form_FormNCProyectoGeneral.ComandoGrabar_Click
                                   │
                                   └──→ RegistrarDatosUnicos ──→ MotivoDatosUnicosNoOK(p_MenosCef)
                                                                   (strict unless caller passes EnumSino.Sí)

Form_FormNCProyectoGeneralConVinculoNC
    │
    └──[VinculoNC]──→ RegistrarAltaDatosUnicosConVinculoNC ──→ MotivoAltaDatosUnicosNoOK(p_MenosCef)
                                                                 (strict unless bypassed)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/classes/NCProyectoOperaciones.cls` | Modify | Add `p_MenosCef` param to `MotivoAltaDatosUnicosNoOK` (~line 18), `MotivoDatosUnicosNoOK` (~line ~185); wrap CE-fecha checks in `If p_MenosCef <> EnumSino.Sí`; thread param through `RegistrarDatosUnicos` (~line 324) and `RegistrarAltaDatosUnicosConVinculoNC` (~line 591) |
| `src/classes/NCAuditoriaOperaciones.cls` | Modify | Add `p_MenosCef` param to `MotivoDatosUnicosNoOK` (~line 18); wrap CE-fecha checks in `If p_MenosCef <> EnumSino.Sí`; thread param through `RegistrarDatosUnicos` (~line 107) |
| `src/forms/Form_FormNCProyectoGeneral.cls` | Modify | `ComandoControlEficaciaDatos_Click` (~line 254): change `DatosGeneralesOK()` → `DatosGeneralesOK(EnumSino.Sí)` to reflect that NCProyecto entity already supports the bypass |
| `src/forms/Form_FormNCAuditoriaGeneral.cls` | Modify | `ComandoControlEficaciaDatos_Click` (~line 56): change `DatosGeneralesOK` → `DatosGeneralesOK(EnumSino.Sí)` so the NCA auditoria flow also allows entry to CE detail when RequiereCE="Sí" but CE-fecha is not yet filled |
| `src/modules/Test_Issue19_CEGating.bas` | Modify | Add tests for `MotivoAltaDatosUnicosNoOK(p_MenosCef:=EnumSino.Sí)` and `MotivoDatosUnicosNoOK(p_MenosCef:=EnumSino.Sí)` in NCProyectoOperaciones; add test for `MotivoDatosUnicosNoOK(p_MenosCef:=EnumSino.Sí)` in NCAuditoriaOperaciones |

## Interfaces / Contracts

### NCProyectoOperaciones — MotivoAltaDatosUnicosNoOK
```vb
Private Function MotivoAltaDatosUnicosNoOK( _
                                Optional ByRef p_MenosCef As EnumSino = EnumSino.No, _
                                Optional ByRef p_Error As String _
                                ) As String
```
CE-fecha block (lines ~111–121):
```vb
If p_MenosCef <> EnumSino.Sí Then
    If .RequiereControlEficacia = "Sí" Then
        If Not IsDate(.FechaPrevistaControlEficacia) Then
            MotivoAltaDatosUnicosNoOK = "Si requiere el control de eficacia se ha de indicar la fecha prevista del mismo"
            Exit Function
        End If
        If .ControlEficacia = "" Then
            MotivoAltaDatosUnicosNoOK = "Si requiere el control de eficacia se ha de indicar el mismo"
            Exit Function
        End If
    End If
End If
```

### NCProyectoOperaciones — MotivoDatosUnicosNoOK
Same wrapper around the CE-fecha block (~lines ~290–300).

### NCAuditoriaOperaciones — MotivoDatosUnicosNoOK
Same wrapper around CE-fecha block (~lines ~79–88). No `MotivoAlta` variant exists for NCAuditoria.

### Registrar* threading signatures
```vb
Public Function RegistrarDatosUnicos( _
                            Optional ByRef p_ObjNCAlInicio As NCProyecto, _
                            Optional ByRef p_MenosCef As EnumSino = EnumSino.No, _
                            Optional ByRef p_Error As String _
                            ) As String
    ' passes p_MenosCef to MotivoDatosUnicosNoOK(p_MenosCef, p_Error)
```

```vb
Public Function RegistrarAltaDatosUnicosConVinculoNC( _
                                            Optional ByRef p_MenosCef As EnumSino = EnumSino.No, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    ' passes p_MenosCef to MotivoAltaDatosUnicosNoOK(p_MenosCef, p_Error)
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `MotivoAltaDatosUnicosNoOK(p_MenosCef)` — CE-fecha bypass | NCProyecto fixture with RequiereCE="Sí", empty CE-fecha; assert MotivoAlta returns `""` when bypass=EnumSino.Sí, blocking message when bypass=EnumSino.No |
| Unit | `MotivoDatosUnicosNoOK(p_MenosCef)` — same bypass | Same pattern for NCProyectoOperaciones and NCAuditoriaOperaciones |
| Unit | RequiereCE="" still blocked with bypass | Assert `Motivo*(p_MenosCef:=EnumSino.Sí)` still returns blocking message when RequiereCE is blank |
| Unit | `RegistrarDatosUnicos` threads bypass | Assert `RegistrarDatosUnicos(p_MenosCef:=EnumSino.Sí)` returns `""` for same fixture |
| Integration | CE-alta flow with deferred CE fecha | Navigate to CE detail form, enter CE data, save — verify NC is saved with CE data populated |
| E2E | Full alta with RequiereCE="Sí" + CE deferred, then CE detail entry, then close | Existing `Test_Issue19_CEGating` suite validates closure gate unchanged |

## Migration / Rollout

No migration required. The Optional default `EnumSino.No` preserves existing strict behavior for all callers that do not pass the parameter. No schema, no new tables, no data transformation.

## Open Questions

- [ ] `Form_FormNCAuditoriaGeneral.ComandoControlEficaciaDatos_Click` currently calls `DatosGeneralesOK` (no param) without the bypass — should this also be changed to `DatosGeneralesOK(EnumSino.Sí)`? The NCAuditoria entity's `DatosGeneralesOK` does not currently accept `p_MenosCef`, so this change would require modifying `NCAuditoria.DatosGeneralesOK` first to add the bypass parameter. The current design defers this to a separate change; the bypass on `MotivoDatosUnicosNoOK` is the primary mechanism.
