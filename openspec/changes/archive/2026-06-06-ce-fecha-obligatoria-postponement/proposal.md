# Proposal: ce-fecha-obligatoria-postponement

## Intent

Allow the Quality department to postpone CE fecha (Control de Eficacia) at NC alta/edición time while still recording the `RequiereControlEficacia` choice. Currently `MotivoAltaDatosUnicosNoOK` and `MotivoDatosUnicosNoOK` in both `NCProyectoOperaciones` and `NCAuditoriaOperaciones` hardcode the check: if `RequiereControlEficacia = "Sí"`, both `FechaPrevistaControlEficacia` AND `ControlEficacia` must be filled — blocking alta when CE fecha is unknown. This change adds a bypass parameter so forms can defer CE fecha entry without losing the Requiere choice.

## Scope

### In Scope
- Add `p_MenosCef As EnumSino = EnumSino.No` parameter to `MotivoAltaDatosUnicosNoOK` and `MotivoDatosUnicosNoOK` in `NCProyectoOperaciones.cls`
- Add same parameter to `MotivoDatosUnicosNoOK` in `NCAuditoriaOperaciones.cls` (no `MotivoAlta` variant exists)
- When `p_MenosCef = EnumSino.Sí`: skip `FechaPrevistaControlEficacia` and `ControlEficacia` presence checks; keep `RequiereControlEficacia` choice check
- `EficaciaOK` (closure gate) — NO CHANGE; CE fecha still enforced at closure

### Out of Scope
- Any change to `DatosGeneralesOK` (already has `p_MenosCef` bypass, works correctly)
- Changes to closure-time validation
- New capability specs or new spec files
- Schema changes

## Capabilities

### Modified Capabilities
- `nc-proyecto-alta`: `MotivoAltaDatosUnicosNoOK` now accepts `p_MenosCef` bypass — NCProyecto alta can proceed without CE fecha when bypassed
- `nc-proyecto-edicion`: `MotivoDatosUnicosNoOK` now accepts `p_MenosCef` bypass — NCProyecto edición can proceed without CE fecha when bypassed
- `nc-auditoria-alta-edicion`: `MotivoDatosUnicosNoOK` now accepts `p_MenosCef` bypass — NCAuditoria alta/edición can proceed without CE fecha when bypassed

## Approach

Minimal parameter extension following the exact pattern already established in `NCProyecto.DatosGeneralesOK(p_MenosCef)`:

1. In `NCProyectoOperaciones.cls` — `MotivoAltaDatosUnicosNoOK`: add `Optional p_MenosCef As EnumSino = EnumSino.No`. Wrap CE fecha blocks (lines 111-121) with `If p_MenosCef <> EnumSino.Sí Then`.
2. In `NCProyectoOperaciones.cls` — `MotivoDatosUnicosNoOK`: same change, wrap CE fecha blocks (lines 286-300) with `If p_MenosCef <> EnumSino.Sí Then`.
3. In `NCAuditoriaOperaciones.cls` — `MotivoDatosUnicosNoOK`: same change, wrap CE fecha blocks (lines 79-89) with `If p_MenosCef <> EnumSino.Sí Then`.

No new spec files needed; this is a pure parameter extension that doesn't change spec-level requirements.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/classes/NCProyectoOperaciones.cls` | Modified | `MotivoAltaDatosUnicosNoOK` + `MotivoDatosUnicosNoOK` — add `p_MenosCef` parameter |
| `src/classes/NCAuditoriaOperaciones.cls` | Modified | `MotivoDatosUnicosNoOK` — add `p_MenosCef` parameter |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Callers not updated — forms still pass nothing, defaults to `EnumSino.No` (strict) | Medium | Verify form callers pass `EnumSino.Sí` when bypassing; forms reviewed in spec phase |
| EficaciaOK closure gate accidentally affected | Low | No touch to closure-time validation code; only bypass at alta/edición |
| `p_MenosCef` default = `No` preserves existing strict behavior | Low | Default ensures backward compatibility |

## Rollback Plan

1. Remove `p_MenosCef` parameter from all three method signatures
2. Remove the three `If p_MenosCef <> EnumSino.Sí Then` wrapper blocks (un-indent inner code)
3. Any caller that was passing `EnumSino.Sí` must be reverted to call without the parameter
4. No schema, data, or binary changes required — pure parameter signature + logic change

## Dependencies

- `EnumSino` type already exists and is used in `NCProyecto.DatosGeneralesOK` — no new type needed

## Success Criteria

- [ ] `NCProyectoOperaciones.MotivoAltaDatosUnicosNoOK` accepts `p_MenosCef` and skips CE fecha checks when `EnumSino.Sí`
- [ ] `NCProyectoOperaciones.MotivoDatosUnicosNoOK` accepts `p_MenosCef` and skips CE fecha checks when `EnumSino.Sí`
- [ ] `NCAuditoriaOperaciones.MotivoDatosUnicosNoOK` accepts `p_MenosCef` and skips CE fecha checks when `EnumSino.Sí`
- [ ] Existing callers without the parameter retain strict CE fecha enforcement (backward compatible)
- [ ] `EficaciaOK` closure gate remains unchanged
