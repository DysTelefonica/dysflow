Option Compare Database
Option Explicit
Private m_Error As String

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ComandoActualizar_Click()
    On Error GoTo errores

    m_Error = ""
    DoCmd.Hourglass True
    CargarListasBatch
    DoCmd.Hourglass False
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizar_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoAgregarBatch_Click()
    On Error GoTo errores

    m_Error = ""
    If Nz(Me.ListaExpedientesDisponibles.Column(0), "") = "" Then
        MsgBox "Seleccione un expediente disponible para añadir al batch.", vbInformation, "Gestión batch E2E"
        Exit Sub
    End If

    Me.ListaExpedientesBatch.AddItem Me.ListaExpedientesDisponibles.Column(0) & ";" & _
                                   Me.ListaExpedientesDisponibles.Column(1) & ";" & _
                                   Me.ListaExpedientesDisponibles.Column(2) & ";" & _
                                   Me.ListaExpedientesDisponibles.Column(3)
    ActualizarContadores
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAgregarBatch_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoQuitarBatch_Click()
    Dim i As Long

    On Error GoTo errores

    m_Error = ""
    For i = Me.ListaExpedientesBatch.ListCount - 1 To 1 Step -1
        If Me.ListaExpedientesBatch.Selected(i) Then
            Me.ListaExpedientesBatch.RemoveItem i
            ActualizarContadores
            Exit Sub
        End If
    Next i

    MsgBox "Seleccione un expediente del batch para quitarlo.", vbInformation, "Gestión batch E2E"
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoQuitarBatch_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Form_Open(Cancel As Integer)
    On Error GoTo errores

    m_Error = ""
    Ajustar Me
    Me.AllowEdits = False
    Me.Caption = Me.lblTitulo.Caption
    CargarListasBatch
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ListaExpedientesDisponibles_DblClick(Cancel As Integer)
    ComandoAgregarBatch_Click
End Sub

Private Sub ListaExpedientesDisponibles_Click()
    Me.ComandoAgregarBatch.Enabled = (Nz(Me.ListaExpedientesDisponibles.Column(0), "") <> "")
End Sub

Private Sub ListaExpedientesBatch_Click()
    Me.ComandoQuitarBatch.Enabled = (Nz(Me.ListaExpedientesBatch.Column(0), "") <> "")
End Sub

Private Sub CargarListasBatch()
    Me.ListaExpedientesDisponibles.RowSource = "IDExpediente;Estado E2E;Nº Exp;Título"
    Me.ListaExpedientesBatch.RowSource = "IDExpediente;Estado E2E;Nº Exp;Título"
    Me.txtEstadoBatch = "Seleccione expedientes disponibles y añádalos al batch E2E. La integración de exportación se conectará en una iteración posterior."
    Me.ComandoAgregarBatch.Enabled = False
    Me.ComandoQuitarBatch.Enabled = False
    ActualizarContadores
End Sub

Private Sub ActualizarContadores()
    Me.lblListaDeResultados.Caption = "Expedientes disponibles para batch (" & MaxListDataRows(Me.ListaExpedientesDisponibles) & ")"
    Me.lblExpedientesBatch.Caption = "Expedientes seleccionados para batch (" & MaxListDataRows(Me.ListaExpedientesBatch) & ")"
    Me.lblEstado.Caption = "Gestión batch E2E"
End Sub

Private Function MaxListDataRows(ByVal p_List As ListBox) As Long
    MaxListDataRows = p_List.ListCount - 1
    If MaxListDataRows < 0 Then MaxListDataRows = 0
End Function
