VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteCPV"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDCPVExpediente As String
Public IDCPV As String
Public IDExpediente As String

Private m_sIDCPVExpedienteCalculado As String
Private m_ObjCPV As CPV
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get CPV() As CPV
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjCPV Is Nothing Then
        Set CPV = m_ObjCPV
        Exit Property
    End If
    Set m_ObjCPV = constructor.getCPV(p_IDCPV:=Me.IDCPV, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set CPV = m_ObjCPV
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteCPV.CPV ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get IDCPVExpedienteCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDCPVExpedienteCalculado = DameID("TbExpedientesCPVs", "IDCPVExpediente", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDCPVExpedienteCalculado = m_sIDCPVExpedienteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteCPV.IDCPVExpedienteCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDCPVExpediente"
        .Add "IDCPV"
        .Add "IDExpediente"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteCPV.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDCPVExpediente" Then
        getPropiedad = Me.IDCPVExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "IDCPV" Then
        getPropiedad = Me.IDCPV
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteCPV.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteCPV.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDCPVExpediente" Then
        Me.IDCPVExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDCPV" Then
        Me.IDCPV = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteCPV.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteCPV.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

