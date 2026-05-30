Option Compare Database
Option Explicit



Private m_Error As String

Public Function RellenarDatosObjeto(Optional ByRef p_Error As String) As String
    
    Dim ctl As Control
    Dim m_Valor As String
    
    On Error GoTo errores
    If m_ObjNCAuditoriaActiva Is Nothing Then
        Set m_ObjNCAuditoriaActiva = New NCAuditoria
    End If
    For Each ctl In Me.Controls
        If InStr(1, Nz(ctl.Tag, ""), "DATO") <> 0 Then
            m_ObjNCAuditoriaActiva.SetPropiedad ctl.Name, Nz(ctl.Value, ""), p_Error
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

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ComandoGrabar_Click()
    Dim m_NCOp As NCaUDITORIAOperaciones
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
    If Nz(Me.FechaPrevistaControlEficacia, "") = "" Then
        m_Error = "Se ha de indicar la fecha prevista del control de eficacia"
        Err.Raise 1000
    End If
    If Nz(Me.ControlEficacia, "") = "" Then
        m_Error = "Se ha de indicar el control de eficacia"
        Err.Raise 1000
    End If
    With m_ObjNCAuditoriaActiva
        .FechaPrevistaControlEficacia = Me.FechaPrevistaControlEficacia
        .ControlEficacia = Me.ControlEficacia
    End With
    m_HaHabidoCambios = HaHabidoCambios(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_HaHabidoCambios Then
        m_Error = "No hay cambios que guardar"
        Err.Raise 1000
    End If
    Form_FormNCAuditoriaGeneral.RellenarDatosObjeto m_Error
    If m_Error <> "" Then
        Err.Raise 100
    End If
    If m_ObjNCAuditoriaActiva.DatosGeneralesOK(EnumSino.Sí) = EnumSino.No Then
        m_Error = "Antes de rellenar este apartado ha de tener todos los datos obligatorios principales rellenos"
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCAuditoria") Then
        

        If Forms("FormNCAuditoria").Controls("FrmDetalle").SourceObject = "FormNCAuditoriaGeneral" Then
           
            Form_FormNCAuditoriaGeneral.ComandoGrabar_Click
           
        End If
    End If
    

    DoCmd.Close acForm, Me.Name, acSaveNo
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

Private Sub ControlEficacia_AfterUpdate()
    On Error Resume Next
    EstableceColorBordes
End Sub



Private Sub FechaPrevistaControlEficacia_AfterUpdate()
    On Error Resume Next
    EstableceColorBordes

End Sub

Private Sub EstableceColorBordes()
    On Error Resume Next
    
    Me.RequiereControlEficacia.BorderColor = COLOR_BORDE_CAMPO_RELLENO
    Me.FechaPrevistaControlEficacia.BorderColor = COLOR_BORDE_CAMPO_RELLENO
    Me.ControlEficacia.BorderColor = COLOR_BORDE_CAMPO_RELLENO
    
    Me.RequiereControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
    Me.FechaPrevistaControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
    Me.ControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
    
    With Me
        If Nz(.RequiereControlEficacia, "") = "" Then
            .RequiereControlEficacia.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            .RequiereControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        End If
        If Nz(.FechaPrevistaControlEficacia, "") = "" Then
            .FechaPrevistaControlEficacia.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            .FechaPrevistaControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        End If
        If Nz(.ControlEficacia, "") = "" Then
            .ControlEficacia.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            .ControlEficacia.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        End If
        
        
    End With
    
        
   
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
    If m_ObjNCAuditoriaActiva Is Nothing Then
        m_Error = "El formulario se ha abierto con parámetros insuficentes"
        Err.Raise 1000
    End If
    Me.Caption = Me.lblTitulo.Caption
    

    Me.ComandoGrabar.Enabled = True
    Me.RequiereControlEficacia = "Sí"
    EstableceColorBordes
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function HaHabidoCambios(Optional ByRef p_Error As String) As Boolean

    On Error GoTo errores
    
    If Form_FormNCAuditoria.m_NCAlInicio Is Nothing Then
        HaHabidoCambios = True
        Exit Function
    End If
    
    
    With Me
        If Nz(.FechaPrevistaControlEficacia, "") <> Form_FormNCAuditoria.m_NCAlInicio.FechaPrevistaControlEficacia Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.ControlEficacia, "") <> Form_FormNCAuditoria.m_NCAlInicio.ControlEficacia Then
            HaHabidoCambios = True
            Exit Function
        End If
       
        
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambios ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function




