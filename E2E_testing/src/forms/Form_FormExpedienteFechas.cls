Option Compare Database
Option Explicit
Private m_Error As String
Public m_SnapshotAlInicio As String
Dim m_IDExpediente As String

Private Sub ComandoFECHAADJUDICACION_Click()
    Me.FECHAADJUDICACION = Date
End Sub

Private Sub ComandoFECHACERTIFICACION_Click()
    Me.FECHACERTIFICACION = Date
    If IsNumeric(Me.GARANTIAMESES) Then
        If IsNumeric(Me.FECHACERTIFICACION) Then
            Me.FechaFinGarantia = DateAdd("m", CDbl(Me.GARANTIAMESES), CDate(Me.FECHACERTIFICACION))
        End If
        
    End If
End Sub

Private Sub ComandoFECHADESESTIMADA_Click()
    Me.FECHADESESTIMADA = Date
End Sub

Private Sub ComandoFECHAFIRMACONTRATO_Click()
    Me.FECHAFIRMACONTRATO = Date
End Sub

Private Sub ComandoFECHAINICIOLICITACION_Click()
    Me.FECHAINICIOLICITACION = Date
End Sub
Private Sub ComandoFECHAPREOFERTA_Click()
    Me.FECHAPREOFERTA = Date
End Sub

Private Sub ComandoFECHAOFERTA_Click()
    Me.FECHAOFERTA = Date
End Sub

Private Sub ComandoFECHAPERDIDA_Click()
    Me.FECHAPERDIDA = Date
End Sub

Private Sub FECHACERTIFICACION_BeforeUpdate(Cancel As Integer)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not IsNumeric(Me.GARANTIAMESES) Then
        Me.FechaFinGarantia = Null
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If Not IsDate(Me.FechaFinContrato) Then
        Me.FechaFinGarantia = Null
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If IsDate(Me.FECHACERTIFICACION) Then
        Me.FechaFinGarantia = DateAdd("m", CDbl(Me.GARANTIAMESES), CDate(Me.FECHACERTIFICACION))
    Else
        Me.FechaFinGarantia = DateAdd("m", CDbl(Me.GARANTIAMESES), CDate(Me.FechaFinContrato))
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Meses_Exit se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub FechaFinContrato_BeforeUpdate(Cancel As Integer)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not IsNumeric(Me.GARANTIAMESES) Then
        Me.FechaFinGarantia = Null
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If Not IsDate(Me.FechaFinContrato) Then
        Me.FechaFinGarantia = Null
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If IsDate(Me.FECHACERTIFICACION) Then
        Me.FechaFinGarantia = DateAdd("m", CDbl(Me.GARANTIAMESES), CDate(Me.FECHACERTIFICACION))
    Else
        Me.FechaFinGarantia = DateAdd("m", CDbl(Me.GARANTIAMESES), CDate(Me.FechaFinContrato))
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Meses_Exit se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Form_Load()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.AllowEdits = False
    Me.Parent.Controls("ComandoRegistrar").Visible = True
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            Me.AllowEdits = True
        End If
    End If
    Me.Parent.Controls("ComandoRegistrar").Enabled = Me.AllowEdits
    Me.ComandoFECHAINICIOLICITACION.Enabled = Me.AllowEdits
    Me.ComandoFECHAPREOFERTA.Enabled = Me.AllowEdits
    Me.ComandoFECHAOFERTA.Enabled = Me.AllowEdits
    Me.ComandoFECHADESESTIMADA.Enabled = Me.AllowEdits
    Me.ComandoFECHAPERDIDA.Enabled = False
    Me.ComandoFECHAADJUDICACION.Enabled = Me.AllowEdits
    Me.ComandoFECHAFIRMACONTRATO.Enabled = Me.AllowEdits
    Me.ComandoFECHACERTIFICACION.Enabled = Me.AllowEdits
    m_IDExpediente = m_ObjExpedienteDTOActivo.Expediente.IDExpediente
    SetFormFechasFromExpediente p_IDExpediente:=m_IDExpediente, frm:=Me, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    If Me.AllowEdits = True Then
    ' Create snapshot for change detection (only in EDIT mode)
        m_SnapshotAlInicio = getSnapshot(frm:=Me, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 100
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Form_Unload(Cancel As Integer)
    Dim m_Snapshot As String
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Me.AllowEdits = False Then
        Exit Sub
    End If
    m_Snapshot = getSnapshot(frm:=Me, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Snapshot = m_SnapshotAlInicio Then
        Exit Sub
    End If
    GuardarPestana frm:=Me, p_IDExpediente:=m_IDExpediente, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Unload se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Sub GARANTIAMESES_BeforeUpdate(Cancel As Integer)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not IsNumeric(Me.GARANTIAMESES) Then
        Me.FechaFinGarantia = Null
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If Not IsDate(Me.FechaFinContrato) Then
        Me.FechaFinGarantia = Null
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If IsDate(Me.FECHACERTIFICACION) Then
        Me.FechaFinGarantia = DateAdd("m", CDbl(Me.GARANTIAMESES), CDate(Me.FECHACERTIFICACION))
    Else
        Me.FechaFinGarantia = DateAdd("m", CDbl(Me.GARANTIAMESES), CDate(Me.FechaFinContrato))
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Meses_Exit se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub