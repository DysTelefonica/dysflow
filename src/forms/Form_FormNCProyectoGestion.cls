Option Compare Database
Option Explicit


Public Event NCSeleccinonada(p_NC As NCProyecto)
Public m_NCSeleccionada As NCProyecto
Private m_ColFiltrado As Collection
Private m_Expediente As Expediente
Private WithEvents m_FormExpedientes As Form_FormExpedientesBusqueda

Private m_Error As String


Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub




Private Sub ComandoAltaVinculadas_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    EnsureNCProyectoGestionSelected p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ObjNCProyectoActivaPVinculada = m_NCSeleccionada
    If FormularioAbierto("FormNCProyectoGeneralConVinculoNC") Then
        DoCmd.Close acForm, "FormNCProyectoGeneralConVinculoNC", acSaveNo
    End If
    DoCmd.OpenForm "FormNCProyectoGeneralConVinculoNC"
    
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaVinculadas_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoEnviarCorreoElectronico_Click()
    
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    On Error GoTo errores
    m_Error = ""
    EnsureNCProyectoGestionSelected p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ObjNCProyectoActiva = m_NCSeleccionada
    If FormularioAbierto("FormCorreo") Then
        DoCmd.Close acForm, "FormCorreo", acSaveNo
    End If
    DoCmd.OpenForm "FormCorreo", OpenArgs:=EnumSino.Sí
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEnviarCorreoElectronico_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoListaEnExcel_Click()
    Dim m_URL As String
    
    On Error GoTo errores
    
   
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Avance "Exportando a excel"
    m_URL = GestionNCProyectosAExcel(p_col:=m_ColFiltrado, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not fso.FileExists(m_URL) Then
        m_Error = "No se ha podido obtener el documento excel"
        Err.Raise 1000
    End If
    Ejecutar Me.hWnd, "open", m_URL, "", "", 1
    AvanceCerrar
'    lbl.Visible = False
'    Set lbl = Nothing
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoExportarAExcel_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoNCProyectoHistorial_Click()
    
    Dim m_mensaje As String
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    On Error GoTo errores
    m_Error = ""
    EnsureNCProyectoGestionSelected p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_mensaje = HTMHistorialProyecto(m_NCSeleccionada, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    HTMLENTXT p_HTML:=m_mensaje, p_Error:=m_Error
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
        m_Error = "Al ComandoNCProyectoHistorial_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ComandoBuscarExpediente_Click()
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Expediente As Expediente
    
    Dim m_PalabraClave As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    m_PalabraClave = Nz(Me.PalabraClave, "")
    If m_PalabraClave = "" Then
        Me.IDExpediente = Null
        ActualizarLista
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_Col = constructor.getExpedientesBusqueda( _
                                                    p_PC:=m_PalabraClave, _
                                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Me.IDExpediente = Null
        ComandoIrABusquedaExpedientes_Click
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    
    If m_Col.count = 1 Then
        For Each m_ID In m_Col
            Set m_Expediente = m_Col(m_ID)
            'If Nz(Me.IDExpediente, "") <> Me.IDExpediente Then
                Me.IDExpediente = m_Expediente.IDExpediente
                If m_Expediente.Nemotecnico <> "" Then
                    Me.PalabraClave = m_Expediente.Nemotecnico
                ElseIf m_Expediente.CodExp <> "" Then
                    Me.PalabraClave = m_Expediente.CodExp
                Else
                    Me.PalabraClave = m_Expediente.IDExpediente
                End If
                ActualizarLista
            'End If
            
            
        Next
        
        
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If FormularioAbierto("FormExpedientesBusqueda") Then
        DoCmd.Close acForm, "FormExpedientesBusqueda", acSaveNo
    End If
    DoCmd.OpenForm "FormExpedientesBusqueda"
    If FormularioAbierto("FormExpedientesBusqueda") Then
        Set m_FormExpedientes = Forms("FormExpedientesBusqueda")
        m_FormExpedientes.PalabraClave = Nz(Me.PalabraClave, "")
        Form_FormExpedientesBusqueda.Filtrar
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoBuscarExpediente_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ComandoEditar_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    EnsureNCProyectoGestionSelected p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ObjNCProyectoActiva = m_NCSeleccionada
    
    If FormularioAbierto("FormNCProyecto") Then
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    End If
    DoCmd.OpenForm "FormNCProyecto"
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEditar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ComandoEliminar_Click()
    
    Dim m_NCOp As NCProyectoOperaciones
    Dim m_Motivo As String
    On Error GoTo errores
    
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    EnsureNCProyectoGestionSelected p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    If Me.ComandoEliminar.Caption = "Eliminar" Then
        pregunta = MsgBox("¿Desea marcar como borrado la no conformidad de proyecto seleccionada?", vbExclamation + vbYesNo + vbDefaultButton2, "Borrado de NC")
        m_Motivo = Nz(InputBox("Introduzca el motivo para marcar como borrada la no conformidad", "Motivación"), "")
        
    Else
        pregunta = MsgBox("¿Desea habilitar la no conformidad de proyecto seleccionada?", vbExclamation + vbYesNo + vbDefaultButton2, "Habilitación de NC")
    End If
    
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_NCOp = New NCProyectoOperaciones
    With m_NCOp
        Set .nc = m_NCSeleccionada
        If Me.ComandoEliminar.Caption = "Eliminar" Then
            .nc.MotivoBorrado = m_Motivo
            .Eliminar EnumSino.No, m_Error
        Else
            .Habilitar m_Error
        End If
        
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    ActualizarLista EnumSino.Sí
    ListaFiltrados_Click
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoInformeLista_Click()
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
   
    If Me.ListaFiltrados.ListCount = 0 Then
        m_Error = "No hay elementos en la lista"
        Err.Raise 1000
    End If
    Set m_Col = BuildNCProyectoGestionReportCollection( _
                    p_ListedItems:=m_ColFiltrado, _
                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        m_Error = "No hay elementos en la lista una vez tratados"
        Err.Raise 1000
    End If
    GenerarWordNoConformidades p_EsDeProyecto:=EnumSino.Sí, p_col:=m_Col, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
   
    Me.AllowEdits = False
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoInformeLista_Click se ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoLimiparEstadoNC_Click()
    On Error Resume Next
    Me.EstadoNC = Null
    ActualizarLista
End Sub


Private Sub ComandoLimiparPalabraClave_Click()
    On Error Resume Next
    Me.Google = Null
    ActualizarLista
End Sub

Private Sub ComandoLimiparRESPONSABLECALIDAD_Click()
    On Error Resume Next
    Me.RESPONSABLECALIDAD = Null
    ActualizarLista
End Sub

Private Sub ComandoLimiparRESPONSABLETELEFONICA_Click()
    On Error Resume Next
    Me.ResponsableTelefonica = Null
    ActualizarLista
End Sub

Private Sub ComandoLimpiaoRequiereControlEficacia_Click()
    On Error Resume Next
    Me.ComboRequiereControlEficacia = Null
    ActualizarLista
End Sub

Private Sub ComandoLimpiarControlEficaciaRelleno_Click()
    On Error Resume Next
    Me.ComboControlEficaciaRelleno = Null
    ActualizarLista
End Sub

Private Sub ComandoLimpiarRegistrosCerrados_Click()
    On Error Resume Next
    Me.ComboRegistrosCerrados = Null
    ActualizarLista
End Sub



Public Sub ComandoActualizarLista_Click()
    Dim errorNumber As Long
    Dim errorDescription As String
    Dim refreshResult As Scripting.Dictionary

    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""

    Set refreshResult = PrepareNCProyectoGestionRefresh(m_ObjEntorno, m_Error)
    If refreshResult Is Nothing Then
        m_Error = "PrepareNCProyectoGestionRefresh did not return a result"
        Err.Raise 1000, "Form_FormNCProyectoGestion.ComandoActualizarLista_Click", m_Error
    End If
    If Not CBool(refreshResult("Success")) Then
        If m_Error = "" Then m_Error = "PrepareNCProyectoGestionRefresh failed at " & CStr(refreshResult("FailedStep"))
        Err.Raise 1000, "Form_FormNCProyectoGestion.ComandoActualizarLista_Click", m_Error
    End If

    EstablecerCombos m_Error
    If m_Error <> "" Then
        Err.Raise 1000, "Form_FormNCProyectoGestion.ComandoActualizarLista_Click", m_Error
    End If

    With Me.lblEstado
        .Caption = CStr(refreshResult("FeedbackCaption"))
        .Visible = True
    End With

    ActualizarDatosFiltrados
    ActualizarLista

    Me.lblEstado.Visible = False
SALIR:
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    If errorNumber <> 0 Then
        Err.Raise errorNumber, "Form_FormNCProyectoGestion.ComandoActualizarLista_Click", errorDescription
    End If
    Exit Sub

errores:
    errorNumber = Err.Number
    If errorNumber <> 1000 Then
        m_Error = "Al ComandoActualizarLista_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    ElseIf m_Error = "" Then
        m_Error = Err.Description
    End If
    errorDescription = m_Error
    Resume SALIR
    
End Sub



Private Sub ComandoInforme_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""

    EnsureNCProyectoGestionSelected p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    GenerarWordNoConformidades p_EsDeProyecto:=EnumSino.Sí, p_NC:=m_NCSeleccionada, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoInforme_Click se ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    AvanceCerrar
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoAlta_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    
    Set m_ObjNCProyectoActiva = Nothing
    Set m_ObjNCProyectoActivaPVinculada = Nothing
    If FormularioAbierto("FormNCProyecto") Then
        DoCmd.Close acForm, "FormNCProyecto", acSaveNo
    End If
    DoCmd.OpenForm "FormNCProyecto"
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComboCodigo_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoLimiparDescripcion_Click()
    On Error Resume Next
    Me.Descripcion = Null
    ActualizarLista
End Sub

Private Sub ComandoLimiparNotas_Click()
    On Error Resume Next
    Me.Notas = Null
    ActualizarLista
End Sub


Private Sub ComandoLimpiarCodigo_Click()
    On Error Resume Next
    Me.ComboCodigo = Null
    ActualizarLista
End Sub

Private Sub ComandoLimpiarExp_Click()
    On Error Resume Next
    Me.IDExpediente = Null
    Me.PalabraClave = Null
    ActualizarLista
End Sub



Private Sub ComandoLimpiarJuridica_Click()
    On Error Resume Next
    Me.ComboJuridica = Null
    ActualizarLista
End Sub


Private Sub ComandoLimpiarTipo_Click()
    On Error Resume Next
    Me.ComboTipo = Null
    ActualizarLista
End Sub



Public Sub ComboCodigo_AfterUpdate()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComboCodigo_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub




Private Sub ComboRegistrosCerrados_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComboRegistrosCerrados_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComboRequiereControlEficacia_AfterUpdate()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComboRequiereControlEficacia_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComboControlEficaciaRelleno_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComboControlEficaciaRelleno_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



Private Sub ComboJuridica_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComboJuridica_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub








Private Sub Ctl_ComandoActualizarLista_Click()

End Sub

Public Sub EstadoNC_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al EstadoNC_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub





Private Sub ComboTipo_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComboTipo_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub Descripcion_Exit(Cancel As Integer)
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Descripcion_Exit se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



Private Sub Form_Open(Cancel As Integer)
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me
    Me.Caption = Me.lblTitulo1.Caption
    Me.lblEstado.Visible = False
    EstablecerDatos m_Error
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
        m_Error = "Al Form_Open se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    
    EstablecerCombos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    If EsTecnico = EnumSino.Sí Then
        Me.ComandoAlta.Enabled = False
        Me.ComandoEnviarCorreoElectronico.Enabled = False
        Me.ComandoNCProyectoHistorial.Enabled = False
        
    Else
        Me.ComandoAlta.Enabled = True
        Me.ComandoEnviarCorreoElectronico.Enabled = True
        Me.ComandoNCProyectoHistorial.Enabled = True
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If

End Function
Public Function getNCsFiltrados(Optional ByRef p_Error As String) As Collection

    On Error GoTo errores

    Set getNCsFiltrados = GetNCsProyectoGestionFiltrados( _
                            p_Codigo:=Nz(Me.ComboCodigo, ""), _
                            p_IDExpediente:=CLng(Val(Nz(Me.IDExpediente, "0"))), _
                            p_Juridica:=Nz(Me.ComboJuridica, ""), _
                            p_IDTipo:=CLng(Val(Nz(Me.ComboTipo.Column(0), "0"))), _
                            p_EstadoValor:=Nz(Me.EstadoNC, ""), _
                            p_EstadoEnum:=CLng(Val(Nz(Me.EstadoNC.Column(1), "-1"))), _
                            p_Descripcion:=Nz(Me.Descripcion, ""), _
                            p_Notas:=Nz(Me.Notas, ""), _
                            p_RequiereControlEficacia:=Nz(Me.ComboRequiereControlEficacia, ""), _
                            p_ControlEficaciaRelleno:=Nz(Me.ComboControlEficaciaRelleno, ""), _
                            p_RegistrosCerrados:=Nz(Me.ComboRegistrosCerrados, ""), _
                            p_ResponsableTelefonica:=Nz(Me.ResponsableTelefonica, ""), _
                            p_ResponsableCalidad:=Nz(Me.RESPONSABLECALIDAD, ""), _
                            p_Google:=Nz(Me.Google, ""), _
                            p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsFiltrados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    
End Function

Public Sub ActualizarLista(Optional p_ManteniendoSeleccionado As EnumSino)
    
    Dim m_ID As Variant
    Dim m_NC As NCProyecto
   
    Dim m_IDNCPrevia As String
    Dim i As Long
    Dim m_Varitem As Variant
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    Me.ComandoListaEnExcel.Enabled = False
    Me.ComandoInformeLista.Enabled = False
    If p_ManteniendoSeleccionado = EnumSino.Sí Then
        'If Me.ListaFiltrados.ItemsSelected > 0 Then
            For Each m_Varitem In Me.ListaFiltrados.ItemsSelected
                m_IDNCPrevia = Me.ListaFiltrados.Column(0, m_Varitem)
            Next
        'End If
    End If
    Me.ComandoEditar.Enabled = False
    Me.ComandoEliminar.Enabled = False
    Me.ComandoNCProyectoHistorial.Enabled = False
    Me.ComandoEnviarCorreoElectronico.Enabled = False
    Me.ComandoInforme.Enabled = False
   
    Me.lblEstado.Visible = False
    Set m_NCSeleccionada = Nothing
    Me.ListaFiltrados.RowSource = "IDNoconformidad;Código;Descripción;Exp.;Estado;FApertura;FCierre"
    Set m_ColFiltrado = getNCsFiltrados(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ColFiltrado Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Me.ComandoListaEnExcel.Enabled = True
    Me.ComandoInformeLista.Enabled = True
    RellenarListaConCol m_ColFiltrado, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If IsNumeric(m_IDNCPrevia) Then
        For i = 1 To Me.ListaFiltrados.ListCount - 1
            If Me.ListaFiltrados.Column(0, i) = m_IDNCPrevia Then
                Me.ListaFiltrados.Selected(i) = True
                ListaFiltrados_Click
                VBA.DoEvents
                DoCmd.Hourglass False
                VBA.DoEvents
                Exit Sub
            End If
            
        Next
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ActualizarLista se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub Google_KeyDown(KeyCode As Integer, Shift As Integer)
    If KeyCode = vbKeyReturn Or KeyCode = 9 Then
        Me.ComandoBuscarExpediente.SetFocus
        Me.Google.SetFocus
        ActualizarLista
        
        ' Si deseas evitar que Access realice la acción predeterminada de Enter,
        ' puedes utilizar la siguiente línea:
        KeyCode = 0
    End If
End Sub

Private Sub ListaFiltrados_Click()
    
    Dim m_EstadoClaro As String
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.lblVinculado.Visible = False
    Me.ComandoEditar.Enabled = False
    Me.ComandoEliminar.Enabled = False
    Me.ComandoEnviarCorreoElectronico.Enabled = False
    Me.ComandoInforme.Enabled = False
    Me.ComandoNCProyectoHistorial.Enabled = False
    Me.ComandoAltaVinculadas.Enabled = False
    Me.ComandoAltaVinculadas.Caption = "Alta NC Vinculada"
    Me.lblEstado.Visible = False
    If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
        Set m_NCSeleccionada = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    EnsureNCProyectoGestionSelected p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_NCSeleccionada Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass True
        VBA.DoEvents
        Exit Sub
    End If
     Me.ComandoInforme.Enabled = True
     Me.ComandoEditar.Enabled = True
    Me.ComandoAltaVinculadas.Caption = "Alta NC vinculada a " & m_NCSeleccionada.CodigoNoConformidad
    If EsTecnico <> EnumSino.Sí Then
        Me.ComandoAltaVinculadas.Enabled = True
        
        Me.ComandoEnviarCorreoElectronico.Enabled = True
        Me.ComandoEliminar.Enabled = True
        Me.ComandoNCProyectoHistorial.Enabled = True
    End If
    
    
    
    If m_NCSeleccionada.NCProyectoAsociada Is Nothing Then
        Me.lblVinculado.Visible = False
    Else
        Me.lblVinculado.Visible = True
        Me.lblVinculado.Caption = "Vinculada con la " & m_NCSeleccionada.NCProyectoAsociada.CodigoNoConformidad
    End If
    
   
    
    
    If m_NCSeleccionada.Estado = "BORRADA" Then
        Me.ComandoEliminar.Caption = "Habilitar"
    Else
        Me.ComandoEliminar.Caption = "Eliminar"
    End If
    
    
    
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ListaFiltrados_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ListaFiltrados_DblClick(Cancel As Integer)
    On Error Resume Next
    Application.Echo False
    If Me.ComandoEditar.Enabled = True Then
        ComandoEditar_Click
    End If
    Application.Echo True
End Sub


Public Function SeleccionarNC( _
                                m_ID As String, _
                                Optional ByRef p_Error As String _
                                ) As String
   
    Dim lst As ListBox
    Dim i As Long
    
    
    On Error GoTo errores
    Set lst = Me.ListaFiltrados
    If lst.ListCount = 0 Then
        Exit Function
    End If
    For i = 1 To lst.ListCount - 1
        If lst.Column(0, i) = m_ID Then
            lst.Selected(i) = True
            ListaFiltrados_Click
            Exit Function
        End If
    Next
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SeleccionarNC ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function




Private Sub m_FormExpedientes_Seleccionado(m_Exp As Expediente)
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    With m_Exp
        If Nz(Me.IDExpediente, "") <> .IDExpediente Then
            Me.IDExpediente = .IDExpediente
            If .Nemotecnico <> "" Then
                Me.PalabraClave = .Nemotecnico
            ElseIf .CodExp <> "" Then
                Me.PalabraClave = .CodExp
            Else
                Me.PalabraClave = .IDExpediente
            End If
            ActualizarLista
        End If
    End With
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormExpedientes_Seleccionado se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



Private Sub Notas_Exit(Cancel As Integer)
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    ActualizarLista
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Notas_Exit se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub




Private Sub PieDelFormulario_DblClick(Cancel As Integer)
    Dim m_ID As String
    Dim m_NCProyecto As NCProyecto
    Dim m_mensaje As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    EnsureNCProyectoGestionSelected p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_mensaje = HTMLNCProyecto(p_NC:=m_NCSeleccionada, p_ConAcciones:=EnumSino.Sí, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    AbrirHTMLEnLocal p_Mensaje:=m_mensaje, p_Error:=m_Error
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
        m_Error = "Al PieDelFormulario_DblClick se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub RESPONSABLECALIDAD_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    ActualizarLista
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al RESPONSABLECALIDAD_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



Private Function RellenarListaConCol( _
                                    p_col As Collection, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_Item As Object
    
    Dim lst As ListBox
    
    
    On Error GoTo errores
    
    
    
    If p_col Is Nothing Then
       Exit Function
    End If
    Set lst = Me.ListaFiltrados
    lst.RowSource = "IDNoconformidad;Código;Descripción;Exp.;Estado;FApertura;FCierre"
    For Each m_Item In p_col
        lst.AddItem BuildNCProyectoGestionListRow(m_Item, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_Item = Nothing
    Next
    
    
    If lst.ListCount > 1 Then
        lst.Selected(1) = True
        ListaFiltrados_Click
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaConCol ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub EnsureNCProyectoGestionSelected(Optional ByRef p_Error As String)
    On Error GoTo errores

    p_Error = ""
    Set m_NCSeleccionada = ResolveNCProyectoGestionSelection( _
                            p_Current:=m_NCSeleccionada, _
                            p_SelectedID:=Nz(Me.ListaFiltrados.Column(0), ""), _
                            p_Error:=p_Error)
    If p_Error <> "" Then Err.Raise 1000
    If m_NCSeleccionada Is Nothing Then
        p_Error = "Seleccione un elemento de la lista"
        Err.Raise 1000
    End If
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EnsureNCProyectoGestionSelected ha devuelto el error: " & Err.Description
    End If
End Sub


Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
   
    
    On Error GoTo errores
    EstablecerComboCodigo Me.ComboCodigo, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    EstablecerComboJuridicas Me.ComboJuridica, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    EstablecerComboTipo Me.ComboTipo, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerComboJP Me.ResponsableTelefonica, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerComboResponsablesCalidad cmb:=Me.RESPONSABLECALIDAD, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerComboEstado Me.EstadoNC, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Me.EstadoNC.AddItem "Abiertas;0"
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerCombos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub RESPONSABLETELEFONICA_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    ActualizarLista
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al RESPONSABLETELEFONICA_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
Private Sub PalabraClave_KeyDown(KeyCode As Integer, Shift As Integer)
    
  
    
    If KeyCode = vbKeyReturn Or KeyCode = 9 Then
        Me.ComandoBuscarExpediente.SetFocus
        Me.PalabraClave.SetFocus
        'Debug.Print Me.Pass
        ' Código que deseas ejecutar cuando se pulse Enter
        ComandoBuscarExpediente_Click
        
        ' Si deseas evitar que Access realice la acción predeterminada de Enter,
        ' puedes utilizar la siguiente línea:
        KeyCode = 0
    End If
End Sub
Private Sub ComandoIrABusquedaExpedientes_Click()
    
    On Error GoTo errores
    
   
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormExpedientesBusqueda") Then
        DoCmd.Close acForm, "FormExpedientesBusqueda", acSaveNo
    End If
    DoCmd.OpenForm "FormExpedientesBusqueda"
    If FormularioAbierto("FormExpedientesBusqueda") Then
        Set m_FormExpedientes = Forms("FormExpedientesBusqueda")
        If Nz(Me.PalabraClave, "") <> "" Then
            m_FormExpedientes.PalabraClave = Nz(Me.PalabraClave, "")
            Form_FormExpedientesBusqueda.Filtrar
        End If
        
    End If
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIrABusquedaExpedientes_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

'Public Function ActualizarLineaLista( _
'                                        Optional p_IDNC As String, _
'                                        Optional ByRef p_Error As String _
'                                        ) As String
'
'    Dim m_NC As NCProyecto
'    Dim lst As ListBox
'    Dim i As Long
'    Dim m_SourceInicial As String
'    Dim m_SourceFinal As String
'    Dim m_LineaAlInicio As String
'    Dim m_LineaAlFinal As String
'    Dim j As Long
'    Dim m_ID As String
'    Dim m_IDNC As Variant
'    Dim m_IDLista As String
'
'    On Error GoTo errores
'    Set lst = Me.ListaFiltrados
'    If lst.ListCount = 1 Then
'        Exit Function
'    End If
'    m_SourceInicial = lst.RowSource
'    If p_IDNC <> "" Then
'        m_ID = p_IDNC
'    Else
'        m_ID = Nz(lst.Column(0), "")
'    End If
'    If m_ID = "" Then
'        Exit Function
'    End If
'    If Not m_ColFiltrado.Exists(CStr(m_ID)) Then
'        Exit Function
'    End If
'    For i = 1 To lst.ListCount - 1
'        m_IDLista = lst.Column(0, i)
'        If m_ID = m_IDLista Then
'            Set m_NC = constructor.getNCProyecto(p_IDNC:=m_IDLista, p_Error:=p_Error)
'            If p_Error <> "" Then
'                Err.Raise 1000
'            End If
'        End If
'    Next
'    If m_NC Is Nothing Then
'        Exit Function
'    End If
'    With m_NC
'        m_LineaAlFinal = .IDNoConformidad & ";" & .CodigoNoConformidad & ";" & _
'                        Replace(.Descripcion, ";", ":") & _
'                        ";" & Replace(.ExpedienteCalculadoTexto, ";", ":") & ";" & .EstadoCalculadoTexto & _
'                        ";" & .FechaApertura & ";" & .FECHACIERRE
'    End With
'
'    For i = 1 To lst.ListCount - 1
'        If lst.Selected(i) = True Then
'            For j = 0 To 6
'                If m_LineaAlInicio = "" Then
'                    m_LineaAlInicio = lst.Column(j, i)
'                Else
'                    m_LineaAlInicio = m_LineaAlInicio & ";" & lst.Column(j, i)
'                End If
'            Next
'            Exit For
'        End If
'    Next
'    m_SourceFinal = Replace(m_SourceInicial, m_LineaAlInicio, m_LineaAlFinal)
'    lst.RowSource = m_SourceFinal
'    lst.Requery
'    Exit Function
'errores:
'    If Err.Number <> 1000 Then
'        p_Error = "El método ActualizarLineaLista ha devuelto el error: " & vbNewLine & Err.Description
'    End If
'End Function
Public Function ActualizarLineaLista( _
                                        Optional ByRef p_Error As String _
                                        ) As String
   
   
    Dim lst As ListBox
    Dim i As Long
    Dim m_SourceInicial As String
    Dim m_SourceFinal As String
    Dim m_LineaAlInicio As String
    Dim m_LineaAlFinal As String
    Dim j As Long
   
    Dim m_IDLista As String
    
    On Error GoTo errores
    Set lst = Me.ListaFiltrados
    If lst.ListCount = 1 Then
        Exit Function
    End If
    m_SourceInicial = lst.RowSource
    If m_ObjNCProyectoActiva Is Nothing Then
        Exit Function
    End If
    
    For i = 1 To lst.ListCount - 1
        m_IDLista = lst.Column(0, i)
        If m_ObjNCProyectoActiva.IDNoConformidad = m_IDLista Then
            
            lst.Selected(i) = True
            With m_ObjNCProyectoActiva
                m_LineaAlFinal = .IDNoConformidad & ";" & .CodigoNoConformidad & ";" & _
                           Replace(.Descripcion, ";", ":") & _
                           ";" & Replace(.ExpedienteCalculadoTexto, ";", ":") & ";" & .EstadoCalculadoTexto & _
                           ";" & .FechaApertura & ";" & .FECHACIERRECalculada
            End With
            For j = 0 To 6
                If m_LineaAlInicio = "" Then
                    m_LineaAlInicio = lst.Column(j, i)
                Else
                    m_LineaAlInicio = m_LineaAlInicio & ";" & lst.Column(j, i)
                End If
            Next
            m_SourceFinal = Replace(m_SourceInicial, m_LineaAlInicio, m_LineaAlFinal)
            lst.RowSource = m_SourceFinal
            lst.Requery
        End If
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarLineaLista ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizarLineaListaConDatos( _
                                            p_Estado As String, _
                                            p_FechaApertura As String, _
                                            p_FechaCierre As String, _
                                            Optional ByRef p_Error As String _
                                             ) As String
        
   
    Dim lst As ListBox
    Dim i As Long
    Dim m_SourceInicial As String
    Dim m_SourceFinal As String
    Dim m_LineaAlInicio As String
    Dim m_LineaAlFinal As String
    Dim j As Long
    Dim dato As Variant
    
    
    On Error GoTo errores
    Set lst = Me.ListaFiltrados
    If lst.ListCount = 1 Then
        Exit Function
    End If
    m_SourceInicial = lst.RowSource
    If Nz(lst.Column(0), "") = "" Then
        Exit Function
    End If
    For j = 0 To 6
        If m_LineaAlInicio = "" Then
            m_LineaAlInicio = lst.Column(j)
        Else
            m_LineaAlInicio = m_LineaAlInicio & ";" & lst.Column(j)
        End If
    Next
    dato = Split(m_LineaAlInicio, ";")
    
    For j = 0 To 3
        If m_LineaAlFinal = "" Then
            m_LineaAlFinal = lst.Column(j)
        Else
            m_LineaAlFinal = m_LineaAlFinal & ";" & lst.Column(j)
        End If
    Next
    m_LineaAlFinal = m_LineaAlFinal & ";" & p_Estado
    m_LineaAlFinal = m_LineaAlFinal & ";" & p_FechaApertura
    m_LineaAlFinal = m_LineaAlFinal & ";" & p_FechaCierre
    m_SourceFinal = Replace(m_SourceInicial, m_LineaAlInicio, m_LineaAlFinal)
    lst.RowSource = m_SourceFinal
    lst.Requery
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarLineaListaConDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Function ActualizarDatosFiltrados( _
                                            Optional ByRef p_Error As String _
                                            ) As String
   
    Dim m_ID As Variant
    Dim m_NC As NCProyecto
    Dim lst As ListBox
    Dim i As Long
    On Error GoTo errores
    Set lst = Me.ListaFiltrados
    If m_ColFiltrado Is Nothing Then
        Exit Function
    End If
    Set lbl = Me.lblEstado
    
    
    For Each m_ID In m_ColFiltrado
        Set m_NC = m_ColFiltrado(m_ID)
        With m_NC
            Avance .CodigoNoConformidad & " ...."
            .FPREVCIERREGrabar
            .FECHACIERREGrabar
            .EstadoGrabar
            
        End With
       
        Set m_NC = Nothing
    Next
    AvanceCerrar
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosFiltrados ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
