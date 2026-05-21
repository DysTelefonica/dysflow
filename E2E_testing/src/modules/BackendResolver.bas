Attribute VB_Name = "BackendResolver"
Option Compare Database
Option Explicit

Public Function ResolveBackendPath( _
    ByVal p_BackendActivo As String, _
    ByVal p_BackendProduccion As String, _
    ByVal p_BackendSandbox As String, _
    ByVal p_BackendTest As String, _
    Optional ByRef p_Error As String) As String

    Dim m_BackendKey As String
    Dim m_Path As String

    p_Error = ""
    ResolveBackendPath = ""

    m_BackendKey = UCase$(Trim$(p_BackendActivo))
    m_Path = ResolvePathByKey(m_BackendKey, p_BackendProduccion, p_BackendSandbox, p_BackendTest, p_Error)
    If p_Error <> "" Then Exit Function

    m_Path = Trim$(m_Path)
    If m_Path = "" Then
        p_Error = "Configuración inválida: la ruta del backend activo está vacía."
        Exit Function
    End If

    If Dir$(m_Path, vbNormal) = "" Then
        p_Error = "Configuración inválida: el archivo backend no existe en la ruta configurada: " & m_Path
        Exit Function
    End If

    ResolveBackendPath = m_Path
End Function

Private Function ResolvePathByKey( _
    ByVal p_BackendKey As String, _
    ByVal p_BackendProduccion As String, _
    ByVal p_BackendSandbox As String, _
    ByVal p_BackendTest As String, _
    ByRef p_Error As String) As String

    Select Case p_BackendKey
        Case "PROD"
            ResolvePathByKey = p_BackendProduccion
        Case "SANDBOX"
            ResolvePathByKey = p_BackendSandbox
        Case "TEST"
            ResolvePathByKey = p_BackendTest
        Case Else
            p_Error = "Configuración inválida: backendActivo no reconocido ('" & p_BackendKey & "'). Valores permitidos: PROD, SANDBOX, TEST."
            ResolvePathByKey = ""
    End Select
End Function

