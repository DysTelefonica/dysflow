VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "MostrarEstado"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public ID As String
Public usuarioRed As String
Public MostrarEstado As String

Private m_sIDCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDCalculado = DameID("TbConfMostrarEstado", "ID", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDCalculado = m_sIDCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método MostrarEstado.IDCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "ID"
        .Add "UsuarioRed"
        .Add "MostrarEstado"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método MostrarEstado.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "ID" Then
        getPropiedad = Me.ID
        Exit Function
    End If
    If m_NombrePropiedad = "UsuarioRed" Then
        getPropiedad = Me.usuarioRed
        Exit Function
    End If
    If m_NombrePropiedad = "MostrarEstado" Then
        getPropiedad = Me.MostrarEstado
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en MostrarEstado.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método MostrarEstado.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "ID" Then
        Me.ID = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "UsuarioRed" Then
        Me.usuarioRed = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "MostrarEstado" Then
        Me.MostrarEstado = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en CPV.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método MostrarEstado.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

