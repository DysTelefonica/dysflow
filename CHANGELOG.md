# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

## [2026-010] - 2026-06-07

### Integrado (commit `b7eaa86`)
- Issue #18 / SDD `indicator-issues-cleanup` (work unit 1): backend DDL del cache compartido de indicadores + helper VBA de migracion reusable.
  - Nueva tabla `TbCacheIndicadoresConfig` (4 campos requeridos + PK) en backend.
  - 7 campos nuevos en `TbCacheIndicadoresProyectoHeader` (2 requeridos: `IDCacheConfig`, `Dominio`).
  - 10 campos nuevos en `TbCacheIndicadoresProyectoDetalle` (2 requeridos: `IDCacheConfig`, `Dominio`).
  - 8 indices: `UX_TbCacheIndicadoresConfig_Dominio`, `UX_TbCacheIndicadoresProyectoHeader_Dominio`, y 6 `IX_TbCacheIndicadoresProyectoDetalle_*` con field lists validados.
- Nuevo modulo `src/modules/ModuloMigracionIssue18.bas`: helper idempotente con `DryRun` / `Aplicar` / `Estado`, soporta modo sandbox (default) y produccion (path + password explicitos, guard `\\datoste\`). El helper valida el field list + `Unique` de cada indice; si no coincide con el contrato, dropea y recrea.
- Script de referencia en `database/issue18_migration_v1.sql` para auditoria (la aplicacion real va por el helper VBA, no por SQL directo, porque Access ACE DDL no permite `NOT NULL` ni field list custom en `ADD COLUMN` sobre tablas con datos).
- DDL de referencia canonica en `database/issue18_backend_indicator_cache.sql` (representa el estado deseado completo).

### Validado
- `tests/tests.vba.json`: 4/4 tests nuevos `issue-18` / `indicator-cache` / `wu1` en GREEN (schema de campos, schema de indices, fixture Proyecto, fixture Auditoria).
- 4/4 tests pre-existentes `cache-sync` con tag `issue-18` siguen GREEN (sin regresion).
- `MigracionIssue18_Estado()` reporta `changeCount=0` post-apply: el helper es idempotente (aplicar dos veces = no-op).
- `dysflow.compile_vba` no se uso en ningun momento; toda la compilacion la hizo el usuario en Access VBE.

### Pendiente (issue #18 sigue ABIERTA)
- Phase 2.1-2.7: API de sync incremental por NC en `src/modules/ModuloCacheIndicadores.bas`, helpers de resolucion AC/AR/task, operacion de full rebuild, API de read/filter, tests de cobertura por dominio.
- Phase 3: hooks de sync inmediato tras escrituras exitosas en NC/AC/AR/tarea, rework del runtime de indicadores para que lea del cache en vez de queries en vivo.
- Phase 4: escenarios de no-regresion cross-domain y actualizacion de manifest a atomic-tests-only.
- Cierre formal del issue #18 solo cuando toda la cobertura este GREEN y la validacion manual de UI confirme el comportamiento.

### Nota operativa
- Para backends de produccion, el helper se invoca con path y password explicitos: `MigracionIssue18_Aplicar("<path>", "<password>")`. El guard `\\datoste\` evita aplicacion accidental contra produccion.
- El SDD completo vive en artefactos OpenSpec ignorados por git y replicados en Engram (topic key `indicator-issues-cleanup`); el commit `b7eaa86` referencia SDD e issue #18 en el cuerpo.

## [2026-009] - 2026-06-07

### Integrado
- Issue #55 / SDD `ncproyecto-seguimiento-tareas-helper`: nuevo helper `src/modules/NCProyectoSeguimientoTareasListadoHelper.bas` para el filtrado de tareas de seguimiento de proyecto.
- El formulario delega el filtrado a traves de un wrapper llamado desde formulario, manteniendo la logica cache-first en un modulo testeable.

### Validado
- `tests/tests.vba.seguimiento-tareas-helper.json`: 9/9 tests Dysflow pasados despues de compilacion manual del usuario en Access.
- No se uso `dysflow.compile_vba`; la compilacion sigue siendo frontera manual en VBE.

### Nota operativa
- Los tests automatizados cubren seams de helper/modulo; no deben manejar automatizacion de UI/formularios.
- La validacion final de UI/formulario queda como comprobacion manual del usuario.
- El SDD queda archivado localmente en artefactos OpenSpec ignorados; el commit debe referenciar SDD e issue #55 en el cuerpo.

## [2026-008] - 2026-05-28

### Integrado
- Promoción a `main` de la versión aceptada en staging para **Motivos No CE**.
- Sustitución del binario frontend `NoConformidades.accdb` por el binario validado en staging.

### Cambiado
- `Form_FormNCProyectoGeneral` y `Form_FormNCAuditoriaGeneral` actualizan los Motivos No CE mediante evento desde el formulario de motivos.
- El botón de Motivos No CE muestra textos más claros: `Meter Motivos No CE` o `Ver Motivos No CE` según exista motivo registrado.
- Se añade el indicador visual `ImagenMotivosNoCE` para señalar que hay motivos registrados.
- La detección de cambios de los formularios contempla `MotivoNoRequiereControlEficacia`.

### Nota operativa
- Esta release no documenta migración de datos ni cambio de esquema de backend.
- Resumen para consultas: se integró la versión de staging que mejora la gestión visual y funcional de Motivos No CE en formularios de Proyecto y Auditoría.
