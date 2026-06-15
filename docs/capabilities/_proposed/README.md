# Capacidades propuestas — Pendientes de producto

Este directorio contiene 7 capacidades que fueron identificadas durante el inventario de Fase 1 (2026-06-15, `docs/inventory/feature-matrix.md` §6) pero que aún no tienen product owner asignado ni tracker de origen. Cada stub es un `draft` mínimo con:

- §0 Identidad (placeholder para owner y tracker).
- §1 Resumen ejecutivo (por qué se propuso como capacidad propia).
- §2 Reglas de negocio tentativas (marcadas `Intended` con `FALTA → autor`).
- §3 Puntos de entrada (a inventariar con `dysflow.list_objects` o grep).
- §4 Pruebas atómicas (placeholder, sin tests vivos).
- §5 Riesgos y vínculos.
- §6 Notas de migración web (4 subsecciones: conservar / transformar / NO copiar / preguntas abiertas).
- §7 Registro de confianza (todas las BRs en `Intended`).
- §8 Próximo paso.

## Listado

| Stub | CAP-ID tentativo | Estado | Dominio tentativo |
|---|---|---|---|
| [`log-nc.md`](log-nc.md) | `CAP-LOG` | `draft` | transversal (vinculable a CAP-NCA-LC, CAP-NCP-LC) |
| [`replanificaciones.md`](replanificaciones.md) | `CAP-REP` | `draft` | transversal (vinculable a CAP-NCA-LC, CAP-NCP-LC, CAP-IND) |
| [`instalador-bootstrap.md`](instalador-bootstrap.md) | `CAP-BOOT` | `draft` | infraestructura (vinculable a CAP-CAT, CAP-CFG) |
| [`mail-notifications.md`](mail-notifications.md) | `CAP-MAIL` | `draft` | transversal (vinculable a CAP-COM, CAP-UPN) |
| [`tecnicos.md`](tecnicos.md) | `CAP-TECH` | `draft` | dominio aparte (vinculable a CAP-UPN) |
| [`excel-export.md`](excel-export.md) | `CAP-EXCEL` | `draft` | transversal (vinculable a CAP-COM, CAP-IND) |
| [`forms-nota.md`](forms-nota.md) | `CAP-NOTA` | `draft` | transversal (vinculable a CAP-NCA-LC, CAP-NCP-LC) |

## Procedimiento de promoción

Para que un stub pase de `_proposed/` a `docs/capabilities/` (sin el prefijo `_proposed`) y se incluya en `docs/capabilities/index.md`:

1. **Confirmar con producto** que la capacidad merece su propio CAP-ID. Si producto decide fusionar con otra capacidad existente, eliminar el stub y mover las BRs tentativas al §2 del capability absorbente.
2. **Localizar los entry points** con `dysflow.list_objects` y grep en `src/`. Confirmar que la lógica no es trivialmente un caso particular de otra capacidad.
3. **Cerrar las BRs tentativas** con producto. Cada `FALTA → autor` se resuelve con un `Verified-static` (link a spec) o un `Likely` (link a código) en §7.
4. **Escribir al menos un test atómico** que cubra la primera BR. Crear el manifest dedicado (`tests/tests.vba.<cap>.json`).
5. **Mover el archivo** de `_proposed/<key>.md` a `<key>.md` en `docs/capabilities/`.
6. **Actualizar `docs/capabilities/index.md`** agregando una fila al catálogo maestro con el nuevo CAP-ID.

## Estado al cierre de la épica Issue #67

- 7 stubs creados el 2026-06-15.
- 0 stubs promovidos (todos siguen en `draft`).
- 0 BRs tentativas cerradas (todas `Intended` con `FALTA → autor`).
- 0 tests escritos.
- Issue tracker dedicado: pendiente de creación por el humano si alguna capacidad se mantiene propuesta más de 1 sprint.

Estos stubs son la base de la "Fase 4" hipotética de la épica Issue #67 (no incluida en el alcance de esta entrega).
