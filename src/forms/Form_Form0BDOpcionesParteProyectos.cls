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

Private Sub ComandoAltaNCProyecto_Click()
    On Error GoTo errores
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    Set m_ObjNCProyectoActiva = Nothing
    If FormularioAbierto("FormNCProyecto") Then
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    End If
    DoCmd.OpenForm "FormNCProyecto"
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaNCProyecto_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    If Not fso.FileExists(m_ObjEntorno.URLVideoAyudaNCProyecto) Then
        m_Error = "El video de ayuda no se encuentra disponible en este momento"
        Err.Raise 1000
    End If
    Ejecutar Me.hWnd, "open", m_ObjEntorno.URLVideoAyudaNCProyecto, "", "", 1
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

Private Sub ComandoConfiguracion_Click()

    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCProyectoTipologiaGestion") Then
        DoCmd.Close acForm, "FormNCProyectoTipologiaGestion", acSaveNo
    End If
    DoCmd.OpenForm "FormNCProyectoTipologiaGestion"
    
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

Private Sub ComandoGestionNCProyecto_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If FormularioAbierto("FormNCProyectoGestion") Then
        DoCmd.Close acForm, "FormNCProyectoGestion", acSaveNo
    End If
    DoCmd.OpenForm "FormNCProyectoGestion"
    If FormularioAbierto("FormNCProyectoGestion") Then
        Forms("FormNCProyectoGestion").EstadoNC = "Abiertas"
        If EsTecnico = EnumSino.Sí Then
            Forms("FormNCProyectoGestion").ResponsableTelefonica = m_ObjUsuarioConectado.Nombre
        End If
        Form_FormNCProyectoGestion.EstadoNC_AfterUpdate
    End If

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoGestionNCProyecto_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



Private Sub ComandoIndicadores_Click()
    On Error GoTo errores
    
    ' 1. Feedback visual al usuario (Reloj de arena)
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    ' 2. Abrir el formulario de indicadores
    ' Asegúrate de que el nombre entre comillas coincide exactamente
    ' con el nombre con el que guardaste el formulario en el panel de navegación.
    ' Basado en lo anterior, debería ser "Form_FormIndicadores" o "FormIndicadores".
    DoCmd.OpenForm "FormIndicadores"
    
    ' 3. Finalizar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
    
errores:
    ' Gestión de errores estándar del proyecto
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIndicadores_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        MsgBox m_Error, vbCritical, "Error"
    Else
        MsgBox m_Error, vbExclamation, "Advertencia"
    End If
End Sub
Private Sub ComandoMenuAuditorias_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""

    DoCmd.OpenForm "Form0BDOpcionesAuditorias"
    DoCmd.Close acForm, Me.Name, acSaveNo

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

Private Sub ComandoSeguimiento_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If FormularioAbierto("FormNCProyectoSeguimiento") Then
        DoCmd.Close acForm, "FormNCProyectoSeguimiento", acSaveNo
    End If
    DoCmd.OpenForm "FormNCProyectoSeguimiento"
    
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

Private Sub Form_Open(Cancel As Integer)
    
    Dim m_Titulo As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Me.AllowEdits = False
    Ajustar Me
    m_Error = ""
    
    
   
    Me.ComandoConfiguracion.Enabled = False
    Avance "Obteniendo Variables de estado"
   
    If Application.TempVars("EnPruebas") = "Sí" Then
        m_Titulo = "PARTE DE PROYECTOS VERSIÓN DE PRUEBAS"
        Me.lblTitulo1.FontSize = 13
        If EsAdministrador = EnumSino.Sí Then
            DoCmd.ShowToolbar "Ribbon", acToolbarYes
        Else
            DoCmd.ShowToolbar "Ribbon", acToolbarNo
        End If
    Else
        m_Titulo = "PARTE DE PROYECTOS"
        Me.lblTitulo1.FontSize = 25
        DoCmd.ShowToolbar "Ribbon", acToolbarNo
        
    End If
    Me.lblTitulo1.Caption = m_Titulo
    Me.lblVersion.Caption = "Versión: " & m_ObjEntorno.VersionAplicacion
    Me.Caption = m_ObjEntorno.TituloUsuarioConectado
    Avance "Obteniendo las tareas"
    PintarIndicadores p_Reiniciando:=EnumSino.No, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
   
   'RegistroApertura
    
   
    
    
    Me.ComandoConfiguracion.Enabled = True
    
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
    'DoCmd.Quit acQuitSaveNone
End Sub

Private Sub cmdSalir_Click()
    On Error GoTo errores
    DoCmd.Close acForm, Me.Name, acSaveNo
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al cmdSalir_Click se ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub lblBuscarNC_Click()
    On Error Resume Next
    If Me.ComandoGestionNCProyecto.Enabled = True Then
        ComandoGestionNCProyecto_Click
    End If
End Sub




Private Sub lblTipologiaGestion_Click()
    On Error Resume Next
    If Me.ComandoConfiguracion.Enabled = True Then
        ComandoConfiguracion_Click
    End If
End Sub