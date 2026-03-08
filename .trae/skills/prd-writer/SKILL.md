---
name: prd-writer
description: >
  Genera y actualiza PRDs (Product Requirement Documents) de calidad industrial para proyectos VBA/Access.
  Usa este skill siempre que el usuario pida crear, escribir, actualizar, revisar o mejorar un PRD, PR, documento de
  arquitectura o documento de funcionalidad. También cuando el usuario diga "documenta esta funcionalidad",
  "haz un PR de...", "actualiza el PRD de...", "crea el PRD para el módulo X", o cualquier variación que implique
  documentar una funcionalidad del sistema. Este skill se integra con el protocolo SDD — los PRDs se revisan
  y actualizan durante el cierre de Specs (Fase 3 del sdd_protocol.md).
---

# PRD Writer — Skill para documentar funcionalidades VBA/Access

## Propósito

Este skill enseña a la IA a producir PRDs (documentos de arquitectura/funcionalidad) con el nivel de detalle
necesario para que **otra IA pueda generar o modificar código en una sola pasada**, sin acceso interactivo al
repositorio. La audiencia de un PRD no es solo humana — es principalmente otra IA implementadora que opera
bajo el protocolo SDD.

## Cuándo se activa

- El usuario pide crear/escribir/actualizar un PRD o PR.
- El usuario dice "documenta esta funcionalidad" o "haz un PR de...".
- Durante la Fase 3 (cierre) del protocolo SDD, cuando hay que revisar/actualizar `docs/PRD/*.md`.
- Cuando el usuario referencia un módulo del DISCOVERY_MAP y pide documentarlo.

---

## Flujo de trabajo

### Paso 0 — Buscar contexto en Engram

Antes de leer ningún fichero, buscar en Engram si ya existe conocimiento sobre el módulo:

```
mem_search "[nombre del módulo]"
mem_search "[tablas o clases implicadas]"
```

Si Engram devuelve contexto suficiente (arquitectura, decisiones previas, specs relacionadas), usarlo directamente y saltar al Paso 3. Si no, continuar desde el Paso 1.

Tras escribir o actualizar un PRD, guardar en Engram:
```
mem_save title="PRD [ID]: [Nombre módulo] actualizado" type="architecture" content="[decisiones clave, cambios, deuda técnica relevante]"
```

---

### Paso 1 — Leer la plantilla y el contexto del proyecto

**Antes de escribir nada**, leer siempre estos dos archivos:

1. `references/prd_template.md` — estructura universal, instrucciones y antipat `references/project_context.md` — vocabulariorones.
2. del proyecto actual: nombres de módulos,
   tablas, formularios, patrones de error, convenciones de nomenclatura.

**La plantilla dice *cómo* estructurarlo. El contexto dice *con qué* hacerlo.**

Si `project_context.md` no existe en el repositorio, solicitarlo al usuario antes de continuar
(o pedirle que complete la plantilla `project_context_template.md`).

### Paso 2 — Localizar el módulo en DISCOVERY_MAP

Leer `docs/DISCOVERY_MAP.md` para:
1. Identificar el ID del módulo (definido en la Sección 2 del DISCOVERY_MAP).
2. Localizar todos los archivos físicos asociados (clases, módulos, formularios).
3. Entender las dependencias con otros módulos.

El DISCOVERY_MAP tiene 3 secciones clave:
- **Sección 2 — Inventario de Módulos**: ID, nombre y tipo de cada módulo.
- **Sección 3 — Physical to Logical Map**: mapea cada archivo `.cls`/`.bas`/`.form.txt` a su módulo PRD y rol arquitectónico (DTO, Service, Repository, Helper, ViewModel, UI).

Usar esta información para saber **qué archivos leer** en el código fuente.

### Paso 3 — Inspeccionar el código fuente

Para cada archivo identificado en el Paso 2:
1. Leer el archivo completo en `src/classes/`, `src/modules/` o `src/forms/`.
2. Extraer: firmas de métodos públicos, tipos de parámetros, valores de retorno.
3. Identificar: tablas de BD usadas, transacciones, manejo de errores, eventos de UI.
4. Documentar: algoritmos no triviales, flujos de datos entre capas.

**REGLA CRÍTICA**: No inventar datos. Si no puedes determinar algo leyendo el código, márcalo con
`⚠️ VERIFICAR:` seguido de lo que hay que confirmar. El objetivo es **minimizar** estos marcadores.

### Paso 4 — Escribir el PRD

Seguir la estructura de `references/prd_template.md` usando el vocabulario de `references/project_context.md`.

- Secciones **siempre obligatorias**: 0, 1, 2, 6, 10, 11, 12, 13.
- Secciones **opcionales** (omitir si no aplican, nunca dejar vacías): 3, 4, 5, 7, 8, 9.
- **No renumerar** las secciones aunque se omitan opcionales — usar siempre la numeración 0-13.

### Paso 5 — Autoevaluación antes de entregar

Verificar internamente los siguientes criterios. Si alguno falla, corregir antes de entregar.
**No imprimir este checklist al usuario.**

1. **Firmas completas**: ¿Cada método tiene firma con `ByVal`/`ByRef`, tipos, opcionales, retorno y módulo?
2. **Tablas con tipos**: ¿Cada tabla tiene campos con tipo Access, nulabilidad, default y PK?
3. **FKs explícitas**: ¿Las foreign keys están documentadas como `FK → tbTabla.Campo`?
4. **Valores enumerados**: ¿Los campos Text con valores fijos tienen los valores documentados?
5. **Algoritmos**: ¿Hay hash, serialización u otra lógica no trivial? ¿Está descrita con función, orden de campos, separadores, tratamiento de nulos y ejemplo literal?
6. **Manejo de errores**: ¿Se documenta qué pasa si falla cada operación? ¿Rollback? ¿MsgBox con código MSG-XX? ¿Log?
7. **Mensajes literales**: ¿Los textos de MsgBox están entre comillas en la Sección 3?
8. **Eventos de UI**: ¿Cada punto de entrada desde formulario indica el control y evento concreto?
9. **Diagramas**: ¿Hay al menos un diagrama de estados O secuencia con participantes reales (no "Sistema → BD")?
10. **Test cases**: ¿Hay al menos 5 escenarios Given-When-Then con valores concretos e IDs ficticios específicos?
11. **Cero ⚠️ VERIFICAR innecesarios**: ¿Se resolvió todo lo que el código permite resolver?
12. **Deuda técnica consolidada**: ¿La Sección 13 recoge todos los `⚠️` del PRD en una tabla?
13. **Numeración correcta**: ¿Las secciones mantienen el índice 0-13 sin renumerar?

### Paso 6 — Guardar en la ubicación correcta

- PRDs nuevos: `docs/PRD/{ID}_{Nombre_Modulo}.md` donde `{ID}` es el ID del DISCOVERY_MAP.
- PRDs existentes: actualizar in-place, preservando la información previa no afectada.

### Paso 7 — Actualizar consolidado de Deuda Técnica

Tras escribir o actualizar cualquier PRD:
1. Copiar las entradas nuevas de la Sección 13 del PRD a `docs/DEUDA_TECNICA.md`.
2. Actualizar métricas rápidas (contadores por severidad y estado).
3. Si la actualización resuelve algún hallazgo previo → cambiar estado a `Resuelto: Spec-XXX`.

---

## Convenciones de formato

### Nomenclatura del archivo PRD
`{ID}_{Nombre_Modulo}.md` — Ejemplo: `16_Workflow_Validacion_RAC.md`

Los patrones de nomenclatura concretos del proyecto (prefijos, separadores, casing)
están en `references/project_context.md`, Sección 3.

### Título del documento PRD
`# 📑 PR-{ID}: {Descripción} ({fecha YYYY-MM-DD})`

### Firmas de métodos
Siempre en este formato:
```
`NombreClase.NombreMetodo(ByVal param1 As Tipo, Optional ByRef param2 As Tipo = default) → TipoRetorno` (tipo `ruta/al/archivo.ext`)
```
Donde `tipo` es `clase`, `módulo` o `formulario`.

### Tablas de BD
Siempre con tabla Markdown:
```markdown
| Campo | Tipo Access | Nulos | Default | PK/Índice |
| :--- | :--- | :--- | :--- | :--- |
| `campo` | Long | No | — | PK |
| `idRelacion` | Long | No | — | FK → tbOtraTabla.Id |
```

### Diagramas Mermaid
Usar bloques ` ```mermaid ` con:
- `stateDiagram-v2` para ciclos de vida / estados.
- `sequenceDiagram` para flujos entre componentes (usar clases/métodos reales como participantes).
- `graph TD` para dependencias entre módulos.

### Notas de riesgo e inconsistencias
```
⚠️ RIESGO: {descripción breve}
- Impacto: {qué puede pasar}
- Decisión pendiente: {qué hay que decidir}
- Workaround actual: {qué se hace ahora}
- Ver: DT-{PRD}-{NNN} en Sección 13.
```

```
⚠️ INCONSISTENCIA: {descripción breve}. {recomendación}. Ver DT-{PRD}-{NNN}.
```

Solo usar `⚠️ VERIFICAR:` como **último recurso** cuando el código fuente no permite determinar un detalle.

---

## Integración con el protocolo SDD

### Durante cierre de Specs (Fase 3)
Cuando el protocolo SDD pide "Revisar PRDs" (paso de cierre), este skill define qué hacer:
1. Leer todos los PRDs en `docs/PRD/`.
2. Comparar con los cambios de la Spec recién implementada.
3. Si hay impacto: actualizar el PRD afectado con el mismo nivel de calidad.
4. Si no hay impacto: indicar en el checklist de cierre con justificación explícita.

### Relación con DISCOVERY_MAP
El DISCOVERY_MAP es el **índice** que conecta archivos físicos con módulos PRD.
Los PRDs son el **contenido detallado** de cada módulo.
Ambos deben contar la misma historia — si se actualiza un PRD, verificar que el DISCOVERY_MAP
refleja los mismos archivos y roles arquitectónicos.

---

## Referencias

| Archivo | Propósito | Cuándo leer |
| :--- | :--- | :--- |
| `references/prd_template.md` | Estructura universal de PRDs VBA/Access | Siempre, antes de escribir cualquier PRD |
| `references/project_context.md` | Vocabulario concreto del proyecto actual | Siempre, junto con la plantilla |
| `docs/DISCOVERY_MAP.md` | Índice físico→lógico del proyecto | Al localizar módulos y archivos fuente |
| `docs/DEUDA_TECNICA.md` | Consolidado global de hallazgos | Al escribir o actualizar la Sección 13 |

**Leer SIEMPRE `prd_template.md` y `project_context.md` antes de escribir un PRD.**