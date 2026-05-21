Option Compare Database
Option Explicit
Private WithEvents m_form As Form_FormModificado
Private m_MOdificadoSeleccionado As ExpedienteModificado
Private m_Error As String

Private Sub ComandoEditar_Click()
    Dim m_ModExpOp As ExpedienteModificadoOperaciones
    
    Dim m_NModificado As String
    Dim i As Long
    
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If EsAdministrador <> EnumSiNo.Sí Then
        m_Error = "Operacion no autorizada"
        Err.Raise 1000
    End If
    
    If m_MOdificadoSeleccionado Is Nothing Then
        Set m_MOdificadoSeleccionado = constructor.getExpedienteModificado( _
                                    p_IDExpedienteModificado:=Nz(Me.ListaModificados.Column(0), ""), _
                                    p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_MOdificadoSeleccionado Is Nothing Then
            m_Error = "Selecccione un elemento de la lista"
            Err.Raise 1000
        End If
        
    End If
    Set m_ObjModificadoActivo = m_MOdificadoSeleccionado
    If FormularioAbierto("FormModificado") Then
        DoCmd.Close acForm, "FormModificado", acSaveNo
    End If
    DoCmd.OpenForm "FormModificado"
    If FormularioAbierto("FormModificado") Then
        Set m_form = Forms("FormModificado")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEditar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoRegistrar_Click()
    
    Dim m_EstadoRegistro As String
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Modificado As ExpedienteModificado
    Dim m_NModificado As String
    Dim m_FechaFirmaModificado As String
    Dim m_FechaInicioModificado As String
    Dim m_FechaFinModificado As String
    Dim m_DESCRIPCION As String
    
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    m_Error = ""
    
    Set m_Modificado = New ExpedienteModificado
    With m_Modificado
        .DESCRIPCION = Nz(Me.DESCRIPCION, "")
        .FechaFinModificado = Nz(Me.FechaFinModificado, "")
        .FechaFirmaModificado = Nz(Me.FechaFirmaModificado, "")
        .NModificado = Nz(Me.NModificado, "")
    End With
    
    
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        m_EstadoRegistro = .RegistrarModificado(p_Modificado:=m_Modificado, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_ObjExpedienteDTOActivo.Expediente.Modificados = Nothing
    End With
    
    If m_EstadoRegistro = "1" Then
        
        Set m_ObjExpedienteDTOActivo.ColModificados = m_ObjExpedienteDTOActivo.Expediente.Modificados
        RellenarListaModificados
    End If
    
    
    
    Me.ListaModificados.Selected(Me.ListaModificados.ListCount - 1) = True
    Me.DESCRIPCION = Null
    Me.FechaFirmaModificado = Null
    
    Me.FechaFinModificado = Null
    Me.NModificado = m_ObjExpedienteDTOActivo.Expediente.NModificadoCalculado
    
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoRegistrar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub



Private Sub ComandoEliminar_Click()
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_ExpModificado As ExpedienteModificado
    
    Dim i As Long
    
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsAdministrador <> EnumSiNo.Sí Then
        m_Error = "Operacion no autorizada"
        Err.Raise 1000
    End If
    
    If m_MOdificadoSeleccionado Is Nothing Then
        Set m_MOdificadoSeleccionado = constructor.getExpedienteModificado( _
                                    p_IDExpedienteModificado:=Nz(Me.ListaModificados.Column(0), ""), _
                                    p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_MOdificadoSeleccionado Is Nothing Then
            m_Error = "Selecccione un elemento de la lista"
            Err.Raise 1000
        End If
        
    End If
    
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EliminarModificado p_IDExpedienteModificado:=m_MOdificadoSeleccionado.IDExpedienteModificado, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_ObjExpedienteDTOActivo.Expediente.Modificados = Nothing
    End With
    
    Set m_ObjExpedienteDTOActivo.ColModificados = m_ObjExpedienteDTOActivo.Expediente.Modificados
    RellenarListaModificados
    Me.NModificado = m_ObjExpedienteDTOActivo.Expediente.NModificadoCalculado
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            Me.AllowEdits = True
        End If
    End If
    Me.Parent.Controls("ComandoRegistrar").Visible = False
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
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
Private Sub m_Form_Editado()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set m_ObjExpedienteDTOActivo.Expediente.Modificados = Nothing
    Set m_ObjExpedienteDTOActivo.ColModificados = m_ObjExpedienteDTOActivo.Expediente.Modificados
    RellenarListaModificados
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_MOdificadoSeleccionado = Nothing
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_Form_Editado se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Public Function RellenarListaModificados(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_ExpModificado As ExpedienteModificado
    
    
    On Error GoTo errores
    Set lst = Me.ListaModificados
    lst.RowSource = "ID;Nº;Descripción;Firma;F.Fin"
    If m_ObjExpedienteDTOActivo.ColModificados Is Nothing Then
        Set m_ObjExpedienteDTOActivo.ColModificados = m_ObjExpedienteDTOActivo.Expediente.Modificados
    End If
    Set m_Col = m_ObjExpedienteDTOActivo.ColModificados
    
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_ExpModificado = m_Col(m_ID)
            With m_ExpModificado
                lst.AddItem .IDExpedienteModificado & ";" & .NModificado & ";" & Replace(.DESCRIPCION, ";", ":") & ";" & .FechaFirmaModificado & ";" & _
                 .FechaFinModificado
            End With
            
            Set m_ExpModificado = Nothing
        Next
        lst.Selected(0) = True
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaModificados ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarListas(Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    
    On Error GoTo errores
   
   
    
    'Modificados
        RellenarListaModificados p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListas ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function


Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    
    Dim ctl As Control
    On Error GoTo errores
    If m_ObjExpedienteDTOActivo.Expediente Is Nothing Then
        p_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
    End If
    For Each ctl In Me.Controls
        If Nz(ctl.Tag, "") = "EJECUTIVO" Then
            If AbiertoParaEditar = True Then
                If EsAdministrador = EnumSiNo.Sí Then
                    ctl.Enabled = True
                Else
                    ctl.Enabled = False
                End If
            Else
                ctl.Enabled = False
            End If
            
        End If
    Next
    RellenarListas
    Me.NModificado = m_ObjExpedienteDTOActivo.Expediente.NModificadoCalculado
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If

End Function
