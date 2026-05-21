VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Correo"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public IDCORREO As String
Public Aplicacion As String
Public Originador As String
Public DESTINATARIOS As String
Public DestinatariosConCopia As String
Public DestinatariosConCopiaOculta As String
Public Asunto As String
Public Cuerpo As String
Public FechaEnvio As String
Public URLAdjunto As String
Public Observaciones As String
Public NDPD As String
Public NPedido As String
Public NFACTURA As String
Public FECHAGRABACION As String
Public CuerpoHTML As Boolean


Private m_sIDCorreoCalculado As String


Private m_objColCampos As Collection
Public Error As String
Private m_Error As String

Public Property Get IDCorreoCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    
    m_sIDCorreoCalculado = DameID("TbCorreosEnviados", "IDCorreo", getdb(), m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    IDCorreoCalculado = m_sIDCorreoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Correo.IDCorreoCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "IDCorreo"
        .Add "Aplicacion"
        .Add "Originador"
        .Add "Destinatarios"
        .Add "DestinatariosConCopia"
        .Add "DestinatariosConCopiaOculta"
        .Add "Asunto"
        .Add "Cuerpo"
        .Add "FechaEnvio"
        .Add "URLAdjunto"
        .Add "Observaciones"
        .Add "NDPD"
        .Add "NPEDIDO"
        .Add "NFACTURA"
        .Add "FechaGrabacion"
        .Add "CuerpoHTML"
        
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método Correo.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property


Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant

    On Error GoTo errores

    Me.Error = ""
    If m_NombrePropiedad = "IDCorreo" Then
        getPropiedad = Me.IDCORREO
        Exit Function
    End If
    If m_NombrePropiedad = "Aplicacion" Then
        getPropiedad = Me.Aplicacion
        Exit Function
    End If
    If m_NombrePropiedad = "Originador" Then
        getPropiedad = Me.Originador
        Exit Function
    End If
    If m_NombrePropiedad = "Destinatarios" Then
        getPropiedad = Me.DESTINATARIOS
        Exit Function
    End If
    If m_NombrePropiedad = "DestinatariosConCopia" Then
        getPropiedad = Me.DestinatariosConCopia
        Exit Function
    End If
    If m_NombrePropiedad = "DestinatariosConCopiaOculta" Then
        getPropiedad = Me.DestinatariosConCopiaOculta
        Exit Function
    End If
    If m_NombrePropiedad = "Asunto" Then
        getPropiedad = Me.Asunto
        Exit Function
    End If
    If m_NombrePropiedad = "Cuerpo" Then
        getPropiedad = Me.Cuerpo
        Exit Function
    End If
    If m_NombrePropiedad = "FechaEnvio" Then
        getPropiedad = Me.FechaEnvio
        Exit Function
    End If
    If m_NombrePropiedad = "URLAdjunto" Then
        getPropiedad = Me.URLAdjunto
        Exit Function
    End If
    If m_NombrePropiedad = "Observaciones" Then
        getPropiedad = Me.Observaciones
        Exit Function
    End If
    If m_NombrePropiedad = "NDPD" Then
        getPropiedad = Me.NDPD
        Exit Function
    End If
    If m_NombrePropiedad = "NPEDIDO" Then
        getPropiedad = Me.NPedido
        Exit Function
    End If
    If m_NombrePropiedad = "NFACTURA" Then
        getPropiedad = Me.NFACTURA
        Exit Function
    End If
    If m_NombrePropiedad = "FechaGrabacion" Then
        getPropiedad = Me.FECHAGRABACION
        Exit Function
    End If
    If m_NombrePropiedad = "CuerpoHTML" Then
        getPropiedad = Me.CuerpoHTML
        Exit Function
    End If
    
    p_Error = "Propiedad no reconocida en Correo.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Correo.getPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function


Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    On Error GoTo errores

    Me.Error = ""
    p_Error = ""
    If m_NombrePropiedad = "IDCorreo" Then
        Me.IDCORREO = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Aplicacion" Then
        Me.Aplicacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Originador" Then
        Me.Originador = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Destinatarios" Then
        Me.DESTINATARIOS = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DestinatariosConCopia" Then
        Me.DestinatariosConCopia = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "DestinatariosConCopiaOculta" Then
        Me.DestinatariosConCopiaOculta = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Asunto" Then
        Me.Asunto = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Cuerpo" Then
        Me.Cuerpo = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaEnvio" Then
        Me.FechaEnvio = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "URLAdjunto" Then
        Me.URLAdjunto = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "Observaciones" Then
        Me.Observaciones = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NDPD" Then
        Me.NDPD = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NPEDIDO" Then
        Me.NPedido = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "NFACTURA" Then
        Me.NFACTURA = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "FechaGrabacion" Then
        Me.FECHAGRABACION = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "CuerpoHTML" Then
        Me.CuerpoHTML = m_ValorPropiedad
        Exit Function
    End If
    
    p_Error = "Propiedad no reconocida en Correo.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Correo.SetPropiedad ha devuelto el error:" & vbNewLine & Err.Description
    End If
End Function








