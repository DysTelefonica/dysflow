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

Public IDCorreo As String
Public Originador As String
Public DESTINATARIOS As String
Public DestinatariosConCopia As String
Public DestinatariosConCopiaOculta As String
Public Asunto As String
Public Cuerpo As String
Public FechaEnvio As String
Public FechaGrabacion As String
Public IDEdicion As String


Private m_sIDCorreoCalculado As String
Private m_objColCampos As Collection
Public Error As String
Private m_Error As String



Public Property Get IDCorreoCalculado() As String
    
    On Error GoTo errores
    
    Me.Error = ""
    m_Error = ""
    m_sIDCorreoCalculado = constructor.getID("TbCorreosEnviados", "IDCorreo", getdbCorreo, m_Error)
    If Me.Error <> "" Then
        Err.Raise 1000
    End If
    
    IDCorreoCalculado = m_sIDCorreoCalculado
    
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El metodo Correo.IDCorreoCalculado ha devuelto el error: " & vbNewLine & Err.Description
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
        .Add "URLAdjunto"
        .Add "Aplicacion"
        .Add "Originador"
        .Add "Destinatarios"
        .Add "DestinatariosConCopia"
        .Add "DestinatariosConCopiaOculta"
        .Add "Asunto"
        .Add "Cuerpo"
        .Add "FechaEnvio"
        .Add "Observaciones"
        .Add "NDPD"
        .Add "NPEDIDO"
        .Add "NFACTURA"
        .Add "FechaGrabacion"
        .Add "CuerpoHTML"
        .Add "IDEdicion"
    End With
    Set ColCampos = m_objColCampos
    Exit Property
errores:
    If Err.Number <> 1000 Then
        m_Error = "El método CorreosEnviado.ColCampos ha devuelto el error:" & vbNewLine & Err.Description
    End If
    m_Error = Me.Error
End Property

Public Function Registrar(Optional ByRef p_Error As String) As String
    
    Dim rcdDatos As dao.Recordset
     On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    Me.IDCorreo = Me.IDCorreoCalculado
    p_Error = Me.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Me.DESTINATARIOS = "" And Me.DestinatariosConCopia = "" And Me.DestinatariosConCopiaOculta = "" Then
        p_Error = "No hay destinatarios"
        Err.Raise 1000
    End If
    If Me.Cuerpo = "" Then
        p_Error = "No hay HTML"
        Err.Raise 1000
    End If
    If Me.Asunto = "" Then
        p_Error = "Se ha de incidar el Asunto"
        Err.Raise 1000
    End If
    If Me.DestinatariosConCopiaOculta = "" Then
        Me.DestinatariosConCopiaOculta = "Andres.romandelperal@telefonica.com"
    End If
    Me.FechaGrabacion = Now
    Me.Originador = m_ObjUsuarioConectado.UsuarioRed
    m_SQL = "TbCorreosEnviados"
    Set rcdDatos = getdbCorreo().OpenRecordset(m_SQL)
    With rcdDatos
        .AddNew
            .Fields("IDCorreo") = Me.IDCorreo
            .Fields("Aplicacion") = "NoConformidades"
            .Fields("Cuerpo") = Me.Cuerpo
            .Fields("Asunto") = Me.Asunto
            .Fields("Originador") = Me.Originador
            .Fields("FechaGrabacion") = Me.FechaGrabacion
            If Me.DESTINATARIOS <> "" Then
                .Fields("Destinatarios") = Me.DESTINATARIOS
            End If
            If Me.DestinatariosConCopia <> "" Then
                .Fields("DestinatariosConCopia") = Me.DestinatariosConCopia
            End If
            If Me.DestinatariosConCopiaOculta <> "" Then
                .Fields("DestinatariosConCopiaOculta") = Me.DestinatariosConCopiaOculta
            End If
        .Update
    End With
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo Correo.Registrar ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function getPropiedad(m_NombrePropiedad As Variant, Optional ByRef p_Error As String) As Variant
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    
    If m_NombrePropiedad = "IDCorreo" Then
        getPropiedad = Me.IDCorreo
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
    If m_NombrePropiedad = "FechaGrabacion" Then
        getPropiedad = Me.FechaGrabacion
        Exit Function
    End If
    If m_NombrePropiedad = "IDEdicion" Then
        getPropiedad = Me.IDEdicion
        Exit Function
    End If
    
    p_Error = "Propiedad no reconocida en Correo.getPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo Video.Correo ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function



Public Function SetPropiedad(m_NombrePropiedad As Variant, m_ValorPropiedad As Variant, Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    
    Me.Error = ""
    p_Error = ""
    
    If m_NombrePropiedad = "IDCorreo" Then
        Me.IDCorreo = m_ValorPropiedad
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
    If m_NombrePropiedad = "FechaGrabacion" Then
        Me.FechaGrabacion = m_ValorPropiedad
        Exit Function
    End If
    If m_NombrePropiedad = "IDEdicion" Then
        Me.IDEdicion = m_ValorPropiedad
        Exit Function
    End If
        
    p_Error = "Propiedad no reconocida en Correo.SetPropiedad"
    Err.Raise 1000
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo Correo.SetPropiedad ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function




