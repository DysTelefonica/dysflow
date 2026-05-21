 Option Compare Database
Option Explicit
Public Event Alta()
Public Event Editado()
Private m_OrganoContratacionAlInicio As OrganoContratacion
Private m_Error As String

Private Sub cmdSalir_Click()
     On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ComandoAyuda_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
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

Private Sub ComandoRegistrar_Click()
    
    Dim m_HaHabidoCambios As Boolean
    Dim m_OrganoContratacionOp As OrganoContratacionOperaciones
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    m_Error = ""
    m_HaHabidoCambios = HaHabidoCambios(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_HaHabidoCambios = False Then
        m_Error = "No hay cambios que guardar"
        Err.Raise 1000
    End If
    If m_ObjOrganoContratacionActivo Is Nothing Then
        Set m_ObjOrganoContratacionActivo = New OrganoContratacion
    End If
    With m_ObjOrganoContratacionActivo
        .OrganoContratacion = Nz(Me.OrganoContratacion, "")
        .DESCRIPCION = Nz(Me.DESCRIPCION, "")
    End With
    
    Set m_OrganoContratacionOp = New OrganoContratacionOperaciones
    With m_OrganoContratacionOp
        Set .OrganoContratacion = m_ObjOrganoContratacionActivo
        .Registrar m_OrganoContratacionAlInicio, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_OrganoContratacionAlInicio Is Nothing Then
        RaiseEvent Alta
    Else
        RaiseEvent Editado
    End If
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    DoCmd.Close acForm, Me.Name, acSaveNo
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoRegistrar_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Public Function HaHabidoCambios(Optional ByRef p_Error As String) As Boolean
    
    On Error GoTo errores
    If m_OrganoContratacionAlInicio Is Nothing Then
        HaHabidoCambios = True
        Exit Function
    End If
    With m_OrganoContratacionAlInicio
        
        If .OrganoContratacion <> Nz(Me.OrganoContratacion, "") Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(Me.DESCRIPCION, "") <> .DESCRIPCION Then
            HaHabidoCambios = True
            Exit Function
        End If
        
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambios ha producido el error num " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    
    If m_ObjOrganoContratacionActivo Is Nothing Then
        Me.lblTitulo.Caption = "ALTA DE ÓRGANO DE CONTRATACIÓN"
        
        Exit Function
    End If
    Me.lblTitulo.Caption = "EDICIÓN DE ÓRGANO DE CONTRATACIÓN"
    
    Set m_OrganoContratacionAlInicio = constructor.getOrganoContratacion(p_IDOrganoContratacion:=m_ObjOrganoContratacionActivo.IDOrganoContratacion, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_OrganoContratacionAlInicio Is Nothing Then
        p_Error = "No se ha podido encontrar EL OrganoContratacion registrado"
        Err.Raise 1000
    End If
    
    With m_OrganoContratacionAlInicio
        If .OrganoContratacion <> "" Then
            Me.OrganoContratacion = .OrganoContratacion
        End If
        If .DESCRIPCION <> "" Then
            Me.DESCRIPCION = .DESCRIPCION
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
    
    Me.AllowEdits = False
    Ajustar Me
    
    Me.ComandoRegistrar.Enabled = False
    Me.Caption = m_TituloFormulario
    If EsAdministrador = EnumSiNo.Sí Then
        Me.ComandoRegistrar.Enabled = True
        Me.OrganoContratacion.Enabled = True
        Me.DESCRIPCION.Enabled = True
    Else
        Me.OrganoContratacion.Enabled = False
        Me.DESCRIPCION.Enabled = False
    End If
    
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub
