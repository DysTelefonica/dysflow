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
    Set logs = TestHelper.NewLogs

    Dim estado As Boolean
    estado = IsCacheEnabled()
    TestHelper.AddLog logs, "IsCacheEnabled ejecutado. Estado=" & CStr(estado)

    Test_KillSwitch_IsCacheEnabled_Atomic = TestHelper.TestPass(logs, estado)
    Exit Function
EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_KillSwitch_IsCacheEnabled_Atomic = TestHelper.TestFail(Err.Description, logs)
End Function

Public Function Test_KillSwitch_SetEnabled_True_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim estadoOriginal As Boolean
    Dim setResult As Boolean
    Dim estadoActual As Boolean
    Dim assertError As String
    Dim restoreErr As String
    Dim opError As String

    Set logs = TestHelper.NewLogs
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
        Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.TestFail(restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.TestPass(logs, estadoActual)
    End If
    Exit Function

Fail:
    Call RestoreState(estadoOriginal, logs, restoreErr)
    If restoreErr <> "" Then assertError = assertError & " | Restore: " & restoreErr
    Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.TestFail(assertError, logs)
    Exit Function
EH:
    Call RestoreState(estadoOriginal, logs, restoreErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If restoreErr <> "" Then
        Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.TestFail(Err.Description & " | Restore: " & restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_True_Atomic = TestHelper.TestFail(Err.Description, logs)
    End If
End Function

Public Function Test_KillSwitch_SetEnabled_False_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim estadoOriginal As Boolean
    Dim setResult As Boolean
    Dim estadoActual As Boolean
    Dim assertError As String
    Dim restoreErr As String
    Dim opError As String

    Set logs = TestHelper.NewLogs
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
        Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.TestFail(restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.TestPass(logs, estadoActual)
    End If
    Exit Function

Fail:
    Call RestoreState(estadoOriginal, logs, restoreErr)
    If restoreErr <> "" Then assertError = assertError & " | Restore: " & restoreErr
    Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.TestFail(assertError, logs)
    Exit Function
EH:
    Call RestoreState(estadoOriginal, logs, restoreErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If restoreErr <> "" Then
        Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.TestFail(Err.Description & " | Restore: " & restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_False_Atomic = TestHelper.TestFail(Err.Description, logs)
    End If
End Function

Public Function Test_KillSwitch_RestoreDefault_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim setResult As Boolean
    Dim assertError As String
    Dim opError As String

    Set logs = TestHelper.NewLogs
    opError = ""
    setResult = CacheConfig_SetEnabled(True, opError)
    Call TestHelper.AssertTrue(setResult, "Restore default debe devolver True", logs, assertError)
    If assertError = "" Then
        Call TestHelper.AssertTrue(opError = "", "Restore default no debe devolver error", logs, assertError)
    End If
    If assertError <> "" Then
        Test_KillSwitch_RestoreDefault_Atomic = TestHelper.TestFail(assertError, logs)
    Else
        Test_KillSwitch_RestoreDefault_Atomic = TestHelper.TestPass(logs, IsCacheEnabled())
    End If
    Exit Function
EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_KillSwitch_RestoreDefault_Atomic = TestHelper.TestFail(Err.Description, logs)
End Function

Public Function Test_KillSwitch_EnsureSchemaSeed_Idempotent_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim ok1 As Boolean
    Dim ok2 As Boolean
    Dim errMsg As String
    Dim assertError As String

    Set logs = TestHelper.NewLogs
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

    Test_KillSwitch_EnsureSchemaSeed_Idempotent_Atomic = TestHelper.TestPass(logs, "schema_seed_ready")
    Exit Function

Fail:
    Test_KillSwitch_EnsureSchemaSeed_Idempotent_Atomic = TestHelper.TestFail(assertError, logs)
    Exit Function

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_KillSwitch_EnsureSchemaSeed_Idempotent_Atomic = TestHelper.TestFail(Err.Description, logs)
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
    Dim assertError As String
    Dim opError As String
    Dim restoreErr As String

    Set logs = TestHelper.NewLogs
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
        Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.TestFail(restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.TestPass(logs, "off_on_off_ok")
    End If
    Exit Function

Fail:
    Call RestoreState(originalState, logs, restoreErr)
    If restoreErr <> "" Then assertError = assertError & " | Restore: " & restoreErr
    Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.TestFail(assertError, logs)
    Exit Function

EH:
    Call RestoreState(originalState, logs, restoreErr)
    TestHelper.AddLog logs, "Error: " & Err.Description
    If restoreErr <> "" Then
        Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.TestFail(Err.Description & " | Restore: " & restoreErr, logs)
    Else
        Test_KillSwitch_SetEnabled_OffOnOff_Persistence_Atomic = TestHelper.TestFail(Err.Description, logs)
    End If
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

Private Sub RestoreState(ByVal p_Enabled As Boolean, ByRef p_Logs As Collection, ByRef p_Error As String)
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
