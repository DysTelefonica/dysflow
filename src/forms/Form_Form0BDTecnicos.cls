VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_Form0BDTecnicos"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit
Private m_Error As String


Private Sub ComandoAyuda_Click()
     On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If Not fso.FileExists(m_ObjEntorno.URLVideoAyudaNCProyectoParaTecnico) Then
        m_Error = "El video de ayuda no se encuentra disponible en este momento"
        Err.Raise 1000
    End If
    Ejecutar Me.hWnd, "open", m_ObjEntorno.URLVideoAyudaNCProyectoParaTecnico, "", "", 1
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

Private Sub ComandoMenuParteProyecto_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
   
    DoCmd.OpenForm "FormNCProyectoGestion"
   

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

Private Sub Form_Open(Cancel As Integer)
    Dim m_Titulo As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    Ajustar Me
    m_Error = ""
    
    
    
    Avance "Obteniendo Variables de estado"
    
    EVE m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Application.TempVars("EnPruebas") = "Sí" Then
        m_Titulo = "NO CONFORMIDADES VERSIÓN DE PRUEBAS"
        
        If EsAdministrador = EnumSino.Sí Then
            DoCmd.ShowToolbar "Ribbon", acToolbarYes
        Else
            DoCmd.ShowToolbar "Ribbon", acToolbarNo
        End If
    Else
        m_Titulo = "NO CONFORMIDADES"
        'Me.lblTitulo1.FontSize = 25
        DoCmd.ShowToolbar "Ribbon", acToolbarNo
        
    End If
    Me.lblTitulo1.FontSize = 16
    Me.lblTitulo1.Caption = m_Titulo
    
    Me.Caption = m_ObjEntorno.TituloUsuarioConectado
    Me.lblVersion.Caption = "Versión: " & m_ObjEntorno.VersionAplicacion
    AvanceCerrar
    If EsTecnico = EnumSino.Sí Then
        
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        
        Exit Sub
    End If
    DoCmd.OpenForm "Form0BDOpciones"
    DoCmd.Close acForm, Me.Name, acSaveNo
   
    
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
   
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


