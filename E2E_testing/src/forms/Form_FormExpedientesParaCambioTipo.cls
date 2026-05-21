Option Compare Database
Option Explicit
Private m_ExpSeleccionado As Expediente

Public Event Seleccionado(m_expediente As Expediente)

Private m_Error As String



Private Sub cmdSalir_Click()
    On Error Resume Next

    DoCmd.Close acForm, Me.Name, acSaveNo

End Sub

Public Function Filtrar( _
                        Optional ByRef p_Error As String _
                        ) As String

    Dim lst As ListBox
    Dim m_Exp As Expediente
    Dim m_ID As Variant
    Dim m_colExpedientes As Scripting.Dictionary

    On Error GoTo errores

    p_Error = ""
    Me.AllowEdits = False

    Set lst = Me.ListaFiltrados
    
   
    Me.ComandoSeleccionar.Enabled = False
    
    
    Set m_ExpSeleccionado = Nothing
    lst.RowSource = "IDExpediente;Tipo;NºExp;Título;FInicio;FFin;FFinGarantía"
   
    If Nz(Me.PalabraClave, "") = "" Then
        Err.Raise 1000
    End If
    
    Set m_colExpedientes = getColBusquedaParaCambio(Nz(Me.PalabraClave, ""), p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_colExpedientes Is Nothing Then
        Me.AllowEdits = True
        Exit Function
    End If
    For Each m_ID In m_colExpedientes
        Set m_Exp = m_colExpedientes(m_ID)
        With m_Exp
            lst.AddItem .IDExpediente & ";" & .TipoParaLista & ";" & .CodExp & _
                ";" & .Titulo & ";" & .FechaInicioContrato & ";" & .FechaFinContrato & ";" & .FechaFinGarantia
        End With
        Set m_Exp = Nothing
    Next

    
    
    Me.ListaFiltrados.Selected(2) = True
    ListaFiltrados_Click
    
    
    Me.AllowEdits = True
    Exit Function
errores:
    Me.AllowEdits = True
    If Err.Number <> 1000 Then
        p_Error = "El método Filtrar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If

End Function


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


Private Sub ComandoIniciarPalabraClave_Click()
    Me.PalabraClave = Null
    Filtrar
End Sub

Private Sub ComandoPalabraClave_Click()
    On Error GoTo errores
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

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
        m_Error = "Al ComandoPalabraClave_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If

    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoSeleccionar_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If m_ExpSeleccionado Is Nothing Then
        Set m_ExpSeleccionado = constructor.getExpediente(p_IDExpediente:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ExpSeleccionado Is Nothing Then
            m_Error = "No ha seleccionado ningún elemento de la lista"
            Err.Raise 1000
        End If
    Else
        If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
            Set m_ExpSeleccionado = Nothing
            m_Error = "No ha seleccionado ningún elemento de la lista"
            Err.Raise 1000
        End If
        If m_ExpSeleccionado.IDExpediente <> Me.ListaFiltrados.Column(0) Then
            Set m_ExpSeleccionado = constructor.getExpediente(p_IDExpediente:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_ExpSeleccionado Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_ExpSeleccionado.TipoCalculado <> EnumTipoExpediente.AM And m_ExpSeleccionado.TipoCalculado <> EnumTipoExpediente.Lote Then
        m_Error = "Se ha de seleccionar un AM o un Lote"
        Err.Raise 1000
    End If
    RaiseEvent Seleccionado(m_ExpSeleccionado)
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    DoCmd.Close acForm, Me.Name, acSaveNo
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoSeleccionar_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    Me.ListaFiltrados.RowSource = "IDExpediente;Tipo;NºExp;Título;FInicio;FFin;FFinGarantía"
    Me.PalabraClave.SetFocus
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
    If Me.ComandoSeleccionar.Enabled Then
        ComandoSeleccionar_Click
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
        Set m_ExpSeleccionado = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.ComandoSeleccionar.Enabled = False
        
        Me.AllowEdits = True
        Exit Sub
    End If
    If m_ExpSeleccionado Is Nothing Then

        Set m_ExpSeleccionado = constructor.getExpediente( _
                                p_IDExpediente:=Me.ListaFiltrados.Column(0), _
                                p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_ExpSeleccionado.IDExpediente <> Me.ListaFiltrados.Column(0) Then
            Set m_ExpSeleccionado = constructor.getExpediente( _
                                p_IDExpediente:=Me.ListaFiltrados.Column(0), _
                                p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_ExpSeleccionado Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Me.ComandoSeleccionar.Enabled = False
        Me.AllowEdits = True
        Exit Sub
    End If
    Me.ComandoSeleccionar.Enabled = True
    
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

