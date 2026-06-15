# Capacidad: Envío de correos / notificaciones

> **Estado**: `draft` (propuesto) · **Nivel**: `standard` · **Fuente**: `reverse-engineered`
>
> Esta capacidad fue identificada durante el inventario de Fase 1 (2026-06-15) en `docs/inventory/feature-matrix.md` §6 "capacidades faltantes propuestas". Aún no tiene product owner asignado.

## §0 Identidad

- **ID de capacidad**: `CAP-MAIL` (propuesto)
- **Nivel**: `standard`
- **Estado**: `draft` — propuesta pendiente de producto
- **Fuente**: `reverse-engineered` desde el código (a localizar `Correo.cls` y form asociado)
- **Responsable / autoridad de producto**: `Confirmación pendiente`
- **Referencia tracker de origen**: `Confirmación pendiente`
- **Última verificación**: `Evidencia Dysflow pendiente`

## §1 Resumen ejecutivo (resumen ejecutivo del producto)

La capacidad de envío de correos cubre las notificaciones automáticas que el sistema envía a los responsables de NCs, auditores, gestores, etc. cuando ocurren eventos relevantes: nueva NC asignada, cambio de estado, recordatorio de plazo, etc. Está parcialmente capturada en `comms-reports-exports` pero solo en lo relativo a informes generados; el envío de emails como notificación push no está.

El inventario lo separó como capacidad propia porque:

1. Hay una clase `Correo.cls` (a confirmar el nombre exacto) que tiene su propio ciclo de vida y no se mezcla con la generación de informes.
2. La lógica de notificaciones tiene reglas de negocio (¿a quién se notifica? ¿en qué evento? ¿con qué plantilla?) que son transversales.
3. La web tendrá un servicio de notificaciones (email, push, SMS) que necesita su propio mapping.

## §2 Reglas de negocio (a confirmar con producto)

- `BR-MAIL-1` (TBD): El alta de una NC dispara un email al responsable con un enlace al detalle. **FALTA → autor** confirmar plantilla y campos.
- `BR-MAIL-2` (TBD): El cambio de estado de una NC dispara un email a los watchers (responsable, auditores, gestores del proyecto). **FALTA → autor** confirmar lista de watchers.
- `BR-MAIL-3` (TBD): Los recordatorios de plazo se envían N días antes del vencimiento. **FALTA → autor** confirmar N y si es configurable.
- `BR-MAIL-4` (TBD): Los emails con errores (rebote, dirección inválida) quedan registrados para reintento. **FALTA → autor** confirmar mecanismo de retry.
- `BR-MAIL-5` (TBD): El envío respeta la privacidad: BCC al remitente en notificaciones masivas. **FALTA → autor** confirmar política de privacidad (vinculable a BR-COM-5).

## §3 Puntos de entrada (a inventariar)

- `src/classes/Correo.cls` (a confirmar) — clase principal de envío.
- `src/forms/Form_*Correo*.cls` (a confirmar) — form de configuración o preview.
- Tabla de plantillas: ¿`TbPlantillasEmail`? — a inspeccionar con `dysflow.get_schema`.
- Configuración SMTP: ¿en `TbConfiguracionBackends` (CAP-CFG) o en una tabla propia?

## §4 Pruebas atómicas (cuando producto cierre §2)

- `Test_Mail_PlantillaRenderiza_Atomic`: verificar que la plantilla tiene los placeholders correctos y se renderiza sin errores.
- `Test_Mail_Destinatarios_Atomic`: dado un evento, verificar que la lista de destinatarios es la esperada.
- Manifest dedicado: `tests/tests.vba.mail.json` (a crear).

## §5 Riesgos y vínculos

- **Riesgo de testing**: enviar emails reales en CI es problemático (rebote, spam, lentitud). Tests deben mockear el envío o usar un servidor SMTP de test.
- **Riesgo de scope**: si la lógica de "a quién notificar" vive en cada dominio (CAP-NCA-LC, CAP-NCP-LC), fusionar; si vive centralizada, mantener CAP-MAIL.
- **Vinculado a**: CAP-COM (informes y emails comparten infraestructura), CAP-LOG (los envíos exitosos se loguean), CAP-UPN (los destinatarios vienen de la matriz de usuarios).

## §6 Notas de migración web

### §6.1 Conservar
- Las plantillas de email (BR-MAIL-1) sobreviven como archivos `.html` o `.mjml` con variables de templating.
- La política de privacidad (BR-MAIL-5) sobrevive igual.

### §6.2 Transformar
- La clase `Correo.cls` se reformula como un servicio de notificaciones (`notification-service`) que envía por email, push, SMS, etc.
- La UI de preview de email se reformula como un modal web con preview HTML.

### §6.3 NO copiar
- El uso de Outlook COM desde VBA se descarta — la web usa SMTP directo o un servicio como SendGrid/Resend.
- El almacenamiento de credenciales SMTP en el código se descarta — la web usa secretos en el backend.

### §6.4 Preguntas abiertas al product owner
- ¿La notificación es solo email o también push/SMS?
- ¿Los watchers son por NC o por dominio (todos los del proyecto reciben todo)?
- ¿El envío es síncrono (bloquea el form) o asíncrono (background job)?

## §7 Registro de confianza

| BR | Resumen | Confianza | Evidencia | Fecha |
|---|---|---|---|---|
| `BR-MAIL-1` | Alta NC → email al responsable | `Intended` | FALTA → autor confirmar plantilla | 2026-06-15 |
| `BR-MAIL-2` | Cambio estado → email a watchers | `Intended` | FALTA → autor confirmar lista watchers | 2026-06-15 |
| `BR-MAIL-3` | Recordatorio N días antes | `Intended` | FALTA → autor confirmar N | 2026-06-15 |
| `BR-MAIL-4` | Errores de envío → log de retry | `Intended` | FALTA → autor confirmar mecanismo | 2026-06-15 |
| `BR-MAIL-5` | Privacidad BCC | `Intended` | FALTA → autor confirmar política | 2026-06-15 |

## §8 Próximo paso

1. Localizar con `dysflow.list_objects` y grep en `src/` la clase `Correo.cls` y el form asociado.
2. Confirmar si las notificaciones están centralizadas (clase única) o distribuidas (cada dominio notifica por su cuenta).
3. Si están centralizadas, promover este stub a capacidad formal; si no, fusionar con CAP-NCA-LC y CAP-NCP-LC.
