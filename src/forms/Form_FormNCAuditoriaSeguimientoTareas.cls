Option Compare Database
Option Explicit



Public m_ARAuditoriaSeleccionada As ARAuditoria


Private m_Error As String

Private Sub ComandoLimpiarAuditoria_Click()
    On Error Resume Next
    Me.Auditoria = Null
    Filtrar
End Sub

Private Sub ComandoLimpiarEstado_Click()
    On Error Resume Next
    Me.Estado = Null
    Filtrar
End Sub



Private Sub ComandoLimpiarResposable_Click()
    On Error Resume Next
    Me.Responsable = Null
    Filtrar
End Sub



Private Sub ComandoVerDetalle_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_ARAuditoriaSeleccionada Is Nothing Then
        Set m_ARAuditoriaSeleccionada = constructor.getARAuditoria(p_IDAR:=Me.ListaFiltrados.Column(0), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARAuditoriaSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjNCAuditoriaActiva = m_ARAuditoriaSeleccionada.AC.nc
    
    If FormularioAbierto("FormNCAuditoria") Then
        DoCmd.Close acForm, "FormNCAuditoria", acSaveNo
    End If
    DoCmd.OpenForm "FormNCAuditoria"
    
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
    
    
    
    
    Me.ListaFiltrados.RowSource = "IDAccionRealizada;T.Realizada;Responsable;Estado;F.prev.cierre;NºAR"
    
    EstablecerCombos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ObjEntorno.ColUsuariosCalidad.Exists(m_ObjUsuarioConectado.UsuarioRed) Then
        Me.Responsable = m_ObjUsuarioConectado.Nombre
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
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
   
    
    On Error GoTo errores
    
    
    EstablecerComboResponsablesImplantacion Me.Responsable, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    EstablecerComboEstado Me.Estado, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerComboAuditoriasNombres Me.Auditoria, p_Error
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
    cmb.AddItem m_ObjEntorno.ColEstadosARTitulo(CStr(EnumEstadoAR.IRREGULAR)) & ";" & EnumEstadoAR.IRREGULAR
    
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
    Dim m_ARAuditoria As SegTareasAuditoria
    Dim m_Col As Scripting.Dictionary
    Dim m_Estado As String
    
    On Error GoTo errores
    
    p_Error = ""
    
    
    Set lst = Me.ListaFiltrados
    Me.lblListaDeResultados.Caption = "Registros filtrados"
    lst.RowSource = "IDAccionRealizada;NºTRA;Tarea;Auditoría;Nº;Responsable;Estado;F.prev.cierre;Tipo NC"
   
    
    Set m_Col = constructor.getARsDeAuditoriaBusqueda(p_Auditoria:=Nz(Me.Auditoria, ""), p_Responsable:=Nz(Me.Responsable, ""), _
                            p_Estado:=Nz(Me.Estado.Column(0), ""), p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_ARAuditoria = m_Col(m_ID)
        With m_ARAuditoria
            If Nz(Me.Estado.Column(0), "") <> "" Then
                m_Estado = Me.Estado.Column(0)
                If m_Estado = "ACTIVA" Then
                    m_Estado = .Estado
                End If
            Else
                m_Estado = m_ARAuditoria.Estado
            End If
            
            
            lst.AddItem .IDAccionRealizada & ";" & Format(.NAccion, "00") & ";" & Replace(.Tarea, ";", ":") & ";" & m_ARAuditoria.Auditoria & _
                ";" & Format(m_ARAuditoria.Numero, "00") & ";" & .Responsable & ";" & _
                        m_Estado & ";" & .FechaFinPrevista & ";" & .TipoNC
            Set m_ARAuditoria = Nothing
        End With
    Next
    Me.lblListaDeResultados.Caption = "Registros filtrados (" & lst.ListCount - 1 & ")"
    lst.Selected(1) = True
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
        Set m_ARAuditoriaSeleccionada = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_ARAuditoriaSeleccionada Is Nothing Then
        Set m_ARAuditoriaSeleccionada = constructor.getARAuditoria(p_IDAR:=Me.ListaFiltrados.Column(0), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If Me.ListaFiltrados.Column(0) <> m_ARAuditoriaSeleccionada.IDAccionRealizada Then
            Set m_ARAuditoriaSeleccionada = constructor.getARAuditoria(p_IDAR:=Me.ListaFiltrados.Column(0), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_ARAuditoriaSeleccionada Is Nothing Then
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

Private Sub Auditoria_AfterUpdate()
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
        m_Error = "Al Auditoria_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


