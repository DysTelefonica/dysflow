VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "CPV"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDCPV As String
Public CPV As String
Public DESCRIPCION As String

Private m_sIDCPVCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDCPVCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDCPVCalculado = DameID("TbCPV", "IDCPV", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDCPVCalculado = m_sIDCPVCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método CPV.IDCPVCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDCPV"
        .Add "CPV"
        .Add "DESCRIPCION"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método CPV.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDCPV" Then
        getPropiedad = Me.IDCPV
        Exit Function
    End If
    If m_NombrePropiedad = "CPV" Then
        getPropiedad = Me.CPV
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        getPropiedad = Me.DESCRIPCION
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en CPV.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CPV.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDCPV" Then
        Me.IDCPV = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CPV" Then
        Me.CPV = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        Me.DESCRIPCION = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en CPV.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CPV.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

