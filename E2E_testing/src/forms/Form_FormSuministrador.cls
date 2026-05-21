 Option Compare Database
Option Explicit
Public Event Alta(p_ID As String)
Public Event Editado()
Private m_SuministradorAlInicio As Suministrador
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
    Dim m_SuministradorOP As SuministradorOperaciones
    
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
    If m_ObjSuministradorActivo Is Nothing Then
        Set m_ObjSuministradorActivo = New Suministrador
    End If
    With m_ObjSuministradorActivo
        .Nombre = Nz(Me.Nombre, "")
        .Nemotecnico = Nz(Me.Nemotecnico, "")
        .CIF = Nz(Me.CIF, "")
        .Direccion = Nz(Me.Direccion, "")
        .Ciudad = Nz(Me.Ciudad, "")
        .CP = Nz(Me.CP, "")
        .TramitadoraHPS = Nz(Me.TramitadoraHPS, "")
    End With
    
    Set m_SuministradorOP = New SuministradorOperaciones
    With m_SuministradorOP
        Set .Suministrador = m_ObjSuministradorActivo
        .Registrar m_SuministradorAlInicio, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_SuministradorAlInicio Is Nothing Then
        RaiseEvent Alta(m_ObjSuministradorActivo.IDSuministrador)
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
    If m_SuministradorAlInicio Is Nothing Then
        HaHabidoCambios = True
        Exit Function
    End If
    With m_SuministradorAlInicio
        
        If .Nombre <> Nz(Me.Nombre, "") Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(Me.Nemotecnico, "") <> .Nemotecnico Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(Me.CIF, "") <> .CIF Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(Me.Direccion, "") <> .Direccion Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(Me.Ciudad, "") <> .Ciudad Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(Me.CP, "") <> .CP Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(Me.TramitadoraHPS, "") <> .TramitadoraHPS Then
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
    
    If m_ObjSuministradorActivo Is Nothing Then
        Me.lblTitulo.Caption = "ALTA DE SUMINISTRADOR"
        
        Exit Function
    End If
    Me.lblTitulo.Caption = "EDICIÓN DE SUMINISTRADOR"
   
    Set m_SuministradorAlInicio = constructor.getSuministrador(p_IDSuministrador:=m_ObjSuministradorActivo.IDSuministrador, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_SuministradorAlInicio Is Nothing Then
        p_Error = "No se ha podido encontrar el suministrador registrado"
        Err.Raise 1000
    End If
    
    With m_SuministradorAlInicio
        If .Nombre <> "" Then
            Me.Nombre = .Nombre
        End If
        If .Nemotecnico <> "" Then
            Me.Nemotecnico = .Nemotecnico
        End If
        If .CIF <> "" Then
            Me.CIF = .CIF
        End If
        If .Direccion <> "" Then
            Me.Direccion = .Direccion
        End If
        If .Ciudad <> "" Then
            Me.Ciudad = .Ciudad
        End If
        If .CP <> "" Then
            Me.CP = .CP
        End If
        If .TramitadoraHPS = "Sí" Or .TramitadoraHPS = "No" Then
            Me.TramitadoraHPS = .TramitadoraHPS
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
    Me.Caption = m_TituloFormulario
    If EsAdministrador = EnumSiNo.Sí Then
        Me.ComandoRegistrar.Enabled = True
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
