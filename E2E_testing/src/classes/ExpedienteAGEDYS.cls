VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteAGEDYS"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDExpedienteAGEDYS As String
Public IDExpediente As String
Public Generico As String

Private m_sIDExpedienteAGEDYSCalculado As String
Private m_ObjExpediente As Expediente
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get Expediente() As Expediente
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjExpediente Is Nothing Then
        Set Expediente = m_ObjExpediente
        Exit Property
    End If
    If Me.IDExpediente = "" Then
        Exit Property
    End If
    
    Set m_ObjExpediente = constructor.getExpediente(p_IDExpediente:=Me.IDExpediente, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Expediente = m_ObjExpediente
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteResponsable.Expediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get IDExpedienteAGEDYSCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDExpedienteAGEDYSCalculado = DameID("TbExpedientesDatosAGEDYS", "IDExpedienteAGEDYS", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDExpedienteAGEDYSCalculado = m_sIDExpedienteAGEDYSCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteAGEDYS.IDExpedienteAGEDYSCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDExpedienteAGEDYS"
        .Add "IDExpediente"
        .Add "Generico"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteAGEDYS.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDExpedienteAGEDYS" Then
        getPropiedad = Me.IDExpedienteAGEDYS
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "Generico" Then
        getPropiedad = Me.Generico
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteAGEDYS.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteAGEDYS.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDExpedienteAGEDYS" Then
        Me.IDExpedienteAGEDYS = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Generico" Then
        Me.Generico = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteAGEDYS.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteAGEDYS.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


