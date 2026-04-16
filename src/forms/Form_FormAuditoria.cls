Option Compare Database
Option Explicit

Private m_AuditoriaOp As New AuditoriaOperaciones
Private m_Error As String
Private m_AuditoriaAlInicio As Auditoria
Public Event Alta()
Public Event Editada()



Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub



Private Sub ComandoAdjuntarDocumentacion_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ObjAuditoriaActiva Is Nothing Then
        Set m_ObjAuditoriaActiva = New Auditoria
    End If
    
    If FormularioAbierto("FormAuditoriaDocumentos") Then
        DoCmd.Close acForm, "FormAuditoriaDocumentos", acSaveNo
    End If
    DoCmd.OpenForm "FormAuditoriaDocumentos"
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAdjuntarDocumentacion_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoRegistrar_Click()
    
      
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ObjAuditoriaActiva Is Nothing Then
        Set m_ObjAuditoriaActiva = New Auditoria
    End If
    With m_ObjAuditoriaActiva
        .Tipo = Nz(Me.Tipo, "")
        .FechaInicio = Nz(Me.FechaInicio, "")
        .FechaFin = Nz(Me.FechaFin, "")
    End With
    Set m_AuditoriaOp.Auditoria = m_ObjAuditoriaActiva
    
    m_AuditoriaOp.Registrar m_AuditoriaAlInicio, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_AuditoriaAlInicio Is Nothing And Not m_ObjColDocumentosAuditoriaParaAlta Is Nothing Then
        m_AuditoriaOp.AnexoMultiple m_ObjColDocumentosAuditoriaParaAlta, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_ObjColDocumentosAuditoriaParaAlta = Nothing
        If FormularioAbierto("FormAuditoriaDocumentos") Then
            DoCmd.Close acForm, "FormAuditoriaDocumentos", acSaveNo
        End If
    End If
    If m_AuditoriaAlInicio Is Nothing Then
        RaiseEvent Alta
    Else
        RaiseEvent Editada
    End If
    
    
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    DoCmd.Close acForm, Me.Name, acSaveNo
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoRegistrar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    If m_ObjAuditoriaActiva Is Nothing Then
        Set m_ObjAuditoriaActiva = New Auditoria
        Exit Function
    End If
    
    Set m_AuditoriaAlInicio = constructor.getAuditoria(p_ID:=m_ObjAuditoriaActiva.IDAuditoria, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_AuditoriaAlInicio Is Nothing Then
        p_Error = "La auditoría no parece estar registrada"
        Err.Raise 1000
    End If
    With m_AuditoriaAlInicio
        If .Tipo <> "" Then
            Me.Tipo = .Tipo
        End If
        If IsDate(.FechaInicio) Then
            Me.FechaInicio = Format(.FechaInicio, "dd/mm/yyyy")
        End If
        If IsDate(.FechaFin) Then
            Me.FechaFin = Format(.FechaFin, "dd/mm/yyyy")
        End If
    End With
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function


Private Sub Form_Open(Cancel As Integer)
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Ajustar Me
    
    Me.Caption = Me.lblTitulo.Caption
    
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    AvanceCerrar
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

