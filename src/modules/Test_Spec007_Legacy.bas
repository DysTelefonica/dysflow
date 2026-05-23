Attribute VB_Name = "Test_Spec007_Legacy"
Option Compare Database
Option Explicit

Public Function Test_Spec007_PA10_GetNCProyectoVMSeguro_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim assertError As String
    Dim vm As NCProyectoDetailVM
    Dim isNothingResult As Boolean

    Set logs = TestHelper.NewLogs
    TestHelper.AddLog logs, "Act: GetNCProyectoVM(999999)"
    Set vm = NCProyectoWrapper.GetNCProyectoVM(999999)
    isNothingResult = (vm Is Nothing)
    Call TestHelper.AssertTrue(isNothingResult Or (TypeName(vm) = "NCProyectoDetailVM"), "PA-10 contrato: resultado permitido Nothing u objeto NCProyectoDetailVM", logs, assertError)
    If assertError <> "" Then GoTo Fail
    TestHelper.AddLog logs, "Resultado GetNCProyectoVM(999999): " & IIf(isNothingResult, "Nothing", "Objeto")
    If Not vm Is Nothing Then Set vm = Nothing

    Test_Spec007_PA10_GetNCProyectoVMSeguro_Atomic = TestHelper.BuildJsonOk(logs, "pa10_ok")
    Exit Function

Fail:
    If Not vm Is Nothing Then Set vm = Nothing
    Test_Spec007_PA10_GetNCProyectoVMSeguro_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function
EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_Spec007_PA10_GetNCProyectoVMSeguro_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function
