VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteRAC"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDRacExpediente As String
Public IDExpediente As String
Public IDRAC As String

Private m_sIDRacExpedienteCalculado As String
Private m_ObjRAC As RAC
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get RAC() As RAC
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjRAC Is Nothing Then
        Set RAC = m_ObjRAC
        Exit Property
    End If
    Set m_ObjRAC = constructor.getRAC(p_IDRac:=Me.IDRAC, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set RAC = m_ObjRAC
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteRAC.RAC ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Get IDRacExpedienteCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDRacExpedienteCalculado = DameID("TbExpedientesRACS", "IDRacExpediente", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDRacExpedienteCalculado = m_sIDRacExpedienteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteRAC.IDRacExpedienteCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDRacExpediente"
        .Add "IDExpediente"
        .Add "IDRAC"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteRAC.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDRacExpediente" Then
        getPropiedad = Me.IDRacExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "IDRAC" Then
        getPropiedad = Me.IDRAC
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteRAC.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteRAC.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDRacExpediente" Then
        Me.IDRacExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDRAC" Then
        Me.IDRAC = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteRAC.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteRAC.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

