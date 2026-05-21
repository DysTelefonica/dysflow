Attribute VB_Name = "Test_InfraestructuraInicio"
Option Compare Database
Option Explicit

Private Function JsonOK(ByVal p_Value As String) As String
    Dim logs(0 To 0) As String
    logs(0) = "ok: " & p_Value
    JsonOK = BuildJsonOk(p_Value, logs)
End Function

Private Function JsonFail(ByVal p_Error As String) As String
    Dim logs(0 To 0) As String
    logs(0) = "fail: " & p_Error
    JsonFail = BuildJsonFail(p_Error, logs)
End Function

Public Function Test_ValidarCarpetaEscribible_DetectaRutaNoAlcanzable() As String
    Dim m_Error As String
    Dim m_RutaInexistente As String

    On Error GoTo errores
    m_RutaInexistente = Environ$("TEMP") & "\EXPEDIENTES_TEST_NO_EXISTE_" & Format$(Now, "yyyymmddhhnnss") & "\"

    ValidarCarpetaEscribible m_RutaInexistente, "documentación de anexos", m_Error
    If m_Error = "" Then
        Test_ValidarCarpetaEscribible_DetectaRutaNoAlcanzable = JsonFail("La validación aceptó una ruta inexistente")
        Exit Function
    End If
    If InStr(1, m_Error, "No es alcanzable la ruta de documentación de anexos", vbTextCompare) = 0 Then
        Test_ValidarCarpetaEscribible_DetectaRutaNoAlcanzable = JsonFail("Mensaje inesperado: " & m_Error)
        Exit Function
    End If

    Test_ValidarCarpetaEscribible_DetectaRutaNoAlcanzable = JsonOK("missing_path_detected")
    Exit Function
errores:
    Test_ValidarCarpetaEscribible_DetectaRutaNoAlcanzable = JsonFail(Err.Description)
End Function

Public Function Test_ValidarCarpetaEscribible_AceptaRutaTemporal() As String
    Dim m_Error As String
    Dim m_RutaTemporal As String

    On Error GoTo errores
    m_RutaTemporal = Environ$("TEMP") & "\EXPEDIENTES_TEST_INFRA_" & Format$(Now, "yyyymmddhhnnss") & "\"
    fso.CreateFolder m_RutaTemporal

    ValidarCarpetaEscribible m_RutaTemporal, "documentación de anexos", m_Error
    If m_Error <> "" Then
        Test_ValidarCarpetaEscribible_AceptaRutaTemporal = JsonFail(m_Error)
        GoTo limpiar
    End If

    Test_ValidarCarpetaEscribible_AceptaRutaTemporal = JsonOK("temp_path_writable")
limpiar:
    On Error Resume Next
    If fso.FolderExists(m_RutaTemporal) Then fso.DeleteFolder m_RutaTemporal, True
    Exit Function
errores:
    Test_ValidarCarpetaEscribible_AceptaRutaTemporal = JsonFail(Err.Description)
    Resume limpiar
End Function

Public Function Test_BackendConfigCompat_LeeConfiguracionLocal_InvalidKeyFailsFastAndCleansState() As String
    On Error GoTo errores

    Dim m_Error As String
    Dim m_Db As DAO.Database
    Dim m_DbError As String
    Dim m_ProdPath As String
    Dim m_Handle As Integer

    m_ProdPath = Environ$("TEMP") & "\EXPEDIENTES_TEST_BACKEND_COMPAT_PROD_" & Format$(Now, "yyyymmddhhnnss") & ".accdb"
    m_Handle = FreeFile
    Open m_ProdPath For Output As #m_Handle
    Close #m_Handle

    TestOnlyResetBackendConfigOverride
    TestOnlySetBackendConfigOverride "OTRO", m_ProdPath, m_ProdPath, m_ProdPath, "pwd-test"

    LeeConfiguracionLocal m_Error
    If m_Error = "" Then
        Test_BackendConfigCompat_LeeConfiguracionLocal_InvalidKeyFailsFastAndCleansState = JsonFail("Se esperaba error por backendActivo inválido")
        GoTo limpiar
    End If

    If InStr(1, m_Error, "backendActivo", vbTextCompare) = 0 Then
        Test_BackendConfigCompat_LeeConfiguracionLocal_InvalidKeyFailsFastAndCleansState = JsonFail("Mensaje inesperado: " & m_Error)
        GoTo limpiar
    End If

    If TestOnlyGetActiveBackendURL() <> "" Then
        Test_BackendConfigCompat_LeeConfiguracionLocal_InvalidKeyFailsFastAndCleansState = JsonFail("m_ActiveBackendURL debe quedar vacío tras fallo")
        GoTo limpiar
    End If

    If TestOnlyGetPasswordBackend() <> "" Then
        Test_BackendConfigCompat_LeeConfiguracionLocal_InvalidKeyFailsFastAndCleansState = JsonFail("m_PasswordBackend debe quedar vacío tras fallo")
        GoTo limpiar
    End If

    Set m_Db = getdb(m_DbError)
    If Not m_Db Is Nothing Then
        Test_BackendConfigCompat_LeeConfiguracionLocal_InvalidKeyFailsFastAndCleansState = JsonFail("getdb no debe abrir conexión tras fallo de configuración")
        GoTo limpiar
    End If

    If m_DbError = "" Then
        Test_BackendConfigCompat_LeeConfiguracionLocal_InvalidKeyFailsFastAndCleansState = JsonFail("getdb debe propagar error tras configuración inválida")
        GoTo limpiar
    End If

    Test_BackendConfigCompat_LeeConfiguracionLocal_InvalidKeyFailsFastAndCleansState = JsonOK("invalid_key_failfast_cleanup")

limpiar:
    On Error Resume Next
    Set m_Db = Nothing
    TestOnlyResetBackendConfigOverride
    If Dir$(m_ProdPath) <> "" Then Kill m_ProdPath
    Exit Function

errores:
    Test_BackendConfigCompat_LeeConfiguracionLocal_InvalidKeyFailsFastAndCleansState = JsonFail(Err.Description)
    Resume limpiar
End Function

Public Function Test_BackendConfigCompat_GetDbFailFastWhenResolvedPathEmpty() As String
    On Error GoTo errores

    Dim m_Error As String
    Dim m_DbError As String
    Dim m_Db As DAO.Database

    TestOnlyResetBackendConfigOverride
    TestOnlySetBackendConfigOverride "PROD", "   ", "C:\sandbox-no-usar.accdb", "C:\test-no-usar.accdb", "pwd-test"

    LeeConfiguracionLocal m_Error
    If m_Error = "" Then
        Test_BackendConfigCompat_GetDbFailFastWhenResolvedPathEmpty = JsonFail("Se esperaba error por ruta backend vacía")
        GoTo limpiar
    End If

    If TestOnlyGetActiveBackendURL() <> "" Then
        Test_BackendConfigCompat_GetDbFailFastWhenResolvedPathEmpty = JsonFail("m_ActiveBackendURL debe quedar vacío")
        GoTo limpiar
    End If

    Set m_Db = getdb(m_DbError)
    If Not m_Db Is Nothing Then
        Test_BackendConfigCompat_GetDbFailFastWhenResolvedPathEmpty = JsonFail("getdb no debe abrir DB con ruta vacía")
        GoTo limpiar
    End If

    If m_DbError = "" Then
        Test_BackendConfigCompat_GetDbFailFastWhenResolvedPathEmpty = JsonFail("getdb debe devolver p_Error cuando la ruta está vacía")
        GoTo limpiar
    End If

    Test_BackendConfigCompat_GetDbFailFastWhenResolvedPathEmpty = JsonOK("getdb_failfast_empty_path")

limpiar:
    On Error Resume Next
    Set m_Db = Nothing
    TestOnlyResetBackendConfigOverride
    Exit Function

errores:
    Test_BackendConfigCompat_GetDbFailFastWhenResolvedPathEmpty = JsonFail(Err.Description)
    Resume limpiar
End Function
