Option Compare Database
Option Explicit
Private m_Error As String

Private Sub cmdSalir_Click()
    
    
    On Error GoTo errores
    m_Error = ""
    If FormularioAbierto("Form0BDOpciones") Then
        DoCmd.Close acForm, Me.Name, acSaveNo
        Exit Sub
    End If
    pregunta = MsgBox("¿Desea realmente salir de la aplicación", vbExclamation + vbYesNo, "Salir de la aplicación")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    Application.CloseCurrentDatabase
   
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al CmdSalir_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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

Private Sub ComandoBusquedaCompleta_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If FormularioAbierto("FormExpedientesGestion") Then
        DoCmd.Close acForm, "FormExpedientesGestion", acSaveNo
    End If
    DoCmd.OpenForm "FormExpedientesGestion", OpenArgs:="SoloLectura"
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoBusquedaCompleta_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoBusquedaSimple_Click()
   
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If FormularioAbierto("FormExpedientesGestionTecnica") Then
        DoCmd.Close acForm, "FormExpedientesGestionTecnica", acSaveNo
    End If
    DoCmd.OpenForm "FormExpedientesGestionTecnica"
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoBusquedaSimple_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Form_Open(Cancel As Integer)
    
    Dim m_Inicio As Boolean
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
        m_Inicio = True
    Else
        m_Inicio = False
    End If
    
   
    
    
    
    Me.Caption = m_TituloFormulario
    
    Me.lblVersion.Caption = "Versión: " & m_ObjEntorno.VersionAplicacion
    
    
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
    
End Sub

Private Sub lblBusquedaSimple_Click()
    If Me.ComandoBusquedaSimple.Enabled = True Then
        ComandoBusquedaSimple_Click
    End If
End Sub
Private Sub lblBusquedaCompleta_Click()
    If Me.ComandoBusquedaCompleta.Enabled = True Then
        ComandoBusquedaCompleta_Click
    End If
End Sub