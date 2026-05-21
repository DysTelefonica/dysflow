VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteLugarEjecucion"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDExpedienteLugarEjecucion As String
Public IDLugarEjecucion As String
Public IDExpediente As String

Private m_sIDLugarEjecucionExpedienteCalculado As String
Private m_ObjLugarEjecucion As LugarEjecucion
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get LugarEjecucion() As LugarEjecucion
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjLugarEjecucion Is Nothing Then
        Set LugarEjecucion = m_ObjLugarEjecucion
        Exit Property
    End If
    Set m_ObjLugarEjecucion = constructor.getLugarEjecucion(p_IDLugarEjecucion:=Me.IDLugarEjecucion, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set LugarEjecucion = m_ObjLugarEjecucion
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteLugarEjecucion.LugarEjecucion ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get IDLugarEjecucionExpedienteCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDLugarEjecucionExpedienteCalculado = DameID("TbExpedientesLugaresEjecucion", "IDExpedienteLugarEjecucion", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDLugarEjecucionExpedienteCalculado = m_sIDLugarEjecucionExpedienteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteLugarEjecucion.IDLugarEjecucionExpedienteCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDExpedienteLugarEjecucion"
        .Add "IDLugarEjecucion"
        .Add "IDExpediente"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteLugarEjecucion.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDExpedienteLugarEjecucion" Then
        getPropiedad = Me.IDExpedienteLugarEjecucion
        Exit Function
    End If
    If m_NombrePropiedad = "IDLugarEjecucion" Then
        getPropiedad = Me.IDLugarEjecucion
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteLugarEjecucion.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteLugarEjecucion.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDExpedienteLugarEjecucion" Then
        Me.IDExpedienteLugarEjecucion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDLugarEjecucion" Then
        Me.IDLugarEjecucion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteLugarEjecucion.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteLugarEjecucion.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

