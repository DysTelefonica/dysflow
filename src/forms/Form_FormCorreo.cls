 Option Compare Database
Option Explicit

Private m_EsDeProyecto As EnumSino
Private m_Error As String

Private Sub cmdSalir_Click()
     On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub


Private Sub ComandoEnviarCorreo_Click()
    
    Dim m_mensaje As String
    Dim m_Para As String
    Dim m_CC As String
    Dim m_Asunto As String
    Dim m_Correo As Correo
    Dim devNotice As String
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If Nz(Me.Asunto, "") = "" Then
        m_Error = "El asunto está vacío"
        Err.Raise 1000
    End If
    
    
    If Nz(Me.DESTINATARIOS, "") = "" And Nz(Me.DestinatariosConCopia, "") = "" Then
        m_Error = "No hay destinatarios"
        Err.Raise 1000
    End If
    If m_EsDeProyecto = EnumSino.Sí Then
        m_mensaje = HTMLNCProyecto(p_NC:=m_ObjNCProyectoActiva, p_ConAcciones:=EnumSino.Sí, p_SoloTablas:=EnumSino.No, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
       m_mensaje = HTMLNCAuditoria(p_NC:=m_ObjNCAuditoriaActiva, p_ConAcciones:=EnumSino.Sí, p_SoloTablas:=EnumSino.No, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    Set m_Correo = New Correo
    With m_Correo
        .Asunto = Nz(Me.Asunto, "")
        .DESTINATARIOS = Nz(Me.DESTINATARIOS, "")
        .DestinatariosConCopia = Nz(Me.DestinatariosConCopia, "")
        .Cuerpo = m_mensaje
        .Registrar p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("Correo ordenado para su envío", vbInformation, "Correo para envío")
    DoCmd.Close acForm, Me.Name, acSaveNo
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoRegistrar_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub



Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    If m_EsDeProyecto = EnumSino.Sí Then
        Me.Asunto = "Informe de NC de proyecto " & m_ObjNCProyectoActiva.CodigoNoConformidad
    Else
        Me.Asunto = "Informe de " & m_ObjNCAuditoriaActiva.Particula & " de auditoría " & m_ObjNCAuditoriaActiva.Auditoria.NombreAuditoria & " " & _
            Format(m_ObjNCAuditoriaActiva.Numero, "00")
    End If
    If m_EsDeProyecto = EnumSino.Sí Then
        If Not m_ObjNCProyectoActiva.ResponsableTelefonicaObj Is Nothing Then
            Me.DESTINATARIOS = m_ObjNCProyectoActiva.ResponsableTelefonicaObj.CorreoUsuario
        End If
        
    Else
        Me.DESTINATARIOS = Application.TempVars("CadenaCorreosCalidadEnPruebas")
    End If
    Me.DestinatariosConCopia = m_ObjUsuarioConectado.CorreoUsuario
    Me.Caption = Me.lblTitulo.Caption
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function


Private Sub Form_Open(Cancel As Integer)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Ajustar Me
    m_EsDeProyecto = Nz(Me.OpenArgs, "")
    If m_EsDeProyecto = Empty Then
        m_Error = "Ha abierto el formulario con parámetros insuficientes"
        Err.Raise 1000
    End If
    If m_EsDeProyecto = EnumSino.Sí Then
        If m_ObjNCProyectoActiva Is Nothing Then
            m_Error = "Ha abierto el formulario con parámetros insuficientes"
            Err.Raise 1000
        End If
    Else
        If m_ObjNCAuditoriaActiva Is Nothing Then
            m_Error = "Ha abierto el formulario con parámetros insuficientes"
            Err.Raise 1000
        End If
    End If
    
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub