# Proposal: form-fncproyecto-cache-invalidation

## Change reference
- GitHub: #48 (`feat(form-FNCProyecto): ComandoActualizarLista should invalidate list cache and refill combos from cache`)
- SDD: `form-fncproyecto-cache-invalidation`
- Sibling cerrado: #49 (mismo patrón, forma `Form_FormNCAuditoriaGestion`)

## Intent

`ComandoActualizarLista_Click` en `Form_FormNCProyectoGestion` persiste `EstadoGrabar` / `FECHACIERREGrabar` / `FPREVCIERREGrabar` y repinta la lista filtrada, pero nunca invalida el cache de listado (`TbCacheListadoNC`) ni recarga los 9 combos de lookup. Tras editar el backend el operador ve valores stale hasta cerrar y reabrir el formulario.

Issue #48 pide: (1) invalidar+recargar cache de listado al disparar el botón, (2) que `EstablecerCombos` consulte primero el cache y use las tablas de lookup si está vacío/dirty, (3) feedback visible `lblEstado = "Cache recargado"` conservando `DoCmd.Hourglass`.

## Scope

### In Scope
- Modificar `ComandoActualizarLista_Click` con invalidation + refill + feedback + Hourglass.
- Agregar `RebuildNCProyectoListadoCache` en `src/modules/CacheNCProyecto.bas`.
- Agregar `RefreshNCProyectoGestionCaches` en `src/modules/NCProyectoGestionListadoHelper.bas`.
- Agregar `Entorno.InvalidateCombosCache()` (encapsulado, sin Property Let/Get) que nulifica las 6 colecciones.
- Renombrar `ComandoActualizar_Click` → `ComandoActualizarLista_Click` en `Form_FormNCAuditoriaGestion.cls` (consistencia post-#49).
- Tests VBA schema-first, fixture-first, sandbox-safe con `BeginTestSession` / `m_TestingMode` / `getdb()`.

### Out of Scope
- #54 (extracción adicional de helper), #43 (transaction boundaries).
- Cache de detalle por-NC.
- Cambios de schema en `TbCacheListadoNC` o tablas de lookup.
- Reescritura amplia de `EstablecerCombo*`.

## Capabilities

### New Capabilities
- `form-fncproyecto-cache-invalidation`: contrato end-to-end de invalidación+refill disparado por `ComandoActualizarLista_Click`, helper simétrico al audit, invalidación encapsulada en `Entorno`, feedback visible y verificación fixture-first.

### Modified Capabilities
- `audit-backend-list-cache`: rename cosmético del handler. No introduce ni elimina requisitos funcionales.

## Approach

Replicar el patrón #49, cerrando la brecha de feedback que ese fix dejó pendiente.

1. **Invalidar cache.** `RebuildNCProyectoListadoCache(p_IDNC, p_Error)` en `CacheNCProyecto.bas`; expuesta vía `RefreshNCProyectoGestionCaches()` en `NCProyectoGestionListadoHelper.bas`.
2. **Refill combos.** `m_ObjEntorno.InvalidateCombosCache` nulifica las 6 colecciones; el siguiente `EstablecerCombos` las repobla lazy. Cero cambios en los `EstablecerCombo*`.
3. **Feedback.** `Me.lblEstado.Caption = "Cache recargado"` + `Visible = True`; reset en próximo evento de UI o `Application.OnTime` corto no bloqueante. NO `Sleep`.
4. **Hourglass/error model.** `On Error GoTo EH`, `DoCmd.Hourglass` + `VBA.DoEvents` en un único `SALIR`; re-raise con `Err.Raise` si la invalidación falla.
5. **Rename audit.** Un solo cambio mecánico en `Form_FormNCAuditoriaGestion.cls`, sin alterar lógica.

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `src/forms/Form_FormNCProyectoGestion.cls` | Modified | Handler con invalidation + refill + feedback |
| `src/modules/CacheNCProyecto.bas` | Modified | `RebuildNCProyectoListadoCache` |
| `src/modules/NCProyectoGestionListadoHelper.bas` | Modified | `RefreshNCProyectoGestionCaches` |
| `src/classes/Entorno.cls` | Modified | `InvalidateCombosCache` encapsulado |
| `src/forms/Form_FormNCAuditoriaGestion.cls` | Modified | Rename handler |
| `src/modules/Test_NCProyectoGestionListadoHelper.bas` | New/Modified | Tests fixture-first |
| `tests/tests.vba.proyecto-gestion-helper.json` | New | Manifest dedicado |
| `openspec/changes/form-fncproyecto-cache-invalidation/{spec,design,tasks,apply-progress}.md` | New | Artefactos SDD downstream |

## Risks

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Regresión en audit form por rename | Med | Cambio cosmético + test de regresión en el mismo manifest |
| `Entorno.InvalidateCombosCache` expone setters | Baja | Método público sobre `Private` collections; sin Property Let/Get |
| Tests pasan por suerte | Med | Fixture-first: insertar filas controladas en sandbox, teardown por markers |
| `lblEstado` queda visible permanente | Med | Reset explícito + tests asserting transitions |
| PR > 400 líneas | Med | Chained PRs: helpers RED / handler+Entorno GREEN / audit rename+verify |
| Compilación manual olvidada | Baja | Notificar tras `dysflow.import_modules`; nunca `compile_vba` |

## Rollback Plan

Revertir commits en orden inverso. Si `TbCacheListadoNC` queda stale, ejecutar `SincronizarCache` (existente en `CacheNCProyecto.bas` línea 2134). `Entorno.InvalidateCombosCache` es aditivo: eliminarlo no rompe nada. Rename audit es `git revert` de un commit.

## Dependencies

Issue #49 (patrón de referencia). `BeginTestSession` / `m_TestingMode` / `getdb()` en `TestHelper.bas`. `dysflow.import_modules` con `compile=false` + compilación manual del usuario. `dysflow.test_vba` con `projectId=00-no-conformidades-staging-clean`.

## Success Criteria

- [ ] Handler invalida cache, nulifica combos, recarga y muestra `lblEstado = "Cache recargado"`.
- [ ] `RebuildNCProyectoListadoCache` y `RefreshNCProyectoGestionCaches` simétricas con la audit.
- [ ] `Entorno.InvalidateCombosCache` nulifica las 6 colecciones sin setters.
- [ ] Audit form rename sin regresión.
- [ ] Tests schema-first/fixture-first verdes; cero lucky data.
- [ ] Slices ≤ 400 líneas; chained PRs si forecast > budget.
- [ ] Compilación manual confirmada antes de tests.
- [ ] Carry-forward: el fix #49 no implementó feedback `lblEstado` — #48 lo cierra.
