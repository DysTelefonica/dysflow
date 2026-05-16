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
