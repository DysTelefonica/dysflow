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
    DoCmd.Close acForm, Me.name, acSaveNo
End Sub

Private Sub ComandoActualizar_Click()
    On Error GoTo errores

    m_Error = ""
    If m_CargandoIndicadores Then Exit Sub

    m_IndicadoresReiniciando = EnumSino.Sí
    m_CargaInicialIndicadoresPendiente = True
    Me.TimerInterval = 100
    Exit Sub
errores:
    m_CargandoIndicadores = False
    m_CargaInicialIndicadoresPendiente = False
    Me.TimerInterval = 0
    m_IndicadoresReiniciando = EnumSino.No
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoConfiguracion_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub Form_Load()

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me



    Me.caption = Me.lblTitulo.caption

    m_CargaInicialIndicadoresPendiente = True
    m_IndicadoresReiniciando = EnumSino.No
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
    DoCmd.Close acForm, Me.name, acSaveNo
End Sub


Private Sub Form_Timer()
    On Error GoTo errores

    If Not m_CargaInicialIndicadoresPendiente Then Exit Sub
    If m_CargandoIndicadores Then Exit Sub

    Me.TimerInterval = 0
    m_CargandoIndicadores = True
    m_CargaInicialIndicadoresPendiente = False
    DoCmd.Hourglass True
    m_Error = ""

    Dim l_Duracion As Double
    Dim l_Reiniciando As EnumSino
    l_Reiniciando = m_IndicadoresReiniciando
    If l_Reiniciando <> EnumSino.Sí Then
        l_Reiniciando = EnumSino.No
    End If

    If Not NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto(l_Reiniciando, p_DuracionSegundos:=m_UltimaDuracionIndicadores, p_Error:=m_Error) Then
        Err.Raise 1000
    End If
    l_Duracion = m_UltimaDuracionIndicadores
    DoCmd.Hourglass False
    m_CargandoIndicadores = False
    m_IndicadoresReiniciando = EnumSino.No
    Exit Sub

errores:
    m_CargandoIndicadores = False
    m_CargaInicialIndicadoresPendiente = False
    Me.TimerInterval = 0
    m_IndicadoresReiniciando = EnumSino.No
    DoCmd.Hourglass False
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Timer se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
