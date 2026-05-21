VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Comercial"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDComercial As String
Public Comercial As String
Public DESCRIPCION As String

Private m_sIDComercialCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDComercialCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDComercialCalculado = DameID("TbComerciales", "IDComercial", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDComercialCalculado = m_sIDComercialCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Comercial.IDComercialCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDComercial"
        .Add "Comercial"
        .Add "Descripcion"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Comercial.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDComercial" Then
        getPropiedad = Me.IDComercial
        Exit Function
    End If
    If m_NombrePropiedad = "Comercial" Then
        getPropiedad = Me.Comercial
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        getPropiedad = Me.DESCRIPCION
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Comercial.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Comercial.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDComercial" Then
        Me.IDComercial = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Comercial" Then
        Me.Comercial = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        Me.DESCRIPCION = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Comercial.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Comercial.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

