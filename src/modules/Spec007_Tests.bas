Attribute VB_Name = "Spec007_Tests"
Option Compare Database
Option Explicit

Public Function Test_Spec007_PA09_InvalidateNC_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim assertError As String
    Dim result As Boolean
    Dim p_Error As String

    Set logs = TestHelper.NewLogs
    TestHelper.AddLog logs, "PA09 smoke/integration: usa ID real=1 y no va en manifest principal"

    result = NCProyectoWrapper.InvalidateNC(1, p_Error)
    If p_Error <> "" Then TestHelper.AddLog logs, "Detalle InvalidateNC error=" & p_Error

    Call TestHelper.AssertTrue(result = True, "PA-09 debe invalidar sin crash (solo smoke)", logs, assertError)

    If assertError <> "" Then
        Test_Spec007_PA09_InvalidateNC_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_Spec007_PA09_InvalidateNC_Atomic = TestHelper.BuildJsonOk(logs, "pa09_ok")
    End If
    Exit Function
EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_Spec007_PA09_InvalidateNC_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

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
