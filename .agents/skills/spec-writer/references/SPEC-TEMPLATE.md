# 📝 Spec-[NNN]: [Título corto y descriptivo]

**Estado:** 🔵 ABIERTA | 🟡 EN PROGRESO | ✅ CERRADA | ⛔ CANCELADA | 🔴 BLOQUEADA
**Prioridad:** Crítica | Alta | Media | Baja
**Tipo:** Nueva Funcionalidad | Corrección | Refactoring | Deuda Técnica | Mejora UX
**Módulos PRD afectados:** [IDs o nombres separados por coma, ej: PRD-03, PRD-07]
**Spec padre:** [Spec-NNN si es sub-tarea, o "—"]
**Specs relacionadas:** [Spec-NNN, Spec-NNN o "—"]
**Fecha de creación:** AAAA-MM-DD
**Fecha límite:** AAAA-MM-DD | Sin límite
**Cierre:** [AAAA-MM-DD — Motivo] | Pendiente

---

## 1. Resumen Técnico

- **Problema / Necesidad:** [Qué falla, qué falta o qué se quiere mejorar. Una o dos frases precisas.]
- **Causa raíz:** [Por qué ocurre. Si no se sabe, indicar "Por determinar".]
- **Solución propuesta:** [Qué se va a hacer. Nivel de detalle suficiente para entender el alcance sin entrar en implementación.]
- **Solución descartada:** [Si se evaluó otra opción y se rechazó, explicar por qué. Si no aplica, omitir esta línea.]
- **Restricciones conocidas:** [Limitaciones técnicas, de negocio o de entorno que condicionan la solución.]

---

## 2. Historia de Usuario

> Como **[rol]**, quiero **[acción o capacidad]**, para **[beneficio o resultado esperado]**.

**Contexto adicional:**
[Cualquier detalle del contexto de negocio que ayude a entender la necesidad real.
Puede incluir capturas, fragmentos de conversación con el usuario, o ejemplos concretos
de la situación problemática.]

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| PRD-NN | [NombreModulo] | Nueva func. / Modificación / Solo lectura | [Aclaración si procede] |

### 3.2 Archivos a modificar

Usar las rutas relativas definidas en `references/project_context.md`.

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `[ruta/NombreClase]` | Nuevo método | `NombreMetodo()` |
| `[ruta/NombreFormulario]` | Modificación | Añadir control X |
| `[ruta/NombreModulo]` | Refactoring | Extraer lógica Y |

### 3.3 Tablas / Entidades de datos afectadas

Usar los nombres exactos de tabla según el PRD del módulo afectado.

| Tabla | Cambio | Detalle |
| :--- | :--- | :--- |
| `[NombreTabla]` | Nuevo campo / Modificación / Solo lectura | [Tipo, restricciones] |

> Si no hay cambios en base de datos → **Ninguna.**

### 3.4 Formularios / UI afectados

| Formulario | Cambio | Detalle |
| :--- | :--- | :--- |
| `[NombreFormulario]` | Nuevo control / Modificación visual / Nuevo comportamiento | [Descripción] |

> Si no hay cambios de UI → **Ninguno.**

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
| :--- | :--- | :--- |
| DT-NN-NNN | [Descripción breve] | Genera / Resuelve / Relacionada |

> Si no hay deuda técnica relacionada → **Ninguna.**

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| [Descripción del riesgo] | Alta / Media / Baja | Alto / Medio / Bajo | [Acción preventiva o plan B] |

---

## 4. Plan de Intervención

> Las intervenciones deben ser atómicas, ordenadas y referenciables.
> Cada una debe poder implementarse y verificarse de forma independiente.

### Intervención 1: [Título descriptivo]

**Archivo:** `[ruta/relativa/al/archivo]`
**Tipo:** Nuevo método | Modificación | Nuevo módulo | Cambio de esquema
**Precondición:** [Qué debe existir o estar hecho antes. Si ninguna → "—".]

**Descripción:**
[Explicar qué se hace y por qué. Sin entrar en detalle de código si no es necesario.
Indicar qué método/función/evento se toca y cómo cambia su comportamiento.]

```vba
' Pseudocódigo o código de referencia.
' Marcar claramente qué es nuevo y qué es contexto existente.
' Usar ' [NUEVO] y ' [EXISTENTE] como prefijos de línea si ayuda.
```

**Postcondición:** [Qué debe ser cierto después de aplicar esta intervención.]

---

### Intervención 2: [Título descriptivo]

**Archivo:** `[ruta/relativa/al/archivo]`
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

### 5.1 Auto-verificación (IA — revisión estática de código)

> Checks que la IA puede realizar inspeccionando el código fuente sin ejecutar la aplicación.
> Verificar tras cada intervención, no solo al final.

- [ ] [Verificación estructural, ej: "Existe método `X` en clase `Y`"]
- [ ] [Verificación de contrato, ej: "La función devuelve el tipo correcto y gestiona el error esperado"]
- [ ] [Verificación de orden, ej: "El método `X` llama a `Y` antes de `Z`"]
- [ ] [Verificación de convenciones, ej: "Nombres de variables siguen el prefijo del proyecto"]
- [ ] No se han modificado archivos fuera del alcance declarado en la Sección 3.2

### 5.2 Validación en Access (usuario)

> Pasos que el usuario debe ejecutar manualmente en el entorno real.
> Incluir valores concretos: IDs reales, nombres de registros de prueba, resultados numéricos esperados.

**Escenario 1: [Nombre — caso normal]**
- [ ] [Acción concreta → resultado esperado con valores reales]
- [ ] [Acción concreta → resultado esperado con valores reales]

**Escenario 2: [Nombre — caso de error o borde]**
- [ ] [Acción concreta → resultado esperado con valores reales]
- [ ] [Acción concreta → resultado esperado con valores reales]

### 5.3 Criterios de aceptación (no negociables)

> Condiciones mínimas que deben cumplirse para considerar la Spec CERRADA.

- [ ] [Criterio 1 — observable y verificable por el usuario]
- [ ] [Criterio 2 — observable y verificable por el usuario]
- [ ] No se introducen regresiones en módulos adyacentes declarados en Sección 3.1

---

## 6. Informe de Cambios UI

> Completar SOLO si hay cambios en formularios o mensajes visibles para el usuario.
> Si no hay cambios de UI → indicar **"Sin cambios de UI"** y omitir las subsecciones.

### 6.1 Cambios en controles de formulario

**Formulario: `[NombreFormulario]`**

**Controles añadidos:**
| Control | Tipo | Propiedades clave |
| :--- | :--- | :--- |
| `[NombreControl]` | [Tipo] | [Caption, dimensiones, posición u otras propiedades relevantes] |

**Controles modificados:**
| Control | Propiedad | Antes | Después |
| :--- | :--- | :--- | :--- |
| `[NombreControl]` | [Propiedad] | [Valor anterior] | [Valor nuevo] |

**Controles eliminados:**
| Control | Tipo | Motivo |
| :--- | :--- | :--- |
| `[NombreControl]` | [Tipo] | [Por qué se elimina] |

### 6.2 Nuevos mensajes / diálogos

| Trigger | Tipo | Texto del mensaje |
| :--- | :--- | :--- |
| [Condición que lo dispara] | [vbInformation / vbCritical / vbYesNo / etc.] | "[Texto literal del mensaje]" |

### 6.3 Instrucciones manuales para el usuario

> Pasos que el usuario debe ejecutar en el editor de formularios de Access para aplicar los cambios de UI.

1. Abrir `[NombreFormulario]` en vista Diseño.
2. [Instrucción concreta — qué añadir, mover, redimensionar o eliminar.]
3. [...]

---

## 7. Gaps y Decisiones

> Preguntas abiertas, ambigüedades o decisiones que deben resolverse antes o durante la implementación.

### 7.1 Gaps pre-implementación

| # | Pregunta / Gap | Responsable | Estado | Resolución |
| :--- | :--- | :--- | :--- | :--- |
| 1 | [¿Qué pasa si X condición no se cumple?] | Dev / Usuario | Abierto / Resuelto | [Respuesta o "Pendiente"] |

> Si no hay gaps → **"Ninguno identificado."**

### 7.2 Gaps post-implementación (iteraciones)

> Completar durante la Fase 3 del sdd-protocol. Un gap por bloque.

---

#### Gap 1 — [Descripción breve del problema observado en Access]

**Fecha:** AAAA-MM-DD
**Causa raíz:** [Por qué falló]
**Corrección aplicada:** [Qué se cambió]
**Archivos adicionales modificados:**
- `[ruta/archivo]` → `[método o función]`

---

> *(Añadir tantos bloques de gap como iteraciones ocurran.)*

---

## 8. Notas de Implementación

> Sección libre para apuntes técnicos durante la implementación:
> decisiones tomadas sobre la marcha, alternativas descartadas,
> advertencias para futuras modificaciones del mismo módulo.

*(Rellenar durante la implementación)*

---

## 9. Registro de Cambios de la Spec

| Versión | Fecha | Cambio |
| :--- | :--- | :--- |
| 1.0 | AAAA-MM-DD | Creación inicial |
| 1.1 | AAAA-MM-DD | [Descripción del cambio] |