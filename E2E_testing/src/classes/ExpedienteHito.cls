VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteHito"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Public IDHitoExpediente As String
Public IDExpediente As String
Public DESCRIPCION As String
Public FechaHito As String
Public FechaGarantiaHito As String
Public Importe As String

Private m_ObjExpediente As Expediente
Private m_sDiasParaElFin As String
Private m_sIDHitoExpedienteCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get DiasParaElFin() As String
    
    
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If Not IsDate(Me.FechaHito) Then
        Exit Property
    End If
    
    m_sDiasParaElFin = DateDiff("d", CDate(Date), CDate(Me.FechaHito))
    DiasParaElFin = m_sDiasParaElFin
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedientesHito.DiasParaElFin ha devuelto el error: " & vbNewLine & Err.Description
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
        Exit Property
    End If
    Set Expediente = m_ObjExpediente
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedientesHito.Expediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get IDHitoExpedienteCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDHitoExpedienteCalculado = DameID("TbExpedientesHitos", "IDHitoExpediente", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDHitoExpedienteCalculado = m_sIDHitoExpedienteCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedientesHito.IDHitoExpedienteCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDHitoExpediente"
        .Add "IDExpediente"
        .Add "Descripcion"
        .Add "FechaHito"
        .Add "FechaGarantiaHito"
        .Add "Importe"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedientesHito.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDHitoExpediente" Then
        getPropiedad = Me.IDHitoExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        getPropiedad = Me.DESCRIPCION
        Exit Function
    End If
    If m_NombrePropiedad = "FechaHito" Then
        getPropiedad = Me.FechaHito
        Exit Function
    End If
    If m_NombrePropiedad = "FechaGarantiaHito" Then
        getPropiedad = Me.FechaGarantiaHito
        Exit Function
    End If
    If m_NombrePropiedad = "Importe" Then
        getPropiedad = Me.Importe
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedientesHito.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedientesHito.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDHitoExpediente" Then
        Me.IDHitoExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Descripcion" Then
        Me.DESCRIPCION = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaHito" Then
        Me.FechaHito = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaGarantiaHito" Then
        Me.FechaGarantiaHito = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Importe" Then
        Me.Importe = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedientesHito.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedientesHito.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

