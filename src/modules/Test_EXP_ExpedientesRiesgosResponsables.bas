Attribute VB_Name = "Test_EXP_ExpedientesRiesgosResponsables"
Option Compare Database
Option Explicit

' ============================================
' MÓDULO DE TEST — EXPEDIENTES, RIESGOS Y RESPONSABLES (CAP-EXP)
' ============================================
' Test scenarios:
'   1. TextoExpediente con Nemotecnico + CodExp -> "Nemotecnico (CodExp)"
'   2. TextoExpediente con solo Nemotecnico (CodExp vacio) -> "Nemotecnico"
'   3. TextoExpediente con solo CodExp (Nemotecnico vacio) -> "CodExp"
'   4. TextoExpediente cachea el calculo en la primera lectura
'   5. Expediente expone todas las propiedades de dominio (BR-EXP-5)
'
' Fixture strategy: puro property-test, sin DB fixture. Los tests no
' requieren sandbox de BD porque manipulan propiedades en memoria y
' el calculo de TextoExpediente es pure (depende solo de
' Nemotecnico y CodExp). BeginTestSession se invoca por
' consistencia con el patron del repo (m_TestingMode, TempVars
' en estado conocido) pero no es estrictamente necesario para
' estos tests.
' Cubre BR-EXP-4 y BR-EXP-5.
' ============================================

' ============================================
' TEST 1 — TextoExpediente con Nemotecnico + CodExp -> "Nemotecnico (CodExp)"
' ============================================
Public Function Test_EXP_TextoExpediente_NemotecnicoYCodExp_FormateaConParentesis_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim exp As Expediente
    Dim actual As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_EXP_TextoExpediente_NemotecnicoYCodExp_FormateaConParentesis_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set exp = New Expediente
    exp.Nemotecnico = "EXP-NEMO-001"
    exp.CodExp = "COD-001"
    TestHelper.AddLog logs, "Arrange: Nemotecnico='EXP-NEMO-001' CodExp='COD-001'"

    actual = exp.TextoExpediente
    TestHelper.AddLog logs, "Act: TextoExpediente devolvio '" & actual & "'"

    If Not TestHelper.AssertTrue(actual = "EXP-NEMO-001 (COD-001)", "Assert1: TextoExpediente debe ser 'EXP-NEMO-001 (COD-001)' con Nemotecnico y CodExp presentes; actual='" & actual & "'", logs, assertError) Then
        Test_EXP_TextoExpediente_NemotecnicoYCodExp_FormateaConParentesis_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_EXP_TextoExpediente_NemotecnicoYCodExp_FormateaConParentesis_Atomic = TestHelper.BuildJsonOk(logs, actual)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_EXP_TextoExpediente_NemotecnicoYCodExp_FormateaConParentesis_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set exp = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 2 — TextoExpediente con solo Nemotecnico (CodExp vacio) -> "Nemotecnico"
' ============================================
Public Function Test_EXP_TextoExpediente_SoloNemotecnico_FormateaSinParentesis_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim exp As Expediente
    Dim actual As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_EXP_TextoExpediente_SoloNemotecnico_FormateaSinParentesis_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set exp = New Expediente
    exp.Nemotecnico = "EXP-NEMO-002"
    exp.CodExp = ""
    TestHelper.AddLog logs, "Arrange: Nemotecnico='EXP-NEMO-002' CodExp=''"

    actual = exp.TextoExpediente
    TestHelper.AddLog logs, "Act: TextoExpediente devolvio '" & actual & "'"

    If Not TestHelper.AssertTrue(actual = "EXP-NEMO-002", "Assert1: TextoExpediente debe ser 'EXP-NEMO-002' (sin parentesis) cuando CodExp vacio; actual='" & actual & "'", logs, assertError) Then
        Test_EXP_TextoExpediente_SoloNemotecnico_FormateaSinParentesis_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_EXP_TextoExpediente_SoloNemotecnico_FormateaSinParentesis_Atomic = TestHelper.BuildJsonOk(logs, actual)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_EXP_TextoExpediente_SoloNemotecnico_FormateaSinParentesis_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set exp = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 3 — TextoExpediente con solo CodExp (Nemotecnico vacio) -> "CodExp"
' ============================================
Public Function Test_EXP_TextoExpediente_SoloCodExp_FormateaSinNemotecnico_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim exp As Expediente
    Dim actual As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_EXP_TextoExpediente_SoloCodExp_FormateaSinNemotecnico_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set exp = New Expediente
    exp.Nemotecnico = ""
    exp.CodExp = "COD-003"
    TestHelper.AddLog logs, "Arrange: Nemotecnico='' CodExp='COD-003'"

    actual = exp.TextoExpediente
    TestHelper.AddLog logs, "Act: TextoExpediente devolvio '" & actual & "'"

    If Not TestHelper.AssertTrue(actual = "COD-003", "Assert1: TextoExpediente debe ser 'COD-003' (sin Nemotecnico) cuando solo CodExp presente; actual='" & actual & "'", logs, assertError) Then
        Test_EXP_TextoExpediente_SoloCodExp_FormateaSinNemotecnico_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_EXP_TextoExpediente_SoloCodExp_FormateaSinNemotecnico_Atomic = TestHelper.BuildJsonOk(logs, actual)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_EXP_TextoExpediente_SoloCodExp_FormateaSinNemotecnico_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set exp = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 4 — TextoExpediente cachea el calculo en la primera lectura
' ============================================
Public Function Test_EXP_TextoExpediente_CacheMemoization_ReutilizaCacheEnSegundaLectura_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim exp As Expediente
    Dim firstRead As String
    Dim secondRead As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_EXP_TextoExpediente_CacheMemoization_ReutilizaCacheEnSegundaLectura_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set exp = New Expediente
    exp.Nemotecnico = "EXP-NEMO-004"
    exp.CodExp = "COD-004"
    TestHelper.AddLog logs, "Arrange: Nemotecnico='EXP-NEMO-004' CodExp='COD-004'"

    firstRead = exp.TextoExpediente
    TestHelper.AddLog logs, "Act1: primera lectura TextoExpediente='" & firstRead & "'"

    ' Cambiar Nemotecnico después de la primera lectura; si el cache funciona,
    ' TextoExpediente debe seguir devolviendo el primer calculo cacheado.
    exp.Nemotecnico = "OTRO-NEMO-DISTINTO"
    TestHelper.AddLog logs, "Arrange2: Nemotecnico mutado a 'OTRO-NEMO-DISTINTO' post-lectura"

    secondRead = exp.TextoExpediente
    TestHelper.AddLog logs, "Act2: segunda lectura TextoExpediente='" & secondRead & "'"

    If Not TestHelper.AssertTrue(secondRead = firstRead, "Assert1: TextoExpediente debe devolver el primer calculo cacheado aun cuando Nemotecnico haya mutado; firstRead='" & firstRead & "' secondRead='" & secondRead & "'", logs, assertError) Then
        Test_EXP_TextoExpediente_CacheMemoization_ReutilizaCacheEnSegundaLectura_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_EXP_TextoExpediente_CacheMemoization_ReutilizaCacheEnSegundaLectura_Atomic = TestHelper.BuildJsonOk(logs, "firstRead='" & firstRead & "' secondRead='" & secondRead & "'")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_EXP_TextoExpediente_CacheMemoization_ReutilizaCacheEnSegundaLectura_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set exp = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 5 — Expediente expone todas las propiedades de dominio (BR-EXP-5)
' ============================================
Public Function Test_EXP_Expediente_ExponePropiedades_PropertiesRoundTrip_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim exp As Expediente
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_EXP_Expediente_ExponePropiedades_PropertiesRoundTrip_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set exp = New Expediente
    exp.IDExpediente = "EXP-005"
    exp.Nemotecnico = "EXP-NEMO-005"
    exp.CodExp = "COD-005"
    exp.CodExpLargo = "COD-005-LARGO"
    exp.Titulo = "Expediente de prueba 005"
    exp.Estado = "En curso"
    exp.CodProyecto = "PROJ-005"
    exp.IDResponsableCalidad = "USR-005"
    exp.IDUsuarioCreacion = "USR-CREATOR"
    exp.IDUsuarioUltimoCambio = "USR-EDITOR"
    exp.Ambito = "Nacional"
    exp.Tipo = "Obras"
    exp.NPedido = "PED-005"
    TestHelper.AddLog logs, "Arrange: 12 propiedades asignadas en instancia fresh de Expediente"

    ' Assert: cada propiedad round-trip devuelve el valor asignado
    If Not TestHelper.AssertTrue(exp.IDExpediente = "EXP-005", "Assert1: IDExpediente round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.Nemotecnico = "EXP-NEMO-005", "Assert2: Nemotecnico round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.CodExp = "COD-005", "Assert3: CodExp round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.CodExpLargo = "COD-005-LARGO", "Assert4: CodExpLargo round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.Titulo = "Expediente de prueba 005", "Assert5: Titulo round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.Estado = "En curso", "Assert6: Estado round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.CodProyecto = "PROJ-005", "Assert7: CodProyecto round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.IDResponsableCalidad = "USR-005", "Assert8: IDResponsableCalidad round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.IDUsuarioCreacion = "USR-CREATOR", "Assert9: IDUsuarioCreacion round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.IDUsuarioUltimoCambio = "USR-EDITOR", "Assert10: IDUsuarioUltimoCambio round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.Ambito = "Nacional", "Assert11: Ambito round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.Tipo = "Obras", "Assert12: Tipo round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(exp.NPedido = "PED-005", "Assert13: NPedido round-trip", logs, assertError) Then GoTo Fail

    TestHelper.AddLog logs, "Assert: 13/13 propiedades round-trip correctas"

    Test_EXP_Expediente_ExponePropiedades_PropertiesRoundTrip_Atomic = TestHelper.BuildJsonOk(logs, "13/13 propiedades round-trip OK")
    GoTo Cleanup

Fail:
    Test_EXP_Expediente_ExponePropiedades_PropertiesRoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_EXP_Expediente_ExponePropiedades_PropertiesRoundTrip_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set exp = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function
