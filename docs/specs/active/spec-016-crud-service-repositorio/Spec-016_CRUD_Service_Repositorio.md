# 📝 Spec-016: Arquitectura Service + Repositorio para NCProyecto (Fase 1)

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Refactoring
**Módulos PRD afectados:** —
**Spec padre:** Spec-006 (GetNCProyectoVM)
**Specs relacionadas:** Spec-015 (Cache Transaccional), Spec-010 (KillSwitch Cache)
**RFC origen:** RFC-001 (Plan de Mejora de Arquitectura)
**Plan origen:** PLAN-002 (T-06)
**Fecha de creación:** 2026-03-17
**Fecha límite:** —
**Cierre:** Pendiente

---

## 1. Resumen Técnico

- **Problema / Necesidad:** NCProyectoOperaciones.cls (1536 líneas) es un "God Class" que mezcla: validaciones de negocio, SQL directo (DAO), integración con caché, cálculos de estado y logging. Esto viola el principio de responsabilidad única y dificulta el mantenimiento y testeo.
- **Causa raíz:** Arquitectura histórica donde cada clase "*Operaciones" actúa simultáneamente como Service, Repositorio y Validator.
- **Solución propuesta:** Separar en tres capas:
  1. **Repositorios** (SQL/DAO puro) → src/modules/NCRepository.bas, ACRepository.bas, ARRepository.bas
  2. **Servicios** (lógica de negocio + validaciones) → src/modules/NCService.bas, ACService.bas, ARService.bas
  3. **Formularios/VM** (solo llaman a servicios)
- **Restricciones:** Mantener backward compatibility durante la migración (新旧共存). No modificar los formularios hasta tener los servicios operativos.
- **NOTA:** Esta spec se ejecuta ANTES que Spec-015. Spec-015 depende de esta para integración transaccional de caché.

---

## 2. Historia de Usuario

> Como **arquitecto de software**, quiero refactorizar las clases *Operaciones en una arquitectura Service + Repositorio limpia, para que el código sea mantenible, testable y cumpla el principio de responsabilidad única.

**Contexto adicional:**
- El patrón Service + Repositorio ya existe parcialmente (existe RiesgoServicio en línea 538 de NCProyectoOperaciones)
- El usuario tiene VM implementado (Spec-006 GetNCProyectoVM)
- La refactorización debe ser incremental: primero crear la nueva arquitectura, luego redirigir los formularios gradualmente
- Esta spec es prerrequisito para Spec-015 (cache transaccional)

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| — | NCProyectoOperaciones.cls | Deprecación gradual | Mantener pero no expandir |
| — | ACProyectoOperaciones.cls | Deprecación gradual | Idem |
| — | ARProyectoOperaciones.cls | Deprecación gradual | Idem |
| — | NCRepository.bas | Nueva funcionalidad | Módulo completo nuevo |
| — | NCService.bas | Nueva funcionalidad | Módulo completo nuevo |
| — | ACRepository.bas | Nueva funcionalidad | Módulo completo nuevo |
| — | ACService.bas | Nueva funcionalidad | Módulo completo nuevo |
| — | ARRepository.bas | Nueva funcionalidad | Módulo completo nuevo |
| — | ARService.bas | Nueva funcionalidad | Módulo completo nuevo |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/modules/NCRepository.bas` | Nuevo módulo | Repositorio para NC: GetById, Insert, Update, Delete, GetAll |
| `src/modules/NCValidator.bas` | Nuevo módulo | Validaciones extraídas de NCProyectoOperaciones |
| `src/modules/NCService.bas` | Nuevo módulo | Servicio para NC: Alta, Modificar, Eliminar, GetById + integración con caché |
| `src/modules/ACRepository.bas` | Nuevo módulo | Repositorio para AC |
| `src/modules/ACService.bas` | Nuevo módulo | Servicio para AC |
| `src/modules/ARRepository.bas` | Nuevo módulo | Repositorio para AR |
| `src/modules/ARService.bas` | Nuevo módulo | Servicio para AR |

### 3.3 Tablas / Entidades de datos afectadas

**Ninguna.** La refactorización es a nivel de código, no modifica el esquema.

### 3.4 Formularios / UI afectados

| Formulario | Cambio | Detalle |
| :--- | :--- | :--- |
| `src/forms/FormNCProyecto.form.txt` | Modificación de comportamiento | Redirigir de NCProyectoOperaciones a NCService |

### 3.5 Deuda técnica relacionada

| ID | Descripción | Relación |
| :--- | :--- | :--- |
| DT-016-001 | NCProyectoOperaciones es un God Class | Genera |
| DT-016-002 | Mezcla de responsabilidades (validación, SQL, caché, logging) | Genera |
| DT-016-003 | Dificultad para testear lógica de negocio | Genera |
| DT-016-004 | Sin punto de integración para cache transaccional | Resuelve (Spec-015) |

### 3.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
| :--- | :--- | :--- | :--- |
| Regresiones en funcionalidad existente | Media | Alto | Tests de regresión, validación manual exhaustiva |
| Confusión durante新旧共存 | Alta | Medio | Documentar qué usar y qué deprecated |
| Ciclos de dependencias entre capas | Baja | Alto | Diseño inicial con dependencias unidireccionales: Service → Repository |

---

## 4. Plan de Intervención

### Intervención 1: Crear NCRepository.bas

**Archivo:** `src/modules/NCRepository.bas`
**Tipo:** Nuevo módulo
**Precondición:** —

**Descripción:**
Crear módulo de acceso a datos para NC. Debe contener únicamente SQL/DAO, sin lógica de negocio.

```vba
' Obtener NC por ID
Public Function GetById(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As NCProyecto
' Insertar nueva NC
Public Function Insert(ByRef p_NC As NCProyecto, Optional ByRef p_Error As String) As Boolean
' Actualizar NC existente
Public Function Update(ByRef p_NC As NCProyecto, Optional ByRef p_Error As String) As Boolean
' Eliminar NC (lógica o física)
Public Function Delete(ByVal p_IDNC As Long, ByVal p_Logico As Boolean, Optional ByRef p_Error As String) As Boolean
' Obtener todas las NCs
Public Function GetAll(Optional ByVal p_Filtro As String = "", Optional ByRef p_Error As String) As Collection
```

**Postcondición:** NCRepository.bas existe y compila sin errores.

---

### Intervención 2: Extraer validaciones de NCProyectoOperaciones a NCValidator.bas

**Archivo:** `src/modules/NCValidator.bas`
**Tipo:** Nuevo módulo
**Precondición:** Intervención 1 completada

**Descripción:**
Extraer las funciones de validación existentes de NCProyectoOperaciones.cls a un módulo independiente.

| Función origen | Nueva ubicación |
| :--- | :--- |
| `MotivoAltaDatosUnicosNoOK` | `NCValidator.ValidarAlta(p_NC)` |
| `MotivoEdicionDatosUnicosNoOK` | `NCValidator.ValidarEdicion(p_NC)` |
| `MotivoDatosUnicosNoOK` | `NCValidator.Validar(p_NC)` |

**Postcondición:** NCValidator.bas contiene todas las validaciones extraídas.

---

### Intervención 3: Crear NCService.bas con integración de caché

**Archivo:** `src/modules/NCService.bas`
**Tipo:** Nuevo módulo
**Precondición:** Intervención 1 y 2 completadas

**Descripción:**
Crear el servicio que orquesta NC con integración de caché transaccional.

```vba
' Alta de NC
Public Function Alta(ByRef p_NC As NCProyecto, Optional ByRef p_Error As String) As Boolean
' Flujo: ValidarAlta → CalcularIDs → BeginTrans → Repository.Insert → CacheNCCrud → Commit/Rollback

' Edición de NC
Public Function Modificar(ByRef p_NC As NCProyecto, ByRef p_NC_Original As NCProyecto, Optional ByRef p_Error As String) As Boolean

' Eliminación de NC
Public Function Eliminar(ByVal p_IDNC As Long, ByVal p_Logico As Boolean, Optional ByRef p_Error As String) As Boolean

' Obtener NC por ID
Public Function GetById(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As NCProyecto
```

**Integración con caché:**
- Tras CRUD exitoso, verificar flag cache (Spec-010)
- Si cache ON: llamar a CacheNCCrud.NotificarCambioNC con el campo afectado

**Patrón de manejo de errores (OBLIGATORIO):**
```vba
Public Function Alta(...) As Boolean
    Dim db As dao.Database
    On Error GoTo errores
    Set db = getdb()
    db.BeginTrans
    ' ... lógica ...
    db.CommitTrans
    Alta = True
    Exit Function
errores:
    If Not db Is Nothing Then db.RollbackTrans
    p_Error = "NCService.Alta: " & Err.Description
End Function
```

**Postcondición:** NCService.bas existe, compila y integra con caché.

---

### Intervención 4: Crear ACRepository.bas

**Archivo:** `src/modules/ACRepository.bas`
**Tipo:**Nuevo módulo
**Precondición:** Intervención 1 completada

**Descripción:**
Repositorio para AC. Tabla BD: TbNCAccionCorrectivas.

```vba
Public Function GetById(ByVal p_IDAC As Long, Optional ByRef p_Error As String) As ACProyecto
Public Function GetByIdNC(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Collection
Public Function Insert(ByRef p_AC As ACProyecto, Optional ByRef p_Error As String) As Boolean
Public Function Update(ByRef p_AC As ACProyecto, Optional ByRef p_Error As String) As Boolean
Public Function Delete(ByVal p_IDAC As Long, Optional ByRef p_Error As String) As Boolean
```

**Postcondición:** ACRepository.bas existe y compila.

---

### Intervención 5: Crear ARRepository.bas

**Archivo:** `src/modules/ARRepository.bas`
**Tipo:** Nuevo módulo
**Precondición:** Intervención 1 completada

**Descripción:**
Repositorio para AR. Tabla BD: TbNCAccionesRealizadas.

```vba
Public Function GetById(ByVal p_IDAR As Long, Optional ByRef p_Error As String) As ARProyecto
Public Function GetByIdAC(ByVal p_IDAC As Long, Optional ByRef p_Error As String) As Collection
Public Function Insert(ByRef p_AR As ARProyecto, Optional ByRef p_Error As String) As Boolean
Public Function Update(ByRef p_AR As ARProyecto, Optional ByRef p_Error As String) As Boolean
Public Function Delete(ByVal p_IDAR As Long, Optional ByRef p_Error As String) As Boolean
```

**Postcondición:** ARRepository.bas existe y compila.

---

### Intervención 6: Crear ACService.bas

**Archivo:** `src/modules/ACService.bas`
**Tipo:** Nuevo módulo
**Precondición:** Intervención 3 y 4 completadas

**Descripción:**
Servicio para AC con validaciones extraídas de ACProyectoOperaciones e integración con caché.

```vba
Public Function Alta(p_AC As ACProyecto, Optional ByRef p_Error As String) As Boolean
Public Function Modificar(p_AC As ACProyecto, Optional ByRef p_Error As String) As Boolean
Public Function Eliminar(p_IDAC As Long, Optional ByRef p_Error As String) As Boolean
Public Function GetById(p_IDAC As Long, Optional ByRef p_Error As String) As ACProyecto
Public Function GetByIdNC(p_IDNC As Long, Optional ByRef p_Error As String) As Collection
```

**Postcondición:** ACService.bas existe con transacciones y manejo de errores.

---

### Intervención 7: Crear ARService.bas

**Archivo:** `src/modules/ARService.bas`
**Tipo:** Nuevo módulo
**Precondición:** Intervención 3 y 5 completadas

**Descripción:**
Servicio para AR con validaciones extraídas de ARProyectoOperaciones e integración con caché.

```vba
Public Function Alta(p_AR As ARProyecto, Optional ByRef p_Error As String) As Boolean
Public Function Modificar(p_AR As ARProyecto, Optional ByRef p_Error As String) As Boolean
Public Function Eliminar(p_IDAR As Long, Optional ByRef p_Error As String) As Boolean
Public Function GetById(p_IDAR As Long, Optional ByRef p_Error As String) As ARProyecto
Public Function GetByIdAC(p_IDAC As Long, Optional ByRef p_Error As String) As Collection
```

**Postcondición:** ARService.bas existe con transacciones y manejo de errores.

---

### Intervención 8: Redirigir FormNCProyecto a NCService

**Archivo:** `src/forms/FormNCProyecto.form.txt`
**Tipo:** Modificación de comportamiento
**Precondición:** Intervención 3 completada

**Descripción:**
Modificar el formulario FormNCProyecto para que use NCService en lugar de NCProyectoOperaciones.

**Postcondición:** FormNCProyecto funciona correctamente con NCService.

---

## 5. Criterios de Verificación

### 5.1 Auto-verificación (IA)

- [ ] NCRepository.bas existe con funciones: GetById, Insert, Update, Delete, GetAll
- [ ] NCValidator.bas contiene todas las validaciones extraídas de NCProyectoOperaciones
- [ ] NCService.bas existe con funciones: Alta, Modificar, Eliminar, GetById
- [ ] NCService usa transacciones (BeginTrans/CommitTrans/Rollback)
- [ ] NCService cumple el patrón de manejo de errores
- [ ] NCService integra con CacheNCCrud tras CRUD
- [ ] ACRepository.bas y ARRepository.bas existen con firmas detalladas
- [ ] ACService.bas y ARService.bas existen con transacciones y manejo de errores
- [ ] ACService y ARService integran con CacheNCCrud tras CRUD
- [ ] Código compila sin errores
- [ ] **Módulo de tests creado** con todos los casos de prueba listados en sección 5.2

### 5.2 Validación en Access - Batería de Tests

Se debe crear un módulo de tests `src/modules/Test_ServiceRepository.bas` con los siguientes casos de prueba. Cada test debe:
1. Preparar datos de prueba
2. Ejecutar la operación
3. Verificar resultados esperados
4. Limpiar datos de prueba

---

#### Tests NCRepository

| Test ID | Descripción | Pasos | Resultado Esperado |
|---------|-------------|-------|-------------------|
| `Test_NCRepo_GetById_Existe` | Obtener NC existente | 1. Insertar NC directamente en BD con datos conocidos<br>2. Llamar NCRepository.GetById(ID) | Devuelve objeto NCProyecto con todos los campos coincide |
| `Test_NCRepo_GetById_NoExiste` | Obtener NC inexistente | 1. Llamar NCRepository.GetById(999999) | Devuelve Nothing |
| `Test_NCRepo_Insert_OK` | Insertar NC válida | 1. Crear objeto NCProyecto con todos los campos obligatorios<br>2. Llamar NCRepository.Insert(NC) | Retorna True, registro existe en BD |
| `Test_NCRepo_Insert_Duplicado` | Insertar NC duplicada | 1. Insertar NC<br>2. Intentar insertar misma NC de nuevo | Retorna False o error de clave duplicada |
| `Test_NCRepo_Update_OK` | Actualizar NC existente | 1. Insertar NC<br>2. Modificar campo Descripcion<br>3. Llamar NCRepository.Update(NC) | Retorna True, campo modificado en BD |
| `Test_NCRepo_Update_NoExiste` | Actualizar NC inexistente | 1. Llamar NCRepository.Update(NC) con ID inexistente | Retorna False |
| `Test_NCRepo_Delete_Logico` | Eliminación lógica | 1. Insertar NC<br>2. Llamar NCRepository.Delete(ID, True) | Retorna True, campo Borrado = True en BD |
| `Test_NCRepo_Delete_Fisico` | Eliminación física | 1. Insertar NC<br>2. Llamar NCRepository.Delete(ID, False) | Retorna True, registro eliminado de BD |
| `Test_NCRepo_GetAll` | Obtener todas las NCs | 1. Insertar 3 NCs<br>2. Llamar NCRepository.GetAll | Colección con 3 elementos |

---

#### Tests NCValidator

| Test ID | Descripción | Pasos | Resultado Esperado |
|---------|-------------|-------|-------------------|
| `Test_NCValidator_Alta_ExpedienteVacio` | Validar alta sin expediente | 1. Crear NC sin ExpedienteObj<br>2. Llamar NCValidator.ValidarAlta(NC) | Error: "No se conoce el expediente" |
| `Test_NCValidator_Alta_DescripcionVacia` | Validar alta sin descripción | 1. Crear NC con Descripcion = ""<br>2. Llamar NCValidator.ValidarAlta(NC) | Error: "No se conoce la descripción" |
| `Test_NCValidator_Alta_DetectadoPorVacio` | Validar alta sin DetectadoPor | 1. Crear NC sin DetectadoPor<br>2. Llamar NCValidator.ValidarAlta(NC) | Error: "No se conoce DetectadoPor" |
| `Test_NCValidator_Alta_FechaAperturaVacia` | Validar alta sin fecha apertura | 1. Crear NC sin FechaApertura<br>2. Llamar NCValidator.ValidarAlta(NC) | Error: "No se conoce la fecha de apertura" |
| `Test_NCValidator_Alta_FechaAnteriorVinculada` | Validar fecha anterior a NC vinculada | 1. Crear NC vinculada con FechaApertura anterior a la NC padre<br>2. Llamar NCValidator.ValidarAlta(NC) | Error: "La fecha de apertura es anterior a la de la que está vinculada" |
| `Test_NCValidator_Alta_OK` | Validar alta válida | 1. Crear NC con todos los campos obligatorios válidos<br>2. Llamar NCValidator.ValidarAlta(NC) | Sin errores |
| `Test_NCValidator_Alta_ControlEficaciaSinFecha` | Validar control eficacia sin fecha | 1. Crear NC con RequiereControlEficacia = "Sí" pero sin FechaPrevista<br>2. Llamar NCValidator.ValidarAlta(NC) | Error: "Si requiere el control de eficacia se ha de indicar la fecha prevista" |
| `Test_NCValidator_Edicion_FechaMayorPrevista` | Validar edición con fecha > prevista | 1. Crear NC con FechaApertura > FPREVCIERRE<br>2. Llamar NCValidator.ValidarEdicion(NC) | Error: "La fecha de apertura no puede ser mayor a la fecha prevista de cierre" |

---

#### Tests NCService (con transacciones)

| Test ID | Descripción | Pasos | Resultado Esperado |
|---------|-------------|-------|-------------------|
| `Test_NCService_Alta_OK` | Alta NC exitosa | 1. Crear NC con todos los campos válidos<br>2. Llamar NCService.Alta(NC) | Retorna True, NC en BD con ID generado |
| `Test_NCService_Alta_ValidationFails` | Alta NC con validación fallida | 1. Crear NC sin Descripcion<br>2. Llamar NCService.Alta(NC) | Retorna False, error en p_Error, NC NO en BD |
| `Test_NCService_Alta_TransaccionOK` | Alta con transacción completada | 1. Llamar NCService.Alta(NC) exitosa<br>2. Verificar en log | Transacción comprometida (Commit) |
| `Test_NCService_Alta_TransaccionFail` | Alta con transacción fallida | 1. Forzar error en Repository.Insert<br>2. Llamar NCService.Alta(NC) | Transacción revertida (Rollback), NC NO en BD |
| `Test_NCService_Modificar_OK` | Modificar NC exitosa | 1. Insertar NC<br>2. Modificar Descripcion<br>3. Llamar NCService.Modificar(NC_original, NC_nueva) | Retorna True, campo modificado en BD |
| `Test_NCService_Modificar_ValidationFails` | Modificar con validación fallida | 1. Insertar NC<br>2. Intentar modificar con Descripcion = ""<br>3. Llamar NCService.Modificar | Retorna False, NC sin cambios en BD |
| `Test_NCService_Eliminar_Logico_OK` | Eliminación lógica exitosa | 1. Insertar NC<br>2. Llamar NCService.Eliminar(ID, True) | Retorna True, Borrado = True en BD |
| `Test_NCService_Eliminar_Fisico_OK` | Eliminación física exitosa | 1. Insertar NC<br>2. Llamar NCService.Eliminar(ID, False) | Retorna True, NC eliminada de BD |
| `Test_NCService_GetById_OK` | Obtener NC por ID | 1. Insertar NC<br>2. Llamar NCService.GetById(ID) | Retorna objeto NCProyecto con datos correctos |
| `Test_NCService_GetById_NoExiste` | Obtener NC inexistente | 1. Llamar NCService.GetById(999999) | Retorna Nothing |

---

#### Tests ACRepository

| Test ID | Descripción | Pasos | Resultado Esperado |
|---------|-------------|-------|-------------------|
| `Test_ACRepo_GetById_OK` | Obtener AC existente | 1. Insertar AC directamente en BD<br>2. Llamar ACRepository.GetById(ID) | Devuelve objeto ACProyecto |
| `Test_ACRepo_GetByIdNC_OK` | Obtener ACs por NC | 1. Insertar 2 ACs para misma NC<br>2. Llamar ACRepository.GetByIdNC(ID_NC) | Colección con 2 elementos |
| `Test_ACRepo_Insert_OK` | Insertar AC válida | 1. Crear objeto ACProyecto<br>2. Llamar ACRepository.Insert(AC) | Retorna True, registro en BD |
| `Test_ACRepo_Update_OK` | Actualizar AC | 1. Insertar AC<br>2. Modificar AccionCorrectiva<br>3. Llamar ACRepository.Update(AC) | Retorna True, campo modificado |
| `Test_ACRepo_Delete_OK` | Eliminar AC | 1. Insertar AC<br>2. Llamar ACRepository.Delete(ID) | Retorna True, registro eliminado |

---

#### Tests ARRepository

| Test ID | Descripción | Pasos | Resultado Esperado |
|---------|-------------|-------|-------------------|
| `Test_ARRepo_GetById_OK` | Obtener AR existente | 1. Insertar AR directamente en BD<br>2. Llamar ARRepository.GetById(ID) | Devuelve objeto ARProyecto |
| `Test_ARRepo_GetByIdAC_OK` | Obtener ARs por AC | 1. Insertar 3 ARs para misma AC<br>2. Llamar ARRepository.GetByIdAC(ID_AC) | Colección con 3 elementos |
| `Test_ARRepo_Insert_OK` | Insertar AR válida | 1. Crear objeto ARProyecto<br>2. Llamar ARRepository.Insert(AR) | Retorna True, registro en BD |
| `Test_ARRepo_Update_OK` | Actualizar AR | 1. Insertar AR<br>2. Modificar AccionRealizada<br>3. Llamar ARRepository.Update(AR) | Retorna True, campo modificado |
| `Test_ARRepo_Delete_OK` | Eliminar AR | 1. Insertar AR<br>2. Llamar ARRepository.Delete(ID) | Retorna True, registro eliminado |

---

#### Tests ACService

| Test ID | Descripción | Pasos | Resultado Esperado |
|---------|-------------|-------|-------------------|
| `Test_ACService_Alta_OK` | Alta AC exitosa | 1. Crear ACProyecto vinculada a NC existente<br>2. Llamar ACService.Alta(AC) | Retorna True, AC en BD |
| `Test_ACService_Alta_SinNC` | Alta AC sin NC | 1. Crear AC con IDNoConformidad = ""<br>2. Llamar ACService.Alta(AC) | Retorna False, error: "No se conoce la NC/Obs" |
| `Test_ACService_Alta_SinAccion` | Alta AC sin descripción | 1. Crear AC con AccionCorrectiva = ""<br>2. Llamar ACService.Alta(AC) | Retorna False, error: "No se conoce la Acción Correctiva" |
| `Test_ACService_Alta_AccionRepetida` | Alta AC con acción duplicada | 1. Crear AC con AccionCorrectiva = "Acción 1"<br>2. Insertar otra AC con misma acción para misma NC<br>3. Llamar ACService.Alta(AC) | Retorna False, error: "Existe otra acción correctiva con el mismo nombre" |
| `Test_ACService_Modificar_OK` | Modificar AC exitosa | 1. Insertar AC<br>2. Modificar AccionCorrectiva<br>3. Llamar ACService.Modificar | Retorna True, campo modificado |
| `Test_ACService_Eliminar_OK` | Eliminar AC | 1. Insertar AC<br>2. Llamar ACService.Eliminar(ID) | Retorna True, AC eliminada |

---

#### Tests ARService

| Test ID | Descripción | Pasos | Resultado Esperado |
|---------|-------------|-------|-------------------|
| `Test_ARService_Alta_OK` | Alta AR exitosa | 1. Crear ARProyecto vinculada a AC existente<br>2. Llamar ARService.Alta(AR) | Retorna True, AR en BD |
| `Test_ARService_Alta_SinAC` | Alta AR sin AC | 1. Crear AR con IdAccionCorrectiva = ""<br>2. Llamar ARService.Alta(AR) | Retorna False, error: "No se conoce la Acción Correctiva" |
| `Test_ARService_Alta_SinAccion` | Alta AR sin descripción | 1. Crear AR con AccionRealizada = ""<br>2. Llamar ARService.Alta(AR) | Retorna False, error: "No se conoce la Acción Realizada" |
| `Test_ARService_Alta_FechaInconsistente` | Alta AR con fechas inconsistentes | 1. Crear AR con FechaFinReal pero sin FechaFinPrevista<br>2. Llamar ARService.Alta(AR) | Retorna False, error de coherencia de fechas |
| `Test_ARService_Alta_CerrarSinDocumento` | Cerrar AR sin documento | 1. Crear AR con FechaFinReal pero sin Documentos<br>2. Llamar ARService.Alta(AR) | Retorna False, error: "Para cerrar una acción hay que adjuntar una evidencia" |
| `Test_ARService_Modificar_OK` | Modificar AR exitosa | 1. Insertar AR<br>2. Modificar AccionRealizada<br>3. Llamar ARService.Modificar | Retorna True, campo modificado |
| `Test_ARService_Eliminar_OK` | Eliminar AR | 1. Insertar AR<br>2. Llamar ARService.Eliminar(ID) | Retorna True, AR eliminada |

---

#### Tests de Integración (NC → AC → AR)

| Test ID | Descripción | Pasos | Resultado Esperado |
|---------|-------------|-------|-------------------|
| `Test_Integracion_NC_AC_AR` | Crear jerarquía completa | 1. NCService.Alta(NC)<br>2. ACService.Alta(AC) vinculada a NC<br>3. ARService.Alta(AR) vinculada a AC | Los 3 registros existen y relaciones son correctas |
| `Test_Integracion_EliminarNC_EliminaACs` | Eliminar NC elimina ACs | 1. Crear NC + AC + AR<br>2. NCService.Eliminar(ID_NC, True) | AC y AR marcadas como borradas o eliminadas |
| `Test_Integracion_EliminarAC_EliminaARs` | Eliminar AC elimina ARs | 1. Crear NC + AC + AR<br>2. ACService.Eliminar(ID_AC) | AR eliminada |

---

#### Tests de Transaccionalidad

| Test ID | Descripción | Pasos | Resultado Esperado |
|---------|-------------|-------|-------------------|
| `Test_Transaccion_RollbackOnError` | Rollback al error en Insert | 1. Forzar error en Repository.Insert<br>2. Llamar Service.Alta<br>3. Verificar BD | Sin registros creados (rollback completo) |
| `Test_Transaccion_CommitOnSuccess` | Commit al éxito | 1. Llamar Service.Alta exitosa<br>2. Verificar BD | Registro creado (commit exitoso) |

---

#### Ejecución de Tests

```vba
' módulo Test_ServiceRepository.bas
Public Sub RunAllTests()
    Debug.Print "=== NCRepository Tests ==="
    Test_NCRepo_GetById_Existe
    Test_NCRepo_GetById_NoExiste
    Test_NCRepo_Insert_OK
    Test_NCRepo_Insert_Duplicado
    Test_NCRepo_Update_OK
    Test_NCRepo_Update_NoExiste
    Test_NCRepo_Delete_Logico
    Test_NCRepo_Delete_Fisico
    Test_NCRepo_GetAll
    
    Debug.Print "=== NCValidator Tests ==="
    Test_NCValidator_Alta_ExpedienteVacio
    Test_NCValidator_Alta_DescripcionVacia
    ' ... etc
    
    Debug.Print "=== NCService Tests ==="
    Test_NCService_Alta_OK
    Test_NCService_Alta_ValidationFails
    ' ... etc
    
    Debug.Print "=== ACRepository Tests ==="
    ' ... etc
    
    Debug.Print "=== ARRepository Tests ==="
    ' ... etc
    
    Debug.Print "=== ACService Tests ==="
    ' ... etc
    
    Debug.Print "=== ARService Tests ==="
    ' ... etc
    
    Debug.Print "=== Integración Tests ==="
    Test_Integracion_NC_AC_AR
    Test_Integracion_EliminarNC_EliminaACs
    Test_Integracion_EliminarAC_EliminaARs
    
    Debug.Print "=== Transacción Tests ==="
    Test_Transaccion_RollbackOnError
    Test_Transaccion_CommitOnSuccess
    
    Debug.Print "=== TESTS COMPLETADOS ==="
End Sub
```

### 5.3 Criterios de aceptación

- [ ] NCService sustituye funcionalidad de NCProyectoOperaciones
- [ ] ACService y ARService funcionan correctamente
- [ ] La integración con caché transaccional está implementada
- [ ] No se introducen regresiones
- [ ] Los formularios existentes siguen funcionando (新旧共存)
- [ ] **Tests pasan (sección 5.2): Todos los tests de NCRepository, NCValidator, NCService, ACRepository, ARRepository, ACService, ARService, Integración y Transacciones**
- [ ] **Esta spec está completada antes de iniciar Spec-015**

---

## 6. Fase 2 (Pendiente)

Los siguientes módulos NO están incluidos en esta spec y se implementarán en una fase posterior:

| Módulo | Notas |
| :--- | :--- |
| DocumentoService | CRUD para documentos de NC |
| ReplanificacionesService | CRUD para replanificaciones |
| Integración completa Auditoría | Migrar clases de Auditoría |

---

## 7. Informe de Cambios UI

**Formulario: FormNCProyecto**

Los controles visuales NO cambian. Solo el código subyacente que llama a los servicios.

---

## 8. Gaps y Decisiones

### 8.1 Gaps pre-implementación

| # | Pregunta / Gap | Responsable | Estado | Resolución |
| :--- | :--- | :--- | :--- | :--- |
| 1 | ¿Qué hacer con la integración de Riesgos dentro de NCProyectoOperaciones? | Usuario | Abierto | Pendiente |
| 2 | ¿Qué hacer con la integración de ControlEficacia dentro de NCProyectoOperaciones? | Usuario | Abierto | Pendiente |
| 3 | ¿Cómo manejar la coexistencia con formularios que aún usan *Operaciones? | Dev | Resuelto | Mantener *Operaciones pero no expandir |
| 4 | ¿Se migrarán también las clases de Auditoría? | Usuario | Abierto | Fase 2 |

---

## 9. Notas de Implementación

> **Patrón de dependencias:**
> ```
> Formulario/VM → Service → Repository
>                ↳ Validator
>                ↳ CacheNCCrud (Spec-015)
> ```
>
> **Regla de oro:** Repository NUNCA llama a Service. Service puede llamar a Repository.
>
> **Transacciones:** Solo en Service.
>
> **Integración con caché:** Los servicios deben notificar a CacheNCCrud tras cada CRUD exitoso, verificando el flag de cache (Spec-010).
>
> **Orden de implementación:** Esta spec (016) debe completarse ANTES de Spec-015.

---

## 10. Registro de Cambios de la Spec

| Versión | Fecha | Cambio |
| :--- | :--- | :--- |
| 1.0 | 2026-03-17 | Creación inicial |
| 1.1 | 2026-03-17 | Añadida integración con caché transaccional, FormNCProyecto como prueba, Fase 2 diferida, firmas detalladas de AC/AR Repository |
