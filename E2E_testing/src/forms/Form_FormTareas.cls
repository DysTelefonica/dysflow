Option Compare Database
Option Explicit
Private WithEvents m_FormExpediente As Form_FormExpediente
Public m_ExpSeleccionado As Expediente
Public m_TipoTareaSeleccionada As EnumTipoTarea
Private m_Error As String



Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub
'
Public Function Filtrar(Optional ByRef p_Error As String) As String

    Dim m_Col As Scripting.Dictionary
    Dim m_expediente As Expediente
    Dim m_ID As Variant
    Dim m_TipoTarea As EnumTipoTarea
    Dim lst As ListBox


    On Error GoTo errores

    p_Error = ""
    Set m_ExpSeleccionado = Nothing
    Set lst = Me.ListaFiltrados
    lst.RowSource = "IDExpediente;Estado;Tipo;Nemotécnico;NºExp;Título"
    
    Me.lblListaDeResultados.Caption = "Registros filtrados (0)"

    Me.ComandoDetalle.Enabled = False
    Me.ComandoVerInforme.Enabled = False

    If Not IsNumeric(Nz(Me.ListaTipoTareas.Column(0), "")) Then
        Exit Function
    End If
    m_TipoTarea = CLng(Me.ListaTipoTareas.Column(0))

    Avance "Obteniendo los Exp Filtrados"
    If m_TipoTarea = EnumTipoTarea.EstadoDesconocido Then
        Set m_Col = m_ObjEntorno.ColExpedientesEstadoDesconocido

    ElseIf m_TipoTarea = EnumTipoTarea.APuntoDeRecepcionarCompleto Then
        Set m_Col = m_ObjEntorno.ColExpedientesAPuntoDeRecepcionarCompleto
    ElseIf m_TipoTarea = EnumTipoTarea.APuntoDeRecepcionarHito Then
        Set m_Col = m_ObjEntorno.ColExpedientesAPuntoDeRecepcionarHito
    ElseIf m_TipoTarea = EnumTipoTarea.AdjudicadoSinContrato Then
        Set m_Col = m_ObjEntorno.ColExpedientesAdjudicadosSinContrato
    ElseIf m_TipoTarea = EnumTipoTarea.AdjudicadosTSOLSinCodS4H Then
        Set m_Col = m_ObjEntorno.ColExpedientesAdjudicadosTSOLSinCodS4H
    ElseIf m_TipoTarea = EnumTipoTarea.EnFaseOfertaPorMuchoTiempo Then
        Set m_Col = m_ObjEntorno.ColExpedientesFaseOfertaPorMuchoTiempo
    Else
        Exit Function
    End If
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If

    '"IDExpediente;Estado;Tipo;Nemotécnico;NºExp;Título"
    For Each m_ID In m_Col
        If Nz(m_ID, "") = "" Then GoTo siguiente
        Set m_expediente = m_Col(m_ID)
        With m_expediente
            lst.AddItem m_ID & ";" & .ESTADOCalculadoTexto & ";" & .TipoCalculadoTexto & ";" & .Nemotecnico & ";" & .CodExp & ";" & .Titulo
        End With
siguiente:
        Set m_expediente = Nothing
    Next
    Me.lblListaDeResultados.Caption = "Registros filtrados (" & lst.ListCount - 1 & ")"
    If lst.ListCount = 1 Then
        Exit Function
    End If
    lst.Selected(1) = True
    ListaFiltrados_Click


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Filtrar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If

End Function
'
Private Sub ComandoActualizar_Click()
    Dim m_CaptionOriginal As String

    On Error GoTo errores
    
    m_CaptionOriginal = Me.Caption
    If AntiSpamIsOperationInProgress(Me, m_Error) Then Exit Sub
    AntiSpamEnterOperation Me, m_CaptionOriginal, "ComandoDetalle", "ComandoVerInforme", "ComandoActualizar"

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    With m_ObjEntorno
        Set .ColExpedientesEstadoDesconocido = Nothing
        Set .ColExpedientesAPuntoDeRecepcionarCompleto = Nothing
        Set .ColExpedientesAPuntoDeRecepcionarHito = Nothing
        Set .ColExpedientesAdjudicadosSinContrato = Nothing
        Set .ColExpedientesAdjudicadosTSOLSinCodS4H = Nothing
    End With
    PintarTareas
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    Exit Sub
errores:
     AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizar_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    Me.AllowEdits = False
    AbrirAyuda m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoAyuda_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoDetalle_Click()
    Dim m_CaptionOriginal As String
    
    On Error GoTo errores
    
    m_CaptionOriginal = Me.Caption
    If AntiSpamIsOperationInProgress(Me, m_Error) Then Exit Sub
    AntiSpamEnterOperation Me, m_CaptionOriginal, "ComandoDetalle", "ComandoVerInforme", "ComandoActualizar"

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Me.AllowEdits = False
    m_Error = ""
    If m_ExpSeleccionado Is Nothing Then
        Set m_ExpSeleccionado = constructor.getExpediente(p_IDExpediente:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ExpSeleccionado Is Nothing Then
            m_Error = "Se ha de seleccionar un Elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjExpedienteActivo = m_ExpSeleccionado
    Set m_ObjExpedienteDTOActivo = EstablecerDTODeExpediente(p_Expediente:=m_ObjExpedienteActivo, _
                                                             p_ParaCopia:=EnumSiNo.No, _
                                                             p_Error:=m_Error)
     If m_Error <> "" Then
         Err.Raise 1000
     End If
     
     
     If FormularioAbierto("FormExpediente") Then
         DoCmd.Close acForm, "FormExpediente", acSaveNo
     End If
     DoCmd.OpenForm "FormExpediente"
     If FormularioAbierto("FormExpediente") Then
         Set m_FormExpediente = Forms("FormExpediente")
     End If
    

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    Exit Sub
errores:
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoDetalle_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoVerInforme_Click()
    Dim m_CaptionOriginal As String
    
    On Error GoTo errores
    
    m_CaptionOriginal = Me.Caption
    If AntiSpamIsOperationInProgress(Me, m_Error) Then Exit Sub
    AntiSpamEnterOperation Me, m_CaptionOriginal, "ComandoDetalle", "ComandoVerInforme", "ComandoActualizar"

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Me.AllowEdits = False
    m_Error = ""
    If m_TipoTareaSeleccionada = Empty Then
        m_Error = "Seleccione un tipo de tarea"
        Err.Raise 1000
    End If
    If m_TipoTareaSeleccionada = EnumTipoTarea.EstadoDesconocido Then
        getURLInformeExpedientesEstadoDesconocido m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    ElseIf m_TipoTareaSeleccionada = EnumTipoTarea.APuntoDeRecepcionarCompleto Then
        getURLInformeExpedientesAPuntoDeRecepcionarCompleto m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    ElseIf m_TipoTareaSeleccionada = EnumTipoTarea.APuntoDeRecepcionarHito Then
        getURLInformeExpedientesAPuntoDeRecepcionarHito m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    ElseIf m_TipoTareaSeleccionada = EnumTipoTarea.AdjudicadoSinContrato Then
        getURLInformeExpedientesAdjudicadosSinContrato m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    ElseIf m_TipoTareaSeleccionada = EnumTipoTarea.AdjudicadosTSOLSinCodS4H Then
        getURLInformeExpedientesAdjudicadosTSOLSinCodS4H m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    ElseIf m_TipoTareaSeleccionada = EnumTipoTarea.EnFaseOfertaPorMuchoTiempo Then
        getURLInformeExpedientesFaseOfertaPorMuchoTiempo m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        m_Error = "Tipo de tarea no codificada"
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    Exit Sub
errores:
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoDetalle_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    Me.AllowEdits = True
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ListaFiltrados_DblClick(Cancel As Integer)
    On Error Resume Next
    Application.Echo False
    If Me.ComandoDetalle.Enabled = True Then
        ComandoDetalle_Click
    End If

    Application.Echo True
End Sub
'
Public Sub ListaTipoTareas_Click()

    Dim lst As ListBox
    
    On Error Resume Next

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    Me.Explicacion.Visible = True
    Set lst = Me.ListaTipoTareas
    
    If Not IsNumeric(Nz(lst.Column(0), "")) Then
       GoTo Ejecutar
    End If
    
    If m_TipoTareaSeleccionada <> CLng(lst.Column(0)) Then
        m_TipoTareaSeleccionada = CLng(lst.Column(0))
        GoTo Ejecutar
    End If
    If Not IsNumeric(Nz(lst.Column(0), "")) Then
        m_TipoTareaSeleccionada = Empty
    Else
        m_TipoTareaSeleccionada = CLng(lst.Column(0))
    End If

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
Ejecutar:
    Me.Explicacion.Visible = True
    Me.Explicacion = m_ObjEntorno.colExplicacionTipoTarea(CStr(m_TipoTareaSeleccionada))

    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not IsNumeric(Nz(lst.Column(0), "")) Then
        m_TipoTareaSeleccionada = Empty
    Else
        m_TipoTareaSeleccionada = CLng(lst.Column(0))
    End If
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaTipoTareas_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub



Private Sub Form_Open(Cancel As Integer)
    
    Dim i As Integer
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""

    Ajustar Me
    Me.AllowEdits = False
    Me.Explicacion.Visible = False
    Me.Caption = Me.lblTitulo.Caption
    PintarTareas EnumSiNo.No
    AvanceCerrar
    Me.Explicacion.Visible = False


    If Not m_ObjEntorno.ColExpedientesEstadoDesconocido Is Nothing Then
        Me.ListaTipoTareas.Selected(0) = True
        ListaTipoTareas_Click
    Else
        If Not m_ObjEntorno.ColExpedientesAPuntoDeRecepcionarCompleto Is Nothing Then
             Me.ListaTipoTareas.Selected(1) = True
            ListaTipoTareas_Click
        Else
            If Not m_ObjEntorno.ColExpedientesAPuntoDeRecepcionarHito Is Nothing Then
                 Me.ListaTipoTareas.Selected(2) = True
                ListaTipoTareas_Click
            Else
                If Not m_ObjEntorno.ColExpedientesAdjudicadosTSOLSinCodS4H Is Nothing Then
                     Me.ListaTipoTareas.Selected(3) = True
                    ListaTipoTareas_Click
                End If
            End If
        End If
    End If
    For i = 0 To Me.ListaTipoTareas.ListCount
        If Me.ListaTipoTareas.Selected(i) = True Then
            ListaTipoTareas_Click
        End If
    Next
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    'On Error Resume Next
    Me.AllowEdits = True
    AvanceCerrar
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ListaFiltrados_Click()


    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""


    Me.ComandoDetalle.Enabled = False
    Me.ComandoVerInforme.Enabled = False
    Me.AllowEdits = False
    
    If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
        Set m_ExpSeleccionado = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.AllowEdits = True
        Exit Sub
    End If
    If m_ExpSeleccionado Is Nothing Then
        Set m_ExpSeleccionado = constructor.getExpediente(p_IDExpediente:=Me.ListaFiltrados.Column(0), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If

    Else
        If Me.ListaFiltrados.Column(0) <> m_ExpSeleccionado.IDExpediente Then
            Set m_ExpSeleccionado = constructor.getExpediente(p_IDExpediente:=Me.ListaFiltrados.Column(0), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If

        End If
    End If
    If m_ExpSeleccionado Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.AllowEdits = True
        Exit Sub
    End If

    Me.ComandoDetalle.Enabled = True
    Me.ComandoVerInforme.Enabled = True



    Me.AllowEdits = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaFiltrados_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")

End Sub

