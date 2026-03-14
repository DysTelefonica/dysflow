# Skill: rfc-writer

## Propósito
Generar un RFC (Request for Change) para decisiones de arquitectura grandes que preceden al flujo SDD.
Un RFC es obligatorio cuando el cambio afecta a contratos de interfaz entre módulos, modifica el modelo de datos,
o impacta en más de un PRD. Sin RFC aprobado, no se inicia el SDD.

## Cuándo activar este skill
- El usuario describe un cambio de arquitectura significativo
- El cambio afecta a múltiples módulos o capas (Model, Service, Repository, ViewModel)
- El cambio requiere modificar tablas en `ERD/Estructura_Datos.md`
- El cambio impacta en uno o más PRDs existentes
- Hay incertidumbre sobre qué alternativa técnica elegir

## Cuándo NO activar este skill
- El cambio es una historia de usuario sin impacto en contratos → usar sdd-protocol directamente
- El cambio es un bugfix acotado a un solo módulo → usar sdd-protocol directamente
- El cambio ya tiene RFC aprobado → pasar a sdd-protocol

## Pasos

### Paso 0 — Contexto Engram
Ejecutar `mem_search "[módulo o área afectada]"` antes de redactar.
Si hay decisiones previas relacionadas, incorporarlas en la sección de Alternativas.

### Paso 1 — Recopilar información
Preguntar al usuario si no está claro:
- ¿Qué problema concreto resuelve este cambio?
- ¿Qué módulos y PRDs están afectados?
- ¿Hay restricciones conocidas (rendimiento, compatibilidad, deuda técnica)?

### Paso 2 — Redactar el RFC
Usar la plantilla `docs/templates/rfc_template.md`.
Numeración: `RFC-NNN` (correlativo al último RFC en `docs/rfcs/`).

Reglas obligatorias:
1. El RFC SIEMPRE se guarda en archivo Markdown (no solo en chat).
2. Ruta obligatoria: `docs/rfcs/RFC-{NNN}_{titulo-kebab}.md`.
3. Tras guardar, verificar que el archivo existe.
4. No dejar placeholders (`{...}`, `X segundos`, `Y segundos`, etc.).

### Paso 3 — STOP: presentar y esperar aprobación
Presentar el RFC completo al usuario.
No iniciar el SDD hasta recibir aprobación explícita (`APROBADO`).

Respuesta mínima obligatoria:
- Ruta exacta del RFC creado
- Estado actual del RFC (`Borrador` o `En revisión`)
- Resumen ejecutivo (máximo 10 líneas)

### Paso 4 — Guardar en Engram
```
mem_save title="RFC-NNN: [título]" type="architecture"
```

### Paso 5 — Tras aprobación
- Actualizar estado del RFC a `Aprobado`
- Actualizar `AGENTS.md` si el RFC introduce nuevas reglas críticas
- Iniciar sdd-protocol con referencia al RFC aprobado
