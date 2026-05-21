VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteDatosAGEDY"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Public IDExpediente As String
Public CarpetaArchivo As String
Public FirmadelContrato As String
Public FechaRecepcion As String
Public Adjudicado As Boolean
Public Informe As Boolean
Public Pcal As String
Public Generico As String
Public AñosGarantia As Double
Public AcuerdoMarco As String
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
        .Add "IDExpediente"
        .Add "CarpetaArchivo"
        .Add "FirmadelContrato"
        .Add "FechaRecepcion"
        .Add "Adjudicado"
        .Add "Informe"
        .Add "Pcal"
        .Add "Generico"
        .Add "AñosGarantia"
        .Add "AcuerdoMarco"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método ExpedienteDatosAGEDY.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDExpediente" Then
        getPropiedad = Me.IDExpediente
        Exit Function
    End If
    If m_NombrePropiedad = "CarpetaArchivo" Then
        getPropiedad = Me.CarpetaArchivo
        Exit Function
    End If
    If m_NombrePropiedad = "FirmadelContrato" Then
        getPropiedad = Me.FirmadelContrato
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRecepcion" Then
        getPropiedad = Me.FechaRecepcion
        Exit Function
    End If
    If m_NombrePropiedad = "Adjudicado" Then
        getPropiedad = Me.Adjudicado
        Exit Function
    End If
    If m_NombrePropiedad = "Informe" Then
        getPropiedad = Me.Informe
        Exit Function
    End If
    If m_NombrePropiedad = "Pcal" Then
        getPropiedad = Me.Pcal
        Exit Function
    End If
    If m_NombrePropiedad = "Generico" Then
        getPropiedad = Me.Generico
        Exit Function
    End If
    If m_NombrePropiedad = "AñosGarantia" Then
        getPropiedad = Me.AñosGarantia
        Exit Function
    End If
    If m_NombrePropiedad = "AcuerdoMarco" Then
        getPropiedad = Me.AcuerdoMarco
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteDatosAGEDY.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteDatosAGEDY.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDExpediente" Then
        Me.IDExpediente = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CarpetaArchivo" Then
        Me.CarpetaArchivo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FirmadelContrato" Then
        Me.FirmadelContrato = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaRecepcion" Then
        Me.FechaRecepcion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Adjudicado" Then
        Me.Adjudicado = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Informe" Then
        Me.Informe = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Pcal" Then
        Me.Pcal = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Generico" Then
        Me.Generico = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "AñosGarantia" Then
        Me.AñosGarantia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "AcuerdoMarco" Then
        Me.AcuerdoMarco = m_ValorPropiedad
        Exit Function
    End If
    p_Error = "Propiedad no reconocida en ExpedienteDatosAGEDY.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteDatosAGEDY.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function

