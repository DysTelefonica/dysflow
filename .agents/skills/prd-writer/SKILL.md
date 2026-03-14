---
name: prd-writer
description: >
  Genera y actualiza PRDs (Product Requirement Documents) de calidad industrial para proyectos VBA/Access.
  Usa este skill siempre que el usuario pida crear, escribir, actualizar, revisar o mejorar un PRD, PR,
  documento de arquitectura o documento de funcionalidad. También cuando el usuario diga "documenta esta
  funcionalidad", "haz un PR de...", "actualiza el PRD de...", "crea el PRD para el módulo X", o cualquier
  variación que implique documentar una funcionalidad del sistema. Este skill se integra con el protocolo
  SDD — los PRDs se revisan y actualizan durante el cierre de Specs.
---

# PRD Writer — Skill para documentar funcionalidades VBA/Access

## Propósito

Este skill enseña a la IA a producir PRDs con el nivel de detalle necesario para que **otra IA pueda
generar o modificar código en una sola pasada**, sin acceso interactivo al repositorio.
La audiencia de un PRD no es solo humana — es principalmente una IA implementadora.

## Cuándo se activa

- El usuario pide crear, escribir o actualizar un PRD.
- El usuario dice "documenta esta funcionalidad" o "haz un PR de...".
- Durante el cierre del protocolo SDD, cuando hay que revisar o actualizar PRDs afectados.
- Cuando el usuario referencia un módulo del DISCOVERY_MAP y pide documentarlo.

---

## Rutas del proyecto (leer de project_context.md)

Este skill NO tiene rutas hardcodeadas. Antes de ejecutar cualquier paso, leer
`references/project_context.md` del proyecto activo para obtener:

- Ruta de PRDs: habitualmente `docs/PRD/`
- Ruta de código fuente: habitualmente `src/`
- Ruta de DISCOVERY_MAP: habitualmente `docs/DISCOVERY_MAP.md`
- Ruta de DEUDA_TECNICA: habitualmente `docs/DEUDA_TECNICA.md`
- Ruta de plantilla PRD: habitualmente `references/prd_template.md`
- Ruta de modelo de datos: habitualmente `references/Estructura_Datos.md`

Si `project_context.md` no existe → solicitarlo al usuario antes de continuar.

---

## Flujo de trabajo

### Paso 0 — Buscar contexto en Engram

Antes de leer ningún fichero, buscar en Engram:
```
mem_search "[nombre del módulo]"
mem_search "[tablas o clases implicadas]"
```

Si Engram devuelve contexto suficiente (arquitectura, decisiones previas, specs relacionadas),
usarlo directamente y saltar al Paso 3. Si no, continuar desde el Paso 1.

Tras escribir o actualizar un PRD, guardar en Engram aplicando
`.trae/rules/engram-memory-quality.md` antes de ejecutar `mem_save`.

---

### Paso 1 — Leer la plantilla y el contexto del proyecto

**Antes de escribir nada**, leer siempre en este orden:

1. `references/prd_template.md` — estructura universal, instrucciones y antipatrones.
2. `references/project_context.md` — vocabulario del proyecto: nombres de módulos, tablas,
   formularios, patrones de error, convenciones de nomenclatura, tabla de tipos de BD.

**La plantilla dice *cómo* estructurarlo. El contexto dice *con qué* hacerlo.**

---

### Paso 2 — Localizar el módulo en DISCOVERY_MAP

Leer `docs/DISCOVERY_MAP.md` para:
1. Identificar el ID del módulo.
2. Localizar todos los archivos físicos asociados (clases, módulos, formularios).
3. Entender las dependencias con otros módulos.

El DISCOVERY_MAP tiene 3 secciones clave:
- **Sección 2 — Inventario de Módulos**: ID, nombre y tipo de cada módulo.
- **Sección 3 — Physical to Logical Map**: mapea cada archivo físico a su módulo PRD y rol
  arquitectónico (DTO, Service, Repository, Helper, ViewModel, UI).

---

### Paso 3 — Inspeccionar el código fuente

Para cada archivo identificado en el Paso 2:
1. Leer el archivo completo en las rutas definidas en `project_context.md`.
2. Extraer: firmas de métodos públicos **y privados**, tipos de parámetros, valores de retorno.
3. Identificar: tablas de BD usadas, transacciones, manejo de errores, eventos de UI.
4. Documentar: algoritmos no triviales, flujos de datos entre capas.
5. Aplicar la tabla de tipos de la BD desde `project_context.md` para traducir códigos numéricos
   a tipos legibles. **Nunca documentar tipos numéricos crudos en los PRDs.**

**REGLA CRÍTICA**: No inventar datos. Si no puedes determinar algo leyendo el código, márcalo
con `⚠️ VERIFICAR:` seguido de lo que hay que confirmar. Minimizar estos marcadores.

---

### Paso 4 — Escribir el PRD

Seguir la estructura de `references/prd_template.md` usando el vocabulario de
`references/project_context.md`.

- Secciones **siempre obligatorias**: 0, 1, 2, 6, 10, 11, 12, 13.
- Secciones **opcionales** (omitir si no aplican, nunca dejar vacías): 3, 4, 5, 7, 8, 9.
- **No renumerar** las secciones aunque se omitan opcionales.

---

### Paso 5 — Autoevaluación antes de entregar

Verificar internamente. **No imprimir este checklist al usuario.**

1. **Firmas completas**: ¿Cada método — público Y privado — tiene firma con `ByVal`/`ByRef`,
   tipos, opcionales, retorno y ruta del archivo?
2. **Tipos legibles**: ¿Se aplicó la tabla de conversión de `project_context.md`?
   ¿Cero tipos numéricos crudos en la tabla de campos?
3. **Tablas completas**: ¿Cada tabla tiene TODOS sus campos con tipo, nulabilidad, default y PK?
   ¿No se cortó la tabla a mitad?
4. **FKs explícitas**: ¿Las foreign keys están como `FK → TbTabla.Campo`?
5. **Valores enumerados**: ¿Los campos con valores fijos tienen todos los valores documentados?
6. **Algoritmos**: ¿Hay hash, serialización, SQL dinámico u otra lógica no trivial?
   ¿Está descrita con función, orden de campos, separadores, tratamiento de nulos y ejemplo?
7. **Manejo de errores**: ¿Se documenta qué pasa si falla cada operación?
   ¿Rollback? ¿MsgBox con código MSG-XX? ¿Log?
8. **Mensajes literales**: ¿Los textos de MsgBox están entre comillas en la Sección 3?
9. **Eventos de UI**: ¿Cada punto de entrada indica el control, formulario y evento concreto?
10. **Diagramas**: ¿Hay al menos un diagrama Mermaid con participantes reales
    (clases/métodos del proyecto, no "Sistema → BD")?
11. **Fases alternativas al mismo nivel**: ¿Cada fase alternativa en Sección 9 tiene
    su propio diagrama de secuencia, firma del método responsable y diferencias documentadas?
12. **Test cases**: ¿Hay mínimo 5 escenarios Given-When-Then con IDs ficticios concretos
    (no "N", "X" ni "el equipo seleccionado")?
13. **Integración completa**: ¿Están documentadas TODAS las tablas y formularios que
    el código toca, incluyendo los que se usan en flujos alternativos?
14. **Cero ⚠️ VERIFICAR innecesarios**: ¿Se resolvió todo lo que el código permite resolver?
15. **Deuda técnica consolidada**: ¿La Sección 13 recoge todos los ⚠️ del PRD en una tabla?
16. **Numeración correcta**: ¿Las secciones mantienen el índice 0-13 sin renumerar?

---

### Paso 6 — Guardar en la ubicación correcta

- PRDs nuevos: `docs/PRD/{ID}_{Nombre_Modulo}.md` donde `{ID}` viene del DISCOVERY_MAP.
- PRDs existentes: actualizar in-place, preservando la información no afectada.

### Paso 7 — Actualizar DEUDA_TECNICA y Engram

1. Copiar entradas nuevas de la Sección 13 a `docs/DEUDA_TECNICA.md`.
2. Actualizar métricas rápidas del consolidado.
3. Ejecutar `mem_save` aplicando `.trae/rules/engram-memory-quality.md`.

---

## Convenciones de formato

### Título del documento PRD
`# 📑 PR-{ID}: {Descripción} ({fecha YYYY-MM-DD})`

### Formato de tabla de campos (5 columnas — obligatorio)
```markdown
| Campo | Tipo Access | Nulos | Default | PK/Índice |
| :--- | :--- | :--- | :--- | :--- |
| `Id` | Long Integer | No | — | PK |
| `idRelacion` | Long Integer | No | — | FK → TbOtraTabla.Id |
| `Estado` | Text(50) | No | `"PENDIENTE"` | — |
```

### Formato de firmas de métodos
```
`NombreClase.NombreMetodo(ByVal param1 As Tipo, Optional ByRef param2 As Tipo = default) → TipoRetorno`
(tipo `ruta/relativa/al/archivo.ext`, línea ~NNN)
```
Donde `tipo` es `clase`, `módulo` o `formulario`.

### Diagramas Mermaid
- `stateDiagram-v2` — ciclos de vida y estados.
- `sequenceDiagram` — flujos entre componentes. **Usar clases y métodos reales como participantes.**
- `graph TD` — dependencias entre módulos.

### Notas de riesgo
```
⚠️ RIESGO: {descripción breve}
- Impacto: {qué puede pasar}
- Workaround actual: {qué se hace ahora}
- Ver: DT-{PRD}-{NNN} en Sección 13.
```

Solo usar `⚠️ VERIFICAR:` como **último recurso** cuando el código fuente no permite
determinar un detalle.

---

## Integración con el protocolo SDD

### Durante cierre de Specs
Cuando el protocolo SDD pide revisar PRDs (Fase 4):
1. Leer los PRDs afectados por la Spec recién implementada.
2. Si hay impacto → actualizar con el mismo nivel de calidad.
3. Si no hay impacto → indicarlo en el checklist de cierre con justificación explícita.

### Relación con DISCOVERY_MAP
El DISCOVERY_MAP es el **índice** que conecta archivos físicos con módulos PRD.
Los PRDs son el **contenido detallado** de cada módulo.
Si se actualiza un PRD, verificar que el DISCOVERY_MAP refleja los mismos archivos y roles.

---

## Antipatrones a evitar

| Antipatrón | Por qué es malo | Qué hacer |
| :--- | :--- | :--- |
| Tipos numéricos crudos en tabla de campos | La IA escribe SQL con tipos incorrectos | Aplicar tabla de conversión de `project_context.md` |
| Tabla de campos incompleta | La IA no sabe qué campos existen | Incluir TODOS los campos, no cortar a mitad |
| Firmas solo de métodos públicos | Los eventos privados son puntos de entrada reales | Firmas completas de todos los métodos |
| Fases alternativas sin diagrama | Es donde más bugs aparecen | Mismo nivel de detalle que Sección 6 |
| Integración con asterisco o vaga | La IA no sabe qué formulario o tabla exacta | Nombre exacto + descripción concreta |
| IDs genéricos en test cases | No es verificable | Valores ficticios concretos: `IDEquipo=17` |
| FK documentada solo como tipo | La IA no sabe a qué tabla apunta | `FK → TbTabla.Campo` siempre |
| Mensajes sin texto literal | La IA inventa textos | Texto literal entre comillas en Sección 3 |
| Secciones opcionales vacías | Confunde a la IA | Omitir la sección completamente |
| Renumerar secciones al omitir | La IA pierde referencias cruzadas | Mantener numeración 0-13 siempre |