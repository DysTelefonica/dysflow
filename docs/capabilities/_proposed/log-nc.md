# Capacidad: Log de no conformidades (auditoría e inmutabilidad)

> **Estado**: `draft` (propuesto) · **Nivel**: `standard` · **Fuente**: `reverse-engineered`
>
> Esta capacidad fue identificada durante el inventario de Fase 1 (2026-06-15) en `docs/inventory/feature-matrix.md` §6 "capacidades faltantes propuestas". Aún no tiene product owner asignado ni tracker de origen; las reglas de negocio y señales de aceptación están pendientes de cierre.

## §0 Identidad

- **ID de capacidad**: `CAP-LOG` (propuesto)
- **Nivel**: `standard`
- **Estado**: `draft` — propuesta pendiente de producto
- **Fuente**: `reverse-engineered` desde el código, sin spec previa
- **Responsable / autoridad de producto**: `Confirmación pendiente` (el product owner actual de CAP-NCA-LC / CAP-NCP-LC es el candidato natural, pero hay que confirmar)
- **Referencia tracker de origen**: `Confirmación pendiente`
- **Última verificación**: `Evidencia Dysflow pendiente`

## §1 Resumen ejecutivo (resumen ejecutivo del producto)

Las tablas de log (`LogNC*` u objetos equivalentes) registran inyecciones al historial de cada no conformidad: altas, cambios de estado, modificaciones de campos críticos, asignaciones de responsables, generación de evidencias. Funcionan como auditoría operativa inmutable — el log nunca se borra, solo crece.

Aún no se ha decidido formalmente si esta capacidad merece su propio CAP-LOG, o si los eventos de log son un cross-cutting concern de CAP-NCA-LC y CAP-NCP-LC. El inventario la separó porque:

1. Hay clases o módulos con prefijo `LogNC*` (a confirmar) que no son referenciados por `NCAuditoria.cls` / `NCProyecto.cls` directamente.
2. La inmutabilidad del log tiene reglas de negocio (e.g., "no se puede borrar una fila de log", "no se puede modificar la fecha del evento") que cruzan dominios (auditoría + proyecto).
3. La exportación a Excel del log y los filtros de búsqueda son features que no encajan en CAP-NCA-LC o CAP-NCP-LC.

## §2 Reglas de negocio (a confirmar con producto)

- `BR-LOG-1` (TBD): Cada cambio de estado de NC genera al menos una fila en `LogNC*` con timestamp, usuario, estado origen, estado destino. **FALTA → autor** confirmar nombre de tabla y columnas.
- `BR-LOG-2` (TBD): Las filas de log son inmutables (no UPDATE, no DELETE permitido por código ni por SQL). **FALTA → autor** confirmar si esta invariante está enforced en el código actual o solo documentada.
- `BR-LOG-3` (TBD): La generación de informes o evidencias genera una fila de log con el path del fichero y el usuario que disparó. **FALTA → autor** confirmar si el path es local o de red.
- `BR-LOG-4` (TBD): Filtros de búsqueda por NC, fecha, usuario, tipo de evento. **FALTA → autor** confirmar UI/form de consulta.
- `BR-LOG-5` (TBD): Exportación a Excel del log filtrado. **FALTA → autor** confirmar columnas mínimas y formato.

## §3 Puntos de entrada (a inventariar)

- Clases o módulos con prefijo `LogNC*` — a localizar con `Get-ChildItem src/**/LogNC*`.
- Formularios o reportes que consuman `LogNC*` — a localizar con `dysflow.list_objects` filtrado.
- Tablas de base de datos: ¿`TbLogNC*`? ¿`TbLogEventos`? ¿`TbAuditoriaEventos`? — a inspeccionar con `dysflow.get_schema`.

## §4 Pruebas atómicas (cuando producto cierre §2)

- Por cada BR, 1-3 pruebas `Test_LOG_X_Atomic` siguiendo el patrón de los tests existentes en `src/modules/Test_*.bas`.
- Manifest dedicado: `tests/tests.vba.log.json` (a crear cuando exista el primer test).

## §5 Riesgos y vínculos

- **Riesgo de duplicación**: si las filas de log viven en la misma tabla que las de auditoría, fusionar con CAP-NCA-LC o CAP-NCP-LC en vez de crear CAP-LOG.
- **Riesgo de scope creep**: las preguntas de "qué se loguea" son por dominio (auditoría vs proyecto), así que la respuesta natural es mantener la separación por dominio y tener CAP-LOG como agregador transversal.
- **Vinculado a**: CAP-NCA-LC, CAP-NCP-LC, CAP-XCUT.

## §6 Notas de migración web

> **Esta sección se poblará en `standard` cuando el producto cierre §2.** Por ahora es solo placeholder.

### §6.1 Conservar
- Inmutabilidad del log (BR-LOG-2) sobrevive tal cual a una tabla append-only en la web.

### §6.2 Transformar
- Los eventos de VBA que insertan filas en `LogNC*` se reformulan como triggers de servicio en el backend web.

### §6.3 NO copiar
- Las macros Access que invocan el log desde eventos de form (e.g., `Form_AfterUpdate`) se descartan — la web hace el log en el backend, no en el frontend.

### §6.4 Preguntas abiertas al product owner
- ¿La inmutabilidad es por código (BR-LOG-2) o por rol (los Admins pueden borrar logs)?
- ¿El log retiene datos personales del usuario? ¿Hay RGPD concern?

## §7 Registro de confianza

| BR | Resumen | Confianza | Evidencia | Fecha |
|---|---|---|---|---|
| `BR-LOG-1` | Cambio de estado → fila de log | `Intended` | FALTA → autor confirmar tabla/columnas | 2026-06-15 |
| `BR-LOG-2` | Inmutabilidad del log | `Intended` | FALTA → autor confirmar enforcement | 2026-06-15 |
| `BR-LOG-3` | Generación de evidencia → log | `Intended` | FALTA → autor confirmar path | 2026-06-15 |
| `BR-LOG-4` | Filtros de búsqueda | `Intended` | FALTA → autor confirmar UI | 2026-06-15 |
| `BR-LOG-5` | Exportación a Excel | `Intended` | FALTA → autor confirmar columnas | 2026-06-15 |

## §8 Próximo paso

1. Localizar con `dysflow.list_objects` y grep en `src/` las clases/módulos `LogNC*` y la tabla subyacente.
2. Si la lógica vive en CAP-NCA-LC o CAP-NCP-LC, fusionar; si es transversal, promover este `_proposed/log-nc.md` a `log-nc.md` (sin `_proposed`).
3. Pasar §2 a producto para cerrar las 5 BRs tentativas.
