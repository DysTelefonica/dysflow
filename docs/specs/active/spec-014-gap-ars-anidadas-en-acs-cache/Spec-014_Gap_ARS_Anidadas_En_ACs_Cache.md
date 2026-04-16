# 📝 Spec-014: Gap - ARs Anidadas dentro de ACs en la Caché

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Deuda Técnica
**Módulos PRD afectados:** —
**Spec padre:** Spec-006 (GetNCProyectoVM)
**Specs relacionadas:** Spec-013 (Gap - Eliminar DatosARs de la Caché)
**RFC origen:** —
**Plan origen:** PLAN-002 (T-06)
**Fecha de creación:** 2026-03-16
**Fecha límite:** —
**Cierre:** Pendiente

---

## 1. Resumen Técnico

- **Problema / Necesidad:** La caché de NCProyecto guarda las ACs en `DatosACs` y las ARs estaban en `DatosARs` (ya eliminado). La estructura correcta según el ERD es: NC (1) → ACs (N) → ARs (N). Las ARs deben estar **anidadas dentro de cada AC**, no como una colección plana.
- **Causa raíz:** 
  - La función `GenerarJSONACs` solo guarda los campos de las ACs, no sus ARs asociadas
  - Al eliminar `DatosARs`, las ARs ya no se guardan en la caché
  - La clase `ACProyecto` ya tiene la propiedad `ARs` que carga las ARs desde BD, pero el JSON de la caché no la incluye
- **Solución propuesta:** 
  - Modificar `GenerarJSONACs` para incluir las ARs de cada AC en el JSON
  - Usar INNER JOIN para obtener ACs con sus ARs en una sola consulta
  - Estructura JSON: `{ "ID_AC_1": { camposAC, "ARs": { "ID_AR_1": { camposAR }, ... } }, ... }`
- **Restricciones conocidas:** La caché existente no se migra automáticamente; se regenerará al invalidate.

---

## 2. Historia de Usuario

> Como **sistema de caché**, quiero guardar las ACs con sus ARs anidadas en un solo campo JSON, para que al recuperar la caché se obtenga la estructura completa sin necesidad de consultas adicionales a la base de datos.

**Contexto adicional:**
- La clase `ACProyecto` ya tiene la propiedad `ARs` que funciona perfectamente (carga ARs desde BD cuando se accede)
- El formulario `FormNCProyectoAcciones` muestra ARs al seleccionar una AC - debe seguir funcionando igual con la caché
- El objetivo es rendimiento: evitar N+1 queries al cargar una NC con sus ACs y ARs

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| — | CacheNCProyecto.bas | Modificación | Función GenerarJSONACs |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/modules/CacheNCProyecto.bas` | Modificación | GenerarJSONACs: añadir ARs anidadas |

### 3.3 Tablas / Entidades de datos afectadas

**Ninguna.** La estructura de la tabla `TbCacheNCProyecto` no cambia - solo el contenido del campo `DatosACs`.

### 3.4 Formularios / UI afectados

**Ninguno.** Los formularios ya funcionan con ACs y ARs; la caché solo afecta el origen de datos.

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
| :--- | :--- | :--- |
| DT-014-001 | Eliminar DatosARs de la caché | Relacionada (spec anterior) |

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| Cachés existentes con datos antiguos | Baja | Medio | Al invalidate, se regenera la caché completa |

---

## 4. Plan de Intervención

### Intervención 1: Modificar GenerarJSONACs para incluir ARs

**Archivo:** `src/modules/CacheNCProyecto.bas`
**Tipo:** Modificación
**Precondición:** —

**Descripción:**
Modificar la función `GenerarJSONACs` para:
1. Usar INNER JOIN entre ACs y ARs para obtener ambas en una consulta
2. Para cada AC, crear un diccionario con sus campos + una clave "ARs" conteniendo las ARs
3. Estructura JSON anidada: AC con colección de ARs dentro

```vba
' Estructura objetivo en JSON:
' {
'   "1": { "IdAccionCorrectiva": 1, "NAccion": "AC-001", ..., "ARs": { "1": {...}, "2": {...} } },
'   "2": { "IdAccionCorrectiva": 2, "NAccion": "AC-002", ..., "ARs": { "3": {...} } }
' }
```

**Postcondición:** El JSON de ACs contiene las ARs anidadas por cada AC.

---

### Intervención 2: Modificar ParseJSONToACs para reconstruir ARs

**Archivo:** `src/modules/CacheNCProyecto.bas`
**Tipo:** Modificación
**Precondición:** Intervención 1 completada

**Descripción:**
Modificar `ParseJSONToACs` para:
1. Al crear cada AC, verificar si existe la clave "ARs" en el diccionario
2. Si existe, poblar la propiedad `AC.ARs` con las ARs parseadas
3. Vincular cada AR a su AC padre

**Postcondición:** Al cargar desde caché, las ACs tienen sus ARs inicializadas.

---

## 5. Criterios de Verificación

### 5.1 Auto-verificación (IA)

- [ ] `GenerarJSONACs` incluye ARs en el JSON generado
- [ ] El JSON tiene estructura anidada: AC → ARs
- [ ] `ParseJSONToACs` reconstruye las ARs dentro de cada AC
- [ ] Se usa INNER JOIN para obtener ACs+ARs en una consulta
- [ ] Código compila sin errores

### 5.2 Validación en Access (usuario)

**Escenario 1: Generar caché para NC con ACs y ARs**
- [ ] Seleccionar una NC que tenga ACs con ARs asociadas
- [ ] Forzar invalidación de caché (o esperar a que expire)
- [ ] Cargar la NC y verificar que DatosACs contiene JSON con ARs dentro

**Escenario 2: Cargar desde caché**
- [ ] Con la caché caliente, cargar la NC
- [ ] Seleccionar una AC que tenga ARs
- [ ] **Esperado:** Las ARs se muestran sin retardo (cargadas desde caché)
- [ ] **Validar:** Mismo comportamiento que sin caché

### 5.3 Criterios de aceptación

- [ ] El JSON de ACs incluye las ARs anidadas
- [ ] Al cargar desde caché, las ARs están disponibles en cada AC
- [ ] El formulario muestra las ARs correctamente (mismo comportamiento que sin caché)
- [ ] Sin regresiones: el resto de funcionalidades de caché funciona
- [ ] **Tests CD-001 a CD-004 pasan correctamente**

### 5.4 Tests de Validación de Caché de Detalle

> Tests requeridos para confirmar que la caché de detalle (NC + ACs + ARs) funciona correctamente. Deben ejecutarse en Access tras la implementación.

**Test CD-001: Generar caché con ACs y ARs**
- [ ] Identificar una NC que tenga al menos 2 ACs, donde al menos 1 AC tenga 2 o más ARs
- [ ] Forzar invalidación de caché para esa NC
- [ ] Ejecutar: `Debug.Print getCacheNCProyecto(1).DatosACs` (sustituir 1 por ID real)
- [ ] **Esperado:** El JSON muestra cada AC con una clave "ARs" conteniendo las ARs anidadas
- [ ] **Validar:** `"ARs": { "1": { ... }, "2": { ... } }` dentro de cada AC

**Test CD-002: Cargar NC desde caché y verificar ARs**
- [ ] Con caché caliente (del test anterior), cargar la NC usando el formulario
- [ ] Seleccionar una AC que tenga ARs
- [ ] **Esperado:** Las ARs se muestran sin retardo (cargadas desde caché)
- [ ] **Validar:** Mismo comportamiento que sin caché

**Test CD-003: Verificar estructura JSON completa**
- [ ] En la ventana de depuración, ejecutar:
```vba
Dim cache As NCProyecto
Set cache = getCacheNCProyecto(ID_NC_REAL)
Debug.Print cache.DatosACs
```
- [ ] Copiar el JSON resultado y validar con cualquier parser JSON online
- [ ] **Esperado:** Estructura jerárquica correcta: `{ AC_ID: { camposAC, ARs: { AR_ID: { camposAR } } } }`

**Test CD-004: NC sin ARs**
- [ ] Identificar una NC que tenga ACs pero ninguna AR
- [ ] Generar caché
- [ ] **Esperado:** Cada AC tiene `"ARs": {}` (objeto vacío)

**Test CD-005: Comparación rendimiento (opcional)**
- [ ] Medir tiempo de carga sin caché (directo de BD)
- [ ] Medir tiempo de carga con caché
- [ ] **Esperado:** Con caché es significativamente más rápido

---

## 6. Informe de Cambios UI

**Sin cambios de UI**

---

## 7. Gaps y Decisiones

### 7.1 Gaps pre-implementación

| # | Pregunta / Gap | Responsable | Estado | Resolución |
| :--- | :--- | :--- | :--- | :--- |
| 1 | ¿Cómo se charge la relación AC→ARs en ACProyecto.ARs? | Dev | Resuelto | Ya existe propiedad ARs que carga desde BD lazy |
| 2 | ¿Qué pasa si una AC no tiene ARs? | Dev | Resuelto | El JSON incluiría "ARs": {} vacío |

---

## 8. Notas de Implementación

> La clase `ACProyecto` ya tiene la propiedad `ARs` implementada que carga desde la BD. El objetivo es que la caché también guarde esta información para evitar consultas adicionales.

---

## 9. Registro de Cambios de la Spec

| Versión | Fecha | Cambio |
| :--- | :--- | :--- |
| 1.0 | 2026-03-16 | Creación inicial |
