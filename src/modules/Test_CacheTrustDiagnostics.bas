Attribute VB_Name = "Test_CacheTrustDiagnostics"
Option Compare Database
Option Explicit

Public Function Test_CacheTrust_LoadedEmptyARs_NoFallback_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim ac As ACProyecto
    Dim emptyARs As Scripting.Dictionary
    Dim estado As EnumEstadoAC
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    CacheTrustDiagnostics.Reset True
    Set ac = New ACProyecto
    Set emptyARs = New Scripting.Dictionary
    emptyARs.CompareMode = TextCompare

    ac.IdAccionCorrectiva = "900039101"
    Set ac.ARs = emptyARs
    TestHelper.AddLog logs, "Arrange: ACProyecto with explicitly loaded-empty ARs"

    estado = ac.EstadoCalculado
    TestHelper.AddLog logs, "Act: ACProyecto.EstadoCalculado evaluated"

    Call TestHelper.AssertTrue(estado = EnumEstadoAC.SINACCIONES, "loaded-empty ARs resolve AC state as SINACCIONES", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(CacheTrustDiagnostics.FallbackCount = 0, "cache-hit loaded-empty ARs must not call DAO fallback", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_CacheTrust_LoadedEmptyARs_NoFallback_Atomic = TestHelper.BuildJsonOk(logs, "loaded_empty_ars_no_fallback")
    Exit Function

Fail:
    Test_CacheTrust_LoadedEmptyARs_NoFallback_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    TestHelper.AddLog logs, "FallbackCount=" & CStr(CacheTrustDiagnostics.FallbackCount) & ", LastBoundary=" & CacheTrustDiagnostics.LastBoundary
    Test_CacheTrust_LoadedEmptyARs_NoFallback_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_CacheTrust_LoadedEmptyRiesgos_NoFallback_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim nc As NCProyecto
    Dim emptyRiesgos As Scripting.Dictionary
    Dim riesgos As Scripting.Dictionary
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    CacheTrustDiagnostics.Reset True
    Set nc = New NCProyecto
    Set emptyRiesgos = New Scripting.Dictionary
    emptyRiesgos.CompareMode = TextCompare

    nc.IDNoConformidad = "900039001"
    Set nc.Riesgos = emptyRiesgos
    TestHelper.AddLog logs, "Arrange: NCProyecto with explicitly loaded-empty Riesgos"

    Set riesgos = nc.Riesgos
    TestHelper.AddLog logs, "Act: NCProyecto.Riesgos evaluated"

    Call TestHelper.AssertTrue(Not riesgos Is Nothing, "loaded-empty risks returns a dictionary", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(riesgos.count = 0, "loaded-empty risks preserves zero cardinality", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(CacheTrustDiagnostics.FallbackCount = 0, "cache-hit loaded-empty risks must not call DAO fallback", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_CacheTrust_LoadedEmptyRiesgos_NoFallback_Atomic = TestHelper.BuildJsonOk(logs, "loaded_empty_riesgos_no_fallback")
    Exit Function

Fail:
    Test_CacheTrust_LoadedEmptyRiesgos_NoFallback_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    TestHelper.AddLog logs, "FallbackCount=" & CStr(CacheTrustDiagnostics.FallbackCount) & ", LastBoundary=" & CacheTrustDiagnostics.LastBoundary
    Test_CacheTrust_LoadedEmptyRiesgos_NoFallback_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_CacheTrust_ARParentLink_NoFallback_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim ac As ACProyecto
    Dim ar As ARProyecto
    Dim parent As ACProyecto
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    CacheTrustDiagnostics.Reset True
    Set ac = New ACProyecto
    Set ar = New ARProyecto

    ac.IdAccionCorrectiva = "900039101"
    ar.IdAccionCorrectiva = ac.IdAccionCorrectiva
    Set ar.AC = ac
    TestHelper.AddLog logs, "Arrange: ARProyecto linked to in-memory ACProyecto parent"

    Set parent = ar.AC
    TestHelper.AddLog logs, "Act: ARProyecto.AC evaluated"

    Call TestHelper.AssertTrue(parent Is ac, "AR parent link reuses the in-memory AC object", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(CacheTrustDiagnostics.FallbackCount = 0, "cache-hit AR parent read must not call DAO fallback", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_CacheTrust_ARParentLink_NoFallback_Atomic = TestHelper.BuildJsonOk(logs, "ar_parent_link_no_fallback")
    Exit Function

Fail:
    Test_CacheTrust_ARParentLink_NoFallback_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    TestHelper.AddLog logs, "FallbackCount=" & CStr(CacheTrustDiagnostics.FallbackCount) & ", LastBoundary=" & CacheTrustDiagnostics.LastBoundary
    Test_CacheTrust_ARParentLink_NoFallback_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function
