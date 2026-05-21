VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Suministrador"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDSuministrador As String
Public Nombre As String
Public CIF As String
Public DESCRIPCION As String
Public TramitadoraHPS As String
Public Nemotecnico As String
Public Direccion As String
Public CP As String
Public Ciudad As String
Public ConsorcioPropio As String

Private m_sIDSuministradorCalculado As String
Private m_ObjExpedientes As Scripting.Dictionary
Private m_sCadenaUsuariosHPS As String
Private m_sCadenaUsuariosHistoricosHPS As String
Private m_sCadenaExpedientes As String

Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get CadenaExpedientes() As String
    
    Dim m_expediente As Expediente
    Dim m_ID As Variant
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Me.Expedientes Is Nothing Then
        Exit Property
    End If
    For Each m_ID In Me.Expedientes
        Set m_expediente = Me.Expedientes(m_ID)
        If m_sCadenaExpedientes = "" Then
            m_sCadenaExpedientes = m_expediente.IDExpediente
        Else
            m_sCadenaExpedientes = m_sCadenaExpedientes & vbNewLine & m_expediente.IDExpediente
        End If
        Set m_expediente = Nothing
    Next
    CadenaExpedientes = m_sCadenaExpedientes
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Suministrador.CadenaExpedientes ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property


Public Property Get Expedientes() As Scripting.Dictionary
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    If Not m_ObjExpedientes Is Nothing Then
        Set Expedientes = m_ObjExpedientes
        Exit Property
    End If
    If Me.IDSuministrador = "" Then
        Exit Property
    End If
    Set m_ObjExpedientes = constructor.getExpedientesConSuministrador(Me.IDSuministrador, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Expedientes = m_ObjExpedientes
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Suministrador.Expedientes ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get IDSuministradorCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDSuministradorCalculado = DameID("TbSuministradores", "IDSuministrador", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If CLng(m_sIDSuministradorCalculado) < 1000 Then
        m_sIDSuministradorCalculado = CStr(CLng(m_sIDSuministradorCalculado) + 1000)
    End If
    IDSuministradorCalculado = m_sIDSuministradorCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Suministrador.IDSuministradorCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property

Public Property Get CadenaUsuariosHPS() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaUsuariosHPS <> "" Then
        CadenaUsuariosHPS = m_sCadenaUsuariosHPS
        Exit Property
    End If
    If Me.IDSuministrador = "" Then
        Exit Property
    End If
    m_sCadenaUsuariosHPS = getHPSParaSuministrador(Me.IDSuministrador, EnumSiNo.No, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    CadenaUsuariosHPS = m_sCadenaUsuariosHPS
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaUsuariosHPS ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Let CadenaUsuariosHPS(p_Valor As String)
    
    m_sCadenaUsuariosHPS = p_Valor
    
End Property

Public Property Get CadenaUsuariosHistoricosHPS() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    If m_sCadenaUsuariosHistoricosHPS <> "" Then
        CadenaUsuariosHistoricosHPS = m_sCadenaUsuariosHistoricosHPS
        Exit Property
    End If
    If Me.IDSuministrador = "" Then
        Exit Property
    End If
    m_sCadenaUsuariosHistoricosHPS = getHPSParaSuministrador(Me.IDSuministrador, EnumSiNo.Sí, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    CadenaUsuariosHistoricosHPS = m_sCadenaUsuariosHistoricosHPS
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Expediente.CadenaUsuariosHistoricosHPS ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Me.Error = m_Error
End Property
Public Property Let CadenaUsuariosHistoricosHPS(p_Valor As String)
    
    m_sCadenaUsuariosHistoricosHPS = p_Valor
    
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
        .Add "IDSuministrador"
        .Add "Nombre"
        .Add "CIF"
        .Add "DESCRIPCION"
        .Add "TramitadoraHPS"
        .Add "Nemotecnico"
        .Add "Direccion"
        .Add "CP"
        .Add "Ciudad"
        .Add "ConsorcioPropio"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Suministrador.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDSuministrador" Then
        getPropiedad = Me.IDSuministrador
        Exit Function
    End If
    If m_NombrePropiedad = "Nombre" Then
        getPropiedad = Me.Nombre
        Exit Function
    End If
    If m_NombrePropiedad = "CIF" Then
        getPropiedad = Me.CIF
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        getPropiedad = Me.DESCRIPCION
        Exit Function
    End If
    If m_NombrePropiedad = "TramitadoraHPS" Then
        getPropiedad = Me.TramitadoraHPS
        Exit Function
    End If
    If m_NombrePropiedad = "Nemotecnico" Then
        getPropiedad = Me.Nemotecnico
        Exit Function
    End If
    If m_NombrePropiedad = "Direccion" Then
        getPropiedad = Me.Direccion
        Exit Function
    End If
    If m_NombrePropiedad = "CP" Then
        getPropiedad = Me.CP
        Exit Function
    End If
    If m_NombrePropiedad = "Ciudad" Then
        getPropiedad = Me.Ciudad
        Exit Function
    End If
    If m_NombrePropiedad = "ConsorcioPropio" Then
        getPropiedad = Me.ConsorcioPropio
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Suministrador.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Suministrador.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDSuministrador" Then
        Me.IDSuministrador = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Nombre" Then
        Me.Nombre = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CIF" Then
        Me.CIF = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DESCRIPCION" Then
        Me.DESCRIPCION = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "TramitadoraHPS" Then
        Me.TramitadoraHPS = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Nemotecnico" Then
        Me.Nemotecnico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Direccion" Then
        Me.Direccion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CP" Then
        Me.CP = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Ciudad" Then
        Me.Ciudad = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "ConsorcioPropio" Then
        Me.ConsorcioPropio = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en Suministrador.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Suministrador.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


