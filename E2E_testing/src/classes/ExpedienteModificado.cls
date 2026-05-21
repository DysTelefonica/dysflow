VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteModificado"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDExpedienteModificado As String
Public IDExpediente As String
Public NModificado As String
Public FechaFirmaModificado As String
Public FechaFinModificado As String
Public DESCRIPCION As String

Private m_ObjExpediente As Expediente
Private m_sIDExpedienteModificadoCalculado As String


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
        Exit Property
    End If
    Set Expediente = m_ObjExpediente
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteModificado.Expediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property




Public Property Get IDExpedienteModificadoCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDExpedienteModificadoCalculado = DameID("TbExpedientesModificados", "IDExpedienteModificado", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDExpedienteModificadoCalculado = m_sIDExpedienteModificadoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteModificado.IDExpedienteModificadoCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDExpedienteModificado"
        .Add "IDExpediente"
        .Add "NModificado"
        .Add "FechaFirmaModificado"
        .Add "FechaFinModificado"
        .Add "Descripcion"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteModificado.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDExpedienteModificado" Then
        getPropiedad = Me.IDExpedienteModificado
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "NModificado" Then
        getPropiedad = Me.NModificado
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFirmaModificado" Then
        getPropiedad = Me.FechaFirmaModificado
        Exit Function
    End If
    
    If m_NombrePropiedad = "FechaFinModificado" Then
        getPropiedad = Me.FechaFinModificado
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        getPropiedad = Me.DESCRIPCION
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteModificado.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteModificado.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDExpedienteModificado" Then
        Me.IDExpedienteModificado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NModificado" Then
        Me.NModificado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaFirmaModificado" Then
        Me.FechaFirmaModificado = m_ValorPropiedad
        Exit Function
    End If
    
    If m_NombrePropiedad = "FechaFinModificado" Then
        Me.FechaFinModificado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        Me.DESCRIPCION = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteModificado.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteModificado.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

