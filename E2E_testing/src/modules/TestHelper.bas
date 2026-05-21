Attribute VB_Name = "TestHelper"
Option Compare Database
Option Explicit

' Canonical JSON helpers for VBA test contract

Public Function BuildJsonOk(ByVal value As Variant, ByRef logs() As String) As String
    BuildJsonOk = "{""ok"":true,""value"":" & JsonValue(value) & ",""payload"":null,""error"":null,""logs"":" & JsonStringArray(logs) & "}"
End Function

Public Function BuildJsonFail(ByVal errorMsg As String, ByRef logs() As String) As String
    BuildJsonFail = "{""ok"":false,""value"":null,""payload"":null,""error"":""" & EscapeJsonString(errorMsg) & """,""logs"":" & JsonStringArray(logs) & "}"
End Function

Public Function EscapeJsonString(ByVal s As String) As String
    s = Replace(s, "\", "\\")
    s = Replace(s, Chr$(34), "\" & Chr$(34))
    s = Replace(s, vbCrLf, "\n")
    s = Replace(s, vbCr, "\r")
    s = Replace(s, vbLf, "\n")
    s = Replace(s, vbTab, "\t")
    EscapeJsonString = s
End Function

Public Function JsonStringArray(ByRef logs() As String) As String
    On Error GoTo EmptyLogs

    Dim i As Long
    Dim parts As String

    For i = LBound(logs) To UBound(logs)
        If Len(logs(i)) > 0 Then
            If Len(parts) > 0 Then parts = parts & ","
            parts = parts & """" & EscapeJsonString(logs(i)) & """"
        End If
    Next i

    JsonStringArray = "[" & parts & "]"
    Exit Function

EmptyLogs:
    JsonStringArray = "[]"
End Function

Public Function SqlStr(ByVal value As String) As String
    SqlStr = Replace(value, "'", "''")
End Function

Public Function ForceLocalBackend(ByRef p_Error As String) As Boolean
    On Error GoTo EH

    Dim m_Rst As DAO.Recordset
    Dim m_SandboxPath As String
    Dim m_Password As String
    Dim m_Db As DAO.Database

    p_Error = ""
    ForceLocalBackend = False

    Set m_Rst = CurrentDb.OpenRecordset("SELECT TOP 1 BackendSandbox, PasswordBackend FROM TbConfiguracionBackends;")
    If m_Rst.EOF Then
        p_Error = "No se encontró configuración de backend para tests"
        GoTo Cleanup
    End If

    m_SandboxPath = Trim$(Nz(m_Rst!BackendSandbox, ""))
    m_Password = Nz(m_Rst!PasswordBackend, "")

    If m_SandboxPath = "" Then
        p_Error = "BackendSandbox vacío en TbConfiguracionBackends"
        GoTo Cleanup
    End If

    If Not fso.FileExists(m_SandboxPath) Then
        p_Error = "Sandbox no alcanzable: " & m_SandboxPath
        GoTo Cleanup
    End If

    On Error GoTo EH
    Set m_Db = DBEngine(0).OpenDatabase(m_SandboxPath, False, True, ";pwd=" & m_Password)
    m_Db.Close
    Set m_Db = Nothing

    CloseCachedBackendConnection
    TestOnlyConfigureTestingBackend m_SandboxPath, m_Password
    m_TestingMode = True

    ForceLocalBackend = True

Cleanup:
    On Error Resume Next
    If Not m_Rst Is Nothing Then m_Rst.Close
    Set m_Rst = Nothing
    Set m_Db = Nothing
    Exit Function

EH:
    If p_Error = "" Then p_Error = "ForceLocalBackend: " & Err.Description
    Resume Cleanup
End Function

Public Function AssertSandboxBackend(Optional ByRef p_Error As String) As Boolean
    p_Error = ""
    AssertSandboxBackend = False

    If Not m_TestingMode Then
        p_Error = "Sandbox guard: m_TestingMode=False"
        Exit Function
    End If

    If Trim$(TestOnlyGetTestingBackendURL()) = "" Then
        p_Error = "Sandbox guard: backend sandbox no configurado"
        Exit Function
    End If

    If Not fso.FileExists(TestOnlyGetTestingBackendURL()) Then
        p_Error = "Sandbox guard: backend sandbox no alcanzable"
        Exit Function
    End If

    If InStr(1, UCase$(TestOnlyGetTestingBackendURL()), "PROD", vbTextCompare) > 0 Then
        p_Error = "Sandbox guard: ruta sospechosa de PROD"
        Exit Function
    End If

    AssertSandboxBackend = True
End Function

Public Function EnsureSandboxBackend(ByRef p_Error As String) As Boolean
    p_Error = ""

    If Not m_TestingMode Or Trim$(TestOnlyGetTestingBackendURL()) = "" Then
        Call ForceLocalBackend(p_Error)
        If p_Error <> "" Then
            EnsureSandboxBackend = False
            Exit Function
        End If
    End If

    EnsureSandboxBackend = AssertSandboxBackend(p_Error)
End Function

Public Sub ResetTestSession()
    On Error Resume Next
    m_TestingMode = False
    TestOnlyClearTestingBackend
    CloseCachedBackendConnection
    TestOnlyResetBackendConfigOverride
End Sub

Private Function JsonValue(ByVal value As Variant) As String
    If IsNull(value) Or IsEmpty(value) Then
        JsonValue = "null"
        Exit Function
    End If

    Select Case VarType(value)
        Case vbBoolean
            JsonValue = LCase$(CStr(value))
        Case vbByte, vbInteger, vbLong, vbSingle, vbDouble, vbCurrency, vbDecimal
            JsonValue = Replace(CStr(value), ",", ".")
        Case Else
            JsonValue = """" & EscapeJsonString(CStr(value)) & """"
    End Select
End Function
