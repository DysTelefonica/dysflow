VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "LugarEjecucion"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDLugarEjecucion As String
Public LugarEjecucion As String
Public DESCRIPCION As String

Private m_sJSON As String
Private m_sIDLugarEjecucionCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get json() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sJSON = GenerarTextoJSON(Me, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    json = m_sJSON
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.JSON ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error

End Property


Public Property Get IDLugarEjecucionCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDLugarEjecucionCalculado = DameID("TbLugaresEjecucion", "IDLugarEjecucion", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDLugarEjecucionCalculado = m_sIDLugarEjecucionCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método GradoClasificacion.IDLugarEjecucionCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDLugarEjecucion"
        .Add "LugarEjecucion"
        .Add "Descripcion"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método LugarEjecucion.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDLugarEjecucion" Then
        getPropiedad = Me.IDLugarEjecucion
        Exit Function
    End If
    If m_NombrePropiedad = "LugarEjecucion" Then
        getPropiedad = Me.LugarEjecucion
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        getPropiedad = Me.DESCRIPCION
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en LugarEjecucion.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método LugarEjecucion.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDLugarEjecucion" Then
        Me.IDLugarEjecucion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "LugarEjecucion" Then
        Me.LugarEjecucion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        Me.DESCRIPCION = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en LugarEjecucion.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método LugarEjecucion.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

