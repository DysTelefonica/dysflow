VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteAnexo"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDDocumento As String
Public IDExpediente As String
Public NombreDocumento As String

Private m_sURLDirectorio As String
Private m_sURLDocumento As String
Private m_sIDDocumentoCalculado As String

Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get URLDirectorio() As String
    
    Dim m_URLDirectorio As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sURLDirectorio <> "" Then
        URLDirectorio = m_sURLDirectorio
        Exit Property
    End If
    If Me.IDExpediente = "" Then
        Exit Property
    End If
    
    m_sURLDirectorio = getURLDirectorioExpediente(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    URLDirectorio = m_sURLDirectorio
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteAnexo.URLDirectorio ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get URLDocumento() As String
    
    Dim m_URLDirectorio As String
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If m_sURLDocumento <> "" Then
        URLDocumento = m_sURLDocumento
        Exit Property
    End If
    If Me.IDExpediente = "" Then
        Exit Property
    End If
    If Me.NombreDocumento = "" Then
        Exit Property
    End If
    m_URLDirectorio = Me.URLDirectorio
    m_Error = Me.Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    If m_URLDirectorio = "" Then
        Exit Property
    End If
    m_sURLDocumento = m_URLDirectorio & fso.GetFileName(Me.NombreDocumento)
    
    URLDocumento = m_sURLDocumento
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteAnexo.URLDocumento ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get IDDocumentoCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDDocumentoCalculado = DameID("TbExpedientesAnexos", "IDDocumento", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDDocumentoCalculado = m_sIDDocumentoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteAnexo.IDDocumentoCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
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
        .Add "IDDocumento"
        .Add "IDExpediente"
        .Add "NombreDocumento"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteAnexo.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDDocumento" Then
        getPropiedad = Me.IDDocumento
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "NombreDocumento" Then
        getPropiedad = Me.NombreDocumento
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteAnexo.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteAnexo.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDDocumento" Then
        Me.IDDocumento = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NombreDocumento" Then
        Me.NombreDocumento = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteAnexo.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteAnexo.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


