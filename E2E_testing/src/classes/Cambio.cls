VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Cambio"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDCambio As String
Public NombreTabla As String
Public NombreCampoID As String
Public ValorCampoID As String
Public NombreCampo As String
Public ValorInicial As String
Public ValorFinal As String
Public FechaCambio As String
Public IDUsuarioCambio As String
Public Accion As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

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
        .Add "IDCambio"
        .Add "NombreTabla"
        .Add "NombreCampoID"
        .Add "ValorCampoID"
        .Add "NombreCampo"
        .Add "ValorInicial"
        .Add "ValorFinal"
        .Add "FechaCambio"
        .Add "IDUsuarioCambio"
        .Add "Accion"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Cambio.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDCambio" Then
        getPropiedad = Me.IDCambio
        Exit Function
    End If
    If m_NombrePropiedad = "NombreTabla" Then
        getPropiedad = Me.NombreTabla
        Exit Function
    End If
    If m_NombrePropiedad = "NombreCampoID" Then
        getPropiedad = Me.NombreCampoID
        Exit Function
    End If
    If m_NombrePropiedad = "ValorCampoID" Then
        getPropiedad = Me.ValorCampoID
        Exit Function
    End If
    If m_NombrePropiedad = "NombreCampo" Then
        getPropiedad = Me.NombreCampo
        Exit Function
    End If
    If m_NombrePropiedad = "ValorInicial" Then
        getPropiedad = Me.ValorInicial
        Exit Function
    End If
    If m_NombrePropiedad = "ValorFinal" Then
        getPropiedad = Me.ValorFinal
        Exit Function
    End If
    If m_NombrePropiedad = "FechaCambio" Then
        getPropiedad = Me.FechaCambio
        Exit Function
    End If
    If m_NombrePropiedad = "IDUsuarioCambio" Then
        getPropiedad = Me.IDUsuarioCambio
        Exit Function
    End If
    If m_NombrePropiedad = "Accion" Then
        getPropiedad = Me.Accion
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Cambio.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Cambio.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDCambio" Then
        Me.IDCambio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NombreTabla" Then
        Me.NombreTabla = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NombreCampoID" Then
        Me.NombreCampoID = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NombreTabla" Then
        Me.NombreTabla = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ValorCampoID" Then
        Me.ValorCampoID = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ValorInicial" Then
        Me.ValorInicial = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ValorFinal" Then
        Me.ValorFinal = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaCambio" Then
        Me.FechaCambio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDUsuarioCambio" Then
        Me.IDUsuarioCambio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Accion" Then
        Me.Accion = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Cambio.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Cambio.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

