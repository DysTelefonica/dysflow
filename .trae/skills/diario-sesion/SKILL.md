# Skill: diario-sesion

## Propósito
Registrar una entrada ligera en el Diario de Sesiones al cerrar una sesión de trabajo.
El diario es un log cronológico humano, NO una fuente de verdad técnica.
La fuente de verdad técnica está en Engram, las Specs y los PRDs.

## Cuándo activar este skill
- El usuario dice `CIERRE DE SESIÓN` o equivalente
- Al final de cualquier sesión con `VALIDADO EN ACCESS`

## Lo que NO va en el diario
- Código implementado (va en `src/`)
- Detalle de GAPs (va en la Spec)
- Decisiones de arquitectura (van en Engram vía `mem_save`)
- Cambios en PRDs (van en `docs/PRD/`)

## Pasos

### Paso 1 — Recuperar contexto de sesión
Revisar qué Specs se trabajaron y si hay `mem_save` pendientes.

### Paso 2 — Ejecutar mem_session_summary
Obligatorio antes de escribir la entrada del diario.

### Paso 3 — Redactar entrada
Usar la plantilla `docs/templates/diario_template.md`.
Mantenerla breve: máximo 15 líneas por entrada.

### Paso 4 — Añadir al diario
Insertar la entrada al principio de `docs/Diario_Sesiones.md` (orden cronológico inverso).