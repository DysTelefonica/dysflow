# 📝 Spec-015: Operaciones transaccionales de cache NC (listado + detalle)

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Nueva Funcionalidad
**Módulos PRD afectados:** —
**Spec padre:** Spec-006 (GetNCProyectoVM)
**Specs relacionadas:** Spec-010 (KillSwitch Cache), Spec-014 (ARs anidadas en ACs), **Spec-016 (Arquitectura CRUD Service/Repositorio)**
**RFC origen:** —
**Plan origen:** PLAN-002 (T-06)
**Fecha de creación:** 2026-03-16
**Fecha límite:** Sin límite
**Cierre:** Pendiente

---

## 1. Resumen Técnico

- **Problema / Necesidad:** La cache de NC no se actualiza de forma atómica y transaccional entre `TbCacheListadoNC` y `TbCacheNCProyecto` cuando hay CRUD de NC, AC, AR, documentos, riesgos o replanificaciones.
- **Causa raíz:** El CRUD actual en `*Operaciones.cls` está fuertemente acoplado y no garantiza un punto único para sincronizar ambas caches dentro de una misma transacción.
- **Solución propuesta:** Implementar un módulo CRUD de cache autocontenido (servicio + repositorio de cache) que regenere por campo y sincronice listado + detalle en una única transacción.
- **Solución descartada:** Integrar la lógica transaccional de cache dentro de `NCProyectoOperaciones.cls` y clases hermana. Se descarta por alto riesgo de regresión en producción.
- **Restricciones conocidas:**
  - **Esta spec DEPENDE de la Spec-016** para disponer de puntos de integración limpios en los nuevos servicios CRUD.
  - No se elimina ni rompe el flujo productivo actual.
  - La activación funcional quedará gobernada por el kill-switch de cache (Spec-010).

---

## 2. Historia de Usuario

> Como **sistema de persistencia de No Conformidades**, quiero que cada operación CRUD de NC y entidades hijas sincronice de forma transaccional la cache de listado y detalle, para evitar inconsistencias y permitir rollback completo si algo falla.

**Contexto adicional:**
- La arquitectura actual convive en producción y no debe romperse.
- Se construirá el camino nuevo en paralelo y se activará por flag.
- Si el flag de cache está en OFF, el sistema debe seguir funcionando como hoy sin cache transaccional.

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| — | `src/modules/CacheNCCacheRepositorio.bas` | Nueva funcionalidad | Acceso a datos de cache (listado + detalle) |
| — | `src/modules/CacheNCService.bas` | Nueva funcionalidad | Orquestación transaccional de cache |
| — | `src/modules/CacheNCCrud.bas` | Nueva funcionalidad | API pública de notificación por tipo de cambio |
| — | `src/modules/CacheNCProyecto.bas` | Modificación | Reuso de generadores JSON por campo |
| — | `src/modules/*Service.bas` (Spec-016) | Integración | Punto de llamada tras commit CRUD |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/modules/CacheNCCacheRepositorio.bas` | Nuevo módulo | CRUD de `TbCacheNCProyecto` y `TbCacheListadoNC` |
| `src/modules/CacheNCService.bas` | Nuevo módulo | `NotificarCambioNC`, `NotificarCambioMultiCampo`, `NotificarEliminacionNC` |
| `src/modules/CacheNCCrud.bas` | Nuevo módulo | Facade simple para consumo desde servicios |
| `src/modules/CacheNCProyecto.bas` | Modificación | Exponer/normalizar generadores por campo y helper de cerrado |
| `src/modules/NCService.bas` | Modificación | Llamada a cache tras alta/modificación/eliminación |
| `src/modules/ACService.bas` | Modificación | Llamada a cache para cambios en AC |
| `src/modules/ARService.bas` | Modificación | Llamada a cache para cambios en AR |
| `src/modules/DocumentoService.bas` | Modificación | Llamada a cache para cambios en documentos |
| `src/modules/ReplanificacionesService.bas` | Modificación | Llamada a cache para cambios en replanificaciones |

### 3.3 Tablas / Entidades de datos afectadas

| Tabla | Cambio | Detalle |
| :--- | :--- | :--- |
| `TbCacheNCProyecto` | Modificación | Upsert por campos (`DatosNC`, `DatosACs`, `DatosDocumentos`, `DatosRiesgos`, `DatosReplanificaciones`, `Cerrado`) |
| `TbCacheListadoNC` | Modificación | Sincronización transaccional con cache de detalle |

### 3.4 Formularios / UI afectados

**Ninguno.**

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
| :--- | :--- | :--- |
| DT-014-001 | ARs anidadas en ACs | Prerrequisito |
| DT-015-001 | Sin transacción unificada listado+detalle | Resuelve |

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| Actualizar solo una cache y dejar la otra desincronizada | Media | Alto | Una sola transacción para ambas tablas |
| Regresión en flujo productivo actual | Baja | Alto | Integración via Spec-016 + kill-switch en OFF por defecto |
| Sobrecoste por regeneración completa innecesaria | Media | Medio | Regeneración por campo afectado |

---

## 4. Plan de Intervención

### Intervención 1: Repositorio de cache de detalle y listado

**Archivo:** `src/modules/CacheNCCacheRepositorio.bas`
**Tipo:** Nuevo módulo
**Precondición:** —

**Descripción:**
Crear funciones DAO para leer/escribir cache de detalle y listado sin lógica de negocio.

```vba
Public Enum EnumCampoCache
    Campo_DatosNC = 1
    Campo_DatosACs = 2
    Campo_DatosDocumentos = 3
    Campo_DatosRiesgos = 4
    Campo_DatosReplanificaciones = 5
    Campo_Cerrado = 6
End Enum

Public Function UpsertDetalle(ByVal p_IDNC As Long, ByRef p_Valores As Scripting.Dictionary, Optional ByRef p_Error As String) As Boolean
Public Function ActualizarCampoDetalle(ByVal p_IDNC As Long, ByVal p_Campo As EnumCampoCache, ByVal p_Valor As Variant, Optional ByRef p_Error As String) As Boolean
Public Function EliminarDetalle(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
Public Function UpsertListado(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
Public Function EliminarListado(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
```

**Postcondición:** Existe repositorio de cache desacoplado de formularios y servicios de dominio.

---

### Intervención 2: Servicio transaccional de cache

**Archivo:** `src/modules/CacheNCService.bas`
**Tipo:** Nuevo módulo
**Precondición:** Intervención 1 completada

**Descripción:**
Implementar servicio que orquesta regeneración por campo y sincroniza ambas caches dentro de una sola transacción DAO.

```vba
Public Function NotificarCambioNC(ByVal p_IDNC As Long, ByVal p_Campo As EnumCampoCache, Optional ByRef p_Error As String) As Boolean
Public Function NotificarCambioMultiCampo(ByVal p_IDNC As Long, ByRef p_Campos As Collection, Optional ByRef p_Error As String) As Boolean
Public Function NotificarEliminacionNC(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
```

Patrón obligatorio:
- `BeginTrans`
- regenerar campo(s) de detalle
- sincronizar listado
- `CommitTrans`
- en error: `RollbackTrans`

**Postcondición:** Cualquier notificación de cambio deja listado y detalle consistentes o revierte todo.

---

### Intervención 3: Facade CRUD de cache

**Archivo:** `src/modules/CacheNCCrud.bas`
**Tipo:** Nuevo módulo
**Precondición:** Intervención 2 completada

**Descripción:**
Exponer API mínima para consumo desde servicios de dominio (Spec-016), ocultando detalles internos de cache.

```vba
Public Function NotificarAltaNC(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
Public Function NotificarModificacionNC(ByVal p_IDNC As Long, ByRef p_Campos As Collection, Optional ByRef p_Error As String) As Boolean
Public Function NotificarEliminacionNC(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
Public Function NotificarCambioACAR(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
```

**Postcondición:** Existe un punto único de entrada para integrar cache en servicios CRUD.

---

### Intervención 4: Integración en servicios CRUD nuevos (dependencia Spec-016)

**Archivo:** `src/modules/NCService.bas`, `src/modules/ACService.bas`, `src/modules/ARService.bas`, `src/modules/DocumentoService.bas`, `src/modules/ReplanificacionesService.bas`
**Tipo:** Modificación
**Precondición:** **Spec-016 implementada y validada en Access.**

**Descripción:**
Tras confirmar CRUD en BD en los servicios nuevos, invocar `CacheNCCrud` según tipo de cambio y respetar kill-switch de cache.

Mapeo mínimo:
- NC alta/modificación -> `Campo_DatosNC`
- FECHACIERRE -> `Campo_DatosNC` + `Campo_Cerrado`
- AC/AR alta/modificación/eliminación -> `Campo_DatosACs` (+ `Campo_DatosNC` si recalcula estado)
- Documentos -> `Campo_DatosDocumentos`
- Riesgos -> `Campo_DatosRiesgos` + `Campo_DatosNC`
- Replanificaciones -> `Campo_DatosReplanificaciones`

**Postcondición:** El flujo CRUD nuevo mantiene cache de listado y detalle sincronizada de forma transaccional.

---

### Intervención 5: Compatibilidad y fallback por flag

**Archivo:** `src/modules/CacheNCService.bas` y punto de configuración kill-switch
**Tipo:** Modificación
**Precondición:** Intervención 4 completada

**Descripción:**
Implementar comportamiento:
- Si cache ON: ejecutar pipeline transaccional de cache.
- Si cache OFF: no tocar cache y mantener comportamiento actual.

**Postcondición:** Existe rollback funcional operativo a "sin cache" sin tocar producción vigente.

---

## 5. Criterios de Verificación

### 5.1 Auto-verificación (IA)

- [ ] Existen `CacheNCCacheRepositorio.bas`, `CacheNCService.bas` y `CacheNCCrud.bas`.
- [ ] `CacheNCService.NotificarCambioNC` usa `BeginTrans/CommitTrans/RollbackTrans`.
- [ ] No hay actualizaciones de listado o detalle fuera de la transacción de cache.
- [ ] Integraciones en servicios CRUD apuntan a `CacheNCCrud` (no a formularios).
- [ ] Se respeta patrón corporativo de manejo de errores VBA.
- [ ] Si flag cache = OFF, el flujo CRUD continúa sin llamar a cache.
- [ ] No se modifican archivos fuera del alcance de esta spec y la Spec-016.

### 5.2 Validación en Access (usuario)

**Escenario 1: Alta NC con cache ON**
- [ ] Activar flag cache.
- [ ] Dar de alta una NC de prueba.
- [ ] Verificar fila coherente en `TbCacheListadoNC` y `TbCacheNCProyecto` para el mismo ID.

**Escenario 2: Falla forzada durante sincronización**
- [ ] Forzar error en escritura de una de las dos tablas de cache.
- [ ] Ejecutar modificación de NC.
- [ ] Verificar rollback completo: no queda actualizada solo una tabla.

**Escenario 3: CRUD de AR**
- [ ] Crear/modificar/eliminar AR en una NC de prueba.
- [ ] Verificar regeneración de `DatosACs` y coherencia de estado en `DatosNC` cuando aplique.

**Escenario 4: cache OFF**
- [ ] Desactivar flag cache.
- [ ] Ejecutar alta/modificación/eliminación de NC.
- [ ] Verificar que el flujo funciona igual que antes sin errores de cache.

### 5.3 Criterios de aceptación

- [ ] Toda operación CRUD del flujo nuevo (Spec-016) sincroniza cache listado+detalle en una misma transacción.
- [ ] Ante error, no hay estados parciales en cache.
- [ ] Con cache OFF, no hay regresión funcional respecto al comportamiento previo.
- [ ] No se rompe producción actual durante la convivencia de arquitecturas.

---

## 6. Informe de Cambios UI

**Sin cambios de UI**

---

## 7. Gaps y Decisiones

### 7.1 Gaps pre-implementación

| # | Pregunta / Gap | Responsable | Estado | Resolución |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Orden exacto de rollout de servicios de Spec-016 para minimizar riesgo | Dev | Abierto | Pendiente |
| 2 | Definición final del contrato de kill-switch (lectura config) | Dev | Abierto | Pendiente |
| 3 | Estrategia de logging de operaciones de cache para auditoría | Dev | Abierto | Pendiente |

### 7.2 Gaps post-implementación (iteraciones)

Se completará en fase de validación Access.

---

## 8. Notas de Implementación

- **Esta spec se ejecuta DESPUÉS de la Spec-016.**
- No se migra ni se depreca el código productivo legacy en esta fase.
- Integración de cache solo en la nueva vía de servicios/repositorios.

---

## 9. Registro de Cambios de la Spec

| Versión | Fecha | Cambio |
| :--- | :--- | :--- |
| 1.0 | 2026-03-16 | Creación inicial |
| 1.1 | 2026-03-17 | Restaurada al alcance de cache transaccional y marcada dependencia explícita con Spec-016 |
