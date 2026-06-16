# Capacidad: Exportación a Excel (funcionalidad transversal)

> **Estado**: `draft` (propuesto) · **Nivel**: `standard` · **Fuente**: `reverse-engineered`
>
> Esta capacidad fue identificada durante el inventario de Fase 1 (2026-06-15) en `docs/inventory/feature-matrix.md` §6 "capacidades faltantes propuestas". Aún no tiene product owner asignado.

## §0 Identidad

- **ID de capacidad**: `CAP-EXCEL` (propuesto)
- **Nivel**: `standard`
- **Estado**: `draft` — propuesta pendiente de producto
- **Fuente**: `reverse-engineered` desde múltiples entry points `ComandoExportarAExcel_*`
- **Responsable / autoridad de producto**: `Confirmación pendiente`
- **Referencia tracker de origen**: `Confirmación pendiente`
- **Última verificación**: `Evidencia Dysflow pendiente`

## §1 Resumen ejecutivo (resumen ejecutivo del producto)

La capacidad de exportación a Excel cubre todas las exportaciones que la app hace a formato `.xlsx` o `.xls`: listados de NCs, indicadores, log de eventos, técnicos, etc. Está parcialmente capturada en CAP-COM (informes y reportes) y CAP-IND (cuadro de mando), pero los handlers `ComandoExportarAExcel_*` son entry points recurrentes que no se mapean a un único dominio.

El inventario lo separó como capacidad propia porque:

1. Hay múltiples handlers `ComandoExportarAExcel_Click` (o equivalentes) en distintos forms; no están centralizados.
2. La lógica de "qué columnas exportar", "qué formato aplicar", "dónde guardar el archivo" es transversal.
3. La web tendrá un servicio de exportación común que necesita su propio mapping.

## §2 Reglas de negocio (a confirmar con producto)

- `BR-EXCEL-1` (TBD): Toda exportación incluye un encabezado con la fecha de generación y el usuario que la disparó. **FALTA → autor** confirmar metadatos.
- `BR-EXCEL-2` (TBD): Las exportaciones respetan los filtros activos del form (no se exporta la tabla completa si hay un filtro). **FALTA → autor** confirmar comportamiento.
- `BR-EXCEL-3` (TBD): Las exportaciones grandes (>10.000 filas) se hacen en background con notificación al terminar. **FALTA → autor** confirmar umbral.
- `BR-EXCEL-4` (TBD): El formato de fecha y número respeta la configuración regional del usuario. **FALTA → autor** confirmar locale.
- `BR-EXCEL-5` (TBD): Las exportaciones a Excel son idempotentes (mismos datos → mismo archivo). **FALTA → autor** confirmar (vinculable a la regla general de idempotencia de CAP-CFG).

## §3 Puntos de entrada (a inventariar)

- Handlers `ComandoExportarAExcel_*` en todos los forms que tengan un botón de exportar a Excel.
- `src/modules/ExcelExporter.bas` (a confirmar) — módulo común con la lógica de exportación.
- Configuración regional: `TbConfiguracionBackends` (CAP-CFG) o `Variables Globales` (CAP-XCUT).

## §4 Pruebas atómicas (cuando producto cierre §2)

- `Test_Excel_EncabezadoIncluye_Atomic`: verificar que la primera fila del Excel tiene la fecha y el usuario.
- `Test_Excel_RespetaFiltros_Atomic`: aplicar un filtro y verificar que la exportación solo incluye las filas filtradas.
- `Test_Excel_FormatoRegional_Atomic`: cambiar el locale y verificar que las fechas se formatean correctamente.
- Manifest dedicado: `tests/tests.vba.excel.json` (a crear).

## §5 Riesgos y vínculos

- **Riesgo de duplicación**: si la lógica de exportación vive en cada form (cada uno llama a Excel directamente), CAP-EXCEL es un agregador lógico sin código propio. Si vive en un módulo común (`ExcelExporter.bas`), CAP-EXCEL tiene substance.
- **Riesgo de testing**: generar archivos Excel reales en CI requiere COM (lento, frágil). Tests deben verificar la consulta SQL o el recordset subyacente, no el archivo final.
- **Vinculado a**: CAP-COM, CAP-IND, CAP-CFG (configuración regional), CAP-LOG (las exportaciones se loguean).

## §6 Notas de migración web

### §6.1 Conservar
- Los encabezados de fecha y usuario (BR-EXCEL-1) sobreviven como metadatos en la primera fila.
- El respeto a los filtros activos (BR-EXCEL-2) sobrevive como query params en la URL.

### §6.2 Transformar
- Los handlers `ComandoExportarAExcel_Click` se reformulan como endpoints `GET /api/<recurso>/export.xlsx`.
- La librería COM de Excel se descarta — la web usa `xlsxwriter` o equivalente server-side.

### §6.3 NO copiar
- El uso de Excel COM automation se descarta (lento, requiere Excel instalado).
- El diálogo "Save As" de Access se descarta — la web usa `Content-Disposition: attachment` para forzar descarga.

### §6.4 Preguntas abiertas al product owner
- ¿Las exportaciones se hacen en background o bloquean la UI?
- ¿El formato de fecha/número es por usuario o por configuración del sistema?

## §7 Registro de confianza

| BR | Resumen | Confianza | Evidencia | Fecha |
|---|---|---|---|---|
| `BR-EXCEL-1` | Encabezado con fecha y usuario | `Intended` | FALTA → autor confirmar metadatos | 2026-06-15 |
| `BR-EXCEL-2` | Respeta filtros activos | `Intended` | FALTA → autor confirmar comportamiento | 2026-06-15 |
| `BR-EXCEL-3` | Exportaciones grandes en background | `Intended` | FALTA → autor confirmar umbral | 2026-06-15 |
| `BR-EXCEL-4` | Formato regional | `Intended` | FALTA → autor confirmar locale | 2026-06-15 |
| `BR-EXCEL-5` | Idempotencia | `Intended` | FALTA → autor confirmar | 2026-06-15 |

## §8 Próximo paso

1. Localizar todos los handlers `ComandoExportarAExcel_*` con grep en `src/forms/`.
2. Determinar si la lógica está centralizada en un módulo común o distribuida.
3. Si está centralizada, promover este stub; si no, fusionar con CAP-COM (que ya cubre "generación de informes y reportes").
