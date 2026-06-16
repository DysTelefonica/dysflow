# Capacidad: Replanificaciones (cambios sobre el plan de una NC)

> **Estado**: `draft` (propuesto) · **Nivel**: `standard` · **Fuente**: `reverse-engineered`
>
> Esta capacidad fue identificada durante el inventario de Fase 1 (2026-06-15) en `docs/inventory/feature-matrix.md` §6 "capacidades faltantes propuestas". Aún no tiene product owner asignado ni tracker de origen.

## §0 Identidad

- **ID de capacidad**: `CAP-REP` (propuesto)
- **Nivel**: `standard`
- **Estado**: `draft` — propuesta pendiente de producto
- **Fuente**: `reverse-engineered` desde el código, sin spec previa
- **Responsable / autoridad de producto**: `Confirmación pendiente`
- **Referencia tracker de origen**: `Confirmación pendiente`
- **Última verificación**: `Evidencia Dysflow pendiente`

## §1 Resumen ejecutivo (resumen ejecutivo del producto)

La capacidad de replanificación cubre los eventos "cambiar la fecha prevista de cierre", "cambiar el responsable", "ampliar el plazo" y similares que pueden ocurrir múltiples veces durante la vida de una NC. Hoy estos cambios están parcialmente capturados por CAP-NCA-LC y CAP-NCP-LC (lifecycle), pero la historia de cambios como entidad consultable no lo está.

El inventario la separó como capacidad propia porque:

1. Hay nombres de funciones o eventos con prefijo `Replanificacion*` o `Repro*` (a confirmar) que no están en CAP-NCA-LC ni CAP-NCP-LC.
2. La consulta "cuántas veces se ha replanificado esta NC" es un report o KPI (vinculable a CAP-IND) que cruza dominios.
3. La regla de negocio "una NC no se puede replanificar más de N veces" (a confirmar) es una restricción transversal.

## §2 Reglas de negocio (a confirmar con producto)

- `BR-REP-1` (TBD): Una replanificación requiere motivo (campo obligatorio, dropdown o texto libre). **FALTA → autor** confirmar tipo de campo.
- `BR-REP-2` (TBD): Cada replanificación queda registrada con fecha, usuario, motivo, fecha anterior, fecha nueva. **FALTA → autor** confirmar tabla.
- `BR-REP-3` (TBD): Existe un límite de replanificaciones por NC (e.g., 3). **FALTA → autor** confirmar número y si es hard-limit o soft-warning.
- `BR-REP-4` (TBD): Las replanificaciones afectan a la métrica "días de retraso" del dashboard (vinculable a CAP-IND). **FALTA → autor** confirmar fórmula.

## §3 Puntos de entrada (a inventariar)

- Clases o funciones con prefijo `Replanificacion*`, `Repro*`, `Reprogramar*` — a localizar con `Get-ChildItem src/**/*Replanif*` y `Get-ChildItem src/**/*Repro*`.
- Formularios que disparan replanificación: ¿`Form_Reprogramar*`? ¿botón en `Form_FormNCAuditoria.cls`?
- Tablas: ¿`TbReplanificaciones`? ¿`TbRepro*`? — a inspeccionar con `dysflow.get_schema`.

## §4 Pruebas atómicas (cuando producto cierre §2)

- Por cada BR, 1-3 pruebas `Test_REP_X_Atomic`.
- Manifest dedicado: `tests/tests.vba.rep.json` (a crear cuando exista el primer test).

## §5 Riesgos y vínculos

- **Riesgo de duplicación**: si las replanificaciones viven como un atributo de NC (no como entidad propia), fusionar con CAP-NCA-LC y CAP-NCP-LC.
- **Vinculado a**: CAP-NCA-LC, CAP-NCP-LC, CAP-LOG (si las replanificaciones generan log), CAP-IND (métrica de retraso).

## §6 Notas de migración web

### §6.1 Conservar
- La invariancia de que cada replanificación tiene motivo obligatorio (BR-REP-1) sobrevive a la web como validación en el form.
- La trazabilidad de la historia de replanificaciones (BR-REP-2) sobrevive como una vista histórica en la web.

### §6.2 Transformar
- Las macros o eventos VBA que registran la replanificación se reformulan como un endpoint REST `POST /api/nc/{id}/replanificaciones`.
- La UI del botón "Reprogramar" se reformula como un modal web con los campos `motivo`, `fecha_nueva`.

### §6.3 NO copiar
- El patrón Access de "abrir un form modal para reprogramar" no se porta — la web usa un modal nativo.
- El uso de TempVars para pasar el ID de la NC al form de reprogramación se descarta.

### §6.4 Preguntas abiertas al product owner
- ¿El límite de replanificaciones (BR-REP-3) es por NC o por dominio (todas las NCs del mismo proyecto comparten el contador)?
- ¿La fórmula de "días de retraso" (BR-REP-4) cuenta desde la fecha original o desde la última replanificación?

## §7 Registro de confianza

| BR | Resumen | Confianza | Evidencia | Fecha |
|---|---|---|---|---|
| `BR-REP-1` | Replanificación requiere motivo | `Intended` | FALTA → autor confirmar tipo campo | 2026-06-15 |
| `BR-REP-2` | Replanificaciones quedan registradas | `Intended` | FALTA → autor confirmar tabla | 2026-06-15 |
| `BR-REP-3` | Límite de replanificaciones | `Intended` | FALTA → autor confirmar número y tipo | 2026-06-15 |
| `BR-REP-4` | Replanificaciones afectan KPI | `Intended` | FALTA → autor confirmar fórmula | 2026-06-15 |

## §8 Próximo paso

1. Localizar con grep `src/**/*Replanif*` y `src/**/*Repro*` los entry points.
2. Si la lógica vive ya en CAP-NCA-LC o CAP-NCP-LC, fusionar; si es transversal, promover este stub.
3. Pasar §2 a producto para cerrar las 4 BRs tentativas.
