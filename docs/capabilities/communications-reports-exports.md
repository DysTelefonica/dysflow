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
- **Puntos de entrada de código**: `Correo`, `Informe`, `InformeNCAuditorias`, `HTML`, `Módulo1.EnviarCorreoReactivacionNC`, `CorreoAlAdministrador` como soporte de error.
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
- Modelar correo como cola/orden de envío con estado, no como efecto lateral invisible.
- Sustituir Word Automation por generador server-side trazable o plantilla documental controlada.
- Eliminar direcciones fijas en código; mover a configuración auditada.
- Definir contratos de exportación con columnas, filtros y formato antes de migrar.

## §7 Registro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| `Form_FormCorreo` valida asunto y destinatarios antes de registrar. | Verified-static | `src/forms/Form_FormCorreo.cls` | 2026-06-15 |
| `Correo.Registrar` escribe en `TbCorreosEnviados`. | Verified-static | `src/classes/Correo.cls` | 2026-06-15 |
| `Informe` genera documentos Word desde plantillas de Proyecto/Auditoría. | Verified-static | `src/classes/Informe.cls` | 2026-06-15 |
| Las exportaciones Excel preservan filtros/columnas. | Likely | Nombres de eventos de formularios; sin lectura exhaustiva de implementación | 2026-06-15 |
| La ruta de informe de auditoría usa `EnsureNCAuditoriaGestionSelected` / `constructor.getNCAuditoria`. | Verified-static | Docs de auditoría y referencia archivada `Test_AuditGestionForm_ReportConstructorPath_Characterization`; sin reejecución | 2026-06-15 |
| La política de envío real frente a cola, BCC/privacidad y contrato Excel está cerrada. | Intended | Faltan decisión de producto y pruebas | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Pendiente de revisión: la copia oculta por defecto parece una regla operativa embebida en código, no una intención SDD documentada.
