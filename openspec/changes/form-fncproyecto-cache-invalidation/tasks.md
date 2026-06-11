# Tasks: form-fncproyecto-cache-invalidation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~760 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 4 chained PRs (slice1 → slice2 → slice3 → slice4) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Helpers RED (T1-T5 stub + manifest) | PR1 | Base: staging; tests compile/fail RED; ~250 lines |
| 2 | Entorno + Rebuild GREEN (T6-T7 + T1-T3 GREEN) | PR 2 | Base: PR1; green helpers + Entorno; ~200 lines |
| 3 | Handler GREEN (T8-T9 + T4-T5 GREEN) | PR 3 | Base: PR 2; handler rewrite + feedback; ~180 lines |
| 4 | Audit rename (T10 + regression) | PR 4 | Base: PR 3; rename only; ~80 lines |

---

## Slice 1 — Helpers RED (T1-T5)
Estimated lines: ~250
PR label: chained-pr-1/4

### Task 1.1: Crear módulo de tests y manifest
- **Archivo**: `src/modules/Test_NCProyectoGestionListadoHelper.bas` (NUEVO)
- **Archivo**: `tests/tests.vba.proyecto-gestion-helper.json` (NUEVO)
- **Qué**: Módulo con 5 procedimientos RED (T1-T5), manifest JSON con 5 entradas
- **Dependencias**: Ninguna
- **AC**: 5 tests compilan, fallan en assert (RED) porque `RebuildNCProyectoListadoCache` / `RefreshNCProyectoGestionCaches` no existen aún

**Test procedures** (todos con `BeginTestSession` / `m_TestingMode` / `getdb()` / `AssertEquals` / salida JSON):

| # | Procedimiento | Arrange | Act | Assert | Teardown |
|---|---------------|---------|-----|--------|----------|
| T1 | `Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic` | `CacheHabilitada=False` en `TbConfiguracion` sandbox | `RebuildNCProyectoListadoCache(0)` y `(1)` | Retorna `True`; `TbCacheListadoNC` sin filas nuevas | Reset flag |
| T2 | `Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic` | Seed: 3 filas cache `IDProyecto=100` preexistentes; 5 NCs válidas `IDProyecto=100` marker `FNCP-T2` | `RebuildNCProyectoListadoCache(0)` | Pre=3 Post=5; todas `CacheValida=True`; `FechaCache ≈ Now()`; ninguna fila preexistente sobrevive | Borrar 5 NCs + 5 cache por marker |
| T3 | `Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic` | Seed: 3 filas cache `IDProyecto=200` (1 válida + 2 `CacheValida=False`) marker `FNCP-T3` | `RebuildNCProyectoListadoCache(1)` | 1 válida intacta; 2 stale regeneradas; sin DELETE masivo | Borrar 3 cache por marker |
| T4 | `Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic` | Sandbox con `TbCacheListadoNC` sembrado + 3 NCs válidas | `RefreshNCProyectoGestionCaches` | `p_Error = ""`; cache regenerada | Borrar cache + NCs |
| T5 | `Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic` | `DROP TABLE TbCacheListadoNC` en sandbox | `RefreshNCProyectoGestionCaches` (con `On Error GoTo` interno) | `p_Error` contiene "TbCacheListadoNC"; `Err.Number` preservado | (no requiere teardown) |

**Manifest JSON** (`tests/tests.vba.proyecto-gestion-helper.json`):
```json
{
  "tests": [
    { "procedure": "Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic",        "tags": ["slice1","red","cache-off"],       "enabled": true },
    { "procedure": "Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic", "tags": ["slice1","red","rebuild-full"], "enabled": true },
    { "procedure": "Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic", "tags": ["slice1","red","rebuild-stale"], "enabled": true },
    { "procedure": "Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic",     "tags": ["slice1","red","orchestrator"],  "enabled": true },
    { "procedure": "Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic",      "tags": ["slice1","red","orchestrator-error"], "enabled": true }
  ]
}
```

### Task 1.2: Stub de `RebuildNCProyectoListadoCache` en CacheNCProyecto.bas
- **Archivo**: `src/modules/CacheNCProyecto.bas` (modificado)
- **Qué**: Función pública con firma completa, stub que retorna `False` (RED)
- **Ubicación**: Después de `SincronizarCache` (línea ~2134), adyacente a `RegenerarRegistro`
- **Dependencias**: Ninguna
- **AC**: Función existe con signatura correcta, compila, retorna `False` en todos los paths

**Firma a insertar** (después de línea 2134 de `CacheNCProyecto.bas`):
```vb
Public Function RebuildNCProyectoListadoCache( _
    Optional ByVal p_ForceInvalidation As Long = 0, _
    Optional ByRef p_Error As String _
) As Boolean
    ' STUB — RED hasta implementación completa en Slice 2
    RebuildNCProyectoListadoCache = False
End Function
```

### Task 1.3: Stub de `RefreshNCProyectoGestionCaches` en NCProyectoGestionListadoHelper.bas
- **Archivo**: `src/modules/NCProyectoGestionListadoHelper.bas` (modificado)
- **Qué**: Sub pública con firma completa, stub que no hace nada (RED)
- **Ubicación**: Al final del módulo, después de `LogFallback` (línea ~447)
- **Dependencias**: Ninguna
- **AC**: Sub existe con signatura correcta, compila, no modifica estado

**Firma a insertar** (después de línea 447 de `NCProyectoGestionListadoHelper.bas`):
```vb
Public Sub RefreshNCProyectoGestionCaches(Optional ByRef p_Error As String)
    ' STUB — RED hasta implementación completa en Slice 2
    p_Error = "Stub: RefreshNCProyectoGestionCaches no implementada"
End Sub
```

---

## Slice 2 — Entorno + GREEN (T1-T3, T6-T7)
Estimated lines: ~200
PR label: chained-pr-2/4

### Task 2.1: Implementar `RebuildNCProyectoListadoCache` completa
- **Archivo**: `src/modules/CacheNCProyecto.bas` (modificado)
- **Qué**: Implementación completa espejando `RebuildNCAuditoriaListadoCache`
- **Ubicación**: Reemplaza el stub de Task 1.2, después de `SincronizarCache` (línea ~2134)
- **Dependencias**: Task 1.2
- **AC**: Función compila, T1/T2/T3 pasan en sandbox

**Algoritmo completo** (pseudocódigo, insertar como cuerpo de la función):
```vb
Public Function RebuildNCProyectoListadoCache( _
    Optional ByVal p_ForceInvalidation As Long = 0, _
    Optional ByRef p_Error As String _
) As Boolean
    Dim db As DAO.Database
    Dim wrk As DAO.Workspace
    Dim rs As DAO.Recordset
    Dim transactionStarted As Boolean
    Dim idNC As String
    Dim errReg As String
    
    On Error GoTo EH
    p_Error = ""
    RebuildNCProyectoListadoCache = False
    transactionStarted = False
    
    Set db = getdb()
    Set wrk = DBEngine.Workspaces(0)
    
    ' Ensure schema
    EnsureCacheSchemaReadiness p_Error
    
    ' Guard: cache disabled → no-op
    If Not IsCacheEnabled() Then
        RebuildNCProyectoListadoCache = True
        Exit Function
    End If
    
    wrk.BeginTrans
    transactionStarted = True
    
    If p_ForceInvalidation = 0 Then
        ' Full delete + regen
        db.Execute "DELETE FROM "& NOMBRE_TABLA_LISTADO, dbFailOnError
        Set rs = db.OpenRecordset( _
            "SELECT ID FROM TbNoConformidades WHERE Nz(Borrado,False)=False ORDER BY ID")
        Do While Not rs.EOF
            idNC = CStr(rs!ID)
            If Not RegenerarRegistro(idNC, errReg) Then
                p_Error = "RegenerarRegistro(" & idNC & "): " & errReg
                GoTo RollbackRebuild
            End If
            rs.MoveNext
        Loop
        rs.Close
    Else
        ' Stale-only: marca stale y regenera solo esas
        db.Execute "UPDATE " & NOMBRE_TABLA_LISTADO & _
            " SET CacheValida=False, FechaCache=Now() WHERE CacheValida=False"
        Set rs = db.OpenRecordset( _
            "SELECT ID FROM TbNoConformidades WHERE Nz(Borrado,False)=False ORDER BY ID")
        Do While Not rs.EOF
            idNC = CStr(rs!ID)
            If Not RegenerarRegistro(idNC, errReg) Then
                p_Error = "RegenerarRegistro(" & idNC & "): " & errReg
                GoTo RollbackRebuild
            End If
            rs.MoveNext
        Loop
        rs.Close
    End If
    
    wrk.CommitTrans
    transactionStarted = False
    RebuildNCProyectoListadoCache = True
    Exit Function

CleanExit:
    If transactionStarted Then wrk.Rollback
    If Not rs Is Nothing Then If rs.State = adStateOpen Then rs.Close
    Set rs = Nothing
    Set wrk = Nothing
    Set db = Nothing
    Exit Function

RollbackRebuild:
    p_Error = "RebuildNCProyectoListadoCache: " & p_Error
    GoTo CleanExit

EH:
    p_Error = "RebuildNCProyectoListadoCache: " & Err.Description
    GoTo CleanExit
End Function
```

### Task 2.2: Implementar `RefreshNCProyectoGestionCaches` completa
- **Archivo**: `src/modules/NCProyectoGestionListadoHelper.bas` (modificado)
- **Qué**: Implementación completa espejando `RefreshNCAuditoriaGestionCaches`
- **Ubicación**: Reemplaza el stub de Task 1.3, después de `LogFallback` (línea ~447)
- **Dependencias**: Task 2.1
- **AC**: T4/T5 pasan

**Código a insertar** (reemplaza stub):
```vb
Public Sub RefreshNCProyectoGestionCaches(Optional ByRef p_Error As String)
    On Error GoTo errores
    p_Error = ""
    
    If Not TableExists(NOMBRE_TABLA_LISTADO) Then
        LogFallback "Cache refresh skipped: TbCacheListadoNC not available"
        Exit Sub
    End If
    
    If Not RebuildNCProyectoListadoCache(0, p_Error) Then
        Err.Raise 1000
    End If
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RefreshNCProyectoGestionCaches ha devuelto el error: " & Err.Description
    End If
End Sub
```

### Task 2.3: Agregar `InvalidateCombosCache` a Entorno.cls
- **Archivo**: `src/classes/Entorno.cls` (modificado)
- **Qué**: Método público que nulifica las 6 colecciones privadas
- **Ubicación**: Después de `Public Property Set ColTipos` (línea ~2589), antes de `Public Property Get ColAuditorias`
- **Dependencias**: Ninguna
- **AC**: Método compila, T6/T7 pasan

**Código a insertar** (después de línea 2589):
```vb
Public Sub InvalidateCombosCache()
    Set m_objColNCsProyecto = Nothing
    Set m_ObjColJuridicasDistintas = Nothing
    Set m_objColTipos = Nothing
    Set m_objColJefesProyecto = Nothing
    Set m_objColUsuariosCalidad = Nothing
    Set m_ObjColEstadosNC = Nothing
End Sub
```

### Task 2.4: Hacer T1-T3 y T6-T7 GREEN
- **Qué**: Implementación de Tasks 2.1, 2.2, 2.3 completa → todos los tests pasan
- **Dependencias**: Tasks 2.1, 2.2, 2.3
- **AC**: T1, T2, T3, T6, T7 pasan en sandbox; fixture-first, cero lucky data

---

## Slice 3 — Handler GREEN (T4, T5, T8, T9)
Estimated lines: ~180
PR label: chained-pr-3/4

### Task 3.1: Reescribir `ComandoActualizarLista_Click` en Form_FormNCProyectoGestion.cls
- **Archivo**: `src/forms/Form_FormNCProyectoGestion.cls` (modificado)
- **Qué**: Handler completo con secuencia: Hourglass → Refresh → Invalidate → EstablecerCombos → feedback lblEstado → ActualizarDatosFiltrados → ActualizarLista → SALIR
- **Ubicación**: Reemplaza líneas 446-451 del handler actual
- **Dependencias**: Tasks 2.1, 2.2, 2.3
- **AC**: Handler compila, sigue secuencia exacta del spec R4

**Código a insertar** (reemplaza líneas 446-451):
```vb
Public Sub ComandoActualizarLista_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""

    RefreshNCProyectoGestionCaches p_Error:=m_Error
    If m_Error <> "" Then Err.Raise 1000

    m_ObjEntorno.InvalidateCombosCache
    EstablecerCombos

    With Me.lblEstado
        .Caption = "Cache recargado"
        .Visible = True
    End With

    ActualizarDatosFiltrados
    ActualizarLista

    Me.lblEstado.Visible = False
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub

errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizarLista_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
```

### Task 3.2: Hacer T4, T5, T8, T9 GREEN
- **Qué**: Handler implementado → tests de secuencia y error pasan
- **Dependencias**: Task 3.1
- **AC**: T4 (Refresh éxito), T5 (Refresh error → Err.Raise), T8 (happy path con feedback lblEstado), T9 (Refresh falla → cleanup + Hourglass False) todos verdes

**Detalle de assertions T8**:
- Arrange: form abierto, 5 NCs seed marker `FNCP-T8`, `lblEstado.Visible = False`
- Act: `Forms("Form_FormNCProyectoGestion").ComandoActualizarLista_Click`
- Assert: `RefreshNCProyectoGestionCaches` OK; `m_ObjEntorno.ColNCsProyecto.Count > 0`; `lblEstado.Caption = "Cache recargado"`; `lblEstado.Visible = False` post-handler; `TbCacheListadoNC` con 5 filas
- Teardown: borrar NCs + cache por marker

**Detalle de assertions T9**:
- Arrange: `DROP TABLE TbCacheListadoNC` en sandbox, form abierto
- Act: llamada al handler
- Assert: `Err.Number = 1000` propagado; `lblEstado.Visible` sin cambios; `Hourglass = False`
- Teardown: (no requiere teardown)

---

## Slice 4 — Audit rename (T10)
Estimated lines: ~80
PR label: chained-pr-4/4

### Task 4.1: Renombrar handler en Form_FormNCAuditoriaGestion.cls
- **Archivo**: `src/forms/Form_FormNCAuditoriaGestion.cls` (modificado)
- **Qué**: Renombrar `ComandoActualizar_Click` → `ComandoActualizarLista_Click` (2 ocurrencias: firma + string de error)
- **Ubicación**: Línea 18 (firma del Sub) y línea 41 (string de mensaje de error)
- **Dependencias**: Ninguna
- **AC**: Handler renombrado, compila, T10 pasa

**Cambio1 — línea 18**:
- `OldString`: `Private Sub ComandoActualizar_Click()`
- `NewString**: `Private Sub ComandoActualizarLista_Click()`

**Cambio 2 — línea 41**:
- `OldString`: `m_Error = "Al ComandoActualizar_Click se ha producido`
- `NewString`: `m_Error = "Al ComandoActualizarLista_Click se ha producido`

### Task 4.2: Verificar mapeo de evento en Form_FormNCAuditoriaGestion.form.txt
- **Archivo**: `src/forms/Form_FormNCAuditoriaGestion.form.txt` (SOLO VERIFICACIÓN, no edición)
- **Qué**: Verificar que línea539 usa `OnClick ="[Event Procedure]"` — Access resuelve por convención `<ControlName>_Click`; el rename en cls es suficiente
- **Ubicación**: Línea 539
- **AC**: `OnClick ="[Event Procedure]"` presente; control `Name ="ComandoActualizar"` NO se renombra (fuera de scope R6)

### Task 4.3: Hacer T10 GREEN
- **Qué**: Test de rename sin regresión pasa
- **Dependencias**: Task 4.1
- **AC**: T10 pasa; `ComandoActualizar_Click` ya NO existe en el módulo; `ComandoActualizarLista_Click` existe; test audit previo (`Test_AuditListadoHelper_CacheOn_SourceContract_RED`) sigue verde

**Detalle de assertions T10**:
- Arrange: form audit abierto con backend consistente
- Act: verificar que `ComandoActualizar_Click` no existe; verificar que `ComandoActualizarLista_Click` existe; disparar click programático
- Assert: símbolo viejo no existe; símbolo nuevo existe y es disparable; form responde sin regresión
- Teardown: (ninguno)

---

## Verification Plan

### Pre-condiciones
1. `.dysflow/project.json` presente y válido con `projectId=00-no-conformidades-staging-clean`
2. `ACCESS_VBA_PASSWORD` resuelta en entorno
3. Runtime Dysflow v1.2.32+ instalado (`dysflow --version`)

### Ejecución por slice (secuencial)

```powershell
# Slice 1 — import + compilación manual + test RED
dysflow.import_modules moduleNames=["Test_NCProyectoGestionListadoHelper"] projectId="00-no-conformidades-staging-clean"
# → Usuario compila en Access VBE → Debug → Compile
dysflow.test_vba filter="slice1" projectId="00-no-conformidades-staging-clean"
# Esperar: 5 tests fallan (RED) — stubs no implementados

# Slice 2 — implementar + GREEN
dysflow.import_modules moduleNames=["CacheNCProyecto","NCProyectoGestionListadoHelper","Entorno","Test_NCProyectoGestionListadoHelper"] projectId="00-no-conformidades-staging-clean"
# → Usuario compila
dysflow.test_vba filter="slice2" projectId="00-no-conformidades-staging-clean"
# Esperar: T1,T2,T3,T6,T7 verdes

# Slice 3 — handler
dysflow.import_modules moduleNames=["Form_FormNCProyectoGestion","Test_NCProyectoGestionListadoHelper"] projectId="00-no-conformidades-staging-clean"
# → Usuario compila
dysflow.test_vba filter="slice3" projectId="00-no-conformidades-staging-clean"
# Esperar: T4,T5,T8,T9 verdes

# Slice 4 — audit rename
dysflow.import_modules moduleNames=["Form_FormNCAuditoriaGestion","Test_NCProyectoGestionListadoHelper"] projectId="00-no-conformidades-staging-clean"
# → Usuario compila
dysflow.test_vba filter="slice4" projectId="00-no-conformidades-staging-clean"
# Esperar: T10 verde

# Verificación completa
dysflow.test_vba projectId="00-no-conformidades-staging-clean"
# Esperar:10/10 verdes
```

### Verificación de feedback visual (T8 manual)
1. Abrir `Form_FormNCProyectoGestion`
2. Insertar una NC de prueba en backend sandbox
3. Click en `ComandoActualizarLista`
4. Observar `lblEstado` con caption "Cache recargado" visible durante ~1-3 segundos
5. Verificar que `lblEstado` se oculta al final del handler

### Verificación post-slices (branch reachability)
```powershell
git merge-base --is-ancestor <sha-PR1> staging
git merge-base --is-ancestor <sha-PR2> staging
git merge-base --is-ancestor <sha-PR3> staging
git merge-base --is-ancestor <sha-PR4> staging
# Todos los SHAs deben ser ancestros de staging
```

---

## Implementation Commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|--------|-----------|-----------|--------------|-------------|
| `<sha>` | Slice 1: helpers RED | T1-T5 RED stubs | `dysflow.test_vba` slice1 RED | `import_modules` + compilación manual |
| `<sha>` | Slice 2: Entorno + GREEN | T1-T3,T6-T7 GREEN | `dysflow.test_vba` slice2 GREEN | `import_modules` + compilación manual |
| `<sha>` | Slice 3: handler GREEN | T4-T5,T8-T9 GREEN | `dysflow.test_vba` slice3 GREEN | `import_modules` + compilación manual |
| `<sha>` | Slice 4: audit rename | T10 GREEN | `dysflow.test_vba` slice4 GREEN | `import_modules` + compilación manual |
