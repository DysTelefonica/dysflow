VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Auditoria"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDAuditoria As String
Public Tipo As String
Public FechaInicio As String
Public FechaFin As String

Private m_sIDAuditoriaCalculada As String
Private m_objDocumentos As Scripting.Dictionary
Private m_sURLDirectorio As String
Private m_ObjNCs As Scripting.Dictionary
Private m_sNombreAuditoria As String


Private m_objColCampos As Collection
Public Error As String
Private m_Error As String
Public Function NumeroNCCalculado(p_Tipo As String, Optional ByRef p_Error As String) As String
    
    Dim m_NC As NCAuditoria
    Dim m_ID As Variant
   
    Dim m_Numero As Long
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    
    
    If Me.NCs Is Nothing Then
        NumeroNCCalculado = "1"
        Exit Function
    End If
    
    
    For Each m_ID In Me.NCs
        Set m_NC = Me.NCs(m_ID)
        If m_NC.Tipo = p_Tipo Then
            If IsNumeric(m_NC.Numero) Then
                If CLng(m_NC.Numero) > CLng(m_Numero) Then
                    m_Numero = CLng(m_NC.Numero)
                End If
            End If
        End If
        Set m_NC = Nothing
    Next
    
    NumeroNCCalculado = CStr(m_Numero + 1)
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NumeroNCCalculado ha devuelto el error: " & Err.Description
    End If
End Function

Public Property Get NCs() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_ObjNCs Is Nothing Then
        Set NCs = m_ObjNCs
        Exit Property
    End If
    Set m_ObjNCs = constructor.getNCsAuditoria(p_ID:=Me.IDAuditoria, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set NCs = m_ObjNCs
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Auditoria.NCs ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Set NCs(ByVal objNewValue As Variant)

    Set m_ObjNCs = objNewValue

End Property
Public Property Get NombreAuditoria() As String
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If m_sNombreAuditoria <> "" Then
        NombreAuditoria = m_sNombreAuditoria
        Exit Property
    End If
    If Me.Tipo = "" Then
        Exit Property
    End If
    If Not IsDate(Me.FechaInicio) Then
        Exit Property
    End If
    
    m_sNombreAuditoria = Format(Year(Me.FechaInicio), "0000") & "_" & Me.Tipo
    NombreAuditoria = m_sNombreAuditoria
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Auditoria.NombreAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get URLDirectorio() As String
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If m_sURLDirectorio <> "" Then
        URLDirectorio = m_sURLDirectorio
        Exit Property
    End If
    If Me.NombreAuditoria = "" Then
        Exit Property
    End If
    m_sURLDirectorio = getURLCarpetaAnexoAuditoria(p_Auditoria:=Me, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 100
    End If
    
    
    URLDirectorio = m_sURLDirectorio
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Auditoria.URLDirectorio ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get IDAuditoriaCalculada() As String
    
    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    m_sIDAuditoriaCalculada = constructor.getID("TbAuditorias", "IDAuditoria", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDAuditoriaCalculada = m_sIDAuditoriaCalculada
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Auditoria.IDAuditoriaCalculada ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Property Get Documentos() As Scripting.Dictionary
    
    On Error GoTo errores
    Me.Error = ""
    m_Error = ""
    If Not m_objDocumentos Is Nothing Then
        Set Documentos = m_objDocumentos
        Exit Property
    End If
    Set m_objDocumentos = constructor.getDocumentosAuditoria(p_IDAuditoria:=Me.IDAuditoria, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Documentos = m_objDocumentos
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Auditoria.Documentos ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Set Documentos(ByVal objNewValue As Variant)

    Set m_objDocumentos = objNewValue

End Property

Public Property Get ColCampos() As Collection

    On Error GoTo errores

    Me.Error = ""
    m_Error = ""
    If Not m_objColCampos Is Nothing Then
        Set ColCampos = m_objColCampos
        Exit Property
    End If
    Set m_objColCampos = New Collection
    With m_objColCampos
        .Add "IDAuditoria"
        .Add "Tipo"
        .Add "FechaInicio"
        .Add "FechaFin"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Auditoria.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDAuditoria" Then
        getPropiedad = Me.IDAuditoria
        Exit Function
    End If
    If m_NombrePropiedad = "Tipo" Then
        getPropiedad = Me.Tipo
        Exit Function
    End If
    If m_NombrePropiedad = "FechaInicio" Then
        getPropiedad = Me.FechaInicio
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFin" Then
        getPropiedad = Me.FechaFin
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Auditoria.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Auditoria.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDAuditoria" Then
        Me.IDAuditoria = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Tipo" Then
        Me.Tipo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaInicio" Then
        Me.FechaInicio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFin" Then
        Me.FechaFin = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Auditoria.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Auditoria.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

