Option Compare Database
Option Explicit


Private m_NC As NCProyecto
Private m_Error As String


Private Sub ComandoEliminar_Click()
    Dim m_NCOp As NCProyectoOperaciones
    Dim m_HaHabidoCambios As Boolean
    
    On Error GoTo errores
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    pregunta = MsgBox("¿Desea borrar la nota asociada?", vbExclamation + vbYesNo + vbDefaultButton2, "Borrar nota")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_ObjNCProyectoActiva.Notas = ""
    
    
    Set m_NCOp = New NCProyectoOperaciones
    With m_NCOp
        Set .nc = m_ObjNCProyectoActiva
        .EliminarNota m_Error
    End With
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("Nota borrada correctamente", vbInformation, "Nota")
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Form_FormNCProyecto.m_NCAlInicio.Notas = ""
    EstablecerDatos
    
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

Private Sub Form_Load()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
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
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Public Function EstablecerDatos( _
                                    Optional ByRef p_Error As String _
                                    ) As String
   
    
    
    
    
    
    On Error GoTo errores
    Me.Notas = Null
    Me.ComandoEliminar.Enabled = False
    Me.ComandoGrabar.Enabled = False
    Me.AllowEdits = True
    If m_ObjNCProyectoActiva Is Nothing Then
        m_Error = "El formulario se ha abierto con parámetros insuficentes"
        Err.Raise 1000
    End If
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        Set m_NC = m_ObjNCProyectoActiva
    Else
        Set m_NC = m_ObjNCProyectoActiva.NCProyectoAsociada
    End If
    
   
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
            If EsTecnico <> EnumSino.Sí Then
                Me.ComandoGrabar.Enabled = True
                Me.AllowEdits = True
            Else
                Me.AllowEdits = False
            End If
        Else
            Me.AllowEdits = False
            Me.ComandoGrabar.Enabled = False
            
        End If
    
    
    End If
    With m_NC
        
        If .Notas <> "" Then
            Me.Notas = .Notas
            If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
                If EsTecnico <> EnumSino.Sí Then
                    Me.Notas.Enabled = True
                End If
                If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
                    If EsTecnico <> EnumSino.Sí Then
                        Me.ComandoEliminar.Enabled = True
                    End If
                End If
            End If
        End If
        
    End With
    
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Function HaHabidoCambios(Optional ByRef p_Error As String) As Boolean
    
    On Error GoTo errores
    If Form_FormNCProyecto.m_NCAlInicio Is Nothing Then
        HaHabidoCambios = True
        Exit Function
    End If
    With Form_FormNCProyecto.m_NCAlInicio
        
        If .Notas <> Nz(Me.Notas, "") Then
            HaHabidoCambios = True
            Exit Function
        End If
       
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambios ha devuelto el error: " & Err.Description
    End If
End Function

Private Sub ComandoGrabar_Click()
    Dim m_NCOp As NCProyectoOperaciones
    Dim m_HaHabidoCambios As Boolean
    
    On Error GoTo errores
    
   
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    m_HaHabidoCambios = HaHabidoCambios(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_HaHabidoCambios Then
        m_Error = "No hay cambios que guardar"
        Err.Raise 1000
    End If
    RellenarDatosObjeto m_Error
    If m_Error <> "" Then
        Err.Raise 100
    End If
    Set m_NCOp = New NCProyectoOperaciones
    With m_NCOp
        
        Set .nc = m_ObjNCProyectoActiva
        .RegistrarNota m_Error
        
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("Nota guardada correctamente", vbInformation, "Nota")
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Form_FormNCProyecto.m_NCAlInicio.Notas = Nz(Me.Notas, "")
    EstablecerDatos
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoGrabar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
Public Function RellenarDatosObjeto(Optional ByRef p_Error As String) As String
    
    Dim ctl As Control
    Dim m_Valor As String
    
    On Error GoTo errores
    If m_ObjNCProyectoActiva Is Nothing Then
        Set m_ObjNCProyectoActiva = New NCProyecto
    End If
    For Each ctl In Me.Controls
        If InStr(1, Nz(ctl.Tag, ""), "DATO") <> 0 Then
            m_ObjNCProyectoActiva.SetPropiedad ctl.Name, Nz(ctl.Value, ""), p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            
        End If
    Next
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarDatosObjeto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
