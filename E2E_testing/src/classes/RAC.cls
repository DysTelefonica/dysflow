VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "RAC"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDRAC As String
Public RAC As String
Public CORREO As String
Public DESCRIPCION As String

Public m_sIDRACCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDRACCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDRACCalculado = DameID("TbRACS", "IDRAC", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDRACCalculado = m_sIDRACCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método RAC.IDRACCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDRAC"
        .Add "RAC"
        .Add "CORREO"
        .Add "DESCRIPCION"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método RAC.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDRAC" Then
        getPropiedad = Me.IDRAC
        Exit Function
    End If
    If m_NombrePropiedad = "RAC" Then
        getPropiedad = Me.RAC
        Exit Function
    End If
    If m_NombrePropiedad = "CORREO" Then
        getPropiedad = Me.CORREO
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        getPropiedad = Me.DESCRIPCION
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en RAC.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RAC.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDRAC" Then
        Me.IDRAC = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "RAC" Then
        Me.RAC = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CORREO" Then
        Me.CORREO = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        Me.DESCRIPCION = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en RAC.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RAC.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

