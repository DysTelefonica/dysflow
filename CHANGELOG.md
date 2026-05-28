# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

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
