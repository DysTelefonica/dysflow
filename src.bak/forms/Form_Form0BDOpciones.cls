Option Compare Database
Option Explicit
Private m_Error As String


Private Sub ComandoMenuParteProyecto_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
   
    DoCmd.OpenForm "Form0BDOpcionesParteProyectos"
   

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoMenuParteProyecto_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub Detalle_DblClick(Cancel As Integer)
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    EVE m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    AvanceCerrar
    Exit Sub
errores:
    Me.AllowEdits = True
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Detalle_DblClick se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoMenuAuditorias_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""

    DoCmd.OpenForm "Form0BDOpcionesAuditorias"


    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoMenuAuditorias_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub






Private Sub Form_Open(Cancel As Integer)
    Dim m_Titulo As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Me.AllowEdits = False
    Ajustar Me
    m_Error = ""
    
    
    
'    Avance "Obteniendo Variables de estado"
'
'    EVE m_Error
'    If m_Error <> "" Then
'        Err.Raise 1000
'    End If
    If Application.TempVars("EnPruebas") = "Sí" Then
        m_Titulo = "NO CONFORMIDADES VERSIÓN DE PRUEBAS"
        Me.lblTitulo1.FontSize = 14
        If EsAdministrador = EnumSino.Sí Then
            DoCmd.ShowToolbar "Ribbon", acToolbarYes
        Else
            DoCmd.ShowToolbar "Ribbon", acToolbarNo
        End If
    Else
        m_Titulo = "NO CONFORMIDADES"
        Me.lblTitulo1.FontSize = 25
        DoCmd.ShowToolbar "Ribbon", acToolbarNo
        
    End If
    Me.lblTitulo1.Caption = m_Titulo
    
    Me.Caption = m_ObjEntorno.TituloUsuarioConectado
    Me.lblVersion.Caption = "Versión: " & m_ObjEntorno.VersionAplicacion
    

'    If EsTecnico = EnumSino.Sí Then
'        Me.ComandoMenuAuditorias.Enabled = False
'        Me.lblNoConformidadesDeProyecto.HyperlinkAddress = ""
'        Me.lblNoConformidadesDeProyecto.ForeColor = ColorEnlaceNoPosible
'         Me.lblMenuAuditoria.HyperlinkAddress = ""
'        Me.lblMenuAuditoria.ForeColor = ColorEnlaceNoPosible
'
'    Else
'        Me.ComandoMenuAuditorias.Enabled = True
'        Me.lblNoConformidadesDeProyecto.HyperlinkAddress = "#"
'        Me.lblNoConformidadesDeProyecto.ForeColor = ColorEnlacePosible
'
'        Me.lblMenuAuditoria.HyperlinkAddress = "#"
'        Me.lblMenuAuditoria.ForeColor = ColorEnlacePosible
'    End If
   'RegistroApertura
    
    
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    Exit Sub
errores:
    Me.AllowEdits = True
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
    DoCmd.Quit acQuitSaveNone
End Sub

Private Sub cmdSalir_Click()
    On Error GoTo errores
    pregunta = MsgBox("¿Desea salir de la aplicación", vbCritical + vbYesNo + vbDefaultButton2, "Salir de gestión de no conformidades")
    If pregunta = vbNo Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    DoCmd.Quit acQuitSaveAll
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al cmdSalir_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub lblNoConformidadesDeProyecto_Click()
    On Error Resume Next
    If Me.ComandoMenuParteProyecto.Enabled = True Then
        ComandoMenuParteProyecto_Click
    End If
End Sub

