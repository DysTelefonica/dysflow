Attribute VB_Name = "Test_IndicadoresTelemetry"
Option Compare Database
Option Explicit

Public Function Test_IndicadoresTelemetry_RegistraEtapas_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim telemetry As Scripting.Dictionary
    Dim resumen As String
    Dim pError As String
    On Error GoTo errores

    Set logs = TestHelper.NewLogs

    Set telemetry = Indicadores_TelemetriaIniciar("PROYECTO", True, pError)
    Call Indicadores_TelemetriaEtapa(telemetry, "cache-start", pError)
    Call Indicadores_TelemetriaEtapa(telemetry, "cache-finish", pError)
    resumen = Indicadores_TelemetriaResumen(telemetry, pError)

    Call TestHelper.AssertTrue(pError = "", "La telemetria activa no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, resumen, "modo=PROYECTO", vbTextCompare) > 0, "Resumen debe incluir modo PROYECTO", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, resumen, "cache-start", vbTextCompare) > 0, "Resumen debe incluir etapa cache-start", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, resumen, "cache-finish", vbTextCompare) > 0, "Resumen debe incluir etapa cache-finish", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, resumen, "totalMs=", vbTextCompare) > 0, "Resumen debe incluir duracion total", logs, assertError)

    If assertError <> "" Then
        Test_IndicadoresTelemetry_RegistraEtapas_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_IndicadoresTelemetry_RegistraEtapas_Atomic = TestHelper.BuildJsonOk(logs, resumen)
    End If
    Exit Function
errores:
    Test_IndicadoresTelemetry_RegistraEtapas_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_IndicadoresTelemetry_DeshabilitadaNoEmiteResumen_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim telemetry As Scripting.Dictionary
    Dim resumen As String
    Dim pError As String
    On Error GoTo errores

    Set logs = TestHelper.NewLogs

    Set telemetry = Indicadores_TelemetriaIniciar("PROYECTO", False, pError)
    Call Indicadores_TelemetriaEtapa(telemetry, "cache-start", pError)
    resumen = Indicadores_TelemetriaResumen(telemetry, pError)

    Call TestHelper.AssertTrue(pError = "", "Telemetria deshabilitada no debe cambiar comportamiento", logs, assertError)
    Call TestHelper.AssertTrue(resumen = "", "Telemetria deshabilitada no debe emitir resumen", logs, assertError)

    If assertError <> "" Then
        Test_IndicadoresTelemetry_DeshabilitadaNoEmiteResumen_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_IndicadoresTelemetry_DeshabilitadaNoEmiteResumen_Atomic = TestHelper.BuildJsonOk(logs, "telemetry_disabled_ok")
    End If
    Exit Function
errores:
    Test_IndicadoresTelemetry_DeshabilitadaNoEmiteResumen_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_IndicadoresTelemetry_CacheEvidence_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim telemetry As Scripting.Dictionary
    Dim resumen As String
    Dim pError As String
    On Error GoTo errores

    Set logs = TestHelper.NewLogs

    Set telemetry = Indicadores_TelemetriaIniciar("PROYECTO", True, pError)
    Call Indicadores_TelemetriaCacheEstado(telemetry, "startup", False, pError)
    Call Indicadores_TelemetriaCacheEstado(telemetry, "after-cache-load", True, pError)
    resumen = Indicadores_TelemetriaResumen(telemetry, pError)

    Call TestHelper.AssertTrue(pError = "", "Evidencia de cache no debe fallar", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, resumen, "startup=MISS", vbTextCompare) > 0, "Resumen debe registrar cache inicial como MISS", logs, assertError)
    Call TestHelper.AssertTrue(InStr(1, resumen, "after-cache-load=HIT", vbTextCompare) > 0, "Resumen debe registrar cache cargado como HIT", logs, assertError)

    If assertError <> "" Then
        Test_IndicadoresTelemetry_CacheEvidence_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Else
        Test_IndicadoresTelemetry_CacheEvidence_Atomic = TestHelper.BuildJsonOk(logs, resumen)
    End If
    Exit Function
errores:
    Test_IndicadoresTelemetry_CacheEvidence_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function
