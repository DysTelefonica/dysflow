# Spec-013: Gap - Eliminar campo DatosARs de la Caché

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Corrección
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** Spec-006, Spec-007
**Specs relacionadas:** —
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-06)
**Fecha de creación:** 2026-03-16
**Fecha límite:** Sin límite
**Cierre:** Pendiente

---

> **Regla anti-placeholder (obligatoria):**
> Este archivo contiene contenido completo en secciones 1 a 9.

## 1. Resumen Técnico

- **Problema / Necesidad:** El campo `DatosARs` (Acciones Realizadas/Tareas) fue eliminado de la tabla `TbCacheNCProyecto` y del ERD. Sin embargo, el código fuente todavía hace referencia a este campo, causando errores runtime.
- **Causa raíz:** 
  - La relación real es: NC (1) → ACs (N) → ARs (N)
  - Las ARs cuelgan de las ACs, no existen de forma independiente
  - Mantener ARs en un campo separado de la caché es redundante y genera inconsistencia
- **Solución propuesta:** 
  - Eliminar todo el código que referencia `DatosARs`
  - Las ARs ahora residen exclusivamente dentro de cada AC (como propiedad `ARs`)
- **Solución descartada:** Mantener el campo por compatibilidad hacia atrás
  - **Por qué se descarta:** El campo ya fue eliminado de la BD; mantener código que lo referencia causaría errores.
- **Restricciones conocidas:** 
  - El código debe compilar sin errores
  - No modificar comportamiento de otras funcionalidades

---

## 2. Historia de Usuario

> Como sistema, quiero eliminar las referencias al campo `DatosARs` que ya no existe en la tabla de caché, para evitar errores runtime y mantener el código limpio.

**Contexto adicional:**
El usuario decidió que las ARs (Acciones Realizadas / Tareas) siempre deben estar vinculadas a sus ACs (Acciones Correctivas) padre. El campo `DatosARs` en la caché es redundante porque:
1. Las ARs ya están contenidas dentro de cada AC
2. La relación jerárquica es NC → ACs → ARs
3. Mantener un campo separado genera duplicidad y potencial inconsistencia

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| PRD-01_NC_Proyectos | CacheNCProyecto.bas | Modificación | Eliminar funciones y referencias a DatosARs |
| PRD-01_NC_Proyectos | InicializadorCache.bas | Modificación | Eliminar validaciones de DatosARs |
| PRD-01_NC_Proyectos | Funciones Generales.bas | Modificación | Eliminar funciones de actualización de ARs |
| PRD-01_NC_Proyectos | NCProyectoDetailVM.cls | Modificación | Eliminar colección m_ColARs (ya hecho parcialmente) |
| PRD-01_NC_Proyectos | Formularios | Modificación | Eliminar llamadas a funciones de ARs de caché |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/modules/CacheNCProyecto.bas` | Eliminación | Quitar: lectura/escritura de DatosARs, función GenerarJSONARs, variable jsonARs |
| `src/modules/InicializadorCache.bas` | Eliminación | Quitar validaciones y referencias a DatosARs |
| `src/modules/Funciones Generales.bas` | Eliminación | Quitar funciones ActualizarDatosARsProyecto y ActualizarDatosARsAuditoria |
| `src/classes/NCProyectoDetailVM.cls` | Eliminación | Quitar propiedad ColARs y variable m_ColARs |
| `src/forms/FormNCProyectoAcciones.form.txt` | Modificación | Actualizar referencia a m_ACSeleccionada.ARs |

### 3.3 Tablas / Entidades de datos afectadas

**Ninguna.** El campo ya fue eliminado de la tabla `TbCacheNCProyecto` y del ERD por el usuario.

### 3.4 Formularios / UI afectados

**Ninguno.** Solo se eliminan referencias a datos; no hay cambio de UI.

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
| :--- | :--- | :--- |
| DT-006 | Gap: ARs no cargadas en NCProyectoDetailVM | Resuelve (obsoleto tras decisión de eliminar DatosARs) |

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| R-1: Error por campo inexistente en BD | Alta | Alto | **Ya mitigado**: usuario eliminó el campo de la BD |
| R-2: Funciones huérfanas en código | Media | Medio | Eliminar todas las funciones relacionadas |
| R-3:break funcionalidad de formularios | Baja | Alto | Verificar que ARs funcionan vía ACs |

---

## 4. Plan de Intervención

### Intervención 1: Eliminar referencias en CacheNCProyecto.bas

**Archivo:** `src/modules/CacheNCProyecto.bas`
**Tipo:** Eliminación de código
**Precondición:** —

**Descripción:**
Eliminar todo el código relacionado con `DatosARs`:
- Línea 112: `Dim jsonARs As String`
- Línea 159: Lectura `jsonARs = Nz(rcd!DatosARs, "")`
- Línea 262: `Dim jsonARs As String`
- Línea 293: `jsonARs = GenerarJSONARs(p_IDNC, p_Error)`
- Línea 303: Cálculo de tamaño (incluir jsonARs)
- Línea 336: Escritura `!DatosARs = jsonARs`
- Función `GenerarJSONARs` completa (líneas 1140-1202)

**Pasos:**
1. Buscar y eliminar variable `jsonARs` en LoadFromCache
2. Buscar y eliminar variable `jsonARs` en SaveToCache
3. Buscar y eliminar cálculo de tamaño con jsonARs
4. Buscar y eliminar función `GenerarJSONARs`
5. Eliminar referencia a jsonARs en la escritura del recordset

**Postcondición:** CacheNCProyecto.bas no contiene ninguna referencia a DatosARs.

---

### Intervención 2: Eliminar referencias en InicializadorCache.bas

**Archivo:** `src/modules/InicializadorCache.bas`
**Tipo:** Eliminación de código
**Precondición:** Intervención 1 completada

**Descripción:**
Eliminar referencias a DatosARs en validaciones y consultas:
- Línea 516: Condición en consulta de migración
- Línea 815: Condición de invalidez de caché
- Línea 833: Condición de caché incompleta

**Pasos:**
1. Revisar línea 516: eliminar condición OR con DatosARs
2. Revisar línea 815: eliminar condición OR con Len(DatosARs)
3. Revisar línea 833: eliminar condición Len(c.DatosARs)

**Postcondición:** InicializadorCache.bas no contiene referencias a DatosARs.

---

### Intervención 3: Eliminar funciones en Funciones Generales.bas

**Archivo:** `src/modules/Funciones Generales.bas`
**Tipo:** Eliminación de funciones
**Precondición:** Intervención 1 completada

**Descripción:**
Eliminar funciones que ya no tienen propósito:
- Línea 2660: `ActualizarDatosARsProyecto`
- Línea 2693: `ActualizarDatosARsAuditoria`

**Pasos:**
1. Eliminar función `ActualizarDatosARsProyecto` completa
2. Eliminar función `ActualizarDatosARsAuditoria` completa
3. Verificar que no hay otras referencias a estas funciones

**Postcondición:** Funciones Generales.bas no contiene funciones de ARs de caché.

---

### Intervención 4: Limpiar NCProyectoDetailVM.cls

**Archivo:** `src/classes/NCProyectoDetailVM.cls`
**Tipo:** Eliminación de código
**Precondición:** —

**Descripción:**
Eliminar la propiedad `ColARs` que ya no es necesaria:
- Línea 47: `Private m_ColARs As Scripting.Dictionary`
- Línea 187-189: Property Get ColARs
- Líneas 273-302: Código de carga de ARs en CargarPorID

**Pasos:**
1. Eliminar variable privada m_ColARs
2. Eliminar Property Get ColARs
3. Eliminar código de carga de ARs en CargarPorID
4. Eliminar cleanup de rsARs en normal y error flow
5. Eliminar variable rsARs si ya no se usa

**Postcondición:** NCProyectoDetailVM no tiene colección separada de ARs.

---

### Intervención 5: Actualizar formularios

**Archivo:** `src/forms/FormNCProyectoAcciones.form.txt`
**Tipo:** Modificación
**Precondición:** Intervención 4 completada

**Descripción:**
Actualizar llamada a función que ya no existe:
- Línea 1623: `ActualizarDatosARsProyecto m_ACSeleccionada.ARs, m_Error`

**Pasos:**
1. Revisar si la llamada a `ActualizarDatosARsProyecto` todavía se necesita
2. Si no se necesita, eliminar la línea
3. Si se necesita por otro motivo, adaptar la lógica

**Postcondición:** Formulario no tiene llamadas a funciones eliminadas.

---

## 5. Criterios de Éxito

| ID | Criterio | Método de verificación |
| :--- | :--- | :--- |
| CE-1 | Código compila sin errores en VBA Editor | Compilación VBA |
| CE-2 | Sin referencias a DatosARs en código | Búsqueda global con grep |
| CE-3 | NCProyectoDetailVM no tiene propiedad ColARs | Inspección de código |
| CE-4 | Funciones ActualizarDatosARs* eliminadas | Búsqueda en Funciones Generales.bas |
| CE-5 | Caché funciona correctamente sin DatosARs | Prueba manual en Access |

---

## 6. Checklist de Cierre

- [ ] Todas las intervenciones implementadas
- [ ] Código compila sin errores
- [ ] Sin referencias a DatosARs en el código
- [ ] NCProyectoDetailVM funciona correctamente (sin ColARs)
- [ ] Formularios funcionan con ARs anidadas en ACs
- [ ] VALIDADO EN ACCESS: Spec-013

---

## 7. Notas Adicionales

**Decisión de diseño:**
Las ARs ahora residen exclusivamente dentro de cada AC como propiedad `ARs`. Esta es la estructura correcta según la relación jerárquica real:
- NC (1) → ACs (N) → ARs (N)
- Una AC puede tener N ARs
- Las ARs nunca existen sin su AC padre

**Impacto en Spec-006 y Spec-007:**
Esta spec-gap modifica el alcance de Spec-006 y Spec-007. Ya no se necesita cargar ARs como colección separada en NCProyectoDetailVM. Las ARs se acceden a través de cada AC.

---

## 8. Historial de Cambios

| Fecha | Cambio | Autor |
| :--- | :--- | :--- |
| 2026-03-16 | Creación del gap | IA - Arquitecto |
