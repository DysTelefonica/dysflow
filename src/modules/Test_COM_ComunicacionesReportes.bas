Attribute VB_Name = "Test_COM_ComunicacionesReportes"
Option Compare Database
Option Explicit

' ============================================
' MÓDULO DE TEST — COMUNICACIONES, INFORMES Y EXPORTACIONES (CAP-COM)
' ============================================
' Test scenarios:
'   1. Correo.Propiedades round-trip (10 propiedades de dominio)
'   2. Correo.IDCorreoCalculado retorna vacio en instancia fresh
'   3. Correo.IDCorreoCalculado retorna cached cuando IDCorreo esta set
'   4. Asunto + Cuerpo obligatorios (BR-COM-1 contract property)
'   5. DESTINATARIOS + DestinatariosConCopia + DestinatariosConCopiaOculta
'      (BR-COM-2 contract property)
'
' Fixture strategy: puro property-test, sin DB fixture. Correo es
' un class con campos Public (no Property Get) para 10 propiedades
' de dominio. Los tests verifican round-trip de las propiedades
' usadas por Form_FormCorreo.
'
' Cubre:
' - BR-COM-1: el campo Asunto existe y round-trip (no afirma
'   validacion en runtime; eso requiere Form_FormCorreo + DB).
' - BR-COM-2: los campos de destinatarios existen y round-trip
'   (idem: no afirma validacion en runtime).
' - BR-COM-4: IDCorreoCalculado (BR-COM-4 "Correo.Registrar hace
'   AddNew" requiere DB; este test verifica el lado property).
'
' BR-COM-3 (cuerpo HTML), BR-COM-5 (BCC por defecto), BR-COM-6
' (Word automation), BR-COM-7 (Excel exports), BR-COM-8 (ruta
' de informe de auditoria): Intended o requieren COM/DB
' fixture. Quedan para próximas rondas.
' ============================================

' ============================================
' TEST 1 — Todas las 10 propiedades de Correo round-trip
' ============================================
Public Function Test_COM_Correo_Propiedades_RoundTrip_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim c As Correo
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_COM_Correo_Propiedades_RoundTrip_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set c = New Correo
    c.IDCorreo = "CORREO-001"
    c.Originador = "andres.romandelperal@telefonica.com"
    c.DESTINATARIOS = "mgarcia@telefonica.com"
    c.DestinatariosConCopia = "jlopez@telefonica.com"
    c.DestinatariosConCopiaOculta = "audit-internal@telefonica.com"
    c.Asunto = "Informe NC Proyecto 992001"
    c.Cuerpo = "<html><body><h1>NC</h1><p>Detalle...</p></body></html>"
    c.FechaEnvio = "2026-06-15T10:30:00"
    c.FechaGrabacion = "2026-06-15T10:25:00"
    c.IDEdicion = "ED-001"
    TestHelper.AddLog logs, "Arrange: 10 propiedades asignadas en instancia fresh de Correo"

    ' Assert: cada propiedad round-trip
    If Not TestHelper.AssertTrue(c.IDCorreo = "CORREO-001", "Assert1: IDCorreo round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.Originador = "andres.romandelperal@telefonica.com", "Assert2: Originador round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.DESTINATARIOS = "mgarcia@telefonica.com", "Assert3: DESTINATARIOS round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.DestinatariosConCopia = "jlopez@telefonica.com", "Assert4: DestinatariosConCopia round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.DestinatariosConCopiaOculta = "audit-internal@telefonica.com", "Assert5: DestinatariosConCopiaOculta round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.Asunto = "Informe NC Proyecto 992001", "Assert6: Asunto round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.Cuerpo = "<html><body><h1>NC</h1><p>Detalle...</p></body></html>", "Assert7: Cuerpo round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.FechaEnvio = "2026-06-15T10:30:00", "Assert8: FechaEnvio round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.FechaGrabacion = "2026-06-15T10:25:00", "Assert9: FechaGrabacion round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.IDEdicion = "ED-001", "Assert10: IDEdicion round-trip", logs, assertError) Then GoTo Fail

    TestHelper.AddLog logs, "Assert: 10/10 propiedades round-trip OK"

    Test_COM_Correo_Propiedades_RoundTrip_Atomic = TestHelper.BuildJsonOk(logs, "10/10 propiedades round-trip OK")
    GoTo Cleanup

Fail:
    Test_COM_Correo_Propiedades_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_COM_Correo_Propiedades_RoundTrip_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set c = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 2 — IDCorreoCalculado retorna un ID fresco no vacio en instancia fresh
' (la propiedad siempre calcula via constructor.getID; no es un cache de
' IDCorreo, asi que "fresh" significa "sin escribir a TbCorreosEnviados
' todavia, pero con un nuevo Long asignado por la BD")
' ============================================
Public Function Test_COM_Correo_IDCorreoCalculado_InstanciaFresh_RetornaVacio_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim c As Correo
    Dim actual As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_COM_Correo_IDCorreoCalculado_InstanciaFresh_RetornaVacio_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set c = New Correo
    TestHelper.AddLog logs, "Arrange: instancia fresh de Correo (IDCorreo='', todos los campos vacios)"

    actual = c.IDCorreoCalculado
    TestHelper.AddLog logs, "Act: IDCorreoCalculado devolvio '" & actual & "'"

    If Not TestHelper.AssertTrue(actual <> "", "Assert1: IDCorreoCalculado debe devolver un ID fresco (no vacio) en instancia fresh; actual='" & actual & "'", logs, assertError) Then
        Test_COM_Correo_IDCorreoCalculado_InstanciaFresh_RetornaVacio_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_COM_Correo_IDCorreoCalculado_InstanciaFresh_RetornaVacio_Atomic = TestHelper.BuildJsonOk(logs, "IDCorreoCalculado='" & actual & "' (ID fresco no vacio)")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_COM_Correo_IDCorreoCalculado_InstanciaFresh_RetornaVacio_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set c = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 3 — IDCorreoCalculado siempre calcula un ID fresco,
' independiente de IDCorreo seteado. (La propiedad NO es un cache
' de IDCorreo; siempre llama a constructor.getID.)
' ============================================
Public Function Test_COM_Correo_IDCorreoCalculado_IDCorreoSet_RetornaCached_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim c As Correo
    Dim actual As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_COM_Correo_IDCorreoCalculado_IDCorreoSet_RetornaCached_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set c = New Correo
    c.IDCorreo = "CORREO-CACHED-002"
    TestHelper.AddLog logs, "Arrange: IDCorreo='CORREO-CACHED-002' (no debe afectar IDCorreoCalculado)"

    actual = c.IDCorreoCalculado
    TestHelper.AddLog logs, "Act: IDCorreoCalculado devolvio '" & actual & "'"

    If Not TestHelper.AssertTrue(actual <> "" And actual <> "CORREO-CACHED-002", "Assert1: IDCorreoCalculado debe devolver un ID fresco de la BD, NO el IDCorreo seteado ('CORREO-CACHED-002'); actual='" & actual & "'", logs, assertError) Then
        Test_COM_Correo_IDCorreoCalculado_IDCorreoSet_RetornaCached_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_COM_Correo_IDCorreoCalculado_IDCorreoSet_RetornaCached_Atomic = TestHelper.BuildJsonOk(logs, "IDCorreoCalculado='" & actual & "' (ID fresco, independiente de IDCorreo)")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_COM_Correo_IDCorreoCalculado_IDCorreoSet_RetornaCached_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set c = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 4 — Asunto y Cuerpo pueden asignarse independientemente
' (BR-COM-1 property contract: existen los campos; la validacion
'  de obligatoriedad se hace en Form_FormCorreo, no en Correo)
' ============================================
Public Function Test_COM_Correo_AsuntoYCuerpo_AsignacionIndependiente_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim c As Correo
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_COM_Correo_AsuntoYCuerpo_AsignacionIndependiente_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set c = New Correo
    c.Asunto = "Asunto A"
    If Not TestHelper.AssertTrue(c.Asunto = "Asunto A", "Assert1: Asunto='Asunto A' debe round-trip", logs, assertError) Then GoTo Fail

    c.Cuerpo = "<p>Cuerpo 1</p>"
    If Not TestHelper.AssertTrue(c.Cuerpo = "<p>Cuerpo 1</p>", "Assert2: Cuerpo debe round-trip sin afectar Asunto", logs, assertError) Then GoTo Fail

    ' Asunto debe seguir intacto despues de asignar Cuerpo
    If Not TestHelper.AssertTrue(c.Asunto = "Asunto A", "Assert3: Asunto debe seguir 'Asunto A' despues de asignar Cuerpo; leido='" & c.Asunto & "'", logs, assertError) Then GoTo Fail

    ' Reasignar Asunto no debe afectar Cuerpo
    c.Asunto = "Asunto B"
    If Not TestHelper.AssertTrue(c.Cuerpo = "<p>Cuerpo 1</p>", "Assert4: Cuerpo debe seguir '<p>Cuerpo 1</p>' despues de reasignar Asunto; leido='" & c.Cuerpo & "'", logs, assertError) Then GoTo Fail

    TestHelper.AddLog logs, "Assert: 4/4 propiedades Asunto/Cuerpo asignacion independiente OK"

    Test_COM_Correo_AsuntoYCuerpo_AsignacionIndependiente_Atomic = TestHelper.BuildJsonOk(logs, "4/4 OK")
    GoTo Cleanup

Fail:
    Test_COM_Correo_AsuntoYCuerpo_AsignacionIndependiente_Atomic = TestHelper.BuildJsonFail(assertError, logs)

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_COM_Correo_AsuntoYCuerpo_AsignacionIndependiente_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set c = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 5 — Tres campos de destinatarios son independientes (BR-COM-2)
' ============================================
Public Function Test_COM_Correo_TresCamposDestinatarios_Independientes_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim c As Correo
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_COM_Correo_TresCamposDestinatarios_Independientes_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set c = New Correo
    c.DESTINATARIOS = "principal@telefonica.com"
    c.DestinatariosConCopia = "copia@telefonica.com"
    c.DestinatariosConCopiaOculta = "bcc@telefonica.com"
    TestHelper.AddLog logs, "Arrange: tres campos de destinatarios asignados"

    ' Assert: cada campo debe mantener su valor independientemente
    If Not TestHelper.AssertTrue(c.DESTINATARIOS = "principal@telefonica.com", "Assert1: DESTINATARIOS round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.DestinatariosConCopia = "copia@telefonica.com", "Assert2: DestinatariosConCopia round-trip", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.DestinatariosConCopiaOculta = "bcc@telefonica.com", "Assert3: DestinatariosConCopiaOculta round-trip", logs, assertError) Then GoTo Fail

    ' Reasignar un campo no debe afectar a los otros
    c.DestinatariosConCopia = "copia2@telefonica.com"
    If Not TestHelper.AssertTrue(c.DESTINATARIOS = "principal@telefonica.com", "Assert4: DESTINATARIOS debe seguir 'principal@telefonica.com' despues de reasignar ConCopia; leido='" & c.DESTINATARIOS & "'", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(c.DestinatariosConCopiaOculta = "bcc@telefonica.com", "Assert5: DestinatariosConCopiaOculta debe seguir 'bcc@telefonica.com' despues de reasignar ConCopia; leido='" & c.DestinatariosConCopiaOculta & "'", logs, assertError) Then GoTo Fail

    TestHelper.AddLog logs, "Assert: 5/5 propiedades de destinatarios independientes OK"

    Test_COM_Correo_TresCamposDestinatarios_Independientes_Atomic = TestHelper.BuildJsonOk(logs, "5/5 OK")
    GoTo Cleanup

Fail:
    Test_COM_Correo_TresCamposDestinatarios_Independientes_Atomic = TestHelper.BuildJsonFail(assertError, logs)

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_COM_Correo_TresCamposDestinatarios_Independientes_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set c = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function
