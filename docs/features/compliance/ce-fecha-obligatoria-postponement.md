# ce-fecha-obligatoria-postponement — Posponer el gate de FechaPrevistaControlEficacia al cierre de la NC

> Reconstruido desde el informe de archivo `2026-06-06-ce-fecha-obligatoria-postponement/archive-report.md` y refrescado con el run runtime fresco Dysflow del 2026-06-15. Fuentes: informe de archivo, manifiesto de pruebas `tests.vba.json` (`filter=issue-19`), historial git, evidencia runtime fresca 2026-06-15. Esta tarea no ejecutó Dysflow/Access; el run fresco del mismo día fue aportado como evidencia externa.

## Estado

| Campo | Valor |
|-------|-------|
| **Actual** | `passing-runtime-fresh` — 13/13 PASS verdes 2026-06-15 (7 filtros) |
| **Última verificación runtime conocida** | 2026-06-15 |
| **Drift de manifiesto** | `clean` — `tests.vba.json` intacto, sin cambios desde `8cb7f0a` |
| **Alcance en staging** | `reachable` — commit `8cb7f0a` históricamente alcanzable desde `staging` |
| **Evidencia TDD** | `runtime-fresh` — 13/13 PASS en Dysflow 2026-06-15; `archived-static` sigue en `8cb7f0a` como ancla histórica |
| **Último commit verificado (ancla histórica)** | `8cb7f0a` |
| **Última verificación en** | 2026-06-15 (runtime fresco) / 2026-06-06 (ancla histórica) |
| **Evidencia de pruebas** | `tests/tests.vba.json` Dysflow 2026-06-15, 13/13 PASS, 7 filtros verdes |
| **Commit de integración en staging** | `8cb7f0a` (ancla histórica) |
| **Evidencia actualizada en** | 2026-06-15, solo documentación (run runtime fresco del mismo día) |
| **Verificación runtime fresca** | Completada 2026-06-15: 13/13 PASS. Caveat histórico `dysflow-a54c004e-9ac8-41d8-93b9-087e5326c31d` (`status=starting`, `accessPid=null`) queda como nota histórica del runner, ya sin efecto sobre el estado |

## Comportamiento de negocio

Gate de cumplimiento para `FechaPrevistaControlEficacia`: se pospone desde el alta/edición de la NC hasta el cierre. La evidencia archivada confirma la intención de que:
- `FechaPrevistaControlEficacia` no se exija durante `Alta` ni `Edicion`.
- El gate se aplique solo al cerrar la NC.
- Los escenarios de bypass para alta, edicion y auditoria se preserven.
- La invariancia de `EficaciaOK` se mantenga.

## Criterios de aceptación

- [x] `FechaPrevistaControlEficacia` no se exige durante el alta de NC — `Verified-runtime` Dysflow 2026-06-15, filtro `Issue19_CE_Alta_` 5/5.
- [x] `FechaPrevistaControlEficacia` no se exige durante la edición de NC — `Verified-runtime` Dysflow 2026-06-15, filtro `Issue19_CE_Edicion_` 1/1.
- [x] El gate de `FechaPrevistaControlEficacia` se exige al cierre de NC — `Verified-runtime` Dysflow 2026-06-15, filtro `Issue19_CE_Cierre_` 2/2.
- [x] Los escenarios de bypass para alta/edicion/auditoria pasan — `Verified-runtime` Dysflow 2026-06-15, filtros `Issue19_CE_Alta_` 5/5, `Issue19_CE_Edicion_` 1/1, `Issue19_CE_Auditoria_` 1/1.
- [x] La invariancia de `EficaciaOK` se preserva — `Verified-runtime` Dysflow 2026-06-15, filtros `Issue19_CE_EficaciaOK_` 1/1, `Issue19_CE_EstadoCalculado_` 2/2, `Issue19_Paridad_UI` 1/1.
- [x] Revalidar con Dysflow en runtime fresco cuando se despeje el caveat del runner — hecho 2026-06-15.

## Pruebas requeridas

| Procedimiento | Manifiesto | Estado |
|-----------|----------|--------|
| `Test_Issue19_*` (13 procedimientos únicos, 7 filtros) | `tests/tests.vba.json` | PASS (13/13) runtime fresco Dysflow 2026-06-15; ancla histórica `8cb7f0a` (2026-06-06) |

### Procedimientos Issue19 cubiertos por el run runtime fresco 2026-06-15

- **Slice A — baseline CE-gating behavior (8/8)**: `Test_Issue19_CE_Alta_Si_SinDetalle_NoBloquea`, `Test_Issue19_CE_Alta_Si_ConDetalle_Pasa`, `Test_Issue19_CE_Alta_No_IgnoraDetalle`, `Test_Issue19_CE_Cierre_SinDetalle_Bloquea`, `Test_Issue19_CE_Cierre_ConDetalle_PermiteCierre`, `Test_Issue19_CE_EstadoCalculado_Pendiente`, `Test_Issue19_CE_EstadoCalculado_SinPendiente`, `Test_Issue19_Paridad_UI_Dominio`.
- **Slice B — bypass/follow-up (5/5)**: `Test_Issue19_CE_Alta_MotivoAlta_Bypass_Si`, `Test_Issue19_CE_Alta_MotivoAlta_Bypass_BlankRequereCE`, `Test_Issue19_CE_Edicion_MotivoDatosUnicos_Bypass`, `Test_Issue19_CE_Auditoria_MotivoDatosUnicos_Bypass`, `Test_Issue19_CE_EficaciaOK_SinCambios`.

## Último verde conocido

### Ancla runtime fresca (vigente)

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-06-15 |
| **Commit** | (no anclado a un commit nuevo; el run se ejecutó sobre el árbol actual, que mantiene el cambio de `8cb7f0a`) |
| **Manifiesto** | `tests/tests.vba.json` (7 filtros: `Issue19_CE_Alta_`, `Issue19_CE_Cierre_`, `Issue19_CE_EstadoCalculado_`, `Issue19_Paridad_UI`, `Issue19_CE_Edicion_`, `Issue19_CE_Auditoria_`, `Issue19_CE_EficaciaOK_`) |
| **Resultado** | 13/13 PASS, evidencia runtime fresca Dysflow 2026-06-15 |
| **Caveat histórico del runner** | `dysflow-a54c004e-9ac8-41d8-93b9-087e5326c31d` (`status=starting`, `accessPid=null`) ya no aplica; queda como nota histórica |

### Ancla histórica archivada

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-06-06 |
| **Commit** | `8cb7f0a` |
| **Manifiesto** | `tests/tests.vba.json` (`filter=issue-19`) |
| **Resultado** | 13/13 PASS, evidencia archivada |

## Commits de integración

| SHA | Mensaje | Ancestro de staging |
|-----|---------|---------------------|
| `8cb7f0a` | `feat(NC): postpone FechaPrevistaControlEficacia gating to NC close (closes #45)` | Sí — verificado históricamente 2026-06-14 |

## Estado de sincronización Access

- **Método de importación**: Dysflow `import_modules` — `NCProyectoOperaciones`, `NCaUDITORIAOperaciones`, `Test_Issue19_CEGating`
- **Compilación manual**: confirmada 2026-06-06 (según cuerpo del commit `8cb7f0a`)
- **verify_binary**: no ejecutado
- **Nota 2026-06-15**: esta actualización no importó, no compiló ni ejecutó pruebas. El run runtime fresco del mismo día (13/13 PASS, 7 filtros) es la nueva ancla documental; el caveat del runner `dysflow-a54c004e-9ac8-41d8-93b9-087e5326c31d` queda como nota histórica sin efecto.

## Ancla de rollback

Revertir al commit anterior a `8cb7f0a` para restaurar el comportamiento original del gate FE.

## Reglas de negocio

- `FechaPrevistaControlEficacia` no debe bloquear la creación ni la edición de NC.
- El gate debe aplicarse solo al cierre de NC.
- El bypass debe funcionar para contextos de alta, edicion y auditoria.
- `EficaciaOK` debe permanecer invariante.
- Las reglas completas de `no requerida`, eficacia fallida, replanificación y evidencia siguen pendientes de confirmación/pruebas (`FALTA → crear mediante access-vba-tdd`).

## Legacy que no se debe copiar

- Estado de gate basado en TempVars a través de eventos de formulario.
- Lógica de gate directa en campos de formulario en lugar de enforcement en capa de servicio.

## Notas de migración

Implementar este gate como regla de dominio/cierre, no como validación dispersa de formulario. Preservar identificadores/enums/rutas existentes al migrar o documentar.

## Decisiones abiertas

1. **Follow-up 3.2 diferido**: `Form_FormNCAuditoriaGeneral.ComandoControlEficaciaDatos_Click` necesita `NCAuditoria.DatosGeneralesOK(p_MenosCef)` antes de poder afirmar el bypass a nivel formulario. No bloquea el estado archivado de Issue19, pero sigue pendiente de confirmación runtime.

## Fuentes de evidencia

- [Informe de archivo](../../../openspec/changes/archive/2026-06-06-ce-fecha-obligatoria-postponement/archive-report.md)
- [Manifiesto de pruebas: tests.vba.json](../../../tests/tests.vba.json) (`filter=issue-19`)
- [Spec](../../../openspec/specs/ce-fecha-obligatoria-postponement/spec.md)

## Gate documental posterior a pruebas

> **Regla**: la integración no se considera cerrada hasta actualizar esta sección. Después de integrar en staging y pasar pruebas, actualizar los campos de estado antes de declarar el trabajo completo. Para 2026-06-15, el estado se promueve a `passing-runtime-fresh` con el run Dysflow del mismo día como ancla; `8cb7f0a` se mantiene como ancla histórica archivada.

| Paso | Acción | Hecho |
|------|--------|------|
| 1 | Pruebas pasan contra el commit staging verificado | [x] (13/13 runtime fresco Dysflow 2026-06-15, 7 filtros; ancla histórica 13/13 en `8cb7f0a`) |
| 2 | `last_verified_commit` actualizado con SHA | [x] (`8cb7f0a` sigue como ancla histórica; el run fresco no se ancla a un commit nuevo) |
| 3 | `last_verified_at` actualizado con fecha ISO | [x] (2026-06-15) |
| 4 | `test_evidence` actualizado con manifiesto + pass/total | [x] (`tests/tests.vba.json`, 13/13 PASS, 7 filtros) |
| 5 | `staging_integration_commit` actualizado con SHA de integración | [x] (`8cb7f0a`) |
| 6 | `evidence_updated_at` actualizado | [x] (2026-06-15) |
| 7 | El estado de la feature refleja el estado actual | [x] (`passing-runtime-fresh`, caveat del runner resuelto) |
