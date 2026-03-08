---
name: spec-writer
description: >
  Genera Specs técnicas a partir de historias de usuario para el proyecto CONDOR VBA/Access.
  Usa este skill siempre que el usuario describa un cambio que quiere hacer, reporte un bug,
  pida una mejora, cuente una historia de usuario, o diga "quiero que...", "necesito que...",
  "hay un problema con...", "arregla...", "añade...". También cuando el usuario diga
  "genera un spec", "crea una spec", "especifica esto". Este skill se activa en la Fase 1
  del protocolo SDD V4 (docs/sdd/sdd_protocol.md).
---

# Spec Writer — Skill para generar Specs desde historias de usuario

## Propósito

Transformar una historia de usuario (descripción informal de lo que se quiere) en una Spec técnica
completa que otra IA (o la misma en otra sesión) pueda implementar sin ambigüedad. La Spec es el
contrato entre Andrés y la IA: si la Spec está aprobada, la IA implementa exactamente lo que dice.

## Flujo de trabajo

### Paso 0 — Buscar contexto en Engram

Antes de leer ningún fichero, buscar en Engram si ya existe contexto relevante:

```
mem_search "[módulo o área afectada]"
mem_search "[término clave de la historia de usuario]"
```

Si Engram devuelve decisiones técnicas previas, specs relacionadas o lecciones aprendidas sobre el área, incorporarlas al análisis de impacto. Esto evita proponer soluciones que ya se descartaron o repetir errores documentados.

---

### Paso 1 — Entender la historia de usuario

Escuchar lo que el usuario describe. No pedir aclaraciones innecesarias — si la intención es clara,
avanzar. Solo preguntar si hay ambigüedad real que impida generar la Spec.

### Paso 2 — Analizar impacto en la arquitectura

1. Leer `docs/DISCOVERY_MAP.md` para localizar módulos y archivos afectados.
2. Leer los PRDs relevantes en `docs/PRD/` para entender:
   - Firmas de métodos que hay que tocar.
   - Tablas de BD involucradas.
   - Transacciones existentes.
   - Flujos de UI y eventos.
3. Inspeccionar el código fuente en `src/` para confirmar el estado real y detectar detalles
   que los PRDs puedan no cubrir.
4. Revisar `docs/DEUDA_TECNICA.md` por si el cambio interactúa con riesgos conocidos.

### Paso 3 — Escribir la Spec siguiendo la plantilla

**OBLIGATORIO**: Leer `skills/spec-writer/references/spec_template.md` antes de escribir.
Seguir la estructura exacta de secciones definida en esa plantilla.

### Paso 4 — Numerar y guardar

1. Escanear `docs/specs/active/` y `docs/specs/completed/` para obtener el siguiente número.
2. Crear carpeta: `docs/specs/active/spec-{NNN}-{slug}/`
3. Guardar: `Spec-{NNN}_{Titulo}.md`
4. Guardar en Engram la spec creada:
   ```
   mem_save title="Spec-{NNN}: [título]" type="architecture" content="[historia de usuario + módulos afectados + decisiones de diseño clave]"
   ```

### Paso 5 — Presentar y STOP

Presentar la Spec completa al usuario. Detenerse y esperar aprobación.
No implementar nada hasta recibir el OK explícito.

## Convenciones

### Numeración
Secuencial, sin huecos. Escanear ambas carpetas (active + completed) para el máximo.
Para gaps de una Spec existente, NO crear sub-Specs (spec-XXXa, etc.). Los gaps se documentan
como sección dentro de la Spec original.

### Slug
Descriptivo, en kebab-case, máximo 5 palabras. Ejemplo: `spec-108-fix-hash-truncamiento`.

### Severidad
- `Crítica`: pérdida de datos, corrupción, crash.
- `Alta`: funcionalidad rota, bloqueo de flujo.
- `Media`: comportamiento incorrecto sin bloqueo.
- `Baja`: mejora cosmética o de usabilidad.