# 📝 Spec-015a: Operaciones Atómicas en Caché NC - Introducción

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Nueva Funcionalidad
**Módulos PRD afectados:** —
**Spec padre:** Spec-006 (GetNCProyectoVM)
**Specs relacionadas:** Spec-014 (ARs anidadas en ACs), Spec-015b, Spec-015c, Spec-015d
**RFC origen:** —
**Plan origen:** PLAN-002 (T-06)
**Fecha de creación:** 2026-03-17
**Fecha límite:** —
**Cierre:** Pendiente

---

> **Regla anti-placeholder (obligatoria):**
> No dejar este archivo con solo cabecera. Completar secciones 1 a 9 con contenido real
> antes de presentar la Spec. Si no hay cambios de UI, indicar explicitamente "Sin cambios de UI".

## 1. Resumen Técnico

- **Problema / Necesidad:** Actualmente, cualquier cambio mínimo en una AR o AC requiere regenerar toda la caché de la NC (NC + ACs + ARs). Esto es ineficiente cuando se modifica un solo campo de una AR.
- **Causa raíz:** La caché se regenera completa cada vez; no hay operaciones atómicas.
- **Solución propuesta:** 
  - Crear nuevos módulos para operaciones de caché (sin modificar código existente):
    - `CacheNCService.bas` - Lógica de negocio y transacciones
    - `CacheNCRepositorio.bas` - Acceso a datos (SQL)
  - Implementar función `RebuildCacheDetalle` en el nuevo service
  - No se toca ningún módulo existente (NCProyecto.cls, CacheNCProyecto.bas, etc.)
- **Restricciones:** No se recalculan estados de AC (eso se hace al persistir en BD)

---

## 2. Historia de Usuario

> Como **sistema de caché**, quiero realizar cambios quirúrgicos en los datos cacheados (agregar, modificar, eliminar ARs y ACs) sin tener que regenerar toda la caché, para mejorar el rendimiento en operaciones frecuentes.

**Contexto adicional:**
- Alta de nueva AR: se añade al diccionario AC.ARs
- Modificación de AR: se actualiza el campo específico
- Baja de AR: se elimina del diccionario
- Baja de AC: se elimina AC y todas sus ARs anidadas

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| — | NCProyecto.cls | Nueva funcionalidad | Métodos de operaciones atómicas |
| — | CacheNCProyecto.bas | Modificación | Integración con los nuevos métodos |

### 3.2 Archivos a modificar

**Solo archivos nuevos (NINGÚN archivo existente se modifica):**

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/modules/CacheNCService.bas` | **Nuevo archivo** | Lógica de negocio, transacciones, RebuildCacheDetalle |
| `src/modules/CacheNCRepositorio.bas` | **Nuevo archivo** | Acceso SQL a tablas de caché |

### 3.3 Tablas / Entidades de datos afectadas

**Ninguna.** Las operaciones son en memoria, no en la base de datos.

### 3.4 Formularios / UI afectados

**Ninguno.**

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
| :--- | :--- | :--- |
| DT-014-001 | ARs anidadas en ACs | Prerrequisito |

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| Inconsistencia entre caché y BD | Baja | Alto | Los métodos solo modifican la caché; la BD se actualiza por separado |

---

## 4. Plan de Intervención

### Intervención 1: Crear CacheNCRepositorio.bas

**Archivo:** `src/modules/CacheNCRepositorio.bas`
**Tipo:** Nuevo archivo
**Precondición:** —

**Descripción:**
Crear módulo de acceso a datos con funciones SQL para:
- Leer registros de caché de detalle y listado
- Insertar/actualizar/eliminar en tablas de caché
- Abstraer el SQL del service

**Postcondición:** Repository existe con funciones de acceso a datos.

---

### Intervención 2: Crear CacheNCService.bas

**Archivo:** `src/modules/CacheNCService.bas`
**Tipo:** Nuevo archivo
**Precondición:** Intervención 1 completada

**Descripción:**
Crear módulo de lógica de negocio con:
- Transacciones (BeginTrans/CommitTrans/Rollback)
- Función `RebuildCacheDetalle`
- Integración con funciones existentes de generación de JSON (CacheNCProyecto)

**Postcondición:** Service existe con lógica de transacciones y rebuild.

---

### Intervención 3: Integrar RebuildCacheDetalle con generación de JSON

**Archivo:** `src/modules/CacheNCService.bas`
**Tipo:** Nueva función
**Precondición:** Intervención 2 completada

**Descripción:**
Implementar función `RebuildCacheDetalle` que:
- Itera NCs (todas o una específica)
- Llama a funciones de generación JSON de CacheNCProyecto
- Usa transacciones para consistencia
- Registra operaciones en log

**Firma propuesta:**
```vba
Public Function RebuildCacheDetalle( _
    Optional ByVal p_IDNC As String = "", _
    Optional ByVal p_BorrarCerradas As Boolean = False, _
    Optional ByRef p_Error As String _
) As Boolean
```

**Parámetros:**
- `p_IDNC`: Si se especifica, rebuild solo esa NC. Si está vacío, rebuild de todas las NCs.
- `p_BorrarCerradas`: Si True, elimina el registro de caché de las NCs cerradas antes de rebuild (útil para limpieza). Si False, mantiene las NCs cerradas existentes.

**Comportamiento:**
1. Si `p_IDNC` es vacío: itera todas las NCs y regenera su DatosACs
2. Si `p_IDNC` tiene valor: solo regenera esa NC
3. Si `p_BorrarCerradas` es True: elimina primero los registros de caché de NCs cerradas
4. Usa transacciones para consistencia
5. Registra la operación en LogCacheOperacion

**Postcondición:** La caché de detalle (DatosACs) está regenerada para las NCs especificadas.

---

## 5. Criterios de Verificación

> Completar tras implementar las intervenciones.

- [ ] Intervención 1: Los métodos de operaciones atómicas existen en NCProyecto.cls
- [ ] Intervención 2: CacheNCProyecto integra las operaciones atómicas
- [ ] Intervención 3: RebuildCacheDetalle funciona correctamente

---

## 6. Informe de Cambios UI

**Ninguno.** Esta spec no introduce cambios en la interfaz de usuario.

---

## 7. Gaps y Decisiones

**Ninguno documentado de momento.**

---

## 8. Notas de Implementación

> Completar con notas técnicas relevantes durante la implementación.

### 8.1 Salvaguardas de Negocio (REGLAS OBLIGATORIAS)

Las siguientes validaciones deben implementarse **en el Service** (NO en el Repository). Estas reglas se replican de las operaciones existentes:

#### 8.1.1 Alta de NC (NCProyectoOperaciones)

| Campo | Validación | Mensaje si error |
| :--- | :--- | :--- |
| Expediente | Obligatorio | "No se conoce el expediente" |
| Descripción | Obligatorio | "No se conoce la descripción" |
| DetectadoPor | Obligatorio | "No se conoce DetectadoPor" |
| FechaApertura | Obligatoria y fecha válida | "No se conoce la fecha de apertura" |
| Vinculada a NC | Fecha >= NC vinculada | "La fecha de apertura es anterior a la de la que está vinculada" |
| CausaYAnalisRaiz | Obligatorio | "No se conoce la CausaYAnalisRaiz" |
| Tipología (IDTipo) | Obligatorio | "No se conoce la tipología" |
| EntidadResponsable | Obligatorio | "No se conoce la Entidad Responsable" |
| RequiereControlEficacia | "Sí" o "No" | "Se ha de indicar si requiere control de eficacia" |
| FechaPrevistaControlEficacia | Obligatorio si RequiereControlEficacia="Sí" | "Si requiere el control de eficacia se ha de indicar la fecha prevista del mismo" |

#### 8.1.2 Alta de AC (ACProyectoOperaciones)

| Campo | Validación | Mensaje si error |
| :--- | :--- | :--- |
| IDNoConformidad | Obligatorio | "No se conoce la NC/Obs" |
| AccionCorrectiva | Obligatoria | "No se conoce la Acción Correctiva" |
| Responsable | Si se indica, debe existir en lista de usuarios | "Se ha introducido un responsable que no aparece en la lista de usuarios" |

#### 8.1.3 Alta de AR (ARProyectoOperaciones)

| Campo | Validación | Mensaje si error |
| :--- | :--- | :--- |
| IdAccionCorrectiva | Obligatorio | "No se conoce la Acción Correctiva" |
| AccionRealizada | Obligatoria | "No se conoce la Acción Realizada" |
| FechaFinReal con FechaFinPrevista | Si hay fecha fin real, debe haber fecha fin prevista | "Tiene fecha de fin real y no fecha fin prevista" |
| FechaFinPrevista con FechaInicio | Si hay fecha fin prevista, debe haber fecha inicio | "Tiene fecha de fin prevista y no fecha de inicio" |
| FechaInicio con FechaFinPrevista | Si hay fecha inicio, debe haber fecha fin prevista | "Tiene fecha de fin de inicio y no fecha de fin prevista" |
| Fechas | Validación de coherencia (BuenaFecha) | Mensaje de error de validación de fechas |
| Cerrar AR | Debe tener al menos un documentoadjunto | "Para cerrar una acción hay que adjuntar una evidencia" |
| Acción Repetida | No puede existir otra AR con el mismo nombre para la misma AC | "Existe otra acción realizada con el mismo nombre para la misma Acción Correctiva" |

#### 8.1.4 Alta de Documento (DocumentoProyectoOperaciones)

| Campo | Validación | Mensaje si error |
| :--- | :--- | :--- |
| IDNoConformidad o IDAccionRealizada | Uno de los dos obligatorio | "Ha de ser un anexo de NC o de AR de proyecto" |
| Documento | Obligatorio | "No se conoce el documento" |

#### 8.1.5 Alta de Replanificación (ReplanificacionesProyectoOperaciones)

| Campo | Validación | Mensaje si error |
| :--- | :--- | :--- |
| AR | Obligatoria | "No se conoce la AR" |
| AC | Obligatoria | "No se conoce la AC" |
| NC | Obligatoria | "No se conoce la No Conformidad de Proyecto" |

#### 8.1.6 Riesgos

| Campo | Validación | Mensaje si error |
| :--- | :--- | :--- |
| IDRiesgo | Debe existir en catálogo de riesgos | Error al cargar riesgo |
| IDNC | Obligatorio | "No se conoce la NC" |

### 8.2 Patrón de Implementación

```
Formulario → Service (validaciones + transacciones) → Repository (SQL)
```

- **Service**: Contiene todas las validaciones (MotivoNoOK), llama al Repository
- **Repository**: Solo acceso a datos (INSERT/UPDATE/DELETE/SELECT)
- **Transacciones**: Se gestionan en el Service

### 8.3 Objetivo Final

> Los nuevos módulos (`CacheNCService.bas` + `CacheNCRepositorio.bas`) sustituirán a los módulos de operaciones existentes para operaciones de caché.

Una vez validados y en producción:
1. Los formularios llamarán a los nuevos servicios de caché
2. Los antiguos módulos de operaciones se podrán depreciar/eliminar
3. Se reduce duplicación: una sola lógica de negocio para NCs

---

## 9. Registro de Cambios de la Spec

| Fecha | Cambio | Autor |
| :--- | :--- | :--- |
| 2026-03-17 | Creación de Spec-015a (secciones 1-4 de Spec-015) | IA |
