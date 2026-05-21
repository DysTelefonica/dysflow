Attribute VB_Name = "Test_BackendResolver"
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

Private Function MakeTempAccdbPath(ByVal p_Suffix As String) As String
    MakeTempAccdbPath = Environ$("TEMP") & "\EXPEDIENTES_BACKEND_RESOLVER_" & p_Suffix & "_" & Format$(Now, "yyyymmddhhnnss") & ".accdb"
End Function

Private Sub EnsureEmptyFile(ByVal p_Path As String)
    Dim m_Handle As Integer
    m_Handle = FreeFile
    Open p_Path For Output As #m_Handle
    Close #m_Handle
End Sub

Public Function Test_BackendResolver_ResolveValidConfiguredBackend() As String
    On Error GoTo EH

    Dim m_Error As String
    Dim m_ExpectedPath As String
    Dim m_ResultPath As String

    m_ExpectedPath = MakeTempAccdbPath("valid")
    EnsureEmptyFile m_ExpectedPath

    m_ResultPath = ResolveBackendPath("SANDBOX", "C:\no-usar-prod.accdb", m_ExpectedPath, "C:\no-usar-test.accdb", m_Error)

    If m_Error <> "" Then
        Test_BackendResolver_ResolveValidConfiguredBackend = JsonFail("Se esperaba éxito y hubo error: " & m_Error)
        GoTo Cleanup
    End If

    If StrComp(m_ResultPath, m_ExpectedPath, vbTextCompare) <> 0 Then
        Test_BackendResolver_ResolveValidConfiguredBackend = JsonFail("Ruta resuelta inesperada: " & m_ResultPath)
        GoTo Cleanup
    End If

    Test_BackendResolver_ResolveValidConfiguredBackend = JsonOK("resolved_valid_backend")

Cleanup:
    On Error Resume Next
    If Len(m_ExpectedPath) > 0 Then
        If Dir$(m_ExpectedPath) <> "" Then Kill m_ExpectedPath
    End If
    Exit Function

EH:
    Test_BackendResolver_ResolveValidConfiguredBackend = JsonFail(Err.Description)
    Resume Cleanup
End Function

Public Function Test_BackendResolver_RejectInvalidBackendKey() As String
    On Error GoTo EH

    Dim m_Error As String
    Dim m_ResultPath As String

    m_ResultPath = ResolveBackendPath("INEXISTENTE", "C:\prod.accdb", "C:\sandbox.accdb", "C:\test.accdb", m_Error)

    If m_ResultPath <> "" Then
        Test_BackendResolver_RejectInvalidBackendKey = JsonFail("No debía resolver ruta para key inválida")
        Exit Function
    End If

    If m_Error = "" Then
        Test_BackendResolver_RejectInvalidBackendKey = JsonFail("Falta p_Error para key inválida")
        Exit Function
    End If

    If InStr(1, m_Error, "backendActivo", vbTextCompare) = 0 Then
        Test_BackendResolver_RejectInvalidBackendKey = JsonFail("Mensaje inesperado: " & m_Error)
        Exit Function
    End If

    Test_BackendResolver_RejectInvalidBackendKey = JsonOK("invalid_key_rejected")
    Exit Function

EH:
    Test_BackendResolver_RejectInvalidBackendKey = JsonFail(Err.Description)
End Function

Public Function Test_BackendResolver_RejectEmptyBackendKey() As String
    On Error GoTo EH

    Dim m_Error As String
    Dim m_ResultPath As String

    m_ResultPath = ResolveBackendPath("", "C:\prod.accdb", "C:\sandbox.accdb", "C:\test.accdb", m_Error)

    If m_ResultPath <> "" Then
        Test_BackendResolver_RejectEmptyBackendKey = JsonFail("No debía resolver ruta para backendActivo vacío")
        Exit Function
    End If

    If m_Error = "" Then
        Test_BackendResolver_RejectEmptyBackendKey = JsonFail("Falta p_Error para backendActivo vacío")
        Exit Function
    End If

    If InStr(1, m_Error, "backendActivo", vbTextCompare) = 0 Then
        Test_BackendResolver_RejectEmptyBackendKey = JsonFail("Mensaje inesperado: " & m_Error)
        Exit Function
    End If

    Test_BackendResolver_RejectEmptyBackendKey = JsonOK("empty_key_rejected")
    Exit Function

EH:
    Test_BackendResolver_RejectEmptyBackendKey = JsonFail(Err.Description)
End Function

Public Function Test_BackendResolver_RejectEmptyBackendPath() As String
    On Error GoTo EH

    Dim m_Error As String
    Dim m_ResultPath As String

    m_ResultPath = ResolveBackendPath("PROD", "   ", "C:\sandbox.accdb", "C:\test.accdb", m_Error)

    If m_ResultPath <> "" Then
        Test_BackendResolver_RejectEmptyBackendPath = JsonFail("No debía resolver ruta cuando está vacía")
        Exit Function
    End If

    If m_Error = "" Then
        Test_BackendResolver_RejectEmptyBackendPath = JsonFail("Falta p_Error para ruta vacía")
        Exit Function
    End If

    If InStr(1, m_Error, "vac", vbTextCompare) = 0 Then
        Test_BackendResolver_RejectEmptyBackendPath = JsonFail("Mensaje inesperado: " & m_Error)
        Exit Function
    End If

    Test_BackendResolver_RejectEmptyBackendPath = JsonOK("empty_path_rejected")
    Exit Function

EH:
    Test_BackendResolver_RejectEmptyBackendPath = JsonFail(Err.Description)
End Function

Public Function Test_BackendResolver_RejectMissingBackendFile() As String
    On Error GoTo EH

    Dim m_Error As String
    Dim m_MissingPath As String
    Dim m_ResultPath As String

    m_MissingPath = MakeTempAccdbPath("missing")
    If Dir$(m_MissingPath) <> "" Then Kill m_MissingPath

    m_ResultPath = ResolveBackendPath("TEST", "C:\prod.accdb", "C:\sandbox.accdb", m_MissingPath, m_Error)

    If m_ResultPath <> "" Then
        Test_BackendResolver_RejectMissingBackendFile = JsonFail("No debía resolver ruta inexistente")
        Exit Function
    End If

    If m_Error = "" Then
        Test_BackendResolver_RejectMissingBackendFile = JsonFail("Falta p_Error para archivo ausente")
        Exit Function
    End If

    If InStr(1, m_Error, "existe", vbTextCompare) = 0 Then
        Test_BackendResolver_RejectMissingBackendFile = JsonFail("Mensaje inesperado: " & m_Error)
        Exit Function
    End If

    Test_BackendResolver_RejectMissingBackendFile = JsonOK("missing_file_rejected")
    Exit Function

EH:
    Test_BackendResolver_RejectMissingBackendFile = JsonFail(Err.Description)
End Function

Public Function Test_BackendResolver_NoFallbackToProdWhenKeyInvalid() As String
    On Error GoTo EH

    Dim m_Error As String
    Dim m_ProdPath As String
    Dim m_ResultPath As String

    m_ProdPath = MakeTempAccdbPath("prod_should_not_fallback")
    EnsureEmptyFile m_ProdPath

    m_ResultPath = ResolveBackendPath("OTRO", m_ProdPath, "C:\sandbox.accdb", "C:\test.accdb", m_Error)

    If m_ResultPath <> "" Then
        Test_BackendResolver_NoFallbackToProdWhenKeyInvalid = JsonFail("No debe devolver ruta cuando backendActivo es inválido")
        GoTo Cleanup
    End If

    If m_Error = "" Then
        Test_BackendResolver_NoFallbackToProdWhenKeyInvalid = JsonFail("Se esperaba error explícito y no llegó")
        GoTo Cleanup
    End If

    Test_BackendResolver_NoFallbackToProdWhenKeyInvalid = JsonOK("no_prod_fallback")

Cleanup:
    On Error Resume Next
    If Len(m_ProdPath) > 0 Then
        If Dir$(m_ProdPath) <> "" Then Kill m_ProdPath
    End If
    Exit Function

EH:
    Test_BackendResolver_NoFallbackToProdWhenKeyInvalid = JsonFail(Err.Description)
    Resume Cleanup
End Function

Public Function Test_BackendResolver_AssertSandboxBackend_FailsWhenTestingModeOff() As String
    On Error GoTo EH

    Dim m_Error As String
    m_TestingMode = False
    TestOnlyClearTestingBackend

    If AssertSandboxBackend(m_Error) Then
        Test_BackendResolver_AssertSandboxBackend_FailsWhenTestingModeOff = JsonFail("AssertSandboxBackend debía fallar con m_TestingMode=False")
        Exit Function
    End If

    If InStr(1, m_Error, "m_TestingMode", vbTextCompare) = 0 Then
        Test_BackendResolver_AssertSandboxBackend_FailsWhenTestingModeOff = JsonFail("Mensaje inesperado: " & m_Error)
        Exit Function
    End If

    Test_BackendResolver_AssertSandboxBackend_FailsWhenTestingModeOff = JsonOK("sandbox_guard_blocks_when_testing_off")
    Exit Function

EH:
    Test_BackendResolver_AssertSandboxBackend_FailsWhenTestingModeOff = JsonFail(Err.Description)
End Function

Public Function Test_BackendResolver_EnsureSandboxBackend_ConfiguresSandbox() As String
    On Error GoTo EH

    Dim m_Error As String
    Dim m_BackendUrl As String

    ResetTestSession
    If Not EnsureSandboxBackend(m_Error) Then
        Test_BackendResolver_EnsureSandboxBackend_ConfiguresSandbox = JsonFail("EnsureSandboxBackend falló: " & m_Error)
        GoTo Cleanup
    End If

    m_BackendUrl = TestOnlyGetTestingBackendURL()
    If m_BackendUrl = "" Then
        Test_BackendResolver_EnsureSandboxBackend_ConfiguresSandbox = JsonFail("EnsureSandboxBackend no configuró backend sandbox")
        GoTo Cleanup
    End If

    If Not m_TestingMode Then
        Test_BackendResolver_EnsureSandboxBackend_ConfiguresSandbox = JsonFail("EnsureSandboxBackend no activó m_TestingMode")
        GoTo Cleanup
    End If

    Test_BackendResolver_EnsureSandboxBackend_ConfiguresSandbox = JsonOK("ensure_sandbox_configures_testing_mode")

Cleanup:
    ResetTestSession
    Exit Function

EH:
    Test_BackendResolver_EnsureSandboxBackend_ConfiguresSandbox = JsonFail(Err.Description)
    Resume Cleanup
End Function
