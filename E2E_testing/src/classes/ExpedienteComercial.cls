VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteComercial"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDComercialExpediente As String
Public IDComercial As String
Public IDExpediente As String

Private m_sIDComercialExpedienteCalculado As String
Private m_ObjComercial As Comercial
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get Comercial() As Comercial
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjComercial Is Nothing Then
        Set Comercial = m_ObjComercial
        Exit Property
    End If
    Set m_ObjComercial = constructor.getComercial(p_IDComercial:=Me.IDComercial, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set Comercial = m_ObjComercial
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteComercial.Comercial ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get IDComercialExpedienteCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDComercialExpedienteCalculado = DameID("TbExpedientesComerciales", "IDComercialExpediente", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDComercialExpedienteCalculado = m_sIDComercialExpedienteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteComercial.IDComercialExpedienteCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDComercialExpediente"
        .Add "IDComercial"
        .Add "IDExpediente"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteComercial.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDComercialExpediente" Then
        getPropiedad = Me.IDComercialExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "IDComercial" Then
        getPropiedad = Me.IDComercial
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteComercial.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteComercial.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDComercialExpediente" Then
        Me.IDComercialExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDComercial" Then
        Me.IDComercial = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteComercial.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteComercial.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

