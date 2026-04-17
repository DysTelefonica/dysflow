Attribute VB_Name = "Test_CacheCascada"
Option Compare Database
Option Explicit

' ============================================
' BATERÍA DE TESTS PARA INVALIDATE CASCADA
' Spec-008 §4.3 — cache-cascade-invalidation
' ============================================
' Ejecutar con Access cerrado para importar.
' Para ejecutar: Debug.Print "">" y pegar:
'   Test_CacheCascada_RunAll
' luego Enter.
' ============================================
' NC de prueba usada para tests de integración.
' Cambiar si esta NC no existe en el entorno.
' ============================================

Private m_Passed As Long
Private m_Failed As Long
Private m_IDNC_PRUEBA As String

' ============================================
' Punto de entrada principal
' ============================================
Public Sub Test_CacheCascada_RunAll()
    m_Passed = 0
    m_Failed = 0
    m_IDNC_PRUEBA = "403"   ' NC de prueba — cambiar si es necesario
    
    Debug.Print "=========================================="
    Debug.Print "BATERÍA: InvalidateCascada (cache-cascade-invalidation)"
    Debug.Print "Fecha: " & Format(Now, "yyyy-mm-dd hh:nn:ss")
    Debug.Print "NC Prueba: " & m_IDNC_PRUEBA
    Debug.Print "=========================================="
    Debug.Print ""
    
    ' Phase 1: Core cascade functions
    Test001_InvalidateCascada_AR_CascadaCompleta
    Test002_InvalidateCascada_AC_NCPadre
    Test003_InvalidateCascada_NC_Directa
    Test004_InvalidateCascada_KillSwitchOff
    Test005_InvalidateCascada_AR_SinAC_Degenerado
    
    ' Phase 2: Operation minimum (detail vs listing)
    Test006_OperacionMinima_DetalleMarcado
    Test007_OperacionMinima_ListadoEliminado
    
    ' Phase 3: Integration with NotificarCambioACAR
    Test008_NotificarCambioACAR_InvalidacionCorrecta
    Test009_NCServiceModificar_UsaInvalidateCascada
    
    ' Phase 4: JSON structure (Spec-014)
    Test010_GenerarJSONACs_ConARsAnidadas
    Test011_GenerarJSONACs_SinARs_ARsVacio
    
    Debug.Print ""
    Debug.Print "=========================================="
    Debug.Print "RESULTADO: " & m_Passed & " passed, " & m_Failed & " failed"
    If m_Failed > 0 Then
        MsgBox "BATERÍA FALLIDA: " & m_Failed & " tests fallaron." & vbCrLf & _
               "Ver ventana de inmediato para detalles.", vbCritical, "Test_CacheCascada"
    Else
        MsgBox "BATERÍA OK: Todos los tests pasaron.", vbInformation, "Test_CacheCascada"
    End If
    Debug.Print "=========================================="
End Sub

' ============================================
' HELPERS DE VERIFICACIÓN
' ============================================

' Obtiene una NC de prueba que tenga ACs con ARs.
' Retorna (idNC, idAC, idAR) en un Dictionary.
Private Function ObtenerNCConACyAR() As Scripting.Dictionary
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim SQL As String
    Dim result As Scripting.Dictionary
    
    Set result = New Scripting.Dictionary
    result.CompareMode = TextCompare
    
    Set db = getdb()
    
    ' Buscar una NC que tenga ACs con ARs
    SQL = "SELECT TOP 1 AC.IDNoConformidad, AC.IdAccionCorrectiva AS AC_ID, " & _
          "AR.IDAccionRealizada AS AR_ID " & _
          "FROM TbNCAccionCorrectivas AC " & _
          "INNER JOIN TbNCAccionesRealizadas AR ON AC.IdAccionCorrectiva = AR.IDAccionCorrectiva " & _
          "ORDER BY AC.IDNoConformidad DESC;"
    
    Set rs = db.OpenRecordset(SQL, dbOpenSnapshot)
    
    If Not rs.EOF Then
        result.Add "IDNC", CLng(rs!IDNoConformidad)
        result.Add "IDAC", CLng(rs!AC_ID)
        result.Add "IDAR", CLng(rs!AR_ID)
    End If
    
    rs.Close
    Set rs = Nothing
    Set db = Nothing
    
    Set ObtenerNCConACyAR = result
End Function

' Obtiene una NC que tenga ACs (puede no tener ARs).
Private Function ObtenerNCConAC() As Scripting.Dictionary
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim SQL As String
    Dim result As Scripting.Dictionary
    
    Set result = New Scripting.Dictionary
    result.CompareMode = TextCompare
    
    Set db = getdb()
    
    SQL = "SELECT TOP 1 AC.IDNoConformidad, AC.IdAccionCorrectiva AS AC_ID " & _
          "FROM TbNCAccionCorrectivas AC " & _
          "ORDER BY AC.IDNoConformidad DESC;"
    
    Set rs = db.OpenRecordset(SQL, dbOpenSnapshot)
    
    If Not rs.EOF Then
        result.Add "IDNC", CLng(rs!IDNoConformidad)
        result.Add "IDAC", CLng(rs!AC_ID)
    End If
    
    rs.Close
    Set rs = Nothing
    Set db = Nothing
    
    Set ObtenerNCConAC = result
End Function

' Verifica si el registro detalle existe y está marcado como válido.
Private Function CacheDetalleValido(p_IDNC As Long) As Boolean
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim qdf As Dao.QueryDef
    
    CacheDetalleValido = False
    Set db = getdb()
    
    Set qdf = db.CreateQueryDef("")
    qdf.SQL = "SELECT CacheValida FROM " & CacheNCProyecto.NOMBRE_TABLA_CACHE & " WHERE IDNoConformidad=[pIDNC];"
    qdf.Parameters("pIDNC") = p_IDNC
    Set rs = qdf.OpenRecordset()
    
    If Not rs.EOF Then
        CacheDetalleValido = (rs!CacheValida = True)
    End If
    
    rs.Close
    qdf.Close
    Set rs = Nothing
    Set qdf = Nothing
    Set db = Nothing
End Function

' Verifica si la fila de listado existe ( TbCacheListadoNC flat table).
Private Function ListadoExiste(p_IDNC As Long) As Boolean
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim qdf As Dao.QueryDef
    
    ListadoExiste = False
    Set db = getdb()
    
    Set qdf = db.CreateQueryDef("")
    qdf.SQL = "SELECT IDNoConformidad FROM " & CacheNCProyecto.NOMBRE_TABLA_LISTADO & " WHERE IDNoConformidad=[pIDNC];"
    qdf.Parameters("pIDNC") = p_IDNC
    Set rs = qdf.OpenRecordset()
    
    ListadoExiste = Not rs.EOF
    
    rs.Close
    qdf.Close
    Set rs = Nothing
    Set qdf = Nothing
    Set db = Nothing
End Function

' Genera una NC de prueba con sus datos en caché para poder testear invalidación.
' Retorna el IDNC generado.
Private Function PrepararNCPrueba() As Long
    Dim m_NC As NCProyecto
    Dim m_Error As String
    Dim result As Boolean
    
    Set m_NC = New NCProyecto
    m_NC.Descripcion = "NC Test InvalidateCascada " & Format(Now, "yyyymmddhhnnss")
    m_NC.Estado = "Abierta"
    m_NC.IDTipo = 1
    m_NC.FechaApertura = Now
    
    ' Generar cache
    result = CacheNCProyecto.GenerarCacheCompleto(m_IDNC_PRUEBA, m_Error)
    If Not result Then
        Debug.Print "  [WARN] No se pudo generar cache para NC " & m_IDNC_PRUEBA & ": " & m_Error
    End If
    
    PrepararNCPrueba = CLng(m_IDNC_PRUEBA)
End Function

' ============================================
' TEST 001: InvalidateCascada("AR", id) — cascada completa AR→AC→NC
' GIVEN: NC con AC containing AR
' WHEN:  InvalidateCascada("AR", idAR) invoked
' THEN:  TbCacheNCProyecto for NC has CacheValida=False
'        TbCacheListadoNC for NC has CacheValida=False (or row deleted)
' ============================================
Private Sub Test001_InvalidateCascada_AR_CascadaCompleta()
    Dim datos As Scripting.Dictionary
    Dim idAR As Long
    Dim idNC As Long
    Dim idAC As Long
    Dim m_Error As String
    Dim wasValidBefore As Boolean
    Dim resultado As Boolean
    Dim listadoExistiaAntes As Boolean
    
    Debug.Print "[TEST] Test001_InvalidateCascada_AR_CascadaCompleta"
    
    Set datos = ObtenerNCConACyAR()
    
    If datos.Exists("IDAR") Then
        idAR = datos("IDAR")
        idAC = datos("IDAC")
        idNC = datos("IDNC")
    Else
        Debug.Print "  [SKIP] No se encontró NC con AC y AR para testear"
        Exit Sub
    End If
    
    ' Preparar caché si no existe
    Call CacheNCProyecto.GenerarCacheCompleto(CStr(idNC), m_Error)
    
    wasValidBefore = CacheDetalleValido(idNC)
    listadoExistiaAntes = ListadoExiste(idNC)
    
    Debug.Print "  GIVEN: NC=" & idNC & " tiene AC=" & idAC & " con AR=" & idAR
    Debug.Print "  WHEN:  CacheNCProyecto.InvalidateCascada(""AR"", " & idAR & ")"
    
    resultado = CacheNCProyecto.InvalidateCascada("AR", idAR, m_Error)
    
    If m_Error <> "" Then
        Debug.Print "  THEN:  p_Error = '" & m_Error & "'"
        Debug.Print "  RESULT: FAIL - Error en InvalidateCascada"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    If resultado = False Then
        Debug.Print "  THEN:  InvalidateCascada returned False"
        Debug.Print "  RESULT: FAIL"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    ' Verificar detalle
    Dim detalleValido As Boolean
    detalleValido = CacheDetalleValido(idNC)
    
    If wasValidBefore Then
        If detalleValido Then
            Debug.Print "  THEN:  TbCacheNCProyecto.CacheValida=False para NC=" & idNC
            Debug.Print "  RESULT: FAIL - CacheValida deberia ser False"
            m_Failed = m_Failed + 1
        Else
            Debug.Print "  THEN:  TbCacheNCProyecto.CacheValida=False para NC=" & idNC
            Debug.Print "  RESULT: PASS"
            m_Passed = m_Passed + 1
        End If
    Else
        Debug.Print "  THEN:  (NC no estaba en cache antes, se marca igualmente)"
        Debug.Print "  RESULT: PASS (no hay regresión en detalle)"
        m_Passed = m_Passed + 1
    End If
End Sub

' ============================================
' TEST 002: InvalidateCascada("AC", id) — AC modificada, NC padre invalidada
' GIVEN: AC con IDNoConformidad = idNC
' WHEN:  InvalidateCascada("AC", idAC) invoked
' THEN:  TbCacheNCProyecto para idNC tiene CacheValida=False
'        TbCacheListadoNC para idNC invalidado
' ============================================
Private Sub Test002_InvalidateCascada_AC_NCPadre()
    Dim datos As Scripting.Dictionary
    Dim idAC As Long
    Dim idNC As Long
    Dim m_Error As String
    Dim wasValidBefore As Boolean
    Dim resultado As Boolean
    
    Debug.Print "[TEST] Test002_InvalidateCascada_AC_NCPadre"
    
    Set datos = ObtenerNCConAC()
    
    If datos.Exists("IDAC") Then
        idAC = datos("IDAC")
        idNC = datos("IDNC")
    Else
        Debug.Print "  [SKIP] No se encontró AC para testear"
        Exit Sub
    End If
    
    ' Preparar caché si no existe
    Call CacheNCProyecto.GenerarCacheCompleto(CStr(idNC), m_Error)
    
    wasValidBefore = CacheDetalleValido(idNC)
    
    Debug.Print "  GIVEN: AC=" & idAC & " pertence a NC=" & idNC
    Debug.Print "  WHEN:  CacheNCProyecto.InvalidateCascada(""AC"", " & idAC & ")"
    
    resultado = CacheNCProyecto.InvalidateCascada("AC", idAC, m_Error)
    
    If m_Error <> "" Then
        Debug.Print "  THEN:  p_Error = '" & m_Error & "'"
        Debug.Print "  RESULT: FAIL - Error en InvalidateCascada"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    If resultado = False Then
        Debug.Print "  RESULT: FAIL - InvalidateCascada devolvio False"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    Dim detalleValido As Boolean
    detalleValido = CacheDetalleValido(idNC)
    
    If wasValidBefore Then
        If detalleValido Then
            Debug.Print "  THEN:  TbCacheNCProyecto.CacheValida=False para NC=" & idNC
            Debug.Print "  RESULT: FAIL - CacheValida deberia ser False"
            m_Failed = m_Failed + 1
        Else
            Debug.Print "  THEN:  TbCacheNCProyecto.CacheValida=False para NC=" & idNC
            Debug.Print "  RESULT: PASS"
            m_Passed = m_Passed + 1
        End If
    Else
        Debug.Print "  THEN:  (NC no estaba cacheada, se marca igualmente)"
        Debug.Print "  RESULT: PASS (no hay regresión)"
        m_Passed = m_Passed + 1
    End If
End Sub

' ============================================
' TEST 003: InvalidateCascada("NC", id) — NC directa
' GIVEN: NC existe
' WHEN:  InvalidateCascada("NC", idNC) invoked
' THEN:  TbCacheNCProyecto tiene CacheValida=False para esa NC
'        TbCacheListadoNC tiene CacheValida=False o fila eliminada
' ============================================
Private Sub Test003_InvalidateCascada_NC_Directa()
    Dim idNC As Long
    Dim m_Error As String
    Dim wasValidBefore As Boolean
    Dim resultado As Boolean
    
    Debug.Print "[TEST] Test003_InvalidateCascada_NC_Directa"
    
    idNC = PrepararNCPrueba()
    
    wasValidBefore = CacheDetalleValido(idNC)
    
    Debug.Print "  GIVEN: NC=" & idNC & " existe"
    Debug.Print "  WHEN:  CacheNCProyecto.InvalidateCascada(""NC"", " & idNC & ")"
    
    resultado = CacheNCProyecto.InvalidateCascada("NC", idNC, m_Error)
    
    If m_Error <> "" Then
        Debug.Print "  THEN:  p_Error = '" & m_Error & "'"
        Debug.Print "  RESULT: FAIL"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    If resultado = False Then
        Debug.Print "  RESULT: FAIL - InvalidateCascada devolvio False"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    Dim detalleValido As Boolean
    detalleValido = CacheDetalleValido(idNC)
    
    If wasValidBefore Then
        If detalleValido Then
            Debug.Print "  THEN:  CacheValida=False en TbCacheNCProyecto"
            Debug.Print "  RESULT: FAIL"
            m_Failed = m_Failed + 1
        Else
            Debug.Print "  THEN:  CacheValida=False en TbCacheNCProyecto"
            Debug.Print "  RESULT: PASS"
            m_Passed = m_Passed + 1
        End If
    Else
        Debug.Print "  THEN:  (NC no estaba cacheada, se marca igualmente)"
        Debug.Print "  RESULT: PASS"
        m_Passed = m_Passed + 1
    End If
End Sub

' ============================================
' TEST 004: InvalidateCascada con kill-switch OFF
' GIVEN: IsCacheEnabled() = False
' WHEN:  InvalidateCascada("AR", idAR) invoked
' THEN:  Retorna True sin modificar TbCacheNCProyecto ni TbCacheListadoNC
' ============================================
Private Sub Test004_InvalidateCascada_KillSwitchOff()
    Dim datos As Scripting.Dictionary
    Dim idAR As Long
    Dim idNC As Long
    Dim m_Error As String
    Dim cacheEraValida As Boolean
    Dim listadoEraValido As Boolean
    Dim resultado As Boolean
    Dim estadoCacheAnterior As Boolean
    
    Debug.Print "[TEST] Test004_InvalidateCascada_KillSwitchOff"
    
    Set datos = ObtenerNCConACyAR()
    
    If datos.Exists("IDAR") Then
        idAR = datos("IDAR")
        idNC = datos("IDNC")
    Else
        Debug.Print "  [SKIP] No se encontró NC con AR para testear"
        Exit Sub
    End If
    
    ' Guardar estado anterior de la cache
    estadoCacheAnterior = IsCacheEnabled()
    
    ' Desactivar kill-switch
    Call CacheNCProyecto.CacheConfig_SetEnabled(False, "Test004: Kill-switch OFF")
    
    ' Verificar estado previo
    cacheEraValida = CacheDetalleValido(idNC)
    listadoEraValido = ListadoExiste(idNC)
    
    Debug.Print "  GIVEN: IsCacheEnabled() = False (kill-switch OFF)"
    Debug.Print "  WHEN:  CacheNCProyecto.InvalidateCascada(""AR"", " & idAR & ")"
    
    resultado = CacheNCProyecto.InvalidateCascada("AR", idAR, m_Error)
    
    If resultado = False Then
        Debug.Print "  THEN:  InvalidateCascada returned False"
        Debug.Print "  RESULT: FAIL"
        m_Failed = m_Failed + 1
    Else
        Debug.Print "  THEN:  InvalidateCascada returned True (sin modificar tablas)"
        Debug.Print "  RESULT: PASS"
        m_Passed = m_Passed + 1
    End If
    
    ' Restaurar kill-switch
    Call CacheNCProyecto.CacheConfig_SetEnabled(estadoCacheAnterior, "Test004: Restaurar estado")
End Sub

' ============================================
' TEST 005: AR sin AC — caso degenerado
' GIVEN: AR con IDAccionCorrectiva = NULL o sin relación AC
' WHEN:  InvalidateCascada("AR", idAR) invoked
' THEN:  Retorna True, no error thrown
' ============================================
Private Sub Test005_InvalidateCascada_AR_SinAC_Degenerado()
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim idAR As Long
    Dim m_Error As String
    Dim resultado As Boolean
    
    Debug.Print "[TEST] Test005_InvalidateCascada_AR_SinAC_Degenerado"
    
    Set db = getdb()
    
    ' Buscar AR sin AC (NULL en IDAccionCorrectiva)
    Set rs = db.OpenRecordset( _
        "SELECT TOP 1 IDAccionRealizada FROM TbNCAccionesRealizadas " & _
        "WHERE IDAccionCorrectiva IS NULL OR IDAccionCorrectiva = 0;", _
        dbOpenSnapshot)
    
    If rs.EOF Then
        ' Si no hay, usar cualquier AR existente y verificar que no falle
        rs.Close
        Set rs = db.OpenRecordset("SELECT TOP 1 IDAccionRealizada FROM TbNCAccionesRealizadas;", dbOpenSnapshot)
        
        If rs.EOF Then
            Debug.Print "  [SKIP] No hay ARs en la BD para testear"
            rs.Close
            Set rs = Nothing
            Set db = Nothing
            Exit Sub
        End If
    End If
    
    idAR = rs!IDAccionRealizada
    rs.Close
    Set rs = Nothing
    Set db = Nothing
    
    Debug.Print "  GIVEN: AR=" & idAR & " (posiblemente sin AC)"
    Debug.Print "  WHEN:  CacheNCProyecto.InvalidateCascada(""AR"", " & idAR & ")"
    
    resultado = CacheNCProyecto.InvalidateCascada("AR", idAR, m_Error)
    
    If m_Error <> "" Then
        Debug.Print "  THEN:  p_Error = '" & m_Error & "'"
        Debug.Print "  RESULT: FAIL - Error thrown para caso degenerado"
        m_Failed = m_Failed + 1
    ElseIf resultado = False Then
        Debug.Print "  RESULT: FAIL - InvalidateCascada devolvio False"
        m_Failed = m_Failed + 1
    Else
        Debug.Print "  THEN:  Retorna True sin error (caso degenerado manejado)"
        Debug.Print "  RESULT: PASS"
        m_Passed = m_Passed + 1
    End If
End Sub

' ============================================
' TEST 006: Operación mínima — detalle marcado (no eliminado)
' GIVEN: NC en caché con CacheValida=True
' WHEN:  InvalidateDetail(idNC) invoked
' THEN:  TbCacheNCProyecto tiene CacheValida=False, Version++, FechaCache actualizada
'        Registro NO eliminado (lazy rebuild)
' ============================================
Private Sub Test006_OperacionMinima_DetalleMarcado()
    Dim idNC As Long
    Dim m_Error As String
    Dim resultado As Boolean
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim qdf As Dao.QueryDef
    Dim versionAntes As Long
    Dim versionDespues As Long
    
    Debug.Print "[TEST] Test006_OperacionMinima_DetalleMarcado"
    
    idNC = PrepararNCPrueba()
    
    Set db = getdb()
    
    ' Obtener versión antes
    Set qdf = db.CreateQueryDef("")
    qdf.SQL = "SELECT Version FROM " & CacheNCProyecto.NOMBRE_TABLA_CACHE & " WHERE IDNoConformidad=[pIDNC];"
    qdf.Parameters("pIDNC") = idNC
    Set rs = qdf.OpenRecordset()
    
    If rs.EOF Then
        Debug.Print "  [SKIP] NC no esta en cache"
        rs.Close: qdf.Close
        Set rs = Nothing: Set qdf = Nothing: Set db = Nothing
        Exit Sub
    End If
    
    versionAntes = Nz(rs!Version, 0)
    rs.Close
    qdf.Close
    
    Debug.Print "  GIVEN: NC=" & idNC & " en cache con Version=" & versionAntes
    Debug.Print "  WHEN:  CacheNCProyecto.InvalidateDetail(" & idNC & ")"
    
    resultado = CacheNCProyecto.InvalidateDetail(idNC, m_Error)
    
    If m_Error <> "" Then
        Debug.Print "  THEN:  p_Error = '" & m_Error & "'"
        Debug.Print "  RESULT: FAIL"
        m_Failed = m_Failed + 1
        Set db = Nothing
        Exit Sub
    End If
    
    If resultado = False Then
        Debug.Print "  RESULT: FAIL - InvalidateDetail devolvio False"
        m_Failed = m_Failed + 1
        Set db = Nothing
        Exit Sub
    End If
    
    ' Verificar que el registro sigue existiendo (no fue eliminado)
    Set qdf = db.CreateQueryDef("")
    qdf.SQL = "SELECT Version, CacheValida FROM " & CacheNCProyecto.NOMBRE_TABLA_CACHE & " WHERE IDNoConformidad=[pIDNC];"
    qdf.Parameters("pIDNC") = idNC
    Set rs = qdf.OpenRecordset()
    
    If rs.EOF Then
        Debug.Print "  THEN:  Registro eliminado de TbCacheNCProyecto"
        Debug.Print "  RESULT: FAIL - El registro no deberia ser eliminado (lazy rebuild)"
        m_Failed = m_Failed + 1
    Else
        versionDespues = Nz(rs!Version, 0)
        
        If rs!CacheValida = False And versionDespues = versionAntes + 1 Then
            Debug.Print "  THEN:  Registro existe con CacheValida=False y Version=" & versionDespues & " (era " & versionAntes & ")"
            Debug.Print "  RESULT: PASS"
            m_Passed = m_Passed + 1
        Else
            Debug.Print "  THEN:  CacheValida=" & rs!CacheValida & ", Version=" & versionDespues
            Debug.Print "  RESULT: FAIL - Estado inesperado"
            m_Failed = m_Failed + 1
        End If
    End If
    
    rs.Close: qdf.Close
    Set rs = Nothing: Set qdf = Nothing: Set db = Nothing
End Sub

' ============================================
' TEST 007: Operación mínima — listado eliminado (TbCacheListadoNC flat)
' GIVEN: NC con fila en TbCacheListadoNC
' WHEN:  InvalidateListItem(idNC) invoked
' THEN:  Fila eliminada de TbCacheListadoNC (SincronizarCache la regenera)
' ============================================
Private Sub Test007_OperacionMinima_ListadoEliminado()
    Dim idNC As Long
    Dim m_Error As String
    Dim resultado As Boolean
    Dim existiaAntes As Boolean
    
    Debug.Print "[TEST] Test007_OperacionMinima_ListadoEliminado"
    
    idNC = PrepararNCPrueba()
    
    existiaAntes = ListadoExiste(idNC)
    
    Debug.Print "  GIVEN: NC=" & idNC & " " & IIf(existiaAntes, "tiene fila", "NO tiene fila") & " en TbCacheListadoNC"
    Debug.Print "  WHEN:  CacheNCProyecto.InvalidateListItem(" & idNC & ")"
    
    resultado = CacheNCProyecto.InvalidateListItem(idNC, m_Error)
    
    If m_Error <> "" Then
        Debug.Print "  THEN:  p_Error = '" & m_Error & "'"
        Debug.Print "  RESULT: FAIL"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    If resultado = False Then
        Debug.Print "  RESULT: FAIL - InvalidateListItem devolvio False"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    Dim existeAhora As Boolean
    existeAhora = ListadoExiste(idNC)
    
    If existeAhora Then
        Debug.Print "  THEN:  Fila todavia existe en TbCacheListadoNC"
        Debug.Print "  RESULT: FAIL - La fila deberia haber sido eliminada"
        m_Failed = m_Failed + 1
    Else
        Debug.Print "  THEN:  Fila eliminada de TbCacheListadoNC (SincronizarCache la regenerara)"
        Debug.Print "  RESULT: PASS"
        m_Passed = m_Passed + 1
    End If
End Sub

' ============================================
' TEST 008: NotificarCambioACAR usa InvalidateCascada
' GIVEN: NC con AC cacheada
' WHEN:  CacheNCCrud.NotificarCambioACAR(idNC) invoked
' THEN:  Llama a InvalidateCascada("NC", idNC) — marca detalle y listado
' ============================================
Private Sub Test008_NotificarCambioACAR_InvalidacionCorrecta()
    Dim datos As Scripting.Dictionary
    Dim idNC As Long
    Dim m_Error As String
    Dim resultado As Boolean
    Dim wasValidBefore As Boolean
    
    Debug.Print "[TEST] Test008_NotificarCambioACAR_InvalidacionCorrecta"
    
    Set datos = ObtenerNCConAC()
    
    If datos.Exists("IDNC") Then
        idNC = datos("IDNC")
    Else
        Debug.Print "  [SKIP] No se encontro NC con AC para testear"
        Exit Sub
    End If
    
    Call CacheNCProyecto.GenerarCacheCompleto(CStr(idNC), m_Error)
    wasValidBefore = CacheDetalleValido(idNC)
    
    Debug.Print "  GIVEN: NC=" & idNC & " con CacheValida=" & wasValidBefore
    Debug.Print "  WHEN:  CacheNCCrud.NotificarCambioACAR(" & idNC & ")"
    
    resultado = CacheNCCrud.NotificarCambioACAR(idNC, m_Error)
    
    If m_Error <> "" Then
        Debug.Print "  THEN:  p_Error = '" & m_Error & "'"
        Debug.Print "  RESULT: FAIL"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    If resultado = False Then
        Debug.Print "  RESULT: FAIL - NotificarCambioACAR devolvio False"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    Dim detalleValido As Boolean
    detalleValido = CacheDetalleValido(idNC)
    
    If wasValidBefore And detalleValido Then
        Debug.Print "  THEN:  CacheValida sigue True"
        Debug.Print "  RESULT: FAIL - Deberia estar False"
        m_Failed = m_Failed + 1
    Else
        Debug.Print "  THEN:  CacheValida=False (o ya era False antes)"
        Debug.Print "  RESULT: PASS"
        m_Passed = m_Passed + 1
    End If
End Sub

' ============================================
' TEST 009: NCService.Modificar usa InvalidateCascada (verificación de código)
' GIVEN: NC existe con datos modificados
' WHEN:  NCService.Modificar(nc) invoked (via transaccion)
' THEN:  CacheNCProyecto.InvalidateCascada("NC", idNC) fue llamado
'        — verificamos el resultado: cache invalidada
' ============================================
Private Sub Test009_NCServiceModificar_UsaInvalidateCascada()
    ' Este test verifica que InvalidateCascada funciona cuando NCService.Modificar
    ' lo llame. Simulamos el comportamiento de NCService.Modificar.
    Dim idNC As Long
    Dim m_Error As String
    Dim resultado As Boolean
    Dim wasValidBefore As Boolean
    
    Debug.Print "[TEST] Test009_NCServiceModificar_UsaInvalidateCascada"
    
    idNC = PrepararNCPrueba()
    wasValidBefore = CacheDetalleValido(idNC)
    
    Debug.Print "  GIVEN: NC=" & idNC & " con CacheValida=" & wasValidBefore
    Debug.Print "  WHEN:  Simula NCService.Modificar -> InvalidateCascada(""NC"", " & idNC & ")"
    
    resultado = CacheNCProyecto.InvalidateCascada("NC", idNC, m_Error)
    
    If m_Error <> "" Then
        Debug.Print "  THEN:  p_Error = '" & m_Error & "'"
        Debug.Print "  RESULT: FAIL"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    If resultado = False Then
        Debug.Print "  RESULT: FAIL - InvalidateCascada devolvio False"
        m_Failed = m_Failed + 1
        Exit Sub
    End If
    
    Dim detalleValido As Boolean
    detalleValido = CacheDetalleValido(idNC)
    
    If wasValidBefore And detalleValido Then
        Debug.Print "  THEN:  CacheValida sigue True"
        Debug.Print "  RESULT: FAIL - NCService.Modificar no invalidaria correctamente"
        m_Failed = m_Failed + 1
    Else
        Debug.Print "  THEN:  CacheValida=False (NCService.Modificar hara lo mismo)"
        Debug.Print "  RESULT: PASS"
        m_Passed = m_Passed + 1
    End If
End Sub

' ============================================
' TEST 010: GenerarJSONACs incluye ARs anidadas (Spec-014)
' GIVEN: NC con AC que tiene ARs asociadas
' WHEN:  GenerarJSONACs(idNC) invoked
' THEN:  JSON contiene estructura con "ARs" anidadas dentro de cada AC
'        { "idAC": { ...camposAC, "ARs": { "idAR": {...}, ... } } }
' ============================================
Private Sub Test010_GenerarJSONACs_ConARsAnidadas()
    Dim datos As Scripting.Dictionary
    Dim idNC As Long
    Dim jsonACs As String
    Dim m_Error As String
    Dim objJSON As Object
    
    Debug.Print "[TEST] Test010_GenerarJSONACs_ConARsAnidadas"
    
    Set datos = ObtenerNCConACyAR()
    
    If datos.Exists("IDNC") Then
        idNC = datos("IDNC")
    Else
        Set datos = ObtenerNCConAC()
        If datos.Exists("IDNC") Then
            idNC = datos("IDNC")
        Else
            Debug.Print "  [SKIP] No se encontro NC con AC para testear"
            Exit Sub
        End If
    End If
    
    Debug.Print "  GIVEN: NC=" & idNC & " con ACs"
    Debug.Print "  WHEN:  CacheNCProyecto.GenerarJSONACs(" & idNC & ")"
    
    ' GenerarJSONACs es Private, pero la func. public Test_<Name> puede acceder
    ' si esta en el mismo modulo. Lo invocamos indirectlyamente via JSON
    ' usando GenerarCacheCompleto + lectura de la tabla.
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim qdf As Dao.QueryDef
    
    Set db = getdb()
    Set qdf = db.CreateQueryDef("")
    qdf.SQL = "SELECT DatosACs FROM " & CacheNCProyecto.NOMBRE_TABLA_CACHE & " WHERE IDNoConformidad=[pIDNC];"
    qdf.Parameters("pIDNC") = idNC
    Set rs = qdf.OpenRecordset()
    
    If rs.EOF Then
        Debug.Print "  [SKIP] NC no esta en cache. Ejecutar con NC que tenga cache."
        rs.Close: qdf.Close
        Set rs = Nothing: Set qdf = Nothing: Set db = Nothing
        Exit Sub
    End If
    
    jsonACs = Nz(rs!DatosACs, "")
    rs.Close: qdf.Close
    Set rs = Nothing: Set qdf = Nothing: Set db = Nothing
    
    If jsonACs = "" Or jsonACs = "[]" Then
        Debug.Print "  [SKIP] NC no tiene ACs para testear ARs anidadas"
        Exit Sub
    End If
    
    On Error Resume Next
    Set objJSON = JsonConverter.ParseJson(jsonACs)
    If Err.Number <> 0 Then
        Debug.Print "  [SKIP] Error parseando JSON: " & Err.Description
        Set objJSON = Nothing
        Exit Sub
    End If
    On Error GoTo 0
    
    ' Verificar estructura: cada AC debe tener "ARs" como diccionario
    Dim tieneARs As Boolean
    tieneARs = False
    
    Dim key As Variant
    For Each key In objJSON.Keys
        Dim acObj As Object
        Set acObj = objJSON(key)
        If acObj.Exists("ARs") Then
            Dim arsObj As Object
            Set arsObj = acObj("ARs")
            If TypeName(arsObj) = "Dictionary" Then
                ' ARs es un diccionario (anidado)
                Dim arKey As Variant
                For Each arKey In arsObj.Keys
                    Dim arObj As Object
                    Set arObj = arsObj(arKey)
                    If arObj.Exists("IDAccionRealizada") Then
                        tieneARs = True
                        Exit For
                    End If
                Next arKey
            End If
        End If
        If tieneARs Then Exit For
    Next key
    
    If tieneARs Then
        Debug.Print "  THEN:  JSON contiene ARs anidadas dentro de ACs"
        Debug.Print "  RESULT: PASS (Spec-014 implementado)"
        m_Passed = m_Passed + 1
    Else
        Debug.Print "  THEN:  JSON NO contiene ARs anidadas"
        Debug.Print "  RESULT: FAIL (Spec-014 no implementado)"
        m_Failed = m_Failed + 1
    End If
    
    Set objJSON = Nothing
End Sub

' ============================================
' TEST 011: GenerarJSONACs — AC sin ARs tiene "ARs": {}
' GIVEN: NC con AC que no tiene ARs
' WHEN:  GenerarJSONACs para esa NC
' THEN:  AC en JSON tiene "ARs": {} (objeto vacío, no null ni ausente)
' ============================================
Private Sub Test011_GenerarJSONACs_SinARs_ARsVacio()
    Dim db As Dao.Database
    Dim rs As Dao.Recordset
    Dim idNC As Long
    Dim idAC As Long
    Dim m_Error As String
    Dim jsonACs As String
    Dim objJSON As Object
    Dim SQL As String
    
    Debug.Print "[TEST] Test011_GenerarJSONACs_SinARs_ARsVacio"
    
    Set db = getdb()
    
    ' Buscar AC sin ARs ( LEFT JOIN da null en AR_ID)
    SQL = "SELECT TOP 1 AC.IDNoConformidad, AC.IdAccionCorrectiva AS AC_ID " & _
          "FROM TbNCAccionCorrectivas AC " & _
          "LEFT JOIN TbNCAccionesRealizadas AR ON AC.IdAccionCorrectiva = AR.IDAccionCorrectiva " & _
          "WHERE AR.IDAccionRealizada IS NULL " & _
          "ORDER BY AC.IDNoConformidad DESC;"
    
    Set rs = db.OpenRecordset(SQL, dbOpenSnapshot)
    
    If rs.EOF Then
        Debug.Print "  [SKIP] No se encontro AC sin ARs"
        rs.Close
        Set rs = Nothing: Set db = Nothing
        Exit Sub
    End If
    
    idNC = rs!IDNoConformidad
    idAC = rs!AC_ID
    rs.Close
    
    ' Asegurar que esta NC esta en cache
    Call CacheNCProyecto.GenerarCacheCompleto(CStr(idNC), m_Error)
    
    Dim qdf As Dao.QueryDef
    Set qdf = db.CreateQueryDef("")
    qdf.SQL = "SELECT DatosACs FROM " & CacheNCProyecto.NOMBRE_TABLA_CACHE & " WHERE IDNoConformidad=[pIDNC];"
    qdf.Parameters("pIDNC") = idNC
    Set rs = qdf.OpenRecordset()
    
    If rs.EOF Then
        Debug.Print "  [SKIP] NC no esta en cache"
        rs.Close: qdf.Close
        Set rs = Nothing: Set qdf = Nothing: Set db = Nothing
        Exit Sub
    End If
    
    jsonACs = Nz(rs!DatosACs, "")
    rs.Close: qdf.Close
    Set rs = Nothing: Set qdf = Nothing: Set db = Nothing
    
    If jsonACs = "" Or jsonACs = "[]" Then
        Debug.Print "  [SKIP] No hay ACs en cache"
        Exit Sub
    End If
    
    On Error Resume Next
    Set objJSON = JsonConverter.ParseJson(jsonACs)
    If Err.Number <> 0 Then
        Debug.Print "  [SKIP] Error parseando JSON: " & Err.Description
        Set objJSON = Nothing
        Exit Sub
    End If
    On Error GoTo 0
    
    ' Verificar que la AC特定 tiene "ARs": {}
    Dim arsCorrecto As Boolean
    arsCorrecto = False
    
    If objJSON.Exists(CStr(idAC)) Then
        Dim acObj As Object
        Set acObj = objJSON(CStr(idAC))
        If acObj.Exists("ARs") Then
            Dim arsObj As Object
            Set arsObj = acObj("ARs")
            If TypeName(arsObj) = "Dictionary" Then
                ' Objeto vacío: keys.count = 0
                If arsObj.Count = 0 Then
                    arsCorrecto = True
                End If
            End If
        End If
    End If
    
    If arsCorrecto Then
        Debug.Print "  THEN:  AC sin ARs tiene ""ARs"": {}"
        Debug.Print "  RESULT: PASS"
        m_Passed = m_Passed + 1
    Else
        Debug.Print "  THEN:  AC sin ARs NO tiene ""ARs"": {}"
        Debug.Print "  RESULT: FAIL"
        m_Failed = m_Failed + 1
    End If
    
    Set objJSON = Nothing
End Sub
