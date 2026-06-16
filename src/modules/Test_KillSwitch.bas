Attribute VB_Name = "Test_KillSwitch"
Option Compare Database
Option Explicit

' ============================================
' TESTS PARA KILL-SWITCH SPEC-010
' ============================================
' Estos tests validan el funcionamiento del
' kill-switch de caché.
'
' NOTA: Ejecutar con Access cerrado para importar
' ============================================


Public Function Test_KillSwitch_IsCacheEnabled_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim estado As Boolean
    Dim sessionStarted As Boolean
    Dim sessionErr As String
    Dim fixtureErr As String

    Set logs = TestHelper.NewLogs
    If Not BeginKillSwitchWriteSession(logs, sessionErr) Then
        Test_KillSwitch_IsCacheEnabled_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    If Not EnsureKillSwitchFixture(logs, fixtureErr) Then
        Test_KillSwitch_IsCacheEnabled_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & fixtureErr, logs)
        If sessionStarted Then Call TestHelper.EndTestSession(logs)
        Exit Function
    End If

    estado = IsCacheEnabled()
    TestHelper.AddLog logs, "IsCacheEnabled ejecutado. Estado=" & CStr(estado)

    Test_KillSwitch_IsCacheEnabled_Atomic = TestHelper.BuildJsonOk(logs, estado)
    Call TestHelper.EndTestSession(logs)
    Exit Function
EH:
    If logs Is Nothing Then Set logs = TestHelper.NewLogs
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_KillSwitch_IsCacheEnabled_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_KillSwitch_SetEnabled_True_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim estadoOriginal As Boolean
    Dim sessionStarted As Boolean
    Dim setResult As Boolean
    Dim estadoActual As Boolean
    Dim assertError As String
    Dim restoreErr As String
    Dim opError As String
    Dim sessionErr As String
    Dim fixtureErr As String

    Set logs = TestHelper.NewLogs
    If Not BeginKillSwitchWriteSession(logs, sessionErr) Then
        Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    If Not EnsureKillSwitchFixture(logs, fixtureErr) Then
        Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & fixtureErr, logs)
        If sessionStarted Then Call TestHelper.EndTestSession(logs)
        Exit Function
    End If

    estadoOriginal = IsCacheEnabled()
    TestHelper.AddLog logs, "Estado original=" & CStr(estadoOriginal)

    opError = ""
    setResult = CacheConfig_SetEnabled(True, opError)
    Call TestHelper.AssertTrue(setResult, "CacheConfig_SetEnabled(True) debe devolver True", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(opError = "", "CacheConfig_SetEnabled(True) no debe devolver error", logs, assertError)
    If assertError <> "" Then GoTo Fail

    estadoActual = IsCacheEnabled()
    Call TestHelper.AssertTrue(estadoActual = True, "IsCacheEnabled debe quedar True", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreState(estadoOriginal, logs, restoreErr)
    If restoreErr <> "" Then
        Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.BuildJsonFail(restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.BuildJsonOk(logs, estadoActual)
    End If
    Call TestHelper.EndTestSession(logs)
    Exit Function

Fail:
    Call RestoreState(estadoOriginal, logs, restoreErr)
    If restoreErr <> "" Then assertError = assertError & " | Restore: " & restoreErr
    Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    Exit Function
EH:
    If sessionStarted Then Call RestoreState(estadoOriginal, logs, restoreErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If restoreErr <> "" Then
        Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_KillSwitch_SetEnabled_False_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim estadoOriginal As Boolean
    Dim sessionStarted As Boolean
    Dim setResult As Boolean
    Dim estadoActual As Boolean
    Dim assertError As String
    Dim restoreErr As String
    Dim opError As String
    Dim sessionErr As String
    Dim fixtureErr As String

    Set logs = TestHelper.NewLogs
    If Not BeginKillSwitchWriteSession(logs, sessionErr) Then
        Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    If Not EnsureKillSwitchFixture(logs, fixtureErr) Then
        Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & fixtureErr, logs)
        If sessionStarted Then Call TestHelper.EndTestSession(logs)
        Exit Function
    End If

    estadoOriginal = IsCacheEnabled()
    TestHelper.AddLog logs, "Estado original=" & CStr(estadoOriginal)

    opError = ""
    setResult = CacheConfig_SetEnabled(False, opError)
    Call TestHelper.AssertTrue(setResult, "CacheConfig_SetEnabled(False) debe devolver True", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(opError = "", "CacheConfig_SetEnabled(False) no debe devolver error", logs, assertError)
    If assertError <> "" Then GoTo Fail

    estadoActual = IsCacheEnabled()
    Call TestHelper.AssertTrue(estadoActual = False, "IsCacheEnabled debe quedar False", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreState(estadoOriginal, logs, restoreErr)
    If restoreErr <> "" Then
        Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.BuildJsonFail(restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.BuildJsonOk(logs, estadoActual)
    End If
    Call TestHelper.EndTestSession(logs)
    Exit Function

Fail:
    Call RestoreState(estadoOriginal, logs, restoreErr)
    If restoreErr <> "" Then assertError = assertError & " | Restore: " & restoreErr
    Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    Exit Function
EH:
    If sessionStarted Then Call RestoreState(estadoOriginal, logs, restoreErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If restoreErr <> "" Then
        Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_KillSwitch_RestoreDefault_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim setResult As Boolean
    Dim assertError As String
    Dim opError As String
    Dim sessionStarted As Boolean
    Dim sessionErr As String
    Dim fixtureErr As String

    Set logs = TestHelper.NewLogs
    If Not BeginKillSwitchWriteSession(logs, sessionErr) Then
        Test_KillSwitch_RestoreDefault_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    If Not EnsureKillSwitchFixture(logs, fixtureErr) Then
        Test_KillSwitch_RestoreDefault_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & fixtureErr, logs)
        If sessionStarted Then Call TestHelper.EndTestSession(logs)
        Exit Function
    End If

    opError = ""
    setResult = CacheConfig_SetEnabled(True, opError)
    Call TestHelper.AssertTrue(setResult, "Restore default debe devolver True", logs, assertError)
    If assertError = "" Then
        Call TestHelper.AssertTrue(opError = "", "Restore default no debe devolver error", logs, assertError)
    End If
    If assertError <> "" Then
        Test_KillSwitch_RestoreDefault_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_KillSwitch_RestoreDefault_Atomic = TestHelper.BuildJsonOk(logs, IsCacheEnabled())
    End If
    Call TestHelper.EndTestSession(logs)
    Exit Function
EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_KillSwitch_RestoreDefault_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_KillSwitch_EnsureSchemaSeed_Idempotent_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim ok1 As Boolean
    Dim ok2 As Boolean
    Dim errMsg As String
    Dim assertError As String
    Dim sessionStarted As Boolean
    Dim sessionErr As String
    Dim fixtureErr As String

    Set logs = TestHelper.NewLogs
    If Not BeginKillSwitchWriteSession(logs, sessionErr) Then
        Test_KillSwitch_EnsureSchemaSeed_Idempotent_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    If Not EnsureKillSwitchFixture(logs, fixtureErr) Then
        Test_KillSwitch_EnsureSchemaSeed_Idempotent_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & fixtureErr, logs)
        If sessionStarted Then Call TestHelper.EndTestSession(logs)
        Exit Function
    End If

    errMsg = ""
    ok1 = EnsureCacheSchemaReadiness(errMsg)
    Call TestHelper.AssertTrue(ok1, "EnsureCacheSchemaReadiness primera ejecución OK", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(errMsg = "", "Primera ejecución sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail

    errMsg = ""
    ok2 = EnsureCacheSchemaReadiness(errMsg)
    Call TestHelper.AssertTrue(ok2, "EnsureCacheSchemaReadiness segunda ejecución OK (idempotente)", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(errMsg = "", "Segunda ejecución sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(CountRowsBackend("TbConfiguracion", "ID=1") = 1, "TbConfiguracion debe tener una sola fila ID=1", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(TableHasField("TbConfiguracion", "CacheHabilitada"), "TbConfiguracion.CacheHabilitada existe", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(TableHasField("TbCacheListadoNC", "IDNoConformidad"), "TbCacheListadoNC.IDNoConformidad existe", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(TableHasField("TbCacheListadoNC", "CacheValida"), "TbCacheListadoNC.CacheValida existe", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_KillSwitch_EnsureSchemaSeed_Idempotent_Atomic = TestHelper.BuildJsonOk(logs, "schema_seed_ready")
    Call TestHelper.EndTestSession(logs)
    Exit Function

Fail:
    Test_KillSwitch_EnsureSchemaSeed_Idempotent_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    Exit Function

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_KillSwitch_EnsureSchemaSeed_Idempotent_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
End Function

Private Function EnsureKillSwitchFixture(ByRef p_Logs As Collection, Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database
    Dim readinessErr As String
    Dim totalRows As Long
    Dim idOneRows As Long
    Dim assertError As String

    On Error GoTo EH
    EnsureKillSwitchFixture = False
    p_Error = ""

    If Not m_TestingMode Then
        p_Error = "EnsureKillSwitchFixture: BeginKillSwitchWriteSession debe ejecutarse antes"
        TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    readinessErr = ""
    If Not EnsureCacheSchemaReadiness(readinessErr) Then
        p_Error = "EnsureCacheSchemaReadiness: " & readinessErr
        TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    Set db = getdb()
    If db Is Nothing Then
        p_Error = "EnsureKillSwitchFixture: getdb devolvió Nothing en modo testing"
        TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    TestHelper.AddLog p_Logs, "Arrange fixture: EnsureCacheSchemaReadiness OK bajo sandbox local"
    TestHelper.AddLog p_Logs, "Fixture DB: " & db.Name
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracion.ID: Long, Required=False; contrato singleton ID=1"
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracion.CacheHabilitada: Boolean, Required=False"
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracion.FechaCambioCache: Date, Required=False"
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracion.UsuarioCambioCache: Text(255), Required=False"
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracion.MotivoCambioCache: Memo/LongText, Required=False"
    TestHelper.AddLog p_Logs, "ID=1 es fixture controlada por EnsureTbConfiguracion en sandbox, no dato preexistente afortunado"

    totalRows = CountRowsBackend("TbConfiguracion")
    Call TestHelper.AssertTrue(totalRows = 1, "TbConfiguracion debe tener exactamente una fila singleton", p_Logs, assertError)
    If assertError <> "" Then GoTo Fail

    idOneRows = CountRowsBackend("TbConfiguracion", "ID=1")
    Call TestHelper.AssertTrue(idOneRows = 1, "TbConfiguracion debe tener exactamente una fila ID=1", p_Logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(TableHasField("TbConfiguracion", "CacheHabilitada"), "TbConfiguracion.CacheHabilitada existe", p_Logs, assertError)
    If assertError <> "" Then GoTo Fail

    EnsureKillSwitchFixture = True
    Set db = Nothing
    Exit Function

Fail:
    p_Error = assertError
    Set db = Nothing
    Exit Function

EH:
    p_Error = "EnsureKillSwitchFixture: " & Err.Description
    TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
    Set db = Nothing
End Function

Private Function CountRowsBackend(ByVal p_Table As String, Optional ByVal p_Where As String = "") As Long
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String
    On Error GoTo EH

    sql = "SELECT COUNT(*) AS Cnt FROM " & p_Table
    If Trim$(p_Where) <> "" Then sql = sql & " WHERE " & p_Where

    Set db = getdb()
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    CountRowsBackend = CLng(Nz(rs.Fields("Cnt").Value, 0))
    rs.Close
    Set rs = Nothing
    Set db = Nothing
    Exit Function
EH:
    CountRowsBackend = -1
End Function

Public Function Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim originalState As Boolean
    Dim sessionStarted As Boolean
    Dim assertError As String
    Dim opError As String
    Dim restoreErr As String
    Dim sessionErr As String
    Dim fixtureErr As String

    Set logs = TestHelper.NewLogs
    If Not BeginKillSwitchWriteSession(logs, sessionErr) Then
        Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True
    If Not EnsureKillSwitchFixture(logs, fixtureErr) Then
        Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & fixtureErr, logs)
        If sessionStarted Then Call TestHelper.EndTestSession(logs)
        Exit Function
    End If

    originalState = IsCacheEnabled()
    TestHelper.AddLog logs, "Estado original=" & CStr(originalState)

    opError = ""
    Call TestHelper.AssertTrue(CacheConfig_SetEnabled(False, opError), "Set OFF debe devolver True", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(opError = "", "Set OFF sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(IsCacheEnabled() = False, "Estado persistido OFF", logs, assertError)
    If assertError <> "" Then GoTo Fail

    opError = ""
    Call TestHelper.AssertTrue(CacheConfig_SetEnabled(True, opError), "Set ON debe devolver True", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(opError = "", "Set ON sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(IsCacheEnabled() = True, "Estado persistido ON", logs, assertError)
    If assertError <> "" Then GoTo Fail

    opError = ""
    Call TestHelper.AssertTrue(CacheConfig_SetEnabled(False, opError), "Set OFF final debe devolver True", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(opError = "", "Set OFF final sin error", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(IsCacheEnabled() = False, "Estado persistido OFF final", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call RestoreState(originalState, logs, restoreErr)
    If restoreErr <> "" Then
        Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.BuildJsonFail(restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.BuildJsonOk(logs, "off_on_off_ok")
    End If
    Call TestHelper.EndTestSession(logs)
    Exit Function

Fail:
    Call RestoreState(originalState, logs, restoreErr)
    If restoreErr <> "" Then assertError = assertError & " | Restore: " & restoreErr
    Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    Exit Function

EH:
    If sessionStarted Then Call RestoreState(originalState, logs, restoreErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If restoreErr <> "" Then
        Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.BuildJsonFail(Err.Description & " | Restore: " & restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    End If
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
End Function

Private Function TableHasField(ByVal p_Table As String, ByVal p_Field As String) As Boolean
    Dim db As DAO.Database
    Dim tdf As DAO.TableDef
    Dim fld As DAO.Field
    On Error GoTo EH

    Set db = getdb()
    Set tdf = db.TableDefs(p_Table)
    For Each fld In tdf.Fields
        If StrComp(fld.Name, p_Field, vbTextCompare) = 0 Then
            TableHasField = True
            Exit Function
        End If
    Next fld
    TableHasField = False
    Exit Function
EH:
    TableHasField = False
End Function

Private Function BeginKillSwitchWriteSession(ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    BeginKillSwitchWriteSession = False
    p_Error = ""

    If Not TestHelper.BeginTestSession(p_Logs, p_Error) Then Exit Function
    If Not TestHelper.AssertSandboxBackend(p_Logs, p_Error) Then
        Call TestHelper.EndTestSession(p_Logs)
        Exit Function
    End If

    BeginKillSwitchWriteSession = True
End Function

Private Sub RestoreState(ByVal p_Enabled As Boolean, ByRef p_Logs As Collection, Optional ByRef p_Error As String)
    Dim ok As Boolean
    Dim opError As String

    opError = ""
    ok = CacheConfig_SetEnabled(p_Enabled, opError)
    If ok Then
        TestHelper.AddLog p_Logs, "Estado restaurado=" & CStr(p_Enabled)
        If opError = "" Then
            p_Error = ""
        Else
            p_Error = opError
        End If
    Else
        p_Error = "No se pudo restaurar estado a " & CStr(p_Enabled)
        If opError <> "" Then p_Error = p_Error & " | " & opError
        TestHelper.AddLog p_Logs, p_Error
    End If
End Sub
