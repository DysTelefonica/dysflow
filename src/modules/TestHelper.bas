Attribute VB_Name = "TestHelper"
Option Compare Database
Option Explicit

Public Function NewLogs() As Collection
    Set NewLogs = New Collection
End Function

Public Function BeginTestSession(ByRef logs As Collection, Optional ByRef p_Error As String = "") As Boolean
    On Error GoTo EH

    Dim sandboxPath As String
    Dim sandboxPassword As String

    BeginTestSession = False
    If logs Is Nothing Then Set logs = NewLogs()

    If m_TestingMode Then
        p_Error = "BeginTestSession: ya existe una sesión de test activa"
        AddLog logs, p_Error
        Exit Function
    End If

    p_Error = ""
    If Not ResolveBackendSandbox(sandboxPath, sandboxPassword, p_Error) Then
        AddLog logs, p_Error
        Exit Function
    End If

    If Not ValidateBackendSandbox(sandboxPath, sandboxPassword, p_Error) Then
        AddLog logs, p_Error
        Exit Function
    End If

    m_BackendSandboxURL = sandboxPath
    m_BackendSandboxPassword = sandboxPassword
    m_TestingMode = True
    Application.TempVars("BackendPathSandbox") = sandboxPath
    Application.TempVars("BackendPathConfigurado") = sandboxPath
    Application.TempVars("DatosEnLocal") = "Sí"

    AddLog logs, "BeginTestSession OK: sandbox=" & m_BackendSandboxURL
    BeginTestSession = True
    Exit Function

EH:
    p_Error = "BeginTestSession: " & Err.Description
    AddLog logs, p_Error
    m_TestingMode = False
    m_BackendSandboxURL = ""
End Function

Public Sub EndTestSession(ByRef logs As Collection)
    On Error Resume Next
    m_TestingMode = False
    m_BackendSandboxURL = ""
    m_BackendSandboxPassword = ""
    Application.TempVars.Remove "BackendPathSandbox"
    Application.TempVars.Remove "BackendPathConfigurado"
    Application.TempVars.Remove "DatosEnLocal"
    AddLog logs, "EndTestSession OK"
End Sub

Public Sub ResetTestSession(Optional ByRef p_Error As String)
    On Error Resume Next
    p_Error = ""
    m_TestingMode = False
    m_BackendSandboxURL = ""
    m_BackendSandboxPassword = ""
    Application.TempVars.Remove "BackendPathSandbox"
    Application.TempVars.Remove "BackendPathConfigurado"
    Application.TempVars.Remove "DatosEnLocal"
End Sub

Private Function ResolveBackendSandbox(ByRef p_BackendPath As String, ByRef p_BackendPassword As String, Optional ByRef p_Error As String = "") As Boolean
    Dim dbConfig As DAO.Database
    Dim rsConfig As DAO.Recordset

    On Error GoTo EH
    p_BackendPath = ""
    p_BackendPassword = ""
    p_Error = ""

    Set dbConfig = CurrentDb
    Set rsConfig = dbConfig.OpenRecordset("SELECT TOP 1 BackendSandbox, PasswordBackend FROM TbConfiguracionBackends ORDER BY ID", dbOpenSnapshot)

    If rsConfig.EOF Then
        p_Error = "TESTS BLOCKED: TbConfiguracionBackends no tiene configuración"
        GoTo Cleanup
    End If

    p_BackendPath = Trim$(Nz(rsConfig.Fields("BackendSandbox").Value, ""))
    p_BackendPassword = Nz(rsConfig.Fields("PasswordBackend").Value, "")
    If p_BackendPassword = "" Then p_BackendPassword = Environ$("ACCESS_VBA_PASSWORD")

    If p_BackendPath = "" Then
        p_Error = "TESTS BLOCKED: BackendSandbox está vacío"
        GoTo Cleanup
    End If

    ResolveBackendSandbox = True

Cleanup:
    On Error Resume Next
    If Not rsConfig Is Nothing Then rsConfig.Close
    Set rsConfig = Nothing
    Set dbConfig = Nothing
    Exit Function

EH:
    p_Error = "ResolveBackendSandbox: " & Err.Number & " - " & Err.Description
    Resume Cleanup
End Function

Private Function ValidateBackendSandbox(ByVal p_BackendPath As String, ByVal p_BackendPassword As String, Optional ByRef p_Error As String = "") As Boolean
    Dim dbSandbox As DAO.Database

    On Error GoTo EH
    p_Error = ""

    If Not fso.FileExists(p_BackendPath) Then
        p_Error = "TESTS BLOCKED: BackendSandbox no encontrado: " & p_BackendPath
        Exit Function
    End If

    Set dbSandbox = DBEngine.Workspaces(0).OpenDatabase(p_BackendPath, False, False, ";PWD=" & p_BackendPassword)
    dbSandbox.Close
    Set dbSandbox = Nothing

    ValidateBackendSandbox = True
    Exit Function

EH:
    p_Error = "TESTS BLOCKED: BackendSandbox no alcanzable: " & Err.Number & " - " & Err.Description
    On Error Resume Next
    If Not dbSandbox Is Nothing Then dbSandbox.Close
    Set dbSandbox = Nothing
End Function

Public Function AssertSandboxBackend(ByRef logs As Collection, Optional ByRef p_Error As String = "") As Boolean
    Dim sandboxPath As String

    AssertSandboxBackend = False
    p_Error = ""

    sandboxPath = Trim$(Nz(m_BackendSandboxURL, ""))
    If sandboxPath = "" Then
        sandboxPath = Trim$(Nz(Application.TempVars("BackendPathSandbox"), ""))
        If sandboxPath <> "" Then m_BackendSandboxURL = sandboxPath
    End If

    If sandboxPath = "" Then
        p_Error = "Sandbox backend vacío: m_BackendSandboxURL/BackendPathSandbox"
        AddLog logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    If Left$(sandboxPath, 2) = "\\" Then
        p_Error = "Sandbox backend no puede ser UNC: " & sandboxPath
        AddLog logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    If InStr(1, sandboxPath, "\\datoste\\", vbTextCompare) > 0 Then
        p_Error = "Sandbox backend apunta a UNC productivo: " & sandboxPath
        AddLog logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    If InStr(1, LCase$(sandboxPath), "noconformidades_datos.accdb", vbTextCompare) = 0 Then
        p_Error = "Sandbox backend inesperado: " & sandboxPath
        AddLog logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    If Not fso.FileExists(sandboxPath) Then
        p_Error = "Sandbox backend no existe: " & sandboxPath
        AddLog logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    If Not ValidateBackendSandbox(sandboxPath, m_BackendSandboxPassword, p_Error) Then
        AddLog logs, "ASSERT FAIL: " & p_Error
        Exit Function
    End If

    AddLog logs, "ASSERT OK: sandbox backend seguro=" & sandboxPath
    AssertSandboxBackend = True
End Function

Public Sub AddLog(ByRef p_Logs As Collection, ByVal p_Message As String)
    If p_Logs Is Nothing Then Set p_Logs = New Collection
    p_Logs.Add p_Message
End Sub

Public Function AssertTrue(ByVal p_Condition As Boolean, ByVal p_Message As String, ByRef p_Logs As Collection, Optional ByRef p_Error As String = "") As Boolean
    If p_Condition Then
        AddLog p_Logs, "ASSERT OK: " & p_Message
        AssertTrue = True
    Else
        p_Error = p_Message
        AddLog p_Logs, "ASSERT FAIL: " & p_Message
        AssertTrue = False
    End If
End Function

Public Function TestPass(ByRef p_Logs As Collection, Optional ByVal p_Value As Variant) As String
    Dim m_Payload As Object
    Set m_Payload = CreateObject("Scripting.Dictionary")
    m_Payload("ok") = True
    m_Payload("error") = ""
    m_Payload("logs") = CollectionToArray(p_Logs)
    If IsMissing(p_Value) Then
        m_Payload("value") = Null
    Else
        m_Payload("value") = p_Value
    End If
    TestPass = JsonConverter.ConvertToJson(m_Payload)
End Function

Public Function BuildJsonOk(ByRef p_Logs As Collection, Optional ByVal p_Value As Variant) As String
    BuildJsonOk = TestPass(p_Logs, p_Value)
End Function

Public Function TestFail(ByVal p_Error As String, ByRef p_Logs As Collection) As String
    Dim m_Payload As Object
    Set m_Payload = CreateObject("Scripting.Dictionary")
    m_Payload("ok") = False
    m_Payload("error") = p_Error
    m_Payload("logs") = CollectionToArray(p_Logs)
    m_Payload("value") = Null
    TestFail = JsonConverter.ConvertToJson(m_Payload)
End Function

Public Function BuildJsonFail(ByVal p_Error As String, ByRef p_Logs As Collection) As String
    BuildJsonFail = TestFail(p_Error, p_Logs)
End Function

Public Function SqlText(ByVal p_Value As String) As String
    SqlText = "'" & Replace(p_Value, "'", "''") & "'"
End Function

Private Function CollectionToArray(ByRef p_Items As Collection) As Variant
    Dim m_Result() As String
    Dim i As Long

    If p_Items Is Nothing Then
        CollectionToArray = Array()
        Exit Function
    End If

    If p_Items.count = 0 Then
        CollectionToArray = Array()
        Exit Function
    End If

    ReDim m_Result(0 To p_Items.count - 1)
    For i = 1 To p_Items.count
        m_Result(i - 1) = CStr(p_Items(i))
    Next i
    CollectionToArray = m_Result
End Function
