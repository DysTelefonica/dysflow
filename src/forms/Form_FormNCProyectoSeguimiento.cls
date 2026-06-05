Option Compare Database
Option Explicit



Public m_ARProyectoSeleccionado As ARProyecto


Private m_Error As String
Private m_CargaInicialIndicadoresPendiente As Boolean
Private m_CargandoIndicadores As Boolean
Private m_IndicadoresReiniciando As EnumSino
Private m_UltimaDuracionIndicadores As Double


Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ComandoActualizar_Click()
    On Error GoTo errores

    m_Error = ""
    If m_CargandoIndicadores Then Exit Sub

    m_IndicadoresReiniciando = EnumSino.Sí
    m_CargaInicialIndicadoresPendiente = True
    Me.TimerInterval = 100
    Me.lblEstado.Caption = "Actualizando seguimiento de proyecto..."
    Me.lblEstado.Visible = True
    Me.Repaint
    Exit Sub
errores:
    If m_CargandoIndicadores Then
        AvanceCerrar
        m_CargandoIndicadores = False
    End If
    m_CargaInicialIndicadoresPendiente = False
    Me.TimerInterval = 0
    Me.lblEstado.Visible = False
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub Form_Load()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me
    
    
    
    Me.Caption = Me.lblTitulo.Caption

    m_CargaInicialIndicadoresPendiente = True
    m_IndicadoresReiniciando = EnumSino.No
    Me.lblEstado.Caption = "Preparando seguimiento de proyecto..."
    Me.lblEstado.Visible = True
    Me.TimerInterval = 100
    
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
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub Form_Timer()
    On Error GoTo errores

    Dim loadedOk As Boolean

    If Not m_CargaInicialIndicadoresPendiente Then Exit Sub
    If m_CargandoIndicadores Then Exit Sub

    Me.TimerInterval = 0
    m_CargandoIndicadores = True
    m_CargaInicialIndicadoresPendiente = False
    DoCmd.Hourglass True
    m_Error = ""

    Me.lblEstado.Caption = "Cargando seguimiento de proyecto..."
    Me.lblEstado.Visible = True
    Avance Me.lblEstado.Caption
    Me.Repaint
    VBA.DoEvents

    loadedOk = NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto( _
        p_Reiniciando:=m_IndicadoresReiniciando, _
        p_DuracionSegundos:=m_UltimaDuracionIndicadores, _
        p_Error:=m_Error)
    If Not loadedOk Or m_Error <> "" Then Err.Raise 1000

    Me.lblEstado.Caption = "Seguimiento cargado en " & Format$(m_UltimaDuracionIndicadores, "0.00") & " s"
    Me.Repaint
    VBA.DoEvents
    AvanceCerrar
    Me.lblEstado.Visible = False

    DoCmd.Hourglass False
    m_CargandoIndicadores = False
    m_IndicadoresReiniciando = EnumSino.No
    Exit Sub

errores:
    On Error Resume Next
    AvanceCerrar
    On Error GoTo 0
    Me.TimerInterval = 0
    m_CargandoIndicadores = False
    m_CargaInicialIndicadoresPendiente = False
    m_IndicadoresReiniciando = EnumSino.No
    DoCmd.Hourglass False
    Me.lblEstado.Visible = False
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Timer se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



