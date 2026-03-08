# 📝 Spec-[NNN]: [Título corto y descriptivo]

**Estado:** 🔵 ABIERTA | 🟡 EN PROGRESO | ✅ CERRADA | ⛔ CANCELADA | 🔴 BLOQUEADA
**Prioridad:** Crítica | Alta | Media | Baja
**Tipo:** Nueva Funcionalidad | Corrección | Refactoring | Deuda Técnica | Mejora UX
**Módulos PRD afectados:** [IDs separados por coma, ej: 3, 7, 11]
**Spec padre:** [Spec-NNN si es sub-tarea, o "—"]
**Specs relacionadas:** [Spec-NNN, Spec-NNN o "—"]
**Fecha de creación:** AAAA-MM-DD
**Fecha límite:** AAAA-MM-DD | Sin límite
**Autor:** [Nombre]
**Revisado por:** [Nombre o "Pendiente"]
**Cierre:** [AAAA-MM-DD - Motivo] | Pendiente

---

## 1. Resumen Técnico

- **Problema / Necesidad:** [Qué falla, qué falta o qué se quiere mejorar. Una o dos frases precisas.]
- **Causa raíz:** [Por qué ocurre. Si no se sabe, indicar "Por determinar".]
- **Solución propuesta:** [Qué se va a hacer. Nivel de detalle suficiente para entender el alcance sin entrar en implementación.]
- **Solución descartada:** [Si se evaluó otra opción y se rechazó, explicar por qué. Si no aplica, omitir.]
- **Restricciones conocidas:** [Limitaciones técnicas, de negocio o de entorno que condicionan la solución.]

---

## 2. Historia de Usuario

> Como **[rol]**, quiero **[acción o capacidad]**, para **[beneficio o resultado esperado]**.

**Contexto adicional:**
[Cualquier detalle del contexto de negocio que ayude a entender la necesidad real. Puede incluir capturas, fragmentos de conversación con el usuario, o ejemplos concretos de la situación problemática.]

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| ID | Módulo | Tipo de impacto | Notas |
|---|---|---|---|
| [N] | [NombreModulo] | Nueva func. / Modificación / Solo lectura | [Aclaración si procede] |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
|---|---|---|
| `src/classes/[Clase].cls` | Nuevo método | `NombreMetodo()` |
| `src/forms/[Formulario].frm` | Modificación | Añadir control X |
| `src/modules/[Modulo].bas` | Refactoring | Extraer lógica Y |

### 3.3 Tablas / Entidades de datos afectadas

| Tabla | Cambio | Detalle |
|---|---|---|
| `tbl_[Nombre]` | Nuevo campo / Modificación / Solo lectura | [Tipo, restricciones] |

> Si no hay cambios en base de datos, indicar: **Ninguna.**

### 3.4 Interfaces / Formularios afectados

| Formulario / Informe | Cambio | Detalle |
|---|---|---|
| `frm_[Nombre]` | Nuevo control / Modificación visual / Nuevo comportamiento | [Descripción] |

> Si no hay cambios de UI, indicar: **Ninguno.**

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
|---|---|---|
| DT-[MM]-[NNN] | [Descripción breve] | Genera / Resuelve / Relacionada |

> Si no hay deuda técnica relacionada, indicar: **Ninguna.**

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| [Descripción del riesgo] | Alta / Media / Baja | Alto / Medio / Bajo | [Acción preventiva o plan B] |

---

## 4. Plan de Intervención

> Las intervenciones deben ser atómicas, ordenadas y referenciables. Cada una debe poder implementarse y verificarse de forma independiente.

### Intervención 1: [Título descriptivo]

**Archivo:** `src/[ruta/archivo]`
**Tipo:** Nuevo método | Modificación | Nuevo módulo | Cambio de esquema
**Precondición:** [Qué debe existir o estar hecho antes. Si ninguna, indicar "—".]
**Descripción:**
[Explicar qué se hace y por qué, sin entrar en detalle de código si no es necesario.]

```vba
' Pseudocódigo o código real de referencia
' Indicar claramente qué es nuevo y qué es contexto existente
```

**Postcondición:** [Qué debe ser cierto después de aplicar esta intervención.]

---

### Intervención 2: [Título descriptivo]

**Archivo:** `src/[ruta/archivo]`
**Tipo:** Nuevo método | Modificación | Nuevo módulo | Cambio de esquema
**Precondición:** Intervención 1 completada.
**Descripción:**
[...]

```vba
' Código de referencia
```

**Postcondición:** [...]

---

> *(Añadir tantas intervenciones como sea necesario. Numerarlas secuencialmente.)*

---

## 5. Criterios de Verificación

### 5.1 Auto-verificación (IA, sobre código)

> Checks que puede realizar la IA inspeccionando el código fuente, sin ejecutar la aplicación.

- [ ] [Verificación estructural 1, ej: "Existe método `X` en clase `Y`"]
- [ ] [Verificación estructural 2, ej: "El método `X` llama a `Y` antes de `Z`"]
- [ ] [Verificación de sintaxis, ej: "El código compila sin errores de sintaxis VBA"]
- [ ] [Verificación de contrato, ej: "La función devuelve `Boolean` y maneja el error `429`"]

### 5.2 Validación en Access (usuario)

> Pasos que el usuario debe ejecutar manualmente en el entorno real.

**Escenario 1: [Nombre del escenario, ej: "Caso normal"]**
- [ ] [Paso 1 — acción concreta y resultado esperado]
- [ ] [Paso 2 — acción concreta y resultado esperado]
- [ ] [Paso 3 — acción concreta y resultado esperado]

**Escenario 2: [Nombre del escenario, ej: "Caso de error / borde"]**
- [ ] [Paso 1]
- [ ] [Paso 2]

### 5.3 Criterios de aceptación (no negociables)

> Condiciones mínimas que deben cumplirse para considerar la spec CERRADA.

- [ ] [Criterio 1 — observable y verificable]
- [ ] [Criterio 2 — observable y verificable]
- [ ] No se introducen regresiones en módulos adyacentes

---

## 6. Gaps y Decisiones Pendientes

> Preguntas abiertas, ambigüedades o decisiones que deben resolverse antes o durante la implementación.

| # | Pregunta / Gap | Responsable | Estado | Resolución |
|---|---|---|---|---|
| 1 | [¿Qué pasa si X condición no se cumple?] | [Dev / Usuario / Negocio] | Abierto / Resuelto | [Respuesta o "Pendiente"] |
| 2 | [¿Se debe registrar auditoría de este evento?] | | Abierto | |

> Si no hay gaps, indicar: **Ninguno identificado.**

---

## 7. Informe de Cambios UI

> Documentar cualquier cambio visible para el usuario final. Si no hay cambios de UI, indicar explícitamente.

### Cambios en formularios

| Formulario | Elemento | Antes | Después |
|---|---|---|---|
| `frm_[Nombre]` | Botón "Generar" | Genera directamente | Muestra diálogo de confirmación primero |

### Nuevos mensajes / diálogos

| Trigger | Tipo | Texto del mensaje |
|---|---|---|
| Word no disponible | `vbInformation` | "Word no está disponible. Se generará un documento HTML..." |

### Cambios de flujo de navegación

[Describir si algún flujo de pantallas cambia. Si no aplica, indicar "Ninguno".]

---

## 8. Notas de Implementación

> Sección libre para apuntes técnicos durante la implementación: decisiones tomadas sobre la marcha, alternativas descartadas, advertencias para futuras modificaciones.

*(Rellenar durante la implementación)*

---

## 9. Registro de Cambios de la Spec

| Versión | Fecha | Autor | Cambio |
|---|---|---|---|
| 1.0 | AAAA-MM-DD | [Autor] | Creación inicial |
| 1.1 | AAAA-MM-DD | [Autor] | [Descripción del cambio] |
