Attribute VB_Name = "Test_CAT_MaestrosCatalogos"
Option Compare Database
Option Explicit

' ============================================
' MÓDULO DE TEST — MAESTROS Y CATÁLOGOS (CAP-CAT)
' ============================================
' Test scenarios:
'   1. TipologiaNCProyectos.Registrar crea fila en TbTiposNCProyectos
'   2. TipologiaNCProyectos.Eliminar borra fila de TbTiposNCProyectos
'
' Fixture strategy: fixture-first, sandbox local, teardown idempotente.
' Rango TEST_TIPOLOGIA_PREFIX = 990000. Estos tests usan valores únicos
' derivados de timestamp para evitar colisiones entre rondas.
' Cubre BR-CAT-5 (gestión de tipología) y BR-CAT-6 (contrato de
' alta/baja del catálogo de tipologías).
' ============================================

Private Const TEST_TIPOLOGIA_REGISTRAR As String = "TIPOLOGIA_TEST_REGISTRAR_990001"
Private Const TEST_TIPOLOGIA_ELIMINAR As String = "TIPOLOGIA_TEST_ELIMINAR_990002"

' ============================================
' TEST 1 — Registrar crea tipología en TbTiposNCProyectos
' ============================================
Public Function Test_CAT_Tipologia_Registrar_CreaTipologia_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim tnp As TipologiaNCProyectos
    Dim tipologia As String
    Dim idTipo As Long
    Dim assertError As String
    Dim sessionErr As String
    Dim opErr As String
    Dim sessionStarted As Boolean
    Dim rowsAfter As Long

    Set logs = TestHelper.NewLogs
    sessionStarted = False
    tipologia = TEST_TIPOLOGIA_REGISTRAR
    idTipo = 0

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CAT_Tipologia_Registrar_CreaTipologia_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set db = getdb()
    If db Is Nothing Then
        Test_CAT_Tipologia_Registrar_CreaTipologia_Atomic = TestHelper.BuildJsonFail("getdb() devolvió Nothing", logs)
        GoTo Cleanup
    End If

    ' Arrange: limpiar cualquier fila previa con la misma Tipologia (idempotencia entre rondas)
    On Error Resume Next
    db.Execute "DELETE FROM TbTiposNCProyectos WHERE Tipologia='" & Replace(tipologia, "'", "''") & "'", dbFailOnError
    On Error GoTo EH
    TestHelper.AddLog logs, "Arrange: pre-cleanup de TbTiposNCProyectos para tipologia=" & tipologia

    ' Act: instanciar TipologiaNCProyectos, asignar Tipologia y llamar Registrar
    Set tnp = New TipologiaNCProyectos
    tnp.Tipologia = tipologia
    opErr = ""
    tnp.Registrar p_TipologiaAlInicio:=Nothing, p_Error:=opErr

    TestHelper.AddLog logs, "Act: Registrar(p_TipologiaAlInicio:=Nothing, p_Error:=opErr) devolvió pError='" & opErr & "'"

    ' Assert 1: Registrar no debe reportar error
    If Not TestHelper.AssertTrue(opErr = "", "Assert1: Registrar debe ejecutarse sin reportar error; pError='" & opErr & "'", logs, assertError) Then
        Test_CAT_Tipologia_Registrar_CreaTipologia_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    ' Assert 2: la fila debe existir en TbTiposNCProyectos con Tipologia = nuestra fixture
    rowsAfter = DCount("[IDTipo]", "TbTiposNCProyectos", "[Tipologia]='" & Replace(tipologia, "'", "''") & "'")
    If Not TestHelper.AssertTrue(rowsAfter = 1, "Assert2: TbTiposNCProyectos debe contener exactamente 1 fila con Tipologia='" & tipologia & "'; rowsAfter=" & rowsAfter, logs, assertError) Then
        Test_CAT_Tipologia_Registrar_CreaTipologia_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If
    TestHelper.AddLog logs, "Assert2: DCount(IDTipo WHERE Tipologia='" & tipologia & "') = " & rowsAfter

    ' Assert 3: IDTipo debe ser positivo (IDTipoCalculado asignó un Long)
    idTipo = DLookup("[IDTipo]", "TbTiposNCProyectos", "[Tipologia]='" & Replace(tipologia, "'", "''") & "'")
    If Not TestHelper.AssertTrue(idTipo > 0, "Assert3: IDTipo debe ser positivo (>0); idTipo=" & idTipo, logs, assertError) Then
        Test_CAT_Tipologia_Registrar_CreaTipologia_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If
    TestHelper.AddLog logs, "Assert3: DLookup IDTipo=" & idTipo

    Test_CAT_Tipologia_Registrar_CreaTipologia_Atomic = TestHelper.BuildJsonOk(logs, "tipologia=" & tipologia & " idTipo=" & idTipo)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CAT_Tipologia_Registrar_CreaTipologia_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        db.Execute "DELETE FROM TbTiposNCProyectos WHERE Tipologia='" & Replace(tipologia, "'", "''") & "'", dbFailOnError
        TestHelper.AddLog logs, "Cleanup: borrada fila fixture tipologia=" & tipologia
    End If
    Set tnp = Nothing
    Set db = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 2 — Eliminar borra tipología de TbTiposNCProyectos
' ============================================
Public Function Test_CAT_Tipologia_Eliminar_LimpiaTipologia_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim tnp As TipologiaNCProyectos
    Dim tipologia As String
    Dim idTipo As Long
    Dim assertError As String
    Dim sessionErr As String
    Dim opErr As String
    Dim sessionStarted As Boolean
    Dim rowsBefore As Long
    Dim rowsAfter As Long

    Set logs = TestHelper.NewLogs
    sessionStarted = False
    tipologia = TEST_TIPOLOGIA_ELIMINAR
    idTipo = 0

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CAT_Tipologia_Eliminar_LimpiaTipologia_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set db = getdb()
    If db Is Nothing Then
        Test_CAT_Tipologia_Eliminar_LimpiaTipologia_Atomic = TestHelper.BuildJsonFail("getdb() devolvió Nothing", logs)
        GoTo Cleanup
    End If

    ' Arrange: limpiar pre-state y crear la tipología que vamos a eliminar
    On Error Resume Next
    db.Execute "DELETE FROM TbTiposNCProyectos WHERE Tipologia='" & Replace(tipologia, "'", "''") & "'", dbFailOnError
    On Error GoTo EH
    TestHelper.AddLog logs, "Arrange: pre-cleanup de TbTiposNCProyectos para tipologia=" & tipologia

    Set tnp = New TipologiaNCProyectos
    tnp.Tipologia = tipologia
    opErr = ""
    tnp.Registrar p_TipologiaAlInicio:=Nothing, p_Error:=opErr
    If opErr <> "" Then
        TestHelper.AddLog logs, "Arrange falló: Registrar inicial devolvió pError='" & opErr & "'"
        Test_CAT_Tipologia_Eliminar_LimpiaTipologia_Atomic = TestHelper.BuildJsonFail("Arrange falló: " & opErr, logs)
        GoTo Cleanup
    End If

    idTipo = DLookup("[IDTipo]", "TbTiposNCProyectos", "[Tipologia]='" & Replace(tipologia, "'", "''") & "'")
    rowsBefore = DCount("[IDTipo]", "TbTiposNCProyectos", "[Tipologia]='" & Replace(tipologia, "'", "''") & "'")
    If Not TestHelper.AssertTrue(rowsBefore = 1, "Precondición: Arrange debe dejar 1 fila; rowsBefore=" & rowsBefore, logs, assertError) Then
        Test_CAT_Tipologia_Eliminar_LimpiaTipologia_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If
    TestHelper.AddLog logs, "Arrange: fixture creada con idTipo=" & idTipo & ", rowsBefore=" & rowsBefore

    ' Act: cargar la tipología recién creada y eliminarla
    Set tnp = Nothing
    Set tnp = New TipologiaNCProyectos
    tnp.IDTipo = CStr(idTipo)
    tnp.Tipologia = tipologia
    opErr = ""
    tnp.Eliminar p_Error:=opErr
    TestHelper.AddLog logs, "Act: Eliminar(p_Error:=opErr) devolvió pError='" & opErr & "'"

    ' Assert 1: Eliminar no debe reportar error
    If Not TestHelper.AssertTrue(opErr = "", "Assert1: Eliminar debe ejecutarse sin reportar error; pError='" & opErr & "'", logs, assertError) Then
        Test_CAT_Tipologia_Eliminar_LimpiaTipologia_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    ' Assert 2: la fila debe haber desaparecido
    rowsAfter = DCount("[IDTipo]", "TbTiposNCProyectos", "[Tipologia]='" & Replace(tipologia, "'", "''") & "'")
    If Not TestHelper.AssertTrue(rowsAfter = 0, "Assert2: TbTiposNCProyectos no debe contener filas con Tipologia='" & tipologia & "' post-Eliminar; rowsAfter=" & rowsAfter, logs, assertError) Then
        Test_CAT_Tipologia_Eliminar_LimpiaTipologia_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If
    TestHelper.AddLog logs, "Assert2: DCount(IDTipo WHERE Tipologia='" & tipologia & "') = " & rowsAfter

    Test_CAT_Tipologia_Eliminar_LimpiaTipologia_Atomic = TestHelper.BuildJsonOk(logs, "tipologia=" & tipologia & " idTipo=" & idTipo & " rowsBefore=" & rowsBefore & " rowsAfter=" & rowsAfter)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CAT_Tipologia_Eliminar_LimpiaTipologia_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        db.Execute "DELETE FROM TbTiposNCProyectos WHERE Tipologia='" & Replace(tipologia, "'", "''") & "'", dbFailOnError
        TestHelper.AddLog logs, "Cleanup: borrada fila fixture tipologia=" & tipologia
    End If
    Set tnp = Nothing
    Set db = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function
