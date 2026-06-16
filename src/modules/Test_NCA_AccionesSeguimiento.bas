Attribute VB_Name = "Test_NCA_AccionesSeguimiento"
Option Compare Database
Option Explicit

' ============================================
' MÓDULO DE TEST — NC AUDITORÍA ACCIONES Y SEGUIMIENTO (CAP-NCA-AF)
' ============================================
' Test scenarios:
'   1. NCAuditoria.Particula retorna "NO CONFORMIDAD" cuando Tipo="NC"
'   2. NCAuditoria.Particula retorna "OBSERVACIÓN" cuando Tipo="OB"
'   3. NCAuditoria.Particula retorna "OPORTUNIDAD DE MEJORA" cuando Tipo="OP"
'   4. NCAuditoria.Particula retorna vacío cuando Tipo no es NC/OB/OP
'   5. NCAuditoria.Titulo retorna vacío cuando Auditoria es Nothing (early exit)
'
' Fixture strategy: puro property-test, sin DB fixture. El calculo de
' Particula depende solo de Tipo; el calculo de Titulo depende de
' Auditoria.NombreAuditoria y Numero. Sin sandbox de BD, sin
' pre-cleanup, sin teardown. BeginTestSession por consistencia con
' el patron del repo.
'
' Cubre:
' - BR-NCA-AF-5 (parcial): verifica que NCAuditoria expone el
'   calculo de Particula segun Tipo; queda contrato pendiente para
'   formularios finos sobre costuras helper/servicio.
' - BR-NCA-AF-1 (parcial): verifica que Particula y Titulo son
'   property computadas sin requerir carga de Proyecto; queda
'   pendiente verificar que el resto de la capacidad (ACs/ARs/tareas)
'   no enruta por estado de acciones de Proyecto.
'
' BR-NCA-AF-2 (seleccion de informe/listado), BR-NCA-AF-3
' (indicadores con filtro de dominio), BR-NCA-AF-4 (ciclo de vida
' AC/AR): ya tienen cobertura runtime por `tests.vba.audit-gestion-helper.json`
' (11/11) y slices de `tests.vba.indicadores-caracterizacion.json`
' (3/3, 1/1). Esos manifests NO estan en esta rama; la cobertura
' es historica de staging. Faltan pruebas dedicadas de ciclo
' completo de AC/AR de auditoria (BR-NCA-AF-4) y de formularios
' finos sobre costuras (BR-NCA-AF-5); ambos son `Intended`
' pendientes de contrato de producto.
' ============================================

' ============================================
' TEST 1 — Particula retorna "NO CONFORMIDAD" cuando Tipo="NC"
' ============================================
Public Function Test_NCA_Particula_TipoNC_RetornaNoConformidad_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim nc As NCAuditoria
    Dim actual As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_NCA_Particula_TipoNC_RetornaNoConformidad_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set nc = New NCAuditoria
    nc.Tipo = "NC"
    TestHelper.AddLog logs, "Arrange: Tipo='NC'"

    actual = nc.Particula
    TestHelper.AddLog logs, "Act: Particula devolvio '" & actual & "'"

    If Not TestHelper.AssertTrue(actual = "NO CONFORMIDAD", "Assert1: Particula debe ser 'NO CONFORMIDAD' cuando Tipo='NC'; actual='" & actual & "'", logs, assertError) Then
        Test_NCA_Particula_TipoNC_RetornaNoConformidad_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_NCA_Particula_TipoNC_RetornaNoConformidad_Atomic = TestHelper.BuildJsonOk(logs, actual)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_NCA_Particula_TipoNC_RetornaNoConformidad_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set nc = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 2 — Particula retorna "OBSERVACIÓN" cuando Tipo="OB"
' ============================================
Public Function Test_NCA_Particula_TipoOB_RetornaObservacion_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim nc As NCAuditoria
    Dim actual As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_NCA_Particula_TipoOB_RetornaObservacion_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set nc = New NCAuditoria
    nc.Tipo = "OB"
    TestHelper.AddLog logs, "Arrange: Tipo='OB'"

    actual = nc.Particula
    TestHelper.AddLog logs, "Act: Particula devolvio '" & actual & "'"

    If Not TestHelper.AssertTrue(actual = "OBSERVACIÓN", "Assert1: Particula debe ser 'OBSERVACIÓN' cuando Tipo='OB'; actual='" & actual & "'", logs, assertError) Then
        Test_NCA_Particula_TipoOB_RetornaObservacion_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_NCA_Particula_TipoOB_RetornaObservacion_Atomic = TestHelper.BuildJsonOk(logs, actual)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_NCA_Particula_TipoOB_RetornaObservacion_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set nc = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 3 — Particula retorna "OPORTUNIDAD DE MEJORA" cuando Tipo="OP"
' ============================================
Public Function Test_NCA_Particula_TipoOP_RetornaOportunidadDeMejora_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim nc As NCAuditoria
    Dim actual As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_NCA_Particula_TipoOP_RetornaOportunidadDeMejora_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set nc = New NCAuditoria
    nc.Tipo = "OP"
    TestHelper.AddLog logs, "Arrange: Tipo='OP'"

    actual = nc.Particula
    TestHelper.AddLog logs, "Act: Particula devolvio '" & actual & "'"

    If Not TestHelper.AssertTrue(actual = "OPORTUNIDAD DE MEJORA", "Assert1: Particula debe ser 'OPORTUNIDAD DE MEJORA' cuando Tipo='OP'; actual='" & actual & "'", logs, assertError) Then
        Test_NCA_Particula_TipoOP_RetornaOportunidadDeMejora_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_NCA_Particula_TipoOP_RetornaOportunidadDeMejora_Atomic = TestHelper.BuildJsonOk(logs, actual)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_NCA_Particula_TipoOP_RetornaOportunidadDeMejora_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set nc = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 4 — Particula retorna vacío cuando Tipo no es NC/OB/OP
' ============================================
Public Function Test_NCA_Particula_TipoDesconocido_RetornaVacio_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim nc As NCAuditoria
    Dim actual As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_NCA_Particula_TipoDesconocido_RetornaVacio_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set nc = New NCAuditoria
    nc.Tipo = "ZZ"
    TestHelper.AddLog logs, "Arrange: Tipo='ZZ' (valor fuera del enu NC/OB/OP)"

    actual = nc.Particula
    TestHelper.AddLog logs, "Act: Particula devolvio '" & actual & "'"

    If Not TestHelper.AssertTrue(actual = "", "Assert1: Particula debe ser vacio cuando Tipo no es NC/OB/OP; actual='" & actual & "'", logs, assertError) Then
        Test_NCA_Particula_TipoDesconocido_RetornaVacio_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_NCA_Particula_TipoDesconocido_RetornaVacio_Atomic = TestHelper.BuildJsonOk(logs, "Particula='" & actual & "' (vacio para Tipo='ZZ')")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_NCA_Particula_TipoDesconocido_RetornaVacio_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set nc = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 5 — Titulo retorna vacío cuando Auditoria es Nothing (early exit BR-NCA-AF-5)
' ============================================
Public Function Test_NCA_Titulo_SinAuditoria_RetornaVacio_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim nc As NCAuditoria
    Dim actual As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_NCA_Titulo_SinAuditoria_RetornaVacio_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set nc = New NCAuditoria
    ' Auditoria queda Nothing por defecto (instancia fresh); Numero vacio
    TestHelper.AddLog logs, "Arrange: instancia fresh de NCAuditoria (Auditoria=Nothing, Numero='')"

    actual = nc.Titulo
    TestHelper.AddLog logs, "Act: Titulo devolvio '" & actual & "'"

    If Not TestHelper.AssertTrue(actual = "", "Assert1: Titulo debe ser vacio cuando Auditoria es Nothing (early exit); actual='" & actual & "'", logs, assertError) Then
        Test_NCA_Titulo_SinAuditoria_RetornaVacio_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_NCA_Titulo_SinAuditoria_RetornaVacio_Atomic = TestHelper.BuildJsonOk(logs, "Titulo='" & actual & "' (vacio por early exit)")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_NCA_Titulo_SinAuditoria_RetornaVacio_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set nc = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function
