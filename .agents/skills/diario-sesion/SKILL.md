---
name: diario-sesion
description: >
  Registra una entrada en el Diario de Sesiones al cerrar una sesión de trabajo.
  Activar cuando el usuario diga "CIERRE DE SESIÓN", "cerrar sesión", "fin de sesión",
  o cuando el protocolo SDD llegue a la Fase 4 de cierre tras "VALIDADO EN ACCESS: Spec-XXX".
  NO activar para consultas informales ni durante el desarrollo activo.
---

# Diario de Sesión — Skill de cierre

## Propósito

Registrar una entrada ligera y legible en el Diario de Sesiones al cerrar una sesión de trabajo.
El diario es un **log cronológico humano** — no una fuente de verdad técnica.

| Fuente de verdad | Dónde vive |
| :--- | :--- |
| Decisiones de arquitectura | Engram (`mem_save`) |
| Código implementado | `src/` |
| Detalle de gaps y cambios | Specs en `docs/specs/` |
| Documentación de módulos | PRDs en `docs/PRD/` |
| **Resumen humano legible** | **`docs/Diario_Sesiones.md`** ← este skill |

---

## Rutas del proyecto

Esta skill NO tiene rutas hardcodeadas. Leer `references/project_context.md`
para obtener la ruta real de `docs/Diario_Sesiones.md` y `docs/specs/`.

La plantilla de entrada está en:
`{ruta_de_esta_skill}/references/diario_template.md`

---

## Cuándo NO escribir en el diario

- Consultas informales o preguntas técnicas sin cambio de código
- Sesiones que no llegaron a validación en Access
- Iteraciones de gap intermedias (solo al cierre final con VALIDADO EN ACCESS)

---

## Flujo de trabajo

### Paso 1 — Verificar que hay algo que cerrar

Comprobar que en esta sesión ocurrió al menos uno de:
- Una Spec validada con `VALIDADO EN ACCESS`
- Un hotfix entregado y confirmado por el usuario
- Avance significativo en el autodescubrimiento (≥1 PRD generado)

Si no ocurrió nada de lo anterior → no escribir entrada. Indicarlo al usuario.

---

### Paso 2 — Ejecutar mem_session_summary (obligatorio primero)

Antes de redactar la entrada del diario, ejecutar:

```
mem_session_summary:
  Goal:         qué se quería lograr en esta sesión
  Discoveries:  hallazgos de arquitectura, bugs, patrones, FKs
  Accomplished: qué quedó completado y validado
  Files:        archivos creados o modificados (rutas relativas)
```

**No redactar la entrada del diario hasta haber ejecutado `mem_session_summary`.**
Engram es la fuente de verdad — el diario es el resumen legible de lo que ya está en Engram.

---

### Paso 3 — Redactar la entrada

Leer la plantilla en `{ruta_de_esta_skill}/references/diario_template.md` y rellenarla.

Reglas de redacción:
- Máximo 20 líneas por entrada
- Tono directo, sin florituras — es un log, no un informe
- Solo hechos concretos: qué se hizo, qué quedó pendiente, qué bloqueó
- Los detalles técnicos van en Engram y en los PRDs, no aquí
- Si no hay nada pendiente, indicarlo explícitamente ("Sin pendientes")

---

### Paso 4 — Insertar al principio del diario

Insertar la entrada al **principio** de `docs/Diario_Sesiones.md`.
El diario está en orden cronológico inverso — la sesión más reciente siempre arriba.

**NUNCA borrar ni modificar entradas anteriores.**

---

### Paso 5 — Ejecutar mem_session_end

```
mem_session_end
```

Confirmar al usuario que la sesión está cerrada y el diario actualizado.