# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

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
