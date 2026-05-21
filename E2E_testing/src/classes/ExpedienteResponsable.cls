VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteResponsable"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDExpedienteResponsable As String
Public IDExpediente As String
Public IdUsuario As String
Public CorreoSiempre As String
Public EsJefeProyecto As String

Private m_sIDExpedienteResponsableCalculado As String
Private m_ObjUsuario As USUARIO
Private m_ObjExpediente As Expediente

Private m_objColCampos As Collection
Public Error As String
Private m_Error As String



Public Property Get IDExpedienteResponsableCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDExpedienteResponsableCalculado = DameID("TbExpedientesResponsables", "IDExpedienteResponsable", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDExpedienteResponsableCalculado = m_sIDExpedienteResponsableCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteResponsable.IDExpedienteResponsableCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get USUARIO() As USUARIO
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjUsuario Is Nothing Then
        Set USUARIO = m_ObjUsuario
        Exit Property
    End If
    If Me.IdUsuario = "" Then
        Exit Property
    End If
    
    Set m_ObjUsuario = constructor.getUsuario(p_ID:=Me.IdUsuario, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set USUARIO = m_ObjUsuario
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteResponsable.Usuario ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

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
        .Add "IDExpedienteResponsable"
        .Add "IdExpediente"
        .Add "IdUsuario"
        .Add "CorreoSiempre"
        .Add "EsJefeProyecto"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteResponsable.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDExpedienteResponsable" Then
        getPropiedad = Me.IDExpedienteResponsable
        Exit Function
    End If
    If m_NombrePropiedad = "IdExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "IdUsuario" Then
        getPropiedad = Me.IdUsuario
        Exit Function
    End If
    If m_NombrePropiedad = "CorreoSiempre" Then
        getPropiedad = Me.CorreoSiempre
        Exit Function
    End If
    If m_NombrePropiedad = "EsJefeProyecto" Then
        getPropiedad = Me.EsJefeProyecto
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteResponsable.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteResponsable.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDExpedienteResponsable" Then
        Me.IDExpedienteResponsable = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IdExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IdUsuario" Then
        Me.IdUsuario = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CorreoSiempre" Then
        Me.CorreoSiempre = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "EsJefeProyecto" Then
        Me.EsJefeProyecto = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteResponsable.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteResponsable.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

