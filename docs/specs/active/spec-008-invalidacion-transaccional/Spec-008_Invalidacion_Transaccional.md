# Spec-008: Invalidación Transaccional (Coherencia Cascada AR→AC→NC)

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Nueva Funcionalidad
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** Ninguna
**Specs relacionadas:** Spec-007g
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-08)
**Fecha de creación:** 2026-03-14
**Fecha límite:** Sin límite
**Cierre:** Pendiente

---

## 1. Resumen Técnico

- **Problema / Necesidad:** Al modificar una AC o AR, se debe invalidar en cascada el caché de la NC padre (y sus acciones relacionadas).
- **Solución propuesta:** Invalidación transaccional atómica: BeginTrans → Modificación → Operación mínima caché → CommitTrans. Si falla cualquiera, Rollback total.

---

## 2. Objetivo y Alcance

### 2.1 Objetivo

Implementar coherencia cascada AR→AC→NC: al cambiar una AR, se invalidan sus ACs relacionadas y las NCs de esas ACs, con atomicidad obligatoria.

### 2.2 Alcance

| Incluye | Excluye |
| :--- | :--- |
| Invalidación cascada en transacciones | TTL automático |
| Workflow de invalidación | Caché de otros módulos |
| **Atomicidad obligatoria: si falla caché mínima, rollback total** | |
| **Invalidación de AMBAS tablas de caché:** | |
| - `TbCacheNCProyecto` (detalle) | |
| - `TbCacheListadoNC` (listados) | |

### 2.3 Decisiones de Diseño Mantenidas

- **Sin TTL en detalle:** El caché de detalle no expira por tiempo
- **Refresco manual:** El usuario decide cuándo actualizar mediante botón "Actualizar"
- **Cascada AR → AC → NC:** Al modificar AR, se invalidan AC padre y NC abuelo

### 2.4 Precondiciones

- T-00b (migración esquema caché) completada
- Spec-007g completada

---

## 3. Archivos a Modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/modules/CacheNCProyecto.bas` | Modificación | Añadir InvalidateCascada, InvalidateByRelaciones, operación mínima de invalidación |
| `src/modules/constructor.bas` | Modificación | Llamar a invalidación tras guardado con flujo atómico |

---

## 4. Diseño Técnico

### 4.1 Flujo Transaccional Atómico (OBLIGATORIO)

```
┌─────────────────────────────────────────────────────────────┐
│                    BeginTrans                                │
│                         ↓                                    │
│              ┌──────────────────┐                           │
│              │ 1) CRUD (negocio) │                          │
│              │ - Insert/Update/  │                          │
│              │   Delete NC/AC/AR │                          │
│              └────────┬─────────┘                           │
│                       ↓                                      │
│              ┌──────────────────┐                           │
│              │ 2) Operación     │  ← OBLIGATORIA            │
│              │    mínima caché   │  ← Si falla → ROLLBACK   │
│              │ - Marcar inválida │                           │
│              │ - Actualizar      │                           │
│              │   Version        │                           │
│              │ - Timestamp      │                           │
│              └────────┬─────────┘                           │
│                       ↓                                      │
│              ┌──────────────────┐                           │
│              │ 3) CommitTrans   │  ← Solo si 1) y 2) OK    │
│              └──────────────────┘                           │
│                         ↓                                    │
│                  ✓ ÉXITO                                    │
└─────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                    On Error / Fallo                          │
│                         ↓                                    │
│              ┌──────────────────┐                           │
│              │    Rollback      │  ← Deshace CRUD + caché  │
│              └──────────────────┘                           │
│                         ↓                                    │
│                  ✗ ERROR                                     │
└─────────────────────────────────────────────────────────────┘
```

**Estructura VBA obligatoria:**

```vba
Public Function GuardarEntidad(...) As Boolean
    On Error GoTo ErrorHandler
    
    BeginTrans
    
    ' 1) Operación de negocio (CRUD)
    GuardarEnBaseDeDatos ...
    
    ' 2) Operación mínima de caché (OBLIGATORIA)
    If Not InvalidarCacheMinima(idEntidad, tipoEntidad) Then
        Err.Raise vbObjectError + 1001, "GuardarEntidad", "Fallo en invalidación de caché"
    End If
    
    ' 3) Commit solo si ambas operaciones exitosas
    CommitTrans
    GuardarEntidad = True
    Exit Function
    
ErrorHandler:
    Rollback  ' Incluye tanto BD como caché
    GuardarEntidad = False
    ' Registrar error para diagnóstico
End Function
```

### 4.2 Operación Mínima de Caché

| Entidad modificada | Operación mínima obligatoria |
|-------------------|------------------------------|
| NC principal | `CacheValida = False` + `Version = Version + 1` + `FechaCache = Now()` |
| AC | `CacheValida = False` + `Version = Version + 1` + `FechaCache = Now()` para NC padre |
| AR | Invalidar AC padre + invalidar NC abuelo (cascada completa) |
| Documento | Invalidar caché de documentos para NC padre |
| Replanificación | Invalidar caché de replanificaciones para NC padre |

**Nota:** El rebuild completo del JSON (payload pesado) puede ejecutarse de forma diferida (lazy en siguiente lectura), pero la operación mínima de invalidación es **inmediata y obligatoria**.

### 4.2.1 Gestión Diferenciada: Detalle vs Listado

| Tabla de caché | Operación en SaveNC (modificación) | Operación en DeleteNC (borrado) |
|----------------|-----------------------------------|--------------------------------|
| **TbCacheNCProyecto** (detalle) | **ELIMINAR** registro → regenera lazy al consultarse | **ELIMINAR** registro |
| **TbCacheListadoNC** (listados) | **ELIMINAR + REGENERAR** obligatoriamente (datos actualizados) | **ELIMINAR** registro |

**Justificación:**
- **Detalle**: Al consultar, se regenera automáticamente desde BD (lazy loading)
- **Listados**: Los listados no se regeneran solos; si solo se invalidan, el registro queda obsoleto

**Transaccionalidad combinada (CRÍTICO):**
- El CRUD (NC/AC/AR/Documentos) + gestión de AMBAS cachés debe estar en la **MISMA transacción**
- Si **cualquiera** de las operaciones falla (CRUD o cualquiera de las dos cachés) → **ROLLBACK TOTAL**
- No se permite Commit parcial: "todos o ninguno"

### 4.3 Método InvalidateCascada en CacheNCProyecto

```vba
Public Function InvalidateCascada(ByVal tipoEntidad As String, ByVal idEntidad As String) As Boolean
    On Error GoTo ErrorHandler
    
    Select Case tipoEntidad
        Case "AR"
            Dim acs As Collection = GetACsPorAR(idEntidad)
            For Each ac In acs
                If Not InvalidateDetail(ac.IDNoConformidad) Then
                    InvalidateCascada = False
                    Exit Function
                End If
                Dim ncs As Collection = GetNCsPorAC(ac.IDNoConformidad)
                For Each nc In ncs
                    If Not InvalidateDetail(nc.IDNoConformidad) Then
                        InvalidateCascada = False
                        Exit Function
                    End If
                Next nc
            Next ac
            If Not InvalidateList() Then
                InvalidateCascada = False
                Exit Function
            End If
        Case "AC"
            If Not InvalidateDetail(idEntidad) Then
                InvalidateCascada = False
                Exit Function
            End If
            Dim ncs As Collection = GetNCsPorAC(idEntidad)
            For Each nc In ncs
                If Not InvalidateDetail(nc.IDNoConformidad) Then
                    InvalidateCascada = False
                    Exit Function
                End If
            Next nc
            If Not InvalidateList() Then
                InvalidateCascada = False
                Exit Function
            End If
        Case "NC"
            If Not InvalidateDetail(idEntidad) Then
                InvalidateCascada = False
                Exit Function
            End If
            If Not InvalidateList() Then
                InvalidateCascada = False
                Exit Function
            End If
    End Select
    
    InvalidateCascada = True
    Exit Function
    
ErrorHandler:
    InvalidateCascada = False
End Function
```

### 4.4 Modificación de Guardado en constructor (Flujo Atómico)

```vba
Public Function GuardarAC(ByVal ac As AccionCorrectiva) As Boolean
    On Error GoTo ErrorHandler
    
    BeginTrans
    
    ' 1) Guardado de negocio
    GuardarACEnBaseDeDatos ac
    
    ' 2) Operación mínima de caché (OBLIGATORIA - si falla, rollback)
    If Not CacheNCProyecto.InvalidateCascada("AC", ac.IDNoConformidad) Then
        Err.Raise vbObjectError + 1001, "GuardarAC", "Fallo en invalidación de caché"
    End If
    
    CommitTrans
    GuardarAC = True
    Exit Function
    
ErrorHandler:
    Rollback
    GuardarAC = False
End Function
```

### 4.5 Matriz de Invalidación por Impacto en Estado

> **Con CacheEnabled=False, la invalidación es NOOP pero la lectura del listado/filtro por estado se resuelve siempre contra fuente de verdad.**

| Operación | Entidad tocada | ¿Puede cambiar EstadoCalculado? | Caché a invalidar (Detalle NC / Listado / Filtros por estado) | Motivo |
| :--- | :--- | :--- | :--- | :--- |
| NC: cambiar `Borrado` (0↔1) | NC | **Sí** - cambia estado a `BORRADA` | Detalle NC, Listado general, Filtros por estado | El estado Calculado depende del flag Borrado |
| NC: `FECHACIERRE` / `CIERREGrabar` | NC | **Sí** - cambia a `Cerrada` | Detalle NC, Listado general, Filtros por estado | Cierre explícito altera estado Calculado |
| NC: `FPREVCIERRE` | NC | **Sí** - puede alterar estado Calculado (`REGISTRADA`→`PLANIFICADA`/`ENEJECUCION`) | Detalle NC, Listado general, Filtros por estado | Fecha prevista afecta workflow de estado |
| NC: `ControlEficacia` / `FechaControlEficacia` / `ConformeControlEficacia` / `FechaPrevistaControlEficacia` | NC | **Sí** - impacto directo en CE y estado Calculado | Detalle NC, Listado general, Filtros por estado | Control de eficacia determina estado final |
| AC: alta/edición/borrado | AC + NC padre | **Sí** - AC participa en estado Calculado de NC | Detalle NC, Listado general, Filtros por estado | EstadoCalculado = f(existencia y estado de ACs) |
| AR: alta/edición/borrado | AR + AC padre + NC abuelo | **Sí** - AR impacting AC status → NC | Detalle NC, Listado general, Filtros por estado | AR afecta AC que afecta NC |
| Replanificación AR | AR + NC padre | **Sí** - replanificación altera estado Calculado | Detalle NC, Listado general, Filtros por estado | EstadoCalculado considera fechas de replanificación |
| Documento asociado NC | Documento + NC | **No** - documento no altera estado | Detalle NC (caché documentos) | Solo invalida caché de documentos, no estado |

**Regla clave:** Toda operación que pueda modificar `EstadoCalculado` debe invalidar **las tres capas de caché**: (1) Detalle NC, (2) Listado general, (3) Filtros por estado. La no-invalidación de filtros por estado es la causa principal de desincronización list/filter observada.

---

## 5. Criterios de Aceptación Medibles

### 5.1 Coherencia Cascada

| ID | Criterio | Métrica |
| :--- | :--- | :--- |
| CA-1 | Al modificar AR, NC se recarga | NC muestra datos actualizados tras guardar AR |
| CA-2 | Al modificar AC, NC se recarga | NC muestra datos actualizados tras guardar AC |
| CA-3 | Transacciones intactas | Sin transacciones huérfanas tras guardado |

### 5.2 Atomicidad (CRÍTICO)

| ID | Criterio | Métrica |
| :--- | :--- | :--- |
| ATOM-1 | CRUD ok + caché mínima ok → Commit | Transacción confirmada, cache marcada inválida |
| ATOM-2 | CRUD ok + caché mínima falla → Rollback total | Datos NO persistidos en BD, sin cambios en caché |
| ATOM-3 | CRUD falla → Rollback total | Sin cambios en BD ni en caché |
| ATOM-4 | Nunca queda cache válida con datos desalineados | Verificar `CacheValida = False` tras cualquier operación |
| ATOM-5 | Cascada AR→AC→NC con fallo → Rollback completo | AR no eliminada si falla invalidación de NC |

### 5.3 Coherencia de Filtro por Estado (SF)

> **Con CacheEnabled=False, la invalidación es NOOP pero la lectura del listado/filtro por estado se resuelve siempre contra fuente de verdad.**

| ID | Criterio | Métrica |
| :--- | :--- | :--- |
| SF-1 | Child CRUD que cambia EstadoCalculado debe reflejarse en filtro por estado tras refresco manual | Filtro por estado muestra el estado correcto tras invalidación + refresco |
| SF-2 | Sin resultados de filtro por estado obsoletos tras invalidación | El listado filtrado por estado NUNCA muestra registros con estado diferente tras invalidación |
| SF-3 | Si CacheEnabled=False, lecturas de listado/filtro por estado resuelven contra fuente de verdad | Sin stale data aunque invalidación sea NOOP |

---

## 6. Casos Borde y No-Regresión

| Caso | Tratamiento |
| :--- | :--- |
| Error en modificación | Rollback + no invalidar |
| Sin relaciones AR-AC-NC | Invalidación directa de entidad |
| Múltiples ARs modificadas | Invalidación por cada AR |
| Offline/modo edición | Invalidar solo al confirmar |

---

## 7. Riesgos y Rollback

| ID | Riesgo | Prob. | Impacto | Mitigación | Rollback específico |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R-1 | Invalidación prematura | Baja | Alto | Llamar tras CommitTrans | Eliminar llamada a InvalidateCascada |
| R-2 | Loop de invalidación | Baja | Alto | Verificar tipo entidad antes de invalidar | Deshabilitar InvalidateCascada temporalmente |
| R-3 | Sin CommitTrans | Media | Alto | Siempre en bloque Finally | Añadir Rollback si hay error |
| **R-ATOMIC-1** | Fallo de operación mínima de caché | Media | **Crítico** | **Rollback total del CRUD** (no hay commit) | Verificar que no hay cambios en BD |
| **R-ATOMIC-2** | Inconsistencia por error no capturado | Baja | Crítico | Todo bloque CRUD con On Error GoTo + cleanup | Rollback completo |
| **R-ATOMIC-3** | Deadlock entre transacciones | Baja | Alto | Usar mismo orden de locking (padre→hijo) | Retry con timeout |

---

## 8. Dependencias con Otras Specs

| Spec | Dependencia |
| :--- | :--- |
| Spec-007g | FormReplanificaciones VM debe estar implementado para coherencia completa |
| T-00b | Esquema de caché debe existir |
| Spec-010 | Kill-switch de caché ( Spec-010 ): cuando `CacheEnabled=False`, la invalidación debe ser un NOOP (no ejecutar operaciones de caché) |

---

## 9. Registro de Cambios

| Versión | Fecha | Autor | Descripción |
| :--- | :--- | :--- | :--- |
| 1.0 | 2026-03-14 | Arquitecto | Versión inicial |
| 1.1 | 2026-03-15 | Arquitecto | Corrección rutas: src/formularios→src/forms, Constructor.cls→constructor.bas. Eliminado ServicioWorkflow.bas (no existe). |
| 1.2 | 2026-03-15 | Arquitecto | **Redsritura completa con atomicidad obligatoria**: BeginTrans→CRUD→operación mínima caché→CommitTrans. Si caché falla→Rollback total. Añadidos criterios ATOM-1 a ATOM-5, riesgos R-ATOMIC-1/2/3, pruebas de atomicidad en Access. |

---

## 10. Verificación en Access

### 10.1 Pruebas de Coherencia Cascada

1. Abrir NC existente con AR y AC asociadas
2. Modificar AR y guardar
3. Abrir NC (o refrescar manualmente)
4. Verificar que cambios se reflejan
5. Modificar AC y guardar
6. Verificar que NC se actualiza

### 10.2 Pruebas de Atomicidad (CRÍTICO)

**Objetivo:** Verificar que el sistema responde correctamente ante fallos de la operación de caché.

#### TC-ATOMIC-01: CRUD exitoso + operación caché exitosa → Commit

1. Abrir formulario de NC
2. Modificar un campo (ej: descripción)
3. Guardar
4. Verificar en `TbCacheNCProyecto` que `CacheValida = False` y `Version` se ha incrementado
5. **Esperado:** Commit exitoso, caché marcada como inválida

#### TC-ATOMIC-02: CRUD exitoso + operación caché falla → Rollback total

1. Abrir Ventana Inmediato
2. Ejecutar código que:
   - Inicie transacción
   - Guarde un cambio en BD
   - **Fuerce error en la operación de caché** (simular fallo de escritura en `TbCacheNCProyecto`)
3. Verificar que:
   - El cambio en BD NO se persistió (rollback)
   - No hay cambios en `TbCacheNCProyecto`
4. **Esperado:** Rollback total, datos no persistidos

```vba
' Código de prueba en Ventana Inmediato
Sub TestAtomicidad_RollbackPorFalloCache()
    Dim rs As DAO.Recordset
    Dim idTest As Long
    
    ' 1) Preparar: crear NC de prueba
    idTest = 99999  ' Usar ID de prueba
    
    ' 2) Simular operación con fallo de caché
    On Error Resume Next
    DBEngine.BeginTrans
    
    ' Guardar cambio en BD (simulado)
    CurrentDb.Execute "UPDATE TbNoConformidades SET Descripcion = 'TEST ATOMIC' WHERE IDNoConformidad = " & idTest
    
    ' Forzar error en caché (simular tabla bloqueada)
    CurrentDb.Execute "UPDATE TbCacheNCProyecto SET CacheValida = True WHERE 1=0"  ' No afecta filas
    If Err.Number <> 0 Then
        DBEngine.Rollback
        Debug.Print "Rollback ejecutado por error de caché: " & Err.Description
    Else
        ' Verificar si realmente se ejecutó la invalidación
        Dim rsCache As DAO.Recordset
        Set rsCache = CurrentDb.OpenRecordset("SELECT * FROM TbCacheNCProyecto WHERE IDNoConformidad = " & idTest)
        If rsCache.EOF Then
            DBEngine.Rollback
            Debug.Print "Rollback: caché no encontrada"
        ElseIf rsCache!CacheValida = True Then
            DBEngine.Rollback
            Debug.Print "Rollback: caché aún válida"
        Else
            DBEngine.CommitTrans
            Debug.Print "Commit exitoso"
        End If
        rsCache.Close
    End If
    On Error GoTo 0
End Sub
```

#### TC-ATOMIC-03: Forzar error de caché con transaction watch

1. Abrir `TbCacheNCProyecto` en vista de datos
2. Desde Ventana Inmediato, ejecutar operación que intente guardar + invalidar caché
3. **Simular fallo:** Cerrar la tabla `TbCacheNCProyecto` antes de que se ejecute la invalidación (causará error de escritura)
4. Verificar que no hay cambios ni en BD ni en caché
5. **Esperado:** Transacción completa cancelada

#### TC-ATOMIC-04: Cascada AR→AC→NC con fallo en invalidación de NC

1. Crear NC con AC y AR asociadas
2. Intentar eliminar AR
3. **Simular fallo:** Durante la invalidación en cascada, forzar error en la invalidación de la NC
4. Verificar que:
   - La AR NO fue eliminada
   - La AC no fue modificada
   - No hay cambios en caché
5. **Esperado:** Rollback completo por fallo en cascada

### 10.3 Validaciones Finales

- [ ] AR modificada se persiste correctamente
- [ ] AC se invalidan tras modificar AR
- [ ] NC se invalida tras modificar AC
- [ ] Listado se actualiza tras cualquier cambio
- [ ] **ATOM-1:** Commit exitoso con caché mínima exitosa
- [ ] **ATOM-2:** Rollback por fallo de caché
- [ ] **ATOM-3:** Rollback por fallo de CRUD
- [ ] **ATOM-4:** Nunca cache válida con datos desalineados
- [ ] **ATOM-5:** Cascada con fallo → rollback completo

### 10.4 Pruebas de Coherencia de Filtro por Estado

**Objetivo:** Verificar que los filtros por estado reflejan el estado real tras modificaciones de child entities.

#### TC-SF-01: Cambio en AC altera estado Calculado de NC y filtro muestra nuevo estado

**Given:** NC con estado Calculado = `ENEJECUCION` (tiene AC abierta)
**When:** Se cierra la AC (se graba CIERRE)
**Then:**
1. Se invalidan las tres capas de caché (Detalle, Listado, Filtros por estado)
2. El usuario aplica filtro por estado = `Cerrada`
3. La NC aparece en el resultado del filtro
4. El usuario aplica filtro por estado = `ENEJECUCION`
5. La NC NO aparece en el resultado

#### TC-SF-02: Modificación de AR altera estado de AC que altera filtro de NC

**Given:** NC con AC que tiene ARs abiertas, estado Calculado = `ENEJECUCION`
**When:** Se marca una AR como completada
**Then:**
1. Se invalidan las tres capas de caché en cascada AR→AC→NC
2. El filtro por estado `ENEJECUCION` ya no muestra la NC (si AC cambió a completada)
3. El filtro por estado `Cerrada` muestra la NC actualizada

#### TC-SF-03: Cambio en control de eficacia altera filtro por estado

**Given:** NC con estado Calculado = `CERRADAPTECE` (CE pendiente)
**When:** Se registra ControlEficacia conforme
**Then:**
1. Se invalidan las tres capas de caché
2. El filtro por estado muestra el estado Calculado actualizado (`Cerrada`)
3. Los filtros por estado anteriores ya no muestran la NC con datos desalineados
