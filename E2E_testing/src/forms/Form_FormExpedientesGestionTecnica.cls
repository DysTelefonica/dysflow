Option Compare Database
Option Explicit
Private m_ExpSeleccionadoc As ExpedienteCompleto
Private m_ExpBusquedaUltimo As ExpedienteBusquedaTecnica
Private m_colExpedientes As Scripting.Dictionary


Private m_Error As String

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String

    On Error GoTo errores


    RellenarCombos p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    setExpBusquedaTecnica Me, m_ObjExpBusquedaTecnicaActiva, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If

End Function

Public Function RellenarCombos(Optional ByRef p_Error As String) As String

    On Error GoTo errores
    RellenarComboEstado Me.ESTADO, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarComboSuministradores Me.JURIDICA, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarComboCodExp Me.CodExp, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarComboJefesProyecto Me.jp, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarCombos ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If

End Function

Private Sub cmdSalir_Click()
    On Error Resume Next

    DoCmd.Close acForm, Me.Name, acSaveNo

End Sub

Public Function Filtrar( _
                        Optional ByRef p_Error As String _
                        ) As String

    Dim lst As ListBox
    Dim m_HaHabidoCambios As EnumSiNo
    Dim m_ExpBusqueda As ExpedienteBusquedaTecnica
    Dim m_ExpC As ExpedienteCompleto
    Dim m_Estado As String
    Dim m_Nemotecnico As String
    Dim dato As Variant
    Dim m_ID As Variant


    On Error GoTo errores

    p_Error = ""
    Me.AllowEdits = False

    Set lst = Me.ListaFiltrados
    
   
    Me.ComandoVerDetalle.Enabled = False
    Avance "Obteniendo los Parámetros de búsqueda"
    Set m_ExpBusqueda = getExpTecnicoBusqueda(p_Form:=Me, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 100
    End If
    m_HaHabidoCambios = HaHabidoCambiosBusquedaTecnica(m_ExpBusqueda, m_ExpBusquedaUltimo, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    If m_HaHabidoCambios = EnumSiNo.No Then

        Me.AllowEdits = True
        Exit Function
    End If
    Me.lblLista.Caption = "Lista de Expedientes Filtrados"
    Set m_ExpSeleccionadoc = Nothing
    lst.RowSource = "IDExpediente;Tipo;NºExp;Título;FInicio;FFin;FFinGarantía;Estado"
    Set m_colExpedientes = Nothing
    Set m_colExpedientes = getColBusquedaTecnica(p_ExpBusqueda:=m_ExpBusqueda, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_colExpedientes Is Nothing Then
        Me.AllowEdits = True
        Exit Function
    End If
    For Each m_ID In m_colExpedientes
        Set m_ExpC = m_colExpedientes(m_ID)
        With m_ExpC
            m_Estado = .ESTADOCalculadoTexto
            If m_Estado = "NoAplica" Then
                m_Estado = "--"
            End If
            lst.AddItem .IDExpediente & ";" & .TipoParaLista & ";" & .CodExp & _
                ";" & .Titulo & ";" & .FechaInicioContrato & ";" & .FechaFinContrato & ";" & .FechaFinGarantia & ";" & m_Estado
        End With
        Set m_ExpC = Nothing
    Next

    
    Me.lblLista.Caption = "Lista de Expedientes Filtrados (" & lst.ListCount - 1 & ")"
    Me.ListaFiltrados.Selected(2) = True
    ListaFiltrados_Click
    
    Set m_ExpBusquedaUltimo = m_ExpBusqueda
    Me.AllowEdits = True
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método Filtrar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If

End Function

Private Sub CodExp_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""

    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al CodExp_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Function IniciarCampo(Optional p_NombreCampo As String, Optional ByRef p_Error As String) As String

    On Error GoTo errores

    If p_NombreCampo = "" Then
        
        IniciarCampo = IniciarCampo(Me.PalabraClave.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.ESTADO.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        IniciarCampo = IniciarCampo(Me.JURIDICA.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
        IniciarCampo = IniciarCampo(Me.CodExp.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
        IniciarCampo = IniciarCampo(Me.jp.Name, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
    Else
        If p_NombreCampo = Me.PalabraClave.Name Then
            Me.PalabraClave = Null
        ElseIf p_NombreCampo = Me.ESTADO.Name Then
            Me.ESTADO = "Todos"
        ElseIf p_NombreCampo = Me.JURIDICA.Name Then
            Me.JURIDICA = "Todos"
        ElseIf p_NombreCampo = Me.CodExp.Name Then
            Me.CodExp = "Todos"
        ElseIf p_NombreCampo = Me.jp.Name Then
            Me.jp = "Todos"
        Else
            Exit Function
        End If
    End If

    Filtrar p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método IniciarCampo ha producido el error nº: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
End Function

Private Sub ComandoExportarExcel_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    If FormularioAbierto("FOrmEleccionTipoConsulta") Then
        DoCmd.Close acForm, "FOrmEleccionTipoConsulta"
    End If
    DoCmd.OpenForm "FOrmEleccionTipoConsulta", OpenArgs:=Me.ListaFiltrados.Name & "|" & Me.Name


    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoExportarExcel_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarCodExp_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.CodExp.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarCodExp_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoIniciarEstado_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.ESTADO.Name, m_Error
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
        m_Error = "Al ComandoIniciarEstado_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
End Sub





Private Sub ComandoIniciarJP_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.jp.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarJP_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoIniciarJuridica_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.JURIDICA.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarJuridica_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoIniciarPalabraClave_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    IniciarCampo Me.PalabraClave.Name, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIniciarPalabraClave_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoPalabraClave_Click()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""

    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoPalabraClave_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoVerDetalle_Click()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""
    
    
    Me.AllowEdits = False
    If m_ExpSeleccionadoc Is Nothing Then
        Set m_ExpSeleccionadoc = constructor.getExpedienteCompleto(p_IDExpediente:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ExpSeleccionadoc Is Nothing Then
            m_Error = "Ha de seleccionar un expediente del tipo adecuado de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjExpedienteActivo = m_ExpSeleccionadoc.Expediente
    Set m_ObjExpedienteDTOActivo = EstablecerDTODeExpediente(p_Expediente:=m_ObjExpedienteActivo, _
                                                            p_ParaCopia:=EnumSiNo.No, _
                                                            p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    If FormularioAbierto("FormExpediente") Then
        DoCmd.Close acForm, "FormExpediente", acSaveNo
    End If
    DoCmd.OpenForm "FormExpediente", OpenArgs:="Sololectura"
    
    DoCmd.Hourglass False
    Me.AllowEdits = True
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoVerDetalle_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Estado_AfterUpdate()

    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""

    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Estado_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Sub JP_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""


    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al JP_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Juridica_AfterUpdate()
    On Error GoTo errores
    DoCmd.Hourglass True
    m_Error = ""

    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Juridica_AfterUpdate se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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


Private Sub Form_Open(Cancel As Integer)

    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    On Error GoTo errores
    Ajustar Me
    Me.AllowEdits = False
    Me.Caption = m_TituloFormulario
    
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Me.AllowEdits = True
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ListaFiltrados_DblClick(Cancel As Integer)
    On Error Resume Next
    If Me.ComandoVerDetalle.Enabled Then
        ComandoVerDetalle_Click
    End If
End Sub

Private Sub ListaFiltrados_Click()
    
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    Me.AllowEdits = False
    
    If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
        Set m_ExpSeleccionadoc = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.ComandoVerDetalle.Enabled = False
        
        Me.AllowEdits = True
        Exit Sub
    End If
    If m_ExpSeleccionadoc Is Nothing Then

        Set m_ExpSeleccionadoc = constructor.getExpedienteCompleto( _
                                p_IDExpediente:=Me.ListaFiltrados.Column(0), _
                                p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_ExpSeleccionadoc.IDExpediente <> Me.ListaFiltrados.Column(0) Then
            Set m_ExpSeleccionadoc = constructor.getExpedienteCompleto( _
                                p_IDExpediente:=Me.ListaFiltrados.Column(0), _
                                p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_ExpSeleccionadoc Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.ComandoVerDetalle.Enabled = False
        Me.AllowEdits = True
        Exit Sub
    End If
    Me.ComandoVerDetalle.Enabled = True
    
    Me.AllowEdits = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaFiltrados_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub





Public Function Reestablecer(Optional ByRef p_Error As String) As String

    On Error GoTo errores
    
    Set m_ObjExpBusquedaTecnicaActiva = Nothing

    RellenarCombos p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    setExpBusquedaTecnica Me, m_ObjExpBusquedaTecnicaActiva, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Reestablecer ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function


Private Sub ComandoReiniciar_Click()

    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""

    Reestablecer p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ExpBusquedaUltimo = Nothing

    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoReiniciar_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub PalabraClave_KeyDown(KeyCode As Integer, Shift As Integer)

    ' Detectar si se ha pulsado la tecla Enter
    If KeyCode = vbKeyReturn Then
        ' Código que deseas ejecutar cuando se pulse Enter

        If ComandoPalabraClave.Enabled = True Then
            Me.ComandoPalabraClave.SetFocus
            ComandoPalabraClave_Click
        End If
        ' Si deseas evitar que Access realice la acción predeterminada de Enter,
        ' puedes utilizar la siguiente línea:
        'KeyCode = 0
    End If


End Sub

