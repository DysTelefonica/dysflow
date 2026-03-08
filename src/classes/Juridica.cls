VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Juridica"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDJuridica As String
Public Juridica As String
Public Descripcion As String

Private m_sIDJuridicaCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDJuridicaCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDJuridicaCalculado = DameID("TbJuridicas", "IDJuridica", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDJuridicaCalculado = m_sIDJuridicaCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Juridica.IDJuridicaCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDJuridica"
        .Add "Juridica"
        .Add "DESCRIPCION"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Juridica.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDJuridica" Then
        getPropiedad = Me.IDJuridica
        Exit Function
    End If
    If m_NombrePropiedad = "Juridica" Then
        getPropiedad = Me.Juridica
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        getPropiedad = Me.Descripcion
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Juridica.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Juridica.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDJuridica" Then
        Me.IDJuridica = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Juridica" Then
        Me.Juridica = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        Me.Descripcion = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Juridica.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Juridica.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


