 Option Compare Database
Option Explicit
Public Event Alta()
Public Event Editado()
Private m_CPVAlInicio As CPV
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
    Dim m_CPVOp As CPVOperaciones
    
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
    If m_ObjCPVActivo Is Nothing Then
        Set m_ObjCPVActivo = New CPV
    End If
    With m_ObjCPVActivo
        .CPV = Nz(Me.CPV, "")
        .DESCRIPCION = Nz(Me.DESCRIPCION, "")
    End With
    
    Set m_CPVOp = New CPVOperaciones
    With m_CPVOp
        Set .CPV = m_ObjCPVActivo
        .Registrar m_CPVAlInicio, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_CPVAlInicio Is Nothing Then
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
    If m_CPVAlInicio Is Nothing Then
        HaHabidoCambios = True
        Exit Function
    End If
    With m_CPVAlInicio
        
        If .CPV <> Nz(Me.CPV, "") Then
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
    
    If m_ObjCPVActivo Is Nothing Then
        Me.lblTitulo.Caption = "ALTA DE CPV"
        
        Exit Function
    End If
    Me.lblTitulo.Caption = "EDICIÓN DE CPV"
    
    Set m_CPVAlInicio = constructor.getCPV(p_IDCPV:=m_ObjCPVActivo.IDCPV, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_CPVAlInicio Is Nothing Then
        p_Error = "No se ha podido encontrar el CPV registrado"
        Err.Raise 1000
    End If
    Me.lblTitulo.Caption = "EDICIÓN DE CPV"
    Me.Caption = m_TituloFormulario
    With m_CPVAlInicio
        If .CPV <> "" Then
            Me.CPV = .CPV
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
    
    Ajustar Me
    Me.ComandoRegistrar.Enabled = False
    Me.AllowEdits = False
    Me.Caption = m_TituloFormulario
    If EsAdministrador = EnumSiNo.Sí Then
        Me.ComandoRegistrar.Enabled = True
        Me.AllowEdits = True
    End If
    
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
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub
