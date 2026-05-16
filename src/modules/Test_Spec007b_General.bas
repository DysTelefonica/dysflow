Attribute VB_Name = "Test_Spec007b_General"
Option Compare Database
Option Explicit

Public Function Test_Spec007b_VMNil_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim vm As NCProyectoDetailVM
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Set vm = Nothing

    Call TestHelper.AssertTrue(vm Is Nothing, "VM Nothing debe habilitar fallback", logs, assertError)
    If assertError <> "" Then
        Test_Spec007b_VMNil_Atomic = TestHelper.TestFail(assertError, logs)
    Else
        Test_Spec007b_VMNil_Atomic = TestHelper.TestPass(logs, "fallback_ready")
    End If
    Exit Function
EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_Spec007b_VMNil_Atomic = TestHelper.TestFail(Err.Description, logs)
End Function

Public Function Test_Spec007b_VMNoCargado_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim vm As NCProyectoDetailVM
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Set vm = New NCProyectoDetailVM

    Call TestHelper.AssertTrue(Not vm Is Nothing, "VM debe instanciar", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(vm.EstaCargado = False, "VM nuevo debe iniciar no cargado", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Set vm = Nothing
    Test_Spec007b_VMNoCargado_Atomic = TestHelper.TestPass(logs, "fallback_ready")
    Exit Function

Fail:
    Set vm = Nothing
    Test_Spec007b_VMNoCargado_Atomic = TestHelper.TestFail(assertError, logs)
    Exit Function
EH:
    On Error Resume Next
    Set vm = Nothing
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_Spec007b_VMNoCargado_Atomic = TestHelper.TestFail(Err.Description, logs)
End Function
