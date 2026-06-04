Attribute VB_Name = "Test_NCProyectoGestionListadoHelper"
Option Compare Database
Option Explicit

' ============================================
' MÓDULO DE TEST — NC PROYECTO GESTIÓN LISTADO HELPER (W4a RED)
' ============================================
' SDD: cache-form-filter-coverage
' Work Unit: W4a — RED helper tests only.
'
' These tests call NCProyectoGestionListadoHelper directly. They MUST NOT open
' FormNCProyectoGestion or initialize Access UI controls. The helper is expected
' to own cache-vs-fallback, fallback logging, no-user resilience, cache-preferred
' selection, and fallback predicate parity.
' ============================================

Private Const TEST_ID_BASE As Long = 900240
Private Const TEST_ID_FALLBACK_EMPTY As Long = TEST_ID_BASE + 1
Private Const TEST_ID_FALLBACK_DISABLED As Long = TEST_ID_BASE + 2
Private Const TEST_ID_FALLBACK_NO_USER As Long = TEST_ID_BASE + 3
Private Const TEST_ID_CACHE_SOURCE As Long = TEST_ID_BASE + 4
Private Const TEST_ID_CACHE_PREFERRED As Long = TEST_ID_BASE + 5
Private Const TEST_ID_PARITY_HIT_1 As Long = TEST_ID_BASE + 6
Private Const TEST_ID_PARITY_HIT_2 As Long = TEST_ID_BASE + 7
Private Const TEST_ID_PARITY_MISS As Long = TEST_ID_BASE + 8

Public Function Test_ListadoHelper_Fallback_EmptyCache_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim col As Collection
    Dim previousUser As usuario
    Dim previousCacheEnabled As Boolean

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ListadoHelper_Fallback_EmptyCache_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    Call SchemaGateW4a(logs)
    previousCacheEnabled = ReadCacheHabilitada(db)
    Set previousUser = m_ObjUsuarioConectado

    CleanupW4aFixtures db
    SetCacheHabilitada db, True
    EnsureNCFixture db, TEST_ID_FALLBACK_EMPTY, "W4A-EMPTY", "helper empty cache source", "DEFENSA"
    EnsureNoValidCacheRows db
    Set m_ObjUsuarioConectado = TestUser("QA W4A Empty")
    TestHelper.AddLog logs, "Arrange: one source NC, zero valid cache rows, cache enabled"

    Set col = GetNCsProyectoGestionFiltrados(p_Codigo:="W4A-EMPTY", p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If Not AssertCollectionHasOnlyId(col, TEST_ID_FALLBACK_EMPTY, logs, assertError) Then GoTo Fail
    If CountRows(db, "TbLogCache", "IDNoConformidad=0 AND TipoOperacion='FormCacheFallback'") <> 1 Then
        assertError = "Expected exactly one FormCacheFallback log for empty cache"
        GoTo Fail
    End If

    Test_ListadoHelper_Fallback_EmptyCache_Atomic = TestHelper.BuildJsonOk(logs, "empty-cache-fallback")
    GoTo Cleanup

Fail:
    Test_ListadoHelper_Fallback_EmptyCache_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ListadoHelper_Fallback_EmptyCache_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        CleanupW4aFixtures db
        SetCacheHabilitada db, previousCacheEnabled
    End If
    Set m_ObjUsuarioConectado = previousUser
    TestHelper.EndTestSession logs
End Function

Public Function Test_ListadoHelper_Fallback_DisabledCache_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim col As Collection
    Dim previousUser As usuario
    Dim previousCacheEnabled As Boolean

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ListadoHelper_Fallback_DisabledCache_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    Call SchemaGateW4a(logs)
    previousCacheEnabled = ReadCacheHabilitada(db)
    Set previousUser = m_ObjUsuarioConectado

    CleanupW4aFixtures db
    SetCacheHabilitada db, False
    EnsureNCFixture db, TEST_ID_FALLBACK_DISABLED, "W4A-DISABLED", "helper disabled cache source", "DEFENSA"
    SeedCacheRow db, TEST_ID_CACHE_PREFERRED, "W4A-DISABLED", "cache row must be ignored when disabled"
    Set m_ObjUsuarioConectado = TestUser("QA W4A Disabled")
    TestHelper.AddLog logs, "Arrange: source and cache rows exist, cache disabled"

    Set col = GetNCsProyectoGestionFiltrados(p_Codigo:="W4A-DISABLED", p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If Not AssertCollectionHasOnlyId(col, TEST_ID_FALLBACK_DISABLED, logs, assertError) Then GoTo Fail
    If CountRows(db, "TbLogCache", "IDNoConformidad=0 AND TipoOperacion='FormCacheFallback'") <> 1 Then
        assertError = "Expected exactly one FormCacheFallback log for disabled cache"
        GoTo Fail
    End If

    Test_ListadoHelper_Fallback_DisabledCache_Atomic = TestHelper.BuildJsonOk(logs, "disabled-cache-fallback")
    GoTo Cleanup

Fail:
    Test_ListadoHelper_Fallback_DisabledCache_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ListadoHelper_Fallback_DisabledCache_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        CleanupW4aFixtures db
        SetCacheHabilitada db, previousCacheEnabled
    End If
    Set m_ObjUsuarioConectado = previousUser
    TestHelper.EndTestSession logs
End Function

Public Function Test_ListadoHelper_Fallback_NoUser_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim col As Collection
    Dim previousUser As usuario
    Dim previousCacheEnabled As Boolean
    Dim safeUserRows As Long

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ListadoHelper_Fallback_NoUser_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    Call SchemaGateW4a(logs)
    previousCacheEnabled = ReadCacheHabilitada(db)
    Set previousUser = m_ObjUsuarioConectado

    CleanupW4aFixtures db
    SetCacheHabilitada db, False
    EnsureNCFixture db, TEST_ID_FALLBACK_NO_USER, "W4A-NOUSER", "helper no user source", "DEFENSA"
    Set m_ObjUsuarioConectado = Nothing
    TestHelper.AddLog logs, "Arrange: cache disabled and m_ObjUsuarioConectado=Nothing"

    Set col = GetNCsProyectoGestionFiltrados(p_Codigo:="W4A-NOUSER", p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If Not AssertCollectionHasOnlyId(col, TEST_ID_FALLBACK_NO_USER, logs, assertError) Then GoTo Fail
    safeUserRows = CountRows(db, "TbLogCache", "IDNoConformidad=0 AND TipoOperacion='FormCacheFallback' AND Len(Nz([Usuario],''))>0")
    If safeUserRows <> 1 Then
        assertError = "Expected one FormCacheFallback log with non-empty safe user, got " & CStr(safeUserRows)
        GoTo Fail
    End If

    Test_ListadoHelper_Fallback_NoUser_Atomic = TestHelper.BuildJsonOk(logs, "no-user-safe")
    GoTo Cleanup

Fail:
    Test_ListadoHelper_Fallback_NoUser_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ListadoHelper_Fallback_NoUser_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        CleanupW4aFixtures db
        SetCacheHabilitada db, previousCacheEnabled
    End If
    Set m_ObjUsuarioConectado = previousUser
    TestHelper.EndTestSession logs
End Function

Public Function Test_ListadoHelper_CachePreferred_WhenCacheHasRows_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim col As Collection
    Dim previousUser As usuario
    Dim previousCacheEnabled As Boolean

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ListadoHelper_CachePreferred_WhenCacheHasRows_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    Call SchemaGateW4a(logs)
    previousCacheEnabled = ReadCacheHabilitada(db)
    Set previousUser = m_ObjUsuarioConectado

    CleanupW4aFixtures db
    SetCacheHabilitada db, True
    EnsureNCFixture db, TEST_ID_CACHE_SOURCE, "W4A-CACHE-SOURCE", "source row should not be returned", "DEFENSA"
    SeedCacheRow db, TEST_ID_CACHE_PREFERRED, "W4A-CACHE", "cache row should win"
    Set m_ObjUsuarioConectado = TestUser("QA W4A Cache")
    TestHelper.AddLog logs, "Arrange: valid cache row distinguishable from source fallback row"

    Set col = GetNCsProyectoGestionFiltrados(p_Codigo:="W4A-CACHE", p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If Not AssertCollectionHasOnlyId(col, TEST_ID_CACHE_PREFERRED, logs, assertError) Then GoTo Fail
    If CountRows(db, "TbLogCache", "IDNoConformidad=0 AND TipoOperacion='FormCacheFallback'") <> 0 Then
        assertError = "Expected no FormCacheFallback log when cache has matching rows"
        GoTo Fail
    End If

    Test_ListadoHelper_CachePreferred_WhenCacheHasRows_Atomic = TestHelper.BuildJsonOk(logs, "cache-preferred")
    GoTo Cleanup

Fail:
    Test_ListadoHelper_CachePreferred_WhenCacheHasRows_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ListadoHelper_CachePreferred_WhenCacheHasRows_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        CleanupW4aFixtures db
        SetCacheHabilitada db, previousCacheEnabled
    End If
    Set m_ObjUsuarioConectado = previousUser
    TestHelper.EndTestSession logs
End Function

Public Function Test_ListadoHelper_FilterParity_Fallback_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim col As Collection
    Dim previousUser As usuario
    Dim previousCacheEnabled As Boolean

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ListadoHelper_FilterParity_Fallback_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    Call SchemaGateW4a(logs)
    previousCacheEnabled = ReadCacheHabilitada(db)
    Set previousUser = m_ObjUsuarioConectado

    CleanupW4aFixtures db
    SetCacheHabilitada db, False
    EnsureNCFixture db, TEST_ID_PARITY_HIT_1, "W4A-PAR-1", "parity hit one", "DEFENSA"
    EnsureNCFixture db, TEST_ID_PARITY_HIT_2, "W4A-PAR-2", "parity hit two", "DEFENSOR"
    EnsureNCFixture db, TEST_ID_PARITY_MISS, "W4A-PAR-3", "parity miss", "ACME"
    Set m_ObjUsuarioConectado = TestUser("QA W4A Parity")
    TestHelper.AddLog logs, "Arrange: fallback source rows exercise Juridica contains predicate"

    Set col = GetNCsProyectoGestionFiltrados(p_Juridica:="DEFEN", p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If Not AssertCollectionContainsIds(col, Array(TEST_ID_PARITY_HIT_1, TEST_ID_PARITY_HIT_2), Array(TEST_ID_PARITY_MISS), logs, assertError) Then GoTo Fail


    Test_ListadoHelper_FilterParity_Fallback_Atomic = TestHelper.BuildJsonOk(logs, "fallback-filter-parity")
    GoTo Cleanup

Fail:
    Test_ListadoHelper_FilterParity_Fallback_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ListadoHelper_FilterParity_Fallback_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        CleanupW4aFixtures db
        SetCacheHabilitada db, previousCacheEnabled
    End If
    Set m_ObjUsuarioConectado = previousUser
    TestHelper.EndTestSession logs
End Function

Private Sub SchemaGateW4a(ByVal p_Logs As Collection)
    TestHelper.AddLog p_Logs, "Schema gate documented: TbNoConformidades required IDNoConformidad/CodigoNoConformidad/EXPEDIENTE; TbCacheListadoNC fixture uses nullable listing fields; TbLogCache requires IDNoConformidad; TbConfiguracion uses CacheHabilitada. Teardown order: cache/log then source NC."
End Sub

Private Sub EnsureNCFixture(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByVal p_Codigo As String, ByVal p_Descripcion As String, ByVal p_JuridicaExp As String)
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "INSERT INTO TbNoConformidades " & _
                 "(IDNoConformidad, CodigoNoConformidad, EXPEDIENTE, PROYECTO, DESCRIPCION, CAUSA, FECHAAPERTURA, TIPO, RequiereControlEficacia, MotivoNoRequiereControlEficacia, Borrado, JuridicaExp, CodExp, Nemotecnico, Estado) VALUES (" & _
                 CStr(p_IDNC) & ", " & TestHelper.SqlText(p_Codigo) & ", " & TestHelper.SqlText("EXP-W4A-" & CStr(p_IDNC)) & ", " & TestHelper.SqlText("PROY-W4A") & ", " & _
                 TestHelper.SqlText(p_Descripcion) & ", " & TestHelper.SqlText("Causa W4a") & ", Date(), " & TestHelper.SqlText("Proyecto") & ", 'No', " & _
                 TestHelper.SqlText("Fixture W4a") & ", 0, " & TestHelper.SqlText(p_JuridicaExp) & ", " & TestHelper.SqlText("COD-W4A-" & CStr(p_IDNC)) & ", " & _
                 TestHelper.SqlText("NEMO-W4A-" & CStr(p_IDNC)) & ", " & TestHelper.SqlText("Abierta") & ")", dbFailOnError
End Sub

Private Sub SeedCacheRow(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByVal p_Codigo As String, ByVal p_Descripcion As String)
    p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "INSERT INTO TbCacheListadoNC " & _
                 "(IDNoConformidad, CodigoNoConformidad, IDExpediente, Nemotecnico, CodExp, IDTipo, Descripcion, Notas, Estado, FechaApertura, RequiereControlEficacia, ControlEficacia, ResponsableTelefonica, RESPONSABLECALIDAD, ACR, Cerrada, FechaCache, CacheValida, Version, JuridicaExp) VALUES (" & _
                 CStr(p_IDNC) & ", " & TestHelper.SqlText(p_Codigo) & ", 0, " & TestHelper.SqlText("NEMO-W4A-CACHE") & ", " & TestHelper.SqlText("COD-W4A-CACHE") & ", 0, " & _
                 TestHelper.SqlText(p_Descripcion) & ", '', " & TestHelper.SqlText("Abierta") & ", Date(), 'No', '', '', '', '', 'No', Now(), True, 1, " & TestHelper.SqlText("DEFENSA") & ")", dbFailOnError
End Sub

Private Sub EnsureNoValidCacheRows(ByVal p_Db As DAO.Database)
    p_Db.Execute "UPDATE TbCacheListadoNC SET CacheValida=False", dbFailOnError
End Sub

Private Sub CleanupW4aFixtures(ByVal p_Db As DAO.Database)
    p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad BETWEEN " & TEST_ID_BASE & " AND " & (TEST_ID_BASE + 20), dbFailOnError
    p_Db.Execute "DELETE FROM TbLogCache WHERE IDNoConformidad=0 AND TipoOperacion='FormCacheFallback'", dbFailOnError
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad BETWEEN " & TEST_ID_BASE & " AND " & (TEST_ID_BASE + 20), dbFailOnError
End Sub

Private Function ReadCacheHabilitada(ByVal p_Db As DAO.Database) As Boolean
    Dim rs As DAO.Recordset

    On Error GoTo EH
    Set rs = p_Db.OpenRecordset("SELECT TOP 1 CacheHabilitada FROM TbConfiguracion", dbOpenSnapshot)
    If Not rs.EOF Then ReadCacheHabilitada = CBool(Nz(rs.Fields("CacheHabilitada").value, False))

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then
        rs.Close
        Set rs = Nothing
    End If
    Exit Function

EH:
    ReadCacheHabilitada = False
    Resume Cleanup
End Function

Private Sub SetCacheHabilitada(ByVal p_Db As DAO.Database, ByVal p_Enabled As Boolean)
    If p_Enabled Then
        p_Db.Execute "UPDATE TbConfiguracion SET CacheHabilitada=True", dbFailOnError
    Else
        p_Db.Execute "UPDATE TbConfiguracion SET CacheHabilitada=False", dbFailOnError
    End If
End Sub

Private Function TestUser(ByVal p_Nombre As String) As usuario
    Dim usr As New usuario
    usr.Nombre = p_Nombre
    usr.UsuarioRed = "TEST_W4A_HELPER"
    Set TestUser = usr
End Function

Private Function CountRows(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_Where As String) As Long
    Dim rs As DAO.Recordset
    Set rs = p_Db.OpenRecordset("SELECT COUNT(*) AS C FROM " & p_TableName & " WHERE " & p_Where, dbOpenSnapshot)
    CountRows = CLng(rs!C)
    rs.Close
    Set rs = Nothing
End Function

Private Function AssertCollectionHasOnlyId(ByVal p_Col As Collection, ByVal p_ExpectedID As Long, ByVal p_Logs As Collection, ByRef p_Error As String) As Boolean
    Dim item As Object
    Dim actualId As String

    If p_Col Is Nothing Then
        p_Error = "Expected collection, got Nothing"
        Exit Function
    End If
    If p_Col.count <> 1 Then
        p_Error = "Expected exactly 1 row, got " & CStr(p_Col.count)
        Exit Function
    End If
    Set item = p_Col(1)
    actualId = CStr(CallByName(item, "IDNoConformidad", VbGet))
    If actualId <> CStr(p_ExpectedID) Then
        p_Error = "Expected IDNoConformidad=" & CStr(p_ExpectedID) & ", got " & actualId
        Exit Function
    End If
    TestHelper.AddLog p_Logs, "Assert: collection contains only ID=" & CStr(p_ExpectedID)
    AssertCollectionHasOnlyId = True
End Function

Private Function AssertCollectionContainsIds(ByVal p_Col As Collection, ByVal p_ExpectedIds As Variant, ByVal p_ExcludedIds As Variant, ByVal p_Logs As Collection, ByRef p_Error As String) As Boolean
    Dim ids As String
    Dim i As Long
    Dim item As Object

    If p_Col Is Nothing Then
        p_Error = "Expected collection, got Nothing"
        Exit Function
    End If
    For i = 1 To p_Col.count
        Set item = p_Col(i)
        ids = ids & "," & CStr(CallByName(item, "IDNoConformidad", VbGet)) & ","
    Next i
    For i = LBound(p_ExpectedIds) To UBound(p_ExpectedIds)
        If InStr(1, ids, "," & CStr(p_ExpectedIds(i)) & ",", vbTextCompare) = 0 Then
            p_Error = "Expected ID missing from helper result: " & CStr(p_ExpectedIds(i))
            Exit Function
        End If
    Next i
    For i = LBound(p_ExcludedIds) To UBound(p_ExcludedIds)
        If InStr(1, ids, "," & CStr(p_ExcludedIds(i)) & ",", vbTextCompare) > 0 Then
            p_Error = "Excluded ID present in helper result: " & CStr(p_ExcludedIds(i))
            Exit Function
        End If
    Next i
    TestHelper.AddLog p_Logs, "Assert: expected IDs present and excluded IDs absent"
    AssertCollectionContainsIds = True
End Function
