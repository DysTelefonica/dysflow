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
    Dim sessionStarted As Boolean
    Dim cfgError As String
    Dim resultError As String
    Dim rollbackError As String
    Dim oldRutaLocal As String
    Dim esperadaAplicacionLocal As String
    Dim esperadaAplicacionesLocal As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, cfgError) Then
        Test_BackendConfigPaths_LeeConfiguracionLocal_AnchoraRutasLocalesEnUserProfile_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & cfgError, logs)
        Exit Function
    End If
    sessionStarted = True

    If Not TestHelper.AssertSandboxBackend(logs, cfgError) Then
        resultError = "TESTS BLOCKED: " & cfgError
        GoTo Cleanup
    End If

    If Not EnsureBackendConfigFixture(logs, cfgError) Then
        resultError = "TESTS BLOCKED: " & cfgError
        GoTo Cleanup
    End If

    Set ws = DBEngine.Workspaces(0)
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT BackendActivo, RutaDirectorioAplicacion_LOCAL FROM TbConfiguracionBackends WHERE ID = 1", dbOpenDynaset)
    If rs.EOF Then
        resultError = "TbConfiguracionBackends sin fila singleton ID=1 tras EnsureBackendConfigFixture"
        GoTo Cleanup
    End If

    oldRutaLocal = "C:\Users\old-user-do-not-touch\AppData\Local\Temp\"

    ws.BeginTrans
    inTrans = True
    Call TestHelper.AddLog(logs, "Arrange: mutación controlada de TbConfiguracionBackends.ID=1 dentro de transacción DAO; rollback obligatorio antes de EndTestSession")

    rs.Edit
    rs.Fields("BackendActivo").Value = "LOCAL"
    rs.Fields("RutaDirectorioAplicacion_LOCAL").Value = oldRutaLocal
    rs.Update

    If Not LeeConfiguracionLocal(cfgError) Then
        Call TestHelper.AddLog(logs, "LeeConfiguracionLocal() falló: " & cfgError)
        resultError = cfgError
        GoTo Cleanup
    End If

    esperadaAplicacionLocal = BuildRutaUsuarioActualSanitizada("\AppData\Local\Temp\")
    esperadaAplicacionesLocal = fso.GetParentFolderName(Left$(esperadaAplicacionLocal, Len(esperadaAplicacionLocal) - 1))
    If esperadaAplicacionesLocal <> "" And Right$(esperadaAplicacionesLocal, 1) <> "\" Then esperadaAplicacionesLocal = esperadaAplicacionesLocal & "\"

    Call TestHelper.AssertTrue(Left$(m_URLRutaAplicacionLocal, Len(GetCurrentUserProfile() & "\")) = GetCurrentUserProfile() & "\", _
                             "m_URLRutaAplicacionLocal debe anclarse al USERPROFILE", logs, assertError)
    If assertError <> "" Then
        resultError = assertError
        GoTo Cleanup
    End If

    Call TestHelper.AssertTrue(m_URLRutaAplicacionLocal = esperadaAplicacionLocal, _
                             "Ruta de aplicación local debe quedar sanitizada y normalizada", logs, assertError)
    If assertError <> "" Then
        resultError = assertError
        GoTo Cleanup
    End If

    Call TestHelper.AssertTrue(m_URLRutaAplicacionesLocal = esperadaAplicacionesLocal, _
                             "Ruta de aplicaciones local debe derivar del valor sanitizado", logs, assertError)
    If assertError <> "" Then
        resultError = assertError
        GoTo Cleanup
    End If

Cleanup:
    On Error Resume Next
    Err.Clear
    If Not rs Is Nothing Then rs.Close
    Err.Clear
    If inTrans Then
        ws.Rollback
        If Err.Number <> 0 Then
            rollbackError = Err.Description
            Err.Clear
        Else
            Call TestHelper.AddLog(logs, "Cleanup: rollback transaccional OK; la fixture fue el contrato probado, no una snapshot afortunada")
        End If
        inTrans = False
    End If
    Set rs = Nothing
    Set db = Nothing
    Set ws = Nothing
    If sessionStarted Then
        Call TestHelper.EndTestSession(logs)
        sessionStarted = False
    End If
    On Error GoTo 0

    If rollbackError <> "" Then
        If resultError <> "" Then
            resultError = resultError & " | Rollback: " & rollbackError
        Else
            resultError = "Rollback: " & rollbackError
        End If
    End If

    If resultError <> "" Then
        Test_BackendConfigPaths_LeeConfiguracionLocal_AnchoraRutasLocalesEnUserProfile_Atomic = TestHelper.BuildJsonFail(resultError, logs)
    Else
        Test_BackendConfigPaths_LeeConfiguracionLocal_AnchoraRutasLocalesEnUserProfile_Atomic = TestHelper.BuildJsonOk(logs, "leeconfig_local_sanitizada")
    End If
    Exit Function

EH:
    resultError = Err.Description
    Call TestHelper.AddLog(logs, "Error: " & Err.Description)
    Resume Cleanup
End Function

Private Function EnsureBackendConfigFixture(ByRef p_Logs As Collection, Optional ByRef p_Error As String = "") As Boolean
    On Error GoTo EH

    Dim db As DAO.Database
    Dim tdf As DAO.TableDef
    Dim totalRows As Long
    Dim idOneRows As Long
    Dim assertError As String

    EnsureBackendConfigFixture = False
    p_Error = ""

    Set db = CurrentDb
    Set tdf = db.TableDefs("TbConfiguracionBackends")

    TestHelper.AddLog p_Logs, "Arrange fixture: TbConfiguracionBackends se valida con CurrentDb porque es configuración del frontend"
    TestHelper.AddLog p_Logs, "Contrato singleton: BeginTestSession resuelve BackendSandbox desde TbConfiguracionBackends.ID=1; la prueba no borra ni recrea esa fila"

    If Not AssertBackendConfigField(tdf, "ID", p_Logs, assertError) Then GoTo Fail
    If Not AssertBackendConfigField(tdf, "BackendActivo", p_Logs, assertError) Then GoTo Fail
    If Not AssertBackendConfigField(tdf, "RutaDirectorioAplicacion_LOCAL", p_Logs, assertError) Then GoTo Fail
    If Not AssertBackendConfigField(tdf, "BackendSandbox", p_Logs, assertError) Then GoTo Fail
    If Not AssertBackendConfigField(tdf, "PasswordBackend", p_Logs, assertError) Then GoTo Fail

    totalRows = CountFrontendRows(db, "TbConfiguracionBackends")
    TestHelper.AddLog p_Logs, "Cardinality fact TbConfiguracionBackends: totalRows=" & CStr(totalRows)
    Call TestHelper.AssertTrue(totalRows = 1, "TbConfiguracionBackends debe tener exactamente una fila de configuración", p_Logs, assertError)
    If assertError <> "" Then GoTo Fail

    idOneRows = CountFrontendRows(db, "TbConfiguracionBackends", "ID=1")
    TestHelper.AddLog p_Logs, "Cardinality fact TbConfiguracionBackends.ID=1: rows=" & CStr(idOneRows)
    Call TestHelper.AssertTrue(idOneRows = 1, "TbConfiguracionBackends debe tener exactamente una fila ID=1", p_Logs, assertError)
    If assertError <> "" Then GoTo Fail

    EnsureBackendConfigFixture = True
    Set tdf = Nothing
    Set db = Nothing
    Exit Function

Fail:
    p_Error = assertError
    Set tdf = Nothing
    Set db = Nothing
    Exit Function

EH:
    p_Error = "EnsureBackendConfigFixture: " & Err.Description
    TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
    Set tdf = Nothing
    Set db = Nothing
End Function

Private Function AssertBackendConfigField(ByVal p_Table As DAO.TableDef, ByVal p_FieldName As String, ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    Dim fld As DAO.Field

    p_Error = ""
    Set fld = p_Table.Fields(p_FieldName)
    TestHelper.AddLog p_Logs, "Schema fact TbConfiguracionBackends." & p_FieldName & ": " & DescribeDaoField(fld)
    AssertBackendConfigField = True
    Set fld = Nothing
    Exit Function

EH:
    p_Error = "Campo requerido no existe en TbConfiguracionBackends: " & p_FieldName
    TestHelper.AddLog p_Logs, "ASSERT FAIL: " & p_Error
    Set fld = Nothing
End Function

Private Function DescribeDaoField(ByVal p_Field As DAO.Field) As String
    Dim typeName As String

    Select Case p_Field.Type
        Case dbBoolean
            typeName = "Boolean"
        Case dbLong
            typeName = "Long"
        Case dbText
            typeName = "Text(" & CStr(p_Field.Size) & ")"
        Case dbMemo
            typeName = "Memo/LongText"
        Case Else
            typeName = "DAO type " & CStr(p_Field.Type)
    End Select

    If p_Field.Type = dbText Or p_Field.Type = dbMemo Then
        DescribeDaoField = typeName & ", Required=" & CStr(p_Field.Required) & ", AllowZeroLength=" & CStr(p_Field.AllowZeroLength)
    Else
        DescribeDaoField = typeName & ", Required=" & CStr(p_Field.Required) & ", AllowZeroLength=n/a"
    End If
End Function

Private Function CountFrontendRows(ByVal p_Db As DAO.Database, ByVal p_Table As String, Optional ByVal p_Where As String = "") As Long
    On Error GoTo EH

    Dim rs As DAO.Recordset
    Dim sql As String

    sql = "SELECT COUNT(*) AS Cnt FROM [" & p_Table & "]"
    If Trim$(p_Where) <> "" Then sql = sql & " WHERE " & p_Where

    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    CountFrontendRows = CLng(Nz(rs.Fields("Cnt").Value, 0))
    rs.Close
    Set rs = Nothing
    Exit Function

EH:
    CountFrontendRows = -1
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
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

