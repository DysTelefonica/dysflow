Option Compare Database
Option Explicit
Private m_Error As String

Private Sub ComandoActualizar_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    Me.lblSeguimientos.Caption = "Seguimiento #/#"
    
    PintarIndicadores p_Reiniciando:=EnumSino.Sí, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoConfiguracion_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoAltaAuditoría_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
     If FormularioAbierto("FormAuditoria") Then
        DoCmd.Close acForm, "FormAuditoria", acSaveNo
    End If
    Set m_ObjAuditoriaActiva = Nothing
    DoCmd.OpenForm "FormAuditoria"
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaAuditoría_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoAyuda_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If Not fso.FileExists(m_ObjEntorno.URLVideoAyudaNCAuditoria) Then
        m_Error = "El video de ayuda no se encuentra disponible en este momento"
        Err.Raise 1000
    End If
    Ejecutar Me.hWnd, "open", m_ObjEntorno.URLVideoAyudaNCAuditoria, "", "", 1
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAyuda_Click se ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoGestionAuditorias_Click()

    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""

    
    DoCmd.OpenForm "FormAuditoriasGestion"

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoGestionAuditorias_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoGestionNCAuditorias_Click()

    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    DoCmd.OpenForm "FormNCAuditoriaGestion"
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Forms("FormNCAuditoriaGestion").Estado = "Abiertas"
        If EsTecnico <> EnumSino.Sí Then
            Forms("FormNCAuditoriaGestion").RESPONSABLEIMPLANTACION = m_ObjUsuarioConectado.Nombre
        End If
        Form_FormNCAuditoriaGestion.ESTADO_AfterUpdate
    End If

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoGestionNCAuditorias_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoAltaNCAuditoría_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If FormularioAbierto("FormAuditoriaSeleccion") Then
        DoCmd.Close acForm, "FormAuditoriaSeleccion", acSaveNo
    End If
    
    DoCmd.OpenForm "FormAuditoriaSeleccion"
   

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaNCAuditoría_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub cmdSalir_Click()
   DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ComandoMenuParteProyecto_Click()
     On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
   
    DoCmd.OpenForm "Form0BDOpcionesParteProyectos"
    DoCmd.Close acForm, Me.Name, acSaveNo

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

Private Sub ComandoSeguimiento_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If FormularioAbierto("FormNCAuditoriaSeguimiento") Then
        DoCmd.Close acForm, "FormNCAuditoriaSeguimiento", acSaveNo
    End If
    DoCmd.OpenForm "FormNCAuditoriaSeguimiento"
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoSeguimiento_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub Form_Load()
    Dim m_Titulo As String
     On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Ajustar Me
    m_Error = ""
    
    If Application.TempVars("EnPruebas") = "Sí" Then
        m_Titulo = "PARTE DE AUDITORÍAS VERSIÓN DE PRUEBAS"
        Me.lblTitulo1.FontSize = 15
        If EsAdministrador = EnumSino.Sí Then
            DoCmd.ShowToolbar "Ribbon", acToolbarYes
        Else
            DoCmd.ShowToolbar "Ribbon", acToolbarNo
        End If
    Else
        m_Titulo = "PARTE DE AUDITORÍAS"
        Me.lblTitulo1.FontSize = 25
        DoCmd.ShowToolbar "Ribbon", acToolbarNo
        
    End If
    Me.lblTitulo1.Caption = m_Titulo
     Me.lblVersion.Caption = "Versión: " & m_ObjEntorno.VersionAplicacion
    Me.Caption = m_ObjEntorno.TituloUsuarioConectado
    PintarIndicadores p_Reiniciando:=EnumSino.No, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub