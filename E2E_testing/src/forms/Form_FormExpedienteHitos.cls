Option Compare Database
Option Explicit
Private m_Error As String


Private Sub ComandoRegistrar_Click()
    Dim m_EstadoRegistro As String
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Hito As ExpedienteHito
    Dim m_FechaHito As String
    Dim m_Importe As String
    
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    m_Error = ""
    m_FechaHito = Nz(Me.FechaHito, "")
    If Not IsDate(m_FechaHito) Then
        m_Error = "La fecha del hito es obligatoria"
        Err.Raise 1000
    End If
    Set m_Hito = New ExpedienteHito
    With m_Hito
        .DESCRIPCION = Nz(Me.DESCRIPCION, "")
        .FechaHito = Nz(Me.FechaHito, "")
        .FechaGarantiaHito = Nz(Me.FechaGarantiaHito, "")
        .Importe = Nz(Me.Importe, "")
    End With
    m_Importe = Nz(Me.Importe, "")
    If IsNumeric(m_Importe) Then
        m_Importe = Format(m_Importe, "#,##0.00 €")
    End If
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        m_EstadoRegistro = .RegistrarHito(p_Hito:=m_Hito, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_EstadoRegistro = "1" Then
        
        Set m_ObjExpedienteDTOActivo.ColHitos = m_ObjExpedienteDTOActivo.Expediente.Hitos
        RellenarListaHitos
    End If
    
    
    Me.ListaHitos.Selected(Me.ListaHitos.ListCount - 1) = True
    Me.DESCRIPCION = Null
    Me.FechaHito = Null
    Me.FechaGarantiaHito = Null
    Me.Importe = Null
    
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
    Dim m_ExpHito As ExpedienteHito
    Dim m_FechaHito As String
    Dim i As Long
    
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    m_FechaHito = Nz(Me.ListaHitos.Column(0), "")
    If m_FechaHito = "" Then
         VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If EsAdministrador <> EnumSiNo.Sí Then
        m_Error = "Operacion no autorizada"
        Err.Raise 1000
    End If
   
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .EliminarHito p_FechaHito:=m_FechaHito, p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set m_ObjExpedienteDTOActivo.ColHitos = m_ObjExpedienteDTOActivo.Expediente.Hitos
    RellenarListaHitos
        
    
    
    
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
    Me.Parent.Controls("ComandoRegistrar").Visible = False
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            Me.AllowEdits = True
        End If
    End If
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


Public Function RellenarListaHitos(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    Dim m_ExpHito As ExpedienteHito
    Dim m_Importe As String
    
    On Error GoTo errores
    Set lst = Me.ListaHitos
    lst.RowSource = "Fecha;Descripción;Fecha G.;Importe"
    If m_ObjExpedienteDTOActivo.ColHitos Is Nothing Then
        Set m_ObjExpedienteDTOActivo.ColHitos = m_ObjExpedienteDTOActivo.Expediente.Hitos
    End If
    Set m_Col = m_ObjExpedienteDTOActivo.ColHitos
    
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_ExpHito = m_Col(m_ID)
            If IsNumeric(m_ExpHito.Importe) Then
                m_Importe = Format(m_ExpHito.Importe, "#,##0.00 €")
            End If
            lst.AddItem m_ExpHito.FechaHito & ";" & m_ExpHito.DESCRIPCION & ";" & m_ExpHito.FechaGarantiaHito & ";" & _
                m_Importe
            Set m_ExpHito = Nothing
        Next
        lst.Selected(0) = True
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaHitos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function RellenarListas(Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_ID As Variant
    
    On Error GoTo errores
    Me.ListaHitos.RowSource = ""
   
    
    'HITOS
        RellenarListaHitos p_Error
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
    Dim m_expediente As Expediente
    
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
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If

End Function
