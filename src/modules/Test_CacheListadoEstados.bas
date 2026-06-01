Attribute VB_Name = "Test_CacheListadoEstados"
Option Compare Database
Option Explicit

' ============================================
' MÓDULO DE TEST — CACHE LISTADO ESTADOS / NOTAS
' ============================================
' Test scenarios:
'   1. RegistrarNota actualiza TbCacheListadoNC.Notas inmediatamente
'   2. EliminarNota limpia TbCacheListadoNC.Notas inmediatamente
'   3. ReconstruirListadoEstados regenera fila stale existente en TbCacheListadoNC
'   4. ReconstruirListadoEstados hace upsert de NC activa faltante en TbCacheListadoNC
'
' Fixture strategy: fixture-first, sandbox local, teardown idempotente.
' Rango TEST_ID_BASE = 900000. Estos tests usan TEST_ID_NC_LISTADO = 900010+.
' ============================================

Private Const TEST_ID_NC_BASE As Long = 900010
' Tests 1-2 comparten la misma NC para verificar nota/add y nota/clear
Private Const TEST_ID_NC_NOTA As Long = TEST_ID_NC_BASE + 1
' Test 3: NC stale en cache listado
Private Const TEST_ID_NC_STALE As Long = TEST_ID_NC_BASE + 2
' Test 4: NC que NO existe en cache listado (falta/upsert)
Private Const TEST_ID_NC_MISSING As Long = TEST_ID_NC_BASE + 3

' ============================================
' TEST 1 — RegistrarNota sincroniza Notas en cache listado
' ============================================
Public Function Test_CacheListado_RegistrarNota_Sincroniza_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim ops As NCProyectoOperaciones
    Dim nc As NCProyecto
    Dim idNC As Long
    Dim notasOriginal As String
    Dim notasNueva As String
    Dim notasCacheAfter As String
    Dim cacheRowsBefore As Long
    Dim cacheRowsAfter As Long
    Dim assertError As String
    Dim sessionErr As String
    Dim opErr As String
    Dim ok As Boolean
    Dim previousUser As usuario

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheListado_RegistrarNota_Sincroniza_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If
    Set db = getdb()

    idNC = TEST_ID_NC_NOTA
    notasOriginal = ""
    notasNueva = "Nota de prueba sincronizacion cache " & CStr(idNC)

    ' Arrange: limpiar fixture del test previo
    CleanupListadoTestFixture db, idNC, logs

    ' Arrange: asegurar NC fixture con Notas inicial vacío
    If Not EnsureNCListadoFixture(db, idNC, "Fixture cache listado notas " & CStr(idNC), opErr, notasOriginal) Then GoTo Fail
    TestHelper.AddLog logs, "Arrange: fixture NC=" & idNC & " con Notas='' insertado"

    ' Arrange: forzar sync de listado para que la NC esté en cache
    ok = SyncListadoForNC(db, idNC, opErr)
    If Not ok Then GoTo Fail
    TestHelper.AddLog logs, "Arrange: SyncListadoForNC ejecutada para NC=" & idNC

    ' Verify precondición: NC existe en TbCacheListadoNC
    cacheRowsBefore = CountRowsBySql(db, "SELECT COUNT(*) FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC & " AND CacheValida = True")
    Call TestHelper.AssertTrue(cacheRowsBefore >= 1, "Precondición: NC debe existir en TbCacheListadoNC antes del test", logs, assertError)
    If assertError <> "" Then GoTo Fail

    ' Act: usar NCProyectoOperaciones.RegistrarNota para cambiar Notas
    Set nc = New NCProyecto
    Set ops = New NCProyectoOperaciones
    Set ops.nc = nc
    ops.nc.IDNoConformidad = CStr(idNC)
    ops.nc.Notas = notasNueva
    Set previousUser = m_ObjUsuarioConectado
    Set m_ObjUsuarioConectado = CacheListado_TestUsuario("QA Cache Listado")

    opErr = ""
    Call ops.RegistrarNota(opErr)
    Call TestHelper.AssertTrue(opErr = "", "RegistrarNota debe ejecutarse sin error. opErr=" & opErr, logs, assertError)
    If assertError <> "" Then GoTo Fail

    ' Assert: TbCacheListadoNC.Notas refleja el valor nuevo inmediatamente
    notasCacheAfter = GetNotasFromCacheListado(db, idNC)
    cacheRowsAfter = CountRowsBySql(db, "SELECT COUNT(*) FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC & " AND CacheValida = True")
    Call TestHelper.AssertTrue(cacheRowsAfter = 1, "TbCacheListadoNC debe tener exactamente un registro válido post-RegistrarNota", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(notasCacheAfter = notasNueva, "TbCacheListadoNC.Notas debe ser '" & notasNueva & "' pero es '" & notasCacheAfter & "'", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_CacheListado_RegistrarNota_Sincroniza_Atomic = TestHelper.BuildJsonOk(logs, notasCacheAfter)
    GoTo Cleanup

Fail:
    Test_CacheListado_RegistrarNota_Sincroniza_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CacheListado_RegistrarNota_Sincroniza_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set m_ObjUsuarioConectado = previousUser
    If Not db Is Nothing Then Call CleanupListadoTestFixture(db, TEST_ID_NC_NOTA, logs)
    Call TestHelper.EndTestSession(logs)
    Set ops = Nothing
    Set nc = Nothing
    Set db = Nothing
End Function

' ============================================
' TEST 2 — EliminarNota limpia Notas en cache listado
' ============================================
Public Function Test_CacheListado_EliminarNota_Limpia_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim ops As NCProyectoOperaciones
    Dim nc As NCProyecto
    Dim idNC As Long
    Dim notasPrevias As String
    Dim notasCacheAfter As String
    Dim cacheRowsBefore As Long
    Dim cacheRowsAfter As Long
    Dim assertError As String
    Dim sessionErr As String
    Dim opErr As String
    Dim ok As Boolean
    Dim previousUser As usuario

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheListado_EliminarNota_Limpia_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If
    Set db = getdb()

    idNC = TEST_ID_NC_NOTA
    notasPrevias = "Nota previa para test de eliminacion " & CStr(idNC)

    ' Arrange: limpiar fixture del test previo
    CleanupListadoTestFixture db, idNC, logs

    ' Arrange: NC fixture con Notas preexistentes
    If Not EnsureNCListadoFixture(db, idNC, "Fixture cache listado eliminar nota " & CStr(idNC), opErr, notasPrevias) Then GoTo Fail
    TestHelper.AddLog logs, "Arrange: fixture NC=" & idNC & " con Notas='" & notasPrevias & "'"

    ' Arrange: sync listado para que esté en cache con las Notas previas
    ok = SyncListadoForNC(db, idNC, opErr)
    If Not ok Then GoTo Fail

    ' Verify precondición: NC en cache con Notas = notasPrevias
    notasCacheAfter = GetNotasFromCacheListado(db, idNC)
    Call TestHelper.AssertTrue(notasCacheAfter = notasPrevias, "Precondición: cache listado debe tener Notas='" & notasPrevias & "'", logs, assertError)
    If assertError <> "" Then GoTo Fail

    ' Act: usar NCProyectoOperaciones.EliminarNota
    Set nc = New NCProyecto
    Set ops = New NCProyectoOperaciones
    Set ops.nc = nc
    ops.nc.IDNoConformidad = CStr(idNC)
    ops.nc.Notas = ""  ' EliminarNota requiere que nc.Notas = ""
    Set previousUser = m_ObjUsuarioConectado
    Set m_ObjUsuarioConectado = CacheListado_TestUsuario("QA Cache Listado")

    opErr = ""
    Call ops.EliminarNota(opErr)
    Call TestHelper.AssertTrue(opErr = "", "EliminarNota debe ejecutarse sin error. opErr=" & opErr, logs, assertError)
    If assertError <> "" Then GoTo Fail

    ' Assert: TbCacheListadoNC.Notas debe ser vacío/NULL después de eliminar
    notasCacheAfter = GetNotasFromCacheListado(db, idNC)
    cacheRowsAfter = CountRowsBySql(db, "SELECT COUNT(*) FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC & " AND CacheValida = True")
    Call TestHelper.AssertTrue(cacheRowsAfter = 1, "TbCacheListadoNC debe tener exactamente un registro válido post-EliminarNota", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(notasCacheAfter = "" Or IsNull(notasCacheAfter), "TbCacheListadoNC.Notas debe ser vacío/NULL tras EliminarNota, pero es '" & Nz(notasCacheAfter, "NULL") & "'", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_CacheListado_EliminarNota_Limpia_Atomic = TestHelper.BuildJsonOk(logs, "cleared")
    GoTo Cleanup

Fail:
    Test_CacheListado_EliminarNota_Limpia_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CacheListado_EliminarNota_Limpia_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set m_ObjUsuarioConectado = previousUser
    If Not db Is Nothing Then Call CleanupListadoTestFixture(db, TEST_ID_NC_NOTA, logs)
    Call TestHelper.EndTestSession(logs)
    Set ops = Nothing
    Set nc = Nothing
    Set db = Nothing
End Function

' ============================================
' TEST 3 — ReconstruirListadoEstados regenera fila stale
' ============================================
Public Function Test_CacheListado_Reconstruir_RegeneraStale_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idNC As Long
    Dim descOriginal As String
    Dim descStaleValue As String
    Dim descAfterRebuild As String
    Dim cacheRowsBefore As Long
    Dim cacheRowsAfter As Long
    Dim assertError As String
    Dim sessionErr As String
    Dim opErr As String
    Dim ok As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheListado_Reconstruir_RegeneraStale_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If
    Set db = getdb()

    idNC = TEST_ID_NC_STALE
    descOriginal = "Desc rebuild stale original " & CStr(idNC)
    descStaleValue = "Desc stale corrupta " & CStr(idNC)

    ' Arrange: limpiar fixture stale
    CleanupListadoTestFixture db, idNC, logs

    ' Arrange: NC fixture en TbNoConformidades
    If Not EnsureNCListadoFixture(db, idNC, descOriginal, opErr) Then GoTo Fail

    ' Arrange: sync listado y verificar que se inserts
    ok = SyncListadoForNC(db, idNC, opErr)
    If Not ok Then GoTo Fail

    ' Verify precondición: NC tiene cache válido
    cacheRowsBefore = CountRowsBySql(db, "SELECT COUNT(*) FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC & " AND CacheValida = True")
    Call TestHelper.AssertTrue(cacheRowsBefore = 1, "Precondición: NC debe tener cache válido en TbCacheListadoNC", logs, assertError)
    If assertError <> "" Then GoTo Fail

    ' Arrange: corromper el cache listado con un valor stale (desc diferente)
    db.Execute "UPDATE TbCacheListadoNC SET Descripcion='" & Replace$(descStaleValue, "'", "''") & "' WHERE IDNoConformidad=" & idNC, dbFailOnError
    TestHelper.AddLog logs, "Arrange: cache listado corrupto con Descripcion='" & descStaleValue & "'"

    ' Verify: el cache ahora tiene el valor stale
    descAfterRebuild = GetDescripcionFromCacheListado(db, idNC)
    Call TestHelper.AssertTrue(descAfterRebuild = descStaleValue, "Precondición corrupta: cache debe tener Descripcion stale", logs, assertError)
    If assertError <> "" Then GoTo Fail

    ' Act: ejecutar ReconstruirListadoEstados (regenera todos los activos, incluido este stale)
    opErr = ""
    ok = CacheNCProyecto.ReconstruirListadoEstados(opErr)
    Call TestHelper.AssertTrue(ok, "ReconstruirListadoEstados debe ejecutarse sin error para NC stale", logs, assertError)
    If assertError <> "" Then GoTo Fail

    ' Assert: TbCacheListadoNC.Descripcion debe volver al valor real de TbNoConformidades
    descAfterRebuild = GetDescripcionFromCacheListado(db, idNC)
    cacheRowsAfter = CountRowsBySql(db, "SELECT COUNT(*) FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC & " AND CacheValida = True")
    Call TestHelper.AssertTrue(cacheRowsAfter = 1, "TbCacheListadoNC debe mantener un registro válido post-rebuild", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(descAfterRebuild = descOriginal, "TbCacheListadoNC.Descripcion debe ser '" & descOriginal & "' pero es '" & descAfterRebuild & "'", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_CacheListado_Reconstruir_RegeneraStale_Atomic = TestHelper.BuildJsonOk(logs, descAfterRebuild)
    GoTo Cleanup

Fail:
    Test_CacheListado_Reconstruir_RegeneraStale_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CacheListado_Reconstruir_RegeneraStale_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupListadoTestFixture db, TEST_ID_NC_STALE, logs
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
End Function

' ============================================
' TEST 4 — ReconstruirListadoEstados hace upsert de NC faltante
' ============================================
Public Function Test_CacheListado_Reconstruir_UpsertFaltante_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idNC As Long
    Dim descOriginal As String
    Dim descCacheAfter As String
    Dim cacheRowsBefore As Long
    Dim cacheRowsAfter As Long
    Dim assertError As String
    Dim sessionErr As String
    Dim opErr As String
    Dim ok As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheListado_Reconstruir_UpsertFaltante_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If
    Set db = getdb()

    idNC = TEST_ID_NC_MISSING
    descOriginal = "Desc upsert faltante " & CStr(idNC)

    ' Arrange: limpiar fixture faltante de cache y de fuente
    CleanupListadoTestFixture db, idNC, logs

    ' Arrange: eliminar anche del cache de listado para simular NC faltante
    db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC, dbFailOnError
    TestHelper.AddLog logs, "Arrange: TbCacheListadoNC limpia para NC=" & idNC & " (simula NC faltante en cache)"

    ' Arrange: NC fixture en TbNoConformidades
    If Not EnsureNCListadoFixture(db, idNC, descOriginal, opErr) Then GoTo Fail

    ' Verify precondición: NC existe en fuenteTbNoConformidades pero NO en cache listado
    cacheRowsBefore = CountRowsBySql(db, "SELECT COUNT(*) FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC)
    Call TestHelper.AssertTrue(cacheRowsBefore = 0, "Precondición: NC debe existir en TbNoConformidades pero NO en TbCacheListadoNC", logs, assertError)
    If assertError <> "" Then GoTo Fail

    ' Act: ejecutar ReconstruirListadoEstados para que inserte la NC activa faltante
    opErr = ""
    ok = CacheNCProyecto.ReconstruirListadoEstados(opErr)
    Call TestHelper.AssertTrue(ok, "ReconstruirListadoEstados debe ejecutarse sin error para NC faltante", logs, assertError)
    If assertError <> "" Then GoTo Fail

    ' Assert: TbCacheListadoNC debe contener la NC ahora (upsert/insert)
    cacheRowsAfter = CountRowsBySql(db, "SELECT COUNT(*) FROM TbCacheListadoNC WHERE IDNoConformidad = " & idNC & " AND CacheValida = True")
    Call TestHelper.AssertTrue(cacheRowsAfter = 1, "TbCacheListadoNC debe tener exactamente un registro para la NC upsertada", logs, assertError)
    If assertError <> "" Then GoTo Fail

    ' Assert: Descripcion debe coincidir con la fuente
    descCacheAfter = GetDescripcionFromCacheListado(db, idNC)
    Call TestHelper.AssertTrue(descCacheAfter = descOriginal, "TbCacheListadoNC.Descripcion debe ser '" & descOriginal & "' pero es '" & descCacheAfter & "'", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_CacheListado_Reconstruir_UpsertFaltante_Atomic = TestHelper.BuildJsonOk(logs, CStr(cacheRowsAfter))
    GoTo Cleanup

Fail:
    Test_CacheListado_Reconstruir_UpsertFaltante_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CacheListado_Reconstruir_UpsertFaltante_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupListadoTestFixture db, TEST_ID_NC_MISSING, logs
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
End Function

' ============================================
' HELPERS PRIVADOS — FIXTURE / SETUP / TEARDOWN
' ============================================

' Asegura NC fixture en TbNoConformidades para los tests de cache listado.
' Si la NC ya existe la limpia primero.
' Replica el patrón de EnsureCacheTestNCFixture del módulo Test_E2E_BateriaNC.
Private Function EnsureNCListadoFixture(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByVal p_Descripcion As String, ByRef p_Error As String, Optional ByVal p_Notas As String = "") As Boolean
    On Error GoTo EH

    Dim sqlDelete As String
    Dim sqlInsert As String
    Dim fixtureRows As Long

    EnsureNCListadoFixture = False
    p_Error = ""

    ' Cleanup por si había residuo del test anterior
    sqlDelete = "DELETE FROM TbNoConformidades WHERE IDNoConformidad = " & p_IDNC
    p_Db.Execute sqlDelete, dbFailOnError

    ' Insert fixture NC con Descripcion (se usa como proxy para verificar sincronización de cache)
    sqlInsert = "INSERT INTO TbNoConformidades (IDNoConformidad, CodigoNoConformidad, EXPEDIENTE, PROYECTO, DESCRIPCION, Notas, CAUSA, FECHAAPERTURA, TIPO, RequiereControlEficacia, MotivoNoRequiereControlEficacia, Borrado) " & _
                "VALUES (" & p_IDNC & ", " & TestHelper.SqlText("CACHE-LIST-" & CStr(p_IDNC)) & ", " & TestHelper.SqlText("EXP-TEST") & ", " & TestHelper.SqlText("PROY-TEST") & ", " & TestHelper.SqlText(p_Descripcion) & ", " & TestHelper.SqlText(p_Notas) & ", " & TestHelper.SqlText("Causa test cache") & ", Date(), " & TestHelper.SqlText("Proyecto") & ", 'No', " & TestHelper.SqlText("Fixture cache listado") & ", 0)"
    p_Db.Execute sqlInsert, dbFailOnError

    fixtureRows = CountRowsBySql(p_Db, "SELECT COUNT(*) FROM TbNoConformidades WHERE IDNoConformidad = " & p_IDNC & " AND DESCRIPCION = " & TestHelper.SqlText(p_Descripcion))
    If fixtureRows <> 1 Then
        p_Error = "EnsureNCListadoFixture: fixture no quedó con cardinalidad exacta ID=" & p_IDNC
        Exit Function
    End If

    EnsureNCListadoFixture = True
    Exit Function

EH:
    p_Error = "EnsureNCListadoFixture: " & Err.Description
End Function

' Limpia todos los rastros de los fixtures de test de cache listado.
' Orden: cache listado → cache detalle → log → fuente.
Private Sub CleanupListadoTestFixture(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByRef p_Logs As Collection)
    On Error Resume Next

    If TableExistsInDb(p_Db, "TbCacheListadoNC") Then
        p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad = " & p_IDNC, dbFailOnError
    End If
    If TableExistsInDb(p_Db, "TbCacheNCProyecto") Then
        p_Db.Execute "DELETE FROM TbCacheNCProyecto WHERE IDNoConformidad = " & p_IDNC, dbFailOnError
    End If
    If TableExistsInDb(p_Db, "TbLogCache") Then
        p_Db.Execute "DELETE FROM TbLogCache WHERE IDNoConformidad = " & p_IDNC, dbFailOnError
    End If
    If TableExistsInDb(p_Db, "TbNoConformidades") Then
        p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad = " & p_IDNC, dbFailOnError
    End If

    TestHelper.AddLog p_Logs, "Cleanup fixture cache ID=" & p_IDNC & " (hijos→padre)"
End Sub

Private Function CacheListado_TestUsuario(ByVal p_Nombre As String) As usuario
    Dim usr As New usuario

    usr.Nombre = p_Nombre
    usr.UsuarioRed = "TEST_CACHE_LISTADO"
    Set CacheListado_TestUsuario = usr
End Function

' Fuerza sync de listado para una NC fixture: RegenerarRegistro crea detalle + listado.
' Esto garantiza que la NC esté en TbCacheListadoNC antes del test aunque no existiera cache previa.
Private Function SyncListadoForNC(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByRef p_Error As String) As Boolean
    Dim ok As Boolean
    On Error GoTo EH

    SyncListadoForNC = False
    p_Error = ""

    ok = CacheNCProyecto.RegenerarRegistro(CStr(p_IDNC), p_Error)
    If Not ok Then
        p_Error = "SyncListadoForNC: RegenerarRegistro falló: " & p_Error
        Exit Function
    End If

    SyncListadoForNC = True
    Exit Function

EH:
    p_Error = "SyncListadoForNC: " & Err.Description
End Function

Private Function GetNotasFromCacheListado(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long) As String
    Dim rs As DAO.Recordset
    On Error Resume Next
    Set rs = p_Db.OpenRecordset("SELECT Notas FROM TbCacheListadoNC WHERE IDNoConformidad = " & p_IDNC & " AND CacheValida = True", dbOpenSnapshot)
    If Not rs Is Nothing Then
        If Not rs.EOF Then
            GetNotasFromCacheListado = Nz(rs!Notas.Value, "")
        Else
            GetNotasFromCacheListado = ""
        End If
        rs.Close
        Set rs = Nothing
    Else
        GetNotasFromCacheListado = ""
    End If
End Function

Private Function GetDescripcionFromCacheListado(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long) As String
    Dim rs As DAO.Recordset
    On Error Resume Next
    Set rs = p_Db.OpenRecordset("SELECT Descripcion FROM TbCacheListadoNC WHERE IDNoConformidad = " & p_IDNC & " AND CacheValida = True", dbOpenSnapshot)
    If Not rs Is Nothing Then
        If Not rs.EOF Then
            GetDescripcionFromCacheListado = Nz(rs!Descripcion.Value, "")
        Else
            GetDescripcionFromCacheListado = ""
        End If
        rs.Close
        Set rs = Nothing
    Else
        GetDescripcionFromCacheListado = ""
    End If
End Function

Private Function CountRowsBySql(ByVal p_Db As DAO.Database, ByVal p_SQL As String) As Long
    Dim rs As DAO.Recordset
    On Error GoTo EH
    Set rs = p_Db.OpenRecordset(p_SQL, dbOpenSnapshot)
    If Not rs.EOF Then CountRowsBySql = CLng(Nz(rs.Fields(0).Value, 0))
    rs.Close
    Set rs = Nothing
    Exit Function

EH:
    CountRowsBySql = -1
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Function

Private Function TableExistsInDb(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef
    On Error GoTo EH
    Set tdf = p_Db.TableDefs(p_TableName)
    TableExistsInDb = True
    Exit Function

EH:
    TableExistsInDb = False
End Function
