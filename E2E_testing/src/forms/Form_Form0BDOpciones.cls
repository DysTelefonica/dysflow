Option Compare Database
Option Explicit
Private m_Error As String

Private Sub cmdSalir_Click()
    
    
    On Error GoTo errores
    m_Error = ""
    pregunta = MsgBox("¿Desea realmente salir de la aplicación", vbExclamation + vbYesNo, "Salir de la aplicación")
    If pregunta <> vbYes Then
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
    If Err.Number <> 1000 Then
        m_Error = "Al CmdSalir_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Quit acQuitSaveAll
End Sub

Private Sub ComandoAlta_Click()
    On Error GoTo errores
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    DoCmd.OpenForm "FormExpedienteAltaTipo", OpenArgs:="DesdeInicio"
    
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoAlta_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoAyuda_Click()
    On Error GoTo errores
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    AbrirAyuda m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoAyuda_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoBuscadorTecnico_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If FormularioAbierto("Form0BDOpcionesTecnicos") Then
        DoCmd.Close acForm, "Form0BDOpcionesTecnicos", acSaveNo
    End If
    DoCmd.OpenForm "Form0BDOpcionesTecnicos"
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoBuscadorTecnico_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoGestionExpedientes_Click()
    Dim m_NombreForm As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico <> EnumSiNo.Sí Then
        m_NombreForm = "FormExpedientesGestion"
    Else
        m_NombreForm = "FormExpedientesGestionTecnica"
    End If
    If FormularioAbierto(m_NombreForm) Then
        DoCmd.Close acForm, m_NombreForm, acSaveNo
    End If

    MostrarPopupProgreso "Cargando...", "Preparando gestión de expedientes..."

    DoCmd.OpenForm m_NombreForm

    ' Rellenar la barra antes de cerrar (mínimo visible)
    Dim k As Long
    For k = 0 To Forms("frmBusy").lblProgresoFondo.Width Step 30
        Forms("frmBusy").lblProgresoBarra.Width = k
        DoEvents
    Next k

    DoCmd.Close acForm, "frmBusy"
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Close acForm, "frmBusy", acSaveNo
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoGestionExpedientes_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub lblGestionBatchE2E_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""

    If FormularioAbierto("FormE2EGestionBatch") Then
        DoCmd.Close acForm, "FormE2EGestionBatch", acSaveNo
    End If
    DoCmd.OpenForm "FormE2EGestionBatch"

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        m_Error = "Al lblGestionBatchE2E_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoGestorEntidades_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If FormularioAbierto("Form0BDGestorEntidades") Then
        DoCmd.Close acForm, "Form0BDGestorEntidades", acSaveNo
    End If
    DoCmd.OpenForm "Form0BDGestorEntidades"
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoGestorEntidades_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub Form_Open(Cancel As Integer)
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me
    
    If m_ObjEntorno Is Nothing Then
        EVE m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    PintarTareas EnumSiNo.Sí, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Application.TempVars("EnDesarrollo") <> "Sí" Then
        DoCmd.ShowToolbar "Ribbon", acToolbarNo
    Else
        DoCmd.ShowToolbar "Ribbon", acToolbarYes
    End If
    
    Me.ComandoAlta.Enabled = False
    Me.Caption = m_TituloFormulario
    
    Me.lblVersion.Caption = "Versión: " & m_ObjEntorno.VersionAplicacion
    Me.ComandoGestionExpedientes.Enabled = True
    
    If EsAdministrador = EnumSiNo.Sí Then
        Me.ComandoAlta.Enabled = True
        Me.ComandoGestorEntidades.Enabled = True
        Me.ComandoBuscadorTecnico.Visible = True
    Else
        Me.ComandoBuscadorTecnico.Visible = False
    End If
    Debug.Print Me.lblAlta.ForeColor
    AvanceCerrar
    Me.lblEstado.Visible = False
    VBA.DoEvents
    DoCmd.Hourglass False
    
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    If Application.TempVars("EnDesarrollo") <> "Sí" Then
        DoCmd.Quit acQuitSaveAll
    End If
End Sub


Private Sub ImagenTareasOFF_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    DoCmd.OpenForm "FormTareas"
    
    AvanceCerrar
    Me.lblEstado.Visible = False
    VBA.DoEvents
    DoCmd.Hourglass False
    Me.AllowEdits = True
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ImagenTareasOFF_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Sub ImagenTareasON_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    DoCmd.OpenForm "FormTareas"
    
    AvanceCerrar
    Me.lblEstado.Visible = False
    VBA.DoEvents
    DoCmd.Hourglass False
    Me.AllowEdits = True
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ImagenTareasON_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Sub lblGestionExpedientes_Click()
    If Me.ComandoGestionExpedientes.Enabled = True Then
        ComandoGestionExpedientes_Click
    End If
End Sub

Private Sub lblAlta_Click()
    If Me.ComandoAlta.Enabled = True Then
        ComandoAlta_Click
    End If
    
End Sub
Private Sub lblGestorEntidades_Click()
    If Me.ComandoGestorEntidades.Enabled = True Then
        ComandoGestorEntidades_Click
    End If
    
End Sub