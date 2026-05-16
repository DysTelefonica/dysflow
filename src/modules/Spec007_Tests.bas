Attribute VB_Name = "Spec007_Tests"
Option Compare Database
Option Explicit

Private Function Test_PA09_InvalidateNCFunciona() As Boolean
    On Error GoTo errorHandler

    Dim result As Boolean
    Dim p_Error As String

    result = NCProyectoWrapper.InvalidateNC(1, p_Error)

    If result = True Then
        Debug.Print "[PA-09] PASS: InvalidateNC(1) retorna True"
        Test_PA09_InvalidateNCFunciona = True
    Else
        Debug.Print "[PA-09] FAIL: InvalidateNC(1) retorno False"
        Test_PA09_InvalidateNCFunciona = False
    End If

    Exit Function

errorHandler:
    Debug.Print "[PA-09] FAIL: " & Err.Description
    Test_PA09_InvalidateNCFunciona = False
End Function

Private Function Test_PA10_GetNCProyectoVMSeguro() As Boolean
    On Error GoTo errorHandler

    Dim vm As NCProyectoDetailVM

    Set vm = NCProyectoWrapper.GetNCProyectoVM(999999)

    If vm Is Nothing Then
        Debug.Print "[PA-10] PASS: GetNCProyectoVM(999999) retorna Nothing (no crashea)"
        Test_PA10_GetNCProyectoVMSeguro = True
    Else
        Debug.Print "[PA-10] PASS: GetNCProyectoVM(999999) retorno VM (no crashea)"
        Set vm = Nothing
        Test_PA10_GetNCProyectoVMSeguro = True
    End If

    Exit Function

errorHandler:
    Debug.Print "[PA-10] FAIL: " & Err.Description
    Test_PA10_GetNCProyectoVMSeguro = False
End Function

Public Function Test_Spec007_PA09_InvalidateNC_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim assertError As String
    Dim ok As Boolean

    Set logs = TestHelper.NewLogs
    ok = Test_PA09_InvalidateNCFunciona()
    Call TestHelper.AssertTrue(ok, "PA-09 debe invalidar sin crash", logs, assertError)

    If assertError <> "" Then
        Test_Spec007_PA09_InvalidateNC_Atomic = TestHelper.TestFail(assertError, logs)
    Else
        Test_Spec007_PA09_InvalidateNC_Atomic = TestHelper.TestPass(logs, "pa09_ok")
    End If
    Exit Function
EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_Spec007_PA09_InvalidateNC_Atomic = TestHelper.TestFail(Err.Description, logs)
End Function

Public Function Test_Spec007_PA10_GetNCProyectoVMSeguro_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim assertError As String
    Dim ok As Boolean

    Set logs = TestHelper.NewLogs
    ok = Test_PA10_GetNCProyectoVMSeguro()
    Call TestHelper.AssertTrue(ok, "PA-10 no debe crash con ID inexistente", logs, assertError)

    If assertError <> "" Then
        Test_Spec007_PA10_GetNCProyectoVMSeguro_Atomic = TestHelper.TestFail(assertError, logs)
    Else
        Test_Spec007_PA10_GetNCProyectoVMSeguro_Atomic = TestHelper.TestPass(logs, "pa10_ok")
    End If
    Exit Function
EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_Spec007_PA10_GetNCProyectoVMSeguro_Atomic = TestHelper.TestFail(Err.Description, logs)
End Function
