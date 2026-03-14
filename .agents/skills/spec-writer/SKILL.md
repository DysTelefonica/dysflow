---
name: spec-writer
description: >
  Genera Specs técnicas a partir de historias de usuario para proyectos VBA/Access.
  Usar cuando el usuario describa un cambio, reporte un bug, pida una mejora, o diga
  "quiero que...", "necesito que...", "hay un problema con...", "arregla...", "añade...",
  "genera un spec", "crea una spec", "especifica esto".
  Este skill se activa en la Fase 1 del sdd-protocol.
  NO activar de forma independiente si sdd-protocol está activo — sdd-protocol lo orquesta.
---

# Spec Writer — Generación de Specs desde historias de usuario

## Propósito

Transformar una historia de usuario (descripción informal) en una Spec técnica completa
que otra IA —o la misma en otra sesión— pueda implementar sin ambigüedad.

La Spec es el contrato entre el usuario y la IA: si está aprobada, la IA implementa
exactamente lo que dice, ni más ni menos.

---

## Rutas del proyecto

Esta skill NO tiene rutas hardcodeadas. Leer `references/project_context.md`
para obtener las rutas reales de `src/`, `docs/`, `docs/PRD/`, `docs/specs/` y `docs/DEUDA_TECNICA.md`.

La plantilla de Spec está en:
`{ruta_de_esta_skill}/references/spec_template.md`

---

## Flujo de trabajo

### Paso 0 — Buscar contexto en Engram

**Obligatorio antes de abrir ningún fichero.**

```
mem_search "[módulo o área afectada]"
mem_search "[término clave de la historia de usuario]"
```

Si Engram devuelve decisiones técnicas previas, Specs relacionadas o lecciones aprendidas
sobre el área → incorporarlas al análisis de impacto sin releer los ficheros de origen.
Esto evita proponer soluciones ya descartadas o repetir errores documentados.

---

### Paso 1 — Entender la historia de usuario

Escuchar lo que el usuario describe. No pedir aclaraciones innecesarias — si la intención
es clara, avanzar. Solo preguntar si hay ambigüedad real que impida generar la Spec.

---

### Paso 2 — Analizar impacto en la arquitectura

En este orden:

1. Leer `docs/DISCOVERY_MAP.md` → localizar módulos y archivos físicos afectados.
2. Verificar que el módulo afectado tiene PRD en `docs/PRD/`.
   - Si no tiene PRD → activar `prd-writer` para crearlo antes de continuar.
3. Leer los PRDs relevantes para entender:
   - Firmas de métodos que hay que tocar.
   - Tablas de BD involucradas y sus campos clave.
   - Transacciones existentes.
   - Flujos de UI y eventos de formulario.
4. Inspeccionar código fuente en `src/` solo si el PRD no cubre el detalle necesario.
5. Revisar `docs/DEUDA_TECNICA.md` por si el cambio interactúa con riesgos conocidos.

---

### Paso 3 — Escribir la Spec siguiendo la plantilla

**OBLIGATORIO**: leer `{ruta_de_esta_skill}/references/spec_template.md` antes de escribir.
Seguir la estructura exacta de secciones de la plantilla. No inventar secciones nuevas.

---

### Paso 4 — Numerar, guardar y registrar en Engram

1. Escanear `docs/specs/active/` y `docs/specs/completed/` → usar el siguiente número disponible.
2. Crear carpeta: `docs/specs/active/spec-{NNN}-{slug}/`
3. Guardar: `docs/specs/active/spec-{NNN}-{slug}/Spec-{NNN}_{Titulo}.md`
4. Guardar en Engram aplicando `{RULES_DIR}/engram-memory-quality.md` antes del `mem_save`:
   ```
   mem_save
     title: "Spec-{NNN}: [título breve] — [módulo principal]"
     type: "architecture"
     content:
       What: historia de usuario resumida + decisiones de diseño clave
       Why: por qué este enfoque y no otro (si hubo alternativas)
       Where: módulos y archivos afectados con rutas relativas
       Learned: restricciones o patrones del código que condicionan la solución
   ```

---

### Paso 5 — Presentar y STOP

Presentar la Spec completa al usuario. Detenerse y esperar aprobación explícita.
**No implementar nada** hasta recibir el OK del usuario.

Si el usuario pide cambios → modificar la Spec y volver a presentar.
Si aprueba → el sdd-protocol continúa con la Fase 2.

---

## Convenciones

### Numeración
Secuencial, sin huecos. Escanear `active/` y `completed/` para determinar el máximo actual.

Para gaps de una Spec existente, NO crear sub-Specs (`spec-XXXa`, etc.).
Los gaps se documentan como sección adicional dentro de la Spec original.

### Slug
Descriptivo, en kebab-case, máximo 5 palabras.
Ejemplo: `spec-042-fix-calculo-importes`

### Severidad
| Nivel | Cuándo aplica |
| :--- | :--- |
| `Crítica` | Pérdida de datos, corrupción, crash de la aplicación |
| `Alta` | Funcionalidad rota, bloqueo de flujo de trabajo |
| `Media` | Comportamiento incorrecto sin bloqueo |
| `Baja` | Mejora cosmética o de usabilidad |