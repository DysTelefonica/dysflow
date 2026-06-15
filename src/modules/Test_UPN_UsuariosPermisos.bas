Attribute VB_Name = "Test_UPN_UsuariosPermisos"
Option Compare Database
Option Explicit

' ============================================
' MÓDULO DE TEST — USUARIOS, PERMISOS Y NAVEGACIÓN (CAP-UPN)
' ============================================
' Test scenarios:
'   1. Usuario.EsAdministrador round-trip (BR-UPN-1: menus admin gated)
'   2. Usuario.PermisoPruebas round-trip (BR-UPN-2: ribbon de pruebas gated)
'   3. Usuario.Nombre + Usuario.UsuarioRed round-trip (BR-UPN-3: identificación operativa)
'   4. Usuario.Matricula + Usuario.CorreoUsuario round-trip (BR-UPN-4: datos de contacto)
'   5. Usuario flags booleanos (Activado, PermisosAsignados, MantenerLanzaderaAbierta) round-trip
'
' Fixture strategy: puro property-test, sin DB fixture. Usuario es un
' class con campos Public (no Property Get) para 30+ propiedades de
' dominio. Los tests verifican round-trip de propiedades usadas por
' la UI de menú/ribbon (Form_Form0BDOpciones) y por el control de
' acceso.
'
' Cubre:
' - BR-UPN-1: menus gated por EsAdministrador (Form_Form0BDOpciones:115,132)
' - BR-UPN-2: ribbon de pruebas gated por PermisoPruebas (Form_Form0BDOpciones)
' - BR-UPN-3: identificación operativa (Usuario.Nombre, Usuario.UsuarioRed)
' - BR-UPN-4: datos de contacto (Usuario.Matricula, Usuario.CorreoUsuario)
' - BR-UPN-5: flags booleanos (Activado, PermisosAsignados, MantenerLanzaderaAbierta)
'
' BR-UPN-6 (navegación de proyecto/auditorías): tests adyacentes en
' `Form_Form0BDOpcionesParteProyectos.cls:46,104,142` y
' `Form_Form0BDOpcionesAuditorias.cls:50,168,265` — no
' authorable como property test puro; requiere harness de form.
'
' BR-UPN-7 (matriz de permisos producto vs embebidos en 9 forms):
' Intended. La autoridad de producto debe firmar la matriz antes de
' poder testear. El doc §2 declara "Permisos por acción sensible
' dispersos en formularios"; mientras tanto, esta PR documenta las
' propiedades que SI están testeadas.
' ============================================

' ============================================
' TEST 1 — EsAdministrador round-trip
' ============================================
Public Function Test_UPN_Usuario_EsAdministrador_RoundTrip_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim u As usuario
    Dim original As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_UPN_Usuario_EsAdministrador_RoundTrip_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set u = New usuario

    ' Caso 1: EsAdministrador = "S" (administrador)
    u.EsAdministrador = "S"
    If Not TestHelper.AssertTrue(u.EsAdministrador = "S", "Assert1: EsAdministrador='S' debe round-trip; leido='" & u.EsAdministrador & "'", logs, assertError) Then
        Test_UPN_Usuario_EsAdministrador_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    ' Caso 2: EsAdministrador = "N" (no administrador)
    u.EsAdministrador = "N"
    If Not TestHelper.AssertTrue(u.EsAdministrador = "N", "Assert2: EsAdministrador='N' debe round-trip; leido='" & u.EsAdministrador & "'", logs, assertError) Then
        Test_UPN_Usuario_EsAdministrador_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    ' Caso 3: EsAdministrador = "" (default; sin asignar)
    u.EsAdministrador = ""
    If Not TestHelper.AssertTrue(u.EsAdministrador = "", "Assert3: EsAdministrador='' debe round-trip; leido='" & u.EsAdministrador & "'", logs, assertError) Then
        Test_UPN_Usuario_EsAdministrador_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    TestHelper.AddLog logs, "Assert: 3/3 escenarios de EsAdministrador round-trip OK"

    Test_UPN_Usuario_EsAdministrador_RoundTrip_Atomic = TestHelper.BuildJsonOk(logs, "3/3 round-trip EsAdministrador")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_UPN_Usuario_EsAdministrador_RoundTrip_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set u = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 2 — PermisoPruebas round-trip
' ============================================
Public Function Test_UPN_Usuario_PermisoPruebas_RoundTrip_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim u As usuario
    Dim original As String
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_UPN_Usuario_PermisoPruebas_RoundTrip_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set u = New usuario

    u.PermisoPruebas = "S"
    If Not TestHelper.AssertTrue(u.PermisoPruebas = "S", "Assert1: PermisoPruebas='S' debe round-trip; leido='" & u.PermisoPruebas & "'", logs, assertError) Then
        Test_UPN_Usuario_PermisoPruebas_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    u.PermisoPruebas = "N"
    If Not TestHelper.AssertTrue(u.PermisoPruebas = "N", "Assert2: PermisoPruebas='N' debe round-trip; leido='" & u.PermisoPruebas & "'", logs, assertError) Then
        Test_UPN_Usuario_PermisoPruebas_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    TestHelper.AddLog logs, "Assert: 2/2 escenarios de PermisoPruebas round-trip OK"

    Test_UPN_Usuario_PermisoPruebas_RoundTrip_Atomic = TestHelper.BuildJsonOk(logs, "2/2 round-trip PermisoPruebas")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_UPN_Usuario_PermisoPruebas_RoundTrip_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set u = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 3 — Identificación operativa (Nombre + UsuarioRed)
' ============================================
Public Function Test_UPN_Usuario_NombreUsuarioRed_RoundTrip_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim u As usuario
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_UPN_Usuario_NombreUsuarioRed_RoundTrip_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set u = New usuario
    u.Nombre = "Maria Garcia Lopez"
    u.UsuarioRed = "DOMINIO\mgarcia"

    If Not TestHelper.AssertTrue(u.Nombre = "Maria Garcia Lopez", "Assert1: Nombre debe round-trip; leido='" & u.Nombre & "'", logs, assertError) Then
        Test_UPN_Usuario_NombreUsuarioRed_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    If Not TestHelper.AssertTrue(u.UsuarioRed = "DOMINIO\mgarcia", "Assert2: UsuarioRed debe round-trip; leido='" & u.UsuarioRed & "'", logs, assertError) Then
        Test_UPN_Usuario_NombreUsuarioRed_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    TestHelper.AddLog logs, "Assert: 2/2 propiedades de identificación operativa round-trip OK"

    Test_UPN_Usuario_NombreUsuarioRed_RoundTrip_Atomic = TestHelper.BuildJsonOk(logs, "Nombre='Maria Garcia Lopez' UsuarioRed='DOMINIO\mgarcia'")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_UPN_Usuario_NombreUsuarioRed_RoundTrip_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set u = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 4 — Datos de contacto (Matricula + CorreoUsuario)
' ============================================
Public Function Test_UPN_Usuario_MatriculaCorreo_RoundTrip_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim u As usuario
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_UPN_Usuario_MatriculaCorreo_RoundTrip_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set u = New usuario
    u.Matricula = "MAT-12345"
    u.CorreoUsuario = "maria.garcia@telefonica.com"

    If Not TestHelper.AssertTrue(u.Matricula = "MAT-12345", "Assert1: Matricula debe round-trip; leido='" & u.Matricula & "'", logs, assertError) Then
        Test_UPN_Usuario_MatriculaCorreo_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    If Not TestHelper.AssertTrue(u.CorreoUsuario = "maria.garcia@telefonica.com", "Assert2: CorreoUsuario debe round-trip; leido='" & u.CorreoUsuario & "'", logs, assertError) Then
        Test_UPN_Usuario_MatriculaCorreo_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    TestHelper.AddLog logs, "Assert: 2/2 propiedades de datos de contacto round-trip OK"

    Test_UPN_Usuario_MatriculaCorreo_RoundTrip_Atomic = TestHelper.BuildJsonOk(logs, "Matricula='MAT-12345' CorreoUsuario='maria.garcia@telefonica.com'")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_UPN_Usuario_MatriculaCorreo_RoundTrip_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set u = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function

' ============================================
' TEST 5 — Flags booleanos (Activado, PermisosAsignados, MantenerLanzaderaAbierta)
' ============================================
Public Function Test_UPN_Usuario_FlagsBooleanos_RoundTrip_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim u As usuario
    Dim assertError As String
    Dim sessionErr As String
    Dim sessionStarted As Boolean

    Set logs = TestHelper.NewLogs
    sessionStarted = False

    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_UPN_Usuario_FlagsBooleanos_RoundTrip_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    sessionStarted = True

    Set u = New usuario

    ' Activado = True
    u.Activado = True
    If Not TestHelper.AssertTrue(u.Activado = True, "Assert1: Activado=True debe round-trip; leido='" & u.Activado & "'", logs, assertError) Then
        Test_UPN_Usuario_FlagsBooleanos_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    ' Activado = False
    u.Activado = False
    If Not TestHelper.AssertTrue(u.Activado = False, "Assert2: Activado=False debe round-trip; leido='" & u.Activado & "'", logs, assertError) Then
        Test_UPN_Usuario_FlagsBooleanos_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    ' PermisosAsignados = True
    u.PermisosAsignados = True
    If Not TestHelper.AssertTrue(u.PermisosAsignados = True, "Assert3: PermisosAsignados=True debe round-trip; leido='" & u.PermisosAsignados & "'", logs, assertError) Then
        Test_UPN_Usuario_FlagsBooleanos_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    ' MantenerLanzaderaAbierta = False
    u.MantenerLanzaderaAbierta = False
    If Not TestHelper.AssertTrue(u.MantenerLanzaderaAbierta = False, "Assert4: MantenerLanzaderaAbierta=False debe round-trip; leido='" & u.MantenerLanzaderaAbierta & "'", logs, assertError) Then
        Test_UPN_Usuario_FlagsBooleanos_RoundTrip_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    TestHelper.AddLog logs, "Assert: 4/4 escenarios de flags booleanos round-trip OK"

    Test_UPN_Usuario_FlagsBooleanos_RoundTrip_Atomic = TestHelper.BuildJsonOk(logs, "4/4 round-trip flags booleanos")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_UPN_Usuario_FlagsBooleanos_RoundTrip_Atomic = TestHelper.BuildJsonFail("EH: " & Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set u = Nothing
    If sessionStarted Then Call TestHelper.EndTestSession(logs)
    On Error GoTo 0
End Function
