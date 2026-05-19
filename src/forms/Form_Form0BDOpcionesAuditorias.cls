Option Compare Database
Option Explicit
Private m_Error As String
Private m_CargaInicialIndicadoresPendiente As Boolean
Private m_CargandoIndicadores As Boolean
Private m_IndicadoresReiniciando As EnumSino
Private m_IndicadoresModo As String

Private Sub ComandoActualizar_Click()
     On Error GoTo errores
    m_Error = ""
    If m_CargandoIndicadores Then Exit Sub

    m_IndicadoresReiniciando = EnumSino.Sí
    m_IndicadoresModo = "AUDITORIA"
    m_CargaInicialIndicadoresPendiente = True
    Me.TimerInterval = 100
    Me.lblSeguimientos.Caption = "Seguimiento #/#"
    Me.Repaint
    Exit Sub
errores:
    If m_CargandoIndicadores Then
        AvanceCerrar
        m_CargandoIndicadores = False
    End If
    If m_CargaInicialIndicadoresPendiente Then
        m_CargaInicialIndicadoresPendiente = False
        Me.TimerInterval = 0
    End If
    DoCmd.Hourglass False
    m_IndicadoresReiniciando = EnumSino.No
    m_IndicadoresModo = ""
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

    m_CargaInicialIndicadoresPendiente = True
    m_IndicadoresReiniciando = EnumSino.No
    m_IndicadoresModo = "AUDITORIA"
    Me.TimerInterval = 100
    m_Error = ""
    
    Exit Sub
errores:
    AvanceCerrar
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub Form_Timer()
    On Error GoTo errores
    If Not m_CargaInicialIndicadoresPendiente Then Exit Sub
    If m_CargandoIndicadores Then Exit Sub

    Dim l_Modo As String
    Dim l_Reiniciando As EnumSino

    Me.TimerInterval = 0
    m_CargandoIndicadores = True
    m_CargaInicialIndicadoresPendiente = False
    DoCmd.Hourglass True
    m_Error = ""

    l_Modo = m_IndicadoresModo
    If Trim$(l_Modo) = "" Then
        l_Modo = "AUDITORIA"
    End If
    l_Reiniciando = m_IndicadoresReiniciando
    If l_Reiniciando <> EnumSino.Sí Then
        l_Reiniciando = EnumSino.No
    End If

    Me.lblSeguimientos.Caption = "Seguimiento: obteniendo tareas..."
    Avance Indicadores_MensajeAvance(l_Modo, "INICIO")
    Me.Repaint
    VBA.DoEvents

    PintarIndicadores p_Reiniciando:=l_Reiniciando, p_Modo:=l_Modo, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    Avance Indicadores_MensajeAvance(l_Modo, "APLICAR")
    AvanceCerrar
    DoCmd.Hourglass False
    m_CargandoIndicadores = False
    m_IndicadoresReiniciando = EnumSino.No
    m_IndicadoresModo = ""
    Exit Sub

errores:
    AvanceCerrar
    Me.TimerInterval = 0
    m_CargandoIndicadores = False
    m_IndicadoresReiniciando = EnumSino.No
    m_IndicadoresModo = ""
    DoCmd.Hourglass False
    Me.lblSeguimientos.Caption = "Seguimiento: error al cargar"
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Timer se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
