# Capacidad: Formularios de "nota" / captura rápida

> **Estado**: `draft` (propuesto) · **Nivel**: `minimal` · **Fuente**: `reverse-engineered`
>
> Esta capacidad fue identificada durante el inventario de Fase 1 (2026-06-15) en `docs/inventory/feature-matrix.md` §6 "capacidades faltantes propuestas". Aún no tiene product owner asignado.

## §0 Identidad

- **ID de capacidad**: `CAP-NOTA` (propuesto)
- **Nivel**: `minimal`
- **Estado**: `draft` — propuesta pendiente de producto
- **Fuente**: `reverse-engineered` desde múltiples forms con "nota" en el nombre (a localizar)
- **Responsable / autoridad de producto**: `Confirmación pendiente`
- **Referencia tracker de origen**: `Confirmación pendiente`
- **Última verificación**: `Evidencia Dysflow pendiente`

## §1 Resumen ejecutivo (resumen ejecutivo del producto)

La capacidad de "notas" cubre los formularios modales o popups de captura rápida que el sistema usa para añadir contexto a una NC, un técnico, un expediente, etc. sin abrir el form principal: una nota de progreso, un comentario del auditor, una observación del gestor. Son entry points recurrentes que no se mapean a un único dominio.

El inventario lo separó como capacidad propia porque:

1. Hay múltiples forms con "nota" o "notas" en el nombre (a localizar con `Get-ChildItem src/forms/*Nota*`).
2. La lógica de "qué se puede notar", "quién lo puede ver", "es privado o público" es transversal.
3. La web tendrá un componente de "comentarios" o "anotaciones" que necesita su propio mapping.

## §2 Reglas de negocio (a confirmar con producto)

- `BR-NOTA-1` (TBD): Una nota tiene un autor, fecha, texto y referencia al objeto al que se asocia (NC, técnico, expediente, etc.). **FALTA → autor** confirmar campos.
- `BR-NOTA-2` (TBD): Las notas son inmutables (no se editan, solo se añaden; o se editan pero queda histórico). **FALTA → autor** confirmar modelo.
- `BR-NOTA-3` (TBD): Las notas son visibles para todos los participantes del objeto (responsable, auditores, gestores) o solo para Admins. **FALTA → autor** confirmar visibilidad.
- `BR-NOTA-4` (TBD): Las notas pueden tener adjuntos (ficheros, imágenes). **FALTA → autor** confirmar si hay adjuntos y dónde se almacenan.

## §3 Puntos de entrada (a inventariar)

- Forms con "nota" o "notas" en el nombre: `Form_*Nota*` (a localizar).
- Tabla: ¿`TbNotas`? ¿`TbComentarios`? — a inspeccionar con `dysflow.get_schema`.
- Clases: ¿`Nota.cls`? — a localizar.

## §4 Pruebas atómicas (cuando producto cierre §2)

- `Test_Nota_CRUD_Atomic`: alta, lectura, modificación/borrado de una nota (depende de BR-NOTA-2).
- `Test_Nota_Visibilidad_Atomic`: verificar que un usuario sin permisos no ve las notas de otro dominio.
- Manifest dedicado: `tests/tests.vba.nota.json` (a crear).

## §5 Riesgos y vínculos

- **Riesgo de duplicación**: si las notas son específicas de un dominio (e.g., notas solo de NCs), fusionar con CAP-NCA-LC y CAP-NCP-LC. Si son transversales, mantener CAP-NOTA.
- **Riesgo de scope**: si las notas son solo texto, es trivial. Si tienen adjuntos, la lógica de almacenamiento (vinculable a CAP-DGE) es no trivial.
- **Vinculado a**: CAP-NCA-LC, CAP-NCP-LC, CAP-DGE (si hay adjuntos), CAP-LOG (las notas se loguean).

## §6 Notas de migración web

### §6.1 Conservar
- El modelo de datos de la nota (BR-NOTA-1) sobrevive como una tabla `notas` polimórfica (FK a NC, técnico, expediente, etc.).
- La visibilidad por participante (BR-NOTA-3) sobrevive como control de acceso por rol.

### §6.2 Transformar
- Los forms modales de Access se reformulan como modales web con `<dialog>` o como panel lateral.
- El almacenamiento de adjuntos (BR-NOTA-4) se reformula con S3/blob storage y URLs prefirmadas.

### §6.3 NO copiar
- El uso de `DoCmd.OpenForm` con `acDialog` se descarta — la web usa modales nativos.
- El paso de contexto via `OpenArgs` de Access se descarta — la web usa query params o estado en el cliente.

### §6.4 Preguntas abiertas al product owner
- ¿Las notas son solo texto o admiten adjuntos?
- ¿Las notas son editables o inmutables?
- ¿La visibilidad es por dominio (NC, técnico) o por usuario (watchers)?

## §7 Registro de confianza

| BR | Resumen | Confianza | Evidencia | Fecha |
|---|---|---|---|---|
| `BR-NOTA-1` | Modelo de datos de la nota | `Intended` | FALTA → autor confirmar campos | 2026-06-15 |
| `BR-NOTA-2` | Inmutabilidad o histórico | `Intended` | FALTA → autor confirmar modelo | 2026-06-15 |
| `BR-NOTA-3` | Visibilidad | `Intended` | FALTA → autor confirmar permisos | 2026-06-15 |
| `BR-NOTA-4` | Adjuntos | `Intended` | FALTA → autor confirmar almacenamiento | 2026-06-15 |

## §8 Próximo paso

1. Localizar todos los forms `Form_*Nota*` y la tabla subyacente.
2. Confirmar con producto si las notas son un dominio aparte o un atributo de cada dominio.
3. Si son dominio aparte, escribir el primer test atómico y promover el stub; si no, fusionar con los dominios correspondientes.
