# Capacidad: documentos y evidencia generada

## §0 Identidad
- **ID de capacidad**: `CAP-DOC-EVIDENCE`
- **Nivel**: standard
- **Estado**: active / documentación alineada con v2; reglas de evidencia documental pendientes de prueba runtime
- **Fuente**: hybrid (inventario de fuente + documento de funcionalidad de auditoría + adyacencia de capacidades)
- **Responsable / autoridad de producto**: Confirmación pendiente — Calidad / gestión de evidencias
- **Última verificación**: 2026-06-15 migración solo documental; no se ejecutó Dysflow/Access
- **Confianza global**: low-to-mixed — la ruta de informe de auditoría está documentada como `Verified-static`; el comportamiento de adjuntos documentales, almacenamiento y trazabilidad UAT sigue sin prueba runtime

## §1 Intención de negocio
- **Propósito**: Mantener adjuntos, documentos generados y evidencia de informes para flujos de Proyecto, Auditoría, AC y AR.
- **Usuarios / personas**: Equipo de calidad, usuarios de auditoría/proyecto, revisores UAT, desarrolladores/agentes IA.
- **Problema que resuelve**: Garantiza que la evidencia de negocio siga vinculada al dominio correcto y pueda recuperarse o regenerarse para decisiones de ciclo de vida y prueba de release/UAT.
- **Valor de negocio / por qué existe**: Los flujos de no conformidad necesitan evidencia auditable, no solo campos de estado.
- **No objetivos**: Esta página no define arquitectura de filesystem/almacenamiento, permisos, nomenclatura/versionado ni política de retención hasta confirmar reglas de producto/IT.
- **Fuente de intención**: Borrador de capacidad existente + nombres de fuente; reglas documentales mayoritariamente pendientes de confirmación.
- **Referencia tracker de origen**: Issue #67 documentación de capacidades; evidencia de regresión de informe de auditoría 2026-06-14.

## §2 Contrato de comportamiento

### Escenarios (Given / When / Then)
- **GIVEN** un padre Proyecto, Auditoría, AC o AR **WHEN** un usuario adjunta/revisa/elimina evidencia **THEN** la evidencia permanece vinculada al tipo de padre e ID de padre correctos.
- **GIVEN** una NC de auditoría seleccionada en `Form_FormNCAuditoriaGestion` **WHEN** se ejecuta el comando de informe **THEN** usa `EnsureNCAuditoriaGestionSelected` y `constructor.getNCAuditoria`, no la ruta de constructor de proyecto.
- **GIVEN** se requiere evidencia para cierre/UAT **WHEN** el usuario intenta cerrar o liberar **THEN** la evidencia obligatoria ausente debe bloquearse o informarse según reglas confirmadas.

### Reglas de negocio
| ID de regla | Enunciado (previsto) | Autoridad | ¿Aplicada en código? | Prueba (evidencia) | Confianza |
|---|---|---|---|---|---|
| BR-DOC-1 | Los enlaces de evidencia deben incluir el contexto correcto de dominio/padre: NC Proyecto, NC Auditoría, Auditoría, AC o AR. | Contrato de capacidad | Desconocido / nombres de fuente indican superficies separadas | FALTA → crear mediante access-vba-tdd tras inspección de esquema | Intended |
| BR-DOC-2 | Las rutas documentales de Proyecto y Auditoría no deben confundirse por servicios compartidos. | Inventario de fuente + necesidad de capacidad | Desconocido | FALTA → crear mediante access-vba-tdd; pruebas de enrutamiento de dominio | Intended |
| BR-DOC-3 | La generación de informe de auditoría usa ruta de resolver/constructor de auditoría, no constructor de NC Proyecto. | Documento de funcionalidad de auditoría | Sí — fuente actual documentada con `EnsureNCAuditoriaGestionSelected` / `constructor.getNCAuditoria` | Referencia archivada: `tests/tests.vba.audit-gestion-helper.json` / `Test_AuditGestionForm_ReportConstructorPath_Characterization`; FALTA → reejecutar mediante access-vba-tdd para elevar a `Verified-runtime` | Verified-static |
| BR-DOC-4 | Las reglas de permisos para añadir/eliminar documentos, obligatoriedad, nomenclatura/versionado y retención son explícitas. | Autoridad de producto pendiente | Desconocido | FALTA → crear mediante access-vba-tdd tras confirmar reglas; añadir UAT cuando proceda | Intended |
| BR-DOC-5 | La evidencia generada es trazable a UAT/release antes de afirmarla como pasada. | Estándar capability-doc | Actualmente solo documentación | FALTA → crear mediante access-vba-tdd donde sea automatizable; añadir filas de evidencia release/UAT | Intended |
| BR-DOC-6 | Las salidas Word/Excel y correos se enlazan con documentos/evidencias sin perder contrato de dominio, filtros ni privacidad. | Capacidad hermana `CAP-COMMS-REPORTS` | Parcial / pendiente de contrato | FALTA → crear mediante access-vba-tdd para contrato Excel, send-vs-queue y BCC/privacidad | Intended |

### Validaciones
- Registro/dominio padre conocido antes de adjuntar evidencia.
- La NC seleccionada para informe de auditoría resuelve por ruta helper de auditoría (`EnsureNCAuditoriaGestionSelected`).
- Reglas de documento requerido, esquema de almacenamiento, tipo de archivo, tamaño, nomenclatura/versionado, retención y permisos pendientes de confirmación.

### Transiciones de estado
- `Sin documento` --(`Adjuntar`)--> `Documento enlazado al padre`.
- `Documento enlazado` --(`Sustituir/actualizar`)--> `Evidencia actualizada` — reglas de versionado pendientes.
- `Documento enlazado` --(`Eliminar`)--> `Evidencia eliminada/inactiva` — permisos/retención pendientes.
- `NC de auditoría seleccionada` --(`Generar informe`)--> `Informe de auditoría generado` — ruta de auditoría obligatoria.

### Caminos límite y de error
- La mezcla de dominios entre evidencia Proyecto/Auditoría/AR es un síntoma de riesgo de release.
- Las reglas de evidencia obligatoria ausente no pueden inferirse de los documentos actuales.

### Señales de aceptación / presencia
- Las operaciones de evidencia preservan tipo de padre + ID.
- La ruta de informe de auditoría no puede instanciar NC de proyecto para selecciones de auditoría.
- El comportamiento de evidencia obligatoria está cubierto por pruebas/UAT explícitos antes de afirmar release.

## §3 Mapa de implementación
- **Puntos de entrada UI**: `Form_FormNCProyectoDocumentos`, `Form_FormNCAuditoriaDocumentos`, `Form_FormAuditoriaDocumentos`, `Form_FormARProyectoDocumentos`, `Form_FormARAuditoriaDocumentos`, `Form_FormNCAuditoriaGestion.ComandoInforme_Click`.
- **Puntos de entrada de fuente**: `DocumentoService`, `DocumentoProyecto`, `DocumentoProyectoOperaciones`, `DocumentoAuditoria`, `DocumentoAuditoriaOperaciones`, `Informe` (que cubre tanto proyecto como auditoría vía `GenerarWordNoConformidades(p_EsDeProyecto)`). El módulo `InformeNCAuditorias` fue retirado el 2026-06-15 como dead-code marker.
- **Datos tocados**: registros de documento/adjunto (esquema exacto pendiente), registros padre NC Proyecto/NC Auditoría/Auditoría/AR, selecciones de informe generado.
- **Salidas**: adjuntos, informes generados de NC de auditoría, documentos Word, exportaciones Excel, correos/órdenes de correo y paquete de evidencia UAT/release.
- **Dependencias e integraciones**: ciclo de vida de Proyecto, ciclo de vida de Auditoría, control eficacia, informes, almacenamiento/filesystem.
- **Sincronización fuente↔binario**: no comprobada en esta tarea solo documental.
- **Evaluación de diseño (as-built vs ideal)**: formularios/clases separados sugieren separación de dominio, pero la ausencia de pruebas documentadas de almacenamiento/retención/permisos es un riesgo significativo de migración.

## §4 Receta de reconstrucción
1. Confirmar esquema documental, ubicación de almacenamiento, claves padre, permisos, nomenclatura/versionado, retención y reglas de evidencia obligatoria.
2. Para generación de informes, mantener la lógica de selección de informe en una costura helper/servicio; probar la costura en lugar del comportamiento directo de formulario.
3. Crear pruebas fixture con esquema primero para enrutamiento de dominio padre y selección de constructor de informe generado.
4. Añadir filas de evidencia UAT/release para flujos documentales obligatorios y salidas generadas.
5. Importar cualquier cambio futuro de fuente solo mediante Dysflow MCP; el usuario compila manualmente; después ejecutar pruebas Dysflow.

## §5 Evidencia y trazabilidad
- **Pruebas**: el documento de funcionalidad de auditoría existente cita `tests/tests.vba.audit-gestion-helper.json` / `Test_AuditGestionForm_ReportConstructorPath_Characterization`. No hubo ejecución reciente en esta tarea y no se afirma `Verified-runtime` nuevo.
- **Candidatas para prueba runtime futura**:
  - `tests/tests.vba.audit-gestion-helper.json`: `Test_AuditGestionForm_ReportConstructorPath_Characterization`, `Test_AuditListadoHelper_RowAndReportContracts_RED`.
  - `tests/tests.vba.seguimiento-tareas-helper.json`: `Test_TareasHelper_DeterministicOrder_ExportInput`, `Test_TareasForm_Delegates_FilterPaths`.
  - `tests/tests.vba.cache-e2e.json` / `tests/tests.vba.cache-warmup.json`: `Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic`.
- **Enlaces cruzados**: ver `docs/capabilities/nc-auditoria-lifecycle.md` y `docs/features/audit/audit-backend-list-cache.md` para la ruta de informe de auditoría; ver `docs/capabilities/communications-reports-exports.md` para correo, Word y Excel.

| Elemento (funcionalidad o arreglo) | Ref. tracker | Versión staging (UAT) | Estado UAT | Release de producción | Fecha en prod | Nota |
|---|---|---|---|---|---|---|
| El informe de auditoría usa ruta de constructor de auditoría | Evidencia de regresión 2026-06-14 | Pendiente | pending | Pendiente | Pendiente | `Verified-static`: fuente documentada con `EnsureNCAuditoriaGestionSelected` / `constructor.getNCAuditoria`; runtime fresco pendiente. |
| Comportamiento general de adjuntos/evidencia documental | Issue #67 | Pendiente | pending | Pendiente | Pendiente | Faltan pruebas de capacidad y reglas de negocio. |
| Contrato de salidas Word/Excel/correo como evidencia | Issue #67 | Pendiente | pending | Pendiente | Pendiente | FALTA → contrato Excel, send-vs-queue, BCC/privacidad y trazabilidad UAT/release. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla documental |
|---|---|---|---|
| El informe de auditoría abre dominio incorrecto | Regresión de ruta de informe | Reejecutar prueba helper/ruta de informe de auditoría | BR-DOC-3 |
| El documento aparece bajo padre incorrecto | Faltan pruebas de enrutamiento de dominio | Crear pruebas de enrutamiento documental | BR-DOC-1..2 |
| Falta evidencia de cierre/UAT | Reglas de evidencia obligatoria desconocidas | Confirmar reglas y después crear pruebas/UAT | BR-DOC-4..5 |
| Exportación/correo no trazable como evidencia | Contrato de salida y privacidad no definido | Crear pruebas de contrato Excel/correo tras inspección de esquema | BR-DOC-6 |

## §6 Notas de migración web
- Modelar documentos como recursos de evidencia con `parentType`, `parentId`, metadatos y traza de auditoría inmutable explícitos.
- Preservar el enrutamiento específico de dominio para Proyecto, Auditoría, AC, AR e informes generados.
- No copiar estado de rutas de fichero acoplado a formularios sin decisiones de almacenamiento/retención/seguridad.
- Definir permisos de previsualización/descarga/eliminación antes del corte web.

## §7 Libro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| La ruta de informe de auditoría debe usar resolver/constructor de auditoría. | Verified-static | Documento de funcionalidad de auditoría existente; sin reejecución | 2026-06-15 |
| Existen superficies UI documentales separadas para varios dominios. | Verified-static | Inventario de fuente de documentos existentes | 2026-06-15 |
| El comportamiento de añadir/eliminar/almacenar/retener documentos está protegido para release. | Intended | Faltan reglas/pruebas | 2026-06-15 |
| El contrato de Excel, correo send-vs-queue, BCC/privacidad y trazabilidad UAT/release está cerrado. | Intended | Faltan reglas/pruebas | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sospechada pero sin confirmar: el arreglo de ruta de informe de auditoría tiene trazabilidad de commit pendiente, por lo que la documentación puede describir comportamiento aún no trazable a un ancestro de staging con commit.
