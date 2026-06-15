# Capacidad: comunicaciones, informes y exportaciones

## §0 Identidad
- **ID de capacidad**: `CAP-COMMS-REPORTS`
- **Tier**: standard
- **Estado**: active / inventario documental inicial; contratos de salida pendientes de prueba runtime
- **Source**: hybrid
- **Responsable / autoridad de producto**: Pendiente de confirmación — Calidad / comunicaciones operativas
- **Última verificación**: 2026-06-15 mediante inspección estática; no se ejecutó Dysflow/Access
- **Confianza global**: mixta — rutas de código verificadas estáticamente; comportamiento de envío/salida, contrato Excel y política BCC/privacidad sin prueba runtime reciente

## §1 Intención de negocio
- **Propósito**: Generar comunicaciones e informes de NC para evidenciar estado, acciones y tareas ante responsables y revisores.
- **Usuarios / perfiles**: Calidad, responsables de proyecto/auditoría, revisores UAT y soporte.
- **Problema que resuelve**: Sin salidas reproducibles, la información de NC queda dentro de Access y no puede circular ni auditarse fuera de la aplicación.
- **Valor de negocio / por qué existe**: Permite notificar, registrar correos pendientes de envío y generar documentos Word con información de NC y acciones.
- **No-objetivos**: No define política corporativa de correo, BCC/privacidad ni almacenamiento/retención final de documentos.
- **Origen de la intención**: Código exportado + docs de auditoría y capability de documentos.
- **Referencia de tracker de origen**: Issue #67; evidencia de regresión de informe de auditoría 2026-06-14.

## §2 Contrato de comportamiento

### Escenarios (Dado / Cuando / Entonces)
- **DADO** una NC Proyecto activa **CUANDO** se abre `Form_FormCorreo` en modo proyecto **ENTONCES** se propone asunto de informe de NC de proyecto y destinatario del responsable Telefónica si existe.
- **DADO** una NC Auditoría activa **CUANDO** se abre `Form_FormCorreo` en modo auditoría **ENTONCES** se propone asunto de auditoría y destinatarios de calidad en pruebas.
- **DADO** que el usuario envía un correo **CUANDO** faltan asunto o destinatarios **ENTONCES** la operación se bloquea con mensaje de validación.
- **DADO** datos válidos **CUANDO** se registra el correo **ENTONCES** se crea una fila en `TbCorreosEnviados` con asunto, cuerpo HTML, originador y destinatarios.
- **DADO** una o varias NC **CUANDO** se genera Word **ENTONCES** se copia la plantilla de Proyecto/Auditoría al directorio local de informes y se inserta la información de NC, AC y tareas.

### Reglas de negocio
| ID regla | Enunciado (pretendido) | Autoridad | ¿Aplicada en código? | Prueba | Confianza |
|---|---|---|---|---|---|
| BR-COM-1 | No se puede ordenar correo sin asunto. | Código exportado | Sí — `Form_FormCorreo.ComandoEnviarCorreo_Click`, `Correo.Registrar` | FALTA → crear mediante access-vba-tdd con objeto `Correo` y fixture/control de `TbCorreosEnviados` | Verified-static |
| BR-COM-2 | No se puede ordenar correo sin destinatario principal, copia ni copia oculta. | Código exportado | Sí — formulario y clase `Correo` | FALTA → crear mediante access-vba-tdd | Verified-static |
| BR-COM-3 | El cuerpo del correo se genera en HTML desde la NC activa y debe incluir acciones. | Código exportado | Sí — `HTMLNCProyecto` / `HTMLNCAuditoria` con `p_ConAcciones:=EnumSino.Sí` | FALTA → crear mediante access-vba-tdd sobre HTML | Verified-static |
| BR-COM-4 | El correo se registra como orden de envío en `TbCorreosEnviados`; no se afirma envío SMTP directo. | Código exportado | Sí — `Correo.Registrar` hace `AddNew` | FALTA → crear mediante access-vba-tdd con cardinalidad | Verified-static |
| BR-COM-5 | Si no hay BCC, se añade una copia oculta por defecto. | Código exportado | Sí — `Correo.Registrar` | FALTA → crear mediante access-vba-tdd; confirmar si sigue siendo regla de negocio válida | Likely |
| BR-COM-6 | La generación Word exige saber si la NC es de Proyecto o Auditoría y usar la plantilla correspondiente. | Código exportado | Sí — `Informe.GenerarWordNoConformidades` / `PrepararPlantilla` | FALTA → crear mediante access-vba-tdd o prueba de costura sin automatizar Word real | Verified-static |
| BR-COM-7 | Exportaciones Excel desde listados/seguimiento preservan filtros y columnas de negocio. | Nombres de eventos | Probable — eventos `ComandoExportarAExcel_Click` aparecen en formularios de seguimiento | FALTA → crear mediante access-vba-tdd; mapear eventos exactos | Likely |
| BR-COM-8 | La ruta de informe de auditoría usa selección/constructor de auditoría, no constructor de NC Proyecto. | Docs de auditoría + capacidad documental | Sí documentado estáticamente — `EnsureNCAuditoriaGestionSelected` / `constructor.getNCAuditoria` | Referencia archivada: `Test_AuditGestionForm_ReportConstructorPath_Characterization`; FALTA → reejecutar mediante access-vba-tdd | Verified-static |

### Validaciones
- Asunto obligatorio.
- Al menos un destinatario obligatorio.
- Cuerpo HTML obligatorio en `Correo.Registrar`.
- Parámetro `p_EsDeProyecto` obligatorio para informes Word.
- Plantilla de informe debe existir en ruta de entorno; si no existe, error bloqueante.
- Contrato de exportación Excel — columnas, filtros, orden y formato — pendiente de definición/prueba.
- Política de cola/envío real de correo y BCC/privacidad pendiente de confirmación.

### Transiciones de estado
- `Correo redactado` --(`Registrar`)--> `Correo ordenado para envío`.
- `Sin plantilla local` --(`PrepararPlantilla`)--> `Plantilla copiada a directorio local de informes`.
- `NC seleccionada` --(`GenerarWordNoConformidades`)--> `Documento Word generado`.

### Casos límite y de error
- Formulario de correo abierto sin NC activa o sin `OpenArgs` suficiente se cierra con error.
- Word Automation puede dejar salidas parciales; las pruebas deberían usar costuras o doble de sistema de ficheros/Word.
- La BCC por defecto contiene un correo fijo y requiere revisión de privacidad/operación antes de migración web.

### Señales de aceptación / presencia
- El registro en `TbCorreosEnviados` se crea una sola vez con campos completos.
- Las salidas Word usan plantilla de Proyecto/Auditoría correcta.
- No se marca envío como `Verified-runtime` sin manifest que pruebe registro y contenido.
- No se marca exportación Excel como `Verified-runtime` sin contrato de columnas/filtros probado.

## §3 Mapa de implementación
- **Puntos de entrada de UI**: `Form_FormCorreo`; eventos de informe en `Form_FormNCAuditoriaGestion`; posibles `ComandoExportarAExcel_Click` en formularios de seguimiento.
- **Puntos de entrada de código**: `Correo`, `Informe` (incluye `GenerarWordNoConformidades(p_EsDeProyecto:=No)` para el caso auditoría), `HTML`, `Módulo1.EnviarCorreoReactivacionNC`, `CorreoAlAdministrador` como soporte de error. `InformeNCAuditorias` fue retirado como dead-code marker el 2026-06-15 (commit <SHA>) — el archivo `src/classes/InformeNCAuditorias.cls` estaba vacío desde el commit inicial `df3c17a` y ningún path de runtime lo instanciaba; la generación de informe de auditoría se hace por `Informe.GenerarWordNoConformidades(p_EsDeProyecto:=No)`.
- **Datos afectados**: `TbCorreosEnviados`; rutas/plantillas de `Entorno`; NC Proyecto/Auditoría y acciones asociadas.
- **Salidas**: filas de correo/orden de envío, HTML, documentos Word, posibles exportaciones Excel y evidencia documental vinculada.
- **Dependencias e integraciones**: documentos/evidencia, NC Proyecto, NC Auditoría, acciones/seguimiento, soporte transversal.
- **Sincronización fuente↔binario**: no comprobada; tarea solo documental.
- **Valoración de diseño**: separar registro de correo de envío real es razonable. Word Automation y rutas fijas deben encapsularse antes de web; el correo fijo en copia oculta es una deuda a revisar.

## §4 Receta de reconstrucción
1. Confirmar con producto qué comunicaciones son obligatorias, destinatarios, copias, privacidad y plantilla oficial.
2. Inspeccionar esquema de `TbCorreosEnviados` antes de crear fixtures.
3. Crear pruebas de `Correo.Registrar`: asunto vacío, destinatarios vacíos, cuerpo vacío, registro correcto y BCC por defecto si se confirma.
4. Crear costuras para HTML e informe Word sin depender de Word real cuando sea posible.
5. Mapear y probar exportaciones Excel con filtros, columnas, orden y formato si se decide que son parte de la capacidad.
6. Confirmar política de envío directo frente a cola/orden de envío, BCC por defecto y privacidad antes de elevar la confianza.

## §5 Evidencia y trazabilidad
- **Tests**: no se localizó manifest dedicado a correo/informes/exportaciones. Hay evidencia adyacente de ruta de informe de auditoría en `tests/tests.vba.audit-gestion-helper.json` citada por docs de auditoría.
- **Candidatas para prueba runtime futura**:
  - `tests/tests.vba.audit-gestion-helper.json`: `Test_AuditGestionForm_ReportConstructorPath_Characterization`, `Test_AuditListadoHelper_RowAndReportContracts_RED`.
  - `tests/tests.vba.seguimiento-tareas-helper.json`: `Test_TareasHelper_DeterministicOrder_ExportInput`, `Test_TareasForm_Delegates_FilterPaths`.
  - `tests/tests.vba.cache-e2e.json` / `tests/tests.vba.cache-warmup.json`: `Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic`.
- **Enlaces cruzados**: ver `docs/capabilities/documents-generated-evidence.md` para evidencia documental; ver `docs/capabilities/nc-auditoria-lifecycle.md` y `docs/features/audit/audit-backend-list-cache.md` para la ruta de informe de auditoría.

| Elemento | Ref. tracker | Versión de staging (UAT) | Estado UAT | Release de producción | Fecha en producción | Nota |
|---|---|---|---|---|---|---|
| Ruta de informe de auditoría | Evidencia 2026-06-14 | Pendiente | pending | Pendiente | Pendiente | `Verified-static`: fuente documentada con `EnsureNCAuditoriaGestionSelected` / `constructor.getNCAuditoria`; runtime fresco pendiente. |
| Registro de correos | Pendiente | Pendiente | pending | Pendiente | Pendiente | Falta manifest dedicado. |
| Generación Word/Excel | Pendiente | Pendiente | pending | Pendiente | Pendiente | Falta contrato de salida; para Excel faltan columnas/filtros/orden/formato. |
| Política send-vs-queue y BCC/privacidad | Pendiente | Pendiente | pending | Pendiente | Pendiente | No elevar por encima de `Likely`/`Intended` sin decisión de producto y prueba. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla del documento |
|---|---|---|---|
| No se registra correo | Validación o escritura en `TbCorreosEnviados` rota | Crear/rejecutar pruebas de `Correo.Registrar` | BR-COM-1..5 |
| Informe de auditoría abre dominio incorrecto | Ruta de constructor incorrecta | Reejecutar prueba de audit helper | BR-COM-8 |
| Word/Excel incompleto | Plantilla/ruta/columnas sin contrato | Crear prueba de costura de salida | BR-COM-6..7 |

## §6 Notas de migración web

### §6.1 Conservar (comportamiento de negocio que debe sobrevivir)
- La obligatoriedad de asunto, destinatario principal, copia y copia oculta antes de registrar un correo (BR-COM-1, BR-COM-2): la API de envío de la web debe rechazar la orden si falta cualquiera de esos campos, con el mismo orden de validación que `Form_FormCorreo.ComandoEnviarCorreo_Click` aplica hoy.
- La generación del cuerpo del correo en HTML desde la NC activa con `p_ConAcciones:=EnumSino.Sí` (BR-COM-3): la plantilla de correo de la web debe seguir incluyendo el bloque de acciones cuando `ConAcciones` venga verdadero, conservando las dos firmas `HTMLNCProyecto` y `HTMLNCAuditoria`.
- El modelo de **orden de envío** en `TbCorreosEnviados` (no envío SMTP directo) (BR-COM-4): el sistema de la web debe distinguir entre "orden registrada" y "envío efectivo", y nunca afirmar que un correo se envió solo porque se persistió.
- La selección de plantilla Word por origen de la NC (Proyecto vs Auditoría) en `Informe.GenerarWordNoConformidades(p_EsDeProyecto:=)` y `PrepararPlantilla` (BR-COM-6): el generador documental de la web debe seguir exigiendo `p_EsDeProyecto` y rechazar la generación si no se resuelve, igual que el código VBA actual.
- La separación de constructores para informes: `EnsureNCAuditoriaGestionSelected` + `constructor.getNCAuditoria` para auditoría, jamás `constructor.getNCProyecto` (BR-COM-8): la API REST de generación de informes debe mantener dos rutas explícitas con guard de tipo de NC.

### §6.2 Transformar (mecanismo legacy que se reformula)
- Sustituir `Form_FormCorreo` y el botón `ComandoEnviarCorreo_Click` por una pantalla de redacción con vista previa del HTML generado y un endpoint `POST /correos/ordenes` que delegue en una capa de aplicación en lugar de un formulario Access.
- Sustituir Word Automation local (`Informe.GenerarWordNoConformidades`) por un servicio server-side que use una plantilla controlada por configuración y devuelva una URL de descarga + entrada de auditoría inmutable, en lugar de un `.docx` generado en el cliente.
- Reemplazar la BCC por defecto embebida en `Correo.Registrar` (BR-COM-5) por una política de destinatarios por configuración auditada, versionada y revisable por producto antes de promover release.
- Convertir las exportaciones Excel de seguimiento en endpoints `GET /exportaciones/...` con un contrato explícito de columnas, filtros aplicados y formato, en lugar de eventos `ComandoExportarAExcel_Click` acoplados al formulario de seguimiento.

### §6.3 NO copiar (deuda legacy de Access que no debe portarse)
- No portar la dirección fija de la copia oculta por defecto (BR-COM-5) como constante en código: moverla a configuración auditada o eliminarla si producto la considera obsoleta.
- No migrar la generación de Word como dependencia del lado cliente: el archivo `.docx` debe ser generado y firmado en servidor, no por la app web del usuario.
- No asumir que la fila en `TbCorreosEnviados` equivale a correo enviado: el estado de la orden y el estado del envío deben ser columnas separadas en el modelo de la web, con transiciones explícitas.
- No duplicar la lógica de selección de plantilla de informe (`PrepararPlantilla` resuelve por `p_EsDeProyecto` y por plantilla de entorno) en cada consumidor; exponer un único servicio de generación que centralice esa decisión.
- No reutilizar `Me.OpenArgs` ni ribbon como contrato de selección de NC: la API web debe recibir un identificador de NC explícito en la URL o el body, sin parámetros opacos.

### §6.4 Preguntas abiertas al product owner
- ¿La BCC por defecto (BR-COM-5) sigue siendo una regla válida o es deuda operativa que debe eliminarse antes de migrar? Confirmar con Calidad y privacidad.
- ¿Cuál es la plantilla Word oficial de NC de Proyecto y de NC de Auditoría? ¿Existe un repositorio versionado o hay que crearlo como parte de la migración? (BR-COM-6)
- ¿Qué política de retención aplica a los documentos Word generados y a los correos ordenados? ¿Se conservan tras el cierre de la NC o se purgan? (BR-COM-4, BR-COM-6)
- ¿El contrato de exportación Excel (BR-COM-7) debe cubrir los mismos seguimientos que hoy existen o se redefinen los reportes en la web? Confirmar lista de seguimientos, columnas y orden antes de la migración.
- ¿Quién es el originador por defecto de un correo cuando el usuario no lo proporciona? ¿Se sigue derivando del usuario conectado como hace el código actual?
- ¿El envío SMTP real lo hace un worker desacoplado, un servicio de la empresa o sigue siendo un Outlook local? Decidir y documentar antes de definir el modelo de estados de la orden.

## §7 Registro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| BR-COM-1 — No se puede ordenar correo sin asunto. | Verified-static | `Form_FormCorreo.ComandoEnviarCorreo_Click` y `Correo.Registrar` en `src/forms/Form_FormCorreo.cls` + `src/classes/Correo.cls`; FALTA → crear mediante access-vba-tdd con objeto `Correo` y fixture de `TbCorreosEnviados` | 2026-06-15 |
| BR-COM-2 — No se puede ordenar correo sin destinatario principal, copia ni copia oculta. | Verified-static | Validación en `Form_FormCorreo.cls` y `Correo.Registrar`; FALTA → crear mediante access-vba-tdd | 2026-06-15 |
| BR-COM-3 — El cuerpo del correo se genera en HTML desde la NC activa y debe incluir acciones. | Verified-static | `HTMLNCProyecto` / `HTMLNCAuditoria` con `p_ConAcciones:=EnumSino.Sí`; FALTA → crear mediante access-vba-tdd sobre HTML | 2026-06-15 |
| BR-COM-4 — El correo se registra como orden de envío en `TbCorreosEnviados`; no se afirma envío SMTP directo. | Verified-static | `Correo.Registrar` hace `AddNew`; FALTA → crear mediante access-vba-tdd con cardinalidad | 2026-06-15 |
| BR-COM-5 — Si no hay BCC, se añade una copia oculta por defecto. | Likely | `Correo.Registrar`; FALTA → crear mediante access-vba-tdd; confirmar si sigue siendo regla de negocio válida | 2026-06-15 |
| BR-COM-6 — La generación Word exige saber si la NC es de Proyecto o Auditoría y usa la plantilla correspondiente. | Verified-static | `Informe.GenerarWordNoConformidades` / `PrepararPlantilla`; FALTA → crear mediante access-vba-tdd o prueba de costura sin automatizar Word real | 2026-06-15 |
| BR-COM-7 — Exportaciones Excel desde listados/seguimiento preservan filtros y columnas de negocio. | Likely | Eventos `ComandoExportarAExcel_Click` en formularios de seguimiento; FALTA → crear mediante access-vba-tdd; mapear eventos exactos | 2026-06-15 |
| BR-COM-8 — La ruta de informe de auditoría usa selección/constructor de auditoría, no constructor de NC Proyecto. | Verified-static | `EnsureNCAuditoriaGestionSelected` / `constructor.getNCAuditoria`; referencia archivada `Test_AuditGestionForm_ReportConstructorPath_Characterization`; FALTA → reejecutar mediante access-vba-tdd | 2026-06-15 |
| `Form_FormCorreo` valida asunto y destinatarios antes de registrar. | Verified-static | `src/forms/Form_FormCorreo.cls` | 2026-06-15 |
| `Correo.Registrar` escribe en `TbCorreosEnviados`. | Verified-static | `src/classes/Correo.cls` | 2026-06-15 |
| `Informe` genera documentos Word desde plantillas de Proyecto/Auditoría. | Verified-static | `src/classes/Informe.cls` | 2026-06-15 |
| Las exportaciones Excel preservan filtros/columnas. | Likely | Nombres de eventos de formularios; sin lectura exhaustiva de implementación | 2026-06-15 |
| La ruta de informe de auditoría usa `EnsureNCAuditoriaGestionSelected` / `constructor.getNCAuditoria`. | Verified-static | Docs de auditoría y referencia archivada `Test_AuditGestionForm_ReportConstructorPath_Characterization`; sin reejecución | 2026-06-15 |
| La política de envío real frente a cola, BCC/privacidad y contrato Excel está cerrada. | Intended | Faltan decisión de producto y pruebas | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Pendiente de revisión: la copia oculta por defecto parece una regla operativa embebida en código, no una intención SDD documentada.
