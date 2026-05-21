Attribute VB_Name = "Test_BackendConfigPaths"
Option Compare Database
Option Explicit

Public Function Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_UsuarioAnteriorSeReescribe_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim entrada As String
    Dim esperado As String

    Set logs = TestHelper.NewLogs

    entrada = "C:\Users\adm1\AppData\Local\Temp\"
    esperado = "C:\Users\current-user\AppData\Local\Temp\"
    Call TestHelper.AssertTrue(SanitizarRutaUsuarioWindowsLocal(entrada, "C:\Users\current-user") = esperado, _
                             "Ruta local con usuario anterior debe reescribirse al USERPROFILE actual", _
                             logs, assertError)

    If assertError <> "" Then
        Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_UsuarioAnteriorSeReescribe_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        Exit Function
    End If

    Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_UsuarioAnteriorSeReescribe_Atomic = TestHelper.BuildJsonOk(logs, "usuario_anterior_reescrito")
End Function

Public Function Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_ConYSinBarraFinal_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim conBarra As String
    Dim sinBarra As String
    Dim esperado As String

    Set logs = TestHelper.NewLogs

    conBarra = "C:\Users\adm1\AppData\Local\Temp\"
    sinBarra = "C:\Users\adm1\AppData\Local\Temp"
    esperado = "C:\Users\current-user\AppData\Local\Temp\"

    Call TestHelper.AssertTrue(SanitizarRutaUsuarioWindowsLocal(conBarra, "C:\Users\current-user") = esperado, _
                             "Ruta con barra final debe conservar el sufijo exacto tras normalizar usuario", _
                             logs, assertError)
    If assertError <> "" Then
        Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_ConYSinBarraFinal_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        Exit Function
    End If

    esperado = "C:\Users\current-user\AppData\Local\Temp"
    Call TestHelper.AssertTrue(SanitizarRutaUsuarioWindowsLocal(sinBarra, "C:\Users\current-user") = esperado, _
                             "Ruta sin barra final debe conservar ausencia de barra final", _
                             logs, assertError)
    If assertError <> "" Then
        Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_ConYSinBarraFinal_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        Exit Function
    End If

    Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_ConYSinBarraFinal_Atomic = _
        TestHelper.BuildJsonOk(logs, "usuario_anterior_normaliza_barra_final")
End Function

Public Function Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_NoModificaRutasActuales_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim usuarioActual As String
    Dim entrada As String

    Set logs = TestHelper.NewLogs
    usuarioActual = GetCurrentUserProfile()

    entrada = usuarioActual & "\AppData\Local\Temp\"
    Call TestHelper.AssertTrue(SanitizarRutaUsuarioWindowsLocal(entrada) = entrada, _
                             "Ruta con usuario actual NO debe modificarse", logs, assertError)

    If assertError <> "" Then
        Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_NoModificaRutasActuales_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        Exit Function
    End If

    Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_NoModificaRutasActuales_Atomic = TestHelper.BuildJsonOk(logs, "ruta_actual_no_modificada")
End Function

Public Function Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_NoModificaRutaNoLocal_Atomic() As String
    Dim logs As Collection
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Call TestHelper.AssertTrue(SanitizarRutaUsuarioWindowsLocal("D:\Apps\X\") = "D:\Apps\X\", _
                             "Ruta D: no debe ser modificada", logs, assertError)

    If assertError <> "" Then
        Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_NoModificaRutaNoLocal_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        Exit Function
    End If

    Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_NoModificaRutaNoLocal_Atomic = TestHelper.BuildJsonOk(logs, "ruta_no_local_no_modificada")
End Function

Public Function Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_NoModificaUNC_Atomic() As String
    Dim logs As Collection
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Call TestHelper.AssertTrue(SanitizarRutaUsuarioWindowsLocal("\\server\share\X\") = "\\server\share\X\", _
                             "Ruta UNC no debe ser modificada", logs, assertError)

    If assertError <> "" Then
        Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_NoModificaUNC_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        Exit Function
    End If

    Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_NoModificaUNC_Atomic = TestHelper.BuildJsonOk(logs, "ruta_unc_no_modificada")
End Function

Public Function Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_EntradaVacia_Atomic() As String
    Dim logs As Collection
    Dim assertError As String

    Set logs = TestHelper.NewLogs
    Call TestHelper.AssertTrue(SanitizarRutaUsuarioWindowsLocal("") = "", "Ruta vacía debe devolver cadena vacía", logs, assertError)

    If assertError <> "" Then
        Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_EntradaVacia_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        Exit Function
    End If

    Test_BackendConfigPaths_SanitizarRutaUsuarioWindowsLocal_EntradaVacia_Atomic = TestHelper.BuildJsonOk(logs, "ruta_vacia_ok")
End Function

Public Function Test_BackendConfigPaths_LeeConfiguracionLocal_AnchoraRutasLocalesEnUserProfile_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim assertError As String
    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim rs As DAO.Recordset
    Dim inTrans As Boolean
    Dim cfgError As String
    Dim originalBackendActivo As String
    Dim originalRutaLocal As String
    Dim oldRutaLocal As String
    Dim esperadaAplicacionLocal As String
    Dim esperadaAplicacionesLocal As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, cfgError) Then
        Test_BackendConfigPaths_LeeConfiguracionLocal_AnchoraRutasLocalesEnUserProfile_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & cfgError, logs)
        Exit Function
    End If

    Set ws = DBEngine.Workspaces(0)
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT BackendActivo, RutaDirectorioAplicacion_LOCAL FROM TbConfiguracionBackends WHERE ID = 1", dbOpenDynaset)
    If rs.EOF Then
        Call TestHelper.EndTestSession(logs)
        Test_BackendConfigPaths_LeeConfiguracionLocal_AnchoraRutasLocalesEnUserProfile_Atomic = TestHelper.BuildJsonFail("TbConfiguracionBackends sin fila de configuración", logs)
        GoTo Cleanup
    End If

    originalBackendActivo = Trim$(Nz(rs.Fields("BackendActivo").Value, ""))
    originalRutaLocal = Trim$(Nz(rs.Fields("RutaDirectorioAplicacion_LOCAL").Value, ""))

    oldRutaLocal = "C:\Users\old-user-do-not-touch\AppData\Local\Temp\"

    inTrans = True
    ws.BeginTrans

    rs.Edit
    rs.Fields("BackendActivo").Value = "LOCAL"
    rs.Fields("RutaDirectorioAplicacion_LOCAL").Value = oldRutaLocal
    rs.Update

    If Not LeeConfiguracionLocal(cfgError) Then
        Call TestHelper.AddLog(logs, "LeeConfiguracionLocal() falló: " & cfgError)
        Call TestHelper.EndTestSession(logs)
        Test_BackendConfigPaths_LeeConfiguracionLocal_AnchoraRutasLocalesEnUserProfile_Atomic = TestHelper.BuildJsonFail(cfgError, logs)
        GoTo Cleanup
    End If

    esperadaAplicacionLocal = BuildRutaUsuarioActualSanitizada("\AppData\Local\Temp\")
    esperadaAplicacionesLocal = fso.GetParentFolderName(Left$(esperadaAplicacionLocal, Len(esperadaAplicacionLocal) - 1))
    If esperadaAplicacionesLocal <> "" And Right$(esperadaAplicacionesLocal, 1) <> "\" Then esperadaAplicacionesLocal = esperadaAplicacionesLocal & "\"

    Call TestHelper.AssertTrue(Left$(m_URLRutaAplicacionLocal, Len(GetCurrentUserProfile() & "\")) = GetCurrentUserProfile() & "\", _
                             "m_URLRutaAplicacionLocal debe anclarse al USERPROFILE", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(m_URLRutaAplicacionLocal = esperadaAplicacionLocal, _
                             "Ruta de aplicación local debe quedar sanitizada y normalizada", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(m_URLRutaAplicacionesLocal = esperadaAplicacionesLocal, _
                             "Ruta de aplicaciones local debe derivar del valor sanitizado", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.EndTestSession(logs)
    Test_BackendConfigPaths_LeeConfiguracionLocal_AnchoraRutasLocalesEnUserProfile_Atomic = TestHelper.BuildJsonOk(logs, "leeconfig_local_sanitizada")

Cleanup:
    On Error Resume Next
    If inTrans Then ws.Rollback
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
    Set ws = Nothing
    Exit Function

Fail:
    Call TestHelper.AddLog(logs, assertError)
    Call TestHelper.EndTestSession(logs)
    Test_BackendConfigPaths_LeeConfiguracionLocal_AnchoraRutasLocalesEnUserProfile_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    Call TestHelper.EndTestSession(logs)
    Call TestHelper.AddLog(logs, "Error: " & Err.Description)
    Test_BackendConfigPaths_LeeConfiguracionLocal_AnchoraRutasLocalesEnUserProfile_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    Resume Cleanup
End Function

Private Function BuildRutaUsuarioActualSanitizada(ByVal p_Suffix As String) As String
    Dim usuario As String

    usuario = GetCurrentUserProfile()
    If usuario = "" Then
        BuildRutaUsuarioActualSanitizada = ""
        Exit Function
    End If

    If Left$(p_Suffix, 1) <> "\" Then p_Suffix = "\" & p_Suffix

    BuildRutaUsuarioActualSanitizada = usuario & p_Suffix

    If Right$(BuildRutaUsuarioActualSanitizada, 1) <> "\" Then
        BuildRutaUsuarioActualSanitizada = BuildRutaUsuarioActualSanitizada & "\"
    End If
End Function

Private Function GetCurrentUserProfile() As String
    Dim perfil As String

    perfil = Trim$(Nz(Environ$("USERPROFILE"), ""))
    If Right$(perfil, 1) = "\" Then
        If Len(perfil) > 1 Then perfil = Left$(perfil, Len(perfil) - 1)
    End If

    GetCurrentUserProfile = perfil
End Function
