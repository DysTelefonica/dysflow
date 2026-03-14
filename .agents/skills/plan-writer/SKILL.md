---
name: plan-writer
description: >
  Activar cuando la historia de usuario es una Epic (afecta a >3 módulos o tiene >5
  intervenciones independientes) y el usuario elige la opción "Plan de Actuación" en
  el sdd-protocol. Genera un PLAN que descompone la Epic en múltiples Specs coordinadas.
  También activar si el usuario dice "quiero un plan de actuación", "descompón esto en specs",
  "crea un plan", "es demasiado grande para una sola spec".
  NO activar para historias de usuario pequeñas — usar sdd-protocol directamente.
---

# Plan Writer — Descomposición de Epics en múltiples Specs

## Propósito

Cuando una historia de usuario es demasiado amplia para una sola Spec, generar un
**Plan de Actuación** que:
1. Define el objetivo completo de la Epic
2. Descompone el trabajo en Specs atómicas e independientes (o con dependencias claras)
3. Establece el orden de implementación
4. Define el criterio de completitud del plan global

El Plan es el "índice" de la Epic. Cada Spec del plan sigue el flujo SDD normal.

---

## Rutas del proyecto

Esta skill NO tiene rutas hardcodeadas. Leer `references/project_context.md`
para obtener las rutas reales antes de ejecutar cualquier paso.

| Recurso | Ruta estándar |
| :--- | :--- |
| PLANes activos | `docs/plans/active/` |
| PLANes completados | `docs/plans/completed/` |
| Plantilla PLAN | `{ruta_de_esta_skill}/references/plan_template.md` |
| Specs activas | `docs/specs/active/` |

---

## Flujo de trabajo

### Paso 0 — Buscar contexto en Engram

**Obligatorio antes de abrir ningún fichero.**

```
mem_search "[módulo o área afectada]"
mem_search "[término clave de la Epic]"
```

### Paso 1 — Analizar la Epic completa

Con el contexto del sdd-protocol (ya se habrá leído DISCOVERY_MAP y PRDs):

1. Identificar todos los módulos afectados.
2. Identificar dependencias entre cambios (¿qué debe implementarse antes de qué?).
3. Agrupar los cambios en Specs atómicas: cada Spec debe poder validarse de forma
   independiente en Access sin depender de que otra Spec esté completa.

**Criterios para dividir en Specs:**
- Un módulo = una Spec (si el cambio en ese módulo es independiente)
- Una capa = una Spec (ej: capa de datos separada de capa de UI)
- Una dependencia obligatoria → Spec separada anterior
- Una integración entre partes → Spec final de integración

### Paso 2 — Numerar el Plan

Escanear `docs/plans/active/` y `docs/plans/completed/` para determinar el siguiente
número disponible. Formato: `PLAN-{NNN}` (tres dígitos, correlativo).

Preflight obligatorio:
- Si no existe `docs/plans/active/`, crearla.
- Si no existe `docs/plans/completed/`, crearla.
- Si no existe `docs/specs/active/`, crearla (para que los enlaces del plan sean válidos).

### Paso 3 — Generar el PLAN

Usar la plantilla `{ruta_de_esta_skill}/references/plan_template.md`.

Guardar en: `docs/plans/active/plan-{NNN}-{slug}/PLAN_{NNN}_{Titulo}.md`

Reglas obligatorias de salida:
1. El plan SIEMPRE se guarda en archivo Markdown en la ruta anterior (no solo en chat).
2. Tras guardar, verificar que el archivo existe.
3. Si el archivo no existe, la tarea NO está completada y se debe corregir antes de responder.
4. Los enlaces a Specs deben apuntar a `../../specs/active/...` o `../../specs/completed/...`.
5. No dejar placeholders (`{...}`, `X segundos`, `Y segundos`, etc.).

### Paso 4 — STOP: Validación del Plan

Presentar el Plan al usuario. El usuario revisa:
- ¿La descomposición en Specs tiene sentido?
- ¿El orden de dependencias es correcto?
- ¿Falta alguna Spec?

**Si pide cambios** → modificar el Plan y volver a presentar.
**Si aprueba** → indicar al usuario que ejecute:
```
dysflow plan {NNN}
```
Esto crea la rama `plan-{NNN}-{slug}` desde `develop`.

Respuesta mínima obligatoria al usuario tras crear el plan:
- Ruta exacta del archivo creado
- Comando `dysflow plan {NNN}`
- Resumen ejecutivo (máximo 10 líneas)

### Paso 5 — Guardar en Engram

```
mem_save
  title: "PLAN-{NNN}: [título de la Epic] — [módulos principales]"
  type: "architecture"
  content:
    What: objetivo de la Epic + Specs que la componen
    Why: por qué se dividió así (dependencias y razonamiento)
    Where: módulos y archivos afectados
    Learned: restricciones que condicionan el orden de implementación
```

### Paso 6 — Transición a sdd-protocol

Tras aprobar el Plan, volver al sdd-protocol para ejecutar cada Spec en orden:
1. Ejecutar Fase 1 completa para **Spec-NNN** (la primera del Plan)
2. Tras VALIDADO EN ACCESS de cada Spec → actualizar el estado en el PLAN
3. Cuando todas las Specs del PLAN estén VALIDADO → cerrar el PLAN (ver Cierre)

---

## Cierre del Plan

**Trigger:** todas las Specs del plan están en estado `✅ VALIDADO EN ACCESS`

La IA ejecuta:

1. Actualizar estado del PLAN a `✅ COMPLETADO`
2. Mover carpeta de `active/` a `completed/`
3. Añadir entrada en el Diario de Sesiones resumiendo la Epic completa
4. Guardar en Engram:
   ```
   mem_save
     title: "PLAN-{NNN} completado: [título] — [resultado]"
     type: "lesson-learned"
     content:
       What: qué Epic se completó
       Why: qué problema resolvió
       Where: módulos modificados (referencia a cada Spec)
       Learned: qué se aprendió de la descomposición (qué funcionó, qué cambiaría)
   ```
5. Preguntar al usuario si es la última Epic de la release → `dysflow release`

---

## Convenciones

### Numeración
`PLAN-NNN` (3 dígitos). Independiente de la numeración de Specs.

### Slug
Descriptivo de la Epic, en kebab-case, máximo 5 palabras.
Ejemplo: `plan-001-gestion-expedientes-judiciales`

### Granularidad de Specs dentro del Plan
- Mínimo: 2 Specs por Plan (si caben en 1, usar flujo normal)
- Máximo recomendado: 8 Specs (si hay más, revisar si la Epic es en realidad dos Epics)
- Cada Spec debe ser validable de forma independiente en Access
