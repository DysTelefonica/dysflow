# Spec-010: Kill-Switch de Caché (Modo Seguro)

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Nueva Funcionalidad
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** Ninguna
**Specs relacionadas:** Spec-008 (Invalidación Transaccional), Spec-009 (Precalentado Manual)
**RFC origen:** RFC-001 (sección 3.7)
**Plan origen:** PLAN-002 (T-10)
**Fecha de creación:** 2026-03-15
**Fecha límite:** Sin límite
**Cierre:** Pendiente

---

## 1. Resumen Técnico

- **Problema / Necesidad:** Necesidad de poder desactivar la caché de forma inmediata en producción si algo va mal, sin necesidad de despliegue, para mantener la aplicación operativa y poder investigar el problema.
- **Solución propuesta:** Implementar un flag global `CacheEnabled` persistido en tabla de configuración, con punto único de lectura `IsCacheEnabled()` que determina si se usa la ruta de caché o la ruta directa a BD.

---

## 2. Objetivo y Alcance

### 2.1 Objetivo

Proporcionar un mecanismo de **kill-switch** para desactivar la caché de forma inmediata en producción si algo va mal, permitiendo:
- Mantener la aplicación operativa sin caché
- Investigar el problema
- Reactivar la caché de forma controlada

### 2.2 Alcance

| Incluye | Excluye |
| :--- | :--- |
| Flag global `CacheEnabled` persistido | TTL automático |
| Punto único de lectura `IsCacheEnabled()` | invalidación automática por tiempo |
| Ruta directa a BD cuando OFF | Otros módulos de caché |
| Logging de activación/desactivación | |

### 2.3 Decisiones de Diseño Mantenidas

- **Sin TTL en detalle:** El kill-switch no afecta la política de TTL (no existe)
- **Refresco manual:** Se mantiene el botón "Actualizar"
- **Coherencia cascada AR → AC → NC:** Se mantiene cuando la caché está habilitada
- **Atomicidad CRUD + operación mínima de caché:** Se mantiene solo si caché está habilitada
- **Sin TTL:** Se mantiene sin cambios
- **Refresco manual:** Se mantiene sin cambios
- **Coherencia cascada:** Se mantiene sin cambios
- **Atomicidad:** Se mantiene sin cambios

### 2.4 Precondiciones

- T-00b (migración esquema caché) completada
- Spec-003 (Cache listados) completada
- Spec-006 (GetNCProyectoVM) completada
- Spec-008 (Invalidación transaccional) completada

---

## 3. Archivos a Modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/modules/CacheNCProyecto.bas` | Modificación | Añadir `IsCacheEnabled()`, `CacheConfig_SetEnabled()`, gestión de tabla `TbConfiguracion` |
| `src/modules/constructor.bas` | Modificación | Envolver todas las operaciones de caché con `If IsCacheEnabled()` |

---

## 4. Diseño Técnico

### 4.1 Flag global CacheEnabled

**Persistencia:** Tabla `TbConfiguracion` (campo `CacheHabilitada`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| CacheHabilitada | Boolean | `True` = caché habilitada, `False` = modo seguro (sin caché) |
| FechaCambioCache | DateTime | Timestamp del último cambio |
| UsuarioCambioCache | Text | Usuario que cambió el flag |
| MotivoCambioCache | Text | Motivo del último cambio |

**Punto único de lectura:** Función `IsCacheEnabled()` en `CacheNCProyecto.bas`, que delega en `m_ObjEntorno.CacheHabilitada` (lazy property en `Entorno.cls`).

**Cadena de lectura:**
```
IsCacheEnabled()              ← CacheNCProyecto.bas
  └→ m_ObjEntorno.CacheHabilitada   ← Entorno.cls (lazy property)
        └→ SELECT CacheHabilitada FROM TbConfiguracion WHERE ID=1   ← DAO directo
```

**Código implementado:**

```vba
' CacheNCProyecto.bas — punto único de lectura
Public Function IsCacheEnabled() As Boolean
    On Error GoTo errores
    IsCacheEnabled = m_ObjEntorno.CacheHabilitada
    Exit Function
errores:
    IsCacheEnabled = False
End Function

' Entorno.cls — propiedad lazy (líneas 1331-1363)
Private m_CacheHabilitada As Boolean
Private m_CacheHabilitadaLoaded As Boolean

Public Property Get CacheHabilitada() As Boolean
    Dim rs As DAO.Recordset
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If m_CacheHabilitadaLoaded Then
        CacheHabilitada = m_CacheHabilitada
        Exit Property
    End If
    Set rs = getdb().OpenRecordset("SELECT CacheHabilitada FROM TbConfiguracion WHERE ID=1", DAO.DbOpenSnapshot)
    If Not rs.EOF Then
        m_CacheHabilitada = rs!CacheHabilitada
    Else
        m_CacheHabilitada = False
    End If
    rs.Close
    Set rs = Nothing
    m_CacheHabilitadaLoaded = True
    CacheHabilitada = m_CacheHabilitada
    Exit Property
errores:
    Set rs = Nothing
    m_Error = "El método Entorno.CacheHabilitada ha devuelto el error: " & Err.Description
    Me.Error = m_Error
    m_CacheHabilitada = False
    CacheHabilitada = False
End Property
```

**Registro en Entorno:**
- `.Add "CacheHabilitada", ""` en `ColItems` (línea ~2404)
- Caso en `getPropiedad()` (línea ~2703)

**Nota:** La property es **lazy** — solo se lee de BD en el primer acceso. Si falla, retorna `False` (no bloquea el inicio de la aplicación).

### 4.2 Comportamiento según estado del flag

| Estado | Lectura de caché | Escritura de caché | Rebuild de caché |
|--------|-----------------|-------------------|------------------|
| **ON** (`True`) | Normal: lee de `TbCacheNCProyecto` | Normal: escribe en caché | Normal: regenera al invalidar |
| **OFF** (`False`) | **NO lee**: consulta directa a BD | **NO escribe**: omite escritura | **NO ejecuta**: salta rebuild |

### 4.3 Ruta directa de datos cuando `CacheEnabled=False`

**GetNCProyectoVM (constructor.bas):**
```vba
Public Function GetNCProyectoVM(ByVal id As Long) As NCProyectoDetailVM
    If IsCacheEnabled() Then
        ' Ruta con caché
        Set GetNCProyectoVM = GetNCProyectoVM_FromCache(id)
    Else
        ' Ruta directa a BD
        Set GetNCProyectoVM = GetNCProyectoVM_FromDB(id)
    End If
End Function
```

**GetNCsFiltradosVM (constructor.bas):**
```vba
Public Function GetNCsFiltradosVM(Optional filtros As Variant) As Collection
    If IsCacheEnabled() Then
        ' Ruta con caché
        Set GetNCsFiltradosVM = GetNCsFiltradosVM_FromCache(filtros)
    Else
        ' Ruta directa a BD
        Set GetNCsFiltradosVM = GetNCsFiltradosVM_FromDB(filtros)
    End If
End Function
```

### 4.4 Función administrativa de cambio de estado

```vba
Public Function CacheConfig_SetEnabled(ByVal enabled As Boolean, Optional ByVal motivo As String = "") As Boolean
    On Error GoTo ErrorHandler
    
    Dim db As DAO.Database
    Set db = CurrentDb
    
    ' Obtener usuario actual
    Dim usuario As String
    usuario = CurrentUser()
    
    ' Verificar si existe registro de configuración
    Dim rs As DAO.Recordset
    Set rs = db.OpenRecordset("SELECT * FROM TbConfiguracion WHERE ID = 1")
    
    If rs.EOF Then
        ' Crear registro
        rs.AddNew
        rs!ID = 1
    Else
        rs.Edit
    End If
    
    rs!CacheHabilitada = enabled
    rs!FechaCambioCache = Now()
    rs!UsuarioCambioCache = usuario
    rs!MotivoCambioCache = motivo
    rs.Update
    
    rs.Close
    
    ' Logging
    Debug.Print "[" & Now() & "] CacheEnabled cambiado a " & enabled & " por " & usuario & ". Motivo: " & motivo
    
    CacheConfig_SetEnabled = True
    Exit Function
    
ErrorHandler:
    CacheConfig_SetEnabled = False
    Debug.Print "Error al cambiar CacheEnabled: " & Err.Description
End Function
```

### 4.5 Integración con invalidación transaccional

Cuando `CacheEnabled=False`:
- Las operaciones de invalidación deben ser **NOOP** (no ejecutar nada)
- No se debe intentar escribir en `TbCacheNCProyecto` ni `TbCacheListadoNC`

```vba
' En CacheNCProyecto.bas
Public Function InvalidateDetail(ByVal id As Long) As Boolean
    On Error GoTo ErrorHandler
    
    ' Si la caché está deshabilitada, no hacer nada
    If Not IsCacheEnabled() Then
        InvalidateDetail = True  ' NOOP
        Exit Function
    End If
    
    ' Continuar con invalidación normal...
End Function
```

### 4.6 Rehabilitación controlada

| Escenario | Acción |
|-----------|--------|
| Activar + rebuild manual | `CacheConfig_SetEnabled(True)` + ejecutar `PrecalentarCacheCompleto` |
| Activar sin rebuild | `CacheConfig_SetEnabled(True)` - la caché se reconstruye bajo demanda (lazy) |

### 4.7 Patrón Wrapper — NO se tocan los CRUIDs existentes

**Decisión de diseño:** Los módulos de CRUID existentes (NCProyectoOperaciones, constructor, etc.) NO se modifican. Se crea una capa de wrapper que decide si usar caché o llamar directamente a los CRUIDs originales.

**Objetivo:** Evitar regressions en la funcionalidad existente y mantener separación de responsabilidades.

#### 4.7.1 Arquitectura de wrappers

```
┌─────────────────────────────────────────────────────────────┐
│                    FORMULARIOS / UI                         │
│         (FormNCProyectoGestion, FormNCProyecto, etc.)      │
└─────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                 WRAPPER DE OPERACIONES                       │
│   NCProyectoWrapper.bas (NUEVO MÓDULO)                     │
│   - GetNCProyectoVM() → decide caché vs BD                 │
│   - GetNCsFiltradosVM() → decide caché vs BD              │
│   - SaveNC() → decide si escribe en caché                 │
│   - DeleteNC() → decide si invalida caché                  │
│                              ↓                              │
│   Si CacheEnabled = True → usa CacheNCProyecto            │
│   Si CacheEnabled = False → llama a NCProyectoOperaciones │
└─────────────────────────────────────────────────────────────┘
                               ↓
        ┌───────────────────────┴───────────────────────┐
        ↓                                               ↓
┌───────────────────────┐                 ┌───────────────────────┐
│   CACHE (NUEVO)       │                 │   CRUDs ORIGINALES    │
│   CacheNCProyecto     │                 │   NCProyectoOperaciones│
│   TbCacheNCProyecto   │                 │   (SIN MODIFICAR)     │
│   TbCacheListadoNC    │                 │                       │
└───────────────────────┘                 └───────────────────────┘
```

#### 4.7.2 Módulos wrapper a crear

| Módulo | Tipo | Responsabilidad |
|--------|------|----------------|
| `NCProyectoWrapper.bas` | Nuevo | Punto de entrada único; decide ruta caché vs BD |
| `NCProyectoCacheAdapter.bas` | Nuevo | Adapter que encapsula lectura/escritura de caché |
| `NCProyectoDirectAdapter.bas` | Nuevo | Adapter que llama a los CRUIDs originales |

#### 4.7.3 Firma del wrapper principal

```vba
' NCProyectoWrapper.bas
Option Compare Database
Option Explicit

' ============================================
' WRAPPER DE OPERACIONES — PATRÓN DECORATOR
' ============================================
' Este módulo NO modifica los CRUIDs existentes.
' Es una capa adicional que decide:
'   - Si CacheEnabled = True → usa caché (CacheNCProyecto)
'   - Si CacheEnabled = False → llama directamente a NCProyectoOperaciones
'
' La decisión es transparente para el llamador.
' ============================================

' [EXISTENTE] Referencia al módulo de caché
' [EXISTENTE] Referencia al módulo de operaciones original
' Private m_Cache As New CacheNCProyecto
' Private m_Operaciones As New NCProyectoOperaciones

' [NUEVO] GetNCProyectoVM — Punto de entrada único para obtener VM de detalle
Public Function GetNCProyectoVM(ByVal id As Long) As NCProyectoDetailVM
    On Error GoTo ErrorHandler
    
    If IsCacheEnabled() Then
        ' Ruta con caché
        Set GetNCProyectoVM = GetNCProyectoVM_FromCache(id)
    Else
        ' Ruta directa — llama al CRUID original sin tocar caché
        Set GetNCProyectoVM = GetNCProyectoVM_FromDB(id)
    End If
    
    Exit Function
    
ErrorHandler:
    ' Fallback: si falla la ruta principal, intentar la alternativa
    If IsCacheEnabled() Then
        ' Si falló caché, intentar BD directa
        Set GetNCProyectoVM = GetNCProyectoVM_FromDB(id)
    Else
        ' Si falló BD directa, intentar caché
        Set GetNCProyectoVM = GetNCProyectoVM_FromCache(id)
    End If
End Function

' [NUEVO] GetNCProyectoVM_FromDB — Llama al CRUID original
Private Function GetNCProyectoVM_FromDB(ByVal id As Long) As NCProyectoDetailVM
    On Error GoTo ErrorHandler
    
    ' [ORIGINAL] Llamada directa al constructor/operaciones original
    ' NO se usa caché aquí
    Set GetNCProyectoVM_FromDB = constructor.GetNCProyecto(id)
    
    Exit Function
    
ErrorHandler:
    GetNCProyectoVM_FromDB = Nothing
End Function

' [NUEVO] GetNCsFiltradosVM — Punto de entrada para listado filtrado
Public Function GetNCsFiltradosVM(Optional ByVal p_Codigo As String, _
                                   Optional ByVal p_Estado As String, _
                                   Optional ByVal p_Error As String) As Collection
    On Error GoTo ErrorHandler
    
    If IsCacheEnabled() Then
        ' Ruta con caché
        Set GetNCsFiltradosVM = CacheNCProyecto.GetListadoFiltradoSQL( _
            p_Codigo:=p_Codigo, _
            p_Estado:=p_Estado, _
            p_Error:=p_Error)
    Else
        ' Ruta directa — llama al SQL original sin caché
        Set GetNCsFiltradosVM = GetListadoFiltradoSQL_Direct(p_Error:=p_Error)
    End If
    
    Exit Function
    
ErrorHandler:
    Set GetNCsFiltradosVM = Nothing
    p_Error = "Error en GetNCsFiltradosVM: " & Err.Description
End Function

' [NUEVO] GetListadoFiltradoSQL_Direct — SQL directo sin caché
Private Function GetListadoFiltradoSQL_Direct(Optional ByRef p_Error As String) As Collection
    On Error GoTo ErrorHandler
    
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim col As New Collection
    
    ' [ORIGINAL] Construcción del SQL original (sin usar caché)
    sql = "SELECT * FROM TbNoConformidades WHERE 1=1"
    ' ... resto del SQL original ...
    
    Set rs = db.OpenRecordset(sql)
    Do While Not rs.EOF
        ' Crear objetos VM directamente desde BD
        Dim vm As NCProyectoListItemVM
        Set vm = New NCProyectoListItemVM
        vm.IDNoConformidad = rs!IDNoConformidad
        ' ... resto de campos ...
        col.Add vm
        rs.MoveNext
    Loop
    
    rs.Close
    Set GetListadoFiltradoSQL_Direct = col
    Exit Function
    
ErrorHandler:
    p_Error = Err.Description
    Set GetListadoFiltradoSQL_Direct = Nothing
End Function

' [NUEVO] SaveNC — Guardado (modificación de datos)
' Modo OFF: NO se toca ninguna caché
' Modo ON: Eliminar de TbCacheNCProyecto + Eliminar y regenerar TbCacheListadoNC
Public Function SaveNC(ByRef nc As NCProyecto, Optional ByRef p_Error As String) As Boolean
    On Error GoTo ErrorHandler
    
    Dim db As DAO.Database
    Set db = CurrentDb
    
    db.BeginTrans
    
    ' [ORIGINAL] Guardar en BD original
    If Not NCProyectoOperaciones.Guardar(nc, p_Error) Then
        db.Rollback
        SaveNC = False
        Exit Function
    End If
    
    ' [GESTIÓN DE CACHÉ]
    If IsCacheEnabled() Then
        ' [MODO ON] → Eliminar detalle y regenerar lista
        ' TbCacheNCProyecto: eliminar (regenera lazy al usarse)
        If Not CacheNCProyecto.DeleteDetail(nc.IDNoConformidad, p_Error) Then
            db.Rollback
            SaveNC = False
            Exit Function
        End If
        ' TbCacheListadoNC: eliminar + regenerar obligatoriamente
        If Not CacheNCProyecto.RegenerarListadoCache(nc.IDNoConformidad, p_Error) Then
            db.Rollback
            SaveNC = False
            Exit Function
        End If
    End If
    ' [MODO OFF] → NO se toca ninguna caché
    
    db.CommitTrans
    SaveNC = True
    Exit Function
    
ErrorHandler:
    db.Rollback
    SaveNC = False
    p_Error = "Error en SaveNC: " & Err.Description
End Function

' [NUEVO] DeleteNC — Eliminación de NC
' Modo OFF: NO se toca ninguna caché
' Modo ON: Eliminar de TbCacheNCProyecto + Eliminar de TbCacheListadoNC
Public Function DeleteNC(ByVal idNC As Long, Optional ByRef p_Error As String) As Boolean
    On Error GoTo ErrorHandler
    
    Dim db As DAO.Database
    Set db = CurrentDb
    
    db.BeginTrans
    
    ' [ORIGINAL] Eliminar NC de BD
    If Not NCProyectoOperaciones.Eliminar(idNC, p_Error) Then
        db.Rollback
        DeleteNC = False
        Exit Function
    End If
    
    ' [GESTIÓN DE CACHÉ]
    If IsCacheEnabled() Then
        ' [MODO ON] → Eliminar de ambas tablas
        If Not CacheNCProyecto.DeleteDetail(idNC, p_Error) Then
            db.Rollback
            DeleteNC = False
            Exit Function
        End If
        If Not CacheNCProyecto.DeleteFromListadoCache(idNC, p_Error) Then
            db.Rollback
            DeleteNC = False
            Exit Function
        End If
    End If
    ' [MODO OFF] → NO se toca ninguna caché
    
    db.CommitTrans
    DeleteNC = True
    Exit Function
    
ErrorHandler:
    db.Rollback
    DeleteNC = False
    p_Error = "Error en DeleteNC: " & Err.Description
End Function

' [NUEVO] DeleteFromListadoCache — Elimina registro de caché de listados
' Se usa en DeleteNC (siempre) para mantener coherencia
Private Function DeleteFromListadoCache(ByVal idNC As Long, Optional ByRef p_Error As String) As Boolean
    On Error GoTo ErrorHandler
    
    Dim db As DAO.Database
    Set db = CurrentDb
    
    db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC
    
    DeleteFromListadoCache = True
    Exit Function
    
ErrorHandler:
    p_Error = Err.Description
    DeleteFromListadoCache = False
End Function
```

#### 4.7.4 Reglas del patrón wrapper

1. **NUNCA modificar NCProyectoOperaciones.bas** — Se mantiene como está
2. **NUNCA modificar constructor.bas** — Se mantiene como está
3. **Los wrappers son la única capa que decide** — Formularios siempre llaman a wrapper
4. **Fallback automático** — Si una ruta falla, intentar la alternativa
5. **Gestión de caché según operación:**
   - **Modo OFF (CacheEnabled=False)**: NO se toca ninguna caché
   - **Modo ON (CacheEnabled=True)**:
     - **SaveNC**: Eliminar de TbCacheNCProyecto + Eliminar y regenerar TbCacheListadoNC
     - **DeleteNC**: Eliminar de TbCacheNCProyecto + Eliminar de TbCacheListadoNC

#### 4.7.5 Criterios de verificación del wrapper

| ID | Criterio | Validación |
|----|----------|------------|
| WRAP-1 | Los CRUIDs originales NO se modifican | Comparar hash de archivos antes/después |
| WRAP-2 | GetNCProyectoVM funciona con CacheEnabled=True | Test: retorna datos de caché |
| WRAP-3 | GetNCProyectoVM funciona con CacheEnabled=False | Test: retorna datos de BD directa |
| WRAP-4 | SaveNC con CacheEnabled=False no escribe en caché | Test: verificar tablas de caché sin cambios |
| WRAP-5 | Fallback automático funciona | Test: forzar error en una ruta y verificar que usa la otra |

---

## 5. Criterios de Aceptación Medibles

### 5.1 Funcionalidad Kill-switch

| ID | Criterio | Métrica |
| :--- | :--- | :--- |
| KS-1 | Con flag OFF la app funciona completa sin caché | `GetNCProyectoVM` devuelve datos desde BD directa |
| KS-2 | Con flag ON vuelve a usar caché | `GetNCProyectoVM` lee de `TbCacheNCProyecto` |
| KS-3 | Cambio de estado no requiere despliegue | Llamada desde Ventana Inmediato cambia el flag |
| KS-4 | Logging de cuándo/quién activó/desactivó | `Debug.Print` muestra usuario, fecha, motivo |

### 5.2 Criterio de Seguridad

| ID | Criterio | Métrica |
| :--- | :--- | :--- |
| KS-SEC-1 | Si OFF, ninguna operación de caché puede ejecutarse | Verificar que no hay writes/reads en tablas de caché |

### 5.3 Tabla de Aceptación ON vs OFF

| Operación | CacheEnabled = ON | CacheEnabled = OFF |
|-----------|-------------------|---------------------|
| `GetNCProyectoVM(id)` | Lee de `TbCacheNCProyecto` | `SELECT` directo a `TbNoConformidades` |
| `GetNCsFiltradosVM(filtros)` | Lee de `TbCacheListadoNC` | `SELECT` con filtros SQL |
| `InvalidateDetail(id)` | UPDATE `CacheValida=False` | **NOOP** (no ejecuta) |
| `InvalidateList()` | UPDATE filas afectadas | **NOOP** (no ejecuta) |
| `PrecalentarCacheCompleto` | Genera JSON en tablas | **NOOP** (no ejecuta) |
| Botón "Actualizar" | Regenera caché | Solo refresca datos desde BD |

---

## 6. Pruebas en Ventana Inmediato

### 6.1 Prueba de desactivación de caché

```vba
' 1. Verificar estado inicial
? IsCacheEnabled()
' Esperado: True

' 2. Desactivar caché (modo seguro)
? CacheConfig_SetEnabled(False, "Prueba de modo seguro")
' Esperado: True

' 3. Verificar estado
? IsCacheEnabled()
' Esperado: False

' 4. Verificar que la app funciona sin caché
' Abrir FormNCProyectoGestion y verificar que filtra correctamente
' Abrir FormNCProyecto y verificar que muestra datos (desde BD directa)
```

### 6.2 Prueba de activación de caché

```vba
' 1. Activar caché
? CacheConfig_SetEnabled(True, "Reactivación tras prueba")
' Esperado: True

' 2. Verificar estado
? IsCacheEnabled()
' Esperado: True

' 3. (Opcional) Ejecutar precalentado
' CacheNCProyecto.PrecalentarCacheCompleto
```

### 6.3 Prueba de rollback inmediato

```vba
' Para volver a OFF de forma inmediata:
? CacheConfig_SetEnabled(False, "Rollback a modo seguro")
' Esperado: True

' Verificar:
? IsCacheEnabled()
' Esperado: False
```

---

## 7. Casos Borde y No-Regresión

| Caso | Tratamiento |
| :--- | :--- |
| Error al leer tabla de configuración | Asumir `True` (caché habilitada) por seguridad |
| Error al escribir cambio de flag | Retornar `False`, no cambiar estado |
| Cambio de flag durante operación activa | La operación usa el estado inicial (no cambia a mitad) |
| Múltiples llamadas simultáneas | Cada llamada es atómica |
| Primeira vez (sin registro en TbConfiguracion) | Crear con default `True` |

---

## 8. Riesgos y Rollback

| ID | Riesgo | Prob. | Impacto | Mitigación | Rollback específico |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R-1 | Degradación de rendimiento temporal (OFF) | Alta | Medio | Esperado: modo seguro solo para emergencia | Volver a ON con `CacheConfig_SetEnabled(True)` |
| R-2 | Inconsistencia si se reactiva sin rebuild | Baja | Alto | Rebuild opcional post-activación | Ejecutar `PrecalentarCacheCompleto` |
| R-3 | Uso accidental en producción | Baja | Alto | Requiere llamada explícita, logging obligatorio | Revisar logs con `Debug.Print` |
| R-4 | Error al cambiar flag | Baja | Alto | Retornar error, no cambiar estado | Verificar返回值 |

---

## 9. Dependencias con Otras Specs

| Spec | Dependencia |
| :--- | :--- |
| Spec-003 | Cache listados debe estar implementado |
| Spec-006 | GetNCProyectoVM debe estar implementado |
| Spec-008 | Invalidación transaccional debe ser NOOP cuando OFF |
| Spec-009 | Precalentado debe ser NOOP cuando OFF |

---

## 10. Registro de Cambios

| Versión | Fecha | Autor | Descripción |
| :--- | :--- | :--- | :--- |
| 1.0 | 2026-03-15 | Arquitecto | Versión inicial |

---

## 11. Verificación en Access

### 11.1 Pruebas de Kill-switch

1. Verificar estado inicial de `IsCacheEnabled()` (debe ser `True`)
2. Desactivar caché con `CacheConfig_SetEnabled(False, "Prueba")`
3. Verificar que `IsCacheEnabled()` retorna `False`
4. Abrir `FormNCProyectoGestion` y aplicar filtros - debe funcionar
5. Abrir cualquier `FormNCProyecto` (detalle) - debe mostrar datos
6. Activar caché con `CacheConfig_SetEnabled(True, "Reactivación")`
7. Verificar que `IsCacheEnabled()` retorna `True`
8. Verificar que la app vuelve a usar caché

### 11.2 Validaciones Finales

- [ ] KS-1: Con flag OFF la app funciona completa sin caché
- [ ] KS-2: Con flag ON vuelve a usar caché
- [ ] KS-3: Cambio de estado no requiere despliegue
- [ ] KS-4: Logging de activación/desactivación funciona
- [ ] KS-SEC-1: Si OFF, ninguna operación de caché puede ejecutarse

---

## 12. Descubrimientos de Implementación (2026-03-24)

### 12.1 Propiedad `CacheHabilitada` en `Entorno.cls`

Durante la implementación se descubrió que la cadena de lectura del flag de caché pasa por el singleton `m_ObjEntorno`, siguiendo el patrón lazy existente del proyecto:

```
IsCacheEnabled()              ← CacheNCProyecto.bas (punto único)
  └→ m_ObjEntorno.CacheHabilitada   ← Entorno.cls (lazy property)
        └→ DAO.OpenRecordset("SELECT CacheHabilitada FROM TbConfiguracion WHERE ID=1")
```

**Cambios implementados:**

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `Entorno.cls` | Variables privadas `m_CacheHabilitada` + `m_CacheHabilitadaLoaded` | 113-114 |
| `Entorno.cls` | Property `CacheHabilitada` (lazy, con fallback False) | 1331-1363 |
| `Entorno.cls` | Entrada `.Add "CacheHabilitada", ""` en `ColItems` | ~2404 |
| `Entorno.cls` | Caso en `getPropiedad()` | ~2703 |
| `CacheNCProyecto.bas` | `IsCacheEnabled()` delega a `m_ObjEntorno.CacheHabilitada` | ~47-52 |

### 12.2 Tabla `TbConfiguracion` como fuente de verdad

`TbConfiguracion` es la tabla que persiste `CacheHabilitada`:

```
Tabla: TbConfiguracion (backend NoConformidades_Datos.accdb)
PK: ID (Long Integer)
Campos:
  - CacheHabilitada (Yes/No) — valor actual: False
  - FechaCambioCache (DateTime)
  - UsuarioCambioCache (Text)
  - MotivoCambioCache (Memo)
```

### 12.3 Para habilitar caché antes de pruebas

```vba
' 1. Habilitar en BD:
CurrentDb.Execute "UPDATE TbConfiguracion SET CacheHabilitada=True WHERE ID=1"

' 2. Forzar llenado de caché para NC 452:
? NCProyectoWrapper.GetNCProyectoVM(452)

' 3. Verificar que quedó cacheado:
? CacheNCProyecto.ObtenerNCConCache("452").CodigoNoConformidad
```

### 12.4 Estado de la Spec

- `IsCacheEnabled()` implementada en `CacheNCProyecto.bas` ✅
- `m_ObjEntorno.CacheHabilitada` implementada en `Entorno.cls` ✅
- Importada a Access: ✅
- Pendiente: `CacheConfig_SetEnabled(True/False, motivo)` para cambiar el flag desde código
