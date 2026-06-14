Option Compare Database
Option Explicit
Public m_ARProyectoSeleccionado As ARProyecto

Private WithEvents m_FormExpedientes As Form_FormExpedientesBusqueda
Private m_Error As String




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
        Me.Titulo = Null
        Me.PalabraClave = Null
        If Nz(Me.IDExpediente, "") = "" Then
            Me.ComandoActualizararExpedientes.Enabled = False
        Else
            Me.ComandoActualizararExpedientes.Enabled = True
        End If
        
        ComandoIrABusquedaExpedientes_Click
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    
    If m_Col.count = 1 Then
        For Each m_ID In m_Col
            Set m_Expediente = m_Col(m_ID)
            With m_Expediente
                Me.IDExpediente = .IDExpediente
                
                If .Nemotecnico <> "" Then
                    Me.Titulo = .Nemotecnico
                ElseIf .CodExp <> "" Then
                    Me.Titulo = .CodExp
                Else
                    Me.Titulo = .IDExpediente
                End If
            End With
            
        Next
        Me.PalabraClave = Null
        Filtrar m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
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

Private Sub ComandoExportarAExcel_Click()
    Dim m_URL As String
    Dim m_Tipo As String
    On Error GoTo errores
    
   
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Nz(Me.Estado, "") = "ACTIVAS" Then
        m_Tipo = "activas"
    ElseIf Nz(Me.Estado, "") = "PENDIENTE DE REPLANIFICAR" Then
        m_Tipo = "pendientes de replanificar"
    ElseIf Nz(Me.Estado, "") = "ESTADO IRREGULAR" Then
        m_Tipo = "irregulares"
    
    End If
    Set lbl = Me.parent.Controls("lblEstado")
    Avance "Exportando a excel"
    m_URL = TareasAExcel(p_col:=m_ColFiltradoTareasNCProyectos, p_Tipo:=m_Tipo, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not fso.FileExists(m_URL) Then
        m_Error = "No se ha podido obtener el documento excel"
        Err.Raise 1000
    End If
    Ejecutar Me.hWnd, "open", m_URL, "", "", 1
    AvanceCerrar
    lbl.Visible = False
    Set lbl = Nothing
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

Private Sub ComandoIrABusquedaExpedientes_Click()
    Dim m_FormExpedientes As Form
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

Private Sub ComandoLimpiarEstado_Click()
    On Error Resume Next
    Me.Estado = Null
    Filtrar
End Sub

Private Sub ComandoLimpiarIDExpediente_Click()
    On Error Resume Next
    Me.IDExpediente = Null
    Me.PalabraClave = Null
    Me.Titulo = Null
    Filtrar
End Sub

Private Sub ComandoLimpiarResposable_Click()
    On Error Resume Next
    Me.Responsable = Null
    Filtrar
End Sub

Private Sub ComandoLimpiarResposableCalidad_Click()
    On Error Resume Next
    Me.RESPONSABLECALIDAD = Null
    Filtrar
End Sub

Private Sub ComandoVerDetalle_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_ARProyectoSeleccionado Is Nothing Then
        Set m_ARProyectoSeleccionado = constructor.getARProyecto(p_IDAR:=Me.ListaFiltrados.Column(0), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARProyectoSeleccionado Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjNCProyectoActiva = m_ARProyectoSeleccionado.AC.nc
    
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

Private Sub ESTADO_AfterUpdate()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Filtrar m_Error
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
        m_Error = "Al Estado_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    
    
    
    
    Me.ListaFiltrados.RowSource = "IDAccionRealizada;NºTRA;Tarea;Responsable;Estado;F.prev.cierre;Tipo NC"
    
    EstablecerCombos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If EsTecnico = EnumSino.Sí Then
        Me.Responsable = m_ObjUsuarioConectado.Nombre
    Else
        If m_ObjEntorno.ColUsuariosCalidad.Exists(m_ObjUsuarioConectado.UsuarioRed) Then
            Me.RESPONSABLECALIDAD = m_ObjUsuarioConectado.Nombre
        End If
    End If
    
    Me.Estado = m_ObjEntorno.ColEstadosARTitulo(CStr(EnumEstadoAR.ACTIVA))
    Filtrar
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

Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
   
    
    On Error GoTo errores
    
    
    EstablecerComboResponsablesCalidad cmb:=Me.RESPONSABLECALIDAD, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    EstablecerComboEstado Me.Estado, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerComboJP Me.Responsable, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerCombos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function EstablecerComboEstado( _
                                            cmb As ComboBox, _
                                            Optional ByRef p_Error As String _
                                            ) As String
   
    On Error GoTo errores
    
    cmb.RowSource = ""
    cmb.AddItem m_ObjEntorno.ColEstadosARTitulo(CStr(EnumEstadoAR.ACTIVA)) & ";" & EnumEstadoAR.ACTIVA
    cmb.AddItem m_ObjEntorno.ColEstadosARTitulo(CStr(EnumEstadoAR.PTEREPLANIFICAR)) & ";" & EnumEstadoAR.PTEREPLANIFICAR
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboEstado ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function Filtrar( _
                        Optional ByRef p_Error As String _
                        ) As String

    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_ARProyecto As SegTareasProyecto
    
    Dim m_Estado As String
    On Error GoTo errores
    
    p_Error = ""
    
    Me.ComandoVerDetalle.Enabled = False
    Me.ComandoExportarAExcel.Enabled = False
    Set lst = Me.ListaFiltrados
    Me.lblListaDeResultados.caption = "Registros filtrados (0)"
    
    lst.RowSource = "IDAccionRealizada;NºTRA;Tarea;Responsable;Estado;F.prev.cierre;Tipo NC"
   
    
    Set m_ColFiltradoTareasNCProyectos = constructor.getARsDeProyectoBusqueda(p_ResponsableCalidad:=Nz(Me.RESPONSABLECALIDAD.Column(0), ""), _
                            p_Responsable:=Nz(Me.Responsable.Column(0), ""), p_IDExpediente:=Nz(Me.IDExpediente, ""), _
                            p_Estado:=Nz(Me.Estado.Column(0), ""), p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ColFiltradoTareasNCProyectos Is Nothing Then
        Exit Function
    End If
    Me.ComandoExportarAExcel.Enabled = True
    For Each m_ID In m_ColFiltradoTareasNCProyectos
        Set m_ARProyecto = m_ColFiltradoTareasNCProyectos(m_ID)
        With m_ARProyecto
            m_Estado = Nz(Me.Estado.Column(0), "")
            If m_Estado = "ACTIVA" Or m_Estado = "" Then
                m_Estado = .Estado
            End If
            lst.AddItem .IDAccionRealizada & ";" & Format(.NAccion, "00") & ";" & Replace(.Tarea, ";", ":") & ";" & .Tecnico & ";" & _
                        m_Estado & ";" & .FechaFinPrevista & ";" & .TipoNC
            Set m_ARProyecto = Nothing
        End With
    Next
    Me.lblListaDeResultados.caption = "Registros filtrados (" & lst.ListCount - 1 & ")"
    lst.selected(1) = True
    ListaFiltrados_Click
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Filtrar ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub ListaFiltrados_Click()
     
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Me.ComandoVerDetalle.Enabled = False
   
    
    If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
        Set m_ARProyectoSeleccionado = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_ARProyectoSeleccionado Is Nothing Then
        Set m_ARProyectoSeleccionado = constructor.getARProyecto(p_IDAR:=Me.ListaFiltrados.Column(0), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If Me.ListaFiltrados.Column(0) <> m_ARProyectoSeleccionado.IDAccionRealizada Then
            Set m_ARProyectoSeleccionado = constructor.getARProyecto(p_IDAR:=Me.ListaFiltrados.Column(0), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_ARProyectoSeleccionado Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass True
        VBA.DoEvents
        Exit Sub
    End If
    Me.ComandoVerDetalle.Enabled = True
    
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
    If Me.ComandoVerDetalle.Enabled = True Then
        ComandoVerDetalle_Click
    End If
End Sub



Private Sub m_FormExpedientes_Seleccionado(m_Exp As Expediente)
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    With m_Exp
        Me.IDExpediente = .IDExpediente
        If .Nemotecnico <> "" Then
            Me.Titulo = .Nemotecnico
        ElseIf .CodExp <> "" Then
            Me.Titulo = .CodExp
        Else
            Me.Titulo = .IDExpediente
        End If
        Me.PalabraClave = Null
        Filtrar
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

Private Sub Responsable_AfterUpdate()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Filtrar m_Error
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
        m_Error = "Al Responsable_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    
    Filtrar m_Error
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
        m_Error = "Al RESPONSABLECALIDAD_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
