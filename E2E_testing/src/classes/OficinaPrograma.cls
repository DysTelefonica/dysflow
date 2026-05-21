VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "OficinaPrograma"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDOficinaPrograma As String
Public OficinaPrograma As String
Public DESCRIPCION As String

Private m_sIDOficinaProgramaCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDOficinaProgramaCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDOficinaProgramaCalculado = DameID("TbOficinasPrograma", "IDOficinaPrograma", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDOficinaProgramaCalculado = m_sIDOficinaProgramaCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método OficinaPrograma.IDOficinaProgramaCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDOficinaPrograma"
        .Add "OficinaPrograma"
        .Add "Descripcion"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método OficinaPrograma.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDOficinaPrograma" Then
        getPropiedad = Me.IDOficinaPrograma
        Exit Function
    End If
    If m_NombrePropiedad = "OficinaPrograma" Then
        getPropiedad = Me.OficinaPrograma
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        getPropiedad = Me.DESCRIPCION
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en OficinaPrograma.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método OficinaPrograma.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDOficinaPrograma" Then
        Me.IDOficinaPrograma = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "OficinaPrograma" Then
        Me.OficinaPrograma = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        Me.DESCRIPCION = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en OficinaPrograma.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método OficinaPrograma.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

